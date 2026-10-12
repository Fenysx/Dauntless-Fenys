'use strict';
// Explicit opt-in live integration. The authorization is an isolated test realm,
// generated outside the repository; never use the production activation file.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync,backup}=require('node:sqlite');
const {createSupabaseBackup,request,unseal,envelope}=require('../src/fenys-supabase');
async function main(){
 const source=process.env.FENYS_SUPABASE_TEST_CONFIG;if(!source)throw Error('Supply an isolated test configuration, not a production authorization.');
 const config=JSON.parse(fs.readFileSync(source,'utf8')),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-supabase-live-'));
 const configFile=path.join(dir,'config.json');fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
 const db=new DatabaseSync(':memory:');db.backup=file=>backup(db,file);
 db.exec('CREATE TABLE players(uid TEXT PRIMARY KEY,characterId TEXT NOT NULL,level INTEGER NOT NULL,xp INTEGER NOT NULL); CREATE TABLE inventories(uid TEXT PRIMARY KEY,rams INTEGER NOT NULL);');
 const uid='UID-'+crypto.randomUUID(),character=crypto.randomUUID();db.prepare('INSERT INTO players VALUES(?,?,27,2700)').run(uid,character);db.prepare('INSERT INTO inventories VALUES(?,5000)').run(uid);
 const sync=createSupabaseBackup(db,{configFile,directory:path.join(dir,'copies'),pair:config.pair,realm:config.realm,address:'100.64.1.2:61000',autoStart:false});
 try{
  await sync.flush(true);assert.equal(sync.state().cloudVersion,1);assert.equal(sync.ready(),true);
  db.prepare('UPDATE players SET level=28,xp=3100 WHERE uid=?').run(uid);db.prepare('UPDATE inventories SET rams=6500 WHERE uid=?').run(uid);sync.mark();await sync.flush(true);
  const remote=await request({...config,enrolled:true},'download'),blob=Buffer.from(remote.ciphertext,'base64');assert.equal(remote.revision,2);assert.equal(crypto.createHash('sha256').update(blob).digest('hex'),remote.digest);
  const restored=path.join(dir,'restored.db');fs.writeFileSync(restored,unseal(blob,config.encryptionKey,config.realm,remote.commitId));
  const copy=new DatabaseSync(restored);try{assert.deepEqual({...copy.prepare('SELECT * FROM players').get()},{uid,characterId:character,level:28,xp:3100});assert.equal(copy.prepare('SELECT rams FROM inventories').get().rams,6500);}finally{copy.close();}
  await assert.rejects(request({...config,enrolled:true},'lease',{holder:'f'.repeat(64)}),/outro PC/);
  const invalid=await fetch(config.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(invalid.status,401);
  const forged=envelope(config.pair,config.realm,'state');forged.message=forged.message.replace(config.realm,crypto.randomUUID());const denied=await fetch(config.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(forged)});assert.equal(denied.status,401);
  console.log('Live Supabase: encrypted SQLite round trip preserves the same UID/character, level 28, XP 3100 and inventory; another writer and unsigned/altered requests are denied.');
 }finally{await sync.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
