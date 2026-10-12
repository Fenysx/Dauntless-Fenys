'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {database}=require('./helpers/sqlite');
const {createAuthority,createGateway,forward,routeOK}=require('../src/fenys-cloud-runtime');
const {identity,sign,call,decodeCode,hash}=require('../src/fenys-cloud-protocol');
const {CloudClient}=require('../src/fenys-cloud-client');
const {createBackup}=require('../src/fenys-cloud-backup');
const {prepareCloudFiles}=require('../src/fenys-cloud-setup');
const {capture,importState,previewState}=require('../src/fenys-cloud-migration');
function player(db,name,admin=0){const uid='UID-'+crypto.randomUUID(),cid=crypto.randomUUID(),key='UUK_'+crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(uid,name,0,admin);db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(uid,hash(key));db.prepare('INSERT INTO characters VALUES(?,?,?,?,?,?,?)').run(cid,uid,'2026-10-12','2026-10-12',name,1,'{"Level":20}');db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(cid,'[]','{"rams":1000}');return {uid,cid,key};}
async function server(t,db){
 let middleware=(_req,_res,next)=>next();
 const s=http.createServer(async(req,res)=>{
  res.status=function(n){this.statusCode=n;return this;};res.json=function(b){this.setHeader('content-type','application/json');this.end(JSON.stringify(b));};let text='';for await(const d of req)text+=d;req.body=text?JSON.parse(text):{};
  await middleware(req,res,()=>{
   const me=db.prepare('SELECT u.* FROM users u JOIN userapikeys k ON u.userId=k.userId WHERE k.keyHash=?').get(hash(req.headers['x-undaunted-user-api-key']||''));
   if(req.url==='/undaunted/api/GetUserInfo'){if(!me){res.status(401).json({error:'invalid_key'});return;}res.json({UserId:me.userId,Username:me.name,IsAdmin:!!me.isAdmin});return;}
   if(!me&&!req.headers['x-undaunted-gameserver-apikey']){res.status(401).end('{}');return;}
   const uid=me?.userId||req.body.userId;
   if(req.url==='/test/save')db.prepare('UPDATE characters SET data=?,updateVersion=updateVersion+1 WHERE userId=?').run(JSON.stringify({Level:req.body.level}),uid);
   if(req.url==='/test/friend')db.prepare('INSERT OR REPLACE INTO friendships VALUES(?,?,?,?,?,?)').run(...[uid,req.body.friendId].sort(),uid,'ACCEPTED',Date.now(),Date.now());
   const c=db.prepare('SELECT * FROM characters WHERE userId=?').get(uid);
   res.json({character:c,guild:db.prepare('SELECT * FROM guildmembers WHERE accountId=?').get(uid),friends:db.prepare('SELECT * FROM friendships WHERE userLow=? OR userHigh=?').all(uid,uid),leaderboard:db.prepare('SELECT * FROM leaderboardprofiles WHERE accountId=?').get(uid)});
  });
 });
 await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{s.close(r);s.closeAllConnections();}));return {port:s.address().port,set:m=>{middleware=m;}};
}
async function network(t){
 const a=database(t),b=database(t),c=database(t),sa=await server(t,a),sb=await server(t,b),sc=await server(t,c);
 const nativeFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',(url,...args)=>nativeFetch(String(url).replace(/100\.64\.1\.[123]/g,'127.0.0.1'),...args));
 const root='100.64.1.1:'+sa.port,authority=createAuthority(a,{address:root,localAddress:'127.0.0.1:'+sa.port});sa.set(authority.middleware);
 const admin=player(a,'Fenys',1),p=player(a,'Vinicius'),friend=player(a,'Ygor');
 const gateways=[];
 for(const [db,s,ip] of [[b,sb,'100.64.1.2'],[c,sc,'100.64.1.3']]){
  const pair=identity(),ticket=decodeCode(authority.invite('central','host').code),address=ip+':'+s.port;
  const registered=authority.register({...JSON.parse(sign(pair,{operation:'host-register',requestId:crypto.randomUUID(),time:Date.now(),realm:authority.realm,secret:ticket.secret,address}).message),publicKey:pair.publicKey});
  const config={...pair,...registered,address},gateway=createGateway(db,config);s.set(gateway.middleware);gateways.push({config,gateway,db});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-global-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 const client=new CloudClient({directory:dir,protect:s=>Buffer.from(s),unprotect:b=>b.toString()}),profile={id:crypto.randomUUID(),server:root};
 return {a,b,c,authority,root,admin,p,friend,gateways,client,profile};
}
test('autoridade e dois hosts: mesmo UID/personagem/nível e relações sociais globais, sem copiar bancos',async t=>{
 const n=await network(t),{a,b,c,p,friend,authority,gateways,client,profile}=n;
 a.prepare('INSERT INTO guildmembers VALUES(?,?,?,?,?)').run(p.uid,'guild-global','Leader',1,1);
 a.prepare('INSERT INTO leaderboardprofiles VALUES(?,?,?,?,?,?)').run(p.uid,'epic','platform','PC','Vinicius','2026-10-12');
 await client.connect(profile,p.key,authority.invite(gateways[0].config.hostId).code);
 const hostA=gateways[0].config.address,hostB=gateways[1].config.address;
 const request=async(address,route,body)=>{const r=await fetch('http://'+address+route,{method:body?'POST':'GET',headers:{'x-undaunted-user-api-key':p.key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200,await r.clone().text());return r.json();};
 let first=await request(hostA,'/test/state');assert.equal(first.character.characterId,p.cid);assert.equal(first.guild.guildId,'guild-global');
 await request(hostA,'/test/save',{level:27});
 await request(hostA,'/test/friend',{friendId:friend.uid});
 await client.connect(profile,p.key,authority.invite(gateways[1].config.hostId).code);
 const next=await request(hostB,'/test/state');assert.equal(next.character.userId,p.uid);assert.equal(next.character.characterId,p.cid);assert.equal(JSON.parse(next.character.data).Level,27);
 assert.equal(next.guild.guildId,'guild-global');assert.equal(next.friends.length,1);assert.equal(next.leaderboard.displayName,'Vinicius');
 assert.equal(b.prepare('SELECT count(*) n FROM characters').get().n,0);assert.equal(c.prepare('SELECT count(*) n FROM characters').get().n,0);
 const stale=await fetch('http://'+hostA+'/test/save',{method:'POST',headers:{'x-undaunted-user-api-key':p.key,'content-type':'application/json'},body:'{"level":1}'});assert.equal(stale.status,503);assert.equal(JSON.parse(a.prepare('SELECT data FROM characters WHERE userId=?').get(p.uid).data).Level,27);
 await client.home(profile,p.key);assert.equal(client.state(profile).hostId,'central');
});
test('RPC repete resposta sem reexecutar save e rejeita assinatura falsa, replay divergente e rotas internas codificadas',async t=>{
 const n=await network(t),{authority,gateways,p,client,profile}=n;
 await client.connect(profile,p.key,authority.invite(gateways[0].config.hostId).code);
 const config=gateways[0].config,envelope=sign(config,{operation:'rpc',requestId:crypto.randomUUID(),time:Date.now(),hostId:config.hostId,realm:config.realm,route:'/test/save',method:'POST',headers:{'x-undaunted-user-api-key':p.key},body:{level:31},game:false});
 const first=await call(n.root,'rpc',envelope);const again=await call(n.root,'rpc',envelope);assert.deepEqual(again,first);
 assert.equal(n.a.prepare('SELECT updateVersion FROM characters WHERE userId=?').get(p.uid).updateVersion,2);
 await assert.rejects(call(n.root,'rpc',{...envelope,message:envelope.message.replace('31','32')}),/Assinatura/);
 for(const route of ['/fenys/cloud/v2/rpc','/%66enys/cloud/v2/rpc','/internal/backup','/%2E%2E/fenys/cloud/v2/join','//evil.test','/a%5c..%5cfenys'])assert.equal(routeOK(route),false,route);
});
test('nuvem offline não escreve dados nos bancos dos hosts',async t=>{
 const db=database(t),local=await server(t,db),pair=identity();
 const gateway=createGateway(db,{...pair,hostId:crypto.randomUUID(),realm:crypto.randomUUID(),authority:'100.64.1.1:61000',address:'100.64.1.2:61000'},{invoke:async()=>{throw Error('central offline');}});local.set(gateway.middleware);
 const r=await fetch('http://127.0.0.1:'+local.port+'/test/save',{method:'POST',headers:{'content-type':'application/json'},body:'{"level":3}'});assert.equal(r.status,503);assert.equal(db.prepare('SELECT count(*) n FROM characters').get().n,0);
});
test('matchmaking delega ao host escolhido e permite save pelo host da caçada alocada',async t=>{
 const db=database(t),p=player(db,'Slayer'),friend=player(db,'Friend'),a=identity(),b=identity();
 const calls=[],authority=createAuthority(db,{address:'100.64.1.1:61000',native:async()=>({status:200,contentType:'application/json',data:Buffer.from('{}').toString('base64')}),invoke:async(address,route,envelope)=>{
  const payload=JSON.parse(envelope.message);calls.push({address,route,payload});return {status:200,contentType:'application/json',data:Buffer.from(JSON.stringify({host:address.split(':')[0],port:8777,sessionId:'hunt-session'})).toString('base64')};
 }});
 const enroll=(pair,address)=>{const code=decodeCode(authority.invite('central','host').code);return authority.register({publicKey:pair.publicKey,realm:authority.realm,secret:code.secret,address});};
 const ha=enroll(a,'100.64.1.2:61000'),hb=enroll(b,'100.64.1.3:61000');
 authority.join(p.key,{realm:authority.realm,hostId:ha.hostId,secret:decodeCode(authority.invite(ha.hostId).code).secret,session:crypto.randomUUID()});
 authority.join(friend.key,{realm:authority.realm,hostId:hb.hostId,secret:decodeCode(authority.invite(hb.hostId).code).secret,session:crypto.randomUUID()});
 const ownSave=await authority.rpc({hostId:ha.hostId,route:'/character',method:'POST',headers:{},game:true,body:{characterId:p.cid,data:JSON.stringify({RecentPlayers:[friend.uid]})}});assert.equal(ownSave.status,200,'recent players inside character data do not transfer ownership');
 const result=await authority.deploy('/api/matchmaker/handle-matchmaking-for-player','POST',{FenysHostId:ha.hostId,GameMode:'ISLAND',ExpectedPlayers:[p.uid,friend.uid]});
 assert.equal(result.status,200);assert.equal(calls[0].address,'100.64.1.2:61000');assert.equal(calls[0].payload.body.FenysHostId,undefined);
 const saving=await authority.rpc({hostId:ha.hostId,route:'/test/save',method:'POST',headers:{},game:true,body:{userId:friend.uid,level:30}});assert.equal(saving.status,200);
});
test('backup cobre banco global inteiro, não marca sucesso antes do cryptcheck e mantém falhas pendentes',async t=>{
 const db=database(t),p=player(db,'Cloud'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-drive-test-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 db.backup=async file=>db.prepare('VACUUM INTO ?').run(file);
 let fail=true,commands=[];const backup=createBackup(db,{directory:dir,minInterval:3600000,validateRemote:async()=>{},execute:async(binary,args)=>{commands.push(args);if(args[0]==='cryptcheck'&&fail)throw Error('integridade falhou');}});t.after(()=>backup.close());
 await assert.rejects(backup.flush(),/integridade/);assert.equal(backup.state().lastSuccess,0);assert.equal(backup.state().dirty,1);
 fail=false;await backup.flush();assert.equal(backup.state().dirty,0);assert.ok(backup.state().lastSuccess>0);
 assert.equal(commands[0][0],'copyto');assert.match(commands[0][2],/^dauntless-crypt:/);assert.equal(commands[1][0],'cryptcheck');
 const file=commands[2][1],{DatabaseSync}=require('node:sqlite'),copy=new DatabaseSync(file);try{assert.equal(copy.prepare('SELECT userId FROM users').get().userId,p.uid);assert.ok(copy.prepare("SELECT name FROM sqlite_master WHERE name='guilds'").get());}finally{copy.close();}
});
test('overlay global preserva banco/segredos, configura Drive e separa filas por host',()=>{
 const source=fs.readFileSync(path.join(__dirname,'fixtures/matchmaking.ts'),'utf8');
 const input={appSource:'export const app = express();\napp.use(localModeration);\napp.use(express.urlencoded({ extended: true }));',serverSource:'logger.info(`Clear Skies, Slayer.`);',metagameEnv:'AUTH_MODE=APIKEY\nDB_FILENAME=C:/dr/data/undaunted.db\n',deployEnv:'MY_IP=127.0.0.1\nMETAGAME_API_KEY=existing-secret\n',matchmakingSource:source,address:'100.64.1.1:61000',role:'authority'};
 const p=prepareCloudFiles(input);assert.match(p.metagameEnv,/DB_FILENAME=C:\/dr\/data\/undaunted.db/);assert.match(p.deployEnv,/METAGAME_API_KEY=existing-secret/);assert.match(p.metagameEnv,/dauntless-crypt:automaticos\/globais/);assert.match(p.matchmakingSource,/FenysHostId/);assert.match(p.matchmakingSource,/FenysHostKey:FenysRouting.hostForPlayer\(PlayerId\)/);assert.deepEqual(prepareCloudFiles({...input,...p}),p);
 assert.ok(p.appSource.indexOf('app.use(fenysCloud.middleware)')<p.appSource.indexOf('app.use(localModeration)'));
});
test('migração integra personagens, níveis, chaves, guildas, amizades e placares antigos sem dar admin global',t=>{
 const old=database(t),central=database(t),a=player(old,'Old_A',1),b=player(old,'Old_B');
 const guild=crypto.randomUUID();old.prepare('INSERT INTO guilds VALUES(?,?,?,?,?,?,?,?)').run(guild,'GuildAntiga','guildantiga','OLD','old',a.uid,1,1);
 old.prepare('INSERT INTO guildmembers VALUES(?,?,?,?,?)').run(a.uid,guild,'Leader',1,1);
 old.prepare('INSERT INTO friendships VALUES(?,?,?,?,?,?)').run(...[a.uid,b.uid].sort(),a.uid,'ACCEPTED',1,1);
 old.prepare('INSERT INTO leaderboardprofiles VALUES(?,?,?,?,?,?)').run(a.uid,'epic','platform','PC','Old_A','2026-10-12');
 const snapshot=capture(old),result=importState(central,'host-id',snapshot);
 assert.equal(result.accounts,2);assert.equal(central.prepare('SELECT isAdmin FROM users WHERE userId=?').get(a.uid).isAdmin,0);
 assert.equal(central.prepare('SELECT characterId FROM characters WHERE userId=?').get(a.uid).characterId,a.cid);
 assert.equal(central.prepare('SELECT data FROM characters WHERE userId=?').get(a.uid).data,'{"Level":20}');
 assert.equal(central.prepare('SELECT keyHash FROM userapikeys WHERE userId=?').get(a.uid).keyHash,hash(a.key));
 assert.equal(central.prepare('SELECT guildId FROM guildmembers WHERE accountId=?').get(a.uid).guildId,guild);
 assert.equal(central.prepare('SELECT count(*) n FROM friendships').get().n,1);assert.equal(central.prepare('SELECT accountId FROM leaderboardprofiles').get().accountId,a.uid);
 assert.equal(importState(central,'host-id',snapshot).alreadyImported,true);assert.equal(central.prepare('SELECT count(*) n FROM users').get().n,2);
});
test('migração com nome conflitante reverte tudo e conserva os dois bancos',t=>{
 const a=database(t),b=database(t);player(a,'SameName');const original=player(b,'SAMENAME');
 assert.throws(()=>importState(b,'new-host',capture(a)),/outra conta global/);
 assert.equal(b.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(b.prepare('SELECT userId FROM users').get().userId,original.uid);
 assert.equal(a.prepare('SELECT count(*) n FROM characters').get().n,1);
});
test('pré-validação de migração verifica banco inteiro e reverte a cópia antes de compilar o host',t=>{
 const a=database(t),b=database(t);player(a,'Preview');const snapshot=capture(a);
 assert.equal(previewState(b,'new-host',snapshot).accounts,1);
 assert.equal(b.prepare('SELECT count(*) n FROM users').get().n,0);
 assert.equal(b.prepare('SELECT count(*) n FROM characters').get().n,0);
 assert.equal(b.prepare("SELECT name FROM sqlite_master WHERE name='fenys_cloud_migrations'").get(),undefined);
 assert.equal(importState(b,'new-host',snapshot).accounts,1);
});

test('cadastro global sem senha é idempotente; chave original acompanha o jogador e código não cria duas contas',async t=>{
 const {DirectGlobal}=require('../src/fenys-direct-global');const n=await network(t),directory=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-direct-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const client=new DirectGlobal({directory,protect:s=>Buffer.from(s),unprotect:b=>b.toString(),settings:()=>({cloudAuthority:n.root})});
 const invite=n.authority.invite(n.gateways[0].config.hostId).code;const result=await client.register(invite,'NewPlayer');assert.equal(result.username,'NewPlayer');const original=client.key();await client.connect(invite);await client.connect(n.authority.invite(n.gateways[1].config.hostId).code);assert.equal(client.key(),original);assert.equal(client.state().hostId,n.gateways[1].config.hostId);assert.equal(n.a.prepare('SELECT isAdmin FROM users WHERE userId=?').get(result.userId).isAdmin,0);
 const pair=identity(),ticket=decodeCode(n.authority.invite('central').code),payload={operation:'register-player',realm:ticket.realm,hostId:ticket.hostId,secret:ticket.secret,name:'LostResponse',requestId:crypto.randomUUID(),time:Date.now()};const first=await call(n.root,'register-player',sign(pair,payload));const repeat=await call(n.root,'register-player',sign(pair,{...payload,requestId:crypto.randomUUID()}));assert.deepEqual(repeat,first);await assert.rejects(call(n.root,'register-player',sign(identity(),{...payload,name:'SecondPlayer',requestId:crypto.randomUUID()})),/já cadastrou/);
 const collision=decodeCode(n.authority.invite('central').code);await assert.rejects(call(n.root,'register-player',sign(identity(),{...payload,secret:collision.secret,name:'Fenys',requestId:crypto.randomUUID()})),/chave existente/);assert.equal(n.authority.account(n.admin.key).isAdmin,1);
});
