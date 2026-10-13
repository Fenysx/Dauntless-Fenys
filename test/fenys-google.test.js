'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {database}=require('./helpers/sqlite');
const {GoogleAuth}=require('../src/fenys-google-auth');
const {GooglePlayer}=require('../src/fenys-google-player');
const {createGoogleHost}=require('../src/fenys-google-host');
const {identity,hash,verify}=require('../src/fenys-cloud-protocol');
const {hostCall,decodeInvite,signed}=require('../src/fenys-google-cloud');
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json'}});
function temporary(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'launcher-google-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test('Google PKCE usa navegador, recusa callback estranho e não expõe tokens à interface',async t=>{
 const directory=temporary(t),uid=crypto.randomUUID();let exchanged=false,opened;
 const api=async(url,options)=>{if(url.endsWith('/settings'))return json({external:{google:true}});if(url.includes('grant_type=pkce')){const p=JSON.parse(options.body);assert.equal(p.auth_code,'one-time-code');const challenge=new URL(opened).searchParams.get('code_challenge');assert.equal(crypto.createHash('sha256').update(p.code_verifier).digest('base64url'),challenge);exchanged=true;return json({access_token:'supabase-access',refresh_token:'refresh-private',expires_in:3600});}if(url.endsWith('/user'))return json({id:uid,email:'user@example.test',identities:[{provider:'google'}]});throw Error(url);};
 const auth=new GoogleAuth({directory,port:0,protect:s=>Buffer.from(s).reverse(),unprotect:b=>Buffer.from(b).reverse().toString(),fetchImpl:api,openExternal:async(url)=>{opened=url;const callback=new URL(new URL(url).searchParams.get('redirect_to'));const wrong=await fetch(callback.origin+'/oauth/callback/not-the-current-state?code=stolen');assert.equal(wrong.status,404);assert.equal(exchanged,false);callback.searchParams.set('code','one-time-code');assert.equal((await fetch(callback)).status,200);}});
 const state=await auth.login();assert.equal(state.signedIn,true);assert.equal(state.pending,false);assert.equal(state.access_token,undefined);assert.equal(state.refresh_token,undefined);assert.equal(await auth.token(),'supabase-access');assert.ok(!fs.readFileSync(auth.file()).includes(Buffer.from('refresh-private')));auth.dispose();
});
test('Google desativado não abre navegador nem apresenta login concluído',async t=>{let opened=0;const auth=new GoogleAuth({directory:temporary(t),fetchImpl:async()=>json({external:{google:false}}),openExternal:()=>opened++});await assert.rejects(auth.login(),/desativado/);assert.equal(opened,0);assert.equal(auth.state().signedIn,false);});
test('Edge verifica Google no servidor, recusa assinatura alterada e ignora authId fornecido pelo cliente',async()=>{
 const pair=identity(),uid=crypto.randomUUID();let rpc=0,last;
 const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/fenys-global/players.ts'),'utf8')).replace('export async function','async function');
 const ctx={Request,Response,URL,crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://server.test':'private-service'}},fetch:async(url,o)=>{if(url.endsWith('/auth/v1/user')){if(o.headers.authorization!=='Bearer valid-google')return json({},401);return json({id:uid,identities:[{provider:'google'}],user_metadata:{authId:'attacker'}});}rpc++;last=JSON.parse(o.body);return json({linked:true});}};vm.runInNewContext(source+';globalThis.handle=handlePlayers;',ctx);
 const request=b=>new Request('https://edge.test/players',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer valid-google'},body:JSON.stringify(b)});
 assert.equal((await ctx.handle(request({operation:'profile',authId:crypto.randomUUID()}))).status,200);assert.equal(last.args.authId,uid);
 const envelope=signed(pair,'join',{session:crypto.randomUUID(),name:'Player'});envelope.message=envelope.message.replace('Player','Hacker');assert.equal((await ctx.handle(request({operation:'join',envelope}))).status,401);assert.equal(rpc,1);
 assert.equal((await ctx.handle(new Request('https://edge.test/players',{method:'POST',body:JSON.stringify({operation:'profile'})}))).status,401);
});
function player(db,name,admin=0){const userId='UID-'+crypto.randomUUID(),cid=crypto.randomUUID(),key='UUK_'+crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,0,?)').run(userId,name,admin);db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(userId,hash(key));db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(cid,userId,'2026-10-12','2026-10-12',name,1,'{"Level":20}');db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(cid,'[]','{"rams":1000}');return {userId,cid,key};}
async function network(t){
 const users=new Map([['google-one',crypto.randomUUID()],['google-two',crypto.randomUUID()]]),records=new Map(),authorized=new Map();let failAfterSave=false,rejectUser=null,permission=()=>({managed:false});
 const invoke=async(op,fields,token)=>{
  const auth=users.get(token);if(op==='profile'){if(!auth)throw Error('google denied');const p=records.get(auth);return p?{linked:true,authId:auth,userId:p.userId,name:p.name,key:p.key,schema:p.snapshot?.schema,activeHost:p.host?authorized.get(p.host):null,leaseUntil:p.leaseUntil,revision:p.revision}:{linked:false};}
  const s=verify(fields.envelope,op);if(!authorized.has(s.publicKey))throw Error('host denied');if(op==='host-register')return {registered:true};
  if(['join','link'].includes(op)&&!auth)throw Error('google denied');
  if(op==='link'){if([...records.values()].some(p=>p.userId===s.userId&&p.auth!==auth))throw Error('already linked');const old=records.get(auth);if(old&&old.userId!==s.userId)throw Error('other character');if(!old)records.set(auth,{auth,userId:s.userId,name:s.snapshot.tables.users[0].name,key:s.nativeKey,snapshot:structuredClone(s.snapshot),revision:1,origin:s.publicKey});return {linked:true,revision:1};}
  if(op==='join'){let p=records.get(auth);if(!p){p={auth,userId:'UID-'+crypto.randomUUID(),name:s.name,key:'UUK_'+crypto.randomBytes(24).toString('hex'),revision:0,origin:s.publicKey,snapshot:null};records.set(auth,p);}if(Date.parse(p.leaseUntil)>Date.now()&&(p.host!==s.publicKey||p.session!==s.session))throw Error('character busy');p.host=s.publicKey;p.session=s.session;p.leaseUntil=new Date(Date.now()+75000).toISOString();return {...structuredClone(p),authId:auth,originHost:p.origin};}
  if(s.userId===rejectUser)throw Error('isolated player sync failure');
  const p=[...records.values()].find(p=>p.userId===s.userId);if(!p)throw Error('unknown');if(op==='save'&&p.commitId===s.commitId)return {revision:p.revision,commitId:p.commitId,leaseUntil:p.leaseUntil};if(p.host!==s.publicKey||p.session!==s.session)throw Error('session expired');
  if(op==='save'){assert.equal(s.expectedRevision,p.revision);assert.equal(s.snapshot.userId,p.userId);p.snapshot=structuredClone(s.snapshot);p.revision++;p.commitId=s.commitId;if(failAfterSave){failAfterSave=false;throw Error('lost cloud response');}}
  if(op==='release'){p.leaseUntil=new Date(0).toISOString();return {released:true};}
  p.leaseUntil=new Date(Date.now()+75000).toISOString();return {revision:p.revision,commitId:p.commitId,leaseUntil:p.leaseUntil};
 };
 const nodes=[];
 for(let i=0;i<2;i++){
  const db=database(t),pair=identity(),admin=player(db,'Admin'+i,1);let host;
  const server=http.createServer(async(req,res)=>{res.status=function(n){this.statusCode=n;return this;};res.json=function(b){this.setHeader('content-type','application/json');this.end(JSON.stringify(b));};let raw='';for await(const b of req)raw+=b;req.body=raw?JSON.parse(raw):{};await host.middleware(req,res,()=>{const owner=db.prepare('SELECT userId FROM userapikeys WHERE keyHash=?').get(hash(req.headers['x-undaunted-user-api-key']||''));if(!owner){res.status(401).json({error:'native auth'});return;}if(req.url==='/test/save')db.prepare('UPDATE characters SET data=?,updateVersion=updateVersion+1 WHERE userId=?').run(JSON.stringify({Level:req.body.level}),owner.userId);res.json(db.prepare('SELECT * FROM characters WHERE userId=?').get(owner.userId));});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const address='100.64.2.'+(i+1)+':'+server.address().port;authorized.set(pair.publicKey,address);host=createGoogleHost(db,{config:{...pair,realm:crypto.randomUUID(),address},invoke,autoStart:false,communityAccess:(_key,token)=>Promise.resolve(permission(token))});await host.register();nodes.push({db,host,address,admin});
 }
 const nativeFetch=fetch;t.mock.method(globalThis,'fetch',(url,...args)=>nativeFetch(String(url).replace(/100\.64\.2\.[12]/g,'127.0.0.1'),...args));
 return {nodes,invoke,users,records,setFail:()=>failAfterSave=true,rejectSync:userId=>rejectUser=userId,setCommunityPermission:fn=>permission=fn};
}
test('mesmo Google recupera personagem após apagar dados do PC e troca entre hosts com UID, nível e inventário preservados',async t=>{
 const n=await network(t),[a,b]=n.nodes,p=player(a.db,'PlayerOne');const auth={state:()=>({signedIn:true}),token:async()=> 'google-one'};let settings={};
 const client=()=>new GooglePlayer({auth,settings:()=>settings,saveSettings:c=>settings=c,request:n.invoke});let first=client();await first.link(a.address,p.key);
 const invite=async node=>(await hostCall(node.address,'invite',{},null,node.admin.key)).code;
 await first.connect(await invite(a),'PlayerOne');const key=await first.credential();assert.equal(key,p.key);
 const r=await fetch('http://'+a.address+'/test/save',{method:'POST',headers:{'content-type':'application/json','x-undaunted-user-api-key':key},body:'{"level":32}'});assert.equal(r.status,200);assert.equal(JSON.parse(n.records.get(n.users.get('google-one')).snapshot.tables.characters[0].data).Level,32);
 settings={};first=client();await first.refresh();assert.equal(first.state().userId,p.userId);assert.equal(await first.credential(),key);await first.connect(await invite(b));
 const copy=b.db.prepare('SELECT * FROM characters WHERE userId=?').get(p.userId);assert.equal(copy.characterId,p.cid);assert.equal(JSON.parse(copy.data).Level,32);assert.equal(b.db.prepare('SELECT stackedItems FROM inventories WHERE characterId=?').get(p.cid).stackedItems,'{"rams":1000}');
 const stale=await fetch('http://'+a.address+'/test/save',{method:'POST',headers:{'content-type':'application/json','x-undaunted-user-api-key':key},body:'{"level":1}'});assert.equal(stale.status,409);assert.equal(JSON.parse(n.records.get(n.users.get('google-one')).snapshot.tables.characters[0].data).Level,32);
 await assert.rejects(hostCall(a.address,'link',{key},'google-two'),/linked/);
});
test('resposta perdida do Supabase conserva outbox e recupera sem repetir revisão nem apagar save',async t=>{
 const n=await network(t),a=n.nodes[0],p=player(a.db,'PlayerRecovery');const client=new GooglePlayer({auth:{state:()=>({signedIn:true}),token:async()=> 'google-one'},settings:()=>({}),saveSettings(){},request:n.invoke});await client.link(a.address,p.key);const invite=(await hostCall(a.address,'invite',{},null,a.admin.key)).code;await client.connect(invite);n.setFail();
 const response=await fetch('http://'+a.address+'/test/save',{method:'POST',headers:{'content-type':'application/json','x-undaunted-user-api-key':p.key},body:'{"level":41}'});assert.equal(response.status,503);const version=n.records.get(n.users.get('google-one')).revision;assert.ok(a.db.prepare('SELECT pending FROM launcher_google_sessions WHERE userId=?').get(p.userId).pending);await a.host.flush();assert.equal(n.records.get(n.users.get('google-one')).revision,version);assert.equal(a.db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(p.userId).dirty,0);assert.equal(JSON.parse(n.records.get(n.users.get('google-one')).snapshot.tables.characters[0].data).Level,41);
});

test('falha de rede ao renovar Google conserva a sessão para tentar novamente',async t=>{const auth=new GoogleAuth({directory:temporary(t),fetchImpl:async()=>{throw Error('network offline');}});auth.write({access_token:'expired',refresh_token:'recoverable',expires_at:0,user:{id:crypto.randomUUID(),email:'user@example.test'}});await assert.rejects(auth.token(),/offline/);assert.equal(auth.state().signedIn,true);assert.equal(auth.read().refresh_token,'recoverable');});


test('jogador admitido retorna pela VPN sem novo convite, outra conta continua bloqueada',async t=>{
 const n=await network(t),a=n.nodes[0],p=player(a.db,'ReturningPlayer');
 const client=new GooglePlayer({auth:{state:()=>({signedIn:true}),token:async()=> 'google-one'},settings:()=>({}),saveSettings(){},request:n.invoke});
 await client.link(a.address,p.key);
 const remote=async token=>{let status=200,body;const req={method:'POST',url:'/launcher/google/join',body:{},headers:{authorization:'Bearer '+token},socket:{remoteAddress:'100.64.4.9'}};const res={status(n){status=n;return this;},json(value){body=value;}};await a.host.middleware(req,res,()=>assert.fail('not a game request'));return {status,body};};
 assert.equal((await remote('google-one')).status,200);
 await hostCall(a.address,'leave',{},'google-one');
 assert.equal((await remote('google-one')).status,200);
 assert.equal((await remote('google-two')).status,409);
 assert.equal(a.db.prepare('SELECT active FROM launcher_google_sessions WHERE userId=?').get(p.userId).active,1);
});

test('falha de um personagem não impede salvar os demais jogadores',async t=>{
 const n=await network(t),a=n.nodes[0],one=player(a.db,'FirstPlayer'),two=player(a.db,'SecondPlayer');
 for(const [p,token] of [[one,'google-one'],[two,'google-two']]){
  const c=new GooglePlayer({auth:{state:()=>({signedIn:true}),token:async()=>token},settings:()=>({}),saveSettings(){},request:n.invoke});
  await c.link(a.address,p.key);await c.connect((await hostCall(a.address,'invite',{},null,a.admin.key)).code);
 }
 a.db.prepare('UPDATE characters SET data=? WHERE userId=?').run('{"Level":55}',two.userId);a.host.mark();n.rejectSync(one.userId);
 await assert.rejects(a.host.flush(),/isolated player/);
 assert.equal(JSON.parse(n.records.get(n.users.get('google-two')).snapshot.tables.characters[0].data).Level,55);
 assert.equal(a.db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(two.userId).dirty,0);
 assert.equal(a.db.prepare('SELECT dirty FROM launcher_google_sessions WHERE userId=?').get(one.userId).dirty,1);
});

test('host aplica permissão da comunidade no backend e não permite contornar VIP com sessão antiga',async t=>{
 const n=await network(t),a=n.nodes[0],p=player(a.db,'VipTest');
 const c=new GooglePlayer({auth:{state:()=>({signedIn:true}),token:async()=> 'google-one'},settings:()=>({}),saveSettings(){},request:n.invoke});
 await c.link(a.address,p.key);
 const remote=async token=>{let status=200,body;const req={method:'POST',url:'/launcher/google/join',body:{},headers:{authorization:'Bearer '+token},socket:{remoteAddress:'100.64.4.9'}};const res={status(n){status=n;return this;},json(value){body=value;}};await a.host.middleware(req,res,()=>assert.fail('not game'));return {status,body};};
 n.setCommunityPermission(token=>({managed:true,allowed:token==='google-one',reason:'VIP não autorizado'}));
 assert.equal((await remote('google-one')).status,200);
 n.setCommunityPermission(()=>({managed:true,allowed:false,reason:'VIP revogado'}));
 const blocked=await remote('google-one');
 assert.equal(blocked.status,409);
 assert.match(blocked.body.error,/VIP revogado/);
 assert.equal((await remote('google-two')).status,409);
});
