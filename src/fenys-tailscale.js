'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {parseServerAddress}=require('./fenys-api');
// Official stable installer; verify both checksum and Windows publisher before opening it.
const INSTALLER_URL='https://pkgs.tailscale.com/stable/tailscale-setup-1.104.1.exe';
const MAX_INSTALLER=128*1024*1024;
function findCli(platform=process.platform,env=process.env,exists=fs.existsSync){
 const candidates=platform==='win32'?[...new Set([env.ProgramW6432,env.ProgramFiles,env['ProgramFiles(x86)'],'C:\\Program Files'].filter(Boolean))].map(root=>path.win32.join(root,'Tailscale','tailscale.exe')):
  ['/usr/bin/tailscale','/usr/local/bin/tailscale','/snap/bin/tailscale'];
 return candidates.find(exists)||null;
}
function runCommand(file,args,{timeout=10000}={}){return new Promise((resolve,reject)=>{
 const child=spawn(file,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let out='',err='',done=false;
 const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(out);};
 const timer=setTimeout(()=>{child.kill();finish(Error('O Tailscale não respondeu a tempo.'));},timeout);
 child.stdout.on('data',d=>{out+=String(d);if(out.length>1024*1024){child.kill();finish(Error('Resposta do Tailscale maior que o esperado.'));}});
 child.stderr.on('data',d=>{err=(err+String(d)).slice(-2000);});
 child.once('error',()=>finish(Error('Não foi possível iniciar o Tailscale. Confira a instalação.')));
 child.once('close',code=>finish(code===0?null:Error(/access|denied|permission|administrator|elevation/i.test(err)?'O Windows precisa permitir essa alteração.':'O Tailscale não concluiu o comando. Verifique se o serviço está ativo.')));
});}
function authURL(value){
 try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='login.tailscale.com'&&!u.port&&!u.username&&!u.password&&/^\/a\/[A-Za-z0-9_-]+$/.test(u.pathname))return u.href;}catch{}
 throw Error('O Tailscale retornou um endereço de login não reconhecido.');
}
function stateFromStatus(raw){
 const ips=(Array.isArray(raw?.TailscaleIPs)?raw.TailscaleIPs:raw?.Self?.TailscaleIPs)||[];
 const addresses=ips.filter(ip=>{if(typeof ip!=='string')return false;try{const sv=parseServerAddress(ip);return sv.host===ip&&!sv.local&&/^100\./.test(sv.host);}catch{return false;}});
 const running=raw?.BackendState==='Running'&&addresses.length>0;
 const messages={Running:'Tailscale conectado.',Stopped:'Tailscale desconectado. Clique em Conectar.',NeedsLogin:'Entre na sua conta Tailscale para conectar.',NeedsMachineAuth:'Aguardando aprovação deste PC na sua rede Tailscale.',Starting:'Tailscale iniciando…',NoState:'Tailscale iniciando…'};
 return {installed:true,connected:running,addresses:running?addresses:[],message:messages[raw?.BackendState]||'Confira o serviço do Tailscale.'};
}
function powershell(script){return ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];}
function psString(value){return "'"+String(value).replaceAll("'","''")+"'";}
function powerExe(){return path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');}
async function verifyInstaller(file,run=runCommand){
 const script="$s=Get-AuthenticodeSignature -LiteralPath "+psString(file)+"; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(?:^|,\\s*)O=Tailscale Inc\\.(?:,|$)'){exit 1}; Write-Output 'verified'";
 const output=await run(powerExe(),powershell(script),{timeout:30000});
 if(output.trim()!=='verified')throw Error('A assinatura do instalador Tailscale não foi confirmada.');
}
async function downloadInstaller(directory,{fetchImpl=fetch,verify=verifyInstaller,onProgress=()=>{},maxBytes=MAX_INSTALLER}={}){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const file=path.join(directory,'tailscale-'+crypto.randomUUID()+'.exe');
 try{
  const response=await fetchImpl(INSTALLER_URL,{redirect:'error',signal:AbortSignal.timeout(180000)});
  if(!response.ok||!response.body)throw Error('Não foi possível baixar o instalador oficial. Tente novamente.');
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('Instalador maior que o limite esperado.');
  const h=crypto.createHash('sha256');let bytes=0;
  const limit=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;if(bytes>maxBytes)return done(Error('Instalador maior que o limite esperado.'));h.update(chunk);done(null,chunk);}});
  onProgress('Baixando o instalador oficial do Tailscale…');
  await pipeline(Readable.fromWeb(response.body),limit,fs.createWriteStream(file,{flags:'wx',mode:0o600}));
  const checksum=await fetchImpl(INSTALLER_URL+'.sha256',{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!checksum.ok)throw Error('Não foi possível conferir o instalador oficial.');
  const expected=(await checksum.text()).trim();
  if(!/^[a-f0-9]{64}(?:\s+[^\r\n]+)?$/i.test(expected)||expected.slice(0,64).toLowerCase()!==h.digest('hex'))throw Error('O download está incompleto ou diferente do instalador oficial.');
  onProgress('Conferindo a assinatura do instalador…');await verify(file);
  return file;
 }catch(e){fs.rmSync(file,{force:true});throw e;}
}
function createTailscale({platform=process.platform,find=()=>findCli(platform),run=runCommand,spawnCli=spawn,openExternal,openInstaller,installerDirectory,onProgress=()=>{},download=downloadInstaller}={}){
 let operation=false,connecting=null;
 async function status(){
  const cli=find();if(!cli)return {installed:false,connected:false,addresses:[],background:null,message:'Tailscale ainda não está instalado.'};
  try{
   const state=stateFromStatus(JSON.parse(await run(cli,['status','--json','--peers=false'])));
   state.background=platform==='linux'?true:null;
   if(platform==='win32')try{const prefs=JSON.parse(await run(cli,['get','--json','unattended']));if(typeof prefs.unattended==='boolean')state.background=prefs.unattended;}catch{}
   state.connecting=!!connecting;return state;
  }catch{return {installed:true,connected:false,addresses:[],background:null,message:'Tailscale instalado, mas o serviço não respondeu. Abra o Tailscale e confira a conexão.'};}
 }
 async function install(){
  if(operation)throw Error('Aguarde a operação do Tailscale.');operation=true;
  try{
   if(find())return {message:'Tailscale já instalado. Clique em Conectar.'};
   if(platform!=='win32'){await openExternal('https://tailscale.com/download');return {message:'A página oficial foi aberta. Instale o Tailscale para seu sistema e volte ao launcher.'};}
   const file=await download(installerDirectory,{onProgress});
   const error=await openInstaller(file);if(error)throw Error('Não foi possível abrir o instalador. Tente novamente.');
   return {message:'Instalador oficial aberto. Conclua a instalação e depois clique em Conectar.'};
  }finally{operation=false;}
 }
 async function connect(){
  if(operation)throw Error('Aguarde a operação do Tailscale.');
  const cli=find();if(!cli)throw Error('Clique em Instalar Tailscale primeiro.');
  if(connecting)return {message:'Conclua o acesso na janela do navegador. O launcher está aguardando a conexão.'};
  operation=true;
  try{
  const state=await status();if(state.connected)return {message:'Tailscale já conectado.'};
  return await new Promise((resolve,reject)=>{
   const child=spawnCli(cli,['up','--json','--timeout=90s'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});connecting=child;
   let output='',settled=false,opened=false;
   const finish=(error,message)=>{if(settled)return;settled=true;error?reject(error):resolve({message});};
   const timer=setTimeout(()=>{child.kill();connecting=null;finish(Error('A conexão demorou. Conclua o acesso no navegador e clique em Atualizar status.'));},95000);
   child.stdout.on('data',d=>{
    output=(output+String(d)).slice(-16000);
    const match=output.match(/"AuthURL"\s*:\s*("(?:[^"\\]|\\.)*")/);
    if(match&&!opened){opened=true;let url;try{url=authURL(JSON.parse(match[1]));}catch(e){child.kill();finish(e);return;}
     Promise.resolve().then(()=>openExternal(url)).then(()=>finish(null,'Entre na sua conta Tailscale na janela do navegador. A conexão aparecerá automaticamente aqui.'),()=>finish(Error('Não foi possível abrir o navegador para entrar no Tailscale.')));
    }
   });
   // Never show CLI output, peer data or temporary authentication URLs in the activity log.
   child.stderr.on('data',()=>{});
   child.once('error',()=>{clearTimeout(timer);connecting=null;finish(Error('Não foi possível iniciar a conexão Tailscale.'));});
   child.once('close',async code=>{
    clearTimeout(timer);connecting=null;
    if(!settled){const after=await status();if(after.connected)finish(null,'Tailscale conectado.');else if(opened)finish(null,'Conclua o acesso no navegador e atualize o status.');else finish(Error(code===0?'Confira a aprovação deste PC na sua rede Tailscale.':'Não foi possível conectar. Abra o aplicativo Tailscale para conferir sua conta e permissões.'));}
   });
  });
  }finally{operation=false;}
 }
 async function background(){
  if(operation||connecting)throw Error('Conclua a operação do Tailscale antes de alterar o modo de execução.');
  const cli=find();if(!cli)throw Error('Instale o Tailscale primeiro.');
  if(!(await status()).connected)throw Error('Conecte sua conta Tailscale primeiro.');
  if(platform==='linux')return {message:'No Linux, o Tailscale já roda como serviço em segundo plano.'};
  if(platform!=='win32')throw Error('Esta configuração automática está disponível no Windows.');
  operation=true;
  try{
   // Windows handles the administrator permission prompt for the single requested preference.
   const script="$p=Start-Process -FilePath "+psString(cli)+" -ArgumentList @('set','--unattended=true') -Verb RunAs -Wait -PassThru; exit $p.ExitCode";
   await run(powerExe(),powershell(script),{timeout:120000});
   const after=await status();
   if(after.background!==true)throw Error('Não foi possível confirmar o modo em segundo plano. Confira Preferences → Run unattended no Tailscale.');
   return {message:'Tailscale configurado para continuar ligado em segundo plano no Windows.'};
  }finally{operation=false;}
 }
 function dispose(){if(connecting){connecting.kill();connecting=null;}}
 return {status,install,connect,background,dispose};
}
module.exports={createTailscale,findCli,stateFromStatus,authURL,downloadInstaller,verifyInstaller,INSTALLER_URL};
