'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parseServerAddress,createInvite,registerPlayer} = require('../src/fenys-api');

test('padrão local e IP privado do Tailscale', () => {
  assert.deepEqual(parseServerAddress(''), {host:'127.0.0.1',port:61000,local:true,address:'127.0.0.1:61000'});
  assert.equal(parseServerAddress('100.101.20.30:61000').local,false);
  assert.equal(parseServerAddress('fenys.alpha.ts.net').host,'fenys.alpha.ts.net');
});
test('bloqueia destinos públicos para impedir envio de chave por HTTP', () => {
  for (const host of ['8.8.8.8', 'example.org:61000', '100.128.1.1', '192.168.1.20', '127.0.0.1:99999', '127.0.0.1/evil']) {
    assert.throws(() => parseServerAddress(host), Error, host);
  }
});
test('convite é emitido exclusivamente pela API com autenticação de administrador', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch', async (url,options) => {
    calls.push({url,options});
    if(url.endsWith('/GetUserInfo'))return Response.json({Username:'Admin',IsAdmin:true});
    if(url.endsWith('/RegistrationStatus'))return Response.json({RegistrationMode:'INVITECODE'});
    return Response.json({code:'ABCD-EFGH-IJKL'});
  });
  const code=await createInvite('127.0.0.1:61000','UUK_'+'a'.repeat(48),'amigo teste');
  assert.equal(code,'ABCD-EFGH-IJKL');
  assert.equal(calls.length,3);
  assert.equal(calls[0].options.headers['x-undaunted-user-api-key'],'UUK_'+'a'.repeat(48));
  assert.equal(JSON.parse(calls[2].options.body).uses,1);
});
test('conta recebe chave própria, sem retorná-la ao renderer pela API de convites', async t => {
  t.mock.method(globalThis,'fetch',async (_url,options) => {
    assert.equal(JSON.parse(options.body).Username,'Amigo123');
    assert.equal(JSON.parse(options.body).InviteCode,'ABCD-EFGH-IJKL');
    return Response.json({UUK:'UUK_'+'b'.repeat(48)});
  });
  assert.equal(await registerPlayer('100.100.1.2:61000','Amigo123','abcd-efgh-ijkl'),'UUK_'+'b'.repeat(48));
});
test('não cria convite quando a conta não é administradora',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({IsAdmin:false}));
  await assert.rejects(createInvite('127.0.0.1:61000','UUK_'+'a'.repeat(48),'teste'),/não é administradora/);
});
