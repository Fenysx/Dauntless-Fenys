'use strict';
const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {parseServerAddress,requestApi,createInvite,registerPlayer}=require('./fenys-api');
const {encodeConnection,decodeConnection}=require('./fenys-connection-code');
const {installServer,tailscaleAddresses}=require('./fenys-server-setup');
const {ProfileVault}=require('./fenys-profiles');
const {createTailscale}=require('./fenys-tailscale');
let tailscale;
let win;
let activeGame=null;
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>{if(win&&!win.isDestroyed())win.focus();});
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
function defaults(){return {repoPath:path.join(app.getPath('home'),'dauntless-revived'),launcherExe:'',gameKeyFile:'',gameServer:'',adminKeyFile:'',accountFiles:{}};}
function load(){try{return {...defaults(),...JSON.parse(fs.readFileSync(configFile(),'utf8'))};}catch{return defaults();}}
function save(c){fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(c,null,2));}
function tcp(port,host='127.0.0.1'){return new Promise(resolve=>{const s=net.connect({host,port});let done=false;const finish=x=>{if(done)return;done=true;s.destroy();resolve(x);};s.setTimeout(1000);s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.once('timeout',()=>finish(false));});}
async function status(){
 const sv=parseServerAddress(backendAddress());
 return {metagame:await tcp(sv.port,sv.host),deploy:sv.local?await tcp(PORTS.deploy):false,owned:[...owned.keys()],remote:!sv.local,server:sv.address};
}
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
async function startAll(){if(!parseServerAddress(backendAddress()).local)throw new Error('Serviço remoto: somente o administrador inicia o servidor na máquina hospedeira.');let s=await status();if(!s.metagame){notify('Iniciando Metagame…');launchService('metagame',DIRS.metagame);}if(!s.deploy){notify('Iniciando DeployServer…');launchService('deploy',DIRS.deploy);}return waitReady();}
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
 const c=load();
 let raw=String(c.gameServer||'').trim();
 if(!raw){
  const legacy=path.join(friendKitDir(),'settings.json');
  if(fs.existsSync(legacy)){
   try{const v=JSON.parse(fs.readFileSync(legacy,'utf8'));if(typeof v.Server==='string')raw=v.Server;}
   catch{throw new Error('Configuração legada DauntlessRevived/settings.json inválida.');}
  }
 }
 return parseServerAddress(raw).address;
}
function canProtectAccount(){
 // Linux basic_text does not provide useful system-level encryption.
 return safeStorage.isEncryptionAvailable() &&
  !(process.platform==='linux'&&typeof safeStorage.getSelectedStorageBackend==='function'&&safeStorage.getSelectedStorageBackend()==='basic_text');
}
function readKeyFile(file){
 if(path.extname(file).toLowerCase()==='.bin'){
  if(!canProtectAccount())throw new Error('Proteção de credenciais indisponível neste computador.');
  const key=safeStorage.decryptString(fs.readFileSync(file)).trim();
  if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw new Error('Chave de conta protegida inválida.');
  return key;
 }
 const raw=fs.readFileSync(file,'utf8').trim();
 const parts=raw.split(/\r?\n/);
 const key=parts.length===3&&parts[0]==='DRK2'?parts[2]:raw;
 if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw new Error('Arquivo não contém uma chave de conta Dauntless Revived válida.');
 return key;
}

