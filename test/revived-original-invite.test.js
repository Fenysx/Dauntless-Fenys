'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseRevivedInvite,safeSummary}=require('../src/fenys-revived-invite');
const fp='9'.repeat(64);
const code='DR-test-abcdef1234';
const v2='dauntless-revived://join?v=2&mode=public&host=82.153.118.176&port=443&fp='+fp+'&code='+code+'&name=Dauntless+Revived';
const v1='dauntless-revived://join?v=1&host=100.86.11.22&port=61000&code='+code+'&name=Friends';
test('convite Discord original público v2 é reconhecido sem consumir nem expor o código',()=>{
 const parsed=parseRevivedInvite(v2);
 assert.equal(parsed.mode,'public');assert.equal(parsed.port,443);
 assert.equal(parsed.host,'82.153.118.176');
 assert.equal(parsed.name,'Dauntless Revived');
 assert.equal(parsed.fingerprint,fp);
 const summary=safeSummary(parsed);
 assert.equal(summary.usesTailscale,false);
 assert.ok(!JSON.stringify(summary).includes(code));
 assert.ok(!JSON.stringify(summary).includes(fp));
});
test('hospedagem privada v1 aceita apenas Tailscale e loopback',()=>{
 assert.equal(parseRevivedInvite(v1).mode,'private');
 assert.throws(()=>parseRevivedInvite(v1.replace('100.86.11.22','82.153.118.176')),/inseguro/);
 assert.throws(()=>parseRevivedInvite(v1.replace('100.86.11.22','10.10.0.2')),/inseguro/);
});
test('parser rejeita URL duplicada, fingerprint ausente e códigos incompletos',()=>{
 assert.throws(()=>parseRevivedInvite(v2+'&host=localhost'),/duplicado/);
 assert.throws(()=>parseRevivedInvite(v2.replace(fp,'a'.repeat(63))),/fingerprint/);
 assert.throws(()=>parseRevivedInvite(v2.replace('code='+code,'code=')),/registro/);
 assert.throws(()=>parseRevivedInvite('https://evil.example/?invite='+encodeURIComponent(v2)),/link completo/);
});
