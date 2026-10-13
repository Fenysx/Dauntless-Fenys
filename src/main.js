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
const {requestApi,createInvite,registerPlayer}=require('./fenys-api');
const {encodeConnection,decodeConnection}=require('./fenys-connection-code');
const {installServer,tailscaleAddresses}=require('./fenys-server-setup');
const {ProfileVault}=require('./fenys-profiles');
const {createTailscale}=require('./fenys-tailscale');
const {DirectGlobal}=require('./fenys-direct-global');
const {call:cloudRequest,decodeCode:decodeGlobalCode}=require('./fenys-cloud-protocol');
const {installCloud}=require('./fenys-cloud-setup');
const {validateAuthorization}=require('./fenys-supabase');
const {GoogleAuth}=require('./fenys-google-auth');
const {gameRuntime,gameLaunch}=require('./fenys-game-runtime');
const {GooglePlayer}=require('./fenys-google-player');
const {hostCall:googleHostCall}=require('./fenys-google-cloud');
const {signed:communitySigned}=require('./fenys-google-cloud');
const {community}=require('./fenys-community');
const {installGoogle}=require('./fenys-google-setup');
let googleAuth,googlePlayer;
// Keep existing protected accounts and settings when changing the product name.
const currentData=app.getPath('userData');
if(!fs.existsSync(path.join(currentData,'settings.json'))){
 for(const name of ['Dauntless Fenys','dauntless-fenys']){const legacy=path.join(app.getPath('appData'),name);if(fs.existsSync(path.join(legacy,'settings.json'))){app.setPath?.('userData',legacy);break;}}
}
let globalAccount;
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
 return {metagame:await tcp(PORTS.metagame),deploy:await tcp(PORTS.deploy),gameOnline:await tcp(sv.port,sv.host),owned:[...owned.keys()],remote:!hostedOnThisPC(sv.address),server:sv.address};
}
function hostedOnThisPC(server){const sv=parseServerAddress(server);if(sv.local)return true;try{return Object.values(os.networkInterfaces()).flat().some(x=>x?.family==='IPv4'&&x.address===sv.host);}catch{return false;}}
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
 tailscale=createTailscale({installerDirectory:path.join(app.getPath('userData'),'instaladores-tailscale'),openExternal:url=>shell.openExternal(url),openInstaller:file=>shell.openPath(file),onProgress:notify});
 restoreSavedKeys();
 createWindow();
 setInterval(()=>void monitorPlayers(),10000).unref();
 const vpnReply=async fn=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:e.message||'Não foi possível concluir a operação.'};}};
 const previousAccount=()=>{const c=load();if(globalAccount.hasKey())return {key:globalAccount.key(),server:globalAccount.state().authority||c.cloudAuthority||'127.0.0.1:61000'};const server=c.cloudRole==='host'?c.cloudAuthority:backendAddress(),file=c.accountFiles?.[server]||c.accountFiles?.[backendAddress()]||c.gameKeyFile||path.join(friendKitDir(),'account.key');return fs.existsSync(file)?{key:readKeyFile(file),server}:null;};
 const linkPrevious=async()=>{await googlePlayer.refresh();if(googlePlayer.profile.linked)return googlePlayer.state();const previous=previousAccount();if(!previous)throw Error('Nenhuma conta antiga encontrada. Use um convite para criar seu personagem com Google.');const caps=await googleHostCall(previous.server,'status').catch(()=>null);if(caps?.mode!=='google')throw Error('Ative a integração Google no servidor de origem antes de vincular seu personagem atual. Não crie outra conta por cima dele.');return googlePlayer.link(previous.server,previous.key);};
 ipcMain.handle('google:state',()=>vpnReply(async()=>{if(googleAuth.state().signedIn&&!googlePlayer.profile&&!googlePlayer.busy)await googlePlayer.refresh();return {...googlePlayer.state(),configured:await googleAuth.provider(),hostEnabled:!!load().googleHost};}));
 ipcMain.handle('google:login',()=>vpnReply(async()=>{assertGameClosed();if(!googleAuth.state().signedIn)await googleAuth.login();await googlePlayer.refresh();if(!googlePlayer.profile.linked&&previousAccount()){try{await linkPrevious();}catch(e){return {...googlePlayer.state(),notice:e.message};}}return googlePlayer.state();}));
 ipcMain.handle('google:cancel',()=>{googleAuth.dispose();return {ok:true,...googlePlayer.state()};});
 ipcMain.handle('google:logout',()=>vpnReply(async()=>{assertGameClosed();return googlePlayer.signOut();}));
 ipcMain.handle('google:link',()=>vpnReply(async()=>{assertGameClosed();return linkPrevious();}));
 ipcMain.handle('google:refresh',()=>vpnReply(()=>googlePlayer.refresh()));
 // Community directory: only Google JWTs are sent to Supabase (never service_role).
 const communityCall=async(operation,fields={})=>community(operation,fields,await googleAuth.token());
 ipcMain.handle('community:list',()=>vpnReply(()=>communityCall('list')));
 ipcMain.handle('community:inbox',()=>vpnReply(()=>communityCall('inbox')));
 ipcMain.handle('community:username',(_event,username)=>vpnReply(()=>communityCall('username',{username:String(username||'')})));
 ipcMain.handle('community:invite',(_event,serverId,target,tier,durationDays)=>vpnReply(()=>communityCall('invite',{serverId,target:String(target||''),tier,durationDays})));
 ipcMain.handle('community:decide',(_event,inviteId,decision)=>vpnReply(()=>communityCall('decide',{inviteId,decision})));
 ipcMain.handle('community:revoke',(_event,serverId,username)=>vpnReply(()=>communityCall('revoke',{serverId,username})));
 ipcMain.handle('community:publish',(_event,options)=>vpnReply(async()=>{
  assertGameClosed();const c=load();
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
 ipcMain.handle('google:hostInvite',()=>vpnReply(async()=>googleHostCall('127.0.0.1:61000','host-invite',{},null,await localAdminKey())));
 ipcMain.handle('google:sync',(_event,force)=>vpnReply(async()=>googleHostCall('127.0.0.1:61000',force?'sync-now':'sync-status',{},null,await localAdminKey())));
 ipcMain.handle('google:activate',(_event,options)=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação atual.');assertGameClosed();busy=true;
  try{if(!await googleAuth.provider())throw Error('Configure o provedor Google no Supabase antes de ativar este servidor. Os serviços atuais continuam disponíveis.');const c=load();if(!owned.size)throw Error('Inicie os serviços pelo launcher antes de configurar.');
   if(c.cloudRole==='host'){try{const e=await cloudRequest('127.0.0.1:61000','events',{cursor:null});if(e.onlineCount)throw Error('Encerre as partidas antes de migrar o host.');}catch(e){const source=await googleHostCall(c.cloudAuthority,'status').catch(()=>null);if(source?.mode!=='google')throw e;}}
   else{const info=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',{key:await localAdminKey()});if(info.limited||info.players?.length)throw Error('Mantenha todos fora do jogo antes de configurar.');}
   const file=c.adminKeyFile||c.gameKeyFile||c.accountFiles?.['127.0.0.1:61000']||path.join(friendKitDir(),'account.key');const adminKey=fs.existsSync(file)?readKeyFile(file):await localAdminKey();
   await stopOwned();if(await tcp(PORTS.metagame)||await tcp(PORTS.deploy))throw Error('Encerre os serviços externos antes de configurar.');
   let result;try{result=await installGoogle(c.repoPath,{address:options?.address,hostCode:String(options?.hostCode||'').trim(),authorizationFile:c.supabaseAuthorizationFile,adminKey,networkMode:options?.networkMode,gameAddress:options?.gameAddress,certFile:c.publicCertFile,keyFile:c.publicKeyFile});}finally{await startAll();}
   c.googleHost=true;c.googleGameAddress=options?.gameAddress||'';c.googleNetworkMode=result.networkMode;c.cloudRole=null;c.googleHostAddress=result.address;save(c);notify('Servidor integrado ao progresso Google no Supabase. Vincule os personagens existentes antes da primeira troca.');return result;
  }finally{busy=null;}
 }));
 ipcMain.handle('tailscale:status',()=>vpnReply(()=>tailscale.status()));
 ipcMain.handle('tailscale:install',()=>vpnReply(()=>tailscale.install()));
 ipcMain.handle('tailscale:connect',()=>vpnReply(()=>tailscale.connect()));
 ipcMain.handle('tailscale:background',()=>vpnReply(()=>tailscale.background()));
 ipcMain.handle('tailscale:share',()=>vpnReply(async()=>{await shell.openExternal('https://login.tailscale.com/admin/machines');return {message:'No painel Tailscale, encontre este PC e use Share para compartilhar com seu amigo. Ele deve aceitar o convite na conta dele.'};}));
 ipcMain.handle('connection:addresses',()=>tailscaleAddresses());
 for(const [channel,field,title] of [['network:cert','publicCertFile','Selecionar certificado HTTPS (PEM / fullchain)'],['network:key','publicKeyFile','Selecionar chave privada HTTPS (PEM)']])ipcMain.handle(channel,async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title,properties:['openFile']});if(r.canceled)return false;const c=load();c[field]=r.filePaths[0];save(c);return true;});
 ipcMain.handle('global:state',()=>vpnReply(async()=>({...globalAccount.state(),localRole:load().cloudRole||null,authority:load().cloudAuthority||globalAccount.state().authority||null,authorizationSelected:!!load().supabaseAuthorizationFile})));
 ipcMain.handle('global:authorization',()=>vpnReply(async()=>{
  const r=await dialog.showOpenDialog(win,{title:'Selecionar autorização privada do PC central Supabase',properties:['openFile'],filters:[{name:'Autorização Supabase',extensions:['json']}]});
  if(r.canceled||!r.filePaths.length)return {selected:false};validateAuthorization(JSON.parse(fs.readFileSync(r.filePaths[0],'utf8')));const c=load();c.supabaseAuthorizationFile=r.filePaths[0];save(c);return {selected:true};
 }));
 ipcMain.handle('global:activate',(_event,options)=>vpnReply(async()=>{
  if(busy)throw Error('Aguarde a operação atual.');assertGameClosed();busy=true;
  try{
   const c=load();if(!['authority','host'].includes(options?.role))throw Error('Selecione PC central ou host de jogo.');
   if(c.cloudRole&&c.cloudRole!==options.role)throw Error('Mantenha a função deste PC para preservar o banco global.');
   const adminKey=c.cloudRole==='host'?null:await localAdminKey();
   const local=await requestApi('127.0.0.1:61000','/undaunted/api/ServerStatus',adminKey?{key:adminKey}:{});
   if(c.cloudRole!=='host'&&(local.limited===true||local.players?.length))throw Error('Ative com os jogadores fora do jogo.');
   if(c.cloudRole==='host'){const events=await cloudRequest('127.0.0.1:61000','events',{cursor:null});if(events.onlineCount)throw Error('Feche as partidas antes de atualizar o host.');}
   if(!owned.size)throw Error('Inicie os serviços pelo launcher antes da ativação.');
   if(options.role==='authority'&&!c.supabaseAuthorizationFile)throw Error('Selecione a autorização Supabase do PC central antes de ativar.');
   const supabaseAuthorization=options.role==='authority'?validateAuthorization(JSON.parse(fs.readFileSync(c.supabaseAuthorizationFile,'utf8'))):null;
   await stopOwned();if(await tcp(PORTS.metagame)||await tcp(PORTS.deploy))throw Error('Encerre os serviços externos antes de configurar.');
   let result;
   try{result=await installCloud(c.repoPath,{address:options.address,role:options.role,hostCode:String(options.hostCode||''),supabaseAuthorization});}
   catch(e){if(e.configuredRole){c.cloudRole=e.configuredRole;c.cloudAuthority=e.authority;save(c);}await startAll();throw e;}
   c.cloudRole=result.role;c.cloudAuthority=result.authority;c.gameServer='127.0.0.1:61000';save(c);await startAll();
   notify('Rede global ativada. Os hosts compartilham o mesmo personagem, inventário, nível e dados sociais.');return result;
  }finally{busy=null;}
 }));
 ipcMain.handle('global:hostInvite',()=>vpnReply(async()=>{if(load().cloudRole!=='authority')throw Error('Gere a autorização no PC central.');return cloudRequest('127.0.0.1:61000','enroll-invite',{},await localAdminKey());}));
 ipcMain.handle('global:backup',(_event,force)=>vpnReply(async()=>{if(load().cloudRole!=='authority')throw Error('Consulte a persistência no PC central.');return cloudRequest('127.0.0.1:61000',force?'backup-now':'backup-status',{},await localAdminKey(),180000);}));
 ipcMain.handle('global:home',()=>vpnReply(async()=>{assertGameClosed();if(!globalAccount.hasKey())globalAccount.adopt(await accountKey(),load().cloudAuthority||backendAddress());return globalAccount.home(load().cloudAuthority);}));
 ipcMain.handle('global:recover',()=>vpnReply(async()=>{assertGameClosed();return globalAccount.recover();}));
 ipcMain.handle('connection:setup',(_event,address)=>runLocked(async()=>{
  assertGameClosed();if(load().googleHost)throw Error('Altere a rede pelo painel Servidor com personagens Google e ative novamente.');
  if(!owned.size&&await tcp(PORTS.metagame))throw Error('O Metagame foi iniciado fora do launcher. Encerre-o para configurar a conexão.');
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
   if(load().googleHost){if(!await tcp(PORTS.metagame))throw Error('Inicie o servidor local.');return {ok:true,...await googleHostCall('127.0.0.1:61000','invite',{},null,await localAdminKey())};}
   const sv=parseServerAddress(address);
   if(sv.port!==61000||!tailscaleAddresses().includes(sv.host))throw Error('Selecione o IP Tailscale deste PC.');
   if(!await tcp(sv.port,sv.host))throw Error('Configure o acesso Tailscale e inicie os serviços antes de gerar o código.');
   if(load().googleHost){const key=await localAdminKey();return {ok:true,...await googleHostCall('127.0.0.1:61000','invite',{},null, key)};}
   if(load().cloudRole)return {ok:true,...await cloudRequest('127.0.0.1:61000','invite',{},load().cloudRole==='authority'?await localAdminKey():undefined)};
   const invite=await createInvite('127.0.0.1:61000',await localAdminKey(),name);
   return {ok:true,code:encodeConnection(sv.address,invite)};
  }catch(e){return {ok:false,error:e.message};}
 });
 ipcMain.handle('connection:join',async(_event,code,username,createNew=false)=>{
  let locked=false;
  try{
   if(busy)throw Error('Aguarde a operação atual.');
   assertGameClosed();busy=true;locked=true;
   if(String(code).trim().startsWith('DLU3.')){await googlePlayer.refresh();if(!googlePlayer.profile.linked&&previousAccount())await linkPrevious();const result=await googlePlayer.connect(String(code).trim(),username,{allowCreateNew:createNew===true});notify('Conectado com Google. Personagem e progresso confirmados na nuvem.');return {ok:true,...result};}
   if(load().googleSelected)throw Error('Use um código de servidor integrado com Google para manter seu personagem.');
   if(String(code).trim().startsWith('FENYSC2.')){
    const invite=decodeGlobalCode(String(code).trim());if(invite.kind!=='player')throw Error('Use este código na ativação de host, não na conexão de jogador.');
    if(!globalAccount.hasKey()){
     const c=load(),source=backendAddress(),candidate=c.accountFiles?.[source]||c.gameKeyFile||path.join(friendKitDir(),'account.key');
     if(fs.existsSync(candidate)){
      const key=readKeyFile(candidate);let info;try{info=await requestApi(invite.authority,'/undaunted/api/GetUserInfo',{key});}catch{throw Error('Sua conta existente ainda não está no banco central. Integre seu host ou vincule a chave global para preservar seu personagem.');}
      if(!info.UserId)throw Error('Conta global não reconhecida.');globalAccount.adopt(key,invite.authority);
     }else{await globalAccount.register(String(code).trim(),username);}
    }
    const state=await globalAccount.connect(String(code).trim());notify('Conectado usando sua conta global e o mesmo progresso.');return {ok:true,...state};
   }
   if(globalAccount.state().global)throw Error('Use um código global de jogador para manter seu personagem. Este código é de um servidor independente.');
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
 ipcMain.handle('network:localIPv4',()=>{
  const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal&&lanIP(x.address)).map(x=>x.address);
  return {addresses:[...new Set(addresses)]};
 });
 // Read-only host setup state. Saved settings alone never prove Google integration:
 // older Metagame builds can respond with "Unstubbed route" for /launcher/google/status.
 ipcMain.handle('host:readiness',()=>vpnReply(async()=>{
  const c=load(),state=await status();
  let googleActive=false,googleReachable=false;
  if(state.metagame){
   try{
    const caps=await googleHostCall('127.0.0.1:61000','status');
    googleReachable=caps?.mode==='google';
    googleActive=googleReachable&&caps.registered===true;
   }catch{} // A missing route means not ready, never success.
  }
  const identityFile=path.join(c.repoPath,'UndauntedMetagame','fenys','google-host.json');
  return {
   servicesReady:Boolean(state.metagame&&state.deploy),
   managedServices:state.owned.length>0,
   googleActive,googleReachable,googleConfigured:Boolean(c.googleHost),
   networkMode:c.googleNetworkMode||'lan',
   adminKeySelected:Boolean(c.adminKeyFile&&fs.existsSync(c.adminKeyFile)),
   authorizationSelected:Boolean(c.supabaseAuthorizationFile&&fs.existsSync(c.supabaseAuthorizationFile)),
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
  return {...safe,platform:process.platform,publicCertSelected:!!publicCertFile,publicKeySelected:!!publicKeyFile,adminKeySelected:Boolean(adminKeyFile),accountKeySelected:Boolean((linked&&fs.existsSync(linked))||(localKey&&fs.existsSync(localKey))),gameServer:server};
 });
 ipcMain.handle('settings:setServer',async(_event,value)=>{
  assertGameClosed();
  if(load().googleSelected){if(!parseServerAddress(value).local)throw Error('Use um código Google para trocar de servidor.');await googlePlayer.home('127.0.0.1:61000');return {server:backendAddress(),remote:false};}
  if(globalAccount.state().global){if(!parseServerAddress(value).local)throw Error('Use um código global para trocar de host com segurança.');await globalAccount.home(load().cloudAuthority);return {server:backendAddress(),remote:false};}
  const sv=parseServerAddress(value);
  const c=load();c.gameServer=sv.address;save(c);
  return {server:sv.address,remote:!sv.local};
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
 ipcMain.handle('settings:pickWine',async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title:'Selecionar executável Wine',properties:['openFile']});if(r.canceled)return null;const c=load();c.wineExecutable=r.filePaths[0];save(c);return {selected:true};});
 ipcMain.handle('settings:pickWinePrefix',async()=>{assertGameClosed();const r=await dialog.showOpenDialog(win,{title:'Selecionar ambiente Wine (pasta com drive_c e system.reg)',properties:['openDirectory']});if(r.canceled)return null;const dir=r.filePaths[0];if(!fs.existsSync(path.join(dir,'system.reg'))||!fs.existsSync(path.join(dir,'drive_c')))throw Error('Selecione um ambiente Wine já configurado com winecfg.');const c=load();c.winePrefix=dir;save(c);return {selected:true};});
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
app.on('before-quit',()=>{void publicRelay?.close();googleAuth?.dispose();tailscale?.dispose();for(const child of owned.values()){try{child.kill('SIGTERM');}catch{}}});

