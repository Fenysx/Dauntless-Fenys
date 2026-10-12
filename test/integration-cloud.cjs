'use strict';
// Runs three actual upstream Metagames: one authority and two independent game gateways.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const assert=require('node:assert/strict');
const {prepareCloudFiles}=require('../src/fenys-cloud-setup');
const {identity,sign,call,decodeCode,hash}=require('../src/fenys-cloud-protocol');
const {capture}=require('../src/fenys-cloud-migration');
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
function seed(db,name,admin=0){const userId='UID-'+crypto.randomUUID(),characterId=crypto.randomUUID(),key='UUK_'+crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId,name,0,admin);db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(userId,hash(key));db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(characterId,userId,'2026-10-12','2026-10-12',name,1,'{"Level":20}');db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(characterId,'[]','[]');return {userId,characterId,key};}
async function main(){
 const original=path.resolve(process.env.METAGAME_TEST_DIR||'test-upstream'),template=path.join(original,'UndauntedMetagame');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-cloud-ci-')),children=[],dbs=[];
 const requireUpstream=createRequire(path.join(template,'package.json')),Database=requireUpstream('better-sqlite3'),jwt=requireUpstream('jsonwebtoken');
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const envKeys={AUTH_SIGNING_PRIVKEY_B64:Buffer.from(pair.privateKey).toString('base64'),AUTH_SIGNING_PUBKEY_B64:Buffer.from(pair.publicKey).toString('base64')};
 const instances=[];
 try{
  for(let i=0;i<3;i++){
   const base=path.join(temp,'host-'+i);fs.cpSync(template,base,{recursive:true,filter:p=>!p.includes(path.sep+'node_modules')&&!p.includes(path.sep+'fenys-integration.db')});
   fs.symlinkSync(path.join(template,'node_modules'),path.join(base,'node_modules'),'dir');
   const input={appSource:fs.readFileSync(path.join(base,'src/app.ts'),'utf8'),serverSource:fs.readFileSync(path.join(base,'src/server.ts'),'utf8'),matchmakingSource:fs.readFileSync(path.join(base,'src/controllers/matchmaking.ts'),'utf8'),metagameEnv:fs.readFileSync(path.join(base,'.env.example'),'utf8'),deployEnv:fs.readFileSync(path.join(original,'UndauntedDeployServer/.env.example'),'utf8'),address:'100.64.1.'+(i+1)+':61000',role:i===0?'authority':'host',authority:'100.64.1.1:61000'};
   const p=prepareCloudFiles(input);fs.writeFileSync(path.join(base,'src/app.ts'),p.appSource);fs.writeFileSync(path.join(base,'src/server.ts'),p.serverSource);fs.writeFileSync(path.join(base,'src/controllers/matchmaking.ts'),p.matchmakingSource);fs.writeFileSync(path.join(base,'.env'),p.metagameEnv);
   fs.mkdirSync(path.join(base,'fenys'),{recursive:true});for(const name of fs.readdirSync(path.join(__dirname,'../src')).filter(n=>/^fenys-.*\.js$/.test(n)))fs.copyFileSync(path.join(__dirname,'../src',name),path.join(base,'fenys',name));
   execFileSync(process.execPath,[path.join(base,'node_modules/typescript/bin/tsc')],{cwd:base,stdio:'inherit'});
   const n=await port();instances.push({base,port:n,address:'127.0.0.1:'+n,role:input.role});
  }
  const source=instances[0],routerPort=await port();
  async function boot(instance){
   const child=spawn(process.execPath,['--env-file=.env','dist/server.js'],{cwd:instance.base,env:{...process.env,...envKeys,
    PORT:String(instance.port),DB_FILENAME:path.join(instance.base,'global-test.db'),NODE_ENV:'test',CHAT:'0',LOG_REQUESTS:'0',LOG_BODIES:'0',TRIALS_LEADERBOARDS:'1',
    FENYS_TAILSCALE_IP:'',FENYS_CLOUD_PUBLIC_ADDRESS:instance.address,FENYS_CLOUD_ROUTER_PORT:String(routerPort),DEPLOYSERVER_URL:'127.0.0.1:'+routerPort},stdio:['ignore','pipe','pipe']});
   children.push(child);let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{logs=(logs+String(d)).slice(-5000);});
   child.on('error',e=>{logs+=e.message;});
   for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw Error('Upstream startup failed: '+logs);
    try{const status=await call(instance.address,'status');if(status.role===instance.role){const db=new Database(path.join(instance.base,'global-test.db'));dbs.push(db);instance.db=db;instance.status=status;return;}}catch{}
    await new Promise(r=>setTimeout(r,100));
   }
   throw Error('Upstream not ready: '+logs);
  }
  await boot(source);const owner=seed(source.db,'Fenys',1);
  for(const instance of instances.slice(1)){
   const pair=identity(),invite=decodeCode((await call(source.address,'enroll-invite',{},owner.key)).code);
   const registration=await call(source.address,'host-register',sign(pair,{operation:'host-register',realm:invite.realm,secret:invite.secret,address:instance.address,name:instance.role,requestId:crypto.randomUUID(),time:Date.now()}));
   instance.config={...pair,...registration,address:instance.address};fs.writeFileSync(path.join(instance.base,'fenys/cloud-host.json'),JSON.stringify(instance.config));
   await boot(instance);instance.player=seed(instance.db,instance===instances[1]?'Ygor':'OtherHost',1);
   instance.gameKey=crypto.randomBytes(24).toString('hex');instance.db.prepare('INSERT INTO gameserverapikeys(keyHash) VALUES(?)').run(hash(instance.gameKey));
   const migrated=await call(source.address,'migrate',sign(instance.config,{operation:'migrate',hostId:instance.config.hostId,realm:instance.config.realm,snapshot:capture(instance.db),time:Date.now(),requestId:crypto.randomUUID()}));assert.equal(migrated.accounts,1);
  }
  const [hostA,hostB]=instances.slice(1);
  async function join(player,instance){
   const invite=decodeCode((await call(instance.address,'invite',{},owner.key)).code);
   return call(source.address,'join',{realm:invite.realm,hostId:invite.hostId,secret:invite.secret,session:crypto.randomUUID()},player.key);
  }
  const token=player=>jwt.sign({userId:player.userId,epoch:source.db.prepare('SELECT epoch FROM authepochs WHERE userId=?').get(player.userId)?.epoch||0},pair.privateKey,{algorithm:'RS256',expiresIn:'5m',issuer:'undaunted-metagame',audience:'undaunted-metagame'});
  async function request(instance,method,route,player,body,game=false){
   const headers={'content-type':'application/json',authorization:'Bearer '+token(player)};if(game)headers['x-undaunted-gameserver-apikey']=instance.gameKey;
   const response=await fetch('http://'+instance.address+route,{method,headers,body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body||{})});
   const text=await response.text();assert.ok(response.status<400,method+' '+route+' -> '+response.status+' '+text);return {status:response.status,body:text?JSON.parse(text):null};
  }
  await join(owner,hostA);await join(hostA.player,hostB);
  const originalCharacter=(await request(hostA,'GET','/character',owner)).body[0];assert.equal(originalCharacter.id,owner.characterId);
  await request(hostA,'POST','/character',owner,{characterId:owner.characterId,data:'{"Level":27}',updateVersion:2});
  await request(hostA,'POST','/friends/api/public/friends/'+owner.userId+'/'+hostA.player.userId,owner);
  await request(hostB,'POST','/friends/api/public/friends/'+hostA.player.userId+'/'+owner.userId,hostA.player);
  await request(hostA,'POST','/guild/validate',owner,{leader_account_id:owner.userId,name:'FenysGlobal',nameplate:'FNXS'});
  await request(hostA,'POST','/guild',owner,{leader_account_id:owner.userId,name:'FenysGlobal',nameplate:'FNXS'},true);
  const guildBefore=(await request(hostA,'GET','/guild',owner)).body;assert.ok(guildBefore.payload);
  process.env.DB_FILENAME=path.join(source.base,'global-test.db');Object.assign(process.env,envKeys);
  const trials=require(path.join(source.base,'dist/controllers/trials.js')),week=trials.TrialWeekAt(),trialId=trials.TrialIdForWeek(1,week);
  await request(hostA,'POST','/trials/leaderboards',owner,{difficulty:1,trial_id:trialId,completion_time:9999999,objectives_completed:3,phx_account_id:owner.userId,platform:'WIN',platform_name:'Fenys',player_role_id:'PR_FRANK',weapon:2,secondary_weapon:1,session_id:'ci-global-trial'},true);
  await join(owner,hostB);
  const moved=(await request(hostB,'GET','/character',owner)).body[0];assert.equal(moved.id,owner.characterId);assert.equal(JSON.parse(moved.data).Level,27);
  const friends=(await request(hostB,'GET','/friends/api/public/friends/'+owner.userId,owner)).body;assert.ok(friends.some(f=>f.accountId===hostA.player.userId));
  assert.deepEqual((await request(hostB,'GET','/guild',owner)).body,guildBefore);
  const board=(await request(hostB,'POST','/trials/leaderboards/solo',owner,{difficulty:1,trial_id:trialId,page:0,page_size:100,target_platforms:[]})).body;assert.equal(board.payload.entries.length,1);
  assert.equal(source.db.prepare('SELECT isAdmin FROM users WHERE userId=?').get(hostA.player.userId).isAdmin,0);
  assert.equal(hostA.db.prepare('SELECT data FROM characters WHERE userId=?').get(hostA.player.userId).data,'{"Level":20}');
  assert.equal(hostA.db.prepare('SELECT count(*) n FROM characters WHERE userId=?').get(owner.userId).n,0);assert.equal(hostB.db.prepare('SELECT count(*) n FROM characters WHERE userId=?').get(owner.userId).n,0);
  console.log('Three real Metagames: original UID/character, level 27, friends, guild and nonempty leaderboard are shared across both hosts. Legacy host accounts migrated without central admin rights.');
 }finally{
  for(const child of children)child.kill('SIGTERM');
  await Promise.all(children.map(child=>new Promise(r=>{if(child.exitCode!==null)r();else{child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r();},3000).unref();}})));
  for(const db of dbs)db.close();fs.rmSync(temp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
