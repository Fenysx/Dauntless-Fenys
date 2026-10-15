'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectLocalServer,LOCAL}=require('../src/fenys-local-selection');
function harness(patch={}){
 let settings={gameServer:'100.64.2.22:61000',googleSelected:false,...patch},written=0,checks=0,homes=0;
 const args={
  load:()=>structuredClone(settings),
  save:c=>{settings=c;written++;},
  assertGameClosed:()=>{},
  isGoogleSignedIn:()=>true,
  checkGoogleHost:async()=>{checks++;return {mode:'google',registered:true};},
  googleHome:async address=>{homes++;assert.equal(address,LOCAL);settings={...settings,googleServer:LOCAL,googleSelected:true};},
  globalState:()=>({global:false}),
  globalHome:async()=>{throw Error('should not use legacy cloud')},
  localOnline:async()=>false
 };
 return {args,get settings(){return settings;},get written(){return written;},get checks(){return checks;},get homes(){return homes;}};
}
test('botao local seleciona sem Google e sem servidor ligado, sem apagar a conta',async()=>{
 const h=harness({googleHost:true,otherSettings:'preserved',googleServer:'https://exemplo.test',googleSelected:false});
 h.args.checkGoogleHost=async()=>{throw Error('offline');};
 const r=await selectLocalServer(h.args);
 assert.deepEqual(r,{selected:true,server:LOCAL,online:false,cloudReady:false});
 assert.equal(h.settings.gameServer,LOCAL);
 assert.equal(h.settings.googleServer,'https://exemplo.test');
 assert.equal(h.settings.otherSettings,'preserved');
 assert.equal(h.checks,0);
 assert.equal(h.written,1);
});
test('se ja estava selecionado no Google local, nao precisa conectar de novo',async()=>{
 const h=harness({gameServer:LOCAL,googleSelected:true,googleServer:LOCAL});
 h.args.googleHome=async()=>{throw Error('nao deve transferir')};
 const r=await selectLocalServer(h.args);
 assert.equal(r.selected,true);
 assert.equal(r.cloudReady,true);
 assert.equal(h.settings.googleSelected,true);
});
test('troca de servidor remoto Google bloqueia se local nao estiver integrado',async()=>{
 const h=harness({googleSelected:true,googleServer:'100.64.2.22:61000'});
 h.args.checkGoogleHost=async()=>{throw Error('offline');};
 await assert.rejects(selectLocalServer(h.args),/servidor local ainda não confirmou/);
 assert.equal(h.written,0);
 assert.equal(h.homes,0);
 assert.equal(h.settings.googleServer,'100.64.2.22:61000');
});
test('troca de host Google confirmada so muda destino apos googleHome completar',async()=>{
 const h=harness({googleSelected:true,googleServer:'100.64.2.22:61000'});
 const r=await selectLocalServer(h.args);
 assert.equal(r.selected,true);
 assert.equal(r.cloudReady,true);
 assert.equal(h.checks,1);
 assert.equal(h.homes,1);
 assert.equal(h.settings.gameServer,LOCAL);
 assert.equal(h.settings.googleServer,LOCAL);
});
test('falha de transferencia preserva selecao remota e configuracoes',async()=>{
 const h=harness({googleSelected:true,googleServer:'https://comunidade.example'});
 h.args.googleHome=async()=>{throw Error('progresso ainda pendente');};
 await assert.rejects(selectLocalServer(h.args),/progresso ainda pendente/);
 assert.equal(h.written,0);
 assert.equal(h.settings.googleServer,'https://comunidade.example');
});
test('troca de servidor continua bloqueada com jogo aberto',async()=>{
 const h=harness();
 h.args.assertGameClosed=()=>{throw Error('Feche o jogo')};
 await assert.rejects(selectLocalServer(h.args),/Feche o jogo/);
 assert.equal(h.written,0);
});
