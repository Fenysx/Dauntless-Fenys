'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inviteStatus,createInvite}=require('../src/fenys-api');
function mock(routes){
 const original=global.fetch;
 const calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});const key=new URL(url).pathname;const entry=routes[key];if(!entry)return {ok:false,status:404,text:async()=>JSON.stringify({})};return {ok:entry.status===undefined||entry.status<400,status:entry.status||200,text:async()=>JSON.stringify(entry.body||{})};};
 return {calls,restore:()=>{global.fetch=original;}};
}
test('lê o modo de cadastro do Metagame',async()=>{
 const m=mock({'/undaunted/api/RegistrationStatus':{body:{RegistrationMode:'INVITECODE'}}});
 try{assert.deepEqual(await inviteStatus('127.0.0.1:61000'),{online:true,registrationMode:'INVITECODE'});}finally{m.restore();}
});
test('recusa convite quando a chave não é administradora',async()=>{
 const m=mock({'/undaunted/api/GetUserInfo':{body:{Username:'Jogador',IsAdmin:false}}});
 try{await assert.rejects(()=>createInvite('127.0.0.1:61000','chave-teste','amigo'),/administradora/);assert.equal(m.calls.length,1);}finally{m.restore();}
});
test('gera convite de uso único com chave administradora',async()=>{
 const m=mock({
  '/undaunted/api/GetUserInfo':{body:{Username:'Fenys',IsAdmin:true}},
  '/undaunted/api/RegistrationStatus':{body:{RegistrationMode:'INVITECODE'}},
  '/undaunted/api/CreateInvite':{body:{code:'FENYS-1234'}}
 });
 try{assert.deepEqual(await createInvite('127.0.0.1:61000','chave-teste','Amigo'),{code:'FENYS-1234',uses:1});
  const last=m.calls[2];assert.equal(last.options.method,'POST');assert.equal(last.options.headers['x-undaunted-user-api-key'],'chave-teste');
  assert.deepEqual(JSON.parse(last.options.body),{uses:1,name:'Amigo'});}finally{m.restore();}
});
