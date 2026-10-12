'use strict';
const {app,BrowserWindow,ipcMain,dialog,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {inviteStatus,createInvite}=require('./fenys-api');
let win;
const owned=new Map();
const PORTS={metagame:61000,deploy:61001};
const DIRS={metagame:'UndauntedMetagame',deploy:'UndauntedDeployServer'};
const GAME_EXE='Dauntless-Win64-Shipping.exe';
const WIN64_PARTS=['Archon','Binaries','Win64'];
// SHA-256 pins published by mixutin/dauntless-revived for Dauntless 1.4.4.
const GAME_HASHES={
 'Dauntless-Win64-Shipping.exe':'d3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4',
 'dxgi.dll':'9a431d7b6fd20c43fa92bebd91c3bc023ec7a3fcbc52871c41f4df293d4b0d1f',
 'UndauntedInternalServer.dll':'a090e8b25044647ce409b313525501da578d632d3fcb9eb351f020ca94fa64fb',
};
let busy=null;
const configFile=()=>path.join(app.getPath('userData'),'settings.json');
function defaults(){return {repoPath:path.join(app.getPath('home'),'dauntless-revived'),launcherExe:'',gameKeyFile:''};}
function load(){try{return {...defaults(),...JSON.parse(fs.readFileSync(configFile(),'utf8'))};}catch{return defaults();}}
function save(c){fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(c,null,2));}
function tcp(port){return new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});let done=false;const finish=x=>{if(done)return;done=true;s.destroy();resolve(x);};s.setTimeout(1000);s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.once('timeout',()=>finish(false));});}
async function status(){return {metagame:await tcp(PORTS.metagame),deploy:await tcp(PORTS.deploy),owned:[...owned.keys()]};}
function notify(msg){if(win&&!win.isDestroyed())win.webContents.send('activity',String(msg));}
function launchService(name,dir){
 const base=path.join(load().repoPath,dir);
 if(!fs.existsSync(path.join(base,'dist','server.js'))||!fs.existsSync(path.join(base,'.env')))throw new Error(`${dir}: dist/server.js ou .env não encontrado. Compile/configure o serviço primeiro.`);
 const child=spawn(process.platform==='win32'?'node.exe':'node',['--env-file=.env','dist/server.js'],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});
 owned.set(name,child);
 child.stdout.on('data',d=>notify(`${name}: ${String(d).slice(0,400)}`));
 child.stderr.on('data',d=>notify(`${name} (erro): ${String(d).slice(0,400)}`));
 child.on('error',e=>notify(`${name}: ${e.message}`));
 child.on('exit',code=>{if(owned.get(name)===child)owned.delete(name);notify(`${name} finalizou (código ${code})`);});
}
async function waitReady(){for(let i=0;i<35;i++){const s=await status();if(s.metagame&&s.deploy)return s;await new Promise(r=>setTimeout(r,1000));}throw new Error('Serviços indisponíveis após 35 segundos. Verifique a aba Atividades.');}
async function startAll(){let s=await status();if(!s.metagame){notify('Iniciando Metagame…');launchService('metagame',DIRS.metagame);}if(!s.deploy){notify('Iniciando DeployServer…');launchService('deploy',DIRS.deploy);}return waitReady();}
async function killOwned(name){const child=owned.get(name);if(!child)return;if(child.exitCode!==null||child.killed){owned.delete(name);return;}
 await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timeout);resolve();};
 const timeout=setTimeout(finish,3500);child.once('exit',finish);
 try{child.kill('SIGTERM');}catch{finish();}
 });
 if(owned.get(name)===child)owned.delete(name);
}
async function stopOwned(){const names=[...owned.keys()];for(const name of names){notify(`Encerrando ${name}…`);await killOwned(name);}return status();}
async function runLocked(fn){if(busy)return {ok:false,error:'Já existe uma operação em andamento.'};busy=true;try{return {ok:true,status:await fn()};}catch(e){return {ok:false,error:e instanceof Error?e.message:String(e)};}finally{busy=false;}}
function createWindow(){win=new BrowserWindow({width:1280,height:840,minWidth:950,minHeight:650,backgroundColor:'#08090e',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.setMenuBarVisibility(false);win.loadFile(path.join(__dirname,'index.html'));}

function gameExePath(config){
 const selected=String(config.launcherExe||'').trim();
 if(!selected)throw new Error('Em Configurações, selecione o Dauntless.exe da pasta principal ou Dauntless-Win64-Shipping.exe.');
 // Preserve the Fenys settings UI: if Dauntless.exe is selected, resolve its Win64 client automatically.
 if(path.basename(selected).toLowerCase()==='dauntless.exe')return path.join(path.dirname(selected),...WIN64_PARTS,GAME_EXE);
 if(path.basename(selected).toLowerCase()===GAME_EXE.toLowerCase())return selected;
 throw new Error('Selecione Dauntless.exe (pasta principal) ou Dauntless-Win64-Shipping.exe (Archon\\Binaries\\Win64).');
}
function sha256File(file){
 return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256');const stream=fs.createReadStream(file);
  stream.once('error',reject);stream.on('data',chunk=>h.update(chunk));stream.once('end',()=>resolve(h.digest('hex')));
 });
}
async function verifyGame(dir){
 for(const [name,expected] of Object.entries(GAME_HASHES)){
  const file=path.join(dir,name);
  if(!fs.existsSync(file))throw new Error(`Arquivo obrigatório ausente: ${name}. Confira os arquivos originais do Dauntless Revived.`);
  const got=await sha256File(file);
  if(got!==expected)throw new Error(`Arquivo diferente do Dauntless Revived 1.4.4: ${name}. Não substitua DLLs aleatoriamente; restaure pelo instalador original.`);
 }
}
function friendKitDir(){return path.join(app.getPath('appData'),'DauntlessRevived');}
function backendAddress(){
 let server=String(load().gameServer||'').trim()||'127.0.0.1:61000';
 const settings=path.join(friendKitDir(),'settings.json');
 if(!load().gameServer&&fs.existsSync(settings)){
  try {const c=JSON.parse(fs.readFileSync(settings,'utf8'));if(typeof c.Server==='string'&&c.Server.trim())server=c.Server.trim();}
  catch{throw new Error('O settings.json do kit DauntlessRevived está inválido.');}
 }
 if(!/^[a-zA-Z0-9._-]+(?::[0-9]{1,5})?$/.test(server))throw new Error('Endereço do servidor inválido nas configurações do DauntlessRevived.');
 if(!server.includes(':'))server+=':61000';
 const port=Number(server.split(':').at(-1));
 if(port<1||port>65535)throw new Error('Porta do servidor inválida.');
 return server;
}
async function accountKey(){
 const c=load();
 const candidate=c.gameKeyFile||path.join(friendKitDir(),'account.key');
 let file=candidate;
 if(!fs.existsSync(file)){
  const r=await dialog.showOpenDialog(win,{title:'Selecione account.key de sua conta Dauntless Revived',buttonLabel:'Usar chave da minha conta',properties:['openFile'],filters:[{name:'Arquivo de chave',extensions:['key','txt']},{name:'Todos os arquivos',extensions:['*']}]});
  if(r.canceled||!r.filePaths.length)throw new Error('Chave da conta não selecionada. Primeiro registre sua conta pelo Dauntless Revived original ou pelo friend-kit/setup.ps1.');
  file=r.filePaths[0];c.gameKeyFile=file;save(c);
 }
 const key=fs.readFileSync(file,'utf8').trim();
 if(!/^[a-zA-Z0-9_-]{8,128}$/.test(key))throw new Error('A chave da conta não parece válida. Use o arquivo account.key gerado no cadastro do Dauntless Revived.');
 return key;
}
function configureChat(server){
 // As in friend-kit/play.ps1: do not let the legacy 1.4.4 XMPP profile contact Epic.
 const host=server.split(':')[0];
 const iniDir=path.join(process.env.LOCALAPPDATA||path.join(app.getPath('home'),'AppData','Local'),'Archon','Saved','Config','WindowsClient');
 const file=path.join(iniDir,'Engine.ini');
 fs.mkdirSync(iniDir,{recursive:true});
 const current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 // Back up existing settings once before changing the chat section.
 if(current&&!fs.existsSync(file+'.fenys.bak'))fs.copyFileSync(file,file+'.fenys.bak');
 const lines=current.split(/\r?\n/);
 const keep=[];let skip=false;
 for(const line of lines){
  if(/^\[OnlineSubsystemMcp\.XMPP\]\s*$/.test(line.trim())){skip=true;continue;}
  if(skip&&/^\[/.test(line.trim()))skip=false;
  if(!skip)keep.push(line);
 }
 const xmpp=['[OnlineSubsystemMcp.XMPP]',`ServerAddr="ws://${host}"`,'ServerPort=61099','bUseSSL=false'];
 fs.writeFileSync(file,[...xmpp,'',...keep].join('\r\n'),'utf8');
}
async function spawnGame(exe,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false});
  child.once('error',reject);
  child.once('spawn',()=>{child.unref();resolve();});
 });
}
function gameArgs(server,key){return [server,`-AUTH_PASSWORD=${key}`,
 '-AUTH_LOGIN=unused','-AUTH_TYPE=exchangecode','-epicapp=appidlol',
 '-epicenv=Prod','-EpicPortal','-epicusername=usernamelol',
 '-epicuserid=useridlol','-epiclocale=pt-BR',
 '-epicsandboxid=sandboxidlol','-epicdeploymentid=deploymentidlol','-NoEAC'];}

