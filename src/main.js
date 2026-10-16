'use strict';
const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const net=require('node:net');
const crypto=require('node:crypto');
const os=require('node:os');
const {spawn,execFile}=require('node:child_process');
const {inspectInstallation,renderReport}=require('./fenys-host-doctor');
const {parseEndpoint:parseServerAddress,lanIP}=require('./fenys-network');
const {startRelay}=require('./fenys-public-relay');
let publicRelay=null;
const {requestApi}=require('./fenys-api');
const {ProfileVault}=require('./fenys-profiles');
const {DirectGlobal}=require('./fenys-direct-global');
const {call:cloudRequest}=require('./fenys-cloud-protocol');
const {validateAuthorization}=require('./fenys-supabase');
const {findAuthorizationFile}=require('./fenys-authorization-discovery');
const {localNetworks,diagnose,resetConnectionPreferences}=require('./fenys-connection-preflight');
const {GoogleAuth}=require('./fenys-google-auth');
const {gameRuntime,gameLaunch}=require('./fenys-game-runtime');
const {GooglePlayer}=require('./fenys-google-player');
const {selectLocalServer}=require('./fenys-local-selection');
const {inspect:inspectTailscale}=require('./fenys-tailscale');
const {syncGameFiles}=require('./fenys-game-download');
const {parseRevivedInvite,safeSummary}=require('./fenys-revived-invite');
const revivedPublic=require('./fenys-revived-public');
const {verifyServerFiles,failureMessage}=require('./fenys-service-preflight');
const {probe:probeTailscaleHost}=require('./fenys-tailscale-probe');
const {verifyExistingCharacterSource,confirmGoogleRuntime}=require('./fenys-google-link-guard');
const {hostCall:googleHostCall}=require('./fenys-google-cloud');
const {signed:communitySigned}=require('./fenys-google-cloud');
const {community}=require('./fenys-community');
const {installGoogle}=require('./fenys-google-setup');
const {servicesOwnedByLauncher,verifyLegacyHostIdle,requirePublishingServices}=require('./fenys-service-state');
let googleAuth,googlePlayer;
let inspectedOriginalInvite=null; // in memory only; never saved to the cloud or disk
function originalKeyLocation(invite){
 const slug=crypto.createHash('sha256').update(invite.host+':'+invite.port+'#'+invite.fingerprint).digest('hex');
 return path.join(app.getPath('userData'),'contas-revived-original',slug+'.bin');
}
function originalAccountExists(invite){
 const c=load();
 return Boolean(c.revivedOriginal&&c.revivedOriginal.host===invite.host&&c.revivedOriginal.port===invite.port
  &&c.revivedOriginal.fingerprint===invite.fingerprint&&fs.existsSync(c.revivedOriginal.keyFile));
}
function readOriginalBackup(file,invite){
 if(path.extname(file).toLowerCase()==='.bin')return readKeyFile(file);
 const data=fs.readFileSync(file);
 if(data.length>8192||data.includes(0))throw Error('Selecione o backup de key exportado em texto pelo launcher original.');
 const raw=data.toString('utf8').trim();
 const parts=raw.split(/\r?\n/);
 let key;
 if(parts.length===3&&parts[0]==='DRK2'){
  if(parts[1]!=='-'&&parts[1]!==invite.fingerprint)throw Error('O backup foi criado para outro certificado TLS. Verifique o servidor com o administrador.');
  key=parts[2];
 }else{
  key=/^\s*Key:\s*(UUK_[a-f0-9]{48})\s*$/im.exec(raw)?.[1]||raw;
 }
 if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw Error('Backup inválido: exporte sua key pelo botão de backup do launcher original.');
 return key;
}
function saveOriginalAccount(invite,key,username){
 if(!canProtectAccount())throw Error('Proteção segura do Windows indisponível. Não é possível armazenar a key.');
 const file=originalKeyLocation(invite);
 if(fs.existsSync(file))throw Error('Já existe uma key protegida para este host; use a recuperação existente.');
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 fs.writeFileSync(file,safeStorage.encryptString(key),{flag:'wx',mode:0o600});
 const c=load();
 c.revivedOriginal={host:invite.host,port:invite.port,fingerprint:invite.fingerprint,keyFile:file,username};
 save(c);
}

