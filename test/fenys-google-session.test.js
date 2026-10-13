'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GoogleAuth}=require('../src/fenys-google-auth');
const json=value=>new Response(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup(t,fetchImpl,openExternal){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'google-session-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return new GoogleAuth({directory,port:0,protect:s=>Buffer.from(s),unprotect:b=>b.toString(),fetchImpl,openExternal});}
test('cancelamento durante a troca PKCE não restaura a sessão',async t=>{
 const started=deferred(),response=deferred();let callbackRequest;
 const auth=setup(t,async url=>{
  if(url.endsWith('/settings'))return json({external:{google:true}});
  if(url.includes('grant_type=pkce')){started.resolve();return response.promise;}
  if(url.endsWith('/user'))return json({id:'google-user',identities:[{provider:'google'}]});
  throw Error(url);
 },url=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','code');callbackRequest=fetch(callback);});
 const login=auth.login();const rejected=assert.rejects(login,/cancelado/);
 await started.promise;auth.dispose();await rejected;
 response.resolve(json({access_token:'late-access',refresh_token:'late-refresh',expires_in:3600}));
 assert.equal((await callbackRequest).status,400);
 assert.equal(auth.state().signedIn,false);assert.equal(fs.existsSync(auth.file()),false);
});
test('sair durante renovação não permite que a resposta atrasada recupere o login',async t=>{
 const started=deferred(),response=deferred();
 const auth=setup(t,async url=>{
  if(url.includes('grant_type=refresh_token')){started.resolve();return response.promise;}
  if(url.endsWith('/user'))return json({id:'google-user',identities:[{provider:'google'}]});
  if(url.includes('/logout'))return json({});
  throw Error(url);
 });
 auth.write({access_token:'old-access',refresh_token:'old-refresh',expires_at:1,user:{id:'google-user'}});
 const token=auth.token();const rejected=assert.rejects(token,/cancelado/);
 await started.promise;await auth.signOut();
 response.resolve(json({access_token:'late-access',refresh_token:'late-refresh',expires_in:3600}));
 await rejected;assert.equal(auth.state().signedIn,false);assert.equal(fs.existsSync(auth.file()),false);
});

test('reserva login durante consulta do provedor e permite cancelar antes do navegador',async t=>{
 const provider=deferred();let opened=0;
 const auth=setup(t,()=>provider.promise,()=>opened++);
 const first=auth.login();const rejected=assert.rejects(first,/cancelado/);
 assert.equal(auth.state().pending,true);
 await assert.rejects(auth.login(),/andamento/);
 auth.dispose();await rejected;provider.resolve(json({external:{google:true}}));
 await new Promise(r=>setImmediate(r));assert.equal(opened,0);assert.equal(auth.state().pending,false);
});
test('expiração durante validação do usuário não grava a sessão atrasada',async t=>{
 const validating=deferred(),response=deferred();let callbackRequest;
 const auth=setup(t,async url=>{
  if(url.endsWith('/settings'))return json({external:{google:true}});
  if(url.includes('grant_type=pkce'))return json({access_token:'access',refresh_token:'refresh'});
  if(url.endsWith('/user')){validating.resolve();return response.promise;}
  throw Error(url);
 },url=>{const callback=new URL(new URL(url).searchParams.get('redirect_to'));callback.searchParams.set('code','code');callbackRequest=fetch(callback);});
 auth.loginTimeoutMs=1000;
 const login=auth.login();const expired=assert.rejects(login,/expirou/);
 await validating.promise;await expired;
 response.resolve(json({id:'google-user',identities:[{provider:'google'}]}));
 assert.equal((await callbackRequest).status,400);assert.equal(auth.state().signedIn,false);assert.equal(fs.existsSync(auth.file()),false);
});
test('falha síncrona ao abrir navegador encerra tentativa e libera novo login',async t=>{
 const auth=setup(t,async()=>json({external:{google:true}}),()=>{throw Error('navegador indisponível');});
 await assert.rejects(auth.login(),/navegador indisponível/);assert.equal(auth.state().pending,false);
 await assert.rejects(auth.login(),/navegador indisponível/);
});
test('falha de revogação limpa perfil local e resposta de perfil atrasada é descartada',async()=>{
 const {GooglePlayer}=require('../src/fenys-google-player');
 const response=deferred();let signedIn=true,settings={googleSelected:true};
 const auth={state:()=>({signedIn}),token:async()=> 'token',signOut:async()=>{signedIn=false;throw Error('offline');}};
 const client=new GooglePlayer({auth,settings:()=>settings,saveSettings:c=>settings=c,request:()=>response.promise});
 client.profile={linked:true,userId:'old-user',key:'private-key'};
 const refreshing=client.refresh();const rejected=assert.rejects(refreshing,/conta Google mudou/);
 await new Promise(r=>setImmediate(r));await assert.rejects(client.signOut(),/offline/);
 response.resolve({linked:true,userId:'old-user',key:'private-key'});await rejected;
 assert.equal(client.profile,null);assert.equal(settings.googleSelected,false);assert.equal(client.state().linked,false);
});
