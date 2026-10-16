'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..','src',file),'utf8');
const html=read('index.html');
const renderer=read('renderer.js');
const wizard=read('host-wizard-ui.js');
const preload=read('preload.js');
const main=read('main.js');

test('todos os botões fixos do launcher atualizado têm uma ação de clique declarada',()=>{
 const buttons=[...html.matchAll(/<button\b[^>]*\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 assert.equal(buttons.length,51,'Mudou o número de botões; atualize o teste com a nova interface.');
 assert.equal(new Set(buttons).size,buttons.length,'Existe um botão com ID repetido.');
 const dynamic=new Set(['google-public-cert','google-public-key']);
 const source=renderer+'\n'+wizard;
 for(const id of buttons){
  if(dynamic.has(id))continue;
  const expression=new RegExp("\\$\\(['\"]"+id+"['\"]\\)\\.addEventListener\\(['\"]click['\"]");
  assert.match(source,expression,'Botão sem evento de clique: '+id);
 }
 assert.ok(!html.includes('id="screen-services"'),'Central duplicada deve ser removida.');
 assert.ok(html.includes('id="dashboard-open-host"'),'Dashboard deve levar ao host único.');
 assert.match(renderer,/for\(const \[id,fn\] of \[\['google-public-cert','networkCert'\],\['google-public-key','networkKey'\]\]\)\$\(id\)\.addEventListener\('click'/);
 assert.match(renderer,/querySelectorAll\('\[data-screen\]'\)/,'A navegação principal deve estar conectada.');
 assert.match(renderer,/button.addEventListener\('click'/,'Botões dinâmicos de comunidade devem ter handlers.');
});

test('preload expõe ações de Google e convites ligadas ao processo principal',()=>{
 const invokeChannels=[...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]);
 const handles=[...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m=>m[1]);
 const registeredDynamically=new Set(['network:cert','network:key']);
 for(const channel of invokeChannels){
  assert.ok(handles.includes(channel)||registeredDynamically.has(channel),'Ação exposta sem IPC registrado: '+channel);
 }
 assert.match(main,/\['network:cert','publicCertFile'/);
 assert.match(main,/\['network:key','publicKeyFile'/);
 for(const channel of ['google:state','google:login','google:logout','google:link','google:refresh','google:local','google:playerInvite','google:friendJoin','tailscale:status','tailscale:start','tailscale:open','tailscale:probeHost','community:join','community:invite','community:decide','host:readiness']){
  assert.ok(invokeChannels.includes(channel),'Ponte Google/convites ausente: '+channel);
  assert.ok(handles.includes(channel),'Handler Google/convites ausente: '+channel);
 }
});
