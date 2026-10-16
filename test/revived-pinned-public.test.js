'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const tls=require('node:tls');
const {spawnSync}=require('node:child_process');
const {requestJson,assertTarget,pinnedFetch}=require('../src/fenys-revived-public');

test('public v2 blocks invalid certificate fingerprint before network I/O',()=>{
 assert.throws(()=>assertTarget({mode:'public',host:'public.example',port:443,fingerprint:'oops'}),/inválido/);
 assert.throws(()=>pinnedFetch({mode:'private',host:'100.101.1.1',port:61000,fingerprint:null}),/inválido/);
});
test('public v2 verifies the TLS certificate before sending HTTP requests',async(t)=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'dlu-pinned-test-'));
 let server;
 try{
  const cmd=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
   '-subj','/CN=localhost','-keyout',path.join(cwd,'key.pem'),'-out',path.join(cwd,'cert.pem')],{stdio:'ignore'});
  if(cmd.status!==0){t.skip('OpenSSL não disponível no executor.');return;}
  const key=fs.readFileSync(path.join(cwd,'key.pem')),cert=fs.readFileSync(path.join(cwd,'cert.pem'));
  const fp=crypto.createHash('sha256').update(new crypto.X509Certificate(cert).raw).digest('hex');
  let requests=0;
  server=tls.createServer({key,cert},socket=>{
   let pending='';
   socket.on('data',buffer=>{
    pending+=buffer.toString();
    if(!pending.includes('\r\n\r\n'))return;
    requests++;
    const body=JSON.stringify({ok:true});
    socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: '+Buffer.byteLength(body)+'\r\nConnection: close\r\n\r\n'+body);
   });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const target={mode:'public',host:'127.0.0.1',port,fingerprint:fp};
  const good=await requestJson(target,'/undaunted/api/ServerStatus');
  assert.equal(good.status,200);assert.equal(good.data.ok,true);
  assert.equal(requests,1);
  await assert.rejects(()=>requestJson({...target,fingerprint:'0'.repeat(64)},'/undaunted/api/ServerStatus'),/Certificado TLS diferente/);
  assert.equal(requests,1,'fingerprint divergente não pode transmitir nem o cabeçalho HTTP');
 }finally{if(server)await new Promise(r=>server.close(r));fs.rmSync(cwd,{recursive:true,force:true});}
});
