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
