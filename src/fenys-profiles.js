'use strict';
// Local Fenys login vault. Passwords are never saved in clear text.
// This vault is a per-PC login layer; the remote Dauntless account still authenticates with UUK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const UUK = /^UUK_[a-f0-9]{48}$/i;
const HEX = /^[a-f0-9]{32}$/i;
function normalized(name) { return String(name || '').trim(); }
function checkUsername(name) {
  const value = normalized(name);
  if (!USERNAME.test(value)) throw new Error('Usuário: use de 3 a 16 letras, números ou _.');
  return value;
}
function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 256)
    throw new Error('A senha deve ter pelo menos 10 caracteres (máximo 256 bytes).');
  return password;
}
function derive(password, salt) {
  return crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64, {N: 16384, r: 8, p: 1}).toString('hex');
}
function constantEqual(a,b) {
  const x=Buffer.from(String(a),'hex'), y=Buffer.from(String(b),'hex');
  return x.length===y.length && x.length>0 && crypto.timingSafeEqual(x,y);
}
function newRecovery() {
  const code=crypto.randomBytes(20).toString('hex').toUpperCase();
  return {code:code.match(/.{1,5}/g).join('-'),digest:crypto.createHash('sha256').update(code).digest('hex')};
}
function recoveryDigest(code){
  return crypto.createHash('sha256').update(String(code||'').replace(/-/g,'').trim().toUpperCase()).digest('hex');
}
class ProfileVault {
  constructor(directory){
    this.directory=directory;
    this.file=path.join(directory,'profiles.json');
    this.currentId=null;
    this.failures=new Map();
  }
  read(){
    try{
      const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(data.version!==1||!Array.isArray(data.profiles))throw Error('Formato incorreto.');
      return data;
    }catch(e){
      if(e.code==='ENOENT')return {version:1,profiles:[]};
      throw new Error('Não foi possível ler o banco local de perfis. Faça backup antes de tentar reparar.');
    }
  }
  write(data){
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const tmp=this.file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
    try{
      fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
      fs.renameSync(tmp,this.file);
    }catch(e){try{fs.rmSync(tmp,{force:true});}catch{}throw e;}
  }
  list(){return this.read().profiles.map(x=>({id:x.id,username:x.username,role:x.role,server:x.server}));}
  current(){
    if(!this.currentId)return null;
    const p=this.read().profiles.find(x=>x.id===this.currentId);
    return p?{id:p.id,username:p.username,role:p.role,server:p.server}:null;
  }
  requireLogin(){
    const me=this.current();
    if(!me)throw new Error('Faça login em sua conta Fenys para continuar.');
    return me;
  }
  requireAdmin(){
    const me=this.requireLogin();
    if(me.role!=='admin')throw new Error('Acesso negado: apenas uma conta administradora pode controlar o servidor.');
    return me;
  }
  create({username,password,role,server,encryptedKey}){
    username=checkUsername(username);checkPassword(password);
    if(role!=='admin'&&role!=='user')throw new Error('Perfil inválido.');
    if(typeof server!=='string'||server.length>256)throw new Error('Servidor inválido.');
    if(!Buffer.isBuffer(encryptedKey)||!encryptedKey.length||encryptedKey.length>8192)throw new Error('Chave protegida inválida.');
    const db=this.read();
    if(db.profiles.some(p=>p.username.toLowerCase()===username.toLowerCase()))throw new Error('Já existe um login com esse nome neste computador.');
    const salt=crypto.randomBytes(16).toString('hex');
    const id=crypto.randomUUID();
    const recovery=newRecovery();
    const record={id,username,role,server,salt,hash:derive(password,salt),recoveryHash:recovery.digest,key:encryptedKey.toString('base64'),createdAt:new Date().toISOString()};
    db.profiles.push(record);this.write(db);
    this.currentId=id;
    return {profile:this.current(),recoveryCode:recovery.code};
  }
  login(username,password){
    username=checkUsername(username);
    const id=username.toLowerCase(), limit=this.failures.get(id);
    if(limit&&limit.until>Date.now())throw new Error('Muitas tentativas. Aguarde um minuto antes de tentar novamente.');
    const p=this.read().profiles.find(x=>x.username.toLowerCase()===id);
    if(!p||typeof password!=='string'){this.failure(id);throw new Error('Usuário ou senha incorretos.');}
    const candidate=derive(password,p.salt);
    if(!constantEqual(candidate,p.hash)){this.failure(id);throw new Error('Usuário ou senha incorretos.');}
    this.failures.delete(id);this.currentId=p.id;
    return this.current();
  }
  failure(id){
    const old=this.failures.get(id)||{count:0,until:0}, count=old.count+1;
    this.failures.set(id,{count,until:count>=5?Date.now()+60000:0});
  }
  logout(){this.currentId=null;}
  encryptedKey(){
    const me=this.requireLogin();
    const p=this.read().profiles.find(x=>x.id===me.id);
    if(!p?.key)throw new Error('Chave deste perfil não encontrada.');
    return Buffer.from(p.key,'base64');
  }
  reset(username,recoveryCode,newPassword){
    username=checkUsername(username);checkPassword(newPassword);
    const db=this.read(), p=db.profiles.find(x=>x.username.toLowerCase()===username.toLowerCase());
    if(!p||!HEX.test(p.recoveryHash)||!constantEqual(recoveryDigest(recoveryCode),p.recoveryHash))
      throw new Error('Usuário ou código de recuperação inválido.');
    const next=newRecovery();p.salt=crypto.randomBytes(16).toString('hex');p.hash=derive(newPassword,p.salt);
    p.recoveryHash=next.digest;this.write(db);this.logout();this.failures.delete(username.toLowerCase());
    return {recoveryCode:next.code};
  }
  changePassword(oldPassword,newPassword){
    const me=this.requireLogin();checkPassword(newPassword);
    const db=this.read(), p=db.profiles.find(x=>x.id===me.id);
    if(!constantEqual(derive(String(oldPassword),p.salt),p.hash))throw new Error('Senha atual incorreta.');
    p.salt=crypto.randomBytes(16).toString('hex');p.hash=derive(newPassword,p.salt);
    const recovery=newRecovery();p.recoveryHash=recovery.digest;this.write(db);
    return {recoveryCode:recovery.code};
  }
  // Unlike deleting a server account, this only removes credentials from this PC.
  forgetLocalProfile(password){
    const me=this.requireLogin();
    const db=this.read(),p=db.profiles.find(x=>x.id===me.id);
    if(!constantEqual(derive(String(password),p.salt),p.hash))throw new Error('Senha incorreta.');
    db.profiles=db.profiles.filter(x=>x.id!==me.id);this.write(db);this.logout();
  }
}
module.exports={ProfileVault,checkUsername,checkPassword,UUK};
