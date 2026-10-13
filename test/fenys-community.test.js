'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {stripTypeScriptTypes}=require('node:module');
const {community,ENDPOINT}=require('../src/fenys-community');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('cliente da comunidade exige Google, usa apenas publishable key e separa API dos saves',async()=>{
 await assert.rejects(community('list',{},null),/Entre com Google/);
 await assert.rejects(community('unknown',{},'token'),/inválida/);
 assert.match(ENDPOINT,/fenys-community$/);
 let called=0;
 const out=await community('list',{},'google-token',async(url,options)=>{
  called++;assert.equal(url,ENDPOINT);assert.equal(options.headers.authorization,'Bearer google-token');
  assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
  assert.deepEqual(JSON.parse(options.body),{operation:'list'});
  return json({servers:[]});
 });
 assert.equal(called,1);assert.deepEqual(out,{servers:[]});
 await assert.rejects(community('invite',{serverId:'x'},'token',async()=>json({error:'Somente o dono do servidor.'},403)),/Somente o dono/);
});
test('API da comunidade nega ações anônimas e publicação sem assinatura de host Google',async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/fenys-community/index.ts'),'utf8')).replace('Deno.serve(handle);','globalThis.communityHandle=handle;');
 const ctx={Request,Response,URL,URLSearchParams,crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,
  Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://supabase.test':'private-service'}},
  fetch:async url=>String(url).endsWith('/auth/v1/user')?json({id:crypto.randomUUID(),email:'user@example.com',identities:[{provider:'google'}]}):json([],200)};
 vm.runInNewContext(source,ctx);
 const request=(body,authenticated=true)=>new Request('https://edge.test',{method:'POST',headers:authenticated?{authorization:'Bearer token'}:{},body:JSON.stringify(body)});
 assert.equal((await ctx.communityHandle(new Request('https://edge.test'))).status,200);
 assert.equal((await ctx.communityHandle(request({operation:'list'},false))).status,401);
 const unsigned=await ctx.communityHandle(request({operation:'register',envelope:{publicKey:'bad'}}));assert.equal(unsigned.status,401,await unsigned.text());
 const invalid=await ctx.communityHandle(request({operation:'username',username:'@@'}));
 assert.equal(invalid.status,400);
});
