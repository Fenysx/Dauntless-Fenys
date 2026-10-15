'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {findAuthorizationFile}=require('../src/fenys-authorization-discovery');
const endpoint='https://hbbtbbqsauivnierqxvh.supabase.co/functions/v1/fenys-global';
function authorization(){return {format:'FENYS-SUPABASE-1',endpoint,secret:'a'.repeat(48),encryptionKey:'b'.repeat(64)};}
function setup(t){const home=fs.mkdtempSync(path.join(os.tmpdir(),'dlu-auth-discovery-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function store(home,folder,body){const file=path.join(home,folder,'runtime','cloud-enrollment','authorization.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(body));return file;}
test('encontra automaticamente autorizacao valida no projeto atualizado sem ler segredos em logs',t=>{
 const home=setup(t),file=store(home,'Dauntless-Fenys-Atualizado',authorization());
 assert.equal(findAuthorizationFile(home,null),file);
});
test('prioriza arquivo escolhido explicitamente e usa arquivo valido quando o caminho salvo foi removido',t=>{
 const home=setup(t),local=store(home,'Dauntless-Fenys-Atualizado',authorization());
 const selected=path.join(home,'private.json');fs.writeFileSync(selected,JSON.stringify(authorization()));
 assert.equal(findAuthorizationFile(home,selected),selected);
 assert.equal(findAuthorizationFile(home,path.join(home,'removido.json')),local);
});
test('ignora arquivos invalidos ou de outro projeto, sem preencher autorizacao automaticamente',t=>{
 const home=setup(t),file=store(home,'Dauntless-Fenys-Atualizado',{...authorization(),endpoint:'https://outro-projeto.invalid'});
 assert.equal(findAuthorizationFile(home,null),null);
 fs.writeFileSync(file,'{ arquivo corrompido');
 assert.equal(findAuthorizationFile(home,null),null);
});
