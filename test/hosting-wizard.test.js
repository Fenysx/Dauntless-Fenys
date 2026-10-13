'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const load=name=>fs.readFileSync(path.join(root,name),'utf8');

test('hosting wizard contains local, public-PC and future VPS paths',()=>{
 const html=load('src/index.html');
 for(const mode of ['lan','internet','vps'])assert.match(html,new RegExp('<option value="'+mode+'">'));
 for(const id of ['hosting-wizard','hosting-start','hosting-check','hosting-admin-key','hosting-authorization',
   'hosting-lan-ip','hosting-https','hosting-public-ip','hosting-cert','hosting-private-key','hosting-activate',
   'hosting-publish','hosting-server-name','hosting-server-policy','hosting-owned-server','hosting-send-invite',
   'hosting-friend','hosting-advanced-open'])assert.ok(html.includes('id="'+id+'"'),'Missing UI element '+id);
 assert.match(html,/Privado — somente convidados pelo Google/);
 assert.doesNotMatch(html,/<input[^>]+id="hosting-password"/);
});

test('hosting wizard calls real guarded IPC APIs and preserves account protections',()=>{
 const main=load('src/main.js'),renderer=load('src/renderer.js'),preload=load('src/preload.js');
 assert.match(main,/ipcMain\.handle\('hosting:readiness'/);
 assert.match(main,/googleHostCall\('127\.0\.0\.1:61000','status'\)/);
 assert.match(preload,/hostingReadiness:\(\)=>ipcRenderer\.invoke\('hosting:readiness'\)/);
 assert.match(renderer,/window\.launcher\.googleActivate\(/);
 assert.match(renderer,/window\.launcher\.communityPublish\(/);
 assert.match(renderer,/window\.launcher\.communityInvite\(/);
 assert.match(renderer,/r\.adminKeySelected/);
 assert.match(renderer,/r\.authorizationSelected/);
 assert.match(renderer,/window\.confirm\('Todos devem estar fora do jogo/);
 assert.match(renderer,/window\.launcher\.hostDoctor\(/);
 assert.doesNotMatch(renderer,/hosting-password/);
});

test('main, preload and renderer remain valid JavaScript',()=>{
 for(const file of ['src/main.js','src/preload.js','src/renderer.js']){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,file+': '+result.stderr);
 }
});
