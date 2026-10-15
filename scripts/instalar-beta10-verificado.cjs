'use strict';
// Confere a versao do pacote realmente instalado, nao so se o instalador abriu.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync,spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version='1.8.0-beta.10';
const setup=path.join(root,'release','Dauntless Launcher Ultimate Setup '+version+'.exe');
const logFile=path.join(process.env.TEMP||root,'Dauntless-beta10-verificado.log');
const lines=[];
function log(message){const t=String(message);console.log(t);lines.push(t);try{fs.writeFileSync(logFile,lines.join('\n')+'\n');}catch{}}
function run(label,args){
 log('\n== '+label+' ==');
 const r=spawnSync('npm',args,{cwd:root,shell:process.platform==='win32',stdio:'inherit',windowsHide:false});
 if(r.error||r.status!==0)throw Error(label+' falhou (codigo '+(r.status===null?'desconhecido':r.status)+').');
}
function candidateDirectories(){
 const roots=[process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs'),process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean);
 const targets=new Set();
 for(const base of roots){
  for(const name of ['Dauntless Launcher Ultimate','dauntless-launcher-ultimate','Dauntless-Fenys','Dauntless Launcher'])targets.add(path.join(base,name));
  if(!fs.existsSync(base))continue;
  try{
   for(const entry of fs.readdirSync(base,{withFileTypes:true})){
    if(entry.isDirectory()&&/dauntless|fenys/i.test(entry.name))targets.add(path.join(base,entry.name));
   }
  }catch{}
 }
 try{
  const ps="$ErrorActionPreference='SilentlyContinue'; $paths=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $paths | Where-Object { $_.DisplayName -match 'Dauntless.+Launcher|Launcher.+Dauntless' -and $_.InstallLocation } | ForEach-Object { $_.InstallLocation }";
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',timeout:12000,windowsHide:true});
  for(const p of out.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))targets.add(p);
 }catch{}
 return [...targets];
}
function installed(){
 let asar;
 try{asar=require('@electron/asar');}catch{throw Error('Dependencia @electron/asar nao encontrada; confira npm ci.');}
 const found=[];
 for(const directory of candidateDirectories()){
  const packed=path.join(directory,'resources','app.asar');
  if(!fs.existsSync(packed))continue;
  try{
   const pkg=JSON.parse(asar.extractFile(packed,'package.json').toString('utf8'));
   if(pkg.name==='dauntless-launcher-ultimate')found.push({version:pkg.version,directory,exe:path.join(directory,'Dauntless Launcher Ultimate.exe')});
  }catch{}
 }
 return found;
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
(async()=>{
 try{
  log('DAUNTLESS LAUNCHER ULTIMATE - INSTALACAO COM VERIFICACAO');
  const pkg=require(path.join(root,'package.json'));
  if(pkg.version!==version)throw Error('Repositorio nao esta na versao esperada: '+pkg.version);
  if(process.platform!=='win32')throw Error('Este instalador e exclusivo para Windows.');
  log('Pasta do projeto: '+root);
  log('Versao do projeto: '+pkg.version);
  log('1/4 - Preparando dependencias...');
  run('npm ci',['ci']);
  log('2/4 - Verificando testes...');
  run('npm test',['test']);
  log('3/4 - Gerando EXE atualizado...');
  run('npm run build:win',['run','build:win']);
  if(!fs.existsSync(setup))throw Error('Setup nao gerado: '+setup);
  const before=installed();
  log('Instalacao anterior: '+(before.length?before.map(p=>p.version+' em '+p.directory).join(' | '):'nao localizada'));
  log('4/4 - Abrindo instalador Windows. Complete as telas ate o final...');
  const r=spawnSync(setup,[],{cwd:path.dirname(setup),windowsHide:false,stdio:'inherit',timeout:600000});
  if(r.error||r.status!==0)throw Error('Setup nao concluiu normalmente (codigo '+(r.status===null?'desconhecido':r.status)+'). '+(r.error?r.error.message:''));
  log('Conferindo a versao realmente instalada...');
  let matches=[],all=[];
  for(let i=0;i<25;i++){
   all=installed();
   matches=all.filter(x=>x.version===version&&fs.existsSync(x.exe));
   if(matches.length)break;
   await delay(1200);
  }
  if(!matches.length){
   log('NAO CONFIRMADO: setup executado mas beta.10 nao encontrada.');
   log('Versoes localizadas: '+(all.length?all.map(x=>x.version+' em '+x.directory).join(' | '):'nenhuma'));
   throw Error('O instalador nao substituiu a versao antiga ou foi cancelado.');
  }
  const selected=matches[0];
  log('INSTALADO E CONFERIDO: '+selected.version);
  log('Executavel correto: '+selected.exe);
  log('Abrindo o launcher atualizado...');
  const child=spawn(selected.exe,[],{cwd:selected.directory,detached:true,stdio:'ignore',windowsHide:false});
  child.on('error',e=>log('Falha ao abrir launcher: '+e.message));
  child.unref();
  log('PRONTO. Confira a versao na barra lateral.');
 }catch(e){
  log('ERRO: '+e.message);
  log('Nenhum save, personagem ou chave Google foi removido por este script.');
  log('Envie apenas foto da mensagem ERRO e das linhas imediatamente anteriores.');
  process.exitCode=1;
 }finally{log('Log resumido: '+logFile);}
})();
// Modulos Google do Metagame sao atualizados separadamente apos backup SQLite.
