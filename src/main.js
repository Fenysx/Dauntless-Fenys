'use strict';
const {app,BrowserWindow,ipcMain,dialog,safeStorage}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {parseServerAddress,requestApi,createInvite,registerPlayer,getAdminAccounts}=require('./fenys-api');
const {revokePlayer}=require('./fenys-host-admin');
const os=require('node:os');
const {ProfileVault,checkUsername,checkPassword}=require('./fenys-profiles');
const {RoamingClient,roamingRequest}=require('./fenys-roaming-client');
const {tailscaleAddresses}=require('./fenys-host-setup');
const {CloudClient}=require('./fenys-cloud-client');
const {call:cloudRequest}=require('./fenys-cloud-protocol');
const {installCloud}=require('./fenys-cloud-setup');
let cloud;
let roaming;
let connectionBusy=false;
let connectionCursor=null, connectionMonitorProfile=null,monitorBusy=false;
let win;
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.focus();}});
let vault;
let activeGame=null;
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
function defaults(){return {repoPath:path.join(app.getPath('home'),'dauntless-revived'),launcherExe:'',gameKeyFile:'',gameServer:'',adminKeyFile:'',accountFiles:{},cloudRole:null,cloudAuthority:null};}
function load(){try{return {...defaults(),...JSON.parse(fs.readFileSync(configFile(),'utf8'))};}catch{return defaults();}}
function save(c){fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(c,null,2));}
function tcp(port,host='127.0.0.1'){return new Promise(resolve=>{const s=net.connect({host,port});let done=false;const finish=x=>{if(done)return;done=true;s.destroy();resolve(x);};s.setTimeout(1000);s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.once('timeout',()=>finish(false));});}
function hostedOnThisPC(server){
 const sv=parseServerAddress(server);
 if(sv.local)return true;
 for(const devices of Object.values(os.networkInterfaces())){
  for(const item of devices||[]){
   if(item.family==='IPv4'&&item.address===sv.host)return true;
  }
 }
 return false;
}
async function assertOnlineAdmin(){
 vault.requireAdmin();
 const profile=await requestApi(backendAddress(),'/undaunted/api/GetUserInfo',{key:await accountKey()});
 if(profile.IsAdmin!==true)throw new Error('O Metagame não confirma permissão de administrador para esta conta.');
}
async function status(){
 const sv=parseServerAddress(backendAddress());
 return {metagame:await tcp(sv.port,sv.host),deploy:hostedOnThisPC(sv.address)?await tcp(PORTS.deploy):false,owned:vault.current()?.role==='admin'?[...owned.keys()]:[],remote:!hostedOnThisPC(sv.address),server:sv.address};
}
function notify(msg){if(vault?.current()?.role==='admin'&&win&&!win.isDestroyed())win.webContents.send('activity',String(msg));}
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
async function startAll(){if(!hostedOnThisPC(backendAddress()))throw new Error('Serviço remoto: somente o computador hospedeiro pode iniciar o servidor.');let s=await status();if(!s.metagame){notify('Iniciando Metagame…');launchService('metagame',DIRS.metagame);}if(!s.deploy){notify('Iniciando DeployServer…');launchService('deploy',DIRS.deploy);}return waitReady();}
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
 const current=vault?.current();
 if(current)return parseServerAddress(cloud?.state(current).global?cloud.state(current).server:roaming?.state(current).server||current.server).address;
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

