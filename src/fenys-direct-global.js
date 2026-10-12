'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {CloudClient}=require('./fenys-cloud-client');
const {identity,sign,call,decodeCode}=require('./fenys-cloud-protocol');
class DirectGlobal{
 constructor({directory,protect,unprotect,settings,invoke=call}){Object.assign(this,{directory,protect,unprotect,settings,invoke});this.cloud=new CloudClient({directory:path.join(directory,'sessions'),protect,unprotect,request:invoke});}
 file(){return path.join(this.directory,'account.bin');}
 hasKey(){return fs.existsSync(this.file());}
 key(){const value=this.unprotect(fs.readFileSync(this.file()));if(!/^UUK_[a-f0-9]{48}$/i.test(value))throw Error('Chave global inválida.');return value;}
 adopt(key,home){if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw Error('Chave de jogo inválida.');fs.mkdirSync(this.directory,{recursive:true,mode:0o700});const file=this.file(),temp=file+'.tmp';fs.writeFileSync(temp,this.protect(key),{mode:0o600});fs.renameSync(temp,file);fs.writeFileSync(path.join(this.directory,'home.json'),JSON.stringify({server:home}),{mode:0o600});}
 profile(){let server=this.settings().cloudAuthority;try{server=JSON.parse(fs.readFileSync(path.join(this.directory,'home.json'))).server||server;}catch{}return {id:crypto.createHash('sha256').update(this.key()).digest('hex'),server:server||'127.0.0.1:61000'};}
 state(){return this.hasKey()?this.cloud.state(this.profile()):{global:false,server:null,pending:false};}
 ready(){if(this.hasKey())this.cloud.requireReady(this.profile());}
 async connect(code){return this.cloud.connect(this.profile(),this.key(),code);}
 async home(authority){return this.cloud.home(this.profile(),this.key(),authority||this.settings().cloudAuthority);}
 async recover(){return this.cloud.recover(this.profile(),this.key());}
 async register(code,name){
  const invite=decodeCode(code);if(invite.kind!=='player')throw Error('Use um código de jogador.');
  const file=path.join(this.directory,'registration.bin');fs.mkdirSync(this.directory,{recursive:true,mode:0o700});let pair;
  try{pair=JSON.parse(this.unprotect(fs.readFileSync(file)));}catch(e){if(e.code!=='ENOENT')throw e;pair=identity();fs.writeFileSync(file,this.protect(JSON.stringify(pair)),{mode:0o600});}
  const result=await this.invoke(invite.authority,'register-player',sign(pair,{operation:'register-player',realm:invite.realm,hostId:invite.hostId,secret:invite.secret,name:String(name||'').trim(),requestId:crypto.randomUUID(),time:Date.now()}));
  this.adopt(result.key,invite.authority);fs.rmSync(file,{force:true});return result;
 }
 async poll(){if(!this.hasKey())return null;return this.cloud.poll(this.profile(),this.key());}
}
module.exports={DirectGlobal};
