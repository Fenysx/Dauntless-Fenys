'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {prepareFiles,setEnv,tailscaleAddresses}=require('./fenys-host-setup');
const {parseServerAddress}=require('./fenys-api');
const {identity,cloud,signed,availability}=require('./fenys-google-cloud');
const {request:enroll,validateAuthorization}=require('./fenys-supabase');
const HOOK="\n// LAUNCHER_GOOGLE_V3: identity is verified by Supabase before accessing cloud progress.\nif(process.env.FENYS_GOOGLE_MODE==='1'){\n app.use(express.json({limit:'24mb'}));\n const googleHost=require('../fenys/fenys-google-host.js').start(FenysDb().$client,{online:FenysOnline,revoke:(id:string)=>FenysRevocations.emit('revoke',id),validateToken:FenysToken});\n app.use(googleHost.middleware);\n}\n";
function prepareGoogleFiles(input){
 const p=prepareFiles(input);
 if(!p.appSource.includes("as FenysToken}"))p.appSource="import {ValidateMetagameJWTAndGetPayload as FenysToken} from './controllers/auth';\n"+p.appSource;
 if(!p.appSource.includes('// LAUNCHER_GOOGLE_V3')){
  // All aliases are imported by prepareFiles; install before legacy global routing and request logs.
  p.appSource=p.appSource.replace('export const app = express();','export const app = express();'+HOOK);
 }
 for(const [k,v] of Object.entries({FENYS_GOOGLE_MODE:'1',FENYS_CLOUD_ROLE:'',FENYS_CLOUD_CHAT_ADDRESS:'',DEPLOYSERVER_URL:'127.0.0.1:61001',CHAT:'1',CHAT_PRESENCE:'on',PROGRESSION_MODE:'real',ESCALATION_MODE:'real'}))p.metagameEnv=setEnv(p.metagameEnv,k,v);
 return p;
}
function run(base,args,input){return new Promise((resolve,reject)=>{const c=spawn(process.platform==='win32'?'node.exe':'node',args,{cwd:base,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';for(const s of [c.stdout,c.stderr])s.on('data',d=>output=(output+String(d)).slice(-6000));const timer=setTimeout(()=>{c.kill();reject(Error('Configuração excedeu dois minutos.'));},120000);c.once('error',e=>{clearTimeout(timer);reject(e);});c.once('close',n=>{clearTimeout(timer);n===0?resolve(output):reject(Error('Não foi possível configurar o servidor Google: '+output));});c.stdin.end(input||'');});}
async function installGoogle(repo,{address,hostCode,authorizationFile,adminKey}){
 await availability();const sv=parseServerAddress(address);if(!tailscaleAddresses().includes(sv.host))throw Error('Selecione o IP Tailscale deste computador.');
 const base=path.join(repo,'UndauntedMetagame'),moduleDir=path.join(base,'fenys'),file=path.join(moduleDir,'google-host.json');fs.mkdirSync(moduleDir,{recursive:true,mode:0o700});
 const check="const fs=require('fs'),D=require('better-sqlite3'),c=require('crypto'),d=new D(process.env.DB_FILENAME,{fileMustExist:true}),k=JSON.parse(fs.readFileSync(0,'utf8')).key;if(!d.prepare('SELECT u.isAdmin FROM users u JOIN userapikeys a ON u.userId=a.userId WHERE a.keyHash=?').get(c.createHash('sha256').update(k).digest('hex'))?.isAdmin)throw Error('Selecione a chave administradora original deste servidor.');if(d.prepare(\"SELECT name FROM sqlite_master WHERE name='fenys_passports'\").get()&&d.prepare('SELECT userId FROM fenys_passports WHERE active=0 OR home=0').get())throw Error('Retorne os personagens portateis antes da ativacao Google.');d.close();";
 await run(base,['--env-file=.env','-e',check],JSON.stringify({key:adminKey}));
 let config,existingConfig=false;try{config=JSON.parse(fs.readFileSync(file));existingConfig=true;}catch(e){if(e.code!=='ENOENT')throw e;config={...identity(),realm:require('crypto').randomUUID()};}
 config.address=sv.address;
 if(hostCode){if(!/^DLUH3\.[\w-]+$/.test(hostCode)||hostCode.length>2048)throw Error('Use a autorização de host Google gerada por um servidor autorizado.');const grant=JSON.parse(Buffer.from(hostCode.slice(6),'base64url'));if(!grant.secret||Date.parse(grant.expiresAt)<=Date.now())throw Error('Autorização de host expirada.');config.realm=grant.realm;config.secret=grant.secret;}
 else if(!existingConfig){
  const prior=path.join(moduleDir,'supabase-authorization.json'),source=fs.existsSync(prior)?prior:authorizationFile;if(!source)throw Error('Selecione a autorização Supabase do dono ou uma autorização de host Google.');
  const auth=validateAuthorization(JSON.parse(fs.readFileSync(source)));if(auth.pair&&auth.realm){config={...auth.pair,realm:auth.realm,address:sv.address};}else{Object.assign(auth,{pair:{publicKey:config.publicKey,privateKey:config.privateKey},realm:config.realm});}
  if(!auth.enrolled){await enroll(auth,'enroll',{secret:auth.secret});auth.enrolled=true;delete auth.secret;if(!fs.existsSync(prior))fs.writeFileSync(prior,JSON.stringify(auth),{mode:0o600});}
 }
 await cloud('host-register',{envelope:signed(config,'host-register',{address:config.address,realm:config.realm,secret:config.secret})});fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 const files={appSource:path.join(base,'src/app.ts'),serverSource:path.join(base,'src/server.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(repo,'UndauntedDeployServer/.env')};const original={};for(const [k,f] of Object.entries(files))original[k]=fs.readFileSync(f,'utf8');
 const p=prepareGoogleFiles({...original,address:sv.address});const dir=path.join(base,'fenys-backups','google-'+Date.now());fs.mkdirSync(dir,{recursive:true,mode:0o700});for(const [k,v] of Object.entries(original))fs.writeFileSync(path.join(dir,k+'.bak'),v,{mode:0o600});
 for(const name of fs.readdirSync(__dirname).filter(n=>/^fenys-.*\.js$/.test(n)))fs.copyFileSync(path.join(__dirname,name),path.join(moduleDir,name));
 const ignore=path.join(base,'.gitignore'),old=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';if(!old.includes('fenys-backups/'))fs.writeFileSync(ignore,old+'\nfenys/\nfenys-backups/\n');
 try{for(const [k,f] of Object.entries(files))fs.writeFileSync(f,p[k],{mode:0o600});await run(base,[path.join(base,'node_modules/typescript/bin/tsc')]);}catch(e){for(const [k,f] of Object.entries(files))fs.writeFileSync(f,original[k],{mode:0o600});try{await run(base,[path.join(base,'node_modules/typescript/bin/tsc')]);}catch{}throw e;}
 return {address:sv.address,mode:'google',backup:dir};
}
module.exports={installGoogle,prepareGoogleFiles};
