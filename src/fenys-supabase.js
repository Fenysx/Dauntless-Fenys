'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ENDPOINT='https://hbbtbbqsauivnierqxvh.supabase.co/functions/v1/fenys-global';
const LIMIT=16*1024*1024,HEADER=Buffer.from('FENYSDB1');
function validateAuthorization(config){
 if(config?.format!=='FENYS-SUPABASE-1'||config.endpoint!==ENDPOINT||! /^[a-f0-9]{64}$/.test(config.encryptionKey||'')||(!config.enrolled&&! /^[a-f0-9]{48}$/.test(config.secret||'')))throw Error('Selecione a autorização Supabase privada preparada para o seu PC central.');
 return config;
}
function seal(data,key,realm,commitId){
 if(data.length+36>LIMIT)throw Error('O banco excede o limite de 16 MiB desta integração Supabase. Preserve o banco local e amplie o armazenamento antes de sincronizar.');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(realm+':'+commitId));
 const body=Buffer.concat([cipher.update(data),cipher.final()]);return Buffer.concat([HEADER,iv,cipher.getAuthTag(),body]);
}
function unseal(blob,key,realm,commitId){
 if(blob.length>LIMIT||blob.length<36||!blob.subarray(0,8).equals(HEADER))throw Error('Cópia Supabase inválida.');
 const cipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),blob.subarray(8,20));cipher.setAAD(Buffer.from(realm+':'+commitId));cipher.setAuthTag(blob.subarray(20,36));
 return Buffer.concat([cipher.update(blob.subarray(36)),cipher.final()]);
}
function envelope(pair,realm,operation,fields={}){
 const message=JSON.stringify({...fields,version:1,realm,operation,time:Date.now(),requestId:crypto.randomUUID()});
 const key=crypto.createPrivateKey({key:Buffer.from(pair.privateKey,'base64'),format:'der',type:'pkcs8'});
 return {message,publicKey:pair.publicKey,signature:crypto.sign(null,Buffer.from(message),key).toString('base64')};
}
async function request(config,operation,fields={},fetchImpl=fetch){
 validateAuthorization(config);
 const response=await fetchImpl(config.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope(config.pair,config.realm,operation,fields)),redirect:'error',signal:AbortSignal.timeout(90000)});
 const text=await response.text();if(text.length>24*1024*1024)throw Error('Resposta Supabase maior que o esperado.');
 let body;try{body=JSON.parse(text);}catch{throw Error('Supabase não confirmou a operação.');}
 if(!response.ok){const errors={activation_denied:'A autorização Supabase expirou ou não foi reconhecida.',activation_used:'Essa autorização já está vinculada a outro PC central.',owner_denied:'Este PC não é a autoridade autorizada no Supabase.',authority_already_running:'Já existe outro PC central usando este banco global.',lease_expired:'A conexão com o Supabase precisa ser renovada.',stale_snapshot:'O Supabase contém dados mais recentes. Não sobrescreva o progresso; restaure a cópia global.'};throw Error(errors[body.error]||'Supabase não confirmou a persistência dos dados.');}
 return body;
}
function writeJSON(file,data){const temp=file+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600});fs.renameSync(temp,file);}
function createSupabaseBackup(db,{configFile,directory,pair,realm,address,invoke=request,clock=Date.now,minInterval=30000,autoStart=true}={}){
 const config=validateAuthorization(JSON.parse(fs.readFileSync(configFile,'utf8')));
 if(config.realm&&config.realm!==realm)throw Error('A autorização pertence a outro banco global. Restaure o banco correto.');
 if(config.pair&&config.pair.publicKey!==pair.publicKey)throw Error('A autoridade deste banco não corresponde à configuração Supabase.');
 Object.assign(config,{pair,realm,holder:crypto.createHash('sha256').update(address).digest('hex')});writeJSON(configFile,config);
 db.exec('CREATE TABLE IF NOT EXISTS fenys_supabase_sync(id INTEGER PRIMARY KEY CHECK(id=1),dirty INTEGER NOT NULL,changes INTEGER NOT NULL,cloudVersion INTEGER NOT NULL,lastSuccess INTEGER NOT NULL,error TEXT); INSERT OR IGNORE INTO fenys_supabase_sync VALUES(1,1,0,0,0,NULL);');
 const pendingFile=path.join(directory,'pending.json');let active=null,timer=null,leaseUntil=0,stopped=false,lastAttempt=0;
 const row=()=>db.prepare('SELECT * FROM fenys_supabase_sync WHERE id=1').get();
 const state=()=>({...row(),backend:'supabase',ready:!stopped&&clock()<leaseUntil&&row().lastSuccess>0,revision:row().changes});
 const ready=()=>state().ready;
 function mark(){db.prepare('UPDATE fenys_supabase_sync SET dirty=1,changes=changes+1 WHERE id=1').run();}
 async function lease(){
  if(!config.enrolled){await invoke(config,'enroll',{secret:config.secret});config.enrolled=true;delete config.secret;writeJSON(configFile,config);}
  const remote=await invoke(config,'lease',{holder:config.holder});leaseUntil=Date.parse(remote.leaseUntil);
  const local=row();if(remote.revision!==local.cloudVersion){
   let pending;try{pending=JSON.parse(fs.readFileSync(pendingFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!pending||remote.latestCommit!==pending.commitId){leaseUntil=0;throw Error('A nuvem contém outra revisão do banco. Preserve os dados locais e restaure a cópia global antes de jogar.');}
   db.prepare('UPDATE fenys_supabase_sync SET cloudVersion=?,lastSuccess=?,dirty=CASE WHEN changes=? THEN 0 ELSE 1 END,error=NULL WHERE id=1').run(remote.revision,clock(),pending.changes);
   fs.rmSync(pendingFile,{force:true});
  }
 }
 async function doFlush(force){
  const before=row();if(!force&&!before.dirty){await lease();return state();}
  lastAttempt=clock();await lease();
  fs.mkdirSync(directory,{recursive:true,mode:0o700});let pending;
  try{pending=JSON.parse(fs.readFileSync(pendingFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!pending){
   const capturedChanges=row().changes,plain=path.join(directory,'snapshot.db');await db.backup(plain);
   try{if(fs.statSync(plain).size+36>LIMIT)throw Error('O banco excede o limite de 16 MiB da integração Supabase.');const commitId=crypto.randomUUID(),blob=seal(fs.readFileSync(plain),config.encryptionKey,realm,commitId);pending={commitId,expectedRevision:row().cloudVersion,changes:capturedChanges,digest:crypto.createHash('sha256').update(blob).digest('hex'),ciphertext:blob.toString('base64')};writeJSON(pendingFile,pending);}finally{fs.rmSync(plain,{force:true});}
  }
  const result=await invoke(config,'save',{...pending,holder:config.holder});
  if(result.digest!==pending.digest||result.latestCommit!==pending.commitId)throw Error('O Supabase não confirmou a integridade da cópia global.');
  db.prepare('UPDATE fenys_supabase_sync SET cloudVersion=?,lastSuccess=?,dirty=CASE WHEN changes=? THEN 0 ELSE 1 END,error=NULL WHERE id=1').run(result.revision,clock(),pending.changes);
  fs.rmSync(pendingFile,{force:true});return state();
 }
 function flush(force=false){
  if(active)return active;
  active=doFlush(force).catch(e=>{db.prepare('UPDATE fenys_supabase_sync SET dirty=1,error=? WHERE id=1').run(String(e.message).slice(0,220));if(clock()>=leaseUntil)leaseUntil=0;throw e;}).finally(()=>{active=null;});return active;
 }
 async function tick(){if(stopped||active)return;try{await lease();if(row().dirty&&clock()-lastAttempt>=minInterval)await flush();}catch(e){db.prepare('UPDATE fenys_supabase_sync SET error=? WHERE id=1').run(String(e.message).slice(0,220));}}
 if(autoStart){void flush(true).catch(()=>{});timer=setInterval(()=>void tick(),15000);timer.unref?.();}
 async function close(){stopped=true;if(timer)clearInterval(timer);try{if(active)await active;if(row().dirty)await flush(true);await invoke(config,'release',{holder:config.holder});}catch{}leaseUntil=0;}
 return {mark,flush,state,ready,close};
}
module.exports={ENDPOINT,LIMIT,validateAuthorization,seal,unseal,envelope,request,createSupabaseBackup};
