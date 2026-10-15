'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {database}=require('./helpers/sqlite');
const {identity}=require('../src/fenys-cloud-protocol');
const {createGoogleHost}=require('../src/fenys-google-host');
test('save permanece local e pendente quando nuvem cai; retry confirma sem sobrescrever personagem',async t=>{
 const db=database(t),key='UID-'+crypto.randomUUID(),cid=crypto.randomUUID(),session=crypto.randomUUID(),admin=identity();
 const localLease=Date.now()+60000;
 db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,0)').run(key,'OfflinePlayer');
 db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(cid,key,'2026-10-15','2026-10-15','OfflinePlayer',1,'{"Level":10}');
 let cloudRev=1,cloudCommit=null,uploads=0;
 const invoke=async(operation,body)=>{
  if(operation==='host-register')return {registered:true};
  if(operation==='renew')return {revision:cloudRev,commitId:cloudCommit,leaseUntil:new Date(Date.now()+60000).toISOString()};
  if(operation==='save'){
   const msg=JSON.parse(body.envelope.message);
   uploads++;
   if(uploads===1)throw Error('Internet indisponível');
   assert.equal(msg.snapshot.tables.characters[0].data,'{"Level":11}');
   assert.equal(msg.expectedRevision,1);
   cloudRev=2;cloudCommit=msg.commitId;
   return {revision:2,commitId:msg.commitId};
  }
  throw Error('Operação não prevista: '+operation);
 };
 const host=createGoogleHost(db,{config:{...admin,realm:crypto.randomUUID(),address:'192.168.1.20:61000'},invoke,autoStart:false});
 db.prepare('INSERT INTO launcher_google_sessions (userId,authId,session,revision,leaseUntil,active,dirty,changes,pending,error) VALUES(?,?,?,?,?,1,0,0,NULL,NULL)').run(key,crypto.randomUUID(),session,1,localLease);
 db.prepare('UPDATE characters SET data=? WHERE userId=?').run('{"Level":11}',key);
 assert.equal(db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(key).dirty,1);
 await assert.rejects(host.flush(),/Internet indisponível/);
 let row=db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(key);
 assert.equal(row.dirty,1);
 assert.ok(row.pending,'snapshot pendente deve sobreviver a falha');
 assert.equal(row.leaseUntil,localLease,'falha de Internet não invalida o último lease confirmado');
 assert.equal(db.prepare('SELECT data FROM characters WHERE userId=?').get(key).data,'{"Level":11}');
 await host.flush();
 row=db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(key);
 assert.equal(row.dirty,0);
 assert.equal(row.pending,null);
 assert.equal(row.revision,2);
 assert.ok(row.confirmedAt>0);
 assert.equal(row.error,null);
 assert.equal(uploads,2);
});
