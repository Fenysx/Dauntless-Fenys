'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {sourceURL,safeRelative,validateManifest,verifyOriginalManifest,syncGameFiles}=require('../src/fenys-game-download');

test('origens de download exigem HTTPS ou rede privada Tailscale',()=>{
 assert.equal(sourceURL('https://files.example.net/manifest.json').hostname,'files.example.net');
 assert.equal(sourceURL('http://100.101.2.3:8000/manifest.json').protocol,'http:');
 assert.throws(()=>sourceURL('http://192.168.0.1/manifest.json'),/Fonte não permitida/);
 assert.throws(()=>sourceURL('http://example.net/a'),/Fonte não permitida/);
 assert.throws(()=>sourceURL('https://user:secret@example.net/manifest'),/Fonte não permitida/);
});
test('manifesto recusa versão, caminho, tamanho e sha incorretos',()=>{
 assert.deepEqual(safeRelative('Archon/Binaries/Win64/a.exe'),['Archon','Binaries','Win64','a.exe']);
 assert.throws(()=>safeRelative('../file.exe'),/inseguro/);
 assert.throws(()=>safeRelative('a\\b.exe'),/inválido/);
 assert.throws(()=>validateManifest({version:'2.1.1',files:[]}),/incompatível/);
 const f={path:'game.dat',size:3,sha256:'0'.repeat(64)};
 assert.deepEqual(validateManifest({version:'1.4.4',files:[f]}).files.length,1);
 assert.throws(()=>validateManifest({version:'1.4.4',files:[f,f]}),/repetido/);
 assert.throws(()=>validateManifest({version:'1.4.4',files:[{...f,sha256:'x'}]}),/inválido/);
});
test('download verifica SHA-256, preserva arquivo danificado e pula o já íntegro',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dlu-download-'));
 try{
  const contents=Buffer.from('test game bytes');
  const sha256=crypto.createHash('sha256').update(contents).digest('hex');
  const manifest={version:'1.4.4',files:[{path:'Archon/Binaries/Win64/test.dat',sha256,size:contents.length}]};
  const seen=[];
  const fetcher=async (u,opts)=>{
   seen.push({url:String(u),headers:opts.headers});
   return String(u).endsWith('/manifest.json')
    ?new Response(JSON.stringify(manifest),{status:200,headers:{'content-type':'application/json'}})
    :new Response(contents,{status:200});
  };
  const options={manifestUrl:'https://host.example/manifest.json',folder,key:'temporary-test-key',fetcher};
  const first=await syncGameFiles(options);
  assert.equal(first.downloaded,1);assert.equal(first.skipped,0);
  assert.equal(seen[0].headers['X-Download-Key'],'temporary-test-key');
  assert.ok(seen[1].url.startsWith('https://host.example/files/'));
  const second=await syncGameFiles(options);
  assert.equal(second.downloaded,0);assert.equal(second.skipped,1);
  const file=path.join(folder,'Archon','Binaries','Win64','test.dat');
  fs.writeFileSync(file,'damaged');
  const third=await syncGameFiles(options);
  assert.equal(third.downloaded,1);
  assert.equal(fs.readFileSync(file).toString(),contents.toString());
  assert.equal(fs.readFileSync(file+'.dlu-backup').toString(),'damaged');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('manifesto original 1.4.4 é fixado e não aceita substituição de hashes',()=>{
 const pinned=require('../src/game-manifest.json');
 assert.equal(pinned.files.length,410);
 assert.equal(pinned.totalBytes,10893512875);
 assert.equal(verifyOriginalManifest(pinned).files.length,410);
 const tampered={...pinned,files:pinned.files.map((f,i)=>i===0?{...f,sha256:'0'.repeat(64)}:f)};
 assert.throws(()=>verifyOriginalManifest(tampered),/diferente/);
});
test('API de conteúdo original recebe a key pessoal somente no download',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dlu-original-'));
 try{
  const content=Buffer.from('verified original');
  const file={path:'Archon/Test.dat',sha256:crypto.createHash('sha256').update(content).digest('hex'),size:content.length};
  const pinned={build:'fixed-build',totalBytes:content.length,files:[file]};
  const seen=[];
  const fetcher=async (u,options)=>{
   seen.push({u:String(u),headers:options.headers});
   return new Response(String(u).endsWith('/manifest')
    ?JSON.stringify(pinned):content,{status:200});
  };
  const result=await syncGameFiles({
   manifestUrl:'http://100.100.0.1:61002/content/v1/manifest',
   key:'UUK_example_testing_only',folder,pinnedManifest:pinned,fetcher
  });
  assert.equal(result.downloaded,1);
  assert.deepEqual(seen[0].headers,{});
  assert.equal(seen[1].headers['x-undaunted-user-api-key'],'UUK_example_testing_only');
  assert.equal(seen[1].u,'http://100.100.0.1:61002/content/v1/files/Archon/Test.dat');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
