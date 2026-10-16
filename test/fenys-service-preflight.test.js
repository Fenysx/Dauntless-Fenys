'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {verifyServerFiles,failureMessage}=require('../src/fenys-service-preflight');
const root=path.join('C:','Servidor','Dauntless');
const files=['UndauntedMetagame/dist/server.js','UndauntedMetagame/.env','UndauntedDeployServer/dist/server.js','UndauntedDeployServer/.env'];
function fakeFiles(existing){return {existsSync:file=>existing.some(relative=>path.normalize(path.join(root,...relative.split('/')))===file)};}
test('servidor configurado com dois servicos passa preflight sem ler credenciais',()=>{
 assert.equal(verifyServerFiles(root,['Metagame','DeployServer'],fakeFiles(files)),true);
});
test('pasta errada aponta Metagame e DeployServer ANTES de abrir processos',()=>{
 assert.throws(()=>verifyServerFiles(root,['Metagame','DeployServer'],fakeFiles([])),err=>/Metagame: dist\/server\.js ausente/.test(err.message)&&/DeployServer: \.env ausente/.test(err.message)&&/Nenhum save foi modificado/.test(err.message));
});
test('servico externo online nao exige seus arquivos locais',()=>{
 assert.equal(verifyServerFiles(root,['DeployServer'],fakeFiles(files.filter(f=>f.startsWith('UndauntedDeployServer')))),true);
});
test('falha do Node e encerramento precoce sao reportados',()=>{
 assert.match(failureMessage('Metagame',{error:'ENOENT'}),/ENOENT/);
 assert.match(failureMessage('DeployServer',{code:1}),/código 1/);
});
