'use strict';
const {cloud,hostCall,decodeInvite}=require('./fenys-google-cloud');
class GooglePlayer{
 constructor({auth,settings,saveSettings,request=cloud,hostRequest=hostCall}){Object.assign(this,{auth,settings,saveSettings,request,hostRequest});this.profile=null;this.busy=false;this.generation=0;}
 state(){const auth=this.auth.state(),profile=auth.signedIn?this.profile:null;return {...auth,linked:!!profile?.linked,userId:profile?.userId||null,name:profile?.name||null,revision:profile?.revision||0,server:this.settings().googleServer||null};}
 async refresh(){const generation=this.generation,authGeneration=this.auth.generation;const profile=await this.request('profile',{},await this.auth.token());if(generation!==this.generation||authGeneration!==this.auth.generation||!this.auth.state().signedIn)throw Error('A conta Google mudou. Entre novamente antes de acessar o personagem.');this.profile=profile;return this.state();}
 async credential(){await this.refresh();if(!this.profile.linked)throw Error('Vincule seu personagem ou conecte com um convite.');return this.profile.key;}
 async exclusive(fn){if(this.busy)throw Error('Aguarde a conexão Google em andamento.');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 async link(server,key){return this.exclusive(async()=>{const token=await this.auth.token();await this.hostRequest(server,'link',{key},token);return this.refresh();});}
 async connect(code,name){return this.exclusive(async()=>{
  const invite=decodeInvite(code),token=await this.auth.token(),caps=await this.hostRequest(invite.address,'status');
  if(caps.mode!=='google'||caps.hostKey!==invite.hostKey||!caps.registered)throw Error('O destino não confirmou sua integração Google.');
  await this.refresh();if(this.profile.schema&&this.profile.schema!==caps.schema)throw Error('O servidor usa uma configuração de progresso incompatível. Seu personagem foi preservado.');
  const old=this.profile.activeHost||this.settings().googleServer;if(old&&old!==invite.address){const until=Date.parse(this.profile.leaseUntil||'');try{await this.hostRequest(old,'leave',{},token);}catch(e){if(until>Date.now())throw e;}}
  await this.hostRequest(invite.address,'join',{secret:invite.secret,name:String(name||'').trim()||undefined},token);
  const c=this.settings();c.googleServer=invite.address;c.googleSelected=true;this.saveSettings(c);await this.refresh();return {...this.state(),confirmed:true};
 });}
 async home(server,{allowCreateNew=false,newName}={}){return this.exclusive(async()=>{const token=await this.auth.token();await this.refresh();if(!this.profile.linked&&!allowCreateNew)throw Error('Nenhum personagem vinculado a esta conta Google. Vincule o personagem existente no servidor de origem ou confirme explicitamente que deseja criar um personagem novo.');const creating=!this.profile.linked;const name=String(newName||'').trim();if(creating&&!/^[A-Za-z0-9_]{3,16}$/.test(name))throw Error('Escolha um nome para o primeiro personagem com 3 a 16 letras, números ou _.');if(this.profile.activeHost&&this.profile.activeHost!==server)await this.hostRequest(this.profile.activeHost,'leave',{},token);await this.hostRequest(server,'join',creating?{name}:{},token);const c=this.settings();c.googleServer=server;c.googleSelected=true;this.saveSettings(c);return this.refresh();});}
 async key(){return this.exclusive(async()=>{await this.refresh();if(!this.profile.linked)throw Error('Conecte ao servidor ou vincule seu personagem existente antes de jogar.');const server=this.settings().googleServer;if(!server)throw Error('Cole um código do servidor para escolher onde jogar.');const caps=await this.hostRequest(server,'status');if(caps.mode!=='google')throw Error('Use um servidor integrado com Google.');await this.hostRequest(server,'join',{},await this.auth.token());await this.refresh();return this.profile.key;});}
 async signOut(){return this.exclusive(async()=>{const server=this.settings().googleServer;if(server&&this.auth.state().signedIn)await this.hostRequest(server,'leave',{},await this.auth.token());this.generation++;try{await this.auth.signOut();}finally{this.profile=null;const c=this.settings();c.googleSelected=false;this.saveSettings(c);}return this.state();});}
}
module.exports={GooglePlayer};

