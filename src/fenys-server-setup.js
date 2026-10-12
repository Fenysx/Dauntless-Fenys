'use strict';
// Only exposes the existing authenticated Metagame and chat on this PC's VPN IP.
// Does not migrate accounts, change SQLite, or configure cloud storage.
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {parseServerAddress}=require('./fenys-api');
const {tailscaleAddresses,setEnv}=require('./fenys-host-setup');
const MARKER='// FENYS_PRIVATE_LISTENER_V1';
function prepareServer({serverSource,metagameEnv,deployEnv,address}){
 const sv=parseServerAddress(address);
 if(sv.local||! /^100\./.test(sv.host)||sv.port!==61000)throw Error('Selecione o IPv4 Tailscale deste PC na porta 61000.');
 if(/^FENYS_CLOUD_ROLE=(authority|host)\s*$/m.test(metagameEnv))throw Error('Este Metagame já foi ativado como rede global. Preserve o banco e desative essa configuração antes de configurar um servidor independente.');
 if(!/^AUTH_MODE=APIKEY\s*$/m.test(metagameEnv)||/^[ \t]*GATEWAY_SECRET=.+$/m.test(metagameEnv))throw Error('O servidor deve usar AUTH_MODE=APIKEY, sem gateway público.');
 if(!serverSource.includes(MARKER)){
  const anchor='logger.info(`Clear Skies, Slayer.`);';
  if(!serverSource.includes(anchor))throw Error('Metagame incompatível. Use a versão suportada do Dauntless Revived.');
  serverSource=serverSource.replace(anchor,anchor+'\n    '+MARKER+"\n    require('../fenys/fenys-private-listener.js').listenPrivate(app,PORT);\n");
 }
 for(const [key,value] of Object.entries({BIND_HOST:'127.0.0.1',FENYS_TAILSCALE_IP:sv.host,REGISTRATION_MODE:'INVITECODE',QOS_TARGET_URL:'http://'+sv.address+'/QoS'}))metagameEnv=setEnv(metagameEnv,key,value);
 deployEnv=setEnv(setEnv(deployEnv,'MY_IP',sv.host),'BIND_HOST','127.0.0.1');
 return {serverSource,metagameEnv,deployEnv};
}
function compile(base){return new Promise((resolve,reject)=>{
 const child=spawn(process.platform==='win32'?'node.exe':'node',[path.join(base,'node_modules/typescript/bin/tsc')],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{output=(output+String(d)).slice(-3000);});
 const timer=setTimeout(()=>{child.kill();reject(Error('A compilação excedeu dois minutos.'));},120000);
 child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Falha ao compilar Metagame: '+output));});
});}
async function installServer(repo,address){
 if(!tailscaleAddresses().includes(parseServerAddress(address).host))throw Error('Conecte o Tailscale e selecione o IP deste computador.');
 const base=path.join(repo,'UndauntedMetagame');
 const files={serverSource:path.join(base,'src/server.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(repo,'UndauntedDeployServer/.env')};
 const original={};for(const [key,file] of Object.entries(files))original[key]=fs.readFileSync(file,'utf8');
 const prepared=prepareServer({...original,address});
 if(!fs.existsSync(path.join(base,'node_modules/typescript/bin/tsc')))throw Error('Instale as dependências do Metagame antes de configurar.');
 const backup=path.join(base,'fenys-backups','conexao-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
 for(const [key,value] of Object.entries(original))fs.writeFileSync(path.join(backup,key+'.bak'),value,{mode:0o600});
 const modules=path.join(base,'fenys');fs.mkdirSync(modules,{recursive:true});
 const oldModules={};
 for(const name of ['fenys-api.js','fenys-private-listener.js']){
  const target=path.join(modules,name);oldModules[name]=fs.existsSync(target)?fs.readFileSync(target):null;
  fs.copyFileSync(path.join(__dirname,name),target);
 }
 try{for(const [key,file] of Object.entries(files))fs.writeFileSync(file,prepared[key],{mode:0o600});await compile(base);}
 catch(e){
  for(const [key,file] of Object.entries(files))fs.writeFileSync(file,original[key],{mode:0o600});
  for(const [name,value] of Object.entries(oldModules)){const target=path.join(modules,name);if(value)fs.writeFileSync(target,value);else fs.rmSync(target,{force:true});}
  try{await compile(base);}catch{}throw e;
 }
 return {address:parseServerAddress(address).address};
}
module.exports={prepareServer,installServer,tailscaleAddresses};
