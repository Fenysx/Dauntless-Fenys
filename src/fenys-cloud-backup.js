'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
function run(binary,args){return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Backup Drive excedeu 5 minutos.'));},300000);
 child.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-1500);});child.once('error',e=>{clearTimeout(timer);reject(e);});
 child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('rclone falhou ('+code+'). Confira a autorização do Drive no PC central.'));});
});}
function verifyRemote(binary){return new Promise((resolve,reject)=>{
 const child=spawn(binary,['config','redacted','dauntless-crypt'],{windowsHide:true,stdio:['ignore','pipe','ignore']});let text='';
 const timer=setTimeout(()=>{child.kill();reject(Error('rclone não confirmou o remoto criptografado.'));},15000);
 child.stdout.on('data',d=>{text=(text+String(d)).slice(-16384);});child.once('error',e=>{clearTimeout(timer);reject(e);});
 child.once('close',code=>{clearTimeout(timer);if(code===0&&/^type\s*=\s*crypt\s*$/mi.test(text)&&!/^no_data_encryption\s*=\s*true\s*$/mi.test(text))resolve();else reject(Error('O remoto dauntless-crypt deve ser do tipo crypt com criptografia de dados ativa.'));});
});}
function createBackup(db,{directory,remote='dauntless-crypt:automaticos/globais',binary=process.platform==='win32'?'rclone.exe':'rclone',execute=run,validateRemote=verifyRemote,clock=Date.now,minInterval=60000}={}){
 if(typeof remote!=='string'||!/^dauntless-crypt:(?:[A-Za-z0-9_/-]+)?$/.test(remote))throw Error('Use o remoto criptografado dauntless-crypt.');
 db.exec('CREATE TABLE IF NOT EXISTS fenys_cloud_backup(id INTEGER PRIMARY KEY CHECK(id=1),dirty INTEGER NOT NULL,lastSuccess INTEGER NOT NULL,revision INTEGER NOT NULL,error TEXT); INSERT OR IGNORE INTO fenys_cloud_backup VALUES(1,1,0,0,NULL);');
 if(!db.prepare('PRAGMA table_info(fenys_cloud_backup)').all().some(x=>x.name==='lastHistory'))db.exec('ALTER TABLE fenys_cloud_backup ADD COLUMN lastHistory INTEGER NOT NULL DEFAULT 0');
 let active=false,timer=null,verified=false;
 const state=()=>db.prepare('SELECT dirty,lastSuccess,revision,error FROM fenys_cloud_backup WHERE id=1').get();
 function mark(){db.prepare('UPDATE fenys_cloud_backup SET dirty=1,revision=revision+1 WHERE id=1').run();schedule();}
 function schedule(){if(timer||active)return;timer=setTimeout(()=>{timer=null;void flush().catch(()=>{});},minInterval);timer.unref?.();}
 async function flush(force=false){
  if(active)return state();const before=state();if(!before.dirty&&!force)return before;active=true;
  try{
   if(!verified){await validateRemote(binary);verified=true;}
   fs.mkdirSync(directory,{recursive:true,mode:0o700});
   const name=new Date(clock()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'),folder=path.join(directory,name);
   fs.mkdirSync(folder,{mode:0o700});const file=path.join(folder,'undaunted.db');
   await db.backup(file);
   await execute(binary,['copyto',file,remote+'/atual/undaunted.db','--retries','2','--low-level-retries','3','--crypt-no-data-encryption=false']);
   await execute(binary,['cryptcheck',folder,remote+'/atual','--one-way']);
   const history=db.prepare('SELECT lastHistory FROM fenys_cloud_backup WHERE id=1').get().lastHistory;
   if(clock()-history>=3600000){
    await execute(binary,['copyto',file,remote+'/historico/'+name+'/undaunted.db','--retries','2','--crypt-no-data-encryption=false']);
    await execute(binary,['cryptcheck',folder,remote+'/historico/'+name,'--one-way']);
    db.prepare('UPDATE fenys_cloud_backup SET lastHistory=? WHERE id=1').run(clock());
   }
   db.prepare('UPDATE fenys_cloud_backup SET lastSuccess=?,error=NULL,dirty=CASE WHEN revision=? THEN 0 ELSE 1 END WHERE id=1').run(clock(),before.revision);
   const ownFolders=fs.readdirSync(directory).filter(n=>/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{6}$/.test(n)&&fs.lstatSync(path.join(directory,n)).isDirectory()).sort();
   for(const old of ownFolders.slice(0,-3))fs.rmSync(path.join(directory,old),{recursive:true,force:true});
  }catch(e){db.prepare('UPDATE fenys_cloud_backup SET dirty=1,error=? WHERE id=1').run(String(e.message).slice(0,200));throw e;}
  finally{active=false;if(state().dirty)schedule();}
  return state();
 }
 schedule();return {mark,flush,state,close(){if(timer)clearTimeout(timer);}};
}
module.exports={createBackup,run,verifyRemote};