async function originalAccountKey(){
 vault.requireLogin();
 if(!canProtectAccount())throw new Error('Proteção de credenciais indisponível.');
 const key=safeStorage.decryptString(vault.encryptedKey()).trim();
 if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw new Error('Chave deste perfil inválida.');
 return key;
}
async function accountKey(){const me=vault.requireLogin();if(cloud.state(me).global){cloud.requireReady(me);return originalAccountKey();}return roaming.key(me,await originalAccountKey());}
function assertGameClosed(){if(activeGame&&activeGame.exitCode===null)throw new Error('Feche o jogo antes de trocar de servidor ou perfil.');}
function connectionNote(message){if(win&&!win.isDestroyed())win.webContents.send('connection-activity',String(message));}
async function connectionAction(fn){
 if(connectionBusy||busy)throw new Error('Aguarde a operação atual.');
 assertGameClosed();connectionBusy=true;
 try{return await fn();}finally{connectionBusy=false;}
}
function hostApiAddress(me){const sv=parseServerAddress(me.server);return hostedOnThisPC(me.server)?'127.0.0.1:'+sv.port:sv.address;}
async function monitorConnection(){
 const me=vault?.current();if(!me||monitorBusy||connectionBusy)return;monitorBusy=true;
 try{
  if(connectionMonitorProfile!==me.id){connectionCursor=null;connectionMonitorProfile=me.id;}
  const settings=load(),globalState=cloud.state(me);
  if(settings.cloudRole||globalState.global){
   const portable=await cloud.poll(me,await originalAccountKey());
   if(portable)for(const event of portable.events||[])connectionNote(event.name+(event.kind==='joined'?' entrou no servidor.':' saiu do servidor.'));
   let presence=portable?.players;
   if(me.role==='admin'&&settings.cloudRole){
    const data=await cloudRequest('127.0.0.1:61000','events',{cursor:connectionCursor},await originalAccountKey());
    for(const event of data.events||[])connectionNote(event.name+(event.kind==='joined'?' entrou no seu servidor.':' saiu do seu servidor.'));
    connectionCursor=data.cursor;if(!globalState.global||hostedOnThisPC(globalState.server))presence=data.players;
   }
   if(presence&&win&&!win.isDestroyed())win.webContents.send('connection-presence',presence);
   return;
  }

  const portable=await roaming.poll(me);
  const ownHost=me.role==='admin'&&hostedOnThisPC(me.server);
  if(portable&&(!ownHost||roaming.state(me).connected)){
   for(const event of portable.events||[])connectionNote(event.name+(event.kind==='joined'?' entrou no servidor.':' saiu do servidor.'));
  }
  const data=ownHost?await roamingRequest(hostApiAddress(me),'events',{cursor:connectionCursor},await originalAccountKey()):portable;
  if(data){
   if(ownHost){
    for(const event of data.events||[])connectionNote(event.name+(event.kind==='joined'?' entrou no seu servidor.':' saiu do seu servidor.'));
    connectionCursor=data.cursor;
   }
   const presence=roaming.state(me).connected?portable?.players:data.players;
   if(presence&&win&&!win.isDestroyed())win.webContents.send('connection-presence',presence);
  }
 }catch{}finally{monitorBusy=false;}
}
async function legacyAccountKey(){
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
 const me=vault.requireLogin();
 const key=await accountKey();
 const server=backendAddress();
 const data=await requestApi(server,'/undaunted/api/ServerStatus',{key});
 if(!data || !Array.isArray(data.players))throw new Error('A API não retornou a lista de jogadores.');
 if(data.limited===true)return {limited:true,count:0,players:[],server:backendAddress()};
 const players=data.players.slice(0,100).filter(p=>p&&typeof p.name==='string')
  .map(p=>({name:p.name.slice(0,32),where:['menu','city','hunt','dojo','tutorial','unknown'].includes(p.where)?p.where:'unknown'}));
 return {limited:false,count:Number.isFinite(data.playersOnline)?Math.min(100000,Math.max(0,Math.floor(data.playersOnline))):players.length,players,server:backendAddress()};
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
 if(activeGame&&activeGame.exitCode===null)throw new Error('Já existe uma instância do jogo aberta. Feche-a antes de trocar de conta.');
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
 vault=new ProfileVault(path.join(app.getPath('userData'),'fenys-auth'));
 roaming=new RoamingClient({directory:path.join(app.getPath('userData'),'personagens-portateis'),protect:value=>{
  if(!canProtectAccount())throw Error('Proteção de progresso indisponível neste computador.');return safeStorage.encryptString(value);
 },unprotect:value=>safeStorage.decryptString(value)});
 cloud=new CloudClient({directory:path.join(app.getPath('userData'),'conexoes-globais'),protect:value=>{if(!canProtectAccount())throw Error('Proteção de credenciais indisponível.');return safeStorage.encryptString(value);},unprotect:value=>safeStorage.decryptString(value)});
 createWindow();
 setInterval(()=>void monitorConnection(),10000).unref();
 const reply=async fn=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:e?.message||'Operação não concluída.'};}};
 function protect(key){
  if(!canProtectAccount())throw new Error('A proteção de credenciais do sistema está indisponível.');
  return safeStorage.encryptString(key);
 }
 ipcMain.handle('auth:state',()=>({current:vault.current(),profiles:vault.list()}));
 ipcMain.handle('auth:login',(_event,username,password)=>reply(async()=>{assertGameClosed();if(connectionBusy)throw Error('Sincronização em andamento.');return {current:vault.login(username,password)};}));
 ipcMain.handle('auth:logout',()=>reply(async()=>{assertGameClosed();if(connectionBusy)throw Error('Sincronização em andamento.');vault.logout();return {};}));
 ipcMain.handle('auth:reset',(_event,username,recoveryCode,newPassword)=>reply(async()=>vault.reset(username,recoveryCode,newPassword)));
 ipcMain.handle('auth:change',(_event,oldPassword,newPassword)=>reply(async()=>vault.changePassword(oldPassword,newPassword)));
 ipcMain.handle('auth:forgetLocal',(_event,password)=>reply(async()=>{assertGameClosed();if(roaming.read(vault.requireLogin()))throw Error('O perfil contém o único passaporte do personagem. Preserve-o para não perder acesso ao progresso.');vault.forgetLocalProfile(password);return {};}));
 ipcMain.handle('auth:import',(_event,username,password)=>reply(async()=>{
  checkUsername(username);checkPassword(password);
  if(vault.list().some(p=>p.username.toLowerCase()===String(username).trim().toLowerCase()))
   throw new Error('Esse login já existe neste computador.');
  const r=await dialog.showOpenDialog(win,{title:'Selecionar chave de uma conta Dauntless Revived existente',properties:['openFile'],filters:[{name:'Chave Dauntless',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)throw new Error('Seleção cancelada.');
  const server=backendAddress();
  const key=readKeyFile(r.filePaths[0]);
  const info=await requestApi(server,'/undaunted/api/GetUserInfo',{key});
  if(!info || typeof info.Username!=='string')throw new Error('Conta não reconhecida no servidor.');
  const created=vault.create({username,password,role:info.IsAdmin===true?'admin':'user',server,encryptedKey:protect(key)});
  return {...created,gameUsername:info.Username};
 }));
 ipcMain.handle('auth:register',(_event,username,password,inviteCode)=>reply(async()=>{
  checkUsername(username);checkPassword(password);
  if(vault.list().some(p=>p.username.toLowerCase()===String(username).trim().toLowerCase()))
   throw new Error('Esse login já existe neste computador.');
  const server=backendAddress();
  if(!canProtectAccount())throw new Error('Não é possível proteger a chave de conta neste sistema.');
  const key=await registerPlayer(server,username,inviteCode);
  return vault.create({username,password,role:'user',server,encryptedKey:protect(key)});
 }));
 ipcMain.handle('connection:state',()=>reply(async()=>{
  const me=vault.requireLogin(),settings=load(),state=cloud.state(me);
  return {...state,connected:state.global&&state.hostId!=='central',localRole:settings.cloudRole,authority:state.authority||settings.cloudAuthority,addresses:me.role==='admin'?tailscaleAddresses():[]};
 }));
 ipcMain.handle('connection:install',(_event,options)=>reply(async()=>connectionAction(async()=>{
  const me=vault.requireAdmin();
  if(!options||typeof options!=='object'||!['authority','host'].includes(options.role))throw Error('Selecione PC central ou host de jogo.');
  if(load().cloudRole&&load().cloudRole!==options.role)throw Error('Este computador já pertence à rede global. Mantenha a função configurada para preservar a autoridade dos dados.');
  if(roaming.read(me)&&!cloud.state(me).global&&roaming.state(me).connected)throw Error('Retorne o personagem portátil ao servidor original antes de ativar a nuvem global.');
  if(!load().cloudRole){const profile=await requestApi(me.server,'/undaunted/api/GetUserInfo',{key:await originalAccountKey()});if(profile.IsAdmin!==true)throw Error('Administrador local não confirmado.');}
  const online=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',{key:await originalAccountKey()});
  if(online.limited===true||!Array.isArray(online.players)||online.players.length)throw Error('Ative a rede global com todos os jogadores fora do jogo.');
  if(!owned.size)throw Error('Inicie os serviços por este launcher antes de ativar a integração global.');
  await stopOwned();if(await tcp(PORTS.metagame)||await tcp(PORTS.deploy))throw Error('Há serviços externos ativos. Encerre-os antes de configurar.');
  const result=await installCloud(load().repoPath,{address:options.address,role:options.role,hostCode:String(options.hostCode||''),rcloneBinary:String(options.rcloneBinary||'rclone')});
  const config=load();config.cloudRole=result.role;config.cloudAuthority=result.authority;save(config);
  if(!await tcp(PORTS.metagame))launchService('metagame',DIRS.metagame);
  if(!await tcp(PORTS.deploy))launchService('deploy',DIRS.deploy);
  for(let i=0;i<35;i++){if(await tcp(PORTS.metagame)&&await tcp(PORTS.deploy))break;await new Promise(r=>setTimeout(r,1000));}
  const caps=await cloudRequest('127.0.0.1:61000','status');
  if(caps.role!==options.role)throw Error('O serviço reiniciado não confirmou a configuração global.');
  connectionNote(options.role==='authority'?'PC central ativado com banco único e backups criptografados no Drive.':'Host integrado ao banco global. Personagens e dados sociais antigos foram preservados na autoridade central.');return result;
 })));
 ipcMain.handle('connection:invite',()=>reply(async()=>{
  vault.requireAdmin();if(!load().cloudRole)throw Error('Ative a rede global neste host primeiro.');
  return cloudRequest('127.0.0.1:61000','invite',{},await originalAccountKey());
 }));
 ipcMain.handle('connection:enrollInvite',()=>reply(async()=>{
  vault.requireAdmin();if(load().cloudRole!=='authority')throw Error('Gere a autorização de host no PC central.');
  return cloudRequest('127.0.0.1:61000','enroll-invite',{},await originalAccountKey());
 }));
 ipcMain.handle('connection:backup',(_event,force)=>reply(async()=>{
  vault.requireAdmin();if(load().cloudRole!=='authority')throw Error('Os backups são controlados pelo PC central.');
  return cloudRequest('127.0.0.1:61000',force===true?'backup-now':'backup-status',{},await originalAccountKey(),300000);
 }));
 ipcMain.handle('connection:join',(_event,code)=>reply(async()=>connectionAction(async()=>{
  if(roaming.read(vault.requireLogin())&&!cloud.state(vault.current()).global&&roaming.state(vault.current()).connected)throw Error('Retorne ao servidor original antes da primeira conexão global.');
  const state=await cloud.connect(vault.requireLogin(),await originalAccountKey(),code);
  connectionNote('Conectado a '+state.server+' usando o mesmo personagem, nível e dados sociais globais.');return state;
 })));
 ipcMain.handle('connection:home',()=>reply(async()=>connectionAction(async()=>{
  const me=vault.requireLogin();
  if(!load().cloudRole&&!cloud.state(me).global&&roaming.read(me))return roaming.home(me,await originalAccountKey());
  return cloud.home(me,await originalAccountKey(),load().cloudAuthority);
 })));
 ipcMain.handle('connection:recover',()=>reply(async()=>connectionAction(async()=>cloud.recover(vault.requireLogin(),await originalAccountKey()))));
 ipcMain.handle('settings:get',()=>{
  const me=vault.current(),c=load();
  return {repoPath:me?.role==='admin'?c.repoPath:null,launcherExe:c.launcherExe,gameServer:backendAddress(),accountKeySelected:!!me,adminKeySelected:me?.role==='admin',role:me?.role||null};
 });
 ipcMain.handle('settings:setServer',(_event,value)=>reply(async()=>{
  if(vault.current())throw new Error('Saia da conta para configurar outro servidor. A conta atual permanece vinculada ao original.');
  const server=parseServerAddress(value).address;
  const c=load();c.gameServer=server;save(c);
  return {server};
 }));
 ipcMain.handle('settings:pickPlayerKey',()=>reply(async()=>{throw new Error('Saia e selecione Importar conta existente na tela de login.');}));
 ipcMain.handle('settings:pickAdminKey',()=>reply(async()=>{throw new Error('Entre com um perfil administrador validado pelo Metagame usando Importar conta existente.');}));
 ipcMain.handle('invites:create',(_event,name)=>reply(async()=>{
  vault.requireAdmin();
  return {code:await createInvite(backendAddress(),await accountKey(),name)};
 }));
 ipcMain.handle('account:register',()=>({ok:false,error:'Use Criar conta no painel de login com senha e convite.'}));
 ipcMain.handle('admin:accounts',(_event,offset)=>reply(async()=>{
  await assertOnlineAdmin();
  return getAdminAccounts(backendAddress(),await accountKey(),offset===undefined?0:offset);
 }));
 ipcMain.handle('admin:remove',(_event,accountId,typedName,offset)=>reply(async()=>{
  await assertOnlineAdmin();
  if(load().cloudRole==='host')throw new Error('A remoção de acesso global deve ser feita no PC central para preservar o banco correto.');
  if(!hostedOnThisPC(backendAddress()))throw new Error('A remoção só pode ser executada no computador que hospeda o Metagame.');
  const list=await getAdminAccounts(backendAddress(),await accountKey(),Number.isSafeInteger(offset)?offset:0);
  let match=list.accounts.find(x=>x.id===accountId);
  if(!match){
   // Bounded pagination: the administrator must first load the intended account.
   throw new Error('Conta não encontrada na lista atual. Atualize a página de jogadores.');
  }
  if(match.admin)throw new Error('Não é possível remover uma conta administradora.');
  if(match.name!==typedName)throw new Error('Para confirmar, digite o nome do jogador exatamente como aparece na lista.');
  if(!match.active)throw new Error('Este jogador já está sem credenciais de acesso.');
  const base=path.join(load().repoPath,DIRS.metagame);
  const backupDir=path.join(app.getPath('userData'),'backups-de-seguranca');
  const result=await revokePlayer(base,accountId,backupDir);
  notify('Acesso removido de '+result.name+'. Backup de segurança salvo na pasta do Fenys.');
  return {username:result.name,backupLocation:result.backup};
 }));
 ipcMain.handle('settings:pickRepo',async()=>{vault.requireAdmin();const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(r.canceled)return null;const c=load();c.repoPath=r.filePaths[0];save(c);return c;});
 ipcMain.handle('settings:pickLauncher',async()=>{vault.requireLogin();const r=await dialog.showOpenDialog(win,{filters:[{name:'Aplicativos Windows',extensions:['exe']}],properties:['openFile']});if(r.canceled)return null;const c=load();c.launcherExe=r.filePaths[0];save(c);return c;});
 ipcMain.handle('players:online',async()=>{
  try{return {ok:true,data:await playerOverview()};}
  catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('server:status',()=>{vault.requireLogin();return status();});
 ipcMain.handle('server:start',()=>runLocked(async()=>{vault.requireAdmin();return startAll();}));
 ipcMain.handle('server:stop',()=>runLocked(async()=>{vault.requireAdmin();return stopOwned();}));
 ipcMain.handle('server:restart',()=>runLocked(async()=>{vault.requireAdmin();if(owned.size===0)throw new Error('Não há serviços iniciados por este launcher para reiniciar.');await stopOwned();return startAll();}));
 ipcMain.handle('game:play',()=>runLocked(async()=>{
  const me=vault.requireLogin();
  if(connectionBusy)throw Error('Aguarde a sincronização do personagem.');
  if(!cloud.state(me).global&&roaming.state(me).portable&&!roaming.read(me).active)throw Error('Seu progresso está protegido no launcher. Volte ao servidor original ou conecte com um código antes de jogar.');
  if(process.platform!=='win32')throw new Error('O jogo no Linux ainda precisa de integração com Wine/Proton. O launcher Linux suporta as telas, não a execução do jogo.');
  const c=load();
  const exe=gameExePath(c);
  if(!fs.existsSync(exe))throw new Error(`Executável do Dauntless 1.4.4 não encontrado: ${exe}`);
  await verifyGame(path.dirname(exe));
  if(me.role==='admin'&&hostedOnThisPC(backendAddress()))await startAll();
  if(c.cloudAuthority&&!cloud.state(me).global)await cloud.home(me,await originalAccountKey(),c.cloudAuthority);
  if(cloud.state(me).global){
   cloud.requireReady(me);const caps=await cloudRequest(cloud.state(me).authority,'status');
   if(caps.realm!==cloud.state(me).realm)throw Error('A autoridade central mudou. Verifique a rede global antes de jogar.');
  }else{
   let caps=null;try{caps=await cloudRequest(backendAddress(),'status');}catch{}
   if(caps?.role==='host')throw Error('Este host usa a conta global. Abra Conectar servidor e cole o código de jogador antes de jogar.');
   if(caps?.role==='authority')await cloud.home(me,await originalAccountKey(),caps.authority);
  }

  const server=backendAddress();
  const key=await accountKey();
  const localAdmin=me.role==='admin'&&hostedOnThisPC(server);
  const s=localAdmin?await startAll():await status();
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
app.on('before-quit',()=>{for(const child of owned.values()){try{child.kill('SIGTERM');}catch{}}});

