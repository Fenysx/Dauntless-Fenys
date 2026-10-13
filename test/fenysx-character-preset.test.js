'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {parseArgs,storeUnlockPlan,maxProgression,mergeStacks,mergeInstances,verifyRealProgression,isListeningOnLoopback,RAMS,PLATINUM,LEVEL_CAP}=require('../scripts/fenysx-character-preset.cjs');
const native='server/upstream/UndauntedMetagame/src/vendor/';
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'..',native,'store_catalog.json')));
const kinds=JSON.parse(fs.readFileSync(path.join(__dirname,'..',native,'store_item_kinds.json')));
const tracks=JSON.parse(fs.readFileSync(path.join(__dirname,'..',native,'progression_config.json')));

test('Fenysx default is a dry run and apply needs explicit identity/offline confirmation',()=>{
 assert.deepEqual(parseArgs(['--db','C:/server.sqlite','--metagame','C:/server']),{'db':'C:/server.sqlite',metagame:'C:/server'});
 assert.equal(parseArgs(['--apply','--server-stopped','--confirm','Fenysx']).apply,true);
 assert.throws(()=>parseArgs(['--apply','--unknown']),/Argumento/);
 assert.equal(RAMS,1_000_000_000_000);
 assert.equal(PLATINUM,10_000_000_000_000);
 assert.ok(Number.isSafeInteger(RAMS)&&Number.isSafeInteger(PLATINUM));
});
test('all storefront 1.4.4 one-time items and entitlement names resolve to known kinds',()=>{
 const plan=storeUnlockPlan(catalog,kinds);
 assert.ok(plan.stacked.size>40&&plan.instanced.size>100);
 assert.ok(plan.entitlements.size>=10);
 assert.equal(plan.stacked.has('TOKEN_BOUNTY_DRAFT_PREMIUM'),false,'repeatable consumable is not a permanent store unlock');
 for(const id of plan.stacked.keys())assert.equal(kinds[id],'stacked');
 for(const id of plan.instanced.keys())assert.equal(kinds[id],'instanced');
 for(const name of plan.entitlements)assert.match(name,/^\w+/);
});
test('balances are exact but store cosmetics never reduce existing inventory',()=>{
 const originals=[{catalogId:'CURRENCY_NOTES',quantity:5},{catalogId:'AR_IRON_HELM',quantity:4}];
 const plan=new Map([['CURRENCY_NOTES',RAMS],['CURRENCY_PLATINUM_UNIV',PLATINUM],['AR_IRON_HELM',1]]);
 const merged=mergeStacks(originals,plan,new Set(['CURRENCY_NOTES','CURRENCY_PLATINUM_UNIV']));
 assert.equal(merged.find(s=>s.catalogId==='CURRENCY_NOTES').quantity,RAMS);
 assert.equal(merged.find(s=>s.catalogId==='CURRENCY_PLATINUM_UNIV').quantity,PLATINUM);
 assert.equal(merged.find(s=>s.catalogId==='AR_IRON_HELM').quantity,4);
 assert.equal(originals.find(s=>s.catalogId==='CURRENCY_NOTES').quantity,5);
});
test('existing instanced items keep IDs and missing store cosmetics get supported format',()=>{
 const old={catalogId:'WP_EB_UNSEEN_00',instanceId:'retain-me',updateVersion:12,itemData:'{"foo":1}'};
 const merged=mergeInstances([old],new Set(['WP_EB_UNSEEN_00','WP_EB_BLACKCAT_00']));
 assert.equal(merged[0].instanceId,'retain-me');
 assert.equal(merged.length,2);
 assert.equal(merged[1].instanceId.length,32);
 assert.equal(merged[1].updateVersion,0);
 assert.equal(crypto.randomBytes(16).length,16);
});
test('max mastery is level 50 in client 1.4.4, not incorrectly labeled level 100',()=>{
 const paths=maxProgression(tracks);
 assert.equal(paths.length,tracks.payload.paths.length);
 const slayer=paths.find(p=>p.progressionId==='MasteryTrack_PlayerLevel');
 assert.equal(slayer.rank,LEVEL_CAP);
 assert.equal(LEVEL_CAP,50);
 assert.ok(slayer.progress>0);
});
test('invalid inputs are rejected before any database mutation',()=>{
 assert.throws(()=>mergeStacks([],new Map([['CURRENCY_NOTES',Number.MAX_SAFE_INTEGER+1]])),/Quantidade inválida/);
 assert.throws(()=>mergeStacks([{catalogId:'A',quantity:1},{catalogId:'A',quantity:2}],new Map([['A',5]])),/duplicada/);
 assert.throws(()=>storeUnlockPlan({webstore:[{id:'unknown',items:[{catalogId:'bad',quantity:1}]}]},{}),/Tipo desconhecido/);
});

test('offline preset requires actual Metagame real progression and never accepts stub',()=>{
 const os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenysx-preset-env-'));
 try{
  fs.writeFileSync(path.join(dir,'.env'),'PROGRESSION_MODE=stub\n');
  assert.throws(()=>verifyRealProgression(dir),/PROGRESSION_MODE=stub/);
  fs.writeFileSync(path.join(dir,'.env'),'PROGRESSION_MODE=real\n');
  assert.equal(verifyRealProgression(dir),'real');
  fs.writeFileSync(path.join(dir,'.env'),'BIND_HOST=127.0.0.1\n');
  assert.equal(verifyRealProgression(dir),'real','real is the default when unset');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('detect a live local port before permitting an offline character save',async()=>{
 const net=require('node:net');
 const server=net.createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 try{assert.equal(await isListeningOnLoopback(port),true);}
 finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(await isListeningOnLoopback(port),false);
});
