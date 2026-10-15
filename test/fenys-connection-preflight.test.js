'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const EventEmitter=require('node:events');
const crypto=require('node:crypto');
const {localNetworks,readStunResponse,publicIPv4,resetConnectionPreferences}=require('../src/fenys-connection-preflight');
test('prefere Wi-Fi real a redes virtuais sem ler dados pessoais',()=>{
 const interfaces={
  'vEthernet (Default Switch)':[{family:'IPv4',address:'192.168.50.1',internal:false}],
  'Wi-Fi':[{family:'IPv4',address:'192.168.1.20',internal:false}],
  Loopback:[{family:'IPv4',address:'127.0.0.1',internal:true}],
  Tailscale:[{family:'IPv4',address:'100.70.1.9',internal:false}]
 };
 assert.deepEqual(localNetworks(interfaces).map(x=>x.address),['192.168.1.20','192.168.50.1']);
});
function fakeStun(transaction,ip){
 const bytes=ip.split('.').map(Number),b=Buffer.alloc(32);
 b.writeUInt16BE(0x0101,0);b.writeUInt16BE(12,2);b.writeUInt32BE(0x2112a442,4);transaction.copy(b,8);
 b.writeUInt16BE(0x0020,20);b.writeUInt16BE(8,22);b[25]=1;
 for(let i=0;i<4;i++)b[28+i]=bytes[i]^([0x21,0x12,0xa4,0x42][i]);
 return b;
}
test('resposta STUN so e aceita com transaction ID correto',()=>{
 const token=crypto.randomBytes(12),msg=fakeStun(token,'200.160.2.34');
 assert.equal(readStunResponse(msg,token),'200.160.2.34');
 assert.equal(readStunResponse(msg,crypto.randomBytes(12)),null);
 assert.equal(readStunResponse(Buffer.from('texto'),token),null);
});
test('detecta IP de saida por STUN simulado, sem exigir abrir portas',async()=>{
 const socket=new EventEmitter();socket.close=()=>{};socket.send=(request,port,host,cb)=>{
  assert.equal(port,19302);assert.equal(host,'8.8.8.8');
  const response=fakeStun(request.subarray(8,20),'200.160.2.34');
  queueMicrotask(()=>{socket.emit('message',response);cb(null);});
 };
 assert.equal(await publicIPv4({lookup:async()=>({address:'8.8.8.8'}),socketFactory:()=>socket,timeout:100}),'200.160.2.34');
});
test('limpeza nao apaga conta Google, saves, chaves ou estado de host ativo',()=>{
 const prefs={repoPath:'c:/game',adminKeyFile:'admin.key',gameKeyFile:'account.key',accountFiles:{x:'account.key'},
  googleHost:true,googleHostAddress:'192.168.1.8:61000',googleNetworkMode:'lan',
  googleSelected:true,googleServer:'192.168.1.8:61000',cloudRole:'host',cloudAuthority:'old',
  supabaseAuthorizationFile:'auth.json',gameServer:'100.70.1.8:61000',tailscaleAddress:'100.70.1.8:61000'};
 const {config,removed}=resetConnectionPreferences(prefs,{hasActiveGoogleHost:true});
 assert.deepEqual(removed,['tailscaleAddress']);
 for(const key of Object.keys(prefs).filter(k=>k!=='tailscaleAddress'))
  assert.deepEqual(config[key],prefs[key],key);
 assert.ok(!Object.hasOwn(prefs,'unrelated'));
});
test('servidor sem identidade ativa pode voltar ao endereco local sem apagar contas',()=>{
 const prefs={gameServer:'100.70.1.8:61000',adminKeyFile:'admin.key',accountFiles:{local:'account.key'}};
 const {config,removed}=resetConnectionPreferences(prefs);
 assert.equal(config.gameServer,'127.0.0.1:61000');
 assert.equal(config.adminKeyFile,'admin.key');
 assert.deepEqual(config.accountFiles,prefs.accountFiles);
 assert.equal(removed.length,1);
});
