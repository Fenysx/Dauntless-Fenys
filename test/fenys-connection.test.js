'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {EventEmitter}=require('node:events');
const {encodeConnection,decodeConnection}=require('../src/fenys-connection-code');
const {prepareServer}=require('../src/fenys-server-setup');
test('código transporta endereço Tailscale e convite individual, sem credencial admin',()=>{
 const code=encodeConnection('100.64.1.2','ABCD-EFGH-IJKL');
 assert.deepEqual(decodeConnection(code),{server:'100.64.1.2:61000',invite:'ABCD-EFGH-IJKL'});
 for(const address of ['127.0.0.1','8.8.8.8','example.com','100.64.1.2:61001'])assert.throws(()=>encodeConnection(address,'ABCD-EFGH-IJKL'));
 for(const code of ['FENYSC2.test','FENYS1.!','FENYS1.'+'a'.repeat(1025),
  'FENYS1.'+Buffer.from(JSON.stringify({v:1,server:'8.8.8.8',invite:'ABCD-EFGH-IJKL'})).toString('base64url')])assert.throws(()=>decodeConnection(code));
});
test('configuração de acesso preserva banco e só expõe Metagame na VPN; deploy continua local',()=>{
 const original={serverSource:'logger.info(`Clear Skies, Slayer.`);',metagameEnv:'AUTH_MODE=APIKEY\nDB_FILENAME=C:/dr/data/undaunted.db\nPROGRESSION_MODE=real\n',deployEnv:'MY_IP=127.0.0.1\n',address:'100.64.1.2:61000'};
 const p=prepareServer(original);
 assert.match(p.metagameEnv,/DB_FILENAME=C:\/dr\/data\/undaunted.db/);
 assert.match(p.metagameEnv,/REGISTRATION_MODE=INVITECODE/);
 assert.match(p.metagameEnv,/FENYS_TAILSCALE_IP=100.64.1.2/);
 assert.match(p.deployEnv,/BIND_HOST=127.0.0.1/);
 assert.match(p.deployEnv,/MY_IP=100.64.1.2/);
 assert.doesNotMatch(p.serverSource,/cloud-runtime|roaming-host/);
 assert.equal(prepareServer({...p,address:original.address}).serverSource,p.serverSource);
 assert.throws(()=>prepareServer({...original,metagameEnv:original.metagameEnv+'FENYS_CLOUD_ROLE=host\n'}),/Preserve o banco/);
});
async function launcher(t,profiles=[]){
 const handlers=new Map(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-direct-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 if(profiles.length){fs.mkdirSync(path.join(dir,'fenys-auth'));fs.writeFileSync(path.join(dir,'fenys-auth/profiles.json'),JSON.stringify({version:1,profiles}));}
 const win={setMenuBarVisibility(){},loadFile(){},webContents:{send(){}},isDestroyed:()=>false};
 const app={requestSingleInstanceLock:()=>true,on(){},getPath:()=>dir,whenReady:()=>Promise.resolve(),exit(){},quit(){}};
 const net={connect:()=>{const socket=new EventEmitter();socket.setTimeout=()=>{};socket.destroy=()=>{};queueMicrotask(()=>socket.emit('error'));return socket;}};
 const electron={app,BrowserWindow:function(){return win;},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},safeStorage:{}};
 const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 vm.runInNewContext(main,{require:name=>name==='electron'?electron:name==='node:net'?net:name.startsWith('./')?require('../src/'+name.slice(2)):require(name),__dirname:path.join(__dirname,'../src'),process,setInterval:()=>({unref(){}}),setTimeout,clearTimeout,Buffer});
 await Promise.resolve();
 return {handlers,dir};
}
test('painel e controles de servidor funcionam com servidor offline e sem perfil/senha',async t=>{
 const {handlers}=await launcher(t);
 assert.equal([...handlers.keys()].some(k=>k.startsWith('auth:')),false);
 const settings=handlers.get('settings:get')();assert.ok(settings.repoPath);
 const stop=await handlers.get('server:stop')();assert.equal(stop.ok,true);assert.equal(stop.status.metagame,false);
 const start=await handlers.get('server:start')();assert.equal(start.ok,false);assert.match(start.error,/dist\/server.js/);assert.doesNotMatch(start.error,/login|senha|admin/i);
});
test('upgrade recupera a chave admin criptografada sem senha e preserva o perfil original',async t=>{
 const ciphertext=Buffer.from('old-dpapi-ciphertext'),id='11111111-1111-4111-8111-111111111111';
 const profile={id,username:'Fenys',role:'admin',server:'127.0.0.1:61000',hash:'unknown-password',key:ciphertext.toString('base64')};
 const {handlers,dir}=await launcher(t,[profile]);
 const settings=handlers.get('settings:get')();assert.equal(settings.adminKeySelected,true);assert.equal(settings.accountKeySelected,true);
 const config=JSON.parse(fs.readFileSync(path.join(dir,'settings.json')));
 assert.deepEqual(fs.readFileSync(config.adminKeyFile),ciphertext);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'fenys-auth/profiles.json'))).profiles,[profile]);
});
test('tentativa de conexão durante operação não libera o bloqueio da primeira operação',async t=>{
 const {handlers}=await launcher(t);
 const first=handlers.get('server:stop')();
 const code=encodeConnection('100.64.1.2','ABCD-EFGH-IJKL');
 const r=await handlers.get('connection:join')(null,code,'Ygor');assert.equal(r.ok,false);assert.match(r.error,/Aguarde/);
 const second=await handlers.get('server:start')();assert.equal(second.ok,false);assert.match(second.error,/operação em andamento/);
 await first;
});
