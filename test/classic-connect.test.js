'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeConnectCode,parseConnectCode,checkConnection,checkExistingCharacter}=require('../src/fenys-connect');
test('gera código de conexão contendo Tailscale e convite, sem chave de jogador',()=>{
 const code=makeConnectCode('100.100.101.102:61000','ABCD-1234-EFGH');
 assert.match(code,/^FENYS1\./);
 assert.deepEqual(parseConnectCode(code),{server:'100.100.101.102:61000',invite:'ABCD-1234-EFGH'});
 assert.equal(code.includes('UUK_'),false);
});
test('recusa localhost e códigos alterados',()=>{
 assert.throws(()=>makeConnectCode('127.0.0.1:61000','ABCD-1234-EFGH'),/Tailscale/);
 const code=makeConnectCode('100.100.101.102:61000','ABCD-1234-EFGH');
 assert.throws(()=>parseConnectCode(code.slice(0,-1)+(code.endsWith('F')?'0':'F')),/incompleto|alterado/);
});
test('usa Metagame real para verificar servidor e chave do personagem',async()=>{
 const before=global.fetch;const calls=[];
 global.fetch=async(url,options)=>{
  calls.push({url,options});
  const route=new URL(url).pathname;
  const response=route.endsWith('ServerStatus')
   ?{online:true,name:'Fenys do Ygor'}:{Username:'Ygor',UserId:'UID-12345678-abcd'};
  return {ok:true,status:200,text:async()=>JSON.stringify(response)};
 };
 try{
  assert.deepEqual(await checkConnection('100.100.101.102:61000'),{name:'Fenys do Ygor',server:'100.100.101.102:61000',online:true});
  assert.deepEqual(await checkExistingCharacter('100.100.101.102:61000','UUK_test'),{username:'Ygor',userId:'UID-12345678-abcd'});
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.headers['x-undaunted-user-api-key'],'UUK_test');
 }finally{global.fetch=before;}
});
