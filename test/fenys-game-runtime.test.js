'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {wineSettings,gameRuntime,gameLaunch}=require('../src/fenys-game-runtime');
function prefix(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wine launcher '));fs.mkdirSync(path.join(dir,'drive_c'));fs.writeFileSync(path.join(dir,'system.reg'),'WINE REGISTRY Version 2');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('Windows mantém execução nativa e usa a pasta real de configurações',async()=>{
 const env={LOCALAPPDATA:'C:\\Users\\Player\\AppData\\Local'};
 const runtime=await gameRuntime({},{platform:'win32',home:'C:\\Users\\Player',env,run:()=>assert.fail('Wine on Windows')});
 const launch=gameLaunch(runtime,'game.exe',['server','-AUTH_PASSWORD=private']);
 assert.equal(launch.command,'game.exe');assert.equal(launch.args[0],'server');assert.equal(runtime.localAppData,env.LOCALAPPDATA);assert.equal(launch.options.shell,undefined);
});
test('Linux usa o Wine selecionado e resolve AppData dentro do mesmo ambiente',async t=>{
 const dir=prefix(t),calls=[],local=path.join(dir,'drive_c','users','player','AppData','Local');
 const command=path.join(dir,'Wine executable');
 const runtime=await gameRuntime({wineExecutable:command,winePrefix:dir},{platform:'linux',home:dir,env:{WINEDLLOVERRIDES:'d3d11=n,b'},run:async(cmd,args,options)=>{
  calls.push(args);assert.equal(cmd,command);assert.equal(options.env.WINEPREFIX,dir);assert.equal(options.env.WINEDLLOVERRIDES,'d3d11=n,b;dxgi=n,b');
  return {stdout:args[0]==='--version'?'wine-10':args[0]==='cmd'?'C:\\users\\player\\AppData\\Local\r\n':local+'\n'};
 }});
 assert.equal(runtime.localAppData,local);assert.equal(calls.length,3);
 const exe=path.join(dir,'game folder','Dauntless-Win64-Shipping.exe');
 const args=['100.64.1.2:61000','-AUTH_PASSWORD=private'];const launch=gameLaunch(runtime,exe,args);
 assert.equal(launch.command,command);assert.deepEqual(launch.args,[exe,...args]);assert.equal(launch.options.shell,undefined);assert.equal(launch.options.cwd,path.dirname(exe));
});
test('ambiente Wine ausente falha antes de executar programas ou inicializar prefixos',async t=>{
 const dir=prefix(t);fs.rmSync(path.join(dir,'system.reg'));
 await assert.rejects(gameRuntime({winePrefix:dir},{platform:'linux',home:dir,run:()=>assert.fail('must not run')}),/winecfg/);
});
test('Wine ausente e retorno de caminho inválido produzem diagnóstico sem expor tokens',async t=>{
 const dir=prefix(t);
 await assert.rejects(gameRuntime({winePrefix:dir},{platform:'linux',home:dir,run:async()=>{throw Object.assign(Error('private detail'),{code:'ENOENT'});}}),/Wine não encontrado/);
 await assert.rejects(gameRuntime({winePrefix:dir},{platform:'linux',home:dir,run:async()=>({stdout:'%LOCALAPPDATA%'})}),/preparar o Wine/);
 assert.throws(()=>wineSettings({wineExecutable:'wine --debug'},{home:dir,env:{}}),/absoluto/);
});
