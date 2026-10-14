'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {EventEmitter}=require('node:events');
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
test('compatibilidade com endereço legado mantém Iniciar/Desligar locais disponíveis sem admin',async t=>{
 const {handlers,dir}=await launcher(t);const file=path.join(dir,'settings.json'),settings=JSON.parse(fs.readFileSync(file));settings.gameServer='100.64.1.2:61000';fs.writeFileSync(file,JSON.stringify(settings));
 const start=await handlers.get('server:start')();assert.equal(start.ok,false);assert.match(start.error,/dist\/server.js/);assert.doesNotMatch(start.error,/login|senha|admin|remoto/i);
 const stop=await handlers.get('server:stop')();assert.equal(stop.ok,true);assert.equal(stop.status.remote,true);
});