app.whenReady().then(()=>{
 createWindow();
 ipcMain.handle('settings:get',()=>load());
 ipcMain.handle('settings:pickRepo',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(r.canceled)return null;const c=load();c.repoPath=r.filePaths[0];save(c);return c;});
 ipcMain.handle('settings:pickLauncher',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Aplicativos Windows',extensions:['exe']}],properties:['openFile']});if(r.canceled)return null;const c=load();c.launcherExe=r.filePaths[0];save(c);return c;});
 ipcMain.handle('app:version',()=>app.getVersion());
 ipcMain.handle('invites:copy',(_event,code)=>{
  if(typeof code!=='string'||!/^[A-Z0-9-]{8,32}$/.test(code))return {ok:false,error:'Código de convite inválido.'};
  clipboard.writeText(code);
  return {ok:true};
 });
 ipcMain.handle('invites:status',async()=>{
  try{return {ok:true,...await inviteStatus(backendAddress())};}
  catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('invites:create',async(_event,description)=>{
  try{return {ok:true,...await createInvite(backendAddress(),await accountKey(),description)};}
  catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('server:status',()=>status());
 ipcMain.handle('server:start',()=>runLocked(startAll));
 ipcMain.handle('server:stop',()=>runLocked(stopOwned));
 ipcMain.handle('server:restart',()=>runLocked(async()=>{if(owned.size===0)throw new Error('Não há serviços iniciados por este launcher para reiniciar.');await stopOwned();return startAll();}));
 ipcMain.handle('game:play',()=>runLocked(async()=>{
  const c=load();const exe=gameExePath(c);
  if(!fs.existsSync(exe))throw new Error(`Executável do Dauntless 1.4.4 não encontrado: ${exe}`);
  await verifyGame(path.dirname(exe));
  const server=backendAddress();
  const key=await accountKey();
  const s=await startAll();
  configureChat(server);
  await spawnGame(exe,gameArgs(server,key));
  notify(`Dauntless 1.4.4 iniciado pelo cliente Win64, conectado a ${server}.`);
  return s;
 }));
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
// Preserve current behavior: services started by Fenys stop when Fenys exits.
app.on('before-quit',()=>{for(const child of owned.values()){try{child.kill('SIGTERM');}catch{}}});
