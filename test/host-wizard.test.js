'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
test('new hosting UI and preload parse as JavaScript',()=>{
 for(const file of ['src/renderer.js','src/host-wizard-ui.js','src/preload.js','src/main.js'])
  assert.doesNotThrow(()=>new vm.Script(source(file),{filename:file}),file);
});
test('hosting controls are unique and only visible in their guided workflow',()=>{
 const html=source('src/index.html');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'duplicated id attribute');
 for(const id of ['screen-host','host-start','host-check','host-select-admin','host-local-state',
  'host-overview','host-next-step','google-host-activate','google-network-address','host-publish-form',
  'host-invite-section','community-invite-send','host-authorization-tools','admin-server-settings']){
  assert.ok(ids.includes(id),'missing '+id);
 }
 assert.ok(html.includes('src="host-wizard-ui.js"'));
 assert.ok(html.indexOf('src="host-wizard-ui.js"')>html.indexOf('src="renderer.js"'));
 assert.ok(html.includes('id="host-publish-form" hidden'));
 assert.ok(html.includes('id="host-invite-section" hidden'));
});
test('live host checks gate sensitive operations, not a stored setting alone',()=>{
 const main=source('src/main.js'),preload=source('src/preload.js'),wizard=source('src/host-wizard-ui.js');
 assert.match(main,/ipcMain\.handle\('host:readiness'/);
 assert.match(main,/googleHostCall\('127\.0\.0\.1:61000','status'\)/);
 assert.match(main,/googleActive=googleReachable&&caps\.registered===true/);
 assert.match(preload,/hostReadiness:\(\)=>ipcRenderer\.invoke\('host:readiness'\)/);
 assert.match(wizard,/r\.servicesReady&&r\.managedServices&&r\.adminKeySelected&&authorization&&addressOK&&needsActivation/);
 assert.match(wizard,/r\.servicesReady&&r\.googleActive&&r\.networkMode==='public'&&r\.signedIn/);
 assert.match(main,/assertGameClosed\(\);requirePublishingServices\(await status\(\)\);/);
 assert.match(wizard,/\$\('host-invite-section'\)\.hidden=!canPublish\|\|!hasOwn/);
 assert.doesNotMatch(wizard,/\baccount\.key\b|service_role/);
});

test('Google host setup requires ownership of both live services, not just one',()=>{
 const main=source('src/main.js');
 assert.match(main,/managedServices:servicesOwnedByLauncher\(state\)/);
 assert.match(main,/const live=await status\(\);if\(!servicesOwnedByLauncher\(live\)\)throw Error\(/);
 assert.match(main,/verifyLegacyHostIdle\(\(\)=>cloudRequest\('127\.0\.0\.1:61000','events'/);
});
