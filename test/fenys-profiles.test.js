'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ProfileVault}=require('../src/fenys-profiles');

function newVault(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return new ProfileVault(dir);
}
const mockKey=Buffer.from('encrypted-with-electron-safestorage');
test('cadastro salva hash de senha, nao senha ou UUK; e fornece recuperacao',t=>{
 const vault=newVault(t);
 const r=vault.create({username:'Hunter_A',password:'UmaSenhaForte123!',role:'user',server:'100.100.1.2:61000',encryptedKey:mockKey});
 assert.equal(r.profile.role,'user');
 assert.match(r.recoveryCode,/^[A-F0-9-]+$/);
 const raw=fs.readFileSync(vault.file,'utf8');
 assert.doesNotMatch(raw,/UmaSenhaForte123!/);
 assert.doesNotMatch(raw,/UUK_/);
 assert.equal(vault.list().length,1);
});
test('mais de uma pessoa usa o mesmo PC com sessoes separadas',t=>{
 const v=newVault(t);
 v.create({username:'Pai',password:'familia-A-2026!',role:'admin',server:'127.0.0.1:61000',encryptedKey:mockKey});
 v.create({username:'Filha',password:'familia-B-2026!',role:'user',server:'127.0.0.1:61000',encryptedKey:mockKey});
 assert.equal(v.current().username,'Filha');
 assert.throws(()=>v.requireAdmin(),/apenas uma conta administradora/i);
 v.logout();
 assert.equal(v.current(),null);
 assert.throws(()=>v.requireLogin(),/Faça login/);
 assert.throws(()=>v.login('Filha','senha errada'),/senha incorretos/);
 v.login('Pai','familia-A-2026!');
 assert.equal(v.requireAdmin().role,'admin');
 assert.equal(v.list().length,2);
});
test('senha pode ser recuperada por codigo de uso unico',t=>{
 const v=newVault(t);
 const first=v.create({username:'Slayer',password:'minhaSenha123!',role:'user',server:'100.100.1.2:61000',encryptedKey:mockKey});
 v.logout();
 assert.throws(()=>v.reset('Slayer','codigo-falso','senhaNova!2026'),/inválido/);
 const result=v.reset('Slayer',first.recoveryCode,'senhaNova!2026');
 assert.match(result.recoveryCode,/^[A-F0-9-]+$/);
 assert.throws(()=>v.login('Slayer','minhaSenha123!'),/senha incorretos/);
 assert.throws(()=>v.reset('Slayer',first.recoveryCode,'maisUmaSenha!2026'),/inválido/);
 assert.equal(v.login('Slayer','senhaNova!2026').username,'Slayer');
});
test('troca de senha invalida a antiga e substitui codigo de recuperacao',t=>{
 const v=newVault(t);
 const first=v.create({username:'Dojo_12',password:'senhaMuitoForte123!',role:'user',server:'127.0.0.1:61000',encryptedKey:mockKey});
 assert.throws(()=>v.changePassword('errada','senhaNova!2026'),/incorreta/);
 const next=v.changePassword('senhaMuitoForte123!','senhaNova!2026');
 assert.notEqual(first.recoveryCode,next.recoveryCode);
 v.logout();
 assert.equal(v.login('Dojo_12','senhaNova!2026').username,'Dojo_12');
});
test('apagar perfil local preserva estrutura do servidor e requer senha',t=>{
 const v=newVault(t);
 v.create({username:'Casa_A',password:'senhaBemSegura123!',role:'user',server:'127.0.0.1:61000',encryptedKey:mockKey});
 assert.throws(()=>v.forgetLocalProfile('incorreta'),/incorreta/);
 v.forgetLocalProfile('senhaBemSegura123!');
 assert.equal(v.list().length,0);assert.equal(v.current(),null);
});
test('todos os controles do renderer existem no HTML',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const refs=[...js.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
 const missing=[...new Set(refs)].filter(id=>!ids.has(id));
 assert.deepEqual(missing,[]);
 assert.match(html,/data-auth-mode="register"/);
 assert.match(html,/id="profile-switch"/);
 assert.match(html,/id="admin-list"/);
});
test('IPC no processo principal exige admin em start stop restart e remove',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 for(const ipc of ['server:start','server:stop','server:restart']){
  const at=src.indexOf("ipcMain.handle('"+ipc+"'");
  assert.notEqual(at,-1,ipc);
  assert.match(src.slice(at,at+250),/vault\.requireAdmin\(\)/,ipc);
 }
 assert.match(src,/ipcMain\.handle\('admin:remove'/);
 assert.match(src,/await assertOnlineAdmin\(\)/);
});
