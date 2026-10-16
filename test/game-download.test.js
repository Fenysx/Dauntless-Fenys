'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {sourceURL,safeRelative,validateManifest,syncGameFiles}=require('../src/fenys-game-download');

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
