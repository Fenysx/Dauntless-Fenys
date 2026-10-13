'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const runFile=promisify(execFile);

function wineSettings(config,{home,env=process.env}){
 const command=String(config.wineExecutable||'').trim()||'wine';
 if(command!=='wine'&&!path.isAbsolute(command))throw Error('Selecione o executável Wine com caminho absoluto.');
 const prefix=String(config.winePrefix||env.WINEPREFIX||path.join(home,'.wine')).trim();
 if(!path.isAbsolute(prefix))throw Error('Selecione uma pasta absoluta para o ambiente Wine.');
 return {command,prefix,env:{...env,WINEPREFIX:prefix,WINEDLLOVERRIDES:[env.WINEDLLOVERRIDES,'dxgi=n,b'].filter(Boolean).join(';')}};
}

async function gameRuntime(config,{platform=process.platform,home,env=process.env,run=runFile}={}){
 if(platform==='win32')return {kind:'native',env,localAppData:env.LOCALAPPDATA||path.join(home,'AppData','Local')};
 if(platform!=='linux')throw Error('Esta versão suporta Windows e Linux com Wine.');
 const wine=wineSettings(config,{home,env});
 if(!fs.existsSync(path.join(wine.prefix,'system.reg'))||!fs.existsSync(path.join(wine.prefix,'drive_c')))throw Error('Configure um ambiente Wine de 64 bits com winecfg e selecione essa pasta em Configurações.');
 const options={env:wine.env,timeout:30000,maxBuffer:65536,windowsHide:true};
 let localAppData;
 try{
  await run(wine.command,['--version'],options);
  const result=await run(wine.command,['cmd','/d','/c','echo','%LOCALAPPDATA%'],options);
  const windowsPath=String(result.stdout).trim();
  if(!/^[A-Za-z]:\\[^\r\n]+$/.test(windowsPath))throw Error('Wine não informou a pasta de configurações.');
  const converted=await run(wine.command,['winepath.exe','-u',windowsPath],options);
  localAppData=String(converted.stdout).trim();
  if(!path.isAbsolute(localAppData)||/[\r\n\0]/.test(localAppData))throw Error('Pasta Wine inválida.');
 }catch(e){throw Error(e.code==='ENOENT'?'Wine não encontrado. Instale o Wine e selecione seu executável em Configurações.':'Não foi possível preparar o Wine. Abra winecfg nesse ambiente e confira a instalação.');}
 return {kind:'wine',command:wine.command,env:wine.env,localAppData};
}

function gameLaunch(runtime,exe,args){
 return {command:runtime.kind==='wine'?runtime.command:exe,args:runtime.kind==='wine'?[exe,...args]:args,options:{cwd:path.dirname(exe),env:runtime.env,detached:true,stdio:'ignore',windowsHide:false}};
}
module.exports={wineSettings,gameRuntime,gameLaunch};
