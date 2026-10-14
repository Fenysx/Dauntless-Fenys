'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyExistingCharacterSource}=require('../src/fenys-google-link-guard');
const account={UserId:'UID-3f29078d-3397-4df1-9561-2fb0800b3a21',Username:'PersonagemExistente',IsAdmin:false};

test('a chave de uma conta existente é verificada antes de criar vínculo Google',async()=>{
 const order=[];
 const result=await verifyExistingCharacterSource({
  checkHost:async()=>{order.push('host');return {mode:'google',registered:true};},
  checkAccount:async()=>{order.push('account');return account;}
 });
 assert.deepEqual(order,['host','account']);
 assert.deepEqual(result,{userId:account.UserId,name:account.Username});
 assert.equal(Object.keys(result).includes('key'),false);
});

test('rota Google ausente ou host não registrado bloqueiam vinculação sem consultar chave',async()=>{
 for(const checkHost of [async()=>{throw Error('404');},async()=>({mode:'legacy',registered:false}),async()=>({mode:'google',registered:false})]){
  let checked=false;
  await assert.rejects(verifyExistingCharacterSource({checkHost,checkAccount:async()=>{checked=true;return account;}}),/Google|integração/);
  assert.equal(checked,false);
 }
});

test('chave incorreta ou resposta incompleta impedem vínculo silencioso',async()=>{
 const checkHost=async()=>({mode:'google',registered:true});
 await assert.rejects(verifyExistingCharacterSource({checkHost,checkAccount:async()=>{throw Error('401');}}),/chave original/);
 for(const invalid of [{},null,{UserId:account.UserId,Username:''},{UserId:'outro',Username:'Fenysx'}]){
  await assert.rejects(verifyExistingCharacterSource({checkHost,checkAccount:async()=>invalid}),/não confirmou a identidade/);
 }
});

test('ativação só conclui quando as rotas Google estão online e host registrado',async()=>{
 const {confirmGoogleRuntime}=require('../src/fenys-google-link-guard');
 let count=0;
 const confirmed=await confirmGoogleRuntime({
  expectedAddress:'192.168.1.20:61000',
  checkHost:async()=>{count++;return count===1?{mode:'google',registered:false}:{mode:'google',registered:true,address:'192.168.1.20:61000'};},
  attempts:3,delay:async()=>{}
 });
 assert.equal(confirmed,true);assert.equal(count,2);
});
test('ativação rejeita rota ausente, host não registrado ou endereço diferente',async()=>{
 const {confirmGoogleRuntime}=require('../src/fenys-google-link-guard');
 for(const checkHost of [async()=>{throw Error('Unstubbed route');},
  async()=>({mode:'google',registered:false}),
  async()=>({mode:'google',registered:true,address:'192.168.1.99:61000'})]){
  await assert.rejects(confirmGoogleRuntime({checkHost,expectedAddress:'192.168.1.20:61000',attempts:2,delay:async()=>{}}),/não confirmou/);
 }
});
