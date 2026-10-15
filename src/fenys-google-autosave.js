'use strict';
// SQLite triggers persist independently of the launcher or HTTP request handler.
// They catch native progression writes, including writes made outside Metagame HTTP routes.
const {TABLES}=require('./fenys-roaming-host');
const ident=name=>'"'+name.replaceAll('"','""')+'"';
const kinds=['INSERT','UPDATE','DELETE'];
function installChangeTracking(db){
 let count=0;
 for(const [table,owner] of Object.entries(TABLES)){
  const cols=db.prepare('PRAGMA table_info('+ident(table)+')').all().map(x=>x.name);
  if(!cols.includes(owner))throw Error('A tabela de progresso '+table+' não contém a coluna '+owner+'.');
  for(const kind of kinds){
   const row=kind==='DELETE'?'OLD':'NEW';
   const uid=owner==='characterId'?'(SELECT userId FROM characters WHERE characterId='+row+'.'+ident(owner)+')':row+'.'+ident(owner);
   // All names are from the fixed TABLES allowlist, never external input.
   const name='launcher_google_autosave_'+table+'_'+kind.toLowerCase();
   db.exec('CREATE TRIGGER IF NOT EXISTS '+ident(name)+' AFTER '+kind+' ON '+ident(table)+
    ' BEGIN UPDATE launcher_google_sessions SET dirty=1,changes=changes+1 WHERE active=1 AND userId='+uid+'; END;');
   count++;
  }
 }
 return count;
}
function pendingRows(db){
 return db.prepare('SELECT COUNT(*) AS n FROM launcher_google_sessions WHERE active=1 AND (dirty=1 OR pending IS NOT NULL)').get().n;
}
module.exports={installChangeTracking,pendingRows};
