'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {prepareFiles,setEnv,tailscaleAddresses}=require('./fenys-host-setup');
const {parseEndpoint:parseServerAddress,publicIP}=require('./fenys-network');
const os=require('node:os'),tls=require('node:tls'),crypto=require('node:crypto');
function validateNetwork({address,networkMode='tailscale',gameAddress,certFile,keyFile},interfaces=Object.values(os.networkInterfaces()).flat().filter(Boolean).map(x=>x.address)){
 const sv=parseServerAddress(address);
 if(!['tailscale','lan','public'].includes(networkMode))throw Error('Modo de rede inválido.');
 if(networkMode==='public'){if(!sv.secure||[61000,61001,61099,43967].includes(sv.port)||!publicIP(gameAddress))throw Error('Informe o endpoint HTTPS e o IPv4 público das partidas; use uma porta HTTPS separada dos serviços locais.');
 if(!certFile||!keyFile)throw Error('Selecione o certificado HTTPS e sua chave privada.');
 const cert=fs.readFileSync(certFile),key=fs.readFileSync(keyFile);tls.createSecureContext({cert,key});const x=new crypto.X509Certificate(cert);if(!(require('node:net').isIP(sv.host)?x.checkIP(sv.host):x.checkHost(sv.host))||Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<=Date.now())throw Error('Certificado fora da validade ou incompatível com o endereço HTTPS.');return {sv,cert,key};}
 if(networkMode==='lan'&&(!sv.lan||sv.port!==61000||!interfaces.includes(sv.host)))throw Error('Na rede local, selecione o IPv4 deste computador (por exemplo 192.168.1.20:61000). Use uma sugestão do launcher ou confira ipconfig; não informe 127.0.0.1.');
 if(networkMode==='tailscale'&&(sv.port!==61000||!interfaces.includes(sv.host)||!tailscaleAddresses().includes(sv.host)))throw Error('O endereço Tailscale informado não está disponível na rede deste computador.');return {sv};
}
const {identity,cloud,signed,availability}=require('./fenys-google-cloud');
const {request:enroll,validateAuthorization}=require('./fenys-supabase');
const HOOK="\n// LAUNCHER_GOOGLE_V3: identity is verified by Supabase before accessing cloud progress.\nif(process.env.FENYS_GOOGLE_MODE==='1'){\n app.use(express.json({limit:'24mb'}));\n const googleHost=require('../fenys/fenys-google-host.js').start(FenysDb().$client,{online:FenysOnline,revoke:(id:string)=>FenysRevocations.emit('revoke',id),validateToken:FenysToken});\n app.use(googleHost.middleware);\n}\n";
function prepareGoogleFiles(input){
 const mode=input.networkMode||'tailscale',sv=parseServerAddress(input.address);
 if(mode==='public'&&(!sv.secure||!publicIP(input.gameAddress)))throw Error('Endpoint HTTPS e IPv4 público necessários.');
 if(mode==='lan'&&(!sv.lan||sv.port!==61000))throw Error('Endereço LAN inválido.');
 const p=prepareFiles({...input,address:mode==='tailscale'?input.address:'100.64.0.1:61000'});
 const network={FENYS_TAILSCALE_IP:mode==='tailscale'?sv.host:'',FENYS_LAN_IP:mode==='lan'?sv.host:'',FENYS_PUBLIC_MODE:mode==='public'?'1':'',FENYS_PUBLIC_PORT:mode==='public'?String(sv.port):'',FENYS_PUBLIC_CERT:'fenys/public-cert.pem',FENYS_PUBLIC_KEY:'fenys/public-key.pem',QOS_TARGET_URL:mode==='public'?'http://127.0.0.1:61000/QoS':'http://'+sv.address+'/QoS'};
 for(const [k,v] of Object.entries(network))p.metagameEnv=setEnv(p.metagameEnv,k,v);
 p.deployEnv=setEnv(p.deployEnv,'MY_IP',mode==='public'?input.gameAddress:sv.host);
 if(!p.appSource.includes("as FenysToken}"))p.appSource="import {ValidateMetagameJWTAndGetPayload as FenysToken} from './controllers/auth';\n"+p.appSource;
 if(!p.appSource.includes('// LAUNCHER_GOOGLE_V3')){
  // All aliases are imported by prepareFiles; install before legacy global routing and request logs.
  p.appSource=p.appSource.replace('export const app = express();','export const app = express();'+HOOK);
 }
 if(!p.appSource.includes('// LAUNCHER_GOOGLE_V3')||!p.appSource.includes('app.use(googleHost.middleware)'))
  throw Error('O arquivo app.ts deste servidor não é compatível com a integração Google. Nenhum save foi alterado. Confira a versão do Metagame e atualize o projeto antes de tentar de novo.');
 for(const [k,v] of Object.entries({FENYS_GOOGLE_MODE:'1',FENYS_CLOUD_ROLE:'',FENYS_CLOUD_CHAT_ADDRESS:'',DEPLOYSERVER_URL:'127.0.0.1:61001',CHAT:'1',CHAT_PRESENCE:'on',PROGRESSION_MODE:'real',ESCALATION_MODE:'real'}))p.metagameEnv=setEnv(p.metagameEnv,k,v);
 return p;
}
function run(base,args,input){return new Promise((resolve,reject)=>{const c=spawn(process.platform==='win32'?'node.exe':'node',args,{cwd:base,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';for(const s of [c.stdout,c.stderr])s.on('data',d=>output=(output+String(d)).slice(-6000));const timer=setTimeout(()=>{c.kill();reject(Error('Configuração excedeu dois minutos.'));},120000);c.once('error',e=>{clearTimeout(timer);reject(e);});c.once('close',n=>{clearTimeout(timer);n===0?resolve(output):reject(Error('Não foi possível configurar o servidor Google: '+output));});c.stdin.end(input||'');});}
async function installGoogle(repo,{address,hostCode,authorizationFile,adminKey,networkMode='tailscale',gameAddress,certFile,keyFile}){
 const {sv,cert,key}=validateNetwork({address,networkMode,gameAddress,certFile,keyFile});await availability();
 const base=path.join(repo,'UndauntedMetagame'),moduleDir=path.join(base,'fenys'),file=path.join(moduleDir,'google-host.json');fs.mkdirSync(moduleDir,{recursive:true,mode:0o700});
 const files={appSource:path.join(base,'src/app.ts'),serverSource:path.join(base,'src/server.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(repo,'UndauntedDeployServer/.env')};const original={};for(const [k,f] of Object.entries(files))original[k]=fs.readFileSync(f,'utf8');
 const p=prepareGoogleFiles({...original,address:sv.address,networkMode,gameAddress});
 const check="const fs=require('fs'),D=require('better-sqlite3'),c=require('crypto'),d=new D(process.env.DB_FILENAME,{fileMustExist:true}),k=JSON.parse(fs.readFileSync(0,'utf8')).key;if(!d.prepare('SELECT u.isAdmin FROM users u JOIN userapikeys a ON u.userId=a.userId WHERE a.keyHash=?').get(c.createHash('sha256').update(k).digest('hex'))?.isAdmin)throw Error('Selecione a chave administradora original deste servidor.');if(d.prepare(\"SELECT name FROM sqlite_master WHERE name='fenys_passports'\").get()&&d.prepare('SELECT userId FROM fenys_passports WHERE active=0 OR home=0').get())throw Error('Retorne os personagens portateis antes da ativacao Google.');d.close();";
 await run(base,['--env-file=.env','-e',check],JSON.stringify({key:adminKey}));
 let config,previousConfig=null,existingConfig=false;try{previousConfig=fs.readFileSync(file);config=JSON.parse(previousConfig);existingConfig=true;}catch(e){if(e.code!=='ENOENT')throw e;config={...identity(),realm:require('crypto').randomUUID()};}
 config.address=sv.address;
 if(hostCode){if(!/^DLUH3\.[\w-]+$/.test(hostCode)||hostCode.length>2048)throw Error('Use a autorização de host Google gerada por um servidor autorizado.');const grant=JSON.parse(Buffer.from(hostCode.slice(6),'base64url'));if(!grant.secret||Date.parse(grant.expiresAt)<=Date.now())throw Error('Autorização de host expirada.');config.realm=grant.realm;config.secret=grant.secret;}
 else if(!existingConfig){
  const prior=path.join(moduleDir,'supabase-authorization.json'),source=fs.existsSync(prior)?prior:authorizationFile;if(!source)throw Error('Selecione a autorização Supabase do dono ou uma autorização de host Google.');
  const auth=validateAuthorization(JSON.parse(fs.readFileSync(source)));if(auth.pair&&auth.realm){config={...auth.pair,realm:auth.realm,address:sv.address};}else{Object.assign(auth,{pair:{publicKey:config.publicKey,privateKey:config.privateKey},realm:config.realm});}
  if(!auth.enrolled){await enroll(auth,'enroll',{secret:auth.secret});auth.enrolled=true;delete auth.secret;if(!fs.existsSync(prior))fs.writeFileSync(prior,JSON.stringify(auth),{mode:0o600});}
 }
 // Compile first: an invalid overlay must never change the host advertised in the cloud.
 const dir=path.join(base,'fenys-backups','google-'+Date.now());fs.mkdirSync(dir,{recursive:true,mode:0o700});for(const [k,v] of Object.entries(original))fs.writeFileSync(path.join(dir,k+'.bak'),v,{mode:0o600});
 if(previousConfig)fs.writeFileSync(path.join(dir,'google-host.json.bak'),previousConfig,{mode:0o600});
 const modules=fs.readdirSync(__dirname).filter(n=>/^fenys-.*\.js$/.test(n)).map(n=>[path.join(moduleDir,n),fs.readFileSync(path.join(__dirname,n))]);
 const ignore=path.join(base,'.gitignore'),old=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';if(!old.includes('fenys-backups/'))fs.writeFileSync(ignore,old+'\nfenys/\nfenys-backups/\n');
 const tlsFiles=cert?[[path.join(moduleDir,'public-cert.pem'),cert],[path.join(moduleDir,'public-key.pem'),key]]:[];
 const changed=[...modules,...tlsFiles],before=changed.map(([f])=>fs.existsSync(f)?fs.readFileSync(f):null);let registering=false;
 const register=c=>cloud('host-register',{envelope:signed(c,'host-register',{address:c.address,realm:c.realm,secret:c.secret})});
 try{
  for(const [f,b] of changed)fs.writeFileSync(f,b,{mode:0o600});for(const [k,f] of Object.entries(files))fs.writeFileSync(f,p[k],{mode:0o600});
  await run(base,[path.join(base,'node_modules/typescript/bin/tsc')]);
  // Persist the identity before a one-use authorization can be consumed, so retries reuse it.
  fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});registering=true;await register(config);
 }catch(e){
  changed.forEach(([f],i)=>before[i]!==null?fs.writeFileSync(f,before[i],{mode:0o600}):fs.rmSync(f,{force:true}));
  for(const [k,f] of Object.entries(files))fs.writeFileSync(f,original[k],{mode:0o600});
  if(previousConfig){fs.writeFileSync(file,previousConfig,{mode:0o600});if(registering)try{await register(JSON.parse(previousConfig));}catch{e.message+=' O endereço anterior será confirmado na nuvem quando o servidor reconectar.';}}
  try{await run(base,[path.join(base,'node_modules/typescript/bin/tsc')]);}catch{e.message+=' Recompile o Metagame antes de reiniciar os serviços.';}
  throw e;
 }
 return {address:sv.address,mode:'google',networkMode,backup:dir};
}
module.exports={installGoogle,prepareGoogleFiles,validateNetwork};

