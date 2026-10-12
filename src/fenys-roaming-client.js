'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {parseServerAddress,requestApi}=require('./fenys-api');
const {VERSION,MAX_BYTES,identity,sign,decodeCode}=require('./fenys-roaming-protocol');
async function roamingRequest(server,route,body,key){
 const address=parseServerAddress(server).address;
 if(!['status','invite','checkout','join','leave','pulse','events','inspect'].includes(route))throw Error('Rota de conexão inválida.');
 const headers={accept:'application/json'};
 if(body!==undefined)headers['content-type']='application/json';
 if(key)headers['x-undaunted-user-api-key']=key;
 let response;
 try{response=await fetch('http://'+address+'/fenys/v1/'+route,{method:body===undefined?'GET':'POST',headers,
  body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});}
 catch{throw Error('Servidor indisponível. A transferência foi preservada; reconecte o Tailscale e use Recuperar sincronização.');}
 if(response.status===404)throw Error('Este host precisa instalar a API Fenys na aba Conectar servidor.');
 const reader=response.body.getReader();let length=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
  if(length>MAX_BYTES){await reader.cancel();throw Error('Resposta de progresso excedeu o limite.');}chunks.push(Buffer.from(value));}}
 finally{reader.releaseLock();}
 let result;try{result=JSON.parse(Buffer.concat(chunks).toString());}catch{throw Error('Resposta inválida da API de conexão.');}
 if(!response.ok)throw Error(result.error||'Não foi possível conectar ao servidor.');
 return result;
}
class RoamingClient{
 constructor({directory,protect,unprotect,request=roamingRequest}){Object.assign(this,{directory,protect,unprotect,request});this.locked=false;}
 file(profile){return path.join(this.directory,profile.id+'.bin');}
 read(profile){try{return JSON.parse(this.unprotect(fs.readFileSync(this.file(profile))));}catch(e){if(e.code==='ENOENT')return null;throw Error('Não foi possível abrir seu progresso protegido. Preserve o arquivo e use o mesmo usuário do sistema.');}}
 write(profile,data){
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  const dest=this.file(profile),tmp=dest+'.tmp';
  const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,this.protect(JSON.stringify(data)));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,dest);
 }
 state(profile){const s=this.read(profile);return {server:s?.active?.server||profile.server,home:s?.home||profile.server,
  connected:!!s?.active&&s.active.server!==s.home,pending:s?.pending?.operation||null,revision:s?.snapshot?.revision||0,portable:!!s};}
 key(profile,fallback){const s=this.read(profile);if(s?.pending)throw Error('Sincronização pendente. Recupere o progresso antes de jogar.');return s?.active?.gameKey||fallback;}
 async exclusive(fn){if(this.locked)throw Error('Já existe uma conexão ou sincronização em andamento.');this.locked=true;try{return await fn();}finally{this.locked=false;}}
 async prepare(profile,key){
  let s=this.read(profile);if(s)return s;
  const caps=await this.request(profile.server,'status');if(caps.version!==VERSION)throw Error('Versão de conexão incompatível.');
  const me=await requestApi(profile.server,'/undaunted/api/GetUserInfo',{key});
  if(typeof me.UserId!=='string')throw Error('A origem não reconheceu sua identidade de jogador.');
  s={...identity(),userId:me.UserId,home:profile.server,snapshot:null,active:null,
   pending:{operation:'checkout',server:profile.server,requestId:crypto.randomUUID()}};
  this.write(profile,s);return s;
 }
 envelope(s,p){return sign(s,{version:VERSION,userId:s.userId,...p});}
 async resume(profile,key){
  const s=this.read(profile);if(!s?.pending)return s;
  const pending=s.pending;
  const result=await this.request(pending.server,pending.operation,this.envelope(s,pending),pending.operation==='checkout'?key:undefined);
  if(pending.operation==='join'){
   if(result.session!==pending.session||result.userId!==s.userId)throw Error('O destino não confirmou sua sessão.');
   s.active={server:pending.server,session:pending.session,gameKey:pending.gameKey,cursor:result.cursor||0};
  }else{
   const snap=result.snapshot;
   if(!snap||snap.userId!==s.userId||snap.publicKey!==s.publicKey||!Number.isSafeInteger(snap.revision)||snap.revision<1||snap.revision<=(s.snapshot?.revision||0))
    throw Error('O servidor não confirmou uma versão nova do seu progresso.');
   s.snapshot=snap;s.active=null;
  }
  s.pending=null;this.write(profile,s);return s;
 }
 async leave(profile,key){
  let s=await this.resume(profile,key);if(!s?.active)return s;
  s.pending={operation:'leave',server:s.active.server,session:s.active.session,requestId:crypto.randomUUID()};
  this.write(profile,s);return this.resume(profile,key);
 }
 async open(profile,key,server,secret){
  let s=await this.leave(profile,key);
  s.pending={operation:'join',server,session:crypto.randomUUID(),requestId:crypto.randomUUID(),snapshot:s.snapshot,
   secret:secret||null,gameKey:server===s.home?key:'UUK_'+crypto.randomBytes(24).toString('hex')};
  this.write(profile,s);return this.resume(profile,key);
 }
 async settleJoin(profile,key){
  const s=this.read(profile);if(s?.pending?.operation!=='join')return s;
  const current=await this.request(s.pending.server,'inspect',this.envelope(s,{operation:'inspect',requestId:crypto.randomUUID()}));
  if(current.active)return this.resume(profile,key);
  if(current.revision>s.pending.snapshot.revision)throw Error('Há um progresso mais recente no destino. Preserve a transferência e recupere a sessão naquele host.');
  s.pending=null;this.write(profile,s);return s;
 }
 async connect(profile,key,code){return this.exclusive(async()=>{
  const invite=decodeCode(code);
  // Verify destination capability BEFORE freezing or leaving the current host.
  const caps=await this.request(invite.address,'status');if(caps.version!==VERSION)throw Error('API incompatível.');
  let s=await this.prepare(profile,key);
  if(s.pending?.operation==='join')s=await this.settleJoin(profile,key);
  if(s.snapshot&&caps.schema!==s.snapshot.schema)throw Error('Os hosts precisam usar o mesmo esquema de progresso do Metagame.');
  s=await this.resume(profile,key);
  if(caps.schema!==s.snapshot.schema)throw Error('Esquema de progresso incompatível. Retorne ao servidor original.');
  if(s.active?.server===invite.address)return this.state(profile);
  await this.open(profile,key,invite.address,invite.secret);return this.state(profile);
 });}
 async home(profile,key){return this.exclusive(async()=>{
  const existing=this.read(profile);if(!existing)return this.state(profile);
  await this.settleJoin(profile,key);
  const s=await this.resume(profile,key);
  if(s.active?.server!==s.home)await this.open(profile,key,s.home,null);
  return this.state(profile);
 });}
 async recover(profile,key){return this.exclusive(async()=>{await this.resume(profile,key);return this.state(profile);});}
 async poll(profile){
  if(this.locked)return null;
  const s=this.read(profile);if(!s?.active||s.pending)return null;
  const data=await this.request(s.active.server,'pulse',this.envelope(s,{operation:'pulse',requestId:crypto.randomUUID(),session:s.active.session,cursor:s.active.cursor}));
  // Do not overwrite a connection operation or another profile's changes while polling.
  const latest=this.read(profile);
  if(!this.locked&&latest?.active?.session===s.active.session&&!latest.pending){
   latest.active.cursor=data.events?.length?data.events.at(-1).id:s.active.cursor;this.write(profile,latest);
  }
  return data;
 }
}
module.exports={RoamingClient,roamingRequest};
