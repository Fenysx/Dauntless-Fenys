'use strict';
// Run only on the stopped central PC. Retains the current database before replacing it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {createRequire}=require('node:module');
const {validateAuthorization,request,unseal}=require('./fenys-supabase');
async function restore({configFile,dbFile,Database,invoke=request}){
 const config=validateAuthorization(JSON.parse(fs.readFileSync(configFile,'utf8')));
 if(!config.enrolled||!config.pair||!config.realm||!config.holder)throw Error('Use a configuração já ativada do PC central, com a identidade original.');
 await invoke(config,'lease',{holder:config.holder});
 const temp=dbFile+'.supabase-restore.tmp';let before;
 try{
  const remote=await invoke(config,'download');if(!remote?.commitId)throw Error('Não há cópia confirmada no Supabase.');
  const blob=Buffer.from(remote.ciphertext,'base64');if(crypto.createHash('sha256').update(blob).digest('hex')!==remote.digest)throw Error('Integridade da cópia não confirmada.');
  fs.writeFileSync(temp,unseal(blob,config.encryptionKey,config.realm,remote.commitId),{mode:0o600,flag:'wx'});
  const check=new Database(temp);try{
   if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Banco recebido inválido.');
   const realm=check.prepare("SELECT value FROM fenys_cloud_settings WHERE key='realm'").get()?.value;
   const pair=JSON.parse(check.prepare("SELECT value FROM fenys_cloud_settings WHERE key='authorityIdentity'").get()?.value||'{}');
   if(realm!==config.realm||pair.publicKey!==config.pair.publicKey)throw Error('Cópia pertence a outro banco global.');
   check.prepare('UPDATE fenys_supabase_sync SET cloudVersion=?,dirty=0,lastSuccess=?,error=NULL WHERE id=1').run(remote.revision,Date.now());
  }finally{check.close();}
  const current=await invoke(config,'lease',{holder:config.holder});
  if(current.revision!==remote.revision||current.latestCommit!==remote.commitId)throw Error('A nuvem mudou durante a recuperação. Tente novamente antes de substituir o banco.');
  if(fs.existsSync(dbFile)){
   const old=new Database(dbFile);try{
    const realm=old.prepare("SELECT value FROM fenys_cloud_settings WHERE key='realm'").get()?.value;
    if(realm!==config.realm)throw Error('Banco local pertence a outra rede. Preserve os arquivos existentes.');
    before=dbFile+'.before-supabase-'+Date.now()+'.bak';await old.backup(before);
    old.exec('PRAGMA wal_checkpoint(TRUNCATE)');
   }finally{old.close();}
  }
  // With all services stopped, WAL has been checkpointed and the preserved copy is complete.
  for(const suffix of ['-wal','-shm'])fs.rmSync(dbFile+suffix,{force:true});
  fs.renameSync(temp,dbFile);return {revision:remote.revision,backup:before||null};
 }finally{fs.rmSync(temp,{force:true});await invoke(config,'release',{holder:config.holder}).catch(()=>{});}
}
async function main(){
 if(process.argv[2]!=='--restore')throw Error('Use --restore somente após encerrar Metagame, DeployServer e o jogo.');
 for(const port of [61000,61001]){const active=await new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.setTimeout(1000);s.once('connect',()=>{s.destroy();r(true);});s.once('error',()=>r(false));s.once('timeout',()=>{s.destroy();r(false);});});if(active)throw Error('Encerre os serviços antes de restaurar.');}
 if(!process.env.DB_FILENAME||process.env.DB_FILENAME===':memory:')throw Error('DB_FILENAME não configurado.');
 const base=process.cwd(),Database=createRequire(path.join(base,'package.json'))('better-sqlite3');
 const result=await restore({configFile:path.join(base,'fenys/supabase-authorization.json'),dbFile:path.resolve(base,process.env.DB_FILENAME),Database});
 console.log('Cópia global restaurada. Revisão '+result.revision+'. Banco anterior preservado: '+(result.backup||'não havia banco local'));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={restore};
