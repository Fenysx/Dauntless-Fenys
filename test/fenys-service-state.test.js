'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {servicesOwnedByLauncher}=require('../src/fenys-service-state');

test('Google activation requires both live services owned by launcher',()=>{
 const valid={metagame:true,deploy:true,owned:['metagame','deploy']};
 assert.equal(servicesOwnedByLauncher(valid),true);
 for(const state of [undefined,null,{},
  {metagame:false,deploy:true,owned:['metagame','deploy']},
  {metagame:true,deploy:false,owned:['metagame','deploy']},
  {metagame:true,deploy:true,owned:[]},
  {metagame:true,deploy:true,owned:['metagame']},
  {metagame:true,deploy:true,owned:['deploy']},
  {metagame:true,deploy:true,owned:null}])
  assert.equal(servicesOwnedByLauncher(state),false,JSON.stringify(state));
});

test('migration blocks active players even if old authority is already Google',async()=>{
 const {verifyLegacyHostIdle}=require('../src/fenys-service-state');
 await assert.rejects(
  verifyLegacyHostIdle(async()=>({onlineCount:2}),async()=>({mode:'google'})),
  /Encerre as partidas/);
});
test('migration tolerates transport error only for a confirmed migrated authority',async()=>{
 const {verifyLegacyHostIdle}=require('../src/fenys-service-state');
 const migrated=await verifyLegacyHostIdle(async()=>{throw Error('old host unavailable');},async()=>({mode:'google'}));
 assert.deepEqual(migrated,{legacyAuthorityMigrated:true});
 await assert.rejects(verifyLegacyHostIdle(async()=>{throw Error('offline');},async()=>({mode:'legacy'})),/offline/);
 await assert.rejects(verifyLegacyHostIdle(async()=>({}),async()=>({mode:'google'})),/confirmar se há jogadores/);
 assert.deepEqual(await verifyLegacyHostIdle(async()=>({onlineCount:0}),async()=>null),{legacyAuthorityMigrated:false});
});
