'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {hostCall}=require('../src/fenys-google-cloud');

test('host Google: resposta HTML inválida produz mensagem compreensível',async()=>{
 const original=global.fetch;
 global.fetch=async()=>({ok:false,text:async()=>'<html>Bad gateway</html>'});
 try{
  await assert.rejects(()=>hostCall('192.168.1.50:61000','status'),/resposta inválida/);
 }finally{global.fetch=original;}
});

test('host Google: mensagem de erro JSON é preservada',async()=>{
 const original=global.fetch;
 global.fetch=async()=>({ok:false,text:async()=>JSON.stringify({error:'Host indisponível'})});
 try{
  await assert.rejects(()=>hostCall('192.168.1.50:61000','status'),/Host indisponível/);
 }finally{global.fetch=original;}
});
