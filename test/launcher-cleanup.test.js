'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('interface nova oferece Tailscale privado sem reinstalar ferramentas ou fluxos legados',()=>{
 const html=read('src/index.html');
 for(const id of ['tailscale-tools','host-invite-tools','legacy-code-tools','global-central-controls','legacy-network-settings','legacy-admin-invite','community-invite-tier','host-vip-days'])
  assert.ok(!html.includes('id="'+id+'"'),'painel legado ainda no HTML: '+id);
  assert.ok(html.includes('value="tailscale"'));
  assert.ok(!html.includes('value="vip"'));
 for(const id of ['server-local-select','community-catalog','google-link','legacy-account-settings','host-google-section','community-bell'])
  assert.ok(html.includes('id="'+id+'"'),'funcao essencial ausente: '+id);
});
test('ponte IPC nao oferece mais ativadores antigos',()=>{
 const preload=read('src/preload.js'),main=read('src/main.js');
 const retired=['tailscale:install','tailscale:connect','tailscale:background','tailscale:share','connection:setup','connection:create','connection:join','global:activate','global:hostInvite','account:register','invites:create'];
 for(const item of retired){assert.ok(!preload.includes(item),'exposto '+item);assert.ok(!main.includes("ipcMain.handle('"+item+"'"),'ativo '+item);}
 assert.ok(preload.includes("ipcRenderer.invoke('google:authorization')"));
 assert.ok(main.includes("ipcMain.handle('google:authorization'"));
 assert.ok(main.includes("ipcMain.handle('google:link'"));
});
test('retencao de conta antiga e remocao de instaladores nao usados',()=>{
 const main=read('src/main.js'),guide=read('docs/LIMPEZA-2026-10-14.md');
 assert.ok(main.includes('restoreSavedKeys()'));
 assert.ok(main.includes('verifyExistingCharacterSource'));
 for(const file of ['src/fenys-tailscale.js','src/fenys-server-setup.js','src/fenys-connection-code.js','scripts/fenysx-character-preset.cjs'])
  assert.equal(fs.existsSync(path.join(root,file)),false,'arquivo obsoleto ainda presente: '+file);
 assert.match(guide,/histórico/);
});
