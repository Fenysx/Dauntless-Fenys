'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {database}=require('./helpers/sqlite');
const {TABLES}=require('../src/fenys-roaming-host');
const {installChangeTracking,pendingRows}=require('../src/fenys-google-autosave');
function setup(t){
 const db=database(t);
 db.exec('CREATE TABLE launcher_google_sessions(userId TEXT PRIMARY KEY, active INTEGER NOT NULL,dirty INTEGER NOT NULL,changes INTEGER NOT NULL,pending TEXT)');
 const userId='UID-11111111-1111-4111-8111-111111111111';
 db.prepare('INSERT INTO users (userId,name,notes,isAdmin) VALUES (?, ?,0,0)').run(userId,'SaveTest');
 db.prepare('INSERT INTO characters (characterId,userId,createdDate,lastModifiedDate,name,updateVersion,data) VALUES(?,?,?, ?, ?,?,?)')
  .run('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userId,'2026-10-15','2026-10-15','SaveTest',1,'{"Level":10}');
 db.prepare('INSERT INTO launcher_google_sessions VALUES(?,1,0,0,NULL)').run(userId);
 return {db,userId};
}
test('instala triggers para TODAS as tabelas de progresso, inclusive writes sem HTTP',t=>{
 const {db,userId}=setup(t);
 assert.equal(installChangeTracking(db),Object.keys(TABLES).length*3);
 assert.equal(installChangeTracking(db),Object.keys(TABLES).length*3);
 db.prepare('UPDATE characters SET data=? WHERE userId=?').run('{"Level":11}',userId);
 assert.deepEqual({...db.prepare('SELECT dirty,changes FROM launcher_google_sessions WHERE userId=?').get(userId)},{dirty:1,changes:1});
 assert.equal(pendingRows(db),1);
});
test('alteracoes no inventario marcam apenas o usuario dono',t=>{
 const {db,userId}=setup(t);
 const second='UID-22222222-2222-4222-8222-222222222222';
 db.prepare('INSERT INTO launcher_google_sessions VALUES(?,1,0,0,NULL)').run(second);
 installChangeTracking(db);
 const character='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 db.prepare('INSERT INTO inventories (characterId,instancedItems,stackedItems) VALUES(?,?,?)').run(character,'[]','[]');
 db.prepare('UPDATE inventories SET stackedItems=? WHERE characterId=?').run('[{"item":"Rams","amount":5}]',character);
 assert.equal(db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(userId).dirty,1);
 assert.equal(db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(second).dirty,0);
});
test('transacao de save revertida nao causa upload nem altera revision local',t=>{
 const {db,userId}=setup(t);installChangeTracking(db);
 assert.throws(()=>db.transaction(()=>{
  db.prepare('UPDATE characters SET data=? WHERE userId=?').run('{"Level":99}',userId);
  throw Error('rollback');
 }).immediate(),/rollback/);
 assert.equal(db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(userId).dirty,0);
 assert.equal(pendingRows(db),0);
});
test('sessao inativa nao e enviada ao Supabase mesmo que tabela local mude',t=>{
 const {db,userId}=setup(t);installChangeTracking(db);
 db.prepare('UPDATE launcher_google_sessions SET active=0 WHERE userId=?').run(userId);
 db.prepare('UPDATE characters SET data=? WHERE userId=?').run('{"Level":15}',userId);
 assert.equal(pendingRows(db),0);
});
