'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {prepareFiles,setEnv,tailscaleAddresses}=require('./fenys-host-setup');
const {parseServerAddress}=require('./fenys-api');
const {call,decodeCode,identity,sign}=require('./fenys-cloud-protocol');
const {verifyRemote}=require('./fenys-cloud-backup');
const CLOUD_IMPORT="\nimport {ValidateMetagameJWTAndGetPayload as FenysToken} from './controllers/auth';\n";
const CLOUD_HOOK="\n// FENYS_CLOUD_V2: gateways are handled before local authentication/moderation.\nif(process.env.FENYS_CLOUD_ROLE){\n app.use(express.json({limit:'50mb'}));\n app.use(express.urlencoded({extended:true}));\n const fenysCloud=require('../fenys/fenys-cloud-runtime.js').start(FenysDb().$client,{online:FenysOnline,validateToken:FenysToken,revoke:(id:string)=>FenysRevocations.emit('revoke',id)});\n app.use(fenysCloud.middleware);\n}\n";
function patchMatchmaking(source){
 if(source.includes('// FENYS_MATCHMAKING_V2'))return source;
 if(!source.includes('const QueueKey = RegionQueueKey(HuntId, Region);')||!source.includes('GameMode === \'CITY\' ? [PlayerId] : undefined'))throw Error('Matchmaking incompatível com a rede global.');
 source="// FENYS_MATCHMAKING_V2\nconst FenysRouting=require('../../fenys/fenys-cloud-runtime.js');\nfunction FenysQueueKey(hunt:string,region:HuntRegion,host?:string){return RegionQueueKey(hunt,region)+(host?'@'+host:'');}\n"+source;
 source=source.replace('type MatchmakingQueueData = {','type MatchmakingQueueData = {\n    FenysHostKey?: string,');
 source=source.replaceAll('RegionQueueKey(queue.HuntId, queue.Region)','FenysQueueKey(queue.HuntId, queue.Region, queue.FenysHostKey)');
 source=source.replaceAll('RegionQueueKey(HuntId, MatchmakingQueue.Region)','FenysQueueKey(HuntId, MatchmakingQueue.Region, MatchmakingQueue.FenysHostKey)');
 source=source.replaceAll('RegionQueueKey(Queue.HuntId, Queue.Region)','FenysQueueKey(Queue.HuntId, Queue.Region, Queue.FenysHostKey)');
 source=source.replaceAll('RegionQueueKey(MatchmakingQueue.HuntId, MatchmakingQueue.Region)','FenysQueueKey(MatchmakingQueue.HuntId, MatchmakingQueue.Region, MatchmakingQueue.FenysHostKey)');
 source=source.replace('const QueueKey = RegionQueueKey(HuntId, Region);','const QueueKey = FenysQueueKey(HuntId, Region, FenysRouting.hostForPlayer(PlayerId));');
 source=source.replace('Queue = {\n            Region,','Queue = {\n            FenysHostKey:FenysRouting.hostForPlayer(PlayerId),\n            Region,');
 source=source.replace('                    ExpectedPlayers,','                    ExpectedPlayers,\n                    ...(process.env.FENYS_CLOUD_ROLE === \'authority\' ? {FenysHostId:FenysRouting.hostForPlayers(ExpectedPlayers)} : {}),');
 source=source.replace("['ISLAND','CITY'].includes(GameMode) ? Active : undefined",'Active');
 source=source.replace("GameMode === 'CITY' ? [PlayerId] : undefined",'[PlayerId]');
 return source;
}
function prepareCloudFiles(input){
 const p=prepareFiles(input),sv=parseServerAddress(input.address);
 if(!['authority','host'].includes(input.role))throw Error('Selecione serviço central ou host de jogo.');
 if(!p.appSource.includes('// FENYS_CLOUD_V2'))p.appSource=CLOUD_IMPORT+p.appSource.replace('export const app = express();','export const app = express();'+CLOUD_HOOK);
 p.matchmakingSource=patchMatchmaking(input.matchmakingSource);
 p.metagameEnv=setEnv(p.metagameEnv,'FENYS_CLOUD_ROLE',input.role);
 p.metagameEnv=setEnv(p.metagameEnv,'FENYS_CLOUD_PUBLIC_ADDRESS',sv.address);
 if(input.role==='authority'){
  p.metagameEnv=setEnv(p.metagameEnv,'CHAT','1');
  p.metagameEnv=setEnv(p.metagameEnv,'CHAT_PRESENCE','on');
  p.metagameEnv=setEnv(p.metagameEnv,'PROGRESSION_MODE','real');
  p.metagameEnv=setEnv(p.metagameEnv,'ESCALATION_MODE','real');
  p.metagameEnv=setEnv(p.metagameEnv,'DEPLOYSERVER_URL','127.0.0.1:61004');
  p.metagameEnv=setEnv(p.metagameEnv,'FENYS_CLOUD_DRIVE_REMOTE','dauntless-crypt:automaticos/globais');
  p.metagameEnv=setEnv(p.metagameEnv,'FENYS_RCLONE_BINARY',input.rcloneBinary||'rclone');
 }else{
  p.metagameEnv=setEnv(p.metagameEnv,'CHAT','0');
  p.metagameEnv=setEnv(p.metagameEnv,'FENYS_CLOUD_CHAT_ADDRESS',parseServerAddress(input.authority).host+':61099');
 }
 return p;
}
function command(base,args){return new Promise((resolve,reject)=>{
 const child=spawn(process.platform==='win32'?'node.exe':'node',args,{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{output=(output+String(d)).slice(-6000);});
 const timer=setTimeout(()=>{child.kill();reject(Error('Compilação excedeu dois minutos.'));},120000);
 child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('Configuração global falhou: '+output));});
});}
async function installCloud(repo,{address,role,hostCode,rcloneBinary='rclone'}){
 const sv=parseServerAddress(address);if(!tailscaleAddresses().includes(sv.host))throw Error('Selecione o IP Tailscale deste computador.');
 const base=path.join(repo,'UndauntedMetagame'),deploy=path.join(repo,'UndauntedDeployServer');
 const files={appSource:path.join(base,'src/app.ts'),serverSource:path.join(base,'src/server.ts'),matchmakingSource:path.join(base,'src/controllers/matchmaking.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(deploy,'.env')};
 const original={};for(const [key,file] of Object.entries(files))original[key]=fs.readFileSync(file,'utf8');
 if(role==='authority'){
  await verifyRemote(rcloneBinary);
  const check="const D=require('better-sqlite3');const db=new D(process.env.DB_FILENAME,{fileMustExist:true});if(db.prepare(\"SELECT name FROM sqlite_master WHERE name='fenys_passports'\").get()&&db.prepare('SELECT userId FROM fenys_passports WHERE active=0 OR home=0').get())throw Error('Retorne todos os personagens portateis aos servidores originais antes da ativacao global.');db.close();";
  await command(base,['--env-file=.env','-e',check]);
  // Only list remote names: never read or display the rclone OAuth/config secrets.
  const remotes=await new Promise((resolve,reject)=>{const child=spawn(rcloneBinary,['listremotes'],{windowsHide:true,stdio:['ignore','pipe','ignore']});let text='';child.stdout.on('data',d=>{text+=String(d);});child.once('error',reject);child.once('close',code=>code===0?resolve(text):reject(Error('rclone não respondeu. Informe o caminho instalado no PC central.')));});
  if(!String(remotes).split(/\r?\n/).includes('dauntless-crypt:'))throw Error('O remoto criptografado dauntless-crypt não está autorizado neste usuário do sistema.');
 }
 let hostConfig=null,authority=null;
 const moduleDir=path.join(base,'fenys');fs.mkdirSync(moduleDir,{recursive:true,mode:0o700});
 if(role==='host'){
  const invite=decodeCode(hostCode);if(invite.kind!=='host')throw Error('Use o código de ativação gerado pelo administrador central.');authority=invite.authority;
  const pendingFile=path.join(moduleDir,'cloud-enrollment.json');
  let pair;try{pair=JSON.parse(fs.readFileSync(pendingFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;pair=identity();fs.writeFileSync(pendingFile,JSON.stringify(pair),{mode:0o600});}
  const result=await call(authority,'host-register',sign(pair,{operation:'host-register',time:Date.now(),requestId:crypto.randomUUID(),realm:invite.realm,secret:invite.secret,address:sv.address,name:'Host '+sv.host}));
  hostConfig={...pair,...result,address:sv.address};
 }
 const prepared=prepareCloudFiles({...original,address:sv.address,role,authority,rcloneBinary});
 const backup=path.join(base,'fenys-backups','global-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const [key,file] of Object.entries(files))fs.writeFileSync(path.join(backup,key+'.bak'),original[key],{mode:0o600});
 for(const name of fs.readdirSync(__dirname).filter(x=>/^fenys-.*\.js$/.test(x)))fs.copyFileSync(path.join(__dirname,name),path.join(moduleDir,name));
 if(hostConfig)fs.writeFileSync(path.join(moduleDir,'cloud-host.json'),JSON.stringify(hostConfig),{mode:0o600});
 if(hostConfig)await command(base,['--env-file=.env',path.join(moduleDir,'fenys-cloud-migration.js')]);
 const ignore=path.join(base,'.gitignore'),previous=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';
 if(!previous.includes('fenys-cloud-backups/'))fs.writeFileSync(ignore,previous+'\nfenys/\nfenys-backups/\nfenys-cloud-backups/\n');
 try{for(const [key,file] of Object.entries(files))fs.writeFileSync(file,prepared[key],{mode:0o600});await command(base,[path.join(base,'node_modules/typescript/bin/tsc')]);}
 catch(e){for(const [key,file] of Object.entries(files))fs.writeFileSync(file,original[key],{mode:0o600});try{await command(base,[path.join(base,'node_modules/typescript/bin/tsc')]);}catch{}throw e;}
 return {role,authority:role==='authority'?sv.address:authority,address:sv.address,backup};
}
module.exports={prepareCloudFiles,patchMatchmaking,installCloud};