function restoreSavedKeys(){
 // Recover safeStorage ciphertext from the old login layer without a password.
 // Keep profiles and existing key files intact so no account is lost on upgrade.
 const c=load();if(c.directAccessRestored)return;
 try{
  const profiles=new ProfileVault(path.join(app.getPath('userData'),'fenys-auth')).read().profiles;
  for(const profile of [...profiles].sort((a,b)=>(a.role==='admin')-(b.role==='admin'))){
   if(typeof profile.key!=='string')continue;
   const server=parseServerAddress(profile.server).address;
   const file=path.join(app.getPath('userData'),'contas-recuperadas',profile.id+'.bin');
   if(!/^[-a-f0-9]{36}$/i.test(profile.id))continue;
   fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
   if(!fs.existsSync(file))fs.writeFileSync(file,Buffer.from(profile.key,'base64'),{mode:0o600,flag:'wx'});
   c.accountFiles={...(c.accountFiles||{})};
   if(!c.accountFiles[server]||!fs.existsSync(c.accountFiles[server]))c.accountFiles[server]=file;
   if(parseServerAddress(server).local&&profile.role==='admin'&&(!c.adminKeyFile||!fs.existsSync(c.adminKeyFile)))c.adminKeyFile=file;
  }
  c.directAccessRestored=true;save(c);
 }catch(e){notify('Não foi possível recuperar a chave do perfil anterior: '+e.message+'. Selecione sua chave em Configurações.');}
}
function assertGameClosed(){if(activeGame&&activeGame.exitCode===null)throw Error('Feche o jogo antes de trocar de servidor.');}
async function localAdminKey(){
 const c=load();
 const candidates=[c.adminKeyFile,c.gameKeyFile,c.accountFiles?.['127.0.0.1:61000'],path.join(friendKitDir(),'account.key')];
 for(const file of [...new Set(candidates)].filter(Boolean)){
  if(!fs.existsSync(file))continue;
  let key;try{key=readKeyFile(file);}catch{continue;}
  const info=await requestApi('127.0.0.1:61000','/undaunted/api/GetUserInfo',{key});
  if(info.IsAdmin===true)return key;
 }
 throw Error('Selecione a chave da conta administradora em Configurações. Você pode ligar o servidor antes disso.');
}
let previousPlayers=null,monitorBusy=false;
async function monitorPlayers(){
 if(monitorBusy)return;monitorBusy=true;
 try{
  const c=load(),file=c.adminKeyFile||c.gameKeyFile||c.accountFiles?.['127.0.0.1:61000']||path.join(friendKitDir(),'account.key');
  if(!fs.existsSync(file))return;
  const data=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',{key:readKeyFile(file)});
  if(data.limited===true||!Array.isArray(data.players))return;
  const names=new Set(data.players.filter(p=>typeof p?.name==='string').map(p=>p.name));
  if(previousPlayers){
   for(const name of names)if(!previousPlayers.has(name))notify(name+' entrou no seu servidor.');
   for(const name of previousPlayers)if(!names.has(name))notify(name+' saiu do seu servidor.');
  }
  previousPlayers=names;
 }catch{}finally{monitorBusy=false;}
}

async function accountKey(){
 const c=load();
 const server=backendAddress();
 const own=c.accountFiles && c.accountFiles[server];
 const local=parseServerAddress(server).local;
 let file=own || (local ? (c.gameKeyFile || path.join(friendKitDir(),'account.key')) : '');
 if(!file && !local)throw new Error('Cadastre sua conta com um convite na aba Convites antes de jogar neste servidor.');
 if(!fs.existsSync(file)){
  if(!local)throw new Error('Sua chave para este servidor não foi encontrada. Consulte o administrador.');
  const r=await dialog.showOpenDialog(win,{title:'Selecione sua chave de conta Dauntless Revived',properties:['openFile'],filters:[{name:'Chaves de conta',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)throw new Error('Chave de conta não selecionada.');
  file=r.filePaths[0];c.gameKeyFile=file;save(c);
 }
 return readKeyFile(file);
}

async function playerOverview(){
 const server=backendAddress();
 const c=load();
 const linked=c.accountFiles && c.accountFiles[server];
 const local=parseServerAddress(server).local;
 const file=linked&&fs.existsSync(linked) ? linked : (local ? c.gameKeyFile||path.join(friendKitDir(),'account.key') : null);
 let key;
 if(file&&fs.existsSync(file)){
  try{key=readKeyFile(file);}catch{key=undefined;}
 }
 const data=await requestApi(server,'/undaunted/api/ServerStatus',key?{key}:{});
 if(!data || !Array.isArray(data.players))throw new Error('A API não retornou a lista de jogadores.');
 if(data.limited===true)return {limited:true,count:0,players:[],server};
 const players=data.players.slice(0,100).filter(p=>p&&typeof p.name==='string')
   .map(p=>({name:p.name.slice(0,32),where:['menu','city','hunt','dojo','tutorial','unknown'].includes(p.where)?p.where:'unknown'}));
 return {limited:false,count:Number.isFinite(data.playersOnline)?Math.min(100000,Math.max(0,Math.floor(data.playersOnline))):players.length,players,server};
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
 if(activeGame&&activeGame.exitCode===null)throw Error('O jogo já está aberto.');
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false});
  child.once('error',err=>{if(activeGame===child)activeGame=null;reject(err);});
  child.once('spawn',()=>{activeGame=child;child.unref();resolve();});
  child.once('exit',()=>{if(activeGame===child)activeGame=null;});
 });
}
function gameArgs(server,key){return [server,`-AUTH_PASSWORD=${key}`,
 '-AUTH_LOGIN=unused','-AUTH_TYPE=exchangecode','-epicapp=appidlol',
 '-epicenv=Prod','-EpicPortal','-epicusername=usernamelol',
 '-epicuserid=useridlol','-epiclocale=pt-BR',
 '-epicsandboxid=sandboxidlol','-epicdeploymentid=deploymentidlol','-NoEAC'];}

