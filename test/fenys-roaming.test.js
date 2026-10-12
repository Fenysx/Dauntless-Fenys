'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const {database}=require('./helpers/sqlite');
const {createHost}=require('../src/fenys-roaming-host');
const {identity,sign,verify,encodeCode,decodeCode,hash}=require('../src/fenys-roaming-protocol');
const {RoamingClient,roamingRequest}=require('../src/fenys-roaming-client');
const {prepareFiles}=require('../src/fenys-host-setup');
const userId='UID-'+crypto.randomUUID(),characterId=crypto.randomUUID(),key='UUK_'+'a'.repeat(48),who=identity();
function command(operation,fields={}){return {...verify(sign(who,{version:1,userId,operation,requestId:crypto.randomUUID(),...fields}),operation)};}
function seed(db){
 db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId,'Vinicius',7,1);
 db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(userId,hash(key));
 db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(characterId,userId,'2026-01-01','2026-10-12','Vinicius',8,JSON.stringify({Level:24,Weapon:'sword'}));
 db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(characterId,'[{"item":"blade","level":8}]','{"rams":9999}');
 db.prepare('INSERT INTO loadouts VALUES(?,?,?,?)').run(characterId,userId,'[{"armor":"a"}]','{"active":0}');
 db.prepare('INSERT INTO progress_tracks VALUES(?,?,?,?,?,?,?)').run(userId,'mastery',3456,12,4,'2026-10-12','2026-10-12');
 db.prepare('INSERT INTO escalationprogression VALUES(?,?,?,?,?,?,?)').run(userId,'season',9,88,3,'abc','2026-10-12');
 db.prepare('INSERT INTO bounties VALUES(?,?,?,?,?,?)').run(userId,'bounty',0,4,'{"done":2}','2026-10-12');
}
function ticket(db){const secret=crypto.randomBytes(20).toString('hex');db.prepare('INSERT INTO fenys_invites VALUES(?,?,0)').run(hash(secret),Date.now()+60000);return secret;}
test('código transporta endereço, expira e não aceita internet pública nem localhost',()=>{
 const code=encodeCode('100.100.1.2:61000','b'.repeat(40),Date.now()+60000);
 assert.equal(decodeCode(code).address,'100.100.1.2:61000');
 assert.throws(()=>decodeCode(code,Date.now()+120000),/expirado/);
 assert.throws(()=>encodeCode('127.0.0.1','b'.repeat(40),Date.now()+60000));
 assert.throws(()=>decodeCode('FENYS1.'+Buffer.from(JSON.stringify({address:'8.8.8.8',secret:'b'.repeat(40),expiresAt:Date.now()+60000})).toString('base64url')));
});
test('assinatura de identidade recusa alteração do progresso e operação trocada',()=>{
 const e=sign(who,{version:1,userId,operation:'join',requestId:crypto.randomUUID()});
 assert.equal(verify(e,'join').userId,userId);
 assert.throws(()=>verify({...e,message:e.message.replace('join','leave')},'leave'),/Assinatura/);
 assert.throws(()=>verify(e,'checkout'),/Operação/);
});
test('dois Metagames reais: ida e volta mantém UID, personagem, inventário, loadout, XP, bounty e escalation',t=>{
 const a=database(t),b=database(t);seed(a);const hostA=createHost(a),hostB=createHost(b);
 const departure=command('checkout');const first=hostA.checkout(departure,key).snapshot;
 assert.equal(JSON.stringify(hostA.checkout(departure,key).snapshot),JSON.stringify(first),'resposta perdida é recuperável');
 assert.equal(first.tables.users[0].isAdmin,0);
 assert.equal(hostA.blocked({url:'/character/'+characterId,headers:{},body:{}}),true);
 const session=crypto.randomUUID(),gameKey='UUK_'+'b'.repeat(48),secret=ticket(b);
 const arrival=command('join',{snapshot:first,session,gameKey,secret});hostB.join(arrival);
 hostB.join(arrival);assert.equal(hostB.events(0).events.length,1,'retry não duplica entrada');
 assert.equal(b.prepare('SELECT isAdmin FROM users').get().isAdmin,0,'admin não viaja');
 assert.equal(b.prepare('SELECT characterId FROM characters').get().characterId,characterId);
 assert.equal(b.prepare('SELECT stackedItems FROM inventories').get().stackedItems,'{"rams":9999}');
 assert.equal(b.prepare('SELECT progress FROM progress_tracks').get().progress,3456);
 b.prepare('UPDATE progress_tracks SET progress=5555').run();
 b.prepare('UPDATE inventories SET stackedItems=?').run('{"rams":12000}');
 b.prepare('UPDATE characters SET updateVersion=9,data=?').run('{"Level":25}');
 const leaving=command('leave',{session});const next=hostB.leave(leaving).snapshot;
 assert.equal(JSON.stringify(hostB.leave(leaving).snapshot),JSON.stringify(next));
 assert.equal(b.prepare('SELECT count(*) n FROM userapikeys').get().n,0);
 assert.equal(hostB.blocked({url:'/save',headers:{},body:{AccountId:userId}}),true);
 hostA.join(command('join',{snapshot:next,session:crypto.randomUUID(),gameKey:key,secret:null}));
 assert.equal(a.prepare('SELECT userId FROM users').get().userId,userId);
 assert.equal(a.prepare('SELECT isAdmin FROM users').get().isAdmin,1,'admin original restaurado');
 assert.equal(a.prepare('SELECT data FROM characters').get().data,'{"Level":25}');
 assert.equal(a.prepare('SELECT progress FROM progress_tracks').get().progress,5555);
 assert.equal(a.prepare('SELECT stackedItems FROM inventories').get().stackedItems,'{"rams":12000}');
 assert.equal(a.prepare('SELECT loadouts FROM loadouts').get().loadouts,'[{"armor":"a"}]');
 assert.equal(a.prepare('SELECT level FROM escalationprogression').get().level,9);
 assert.equal(a.prepare('SELECT data FROM bounties').get().data,'{"done":2}');
 assert.throws(()=>hostB.join(command('join',{snapshot:next,session:crypto.randomUUID(),gameKey,secret})),/utilizado/);
});
test('nega sessão dupla, replay antigo, dados de outra pessoa e incompatibilidade sem consumir convite',t=>{
 const a=database(t),b=database(t);seed(a);const ha=createHost(a),hb=createHost(b);
 const first=ha.checkout(command('checkout'),key).snapshot;
 const secret=ticket(b),gameKey='UUK_'+'b'.repeat(48),session=crypto.randomUUID();
 const invalid=structuredClone(first);invalid.tables.characters[0].userId='UID-'+crypto.randomUUID();
 assert.throws(()=>hb.join(command('join',{snapshot:invalid,secret,gameKey,session})),/Personagens/);
 assert.equal(b.prepare('SELECT used FROM fenys_invites').get().used,0);
 const schema=structuredClone(first);schema.schema='old';
 assert.throws(()=>hb.join(command('join',{snapshot:schema,secret,gameKey,session})),/incompatível/);
 hb.join(command('join',{snapshot:first,secret,gameKey,session}));
 assert.throws(()=>hb.join(command('join',{snapshot:first,secret,gameKey,session:crypto.randomUUID()})),/sessão ativa/);
 hb.leave(command('leave',{session}));
 assert.throws(()=>hb.join(command('join',{snapshot:first,secret:ticket(b),gameKey,session:crypto.randomUUID()})),/antigo/);
});
test('conflito de nome no destino faz rollback e preserva progresso protegido na origem',t=>{
 const a=database(t),b=database(t);seed(a);const ha=createHost(a),hb=createHost(b);
 b.prepare('INSERT INTO users VALUES(?,?,?,?)').run('UID-'+crypto.randomUUID(),'VINICIUS',0,0);
 const snap=ha.checkout(command('checkout'),key).snapshot,secret=ticket(b);
 assert.throws(()=>hb.join(command('join',{snapshot:snap,session:crypto.randomUUID(),gameKey:key,secret})),/nome/);
 assert.equal(b.prepare('SELECT used FROM fenys_invites').get().used,0);
 assert.equal(a.prepare('SELECT data FROM characters').get().data,snap.tables.characters[0].data);
});
test('progresso não sai enquanto o jogo ainda tem heartbeat ativo',t=>{
 const a=database(t);seed(a);let players=[{UserId:userId}];const h=createHost(a,{online:()=>players});
 assert.throws(()=>h.checkout(command('checkout'),key),/Feche o jogo/);
 assert.equal(a.prepare('SELECT count(*) n FROM fenys_passports').get().n,0);
 players=[];const snap=h.checkout(command('checkout'),key).snapshot,session=crypto.randomUUID();
 h.join(command('join',{snapshot:snap,session,gameKey:key}));players=[{UserId:userId}];
 assert.throws(()=>h.leave(command('leave',{session})),/Feche o jogo/);
 assert.equal(a.prepare('SELECT active FROM fenys_passports').get().active,1);
});
async function serve(t,db){
 const host=createHost(db);
 const server=http.createServer(async(req,res)=>{
  res.status=function(code){this.statusCode=code;return this;};res.json=function(body){this.setHeader('content-type','application/json');this.end(JSON.stringify(body));};
  let text='';for await(const chunk of req)text+=chunk;req.body=text?JSON.parse(text):{};
  host.middleware(req,res,()=>{
   if(req.url==='/undaunted/api/GetUserInfo'){
    const row=db.prepare('SELECT u.* FROM users u JOIN userapikeys k ON u.userId=k.userId WHERE k.keyHash=?').get(hash(req.headers['x-undaunted-user-api-key']||''));
    if(!row){res.status(401).end('{}');return;}res.json({UserId:row.userId,Username:row.name,IsAdmin:!!row.isAdmin});
   }else if(req.url==='/slow-save'){
    setTimeout(()=>{db.prepare('UPDATE progress_tracks SET progress=4321 WHERE accountId=?').run(userId);res.json({saved:true});},100);
   }else res.status(404).end('{}');
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 return {host,port:server.address().port,server};
}
test('launcher e HTTP real: recuperação após join/leave confirmado com resposta perdida, sem duplicar e sem perder XP',async t=>{
 const a=database(t),b=database(t);seed(a);const sa=await serve(t,a),sb=await serve(t,b);
 const nativeFetch=globalThis.fetch;
 t.mock.method(globalThis,'fetch',(url,...args)=>nativeFetch(String(url).replace('100.64.1.2','127.0.0.1'),...args));
 const profile={id:crypto.randomUUID(),server:'127.0.0.1:'+sa.port};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-roaming-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let failRoute='join';
 const client=new RoamingClient({directory:dir,protect:s=>Buffer.from(s),unprotect:b=>b.toString(),request:async(...args)=>{
  const result=await roamingRequest(...args);if(args[1]===failRoute){failRoute=null;throw Error('resposta perdida');}return result;
 }});
 const code=encodeCode('100.64.1.2:'+sb.port,ticket(b),Date.now()+60000);
 await assert.rejects(client.connect(profile,key,code),/resposta perdida/);
 assert.equal(client.state(profile).pending,'join');assert.throws(()=>client.key(profile,key),/pendente/);
 await client.recover(profile,key);
 assert.equal(client.state(profile).connected,true);assert.equal(sb.host.events(0).events.length,1);
 b.prepare('UPDATE progress_tracks SET progress=8888').run();
 failRoute='leave';await assert.rejects(client.home(profile,key),/resposta perdida/);
 assert.equal(client.state(profile).pending,'leave');
 await client.recover(profile,key);await client.home(profile,key);
 assert.equal(client.state(profile).connected,false);
 assert.equal(a.prepare('SELECT progress FROM progress_tracks').get().progress,8888);
 assert.equal(a.prepare('SELECT characterId FROM characters').get().characterId,characterId);
 assert.equal(sb.host.events(0).events.length,2);
 // The signed key and snapshot never leave the main-process interface state.
 assert.doesNotMatch(JSON.stringify(client.state(profile)),/UUK_|privateKey|publicKey|stackedItems/);
});
test('instalação é idempotente, mantém loopback do deploy e exige APIKEY sem gateway',()=>{
 const input={appSource:'export const app = express();\napp.use(express.urlencoded({ extended: true }));',
  serverSource:'logger.info(`Clear Skies, Slayer.`);',metagameEnv:'AUTH_MODE=APIKEY\nREGISTRATION_MODE=OPEN\n',deployEnv:'MY_IP=127.0.0.1\n',address:'100.100.1.2:61000'};
 const first=prepareFiles(input),again=prepareFiles({...first,address:input.address});
 assert.deepEqual(first,again);
 assert.match(first.metagameEnv,/BIND_HOST=127.0.0.1/);assert.match(first.metagameEnv,/REGISTRATION_MODE=INVITECODE/);
 assert.match(first.deployEnv,/MY_IP=100.100.1.2/);assert.match(first.deployEnv,/BIND_HOST=127.0.0.1/);
 assert.throws(()=>prepareFiles({...input,metagameEnv:'AUTH_MODE=NONE'}),/APIKEY/);
 assert.throws(()=>prepareFiles({...input,metagameEnv:'AUTH_MODE=APIKEY\nGATEWAY_SECRET=secret'}),/gateway/);
});
test('exportação aguarda save assíncrono mesmo se o cliente HTTP desconectar antes da resposta',async t=>{
 const db=database(t);seed(db);const {port}=await serve(t,db),address='127.0.0.1:'+port;
 const abort=new AbortController();
 const saving=fetch('http://'+address+'/slow-save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId}),signal:abort.signal}).catch(()=>null);
 await new Promise(r=>setTimeout(r,25));abort.abort();
 const result=await roamingRequest(address,'checkout',sign(who,{version:1,userId,operation:'checkout',requestId:crypto.randomUUID()}),key);
 await saving;assert.equal(result.snapshot.tables.progress_tracks[0].progress,4321);
});
test('importação recusada permite retornar à origem após confirmar que nada foi gravado no destino',async t=>{
 const a=database(t),b=database(t);seed(a);const sa=await serve(t,a),sb=await serve(t,b);
 b.prepare('INSERT INTO users VALUES(?,?,?,?)').run('UID-'+crypto.randomUUID(),'Vinicius',0,0);
 const nativeFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',(url,...args)=>nativeFetch(String(url).replace('100.64.1.2','127.0.0.1'),...args));
 const profile={id:crypto.randomUUID(),server:'127.0.0.1:'+sa.port};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-rollback-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const client=new RoamingClient({directory:dir,protect:s=>Buffer.from(s),unprotect:b=>b.toString()});
 const code=encodeCode('100.64.1.2:'+sb.port,ticket(b),Date.now()+60000);
 await assert.rejects(client.connect(profile,key,code),/nome/);assert.equal(client.state(profile).pending,'join');
 await client.home(profile,key);assert.equal(client.state(profile).pending,null);assert.equal(client.state(profile).connected,false);
 assert.equal(a.prepare('SELECT stackedItems FROM inventories').get().stackedItems,'{"rams":9999}');
});
