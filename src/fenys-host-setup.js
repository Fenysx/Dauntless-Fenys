'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {parseServerAddress}=require('./fenys-api');
const IMPORT="\n// Fenys portable character API (installed by Dauntless Fenys).\nimport {GetDb as FenysDb} from './db';\nimport {KeyRevocations as FenysRevocations} from './controllers/keyrotation';\nimport {GetOnlinePlayerActivity as FenysOnline} from './controllers/undauntedapi';\n";
const HOOK="\n// FENYS_ROAMING_V1: before request/body logs so codes and passports never enter them.\nconst fenysHost = require('../fenys/fenys-roaming-host.js').createHost(FenysDb().$client, {revoke:(id:string)=>FenysRevocations.emit('revoke',id),online:FenysOnline});\napp.use(fenysHost.middleware);\n";
const LISTEN="\n    // FENYS_PRIVATE_LISTENER_V1: loopback stays available to native game servers.\n    require('../fenys/fenys-private-listener.js').listenPrivate(app,PORT);\n";
function tailscaleAddresses(){return Object.values(os.networkInterfaces()).flat().filter(x=>{
 if(!x||x.family!=='IPv4'||!/^100\./.test(x.address))return false;
 try{return parseServerAddress(x.address).host===x.address;}catch{return false;}
}).map(x=>x.address);}
function setEnv(text,key,value){const pattern=new RegExp('^'+key+'=.*$','m');return pattern.test(text)?text.replace(pattern,key+'='+value):text.trimEnd()+'\n'+key+'='+value+'\n';}
function prepareFiles({appSource,serverSource,metagameEnv,deployEnv,address}){
 const sv=parseServerAddress(address);
 if(sv.local||!/^100\./.test(sv.host)||sv.port!==61000)throw Error('Use o IP Tailscale deste computador na porta 61000.');
 if(/^[ \t]*GATEWAY_SECRET=.+$/m.test(metagameEnv)||!/^AUTH_MODE=APIKEY\s*$/m.test(metagameEnv))throw Error('Use o Metagame privado com AUTH_MODE=APIKEY e sem gateway público.');
 if(!appSource.includes('// FENYS_ROAMING_V1')){
  const anchor='app.use(express.urlencoded({ extended: true }));';
  if(!appSource.includes(anchor)||!appSource.includes('export const app = express();'))throw Error('Versão do app.ts incompatível com a API do launcher.');
  appSource=IMPORT+appSource.replace(anchor,anchor+HOOK);
 }
 if(!serverSource.includes('// FENYS_PRIVATE_LISTENER_V1')){
  const anchor='logger.info(`Clear Skies, Slayer.`);';
  if(!serverSource.includes(anchor))throw Error('Versão do server.ts incompatível com a API do launcher.');
  serverSource=serverSource.replace(anchor,anchor+LISTEN);
 }
 for(const [key,value] of Object.entries({BIND_HOST:'127.0.0.1',FENYS_TAILSCALE_IP:sv.host,REGISTRATION_MODE:'INVITECODE',QOS_TARGET_URL:'http://'+sv.address+'/QoS'}))metagameEnv=setEnv(metagameEnv,key,value);
 deployEnv=setEnv(setEnv(deployEnv,'MY_IP',sv.host),'BIND_HOST','127.0.0.1');
 return {appSource,serverSource,metagameEnv,deployEnv};
}
function runBuild(base,onLog){return new Promise((resolve,reject)=>{
 const child=spawn(process.platform==='win32'?'node.exe':'node',[path.join(base,'node_modules','typescript','bin','tsc')],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';const log=d=>{output=(output+String(d)).slice(-6000);onLog?.(String(d).slice(0,400));};
 child.stdout.on('data',log);child.stderr.on('data',log);child.once('error',reject);
 const timer=setTimeout(()=>{child.kill();reject(Error('Compilação excedeu 2 minutos.'));},120000);
 child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('A compilação do Metagame falhou: '+output));});
});}
async function installHost(repoPath,address,onLog){
 const sv=parseServerAddress(address);
 if(!tailscaleAddresses().includes(sv.host))throw Error('Tailscale não está conectado com este IP no computador hospedeiro.');
 const base=path.join(repoPath,'UndauntedMetagame'),deploy=path.join(repoPath,'UndauntedDeployServer');
 const paths={appSource:path.join(base,'src','app.ts'),serverSource:path.join(base,'src','server.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(deploy,'.env')};
 const original={};for(const [key,file] of Object.entries(paths))original[key]=fs.readFileSync(file,'utf8');
 if(!fs.existsSync(path.join(base,'node_modules','typescript','bin','tsc')))throw Error('Instale as dependências do Metagame antes de ativar a API.');
 const prepared=prepareFiles({...original,address});
 const backup=path.join(base,'fenys-backups',String(Date.now()));fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const [key,file] of Object.entries(paths))fs.writeFileSync(path.join(backup,key+'.bak'),original[key],{mode:0o600});
 const moduleDir=path.join(base,'fenys');fs.mkdirSync(moduleDir,{recursive:true});
 for(const name of ['fenys-roaming-host.js','fenys-roaming-protocol.js','fenys-api.js','fenys-network.js','fenys-private-listener.js'])
  fs.copyFileSync(path.join(__dirname,name),path.join(moduleDir,name));
 // Keep credentials and portable snapshots out of the upstream repository.
 const ignore=path.join(base,'.gitignore');const prior=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';
 if(!prior.includes('fenys-backups/'))fs.writeFileSync(ignore,prior+'\nfenys-backups/\nfenys/\n');
 try{
  for(const [key,file] of Object.entries(paths))fs.writeFileSync(file,prepared[key],{mode:0o600});
  await runBuild(base,onLog);
 }catch(e){
  for(const [key,file] of Object.entries(paths))fs.writeFileSync(file,original[key],{mode:0o600});
  try{await runBuild(base,onLog);}catch{}
  throw e;
 }
 return {address:sv.address,backup};
}
module.exports={tailscaleAddresses,setEnv,prepareFiles,installHost};