app.whenReady().then(()=>{
 tailscale=createTailscale({installerDirectory:path.join(app.getPath('userData'),'instaladores-tailscale'),openExternal:url=>shell.openExternal(url),openInstaller:file=>shell.openPath(file),onProgress:notify});
 restoreSavedKeys();
 createWindow();
 setInterval(()=>void monitorPlayers(),10000).unref();
 const vpnReply=async fn=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:e.message||'Não foi possível configurar o Tailscale.'};}};
 ipcMain.handle('tailscale:status',()=>vpnReply(()=>tailscale.status()));
 ipcMain.handle('tailscale:install',()=>vpnReply(()=>tailscale.install()));
 ipcMain.handle('tailscale:connect',()=>vpnReply(()=>tailscale.connect()));
 ipcMain.handle('tailscale:background',()=>vpnReply(()=>tailscale.background()));
 ipcMain.handle('tailscale:share',()=>vpnReply(async()=>{await shell.openExternal('https://login.tailscale.com/admin/machines');return {message:'No painel Tailscale, encontre este PC e use Share para compartilhar com seu amigo. Ele deve aceitar o convite na conta dele.'};}));
 ipcMain.handle('connection:addresses',()=>tailscaleAddresses());
 ipcMain.handle('connection:setup',(_event,address)=>runLocked(async()=>{
  assertGameClosed();
  if(!owned.size&&await tcp(PORTS.metagame))throw Error('O Metagame foi iniciado fora do Fenys. Encerre-o para configurar a conexão.');
  const wasRunning=owned.size>0;await stopOwned();
  if(await tcp(PORTS.metagame)||await tcp(PORTS.deploy))throw Error('Encerre os serviços externos antes de configurar.');
  try{
   await installServer(load().repoPath,address);
   const c=load();c.gameServer='127.0.0.1:61000';c.hostAddress=parseServerAddress(address).address;save(c);
   notify('Servidor configurado para receber jogadores pelo Tailscale.');
  }finally{if(wasRunning)await startAll();}
  return status();
 }));
 ipcMain.handle('connection:create',async(_event,address,name)=>{
  try{
   const sv=parseServerAddress(address);
   if(sv.port!==61000||!tailscaleAddresses().includes(sv.host))throw Error('Selecione o IP Tailscale deste PC.');
   if(!await tcp(sv.port,sv.host))throw Error('Configure o acesso Tailscale e inicie os serviços antes de gerar o código.');
   const invite=await createInvite('127.0.0.1:61000',await localAdminKey(),name);
   return {ok:true,code:encodeConnection(sv.address,invite)};
  }catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('connection:join',async(_event,code,username)=>{
  let locked=false;
  try{
   if(busy)throw Error('Aguarde a operação atual.');
   assertGameClosed();busy=true;locked=true;
   const {server,invite}=decodeConnection(code),c=load();
   const file=c.accountFiles?.[server];
   if(file&&fs.existsSync(file)){
    const info=await requestApi(server,'/undaunted/api/GetUserInfo',{key:readKeyFile(file)});
    if(typeof info.Username!=='string')throw Error('Conta não reconhecida neste servidor.');
   }else{
    if(!canProtectAccount())throw Error('Proteção de credenciais indisponível neste computador.');
    const key=await registerPlayer(server,username,invite);
    const dir=path.join(app.getPath('userData'),'contas',crypto.randomUUID()),target=path.join(dir,'account.bin');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(target,safeStorage.encryptString(key),{mode:0o600,flag:'wx'});
    c.accountFiles={...(c.accountFiles||{}),[server]:target};
   }
   c.gameServer=server;save(c);
   notify('Conectado ao servidor '+server+'. Clique Jogar Agora para entrar na partida.');
   return {ok:true,server};
  }catch(e){return {ok:false,error:e.message};}finally{if(locked)busy=null;}
 });
 ipcMain.handle('settings:get',()=>{
  const {adminKeyFile,...safe}=load();
  const server=backendAddress();
  const c=load();
  const linked=c.accountFiles && c.accountFiles[server];
  const local=parseServerAddress(server).local;
  const localKey=local ? (c.gameKeyFile || path.join(friendKitDir(),'account.key')) : null;
  return {...safe,adminKeySelected:Boolean(adminKeyFile),accountKeySelected:Boolean((linked&&fs.existsSync(linked))||(localKey&&fs.existsSync(localKey))),gameServer:server};
 });
 ipcMain.handle('settings:setServer',(_event,value)=>{
  assertGameClosed();
  const sv=parseServerAddress(value);
  const c=load();c.gameServer=sv.address;save(c);
  return {server:sv.address,remote:!sv.local};
 });
 ipcMain.handle('settings:pickPlayerKey',async()=>{
  const r=await dialog.showOpenDialog(win,{title:'Selecionar chave de sua conta existente',properties:['openFile'],filters:[{name:'Chave de conta',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)return {selected:false};
  const server=backendAddress();
  const key=readKeyFile(r.filePaths[0]);
  const info=await requestApi(server,'/undaunted/api/GetUserInfo',{key});
  if(!info || typeof info.Username!=='string')throw new Error('O servidor não reconheceu essa conta.');
  const c=load();c.accountFiles={...(c.accountFiles||{}),[server]:r.filePaths[0]};save(c);
  return {selected:true,username:info.Username};
 });
 ipcMain.handle('settings:pickAdminKey',async()=>{
  const r=await dialog.showOpenDialog(win,{title:'Escolha a chave da conta administradora (somente nesta máquina)',properties:['openFile'],filters:[{name:'Arquivo de chave',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)return {selected:Boolean(load().adminKeyFile)};
  readKeyFile(r.filePaths[0]);
  const c=load();c.adminKeyFile=r.filePaths[0];save(c);
  return {selected:true};
 });
 ipcMain.handle('invites:create',async(_event,name)=>{
  try{
   const code=await createInvite('127.0.0.1:61000',await localAdminKey(),name);
   return {ok:true,code};
  }catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('account:register',async(_event,username,inviteCode)=>{
  try{
   const server=backendAddress();
   const c=load();
   if(c.accountFiles&&c.accountFiles[server]&&fs.existsSync(c.accountFiles[server]))throw new Error('Já existe uma conta cadastrada para este servidor.');
   if(parseServerAddress(server).local && fs.existsSync(path.join(friendKitDir(),'account.key')))throw new Error('Este computador já possui uma conta local. Não cadastre outra por cima.');
   if(!canProtectAccount())throw new Error('O sistema de proteção de credenciais está indisponível. Não vamos criar uma conta sem proteger sua chave.');
   const key=await registerPlayer(server,username,inviteCode);
   const id=crypto.createHash('sha256').update(server).digest('hex').slice(0,20);
   const dir=path.join(app.getPath('userData'),'contas',id);
   const file=path.join(dir,'account.bin');
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   fs.writeFileSync(file,safeStorage.encryptString(key),{flag:'wx',mode:0o600});
   c.accountFiles={...(c.accountFiles||{}),[server]:file};save(c);
   return {ok:true,username:String(username).trim()};
  }catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('settings:pickRepo',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(r.canceled)return null;const c=load();c.repoPath=r.filePaths[0];save(c);return c;});
 ipcMain.handle('settings:pickLauncher',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Aplicativos Windows',extensions:['exe']}],properties:['openFile']});if(r.canceled)return null;const c=load();c.launcherExe=r.filePaths[0];save(c);return c;});
 ipcMain.handle('players:online',async()=>{
  try{return {ok:true,data:await playerOverview()};}
  catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('server:status',()=>status());
 ipcMain.handle('server:start',()=>runLocked(startAll));
 ipcMain.handle('server:stop',()=>runLocked(stopOwned));
 ipcMain.handle('server:restart',()=>runLocked(async()=>{if(owned.size===0)throw new Error('Não há serviços iniciados por este launcher para reiniciar.');await stopOwned();return startAll();}));
 ipcMain.handle('game:play',()=>runLocked(async()=>{
  if(process.platform!=='win32')throw new Error('O jogo no Linux ainda precisa de integração com Wine/Proton. O launcher Linux suporta as telas, não a execução do jogo.');
  const c=load();const exe=gameExePath(c);
  if(!fs.existsSync(exe))throw new Error(`Executável do Dauntless 1.4.4 não encontrado: ${exe}`);
  await verifyGame(path.dirname(exe));
  const server=backendAddress();
  const key=await accountKey();
  const s=parseServerAddress(server).local?await startAll():await status();
  if(!s.metagame)throw new Error('Servidor remoto offline. Confira o Tailscale e a porta 61000.');
  configureChat(server);
  await spawnGame(exe,gameArgs(server,key));
  notify(`Dauntless 1.4.4 iniciado pelo cliente Win64, conectado a ${server}.`);
  return s;
 }));
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
// Preserve current behavior: services started by Fenys stop when Fenys exits.
app.on('before-quit',()=>{tailscale?.dispose();for(const child of owned.values()){try{child.kill('SIGTERM');}catch{}}});
