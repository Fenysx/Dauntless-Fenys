'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseEnv, inspectInstallation, renderReport} = require('../scripts/doctor.cjs');

function createHost(t, {metagameEnv = '', deployEnv = '', deployed = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dauntless-doctor-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'server'), {recursive:true});
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'server', 'upstream.lock.json'), '{}');
  for (const [component, contents] of [['UndauntedMetagame',metagameEnv], ['UndauntedDeployServer',deployEnv]]) {
    const dest=path.join(root, 'runtime', 'server', component);
    fs.mkdirSync(path.join(dest, 'dist'), {recursive:true});
    if (deployed) fs.writeFileSync(path.join(dest, 'dist','server.js'),'');
    if (contents !== null) fs.writeFileSync(path.join(dest, '.env'), contents);
  }
  return root;
}
const signing = crypto.generateKeyPairSync('rsa',{modulusLength:2048, privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const METAGAME = [
  'PORT=61000','BIND_HOST=127.0.0.1','REGISTRATION_MODE=INVITECODE',
  'MATCHMAKING_MODE=DEPLOYSERVER','TARGET_CHANGELIST=239827',
  'AUTH_SIGNING_PRIVKEY_B64=' + Buffer.from(signing.privateKey).toString('base64'),
  'AUTH_SIGNING_PUBKEY_B64=' + Buffer.from(signing.publicKey).toString('base64'),
  'DB_FILENAME=/var/tmp/dlu.db'
].join('\n');
const DEPLOY = ['PORT=61001','BIND_HOST=127.0.0.1',
  'METAGAME_API_KEY=abcdef123456','GAMESERVER_BINARY_PATH=/private/bin/Dauntless.exe'].join('\n');

test('interpretador trata aspas e CRLF sem exibir o conteúdo secreto', () => {
  assert.deepEqual({...parseEnv('export PORT="61000"\r\nBIND_HOST=127.0.0.1 # comment\r\nSECRET=very-private-token\r\n')},
    {PORT:'61000',BIND_HOST:'127.0.0.1',SECRET:'very-private-token'});
});
test('configuração válida é considerada pronta, sem imprimir valores sensíveis', t => {
  const root = createHost(t, {metagameEnv:METAGAME,deployEnv:DEPLOY});
  const report = inspectInstallation({root,nodeVersion:'24.4.0',platform:'win32'});
  assert.equal(report.errors,0);
  assert.equal(report.status,'ready_to_start');
  assert.equal(report.warnings,1); // Executável deliberadamente ausente no fixture.
  assert.doesNotMatch(JSON.stringify(report)+renderReport(report),/BEGIN PRIVATE KEY|abcdef123456|very-private-token/);
});
test('identifica arquivos ausentes, porta errada, cadastro aberto e credenciais incompletas', t => {
  const root = createHost(t,{metagameEnv:'PORT=61099\nREGISTRATION_MODE=OPEN', deployEnv:null,deployed:false});
  const report = inspectInstallation({root,nodeVersion:'22.16.0',platform:'linux'});
  const codes = report.findings.map(f => f.code);
  for (const code of ['NODE_VERSION','METAGAME_BUILD','DEPLOY_BUILD','METAGAME_PORT','OPEN_REGISTRATION','SIGNING_KEYS','DATABASE_PATH','DEPLOY_ENV','LINUX_GAME'])
    assert.ok(codes.includes(code),code);
  assert.equal(report.status,'needs_configuration');
});
test('sinaliza endereço inseguro e chave de exemplo sem devolver a chave', t => {
  const root=createHost(t,{metagameEnv:METAGAME.replace('127.0.0.1','0.0.0.0'),deployEnv:DEPLOY.replace('abcdef123456','COLOQUE_A_CHAVE_REAL')});
  const report=inspectInstallation({root,nodeVersion:'24.0.0',platform:'win32'});
  assert.ok(report.findings.some(f=>f.code==='METAGAME_BIND'));
  assert.ok(report.findings.some(f=>f.code==='GAMESERVER_KEY'));
  assert.doesNotMatch(renderReport(report),/COLOQUE_A_CHAVE_REAL/);
});


test('diagnóstico pode ser carregado pelo instalador sem depender da pasta scripts',t=>{
 const engine=require('../src/fenys-host-doctor');
 const root=createHost(t,{metagameEnv:METAGAME,deployEnv:DEPLOY});
 const result=engine.inspectInstallation({
  root:'/nao-existe-projeto-fonte',
  serverDir:path.join(root,'runtime','server'),
  checkSourceLayout:false,nodeVersion:'24.5.0',platform:'win32'
 });
 assert.equal(result.errors,0);
 assert.equal(result.findings.some(x=>x.code==='SOURCE_LAYOUT'),false);
 assert.equal(typeof engine.renderReport(result),'string');
});
test('instalador Electron inclui diagnóstico e interface não expõe variáveis privadas',()=>{
 const packaged=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).build.files;
 assert.ok(packaged.includes('src/**/*'));
 const main=fs.readFileSync(path.join(__dirname,'..','src','main.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'..','src','preload.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','src','index.html'),'utf8');
 assert.match(main,/ipcMain\.handle\('system:doctor'/);
 assert.match(preload,/ipcRenderer\.invoke\('system:doctor'\)/);
 assert.match(html,/id="hostDoctorReport"/);
 assert.doesNotMatch(main.slice(main.indexOf("ipcMain.handle('system:doctor'"),main.indexOf("ipcMain.handle('settings:get'")),/METAGAME_API_KEY|AUTH_SIGNING_PRIVKEY_B64/);
});

test('diagnóstico nativo detecta DLLs ausentes e RAM livre insuficiente sem alterar saves',t=>{
 const root=createHost(t,{metagameEnv:METAGAME,deployEnv:DEPLOY});
 const binaryDir=path.join(root,'Dauntless','Archon','Binaries','Win64');
 fs.mkdirSync(binaryDir,{recursive:true});
 const executable=path.join(binaryDir,'Dauntless-Win64-Shipping.exe');
 fs.writeFileSync(executable,'fake-test-binary');
 const deploy=path.join(root,'runtime','server','UndauntedDeployServer','.env');
 fs.writeFileSync(deploy,DEPLOY.replace('/private/bin/Dauntless.exe',executable));
 let check=inspectInstallation({root,nodeVersion:'24.4.0',platform:'win32',freeMemoryBytes:3.25*1024**3});
 assert.equal(check.findings.filter(f=>f.code==='GAME_DLL').length,2);
 assert.ok(check.findings.some(f=>f.code==='GAME_RAM'));
 assert.equal(check.status,'needs_configuration');
 assert.doesNotMatch(renderReport(check),/abcdef123456/);
 for(const filename of ['dxgi.dll','UndauntedInternalServer.dll'])fs.writeFileSync(path.join(binaryDir,filename),'test');
 check=inspectInstallation({root,nodeVersion:'24.4.0',platform:'win32',freeMemoryBytes:8*1024**3});
 assert.equal(check.errors,0);
 assert.ok(!check.findings.some(f=>f.code==='GAME_DLL'));
 assert.ok(!check.findings.some(f=>f.code==='GAME_RAM'));
});
test('Atividades explica saída nativa e host Google antigo sem esconder erros',()=>{
 const renderer=fs.readFileSync(path.join(__dirname,'..','src','renderer.js'),'utf8');
 assert.match(renderer,/3221225786/);
 assert.match(renderer,/0xC000013A/);
 assert.match(renderer,/Unstubbed route/);
 assert.match(renderer,/DIAGNÓSTICO GOOGLE/);
 const main=fs.readFileSync(path.join(__dirname,'..','src','main.js'),'utf8');
 assert.match(main,/Google no servidor local:/);
 assert.doesNotMatch(main,/login real ainda precisa de teste/);
});
