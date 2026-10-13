'use strict';
// Dedicated headless host runner for a community Windows VPS.
// Uses the configured server .env files; never changes saves, keys or network settings.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const SERVICES=[['Metagame','UndauntedMetagame'],['DeployServer','UndauntedDeployServer']];
function spec(repo){
 const root=path.resolve(repo);
 return SERVICES.map(([name,folder])=>{
  const dir=path.join(root,folder),entry=path.join(dir,'dist','server.js'),env=path.join(dir,'.env');
  if(!fs.existsSync(entry)||!fs.existsSync(env))throw Error(name+': configure e compile dist/server.js e .env antes de iniciar o host 24h.');
  return {name,dir,entry,env};
 });
}
function start(repo,{spawnImpl=spawn,logger=console}={}){
 const services=spec(repo),active=new Map();let stopping=false;
 const launch=(svc,attempt=0)=>{
  if(stopping)return;
  const child=spawnImpl(process.execPath,['--env-file=.env','dist/server.js'],{cwd:svc.dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
  active.set(svc.name,child);
  const write=(stream,label)=>stream?.on('data',part=>{
   for(const line of String(part).split(/\r?\n/))if(line.trim())logger.log('['+svc.name+':'+label+'] '+line.slice(0,500));
  });
  write(child.stdout,'out');write(child.stderr,'err');
  child.on('error',e=>logger.error('['+svc.name+'] '+e.message));
  child.on('exit',(code,signal)=>{
   if(active.get(svc.name)===child)active.delete(svc.name);
   if(stopping)return;
   const delay=Math.min(30000,5000*Math.pow(2,Math.min(attempt,3)));
   logger.error('['+svc.name+'] encerrou ('+String(code??signal)+'). Reiniciando em '+delay/1000+' s.');
   const timer=setTimeout(()=>launch(svc,attempt+1),delay);timers.add(timer);
  });
 };
 const timers=new Set();
 for(const svc of services)launch(svc);
 const shutdown=()=>{
  if(stopping)return;
  stopping=true;
  for(const timer of timers)clearTimeout(timer);
  for(const child of active.values())if(!child.killed)child.kill('SIGTERM');
 };
 return {shutdown,services:services.map(x=>x.name)};
}
if(require.main===module){
 const option=process.argv.indexOf('--repo');
 const root=option>=0?process.argv[option+1]:process.env.DAUNTLESS_SERVER_ROOT||path.join(os.homedir(),'dauntless-revived');
 if(!root){console.error('Informe --repo CAMINHO_DA_PASTA');process.exitCode=1;}
 else{
  try{const runner=start(root);console.log('Host da comunidade iniciado: '+runner.services.join(', '));process.on('SIGTERM',runner.shutdown);process.on('SIGINT',()=>{runner.shutdown();process.exitCode=0;});}
  catch(e){console.error(e.message);process.exitCode=1;}
 }
}
module.exports={spec,start,SERVICES};
