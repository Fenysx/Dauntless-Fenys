'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const file=path.join(__dirname,'../src/fenys-private-listener.js');
test('falha de bind na interface Tailscale é tratada e permite tentar novamente',()=>{
 const calls=[],messages=[];
 const context={
  module:{exports:{}},
  require:createRequire(file),
  process:{env:{CHAT:'0',FENYS_TAILSCALE_IP:'100.88.2.3'}},
  console:{log:m=>messages.push(String(m)),error:m=>messages.push(String(m))}
 };
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const app={listen:(port,address)=>{const server=new EventEmitter();calls.push({port,address,server});return server;}};
 const api=context.module.exports.listenPrivate;
 const first=api(app,61000);
 assert.equal(calls.length,1);
 assert.equal(calls[0].address,'100.88.2.3');
 assert.doesNotThrow(()=>first.emit('error',{code:'EADDRNOTAVAIL'}));
 assert.match(messages.join(' '),/EADDRNOTAVAIL/);
 const second=api(app,61000);
 assert.equal(calls.length,2,'falha de escuta libera a interface para outra tentativa');
 second.emit('close');
 api(app,61000);
 assert.equal(calls.length,3,'fechamento normal libera a interface');
});
