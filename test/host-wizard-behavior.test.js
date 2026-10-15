'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/host-wizard-ui.js'),'utf8');
function makeHarness(readiness,addresses){
 const elements=new Map();
 const elt=id=>{
  if(!elements.has(id)){
   const e={id,value:'',textContent:'',disabled:false,hidden:false,open:false,options:[],classList:{toggle(){}},events:{},addEventListener(name,fn){this.events[name]=fn;},replaceChildren(...children){this.options=children;},scrollIntoView(){}};
   if(id==='google-network-mode')e.value='lan';
   elements.set(id,e);
  }
  return elements.get(id);
 };
 const document={getElementById:elt,createElement:()=>({value:''})};
 const launcher={hostReadiness:async()=>({ok:true,...readiness}),localAddresses:async()=>({addresses})};
 const window={launcher};
 const context=vm.createContext({document,window,operating:false,action:async()=>{},setScreen:()=>{},playersRefresh:async()=>{},setInterval:()=>1});
 vm.runInContext(source,context,{filename:'host-wizard-ui.js'});
 return {elt,window};
}
const ready={servicesReady:true,managedServices:true,adminKeySelected:true,authorizationSelected:true,googleActive:false,networkMode:'lan',advertisedAddress:'',signedIn:true};
test('hospedagem libera ativacao quando ha autorizacao, administrador e IPv4 valido',async()=>{
 const {elt,window}=makeHarness(ready,['192.168.0.7','192.168.0.8']);
 await window.hostWizard.refresh();
 assert.equal(elt('google-network-address').value,'192.168.0.7:61000');
 assert.equal(elt('google-lan-ip-suggestions').options.length,2);
 assert.equal(elt('google-host-activate').disabled,false);
 assert.match(elt('host-authorization-state').textContent,/Autorização Supabase válida/);
});
test('nao ativa host sem autorizacao e mostra proxima acao',async()=>{
 const {elt,window}=makeHarness({...ready,authorizationSelected:false},['192.168.0.7']);
 await window.hostWizard.refresh();
 assert.equal(elt('google-host-activate').disabled,true);
 assert.match(elt('host-next-step').textContent,/Autorização não encontrada/);
 assert.equal(elt('host-authorization-tools').open,true);
});
test('nao ativa host com servicos externos mesmo com autorizacao valida',async()=>{
 const {elt,window}=makeHarness({...ready,managedServices:false},['192.168.0.7']);
 await window.hostWizard.refresh();
 assert.equal(elt('google-host-activate').disabled,true);
 assert.match(elt('host-next-step').textContent,/serviços estão abertos externamente/);
});
test('nao ativa Google sem IPv4 local disponivel',async()=>{
 const {elt,window}=makeHarness(ready,[]);
 await window.hostWizard.refresh();
 assert.equal(elt('google-host-activate').disabled,true);
 assert.match(elt('host-next-step').textContent,/Nenhum IPv4 local/);
});