// Keep existing protected accounts and settings when changing the product name.
const currentData=app.getPath('userData');
if(!fs.existsSync(path.join(currentData,'settings.json'))){
 for(const name of ['Dauntless Fenys','dauntless-fenys']){const legacy=path.join(app.getPath('appData'),name);if(fs.existsSync(path.join(legacy,'settings.json'))){app.setPath?.('userData',legacy);break;}}
}
let globalAccount;
let win;
let activeGame=null;
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>{if(win&&!win.isDestroyed())win.focus();});
const owned=new Map();
const startFailures=new Map();
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
function defaults(){return {repoPath:path.join(app.getPath('home'),'dauntless-revived'),launcherExe:'',gameInstallDir:'',gameKeyFile:'',gameServer:'',adminKeyFile:'',accountFiles:{}};}
function load(){try{return {...defaults(),...JSON.parse(fs.readFileSync(configFile(),'utf8'))};}catch{return defaults();}}
function save(c){fs.mkdirSync(path.dirname(configFile()),{recursive:true});fs.writeFileSync(configFile(),JSON.stringify(c,null,2));}
function tcp(port,host='127.0.0.1'){return new Promise(resolve=>{const s=net.connect({host,port});let done=false;const finish=x=>{if(done)return;done=true;s.destroy();resolve(x);};s.setTimeout(1000);s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.once('timeout',()=>finish(false));});}
async function status(){
 const sv=parseServerAddress(backendAddress());
 return {metagame:await tcp(PORTS.metagame),deploy:await tcp(PORTS.deploy),gameOnline:await tcp(sv.port,sv.host),owned:[...owned.keys()],remote:!hostedOnThisPC(sv.address),server:sv.address};
}
function hostedOnThisPC(server){const sv=parseServerAddress(server);if(sv.local)return true;try{return Object.values(os.networkInterfaces()).flat().some(x=>x?.family==='IPv4'&&x.address===sv.host);}catch{return false;}}
function notify(msg){if(win&&!win.isDestroyed())win.webContents.send('activity',String(msg));}
function launchService(name,dir){
 const base=path.join(load().repoPath,dir);
 if(!fs.existsSync(path.join(base,'dist','server.js'))||!fs.existsSync(path.join(base,'.env')))throw new Error(`${dir}: dist/server.js ou .env não encontrado. Compile/configure o serviço primeiro.`);
 startFailures.delete(name);
 const child=spawn(process.platform==='win32'?'node.exe':'node',['--env-file=.env','dist/server.js'],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});
 owned.set(name,child);
 child.stdout.on('data',d=>notify(`${name}: ${String(d).slice(0,400)}`));
 child.stderr.on('data',d=>notify(`${name} (erro): ${String(d).slice(0,400)}`));
 child.on('error',e=>{startFailures.set(name,failureMessage(name,{error:e.message}));notify(`${name}: ${e.message}`);});
 child.on('exit',(code,signal)=>{if(owned.get(name)===child)owned.delete(name);if(code!==0||signal)startFailures.set(name,failureMessage(name,{code,signal}));notify(`${name} finalizou (código ${code})`);});
}
async function waitReady(){for(let i=0;i<35;i++){const s=await status();if(s.metagame&&s.deploy)return s;for(const [name,online] of [['metagame',s.metagame],['deploy',s.deploy]])if(!online&&startFailures.has(name))throw Error(startFailures.get(name));await new Promise(r=>setTimeout(r,1000));}throw new Error('Metagame e DeployServer não responderam em 35 segundos. Confira a pasta do servidor, Node.js 24 e as mensagens em Atividades.');}
async function startAll(){let s=await status();const offline=[...(!s.metagame?['Metagame']:[]),...(!s.deploy?['DeployServer']:[])];verifyServerFiles(load().repoPath,offline);for(const [name] of [['metagame'],['deploy']])startFailures.delete(name);if(!s.metagame){notify('Iniciando Metagame…');launchService('metagame',DIRS.metagame);}if(!s.deploy){notify('Iniciando DeployServer…');launchService('deploy',DIRS.deploy);}return waitReady();}
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
 if(c.googleSelected&&c.googleServer)return parseServerAddress(c.googleServer).address;
 let state;try{state=globalAccount?.state();}catch{}if(state?.global)return parseServerAddress(state.server).address;
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
 if(c.googleHost&&googleAuth?.state().signedIn){try{const key=await googlePlayer.credential(),info=await requestApi('127.0.0.1:61000','/undaunted/api/GetUserInfo',{key});if(info.IsAdmin===true)return key;}catch{}}
 const candidates=[c.adminKeyFile,c.gameKeyFile,c.accountFiles?.['127.0.0.1:61000'],path.join(friendKitDir(),'account.key')];
 for(const file of [...new Set(candidates)].filter(Boolean)){
  if(!fs.existsSync(file))continue;
  let key;try{key=readKeyFile(file);}catch{continue;}
  try{const info=await requestApi('127.0.0.1:61000','/undaunted/api/GetUserInfo',{key});if(info.IsAdmin===true)return key;}catch{}
 }
 throw Error('Selecione a chave da conta administradora em Configurações. Você pode ligar o servidor antes disso.');
}
let previousPlayers=null,monitorBusy=false,cloudCursor=null;
async function monitorPlayers(){
 if(monitorBusy)return;monitorBusy=true;
 try{
  if(!load().googleSelected&&!load().googleHost)await globalAccount?.poll().catch(()=>{});
  if(load().cloudRole){
   const role=load().cloudRole,data=await cloudRequest('127.0.0.1:61000','events',{cursor:cloudCursor},role==='authority'?await localAdminKey():undefined);
   const names=new Set((data.players||[]).map(p=>p.name));
   const reported=new Set();for(const event of data.events||[]){notify(event.name+(event.kind==='joined'?' conectou ao seu servidor.':' saiu do seu servidor.'));reported.add(event.name);}
   if(previousPlayers){for(const name of names)if(!previousPlayers.has(name)&&!reported.has(name))notify(name+' conectou ao seu servidor.');for(const name of previousPlayers)if(!names.has(name)&&!reported.has(name))notify(name+' saiu do seu servidor.');}cloudCursor=data.cursor;previousPlayers=names;return;
  }
  const key=await localAdminKey();
  const data=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',{key});
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
 if(load().googleSelected)return googlePlayer.key();
 if(globalAccount?.state().global){globalAccount.ready();return globalAccount.key();}
 const c=load();
 const server=backendAddress();
 const own=c.accountFiles && c.accountFiles[server];
 const local=hostedOnThisPC(server);
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
 let key=c.googleSelected?await googlePlayer.credential():globalAccount?.state().global?globalAccount.key():undefined;
 if(!key&&file&&fs.existsSync(file)){
  try{key=readKeyFile(file);}catch{key=undefined;}
 }
 const data=await requestApi(server,'/undaunted/api/ServerStatus',key?{key}:{});
 if(!data || !Array.isArray(data.players))throw new Error('A API não retornou a lista de jogadores.');
 if(data.limited===true)return {limited:true,count:0,players:[],server};
 const players=data.players.slice(0,100).filter(p=>p&&typeof p.name==='string')
   .map(p=>({name:p.name.slice(0,32),where:['menu','city','hunt','dojo','tutorial','unknown'].includes(p.where)?p.where:'unknown'}));
 return {limited:false,count:Number.isFinite(data.playersOnline)?Math.min(100000,Math.max(0,Math.floor(data.playersOnline))):players.length,players,server};
}
function configureChat(server,localAppData,chatPort=61099){
 // As in friend-kit/play.ps1: do not let the legacy 1.4.4 XMPP profile contact Epic.
 const host=server.split(':')[0];
 const iniDir=path.join(localAppData,'Archon','Saved','Config','WindowsClient');
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
 const xmpp=['[OnlineSubsystemMcp.XMPP]',`ServerAddr="ws://${host}"`,`ServerPort=${chatPort}`,'bUseSSL=false'];
 fs.writeFileSync(file,[...xmpp,'',...keep].join('\r\n'),'utf8');
}
async function spawnGame(exe,args,runtime){
 if(activeGame&&activeGame.exitCode===null)throw Error('O jogo já está aberto.');
 return new Promise((resolve,reject)=>{
  const launch=gameLaunch(runtime,exe,args);
  const child=spawn(launch.command,launch.args,launch.options);
  child.once('error',err=>{if(activeGame===child)activeGame=null;reject(err);});
  child.once('spawn',()=>{activeGame=child;child.unref();resolve();});
  child.once('exit',()=>{if(activeGame===child){activeGame=null;const relay=publicRelay;publicRelay=null;void relay?.close();}});
 });
}
function gameArgs(server,key){return [server,`-AUTH_PASSWORD=${key}`,
 '-AUTH_LOGIN=unused','-AUTH_TYPE=exchangecode','-epicapp=appidlol',
 '-epicenv=Prod','-EpicPortal','-epicusername=usernamelol',
 '-epicuserid=useridlol','-epiclocale=pt-BR',
 '-epicsandboxid=sandboxidlol','-epicdeploymentid=deploymentidlol','-NoEAC'];}

app.whenReady().then(()=>{
 const googleProtected=typeof safeStorage.isEncryptionAvailable==='function'&&canProtectAccount();
 googleAuth=new GoogleAuth({directory:path.join(app.getPath('userData'),'conta-google'),protect:googleProtected?v=>safeStorage.encryptString(v):null,unprotect:googleProtected?v=>safeStorage.decryptString(v):null,openExternal:url=>shell.openExternal(url)});
 googlePlayer=new GooglePlayer({auth:googleAuth,settings:load,saveSettings:save});
 globalAccount=new DirectGlobal({directory:path.join(app.getPath('userData'),'conta-global'),settings:load,protect:value=>{if(!canProtectAccount())throw Error('Proteção de credenciais indisponível.');return safeStorage.encryptString(value);},unprotect:value=>safeStorage.decryptString(value)});
 restoreSavedKeys();
 createWindow();
 setInterval(()=>void monitorPlayers(),10000).unref();
 const vpnReply=async fn=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:e.message||'Não foi possível concluir a operação.'};}};
 const previousAccount=()=>{const c=load();if(globalAccount.hasKey())return {key:globalAccount.key(),server:globalAccount.state().authority||c.cloudAuthority||'127.0.0.1:61000'};const server=c.cloudRole==='host'?c.cloudAuthority:backendAddress(),file=c.accountFiles?.[server]||c.accountFiles?.[backendAddress()]||c.gameKeyFile||path.join(friendKitDir(),'account.key');return fs.existsSync(file)?{key:readKeyFile(file),server}:null;};
 const linkPrevious=async()=>{await googlePlayer.refresh();if(googlePlayer.profile.linked)return googlePlayer.state();const previous=previousAccount();if(!previous)throw Error('A chave original do personagem não foi encontrada. Selecione sua conta existente em Configurações; não crie outro personagem.');await verifyExistingCharacterSource({checkHost:()=>googleHostCall(previous.server,'status'),checkAccount:()=>requestApi(previous.server,'/undaunted/api/GetUserInfo',{key:previous.key})});return googlePlayer.link(previous.server,previous.key);};
 ipcMain.handle('google:state',()=>vpnReply(async()=>{if(googleAuth.state().signedIn&&!googlePlayer.profile&&!googlePlayer.busy)await googlePlayer.refresh();return {...googlePlayer.state(),configured:await googleAuth.provider(),hostEnabled:!!load().googleHost};}));
 ipcMain.handle('google:login',()=>vpnReply(async()=>{assertGameClosed();if(!googleAuth.state().signedIn)await googleAuth.login();await googlePlayer.refresh();if(!googlePlayer.profile.linked&&previousAccount()){try{await linkPrevious();}catch(e){return {...googlePlayer.state(),notice:e.message};}}return googlePlayer.state();}));
 ipcMain.handle('google:cancel',()=>{googleAuth.dispose();return {ok:true,...googlePlayer.state()};});
 ipcMain.handle('google:logout',()=>vpnReply(async()=>{assertGameClosed();return googlePlayer.signOut();}));
 ipcMain.handle('google:link',()=>vpnReply(async()=>{assertGameClosed();return linkPrevious();}));
 ipcMain.handle('google:refresh',()=>vpnReply(()=>googlePlayer.refresh()));
 ipcMain.handle('google:progressStatus',()=>vpnReply(async()=>{
  if(!googleAuth.state().signedIn)return {linked:false,active:false};
  const profile=await googlePlayer.refresh();
  if(!profile.linked)return {linked:false,active:false};
  const c=load(),server=c.googleSelected&&c.googleServer?c.googleServer:c.googleHost?'127.0.0.1:61000':null;
  if(!server)return {linked:true,active:false,unavailable:true,message:'Escolha um servidor Google para consultar o save em tempo real.'};
  return googleHostCall(server,'progress-status',{},await googleAuth.token());
 }));
 // Community directory: only Google JWTs are sent to Supabase (never service_role).
 const communityCall=async(operation,fields={})=>community(operation,fields,await googleAuth.token());
 ipcMain.handle('community:list',()=>vpnReply(()=>communityCall('list')));
 ipcMain.handle('community:inbox',()=>vpnReply(()=>communityCall('inbox')));
 ipcMain.handle('community:username',(_event,username)=>vpnReply(()=>communityCall('username',{username:String(username||'')})));
 ipcMain.handle('community:invite',(_event,serverId,target,tier,durationDays)=>vpnReply(()=>communityCall('invite',{serverId,target:String(target||''),tier,durationDays})));
 ipcMain.handle('community:decide',(_event,inviteId,decision)=>vpnReply(()=>communityCall('decide',{inviteId,decision})));
 ipcMain.handle('community:revoke',(_event,serverId,username)=>vpnReply(()=>communityCall('revoke',{serverId,username})));
 ipcMain.handle('community:publish',(_event,options)=>vpnReply(async()=>{
  assertGameClosed();requirePublishingServices(await status());const c=load();
  if(!c.googleHost||c.googleNetworkMode!=='public')throw Error('Ative primeiro seu servidor Google no modo Público — HTTPS. Esse modo exige endereço público e portas de partida configuradas.');
  await localAdminKey(); // Ownership of local native host; a Google login alone is insufficient.
  const file=path.join(c.repoPath,'UndauntedMetagame','fenys','google-host.json');
  if(!fs.existsSync(file))throw Error('Identidade do host não encontrada. Ative a integração Google antes de publicar.');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(config.address!==c.googleHostAddress)throw Error('Endereço do host alterado. Confirme a integração Google antes da publicação.');
  const status=await googleHostCall('127.0.0.1:61000','status');
  if(status.hostKey!==config.publicKey||status.registered!==true)throw Error('O host Google precisa estar ativo antes de publicar.');
  const authId=googleAuth.read()?.user?.id;
  if(!authId)throw Error('Entre com Google antes de publicar seu servidor.');
  const fields={authId,address:config.address,name:String(options?.name||'').trim(),description:String(options?.description||'').trim(),policy:options?.policy};
  return communityCall('register',{envelope:communitySigned(config,'community-register',fields)});
 }));
 ipcMain.handle('google:local',(_event,createNew=false,newName='')=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação atual.');assertGameClosed();busy=true;
  try{
   const caps=await googleHostCall('127.0.0.1:61000','status');
   if(caps.mode!=='google'||caps.registered!==true)throw Error('Inicie e integre o servidor local ao Google antes de vincular o personagem.');
   await googlePlayer.refresh();
   if(!googlePlayer.profile.linked&&previousAccount())await linkPrevious();
   if(!googlePlayer.profile.linked&&createNew!==true)throw Error('Nenhum personagem vinculado. Para preservar seu personagem antigo, vincule-o primeiro no servidor de origem.');
   return googlePlayer.home('127.0.0.1:61000',{allowCreateNew:createNew===true,newName});
  }finally{busy=null;}
 }));
 ipcMain.handle('community:join',(_event,serverId,createNew=false,newName='')=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação atual.');assertGameClosed();busy=true;
  try{
   const token=await googleAuth.token(),access=await community('access',{serverId},token);
   if(!access.managed||!access.allowed)throw Error(access.reason||'Você ainda não tem autorização para entrar neste servidor.');
   const caps=await googleHostCall(access.address,'status');
   if(caps.mode!=='google'||caps.registered!==true||caps.hostKey!==access.hostKey)throw Error('A identidade Google do servidor não confere com o catálogo.');
   await googlePlayer.refresh();
   if(!googlePlayer.profile.linked&&previousAccount())await linkPrevious();
   if(!googlePlayer.profile.linked&&createNew!==true)throw Error('Nenhum personagem vinculado ao Google. Vincule o personagem existente no servidor de origem ou confirme a criação do primeiro personagem.');
   const state=await googlePlayer.home(access.address,{allowCreateNew:createNew===true,newName});
   notify('Servidor da comunidade selecionado: '+access.address+'. O progresso será validado pelo Supabase.');
   return {...state,server:access.address};
  }finally{busy=null;}
 }));
 ipcMain.handle('google:playerInvite',()=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação atual.');
  const c=load(),state=await status();
  if(!state.metagame||!state.deploy)throw Error('Ligue Metagame e DeployServer em Hospedar servidor antes de convidar.');
  const caps=await googleHostCall('127.0.0.1:61000','status');
  if(caps?.mode!=='google'||caps.registered!==true)throw Error('Este servidor ainda não está integrado ao Google. Prepare o acesso Google no painel Hospedar servidor.');
  if(['lan','tailscale'].includes(c.googleNetworkMode||'lan')&&c.googleHostAddress){
   let lanCaps;
   try{lanCaps=await googleHostCall(c.googleHostAddress,'status');}
   catch{throw Error('A API Google responde em 127.0.0.1, mas não responde no endereço privado '+c.googleHostAddress+'. Verifique Wi-Fi, firewall do Windows, IP configurado e o Metagame antes de convidar seu amigo.');}
   if(lanCaps.hostKey!==caps.hostKey||lanCaps.registered!==true)throw Error('O endereço LAN não confirmou a identidade do host Google. Nenhum convite foi gerado.');
  }
  const invitation=await googleHostCall('127.0.0.1:61000','invite',{},null,await localAdminKey());
  if(typeof invitation?.code!=='string'||!invitation.code.startsWith('DLU3.'))throw Error('O servidor não retornou um convite de jogador válido.');
  return {code:invitation.code,expiresAt:invitation.expiresAt,networkMode:c.googleNetworkMode||'lan',address:caps.address};
 }));
 ipcMain.handle('google:friendJoin',(_event,invite,name='',allowCreateNew=false)=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação anterior.');
  assertGameClosed();
  if(!googleAuth.state().signedIn)throw Error('Entre com sua conta Google antes de usar o convite de seu amigo.');
  busy=true;
  try{
   const code=String(invite||'').trim();
   if(code.length>2048)throw Error('Convite muito longo.');
   let result;
   try{result=await googlePlayer.connect(code,String(name||'').trim(),{allowCreateNew:allowCreateNew===true});}
   catch(e){
    if(/fetch failed|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|timeout/i.test(String(e?.message||e)))throw Error('Não foi possível alcançar o servidor de seu amigo. Na mesma rede, confira IP e firewall. Em outra casa, é necessário HTTPS público e portas UDP de partida acessíveis. A conta e o personagem foram preservados.');
    throw e;
   }
   notify('Servidor do amigo selecionado e identidade Google confirmada. Confira a conexão e inicie o jogo.');
   return {...result,server:load().googleServer};
  }finally{busy=null;}
 }));
 ipcMain.handle('google:hostInvite',()=>vpnReply(async()=>googleHostCall('127.0.0.1:61000','host-invite',{},null,await localAdminKey())));
 ipcMain.handle('google:sync',(_event,force)=>vpnReply(async()=>googleHostCall('127.0.0.1:61000',force?'sync-now':'sync-status',{},null,await localAdminKey())));
 const activateGoogleHost=async options=>{
  if(busy)throw Error('Aguarde a operação atual.');assertGameClosed();busy=true;
  try{const live=await status();if(!servicesOwnedByLauncher(live))throw Error('Inicie Metagame e DeployServer pelo launcher antes de ativar Google. Encerre serviços externos com segurança.');if(!await googleAuth.provider())throw Error('Configure o provedor Google no Supabase antes de ativar este servidor. Os serviços atuais continuam disponíveis.');const c=load();
   if(c.cloudRole==='host'){await verifyLegacyHostIdle(()=>cloudRequest('127.0.0.1:61000','events',{cursor:null}),()=>googleHostCall(c.cloudAuthority,'status'));}
   else{const info=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',{key:await localAdminKey()});if(info.limited||info.players?.length)throw Error('Mantenha todos fora do jogo antes de configurar.');}
   const adminKey=await localAdminKey(); // Always verify actual admin permission, never trust the first configured key file.
   await stopOwned();if(await tcp(PORTS.metagame)||await tcp(PORTS.deploy))throw Error('Encerre os serviços externos antes de configurar.');
   let result;try{result=await installGoogle(c.repoPath,{address:options?.address,hostCode:String(options?.hostCode||'').trim(),authorizationFile:findAuthorizationFile(app.getPath('home'),c.supabaseAuthorizationFile),adminKey,networkMode:options?.networkMode,gameAddress:options?.gameAddress,certFile:c.publicCertFile,keyFile:c.publicKeyFile});}finally{await startAll();}
   await confirmGoogleRuntime({checkHost:()=>googleHostCall('127.0.0.1:61000','status'),expectedAddress:result.address});c.googleHost=true;c.googleGameAddress=options?.gameAddress||'';c.googleNetworkMode=result.networkMode;c.cloudRole=null;c.googleHostAddress=result.address;save(c);notify('Servidor integrado ao progresso Google no Supabase. Vincule os personagens existentes antes da primeira troca.');return result;
  }finally{busy=null;}
 };
 ipcMain.handle('google:activate',(_event,options)=>vpnReply(()=>activateGoogleHost(options)));
 ipcMain.handle('google:upgrade',()=>vpnReply(async()=>{
  const c=load();
  if(!c.googleHost||!c.googleHostAddress||!c.googleNetworkMode)throw Error('Configure a integração Google neste servidor antes de atualizar os saves.');
  const live=await googleHostCall('127.0.0.1:61000','status');
  if(live.mode!=='google'||live.registered!==true||live.address!==c.googleHostAddress)throw Error('O host Google não foi confirmado. Verifique a instalação antes de atualizar.');
  const upgraded=await activateGoogleHost({address:c.googleHostAddress,networkMode:c.googleNetworkMode,gameAddress:c.googleGameAddress||''});
  return {...upgraded,notice:'Sincronização automática atualizada no servidor. Progresso existente preservado.'};
 }));
 for(const [channel,field,title] of [['network:cert','publicCertFile','Selecionar certificado HTTPS (PEM / fullchain)'],['network:key','publicKeyFile','Selecionar chave privada HTTPS (PEM)']])ipcMain.handle(channel,async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title,properties:['openFile']});if(r.canceled)return false;const c=load();c[field]=r.filePaths[0];save(c);return true;});
 ipcMain.handle('google:authorization',()=>vpnReply(async()=>{
  const previous=load();
  const detected=findAuthorizationFile(app.getPath('home'),previous.supabaseAuthorizationFile);
  if(detected&&(!previous.supabaseAuthorizationFile||!fs.existsSync(previous.supabaseAuthorizationFile))){
   previous.supabaseAuthorizationFile=detected;save(previous);
   return {selected:true,automatic:true};
  }
  const r=await dialog.showOpenDialog(win,{title:'Selecionar autorização privada do PC central Supabase',properties:['openFile'],filters:[{name:'Autorização Supabase',extensions:['json']}]});
  if(r.canceled||!r.filePaths.length)return {selected:false};validateAuthorization(JSON.parse(fs.readFileSync(r.filePaths[0],'utf8')));const c=load();c.supabaseAuthorizationFile=r.filePaths[0];save(c);return {selected:true};
 }));
 ipcMain.handle('tailscale:status',()=>vpnReply(()=>inspectTailscale()));
 ipcMain.handle('tailscale:probeHost',(_event,address)=>vpnReply(()=>probeTailscaleHost(address,{checkTailscale:inspectTailscale})));
 ipcMain.handle('tailscale:open',(_event,target)=>vpnReply(async()=>{
  const links={download:'https://tailscale.com/download/windows',share:'https://login.tailscale.com/admin/machines'};
  if(!Object.hasOwn(links,target))throw Error('Destino Tailscale inválido.');
  await shell.openExternal(links[target]);
  return {opened:true};
 }));
 ipcMain.handle('tailscale:start',()=>runLocked(async()=>{
  assertGameClosed();
  const vpn=await inspectTailscale();
  if(!vpn.connected||!vpn.address)throw Error(vpn.message);
  const live=await startAll();
  const local='127.0.0.1:61000';
  let active=false,warning='';
  try{
   const c=load();
   if(c.googleHost&&c.googleNetworkMode==='tailscale'&&c.googleHostAddress===vpn.address+':61000'){
    const caps=await googleHostCall(local,'status');
    const viaVpn=await googleHostCall(c.googleHostAddress,'status');
    active=caps?.mode==='google'&&caps.registered===true&&viaVpn?.hostKey===caps.hostKey;
   }
  }catch(e){warning='Metagame iniciou, mas a integração Google ou o IP Tailscale ainda não respondeu.';}
  return {...live,tailscale:{address:vpn.address,ready:active,warning},
   message:active?'Servidor privado respondendo no Tailscale. Gere seu convite de jogador.':
    'Serviços iniciados. Prepare acesso Google escolhendo Tailscale para ativar convites sem abrir portas do roteador.'};
 }));
 ipcMain.handle('network:localIPv4',()=>({addresses:localNetworks().map(x=>x.address)}));
 ipcMain.handle('network:diagnose',()=>vpnReply(async()=>{
  const report=await diagnose();
  let services=null;try{services=await status();}catch{} // A configuracao legada pode estar invalida; a deteccao da rede continua disponivel.
  return {...report,services};
 }));
 ipcMain.handle('network:reset-legacy',()=>vpnReply(async()=>{
  assertGameClosed();
  if(busy)throw Error('Aguarde a operação atual terminar antes de limpar preferências.');
  const file=configFile(),current=load();
  const hostIdentity=path.join(current.repoPath,'UndauntedMetagame','fenys','google-host.json');
  const {config,removed}=resetConnectionPreferences(current,{hasActiveGoogleHost:!!current.googleHost||fs.existsSync(hostIdentity)});
  if(!removed.length)return {removed:[],message:'Sem preferências antigas para limpar. Google e contas preservados.'};
  if(fs.existsSync(file)){
   const backup=file+'.network-backup-'+Date.now();
   fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  }
  save(config);
  return {removed,message:'Preferências antigas de rede corrigidas. Contas, saves e credenciais foram preservados.'};
 }));
 // Read-only host setup state. Saved settings alone never prove Google integration:
 // older Metagame builds can respond with "Unstubbed route" for /launcher/google/status.
 ipcMain.handle('host:readiness',()=>vpnReply(async()=>{
  const c=load(),state=await status();
  let googleActive=false,googleReachable=false;
  if(state.metagame&&(c.googleHost||fs.existsSync(path.join(c.repoPath,'UndauntedMetagame','fenys','google-host.json')))){
   try{
    const caps=await googleHostCall('127.0.0.1:61000','status');
    googleReachable=caps?.mode==='google';
    googleActive=googleReachable&&caps.registered===true;
   }catch{} // A missing route means not ready, never success.
  }
  let adminValidated=false,adminProblem='';
  if(state.metagame){
   try{await localAdminKey();adminValidated=true;}
   catch(e){adminProblem=e.message;}
  }
  const identityFile=path.join(c.repoPath,'UndauntedMetagame','fenys','google-host.json');
  return {
   servicesReady:Boolean(state.metagame&&state.deploy),
   // Native Ramsgate/caçadas can need several GiB beyond the two Node services.
   nativeMemoryWarning:os.freemem()<3.5*1024*1024*1024,
   managedServices:servicesOwnedByLauncher(state),
   googleActive,googleReachable,googleConfigured:Boolean(c.googleHost),
   networkMode:c.googleNetworkMode||'lan',
   advertisedAddress:c.googleHostAddress||'',
   gameAddress:c.googleGameAddress||'',
   adminKeySelected:adminValidated,
   adminKeyValidated:adminValidated,
   adminProblem,
   googleHostDetected:googleReachable,
   authorizationSelected:Boolean(findAuthorizationFile(app.getPath('home'),c.supabaseAuthorizationFile)),
   identityPresent:fs.existsSync(identityFile),
   signedIn:Boolean(googleAuth.state().signedIn),
   publicCertSelected:Boolean(c.publicCertFile&&fs.existsSync(c.publicCertFile)),
   publicKeySelected:Boolean(c.publicKeyFile&&fs.existsSync(c.publicKeyFile))
  };
 }));
 ipcMain.handle('system:doctor',async()=>{
  // Electron embeds its own Node runtime (often older than the host's Node.js).
  // Check the exact external executable used by launchService instead.
  const binary=process.platform==='win32'?'node.exe':'node';
  const nodeVersion=await new Promise(resolve=>execFile(binary,['--version'],{encoding:'utf8',timeout:4000,windowsHide:true},(error,stdout)=>resolve(error?'unavailable':String(stdout).trim().replace(/^v/,''))));
  const report=inspectInstallation({serverDir:load().repoPath,checkSourceLayout:false,nodeVersion,freeMemoryBytes:os.freemem()});
  let providerMessage;
  try{providerMessage=await googleAuth.provider()?'Provedor habilitado no Supabase.':'Provedor desativado no Supabase.';}
  catch{providerMessage='Não foi possível consultar o Google OAuth (confira a internet).';}
  let hostMessage='Metagame offline. Inicie os serviços para verificar as rotas do host Google.';
  if(await tcp(PORTS.metagame)){
   try{
    const caps=await googleHostCall('127.0.0.1:61000','status');
    hostMessage=caps?.mode==='google'&&caps?.registered?
      'Integração Google ativa e host registrado. Confira o último save antes de migrar.':
      'Resposta recebida, mas host Google não está registrado. Confira a ativação do servidor.';
   }catch{
    hostMessage='Metagame está online, mas não confirmou /launcher/google/status. A integração Google não foi ativada neste servidor ou a versão local não contém as rotas. Não crie outro personagem.';
   }
  }
  return {ok:true,errors:report.errors,warnings:report.warnings,
   report:renderReport(report)+'\n\nLogin Google: '+providerMessage+'\nGoogle no servidor local: '+hostMessage};
 });
 ipcMain.handle('settings:get',()=>{
  const {adminKeyFile,publicKeyFile,publicCertFile,...safe}=load();
  const server=backendAddress();
  const c=load();
  const linked=c.accountFiles && c.accountFiles[server];
  const local=parseServerAddress(server).local;
  const localKey=local ? (c.gameKeyFile || path.join(friendKitDir(),'account.key')) : null;
  const original=c.revivedOriginal;
  return {...safe,revivedOriginalReady:Boolean(original?.keyFile&&fs.existsSync(original.keyFile)),platform:process.platform,publicCertSelected:!!publicCertFile,publicKeySelected:!!publicKeyFile,adminKeySelected:Boolean(adminKeyFile),accountKeySelected:Boolean((linked&&fs.existsSync(linked))||(localKey&&fs.existsSync(localKey))),gameServer:server};
 });
 ipcMain.handle('server:selectLocal',()=>vpnReply(()=>selectLocalServer({
  load,save,assertGameClosed,
  isGoogleSignedIn:()=>googleAuth.state().signedIn,
  checkGoogleHost:()=>googleHostCall('127.0.0.1:61000','status'),
  googleHome:address=>googlePlayer.home(address),
  globalState:()=>globalAccount.state(),
  globalHome:authority=>globalAccount.home(authority),
  localOnline:()=>tcp(PORTS.metagame)
 })));
 ipcMain.handle('settings:setServer',async(_event,value)=>{
  assertGameClosed();
  if(load().googleSelected){if(!parseServerAddress(value).local)throw Error('Use um código Google para trocar de servidor.');await googlePlayer.home('127.0.0.1:61000');return {server:backendAddress(),remote:false};}
  if(globalAccount.state().global){if(!parseServerAddress(value).local)throw Error('Use um código global para trocar de host com segurança.');await globalAccount.home(load().cloudAuthority);return {server:backendAddress(),remote:false};}
  const sv=parseServerAddress(value);
  const c=load();c.gameServer=sv.address;save(c);
  return {server:sv.address,remote:!sv.local};
 });
 ipcMain.handle('revived:inspectInvite',(_event,input)=>{
  const invite=parseRevivedInvite(input);
  inspectedOriginalInvite=invite; // No server request yet; this does not spend the code.
  return {ok:true,summary:safeSummary(invite),validFormat:true,
    message:invite.mode==='public'?'Convite público reconhecido. Para registrar, a conexão deve conferir o certificado TLS do servidor pelo fingerprint.':'Convite privado reconhecido. Para conectar, o Tailscale precisa estar acessível.'};
 });
 ipcMain.handle('revived:clearInvite',()=>{inspectedOriginalInvite=null;return {cleared:true};});
 ipcMain.handle('revived:register',(_event,username)=>runLocked(async()=>{
  if(!inspectedOriginalInvite||inspectedOriginalInvite.mode!=='public')
   throw Error('Primeiro confira um convite público v2 válido.');
  if(!canProtectAccount())throw Error('Criptografia de credenciais não está disponível neste computador.');
  if(originalAccountExists(inspectedOriginalInvite))throw Error('Esta conta já está registrada neste PC. Não crie outra.');
  const invite=inspectedOriginalInvite;
  const key=await revivedPublic.register(invite,String(username||'').trim());
  // A key is returned once. Save encrypted and stop if writing failed.
  saveOriginalAccount(invite,key,String(username).trim());
  inspectedOriginalInvite=null;
  return {registered:true,username:String(username).trim(),server:invite.name};
 }));
 ipcMain.handle('revived:importKey',()=>runLocked(async()=>{
  if(!inspectedOriginalInvite||inspectedOriginalInvite.mode!=='public')throw Error('Confira o convite do servidor original antes de importar.');
  if(originalAccountExists(inspectedOriginalInvite))throw Error('A key deste servidor já está protegida.');
  if(!canProtectAccount())throw Error('Criptografia local de credenciais indisponível.');
  const r=await dialog.showOpenDialog(win,{title:'Selecione o backup da sua key do Dauntless Revived',properties:['openFile'],filters:[{name:'Backup de conta',extensions:['key','txt','bin']}]});
  if(r.canceled||!r.filePaths.length)return {imported:false};
  const key=readOriginalBackup(r.filePaths[0],inspectedOriginalInvite);
  const result=await revivedPublic.validateAccount(inspectedOriginalInvite,key);
  saveOriginalAccount(inspectedOriginalInvite,key,result.username);
  inspectedOriginalInvite=null;
  return {imported:true,username:result.username};
 }));

 ipcMain.handle('game:chooseFolder',async()=>{
  assertGameClosed();
  const r=await dialog.showOpenDialog(win,{title:'Selecionar pasta do Dauntless 1.4.4',properties:['openDirectory','createDirectory']});
  if(r.canceled||!r.filePaths.length)return {selected:false};
  const c=load();c.gameInstallDir=r.filePaths[0];save(c);
  return {selected:true,folder:c.gameInstallDir};
 });
 ipcMain.handle('game:download',(_event,options)=>runLocked(async()=>{
  assertGameClosed();
  const folder=load().gameInstallDir;
  if(!folder)throw Error('Selecione uma pasta de instalação antes de baixar.');
  // The download key is supplied per session; never log or save it to settings.
  const configured=load().revivedOriginal;
  const useOriginal=!String(options?.manifestUrl||'').trim()&&Boolean(configured);
  if(useOriginal&&!fs.existsSync(configured.keyFile))throw Error('A key protegida deste servidor não foi encontrada.');
  const target=useOriginal?{mode:'public',host:configured.host,port:configured.port,fingerprint:configured.fingerprint}:null;
  const result=await syncGameFiles({
   manifestUrl:useOriginal?'https://'+target.host+(target.port===443?'':':'+target.port)+'/content/v1/manifest':options?.manifestUrl,
   key:useOriginal?readKeyFile(configured.keyFile):options?.key||'',
   folder,fetcher:useOriginal?revivedPublic.pinnedFetch(target):fetch,
   onProgress:progress=>{if(win&&!win.isDestroyed())win.webContents.send('download:progress',progress);}
  });
  // Auto-select only an installation whose three critical binaries match fixed pins.
  // Never execute content just because the remote manifest declared a matching hash.
  const candidate=path.join(folder,'Archon','Binaries','Win64',GAME_EXE);
  let verified=false;
  if(fs.existsSync(candidate)){
   try{
    await verifyGame(path.dirname(candidate));
    const c=load();c.launcherExe=candidate;save(c);
    verified=true;
   }catch(e){notify('Download concluído, mas a instalação ainda não foi aprovada: '+e.message);}
  }
  // Do not automatically launch binaries or overwrite Google/account settings.
  return {...result,verified};
 }));
 ipcMain.handle('game:verify',()=>runLocked(async()=>{
  const c=load(),exe=gameExePath(c);
  if(!fs.existsSync(exe))throw Error('Selecione o executável do jogo primeiro.');
  await verifyGame(path.dirname(exe));
  return {message:'Os três binários críticos do Dauntless 1.4.4 correspondem aos hashes fixados.'};
 }));
 ipcMain.handle('settings:backupPlayerKey',async()=>{
  const c=load(),server=backendAddress();
  const candidates=[c.accountFiles?.[server],c.gameKeyFile,
   parseServerAddress(server).local?path.join(friendKitDir(),'account.key'):null];
  const source=candidates.find(file=>file&&fs.existsSync(file));
  if(!source)throw Error('Nenhuma key local encontrada. Selecione a key original antes de criar o backup.');
  readKeyFile(source);
  const r=await dialog.showSaveDialog(win,{title:'Salvar backup privado da sua key',defaultPath:'Dauntless-Recuperacao.key',filters:[{name:'Arquivo de chave',extensions:['key']}]});
  if(r.canceled||!r.filePath)return {saved:false};
  if(path.resolve(source).toLowerCase()===path.resolve(r.filePath).toLowerCase())throw Error('Escolha outro arquivo para o backup.');
  fs.copyFileSync(source,r.filePath,fs.constants.COPYFILE_EXCL);
  return {saved:true};
 });
 ipcMain.handle('settings:pickPlayerKey',async()=>{
  assertGameClosed();
  const r=await dialog.showOpenDialog(win,{title:'Selecionar chave de sua conta existente',properties:['openFile'],filters:[{name:'Chave de conta',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)return {selected:false};
  const server=backendAddress();
  const key=readKeyFile(r.filePaths[0]);
  const info=await requestApi(server,'/undaunted/api/GetUserInfo',{key});
  if(!info || typeof info.Username!=='string')throw new Error('O servidor não reconheceu essa conta.');
  const c=load();c.accountFiles={...(c.accountFiles||{}),[server]:r.filePaths[0]};save(c);
  if(c.cloudRole||globalAccount.state().global)globalAccount.adopt(key,c.cloudAuthority||globalAccount.state().authority||server);
  return {selected:true,username:info.Username};
 });
 ipcMain.handle('settings:pickAdminKey',async()=>{
  const r=await dialog.showOpenDialog(win,{title:'Escolha a chave da conta administradora (somente nesta máquina)',properties:['openFile'],filters:[{name:'Arquivo de chave',extensions:['key','txt']}]});
  if(r.canceled||!r.filePaths.length)return {selected:Boolean(load().adminKeyFile)};
  readKeyFile(r.filePaths[0]);
  const c=load();c.adminKeyFile=r.filePaths[0];save(c);
  return {selected:true};
 });
 ipcMain.handle('settings:pickRepo',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(r.canceled)return null;const c=load();c.repoPath=r.filePaths[0];save(c);return c;});
 ipcMain.handle('settings:pickWine',async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title:'Selecionar executável Wine',properties:['openFile']});if(r.canceled)return null;const c=load();c.wineExecutable=r.filePaths[0];save(c);return {selected:true};});
 ipcMain.handle('settings:pickWinePrefix',async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title:'Selecionar ambiente Wine (pasta com drive_c e system.reg)',properties:['openDirectory']});if(r.canceled)return null;const dir=r.filePaths[0];if(!fs.existsSync(path.join(dir,'system.reg'))||!fs.existsSync(path.join(dir,'drive_c')))throw Error('Selecione um ambiente Wine já configurado com winecfg.');const c=load();c.winePrefix=dir;save(c);return {selected:true};});
 ipcMain.handle('settings:pickLauncher',async()=>{const r=await dialog.showOpenDialog(win,{filters:[{name:'Aplicativos Windows',extensions:['exe']}],properties:['openFile']});if(r.canceled)return null;const c=load();c.launcherExe=r.filePaths[0];save(c);return c;});
 ipcMain.handle('players:online',async()=>{
  try{return {ok:true,data:await playerOverview()};}
  catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('app:version',()=>app.getVersion());
 ipcMain.handle('server:status',()=>status());
 ipcMain.handle('server:start',()=>runLocked(startAll));
 ipcMain.handle('server:stop',()=>runLocked(stopOwned));
 ipcMain.handle('server:restart',()=>runLocked(async()=>{if(owned.size===0)throw new Error('Não há serviços iniciados por este launcher para reiniciar.');await stopOwned();return startAll();}));
 ipcMain.handle('game:play',()=>runLocked(async()=>{
  assertGameClosed();
  const c=load();const exe=gameExePath(c);
  if(!fs.existsSync(exe))throw new Error(`Executável do Dauntless 1.4.4 não encontrado: ${exe}`);
  await verifyGame(path.dirname(exe));
  const runtime=await gameRuntime(c,{home:app.getPath('home')});
  if(hostedOnThisPC(backendAddress()))await startAll();
  const googleCaps=await googleHostCall(backendAddress(),'status').catch(()=>null);
  if(googleCaps?.mode==='google'&&!load().googleSelected){if(!googleAuth.state().signedIn)throw Error('Clique em Continuar com Google antes de jogar.');if(previousAccount())await linkPrevious();await googlePlayer.home(hostedOnThisPC(backendAddress())?'127.0.0.1:61000':backendAddress());}
  const caps=load().googleSelected?null:await cloudRequest(backendAddress(),'status').catch(()=>null);
  if(caps?.role==='authority'&&!globalAccount.state().global){if(!globalAccount.hasKey())globalAccount.adopt(await accountKey(),caps.authority);await globalAccount.home(caps.authority);}
  if(caps?.role==='host'&&!globalAccount.state().global)throw Error('Cole o código global de jogador antes de jogar neste host.');
  if(!load().googleSelected)globalAccount.ready();
  const server=backendAddress();
  const key=await accountKey();
  const s=hostedOnThisPC(server)?await startAll():await status();
  if(!s.gameOnline)throw new Error('Servidor selecionado offline. Confira a rede, o endereço e a porta do servidor.');
  if(publicRelay){await publicRelay.close();publicRelay=null;}
  let gameServer=server,chatPort=61099;
  if(parseServerAddress(server).secure){publicRelay=await startRelay(server);gameServer=publicRelay.address;chatPort=publicRelay.port;}
  try{configureChat(gameServer,runtime.localAppData,chatPort);await spawnGame(exe,gameArgs(gameServer,key),runtime);}catch(e){await publicRelay?.close();publicRelay=null;throw e;}
  notify(`Dauntless 1.4.4 iniciado pelo cliente Win64, conectado a ${server}.`);
  return s;
 }));
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
// Preserve current behavior: services started by Fenys stop when Fenys exits.
app.on('before-quit',()=>{void publicRelay?.close();googleAuth?.dispose();for(const child of owned.values()){try{child.kill('SIGTERM');}catch{}}});

