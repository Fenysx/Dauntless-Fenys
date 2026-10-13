'use strict';
// Verify the simple server access flow against the actual pinned upstream API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const {prepareServer}=require('../src/fenys-server-setup');
const {createInvite,registerPlayer,requestApi}=require('../src/fenys-api');
const {encodeConnection,decodeConnection}=require('../src/fenys-connection-code');
async function main(){
 const root=path.resolve(process.env.METAGAME_TEST_DIR||'test-upstream'),base=path.join(root,'UndauntedMetagame');
 const files={serverSource:path.join(base,'src/server.ts'),metagameEnv:path.join(base,'.env')};
 const original={serverSource:fs.readFileSync(files.serverSource,'utf8'),metagameEnv:fs.readFileSync(path.join(base,'.env.example'),'utf8'),deployEnv:'MY_IP=127.0.0.1\n'};
 const prepared=prepareServer({...original,address:'100.64.1.2:61000'});
 fs.writeFileSync(files.serverSource,prepared.serverSource);fs.writeFileSync(files.metagameEnv,prepared.metagameEnv);
 fs.mkdirSync(path.join(base,'fenys'),{recursive:true});
 for(const name of ['fenys-api.js','fenys-network.js','fenys-private-listener.js'])fs.copyFileSync(path.join(__dirname,'../src',name),path.join(base,'fenys',name));
 execFileSync(process.execPath,[path.join(base,'node_modules/typescript/bin/tsc')],{cwd:base,stdio:'inherit'});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const child=spawn(process.execPath,['--env-file=.env','dist/server.js'],{cwd:base,env:{...process.env,PORT:String(port),DB_FILENAME:'fenys-simple-connection.db',
  AUTH_SIGNING_PRIVKEY_B64:Buffer.from(pair.privateKey).toString('base64'),AUTH_SIGNING_PUBKEY_B64:Buffer.from(pair.publicKey).toString('base64'),
  FENYS_TAILSCALE_IP:'',CHAT:'0',LOG_REQUESTS:'0',LOG_BODIES:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{logs=(logs+String(d)).slice(-4000);});
 try{
  const local='127.0.0.1:'+port;let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error(logs);
   try{await requestApi(local,'/undaunted/api/RegistrationStatus');ready=true;break;}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(ready,true,logs);
  const Database=createRequire(path.join(base,'package.json'))('better-sqlite3'),db=new Database(path.join(base,'fenys-simple-connection.db'));
  const adminId='UID-'+crypto.randomUUID(),adminKey='UUK_'+crypto.randomBytes(24).toString('hex');
  try{
   db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(adminId,'Fenys',0,1);
   db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(adminId,crypto.createHash('sha256').update(adminKey).digest('hex'));
   const invite=await createInvite(local,adminKey,'Ygor');
   const encoded=encodeConnection('100.64.1.2:61000',invite),decoded=decodeConnection(encoded);
   assert.equal(decoded.server,'100.64.1.2:61000');assert.equal(decoded.invite,invite);
   const playerKey=await registerPlayer(local,'Ygor',decoded.invite);
   const info=await requestApi(local,'/undaunted/api/GetUserInfo',{key:playerKey});
   assert.equal(info.Username,'Ygor');assert.equal(info.IsAdmin,false);assert.notEqual(info.UserId,adminId);
   await assert.rejects(registerPlayer(local,'OutraPessoa',decoded.invite));
   assert.equal((await requestApi(local,'/undaunted/api/GetUserInfo',{key:playerKey})).UserId,info.UserId);
   console.log('Simple access: pinned Metagame compiled, admin issued one-use invite, Ygor registered with own key and reconnects without launcher login.');
  }finally{db.close();}
 }finally{
  child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else{child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},3000).unref();}});
  fs.writeFileSync(files.serverSource,original.serverSource);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

