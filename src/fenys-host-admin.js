'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
// Executes only on the owner PC, with the Metagame's installed better-sqlite3.
// Removes the account's key and invalidates JWT epochs. All character/progression rows remain intact.
const SCRIPT="const fs=require('node:fs'),path=require('node:path');\nconst Database=require('better-sqlite3');\n(async()=>{\n const userId=process.argv[1],backupDir=process.argv[2];\n if(!/^UID-[a-f0-9-]{16,80}$/i.test(userId))throw Error('invalid_account');\n const raw=process.env.DB_FILENAME;\n if(!raw||raw===':memory:')throw Error('no_database');\n const dbFile=path.resolve(process.cwd(),raw);\n if(!fs.existsSync(dbFile)||!fs.statSync(dbFile).isFile())throw Error('database_missing');\n fs.mkdirSync(backupDir,{recursive:true,mode:0o700});\n const db=new Database(dbFile,{fileMustExist:true,timeout:8000});\n try{\n  const row=db.prepare('SELECT userId,name,isAdmin FROM users WHERE userId=?').get(userId);\n  if(!row)throw Error('unknown_account');\n  if(row.isAdmin)throw Error('admin_protected');\n  const credentials=db.prepare('SELECT keyHash FROM userapikeys WHERE userId=?').get(userId);\n  if(!credentials)throw Error('already_removed');\n  const backup=path.join(backupDir,'before-revoke-'+Date.now()+'-'+require('node:crypto').randomBytes(4).toString('hex')+'.db');\n  await db.backup(backup);\n  const changed=db.transaction(()=>{\n   const current=db.prepare('SELECT isAdmin FROM users WHERE userId=?').get(userId);\n   if(!current||current.isAdmin)throw Error('account_changed');\n   const result=db.prepare('DELETE FROM userapikeys WHERE userId=?').run(userId);\n   if(result.changes!==1)throw Error('account_changed');\n   db.prepare('DELETE FROM userapikeystoregister WHERE userId=?').run(userId);\n   db.prepare('INSERT INTO authepochs(userId,epoch) VALUES(?,1) ON CONFLICT(userId) DO UPDATE SET epoch=epoch+1').run(userId);\n  });\n  changed.immediate();\n  console.log(JSON.stringify({ok:true,name:row.name,backup}));\n }finally{db.close();}\n})().catch(e=>{console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;});\n";
function revokePlayer(projectDir,accountId,backupDir){
 if(typeof accountId!=='string'||!/^UID-[a-f0-9-]{16,80}$/i.test(accountId))throw new Error('Identificador de jogador inválido.');
 if(!fs.existsSync(path.join(projectDir,'.env'))||!fs.existsSync(path.join(projectDir,'node_modules','better-sqlite3')))
   throw new Error('Metagame não está instalado e configurado neste computador.');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.platform==='win32'?'node.exe':'node',['--env-file=.env','-e',SCRIPT,accountId,backupDir],{
   cwd:projectDir,windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  let result='',stderr='';
  child.stdout.on('data',d=>{result+=String(d);if(result.length>8192)child.kill();});
  child.stderr.on('data',d=>{stderr+=String(d);if(stderr.length>8192)child.kill();});
  child.on('error',reject);
  child.on('close',code=>{
   let obj;try{obj=JSON.parse(result.trim());}catch{reject(new Error('Resposta inválida do banco local. '+stderr.slice(0,200)));return;}
   if(code===0&&obj.ok)resolve(obj);
   else reject(new Error(({admin_protected:'Não é possível remover uma conta administradora.',already_removed:'O jogador já está sem credenciais.',unknown_account:'Conta não encontrada.',database_missing:'Banco do Metagame não encontrado.',no_database:'Configure DB_FILENAME no .env do Metagame.'})[obj.error]||'Não foi possível remover o acesso: '+obj.error));
  });
 });
}
module.exports={revokePlayer};
