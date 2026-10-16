'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validTailIP,adapters,parseStatus,inspect}=require('../src/fenys-tailscale');
const interfaces={
 Tailscale:[{family:'IPv4',address:'100.86.12.34',internal:false}],
 WiFi:[{family:'IPv4',address:'192.168.1.20',internal:false}],
 Virtual:[{family:'IPv4',address:'100.88.1.2',internal:false}]
};
test('aceita somente enderecos IPv4 do Tailscale 100.64.0.0/10',()=>{
 for(const ip of ['100.64.0.1','100.86.12.34','100.127.255.254'])assert.equal(validTailIP(ip),true);
 for(const ip of ['100.63.0.1','100.128.0.1','192.168.1.20','127.0.0.1','::1','test.invalid'])assert.equal(validTailIP(ip),false);
 assert.deepEqual(adapters(interfaces),['100.86.12.34']);
});
test('requer daemon Running e IP correspondente ao adaptador do host',()=>{
 const status={BackendState:'Running',Self:{TailscaleIPs:['100.86.12.34']}};
 assert.equal(parseStatus(status,adapters(interfaces)).connected,true);
 assert.equal(parseStatus({...status,BackendState:'Stopped'},adapters(interfaces)).connected,false);
 assert.equal(parseStatus({...status,Self:{TailscaleIPs:['100.88.1.2']}},adapters(interfaces)).connected,false);
});
test('inspecao nao inventa conexao apenas porque existe adaptador virtual',async()=>{
 const mock=(_binary,_args,_opts,callback)=>callback(null,JSON.stringify({BackendState:'NeedsLogin',Self:{TailscaleIPs:['100.86.12.34']}}));
 const state=await inspect({interfaces,execFileImpl:mock,platform:'linux'});
 assert.equal(state.connected,false);
 assert.equal(state.address,null);
 assert.equal(state.installed,true);
});
test('inspecao recupera IP verificado por status --json, sem token nem senha',async()=>{
 let calls=0;
 const mock=(_binary,args,_opts,callback)=>{calls++;assert.deepEqual(args,['status','--json']);callback(null,JSON.stringify({BackendState:'Running',Self:{TailscaleIPs:['100.86.12.34']},Peer:{secret:'nunca-exibir'}}));};
 const state=await inspect({interfaces,execFileImpl:mock,platform:'linux'});
 assert.equal(state.connected,true);
 assert.equal(state.address,'100.86.12.34');
 assert.equal(calls,1);
 assert.equal(JSON.stringify(state).includes('nunca-exibir'),false);
});
test('sem CLI funcional nao anuncia host pronto',async()=>{
 const state=await inspect({interfaces,platform:'linux',execFileImpl:(_x,_a,_o,cb)=>cb(Error('binario ausente'))});
 assert.equal(state.connected,false);
 assert.equal(state.installed,false);
});
