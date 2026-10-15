'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
test('hospedagem possui duas etapas e nenhum botao duplicado de diagnostico ou administrador',()=>{
 const html=get('src/index.html');
 const panel=html.split('id="screen-host"')[1].split('id="screen-settings"')[0];
 for(const text of ['SERVIDOR LOCAL','CONEXÃO ONLINE','host-start','host-play','host-stop','host-online-settings','google-host-activate','host-publish-form','host-invite-section'])
  assert.ok(panel.includes(text),text);
 assert.doesNotMatch(panel,/id="adminKeyPick"|id="hostDoctor"|id="host-open-services"|id="host-open-players"/);
 assert.equal((panel.match(/id="host-check"/g)||[]).length,1);
 assert.equal((panel.match(/id="host-select-admin"/g)||[]).length,1);
 assert.match(panel,/value="invite">Só quem eu convidar/);
 assert.match(panel,/value="open">Público/);
});
test('interfaces Google e comunidade continuam conectadas a IPC seguros',()=>{
 const main=get('src/main.js'),renderer=get('src/renderer.js'),wizard=get('src/host-wizard-ui.js');
 for(const id of ['host-start','host-stop','host-select-admin'])
  assert.match(wizard,new RegExp('\\$\\(\\x27'+id+'\\x27\\)\\.addEventListener\\(\\x27click'));
 for(const id of ['google-host-activate','community-publish','community-invite-send'])
  assert.match(renderer,new RegExp('\\$\\(\\x27'+id+'\\x27\\)\\.addEventListener\\(\\x27click'));
 assert.match(main,/requirePublishingServices\(await status\(\)\)/);
 assert.match(main,/status\.hostKey!==config\.publicKey/);
 assert.match(main,/if\(!servicesOwnedByLauncher\(live\)\)throw Error/);
});
test('scripts de interface continuam validos',()=>{
 for(const p of ['src/renderer.js','src/host-wizard-ui.js','src/preload.js','src/main.js'])assert.doesNotThrow(()=>new vm.Script(get(p),{filename:p}));
});

test('ligar servidor local usa backend existente sem depender de login Google',()=>{
 const main=get('src/main.js');
 assert.match(main,/ipcMain\.handle\('server:start',\(\)=>runLocked\(startAll\)\)/);
 const start=main.split('async function startAll(){')[1].split('async function killOwned(')[0];
 assert.doesNotMatch(start,/googleAuth|googlePlayer|installGoogle|supabaseAuthorizationFile/);
 const html=get('src/index.html'),panel=html.split('id="screen-host"')[1].split('id="screen-settings"')[0];
 assert.ok(panel.indexOf('id="host-start"')<panel.indexOf('id="host-online-settings"'));
 assert.match(panel,/id="host-online-settings"/);
});
