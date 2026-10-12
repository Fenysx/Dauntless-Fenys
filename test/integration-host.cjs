'use strict';
// CI: compiles and boots the ACTUAL pinned upstream with the installed overlay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const {prepareFiles}=require('../src/fenys-host-setup');
const {identity,sign,hash}=require('../src/fenys-roaming-protocol');
const {roamingRequest}=require('../src/fenys-roaming-client');
async function main(){
 const root=path.resolve(process.env.METAGAME_TEST_DIR||'test-upstream');
 const base=path.join(root,'UndauntedMetagame'),deploy=path.join(root,'UndauntedDeployServer');
 const files={appSource:path.join(base,'src/app.ts'),serverSource:path.join(base,'src/server.ts'),metagameEnv:path.join(base,'.env'),deployEnv:path.join(deploy,'.env')};
 fs.copyFileSync(path.join(base,'.env.example'),files.metagameEnv);fs.copyFileSync(path.join(deploy,'.env.example'),files.deployEnv);
 const originals={};for(const [k,v] of Object.entries(files))originals[k]=fs.readFileSync(v,'utf8');
 const patched=prepareFiles({...originals,address:'100.64.1.2:61000'});
 for(const [k,v] of Object.entries(files))fs.writeFileSync(v,patched[k]);
 fs.mkdirSync(path.join(base,'fenys'),{recursive:true});
 for(const name of ['fenys-roaming-host.js','fenys-roaming-protocol.js','fenys-api.js','fenys-private-listener.js'])fs.copyFileSync(path.join(__dirname,'../src',name),path.join(base,'fenys',name));
 execFileSync(process.execPath,[path.join(base,'node_modules/typescript/bin/tsc')],{cwd:base,stdio:'inherit'});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const child=spawn(process.execPath,['--env-file=.env','dist/server.js'],{cwd:base,env:{...process.env,PORT:String(port),
  AUTH_SIGNING_PRIVKEY_B64:Buffer.from(pair.privateKey).toString('base64'),AUTH_SIGNING_PUBKEY_B64:Buffer.from(pair.publicKey).toString('base64'),
  DB_FILENAME:'fenys-integration.db',FENYS_TAILSCALE_IP:'',CHAT:'0',LOG_REQUESTS:'0',LOG_BODIES:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{logs=(logs+String(d)).slice(-6000);});
 child.on('error',e=>{logs+=e.message;});
 try{
  const address='127.0.0.1:'+port;
  let ready=false;for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Metagame stopped: '+logs);
   try{await roamingRequest(address,'status');ready=true;break;}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(ready,true,'Metagame startup: '+logs);
  const Database=createRequire(path.join(base,'package.json'))('better-sqlite3');
  const db=new Database(path.join(base,'fenys-integration.db'));
  const userId='UID-'+crypto.randomUUID(),characterId=crypto.randomUUID(),key='UUK_'+crypto.randomBytes(24).toString('hex'),passport=identity();
  try{
   db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId,'Integration',0,1);
   db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(userId,hash(key));
   db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(characterId,userId,'2026-10-12','2026-10-12','Integration',3,'{"Level":12}');
   db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(characterId,'[]','{"rams":1234}');
   const envelope=(operation,fields={})=>sign(passport,{version:1,operation,userId,requestId:crypto.randomUUID(),...fields});
   const leaving=await roamingRequest(address,'checkout',envelope('checkout'),key);
   assert.equal(leaving.snapshot.tables.characters[0].characterId,characterId);
   const denied=await fetch('http://'+address+'/character/'+characterId);assert.equal(denied.status,409);
   await roamingRequest(address,'join',envelope('join',{snapshot:leaving.snapshot,session:crypto.randomUUID(),gameKey:key}));
   assert.equal(db.prepare('SELECT isAdmin FROM users WHERE userId=?').get(userId).isAdmin,1);
   assert.equal(db.prepare('SELECT stackedItems FROM inventories WHERE characterId=?').get(characterId).stackedItems,'{"rams":1234}');
   const info=await fetch('http://'+address+'/undaunted/api/GetUserInfo',{headers:{'x-undaunted-user-api-key':key}});
   assert.equal(info.status,200);assert.equal((await info.json()).UserId,userId);
   console.log('Pinned Metagame: overlay compiled, booted, exported, fenced and restored the same character.');
  }finally{db.close();}
 }finally{child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else{child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},3000).unref();}});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
