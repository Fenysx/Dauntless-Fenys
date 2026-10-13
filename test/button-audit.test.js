'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('src/index.html'),renderer=read('src/renderer.js'),wizard=read('src/host-wizard-ui.js'),
 preload=read('src/preload.js'),main=read('src/main.js'),javascript=renderer+'\n'+wizard;
test('todos os botões da interface têm ID único e um caminho de ação',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'IDs duplicados');
 const buttons=[...html.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(buttons.length>=55,'a auditoria não encontrou a interface completa');
 const grouped={
  start:"['start','start2']",start2:"['start','start2']",
  stop:"['stop','stop2']",stop2:"['stop','stop2']",
  restart:"['restart','restart2']",restart2:"['restart','restart2']",
  'google-public-cert':"['google-public-cert','networkCert']",
  'google-public-key':"['google-public-key','networkKey']"
 };
 for(const id of buttons){
  if(grouped[id])assert.ok(javascript.includes(grouped[id]),id+' sem handler agrupado');
  else assert.ok(javascript.includes("$('"+id+"').addEventListener('click'"),id+' sem clique');
 }
});
test('nenhum método do renderer fica sem ponte Electron',()=>{
 const exports=new Set([...preload.matchAll(/^\s*(\w+):/gm)].map(m=>m[1]));
 const calls=new Set([...javascript.matchAll(/window\.launcher\.(\w+)/g)].map(m=>m[1]));
 for(const method of calls)assert.ok(exports.has(method),'Método sem bridge: '+method);
 const channels=[...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]);
 const handled=new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m=>m[1]));
 for(const channel of channels)assert.ok(handled.has(channel)||['network:cert','network:key'].includes(channel),
  'Canal IPC não registrado: '+channel);
});
test('os botões Google e personagem são explícitos e não sobrescrevem chave antiga',()=>{
 for(const id of ['google-login','google-cancel','google-logout','google-link','google-refresh',
   'google-host-activate','google-sync','google-host-invite','community-invite-send','community-publish',
   'community-inbox-refresh','server-local-select']){
  assert.ok(html.includes('id="'+id+'"'),id+' ausente');
 }
 assert.match(main,/hostEnabled=await localGoogleEnabled\(\)/);
 assert.match(main,/caps\?\.mode==='google'&&caps\?\.registered===true/);
 assert.match(main,/managedServices:state\.owned\.includes\('metagame'\)&&state\.owned\.includes\('deploy'\)/);
 assert.match(main,/if\(!owned\.has\('metagame'\)\|\|!owned\.has\('deploy'\)\)/);
 assert.match(renderer,/r\.profileWarning/);
 assert.match(renderer,/r\.activePlayers>0/);
 assert.match(read('src/fenys-google-player.js'),/if\(!this\.profile\.linked&&!allowCreateNew\)throw Error/);
 assert.match(read('src/fenys-google-setup.js'),/compiled\.includes\('fenys-google-host\.js'\)/);
});
