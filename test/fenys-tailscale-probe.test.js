'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseAddress,probe}=require('../src/fenys-tailscale-probe');
test('aceita somente destino Tailscale IPv4 e somente porta TCP 61000',()=>{
 assert.deepEqual(parseAddress('100.99.5.12'),{ip:'100.99.5.12',address:'100.99.5.12:61000'});
 assert.deepEqual(parseAddress('100.99.5.12:61000'),{ip:'100.99.5.12',address:'100.99.5.12:61000'});
 for(const input of ['127.0.0.1','192.168.1.1','100.128.1.2','100.99.5.12:61001','http://100.99.5.12:61000','100.99.5.999','host.ts.net']){
  assert.throws(()=>parseAddress(input),/IP Tailscale/,input);
 }
});
test('VPN offline impede consulta ao host e nao toca credenciais',async()=>{
 let calls=0;
 const result=await probe('100.99.5.12',{checkTailscale:async()=>({connected:false}),
  reach:async()=>{calls++;return true},fetchImpl:async()=>{calls++;return {}}});
 assert.equal(calls,0);
 assert.equal(result.googleReady,false);
 assert.equal(result.vpnConnected,false);
});
test('porta fechada nao e confundida com host online',async()=>{
 const result=await probe('100.99.5.12',{checkTailscale:async()=>({connected:true}),
  reach:async()=>false,fetchImpl:async()=>{throw Error('nao deveria consultar HTTP')}});
 assert.equal(result.tcpOnline,false);assert.equal(result.googleReady,false);
});
test('TCP ativo sem Google nao pode prometer multiplayer pronto',async()=>{
 const result=await probe('100.99.5.12',{checkTailscale:async()=>({connected:true}),
  reach:async()=>true,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({mode:'legacy',registered:false})})});
 assert.equal(result.tcpOnline,true);assert.equal(result.googleReady,false);
});
test('Google remoto responde sem credenciais e exige teste posterior de UDP',async()=>{
 let called=false;
 const result=await probe('100.99.5.12',{checkTailscale:async()=>({connected:true}),
  reach:async()=>true,fetchImpl:async(url,request)=>{
   called=true;
   assert.equal(url,'http://100.99.5.12:61000/launcher/google/status');
   assert.deepEqual(request.headers,{accept:'application/json'});
   assert.equal(request.method,'GET');
   return {ok:true,text:async()=>JSON.stringify({mode:'google',registered:true})};
  }});
 assert.equal(called,true);assert.equal(result.googleReady,true);
 assert.match(result.message,/UDP ainda não foram verificadas/);
});
