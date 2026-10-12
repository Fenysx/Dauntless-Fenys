'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {call,decodeCode}=require('./fenys-cloud-protocol');
class CloudClient{
 constructor({directory,protect,unprotect,request=call}){Object.assign(this,{directory,protect,unprotect,request});this.busy=false;}
 file(p){return path.join(this.directory,p.id+'.bin');}
 read(p){try{return JSON.parse(this.unprotect(fs.readFileSync(this.file(p))));}catch(e){if(e.code==='ENOENT')return null;throw Error('Não foi possível ler sua conexão global protegida.');}}
 write(p,s){fs.mkdirSync(this.directory,{recursive:true,mode:0o700});const dest=this.file(p),tmp=dest+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,this.protect(JSON.stringify(s)));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,dest);}
 state(p){const s=this.read(p);return {global:!!s,authority:s?.authority||null,realm:s?.realm||null,server:s?.active?.address||p.server,hostId:s?.active?.hostId||null,pending:!!s?.pending};}
 requireReady(p){const s=this.read(p);if(s?.pending)throw Error('Conexão pendente. Recupere a confirmação antes de iniciar o jogo.');return s;}
 async exclusive(fn){if(this.busy)throw Error('Aguarde a conexão global em andamento.');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async finish(p,key){const s=this.read(p);if(!s?.pending)return s;
  const result=await this.request(s.authority,'join',s.pending,key);
  if(result.session!==s.pending.session||result.realm!==s.realm)throw Error('A rede global não confirmou a conexão.');
  s.active=result;s.pending=null;s.cursor=null;this.write(p,s);return s;
 }
 async connect(p,key,code){return this.exclusive(async()=>{
  const invite=decodeCode(code);if(invite.kind!=='player')throw Error('Este é um código para ativar um host. Use o código de jogador.');
  const caps=await this.request(invite.authority,'status');if(caps.realm!==invite.realm)throw Error('O código não corresponde à autoridade central.');
  const destination=await this.request(invite.address,'status');if(destination.realm!==invite.realm||destination.hostId!==invite.hostId)throw Error('O host não está conectado à rede global do convite.');
  let s=this.read(p);
  if(s?.pending){await this.finish(p,key);s=this.read(p);}
  if(s&&s.realm!==invite.realm)throw Error('Este perfil já pertence a outra rede global.');
  if(s?.active?.hostId===invite.hostId)return this.state(p);
  s={authority:invite.authority,realm:invite.realm,active:s?.active||null,cursor:null,pending:{realm:invite.realm,hostId:invite.hostId,secret:invite.secret,session:crypto.randomUUID()}};
  this.write(p,s);await this.finish(p,key);return this.state(p);
 });}
 async home(p,key,authority){return this.exclusive(async()=>{
  let s=this.read(p);
  if(s?.pending){
   const inspect=await this.request(s.authority,'inspect',{},key);
   if(inspect.session===s.pending.session)await this.finish(p,key);
   else{s.pending=null;this.write(p,s);}
   s=this.read(p);
  }
  const server=s?.authority||authority||p.server,caps=await this.request(server,'status');
  if(caps.role!=='authority')throw Error('Informe o endereço do PC central para iniciar sua conta global.');
  if(s?.active?.hostId==='central')return this.state(p);
  s={authority:caps.authority,realm:caps.realm,active:s?.active||null,cursor:null,pending:{realm:caps.realm,hostId:'central',secret:null,session:crypto.randomUUID()}};
  this.write(p,s);await this.finish(p,key);return this.state(p);
 });}
 async recover(p,key){return this.exclusive(async()=>{await this.finish(p,key);return this.state(p);});}
 async poll(p,key){
  if(this.busy)return null;const s=this.read(p);if(!s?.active||s.pending)return null;
  const result=await this.request(s.authority,'pulse',{session:s.active.session,cursor:s.cursor},key);
  const current=this.read(p);if(!this.busy&&current?.active?.session===s.active.session&&!current.pending){current.cursor=result.cursor;this.write(p,current);}return result;
 }
}
module.exports={CloudClient};
