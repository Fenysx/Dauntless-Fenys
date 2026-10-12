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
let win;
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
function defaults(){return {repoPath:path.join(app.getPath('home'),'dauntless-revived'),launcherExe:'',gameKeyFile:'',gameServer:'',adminKeyFile:'',accountFiles:{}};}
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
 if(current)return parseServerAddress(current.server).address;
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

async function accountKey(){
 vault.requireLogin();
 if(!canProtectAccount())throw new Error('Proteção de credenciais indisponível.');
 const key=safeStorage.decryptString(vault.encryptedKey()).trim();
 if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw new Error('Chave deste perfil inválida.');
 return key;
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
 const data=await requestApi(me.server,'/undaunted/api/ServerStatus',{key});
 if(!data || !Array.isArray(data.players))throw new Error('A API não retornou a lista de jogadores.');
 if(data.limited===true)return {limited:true,count:0,players:[],server:me.server};
 const players=data.players.slice(0,100).filter(p=>p&&typeof p.name==='string')
  .map(p=>({name:p.name.slice(0,32),where:['menu','city','hunt','dojo','tutorial','unknown'].includes(p.where)?p.where:'unknown'}));
 return {limited:false,count:Number.isFinite(data.playersOnline)?Math.min(100000,Math.max(0,Math.floor(data.playersOnline))):players.length,players,server:me.server};
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
 createWindow();
 const reply=async fn=>{try{return {ok:true,...await fn()};}catch(e){return {ok:false,error:e?.message||'Operação não concluída.'};}};
 function protect(key){
  if(!canProtectAccount())throw new Error('A proteção de credenciais do sistema está indisponível.');
  return safeStorage.encryptString(key);
 }
 ipcMain.handle('auth:state',()=>({current:vault.current(),profiles:vault.list()}));
 ipcMain.handle('auth:login',(_event,username,password)=>reply(async()=>({current:vault.login(username,password)})));
 ipcMain.handle('auth:logout',()=>{vault.logout();return {ok:true};});
 ipcMain.handle('auth:reset',(_event,username,recoveryCode,newPassword)=>reply(async()=>vault.reset(username,recoveryCode,newPassword)));
 ipcMain.handle('auth:change',(_event,oldPassword,newPassword)=>reply(async()=>vault.changePassword(oldPassword,newPassword)));
 ipcMain.handle('auth:forgetLocal',(_event,password)=>reply(async()=>{vault.forgetLocalProfile(password);return {};}));
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
  if(process.platform!=='win32')throw new Error('O jogo no Linux ainda precisa de integração com Wine/Proton. O launcher Linux suporta as telas, não a execução do jogo.');
  const c=load();const exe=gameExePath(c);
  if(!fs.existsSync(exe))throw new Error(`Executável do Dauntless 1.4.4 não encontrado: ${exe}`);
  await verifyGame(path.dirname(exe));
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
