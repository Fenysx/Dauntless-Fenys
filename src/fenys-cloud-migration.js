'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {hash,sign,call}=require('./fenys-cloud-protocol');
const TABLES=['users','characters','inventories','loadouts','userapikeys','breadcrumbs','encounteredcontent',
 'inventorytransactions','inventorylog','characterhistory','loadouthistory','progress_tracks','objectives','progression_events',
 'huntpassselection','entitlements','cooldowns','bounties','bountydraft','loadoutslots','friendships','blocks',
 'escalationprogression','escalationtalents','escalationunlocks','storepurchases','leaderboardprofiles','trialruns',
 'guilds','guildmembers','guildinvites','slayerlinkinvites','slayerlinks','huntregions','discordlinks','account_bans','moderation_events'];
const AUTO=new Set(['inventorytransactions','inventorylog','characterhistory','loadouthistory','progression_events','trialruns','moderation_events']);
const quote=x=>'"'+x+'"';
function schema(db){return Object.fromEntries(TABLES.map(t=>[t,db.prepare('PRAGMA table_info('+quote(t)+')').all().map(x=>({name:x.name,type:x.type,pk:x.pk}))]));}
function capture(db){
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='fenys_passports'").get()&&db.prepare('SELECT userId FROM fenys_passports WHERE active=0 OR home=0').get())throw Error('Retorne os personagens portáteis ao servidor original antes de integrar o host.');
 const columns=schema(db);if(Object.values(columns).some(x=>!x.length))throw Error('Metagame não possui o esquema compatível para migração global.');
 return db.transaction(()=>({schema:hash(JSON.stringify(columns)),tables:Object.fromEntries(TABLES.map(t=>[t,db.prepare('SELECT * FROM '+quote(t)).all()]))})).immediate();
}
function importState(db,hostId,snapshot){
 const columns=schema(db);
 if(!snapshot||snapshot.schema!==hash(JSON.stringify(columns))||!snapshot.tables||JSON.stringify(Object.keys(snapshot.tables).sort())!==JSON.stringify([...TABLES].sort()))throw Error('Esquema de migração incompatível. O banco local será preservado.');
 db.exec('CREATE TABLE IF NOT EXISTS fenys_cloud_migrations(hostId TEXT PRIMARY KEY,digest TEXT NOT NULL,accounts INTEGER NOT NULL,time INTEGER NOT NULL);');
 const digest=hash(JSON.stringify(snapshot)),previous=db.prepare('SELECT * FROM fenys_cloud_migrations WHERE hostId=?').get(hostId);
 if(previous){if(previous.digest!==digest)throw Error('Este host já foi integrado. Não substitua dados globais por outra cópia local.');return {accounts:previous.accounts,alreadyImported:true};}
 for(const [t,rows] of Object.entries(snapshot.tables)){
  if(!Array.isArray(rows)||rows.length>1000000)throw Error('Tabela de migração inválida.');
  const allowed=columns[t].map(c=>c.name).sort();for(const row of rows)if(!row||JSON.stringify(Object.keys(row).sort())!==JSON.stringify(allowed)||Object.values(row).some(v=>v!==null&&!['string','number'].includes(typeof v)))throw Error('Campos inválidos na migração.');
 }
 return db.transaction(()=>{
  const incoming=new Set(),known=new Set(db.prepare('SELECT userId FROM users').all().map(u=>u.userId));
  for(const user of snapshot.tables.users){
   if(typeof user.userId!=='string'||!/^UID-[a-f0-9-]{36}$/i.test(user.userId)||typeof user.name!=='string'||user.name.length>64)throw Error('Identidade de conta inválida.');
   if(known.has(user.userId))throw Error('A conta '+user.name+' já está na nuvem. Preserve a versão central e não importe um banco duplicado.');
   if(db.prepare('SELECT userId FROM users WHERE lower(name)=lower(?)').get(user.name))throw Error('Já existe outra conta global com o nome '+user.name+'. Resolva o nome antes de integrar este host.');
   incoming.add(user.userId);known.add(user.userId);
  }
  const charOwners=new Map(snapshot.tables.characters.map(c=>[c.characterId,c.userId]));
  for(const c of snapshot.tables.characters){if(!incoming.has(c.userId)||! /^[a-f0-9-]{36}$/i.test(c.characterId)||db.prepare('SELECT characterId FROM characters WHERE characterId=?').get(c.characterId))throw Error('Conflito de personagem na migração.');}
  for(const [table,rows] of Object.entries(snapshot.tables))for(const original of rows){
   const row={...original};
   for(const field of ['userId','accountId','account_id','leaderId','userLow','userHigh','requesterId','blockerId','blockedId','senderId','targetId','inviteeId','inviterId']){
    if(field in row&&typeof row[field]==='string'&&row[field].startsWith('UID-')&&!known.has(row[field]))throw Error('Relacionamento com conta desconhecida.');
   }
   if('characterId' in row&&!charOwners.has(row.characterId))throw Error('Item ou save sem personagem correspondente.');
   if(table==='users')row.isAdmin=0; // Host ownership never grants central administrator rights.
   if(AUTO.has(table))delete row.id;
   if(table==='userapikeys'&&db.prepare('SELECT userId FROM userapikeys WHERE keyHash=?').get(row.keyHash))throw Error('A chave pertence a outra identidade global.');
   const keys=Object.keys(row);db.prepare('INSERT INTO '+quote(table)+' ('+keys.map(quote).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));
  }
  db.prepare('INSERT INTO fenys_cloud_migrations VALUES(?,?,?,?)').run(hostId,digest,incoming.size,Date.now());return {accounts:incoming.size,alreadyImported:false};
 }).immediate();
}
function previewState(db,hostId,snapshot){
 let result;const stop=new Error('fenys_preview_rollback');
 try{db.transaction(()=>{result=importState(db,hostId,snapshot);throw stop;}).immediate();}catch(e){if(e!==stop)throw e;}
 return result;
}
async function run(){
 const base=process.cwd(),Database=createRequire(path.join(base,'package.json'))('better-sqlite3');
 const config=JSON.parse(fs.readFileSync(path.join(base,'fenys','cloud-host.json'),'utf8'));
 const status=await call(config.authority,'migration-status',sign(config,{operation:'migration-status',hostId:config.hostId,realm:config.realm,time:Date.now(),requestId:crypto.randomUUID()}));
 if(status.migrated){console.log(JSON.stringify({alreadyImported:true}));return;}
 const file=process.env.DB_FILENAME;if(!file||file===':memory:')throw Error('Banco local não configurado.');
 const db=new Database(path.resolve(base,file),{fileMustExist:true,timeout:8000});
 try{const snapshot=capture(db),operation=process.argv.includes('--check')?'migrate-check':'migrate';const result=await call(config.authority,operation,sign(config,{operation,hostId:config.hostId,realm:config.realm,time:Date.now(),requestId:crypto.randomUUID(),snapshot}),undefined,300000);console.log(JSON.stringify(result));}finally{db.close();}
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={capture,importState,previewState,TABLES};
