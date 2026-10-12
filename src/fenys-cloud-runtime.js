'use strict';
// One authoritative Metagame/SQLite database. Game hosts forward all account,
// character, progression and social APIs instead of importing local copies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {parseServerAddress}=require('./fenys-api');
const {identity,hash,sign,verify,encodeCode,call,privateRequest,localRequest,VERSION}=require('./fenys-cloud-protocol');
const {createBackup}=require('./fenys-cloud-backup');
const {importState,previewState}=require('./fenys-cloud-migration');
let running=null;
function routeOK(route){
 if(typeof route!=='string'||route.length>16384||!route.startsWith('/')||route.startsWith('//')||/[\\\r\n#]/.test(route))return false;
 try{const parsed=new URL(route,'http://localhost'),decoded=decodeURIComponent(parsed.pathname);return parsed.host==='localhost'&&!/[\\\r\n]/.test(decoded)&&!decoded.includes('..')&&!decoded.startsWith('//')&&!/^\/(?:fenys|internal)(?:\/|$)/i.test(decoded);}catch{return false;}
}
async function forward(address,route,method,headers,body,timeout=300000){
 if(!routeOK(route)||!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw Error('Rota de jogo inválida.');
 const response=await fetch('http://'+parseServerAddress(address).address+route,{method,headers,
  body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body||{}),redirect:'manual',signal:AbortSignal.timeout(timeout)});
 const data=Buffer.from(await response.arrayBuffer());if(data.length>40*1024*1024)throw Error('Resposta de jogo excedeu o limite.');
 return {status:response.status,contentType:response.headers.get('content-type')||'application/json',data:data.toString('base64')};
}
function send(res,result){res.status(result.status);res.setHeader('content-type',result.contentType);res.end(Buffer.from(result.data,'base64'));}
function createAuthority(db,{address,localAddress='127.0.0.1:61000',deployAddress='127.0.0.1:61001',online=()=>[],validateToken=()=>null,revoke=()=>{},native=forward,invoke=call,now=Date.now,backup=null,allowLoopbackHosts=false}={}){
 address=parseServerAddress(address).address;localAddress=parseServerAddress(localAddress).address;
 db.exec(`CREATE TABLE IF NOT EXISTS fenys_cloud_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS fenys_cloud_hosts(id TEXT PRIMARY KEY,publicKey TEXT NOT NULL UNIQUE,address TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL,lastSeen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS fenys_cloud_invites(secretHash TEXT PRIMARY KEY,hostId TEXT NOT NULL,kind TEXT NOT NULL,expiresAt INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS fenys_cloud_players(userId TEXT PRIMARY KEY,hostId TEXT NOT NULL,session TEXT NOT NULL,lastSeen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS fenys_cloud_allocations(userId TEXT NOT NULL,hostId TEXT NOT NULL,session TEXT NOT NULL,expiresAt INTEGER NOT NULL,PRIMARY KEY(userId,hostId,session));
 CREATE TABLE IF NOT EXISTS fenys_cloud_requests(id TEXT PRIMARY KEY,hostId TEXT NOT NULL,digest TEXT NOT NULL,result TEXT,time INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS fenys_cloud_events(id INTEGER PRIMARY KEY AUTOINCREMENT,hostId TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,time INTEGER NOT NULL);`);
 const setting=(key,make)=>{let row=db.prepare('SELECT value FROM fenys_cloud_settings WHERE key=?').get(key);if(!row){const value=make();db.prepare('INSERT INTO fenys_cloud_settings VALUES(?,?)').run(key,value);row={value};}return row.value;};
 const pair=JSON.parse(setting('authorityIdentity',()=>JSON.stringify(identity()))),realm=setting('realm',()=>crypto.randomUUID());
 const internal=setting('internal',()=>crypto.randomBytes(32).toString('hex')),gameKey=setting('gameKey',()=>crypto.randomBytes(32).toString('hex'));
 if(!db.prepare('SELECT id FROM gameserverapikeys WHERE keyHash=?').get(hash(gameKey)))db.prepare('INSERT INTO gameserverapikeys(keyHash) VALUES(?)').run(hash(gameKey));
 const rootId='central';
 db.prepare('INSERT INTO fenys_cloud_hosts VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET address=excluded.address,lastSeen=excluded.lastSeen').run(rootId,pair.publicKey,address,'Servidor central',now());
 const account=key=>typeof key==='string'&&key.length<256?db.prepare('SELECT u.* FROM users u JOIN userapikeys k ON u.userId=k.userId WHERE k.keyHash=?').get(hash(key)):null;
 function hostForPlayer(userId){return db.prepare('SELECT hostId FROM fenys_cloud_players WHERE userId=?').get(userId)?.hostId||rootId;}
 function hostForPlayers(players){return Array.isArray(players)&&players.length?hostForPlayer(players[0]):rootId;}
 function host(id){const row=db.prepare('SELECT * FROM fenys_cloud_hosts WHERE id=? AND active=1').get(id);if(!row)throw Error('Host não autorizado na rede global.');return row;}
 function event(hostId,name,kind){db.prepare('INSERT INTO fenys_cloud_events(hostId,name,kind,time) VALUES(?,?,?,?)').run(hostId,String(name).slice(0,32),kind,now());db.prepare('DELETE FROM fenys_cloud_events WHERE id <= (SELECT coalesce(max(id),0)-2000 FROM fenys_cloud_events)').run();}
 function invite(hostId,kind='player'){
  const target=host(hostId),secret=crypto.randomBytes(24).toString('hex'),expiresAt=now()+15*60000;
  db.prepare('DELETE FROM fenys_cloud_invites WHERE expiresAt<?').run(now());
  db.prepare('INSERT INTO fenys_cloud_invites VALUES(?,?,?,?,0)').run(hash(secret),hostId,kind,expiresAt);
  return {code:encodeCode({authority:address,address:target.address,realm,hostId,secret,expiresAt,kind}),expiresAt};
 }
 function consume(secret,hostId,kind){const row=db.prepare('SELECT * FROM fenys_cloud_invites WHERE secretHash=? AND hostId=? AND kind=? AND used=0 AND expiresAt>?').get(hash(String(secret)),hostId,kind,now());if(!row)throw Error('Código inválido, usado ou expirado.');db.prepare('UPDATE fenys_cloud_invites SET used=1 WHERE secretHash=?').run(row.secretHash);}
 function register(p){
  if(p.realm!==realm)throw Error('O código pertence a outra rede global.');
  const server=parseServerAddress(p.address);if(server.local&&!allowLoopbackHosts)throw Error('Cadastre o IP Tailscale do host.');
  return db.transaction(()=>{
   const existing=db.prepare('SELECT * FROM fenys_cloud_hosts WHERE publicKey=?').get(p.publicKey);
   if(existing){if(existing.address!==server.address)throw Error('Host já cadastrado com outro endereço.');return {hostId:existing.id,realm,authority:address,authorityPublicKey:pair.publicKey};}
   consume(p.secret,rootId,'host');const id=crypto.randomUUID();
   db.prepare('INSERT INTO fenys_cloud_hosts VALUES(?,?,?,?,1,?)').run(id,p.publicKey,server.address,String(p.name||'Servidor amigo').slice(0,64),now());
   backup?.mark();return {hostId:id,realm,authority:address,authorityPublicKey:pair.publicKey};
  }).immediate();
 }
 function join(key,body){
  const me=account(key);if(!me)throw Error('Use uma conta da rede global. Sua chave local não corresponde à conta central.');
  if(db.prepare('SELECT active FROM account_bans WHERE account_id=?').get(me.userId)?.active)throw Error('A conta está bloqueada na rede global.');
  if(!body||typeof body.session!=='string'||! /^[a-f0-9-]{36}$/i.test(body.session)||body.realm!==realm)throw Error('Sessão global inválida.');
  const target=host(body.hostId),current=db.prepare('SELECT * FROM fenys_cloud_players WHERE userId=?').get(me.userId);
  if(current?.session===body.session&&current.hostId===target.id)return {userId:me.userId,session:body.session,hostId:target.id,address:target.address,authority:address,realm};
  if(online().some(p=>p.UserId===me.userId))throw Error('Feche o jogo antes de trocar de host. Aguarde até 90 segundos para confirmar a saída.');
  return db.transaction(()=>{
   if(target.id!==rootId)consume(body.secret,target.id,'player');
   if(current)event(current.hostId,me.name,'left');
   db.prepare('DELETE FROM fenys_cloud_allocations WHERE userId=?').run(me.userId);
   db.prepare('INSERT INTO fenys_cloud_players VALUES(?,?,?,?) ON CONFLICT(userId) DO UPDATE SET hostId=excluded.hostId,session=excluded.session,lastSeen=excluded.lastSeen').run(me.userId,target.id,body.session,now());
   db.prepare('INSERT INTO authepochs(userId,epoch) VALUES(?,1) ON CONFLICT(userId) DO UPDATE SET epoch=epoch+1').run(me.userId);
   event(target.id,me.name,'joined');backup?.mark();
   return {userId:me.userId,session:body.session,hostId:target.id,address:target.address,authority:address,realm};
  }).immediate();
 }
 function events(hostId,cursor){
  const last=db.prepare('SELECT coalesce(max(id),0) id FROM fenys_cloud_events WHERE hostId=?').get(hostId).id;
  if(cursor===null||!Number.isSafeInteger(cursor))cursor=last;
  const events=db.prepare('SELECT id,name,kind,time FROM fenys_cloud_events WHERE hostId=? AND id>? ORDER BY id LIMIT 100').all(hostId,cursor);
  const players=db.prepare('SELECT u.name FROM fenys_cloud_players p JOIN users u ON u.userId=p.userId WHERE p.hostId=? AND p.lastSeen>?').all(hostId,now()-45000);
  const onlineCount=online().filter(p=>hostForPlayer(p.UserId)===hostId||db.prepare('SELECT userId FROM fenys_cloud_allocations WHERE userId=? AND hostId=? AND expiresAt>?').get(p.UserId,hostId,now())).length;
  return {events,players,onlineCount,cursor:events.length?events.at(-1).id:last};
 }
 function getIds(headers,body,route,targets=false){
  const ids=new Set(),me=account(headers['x-undaunted-user-api-key']);if(me)ids.add(me.userId);
  try{const token=headers.authorization;if(typeof token==='string'&&/^bearer /i.test(token)){const p=validateToken(token.slice(7));if(p?.userId)ids.add(p.userId);}}catch{}
  for(const [field,value] of Object.entries(body||{}))if(/^(?:password|auth_password|exchange_code|key|uuk)$/i.test(field)&&typeof value==='string'){
   const owner=account(value);if(owner)ids.add(owner.userId);
  }
  if(!targets)return [...ids];
  let decoded=route;try{decoded=decodeURIComponent(new URL(route,'http://localhost').pathname);}catch{}
  const references=[...(decoded.match(/UID-[a-f0-9-]{36}/gi)||[]),...(decoded.match(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi)||[])];
  const owners=new Set(['userid','accountid','characterid','leaderaccountid','phxaccountid','uid','accountids','userids','expectedplayers']);
  const opaque=new Set(['data','itemdata','loadouts','instanceditems','stackeditems','addinstanceditems','saveinstanceditems']);
  function walk(value,depth=0){if(!value||typeof value!=='object'||depth>8)return;for(const [field,child] of Object.entries(value)){
   const name=field.toLowerCase().replace(/_/g,'');
   if(owners.has(name)){if(typeof child==='string')references.push(child);else if(Array.isArray(child))references.push(...child.filter(v=>typeof v==='string'));}
   if(!opaque.has(name))walk(child,depth+1);
  }}walk(body);
  for(const id of references){if(/^UID-[a-f0-9-]{36}$/i.test(id))ids.add(id);else{const c=db.prepare('SELECT userId FROM characters WHERE characterId=?').get(id);if(c)ids.add(c.userId);}}
  return [...ids];
 }
 function scope(hostId,ids,game){
  for(const uid of ids){
   if(hostForPlayer(uid)===hostId)continue;
   if(game&&db.prepare('SELECT userId FROM fenys_cloud_allocations WHERE userId=? AND hostId=? AND expiresAt>?').get(uid,hostId,now()))continue;
   throw Error('O personagem está conectado a outro host da rede global.');
  }
 }
 async function signedRequest(envelope,op,work){
  const p=verify(envelope,op,now()),registered=host(p.hostId);if(p.realm!==realm||registered.publicKey!==p.publicKey)throw Error('Chave ou rede do host não reconhecida.');
  const digest=hash(envelope.message),previous=db.prepare('SELECT * FROM fenys_cloud_requests WHERE id=?').get(p.requestId);
  if(previous){if(previous.hostId!==p.hostId||previous.digest!==digest)throw Error('Requisição repetida com conteúdo diferente.');if(previous.result)return JSON.parse(previous.result);throw Error('Requisição já recebida. Resultado pendente; não repita a gravação.');}
  db.prepare('DELETE FROM fenys_cloud_requests WHERE time<?').run(now()-300000);
  db.prepare('INSERT INTO fenys_cloud_requests VALUES(?,?,?,NULL,?)').run(p.requestId,p.hostId,digest,now());
  const result=await work(p,registered);
  db.prepare('UPDATE fenys_cloud_requests SET result=? WHERE id=?').run(JSON.stringify(result),p.requestId);return result;
 }
 async function rpc(p){
  if(!routeOK(p.route)||typeof p.headers!=='object'||!['GET','POST','PUT','PATCH','DELETE'].includes(p.method))throw Error('Requisição de jogo inválida.');
  const headers={'content-type':'application/json','x-fenys-internal-token':internal,'x-fenys-host-id':p.hostId};
  for(const name of ['authorization','x-undaunted-user-api-key','accept'])if(typeof p.headers[name]==='string'&&p.headers[name].length<16384)headers[name]=p.headers[name];
  if(p.game===true)headers['x-undaunted-gameserver-apikey']=gameKey;
  const adminRoute=/^\/undaunted\/api\//i.test(p.route);
  const targets=p.game===true&&!/^\/friends\//i.test(p.route)&&!(p.route.startsWith('/trials/')&&p.body?.completion_time===undefined);
  if(!adminRoute)scope(p.hostId,getIds(headers,p.body,p.route,targets),p.game===true);
  const result=await native(localAddress,p.route,p.method,headers,p.body);
  return result;
 }
 async function allocate(hostId,route,method,body){
  if(!['/gameservers','/api/matchmaker/handle-matchmaking-for-player'].includes(route))throw Error('Rota de alocação inválida.');
  if(hostId===rootId)return native(deployAddress,route,method,{'content-type':'application/json'},body);
  const target=host(hostId);if(now()-target.lastSeen>45000)throw Error('O host do jogo está offline.');
  return invoke(target.address,'deploy',sign(pair,{operation:'deploy',requestId:crypto.randomUUID(),time:now(),hostId,route,method,body,realm}),undefined,300000);
 }
 async function deploy(route,method,body={}){
  if(route==='/gameservers'){
   const targets=db.prepare('SELECT id FROM fenys_cloud_hosts WHERE active=1').all();
   const snapshots=await Promise.allSettled(targets.map(h=>allocate(h.id,route,'GET',{})));
   let complete=true,servers=[];
   snapshots.forEach((r,i)=>{if(r.status!=='fulfilled'){complete=false;return;}try{const s=JSON.parse(Buffer.from(r.value.data,'base64').toString());complete=complete&&s.complete!==false;servers.push(...(s.servers||[]).map(v=>({...v,fenysHostId:targets[i].id})));}catch{complete=false;}});
   return {status:200,contentType:'application/json',data:Buffer.from(JSON.stringify({servers,complete})).toString('base64')};
  }
  const target=typeof body.FenysHostId==='string'?body.FenysHostId:hostForPlayers(body.ExpectedPlayers);
  const clean={...body};delete clean.FenysHostId;
  const result=await allocate(target,route,method,clean);
  if(result.status===200){
   const output=JSON.parse(Buffer.from(result.data,'base64').toString());
   if(output.sessionId&&Array.isArray(body.ExpectedPlayers))for(const id of body.ExpectedPlayers){
    db.prepare('INSERT INTO fenys_cloud_allocations VALUES(?,?,?,?) ON CONFLICT(userId,hostId,session) DO UPDATE SET expiresAt=excluded.expiresAt').run(id,target,output.sessionId,now()+4*3600000);
   }
  }
  return result;
 }
 async function middleware(req,res,next){
  const prefix='/fenys/cloud/v2/';
  if(!req.url.startsWith(prefix)){
   const internalCall=localRequest(req)&&req.headers['x-fenys-internal-token']===internal;
   const currentHost=internalCall?req.headers['x-fenys-host-id']:rootId;
   if(req.headers['x-fenys-internal-token']&&!internalCall){res.status(403).end();return;}
   const game=!!req.headers['x-undaunted-gameserver-apikey'],targets=game&&!/^\/friends\//i.test(req.url)&&!(req.url.startsWith('/trials/')&&req.body?.completion_time===undefined);
   if(!/^\/undaunted\/api\//i.test(req.url))try{scope(currentHost,getIds(req.headers,req.body,req.url,targets),game);}catch(e){res.status(409).json({error:e.message});return;}
   delete req.headers['x-fenys-internal-token'];delete req.headers['x-fenys-host-id'];
   const before=db.prepare('SELECT total_changes() n').get().n;
   res.once('finish',()=>{if(res.statusCode<400&&db.prepare('SELECT total_changes() n').get().n>before)backup?.mark();});
   next();return;
  }
  try{
   if(!privateRequest(req))throw Error('Use conexão direta pelo Tailscale.');
   const route=req.url.slice(prefix.length),key=req.headers['x-undaunted-user-api-key'];
   if(route==='status'&&req.method==='GET'){res.json({version:VERSION,role:'authority',realm,authority:address,hostId:rootId,authorityPublicKey:pair.publicKey});return;}
   if(req.method!=='POST')throw Error('Operação inválida.');
   if(route==='enroll-invite'){
    if(!account(key)?.isAdmin||!localRequest(req))throw Error('O administrador gera a autorização de host no PC central.');
    res.json(invite(rootId,'host'));return;
   }
   if(route==='host-register'){const p=verify(req.body,'host-register',now());res.json(register(p));return;}
   if(route==='invite'){
    if(req.body?.message){res.json(await signedRequest(req.body,'invite',p=>invite(p.hostId)));return;}
    if(!account(key)?.isAdmin||!localRequest(req))throw Error('Gere o convite no computador hospedeiro.');res.json(invite(rootId));return;
   }
   if(route==='join'){const result=join(key,req.body);revoke(result.userId);res.json(result);return;}
   if(route==='pulse'){
    const me=account(key),row=me&&db.prepare('SELECT * FROM fenys_cloud_players WHERE userId=?').get(me.userId);
    if(!row||row.session!==req.body?.session)throw Error('Conexão global encerrada.');
    db.prepare('UPDATE fenys_cloud_players SET lastSeen=? WHERE userId=?').run(now(),me.userId);
    res.json(events(row.hostId,req.body.cursor));return;
   }
   if(route==='inspect'){
    const me=account(key);if(!me)throw Error('Conta global não reconhecida.');const row=db.prepare('SELECT * FROM fenys_cloud_players WHERE userId=?').get(me.userId);res.json(row?{...row,address:host(row.hostId).address,authority:address,realm}:{});return;
   }
   if(route==='host-pulse'){res.json(await signedRequest(req.body,'host-pulse',p=>{db.prepare('UPDATE fenys_cloud_hosts SET lastSeen=? WHERE id=?').run(now(),p.hostId);return events(p.hostId,p.cursor);}));return;}
   if(route==='rpc'){res.json(await signedRequest(req.body,'rpc',rpc));return;}
   if(route==='migrate'){res.json(await signedRequest(req.body,'migrate',p=>{const result=importState(db,p.hostId,p.snapshot);backup?.mark();return result;}));return;}
   if(route==='migrate-check'){res.json(await signedRequest(req.body,'migrate-check',p=>previewState(db,p.hostId,p.snapshot)));return;}
   if(route==='migration-status'){res.json(await signedRequest(req.body,'migration-status',p=>{const exists=db.prepare("SELECT name FROM sqlite_master WHERE name='fenys_cloud_migrations'").get();return {migrated:!!(exists&&db.prepare('SELECT hostId FROM fenys_cloud_migrations WHERE hostId=?').get(p.hostId))};}));return;}
   if(route==='events'){
    if(!account(key)?.isAdmin)throw Error('Acesso administrativo necessário.');res.json(events(rootId,req.body?.cursor));return;
   }
   if(route==='backup-status'||route==='backup-now'){
    if(!account(key)?.isAdmin||!localRequest(req))throw Error('Consulte backups no PC central.');
    if(!backup)throw Error('Backup Drive não configurado.');res.json(route==='backup-now'?await backup.flush(true):backup.state());return;
   }
   res.status(404).end();
  }catch(e){res.status(409).json({error:e.message||'Operação global não concluída.'});}
 }
 return {middleware,join,invite,register,rpc,deploy,hostForPlayer,hostForPlayers,events,realm,pair,account};
}
function createGateway(db,config,{invoke=call,native=forward,now=Date.now}={}){
 const signed=(operation,fields={})=>sign(config,{operation,hostId:config.hostId,realm:config.realm,time:now(),requestId:crypto.randomUUID(),...fields});
 const gameKeyValid=key=>typeof key==='string'&&!!db.prepare('SELECT id FROM gameserverapikeys WHERE keyHash=?').get(hash(key));
 const seen=new Map();let cachedEvents={events:[],players:[],cursor:null};
 async function pulse(){cachedEvents=await invoke(config.authority,'host-pulse',signed('host-pulse',{cursor:cachedEvents.cursor}));return cachedEvents;}
 async function middleware(req,res,next){
  try{
   if(!privateRequest(req))throw Error('Conecte diretamente pela VPN.');
   if(req.url.startsWith('/fenys/cloud/v2/')){
    const route=req.url.slice('/fenys/cloud/v2/'.length);
    if(route==='status'&&req.method==='GET'){
     const central=await invoke(config.authority,'status');if(central.realm!==config.realm)throw Error('Rede global não corresponde ao cadastro do host.');res.json({...central,role:'host',hostId:config.hostId,address:config.address});return;
    }
    if(route==='events'&&req.method==='POST'){
     if(!localRequest(req))throw Error('Consulte o painel no computador hospedeiro.');res.json(await pulse());return;
    }
    if(route==='invite'&&req.method==='POST'){
     if(!localRequest(req))throw Error('Gere o código no computador hospedeiro.');res.json(await invoke(config.authority,'invite',signed('invite')));return;
    }
    if(route==='deploy'&&req.method==='POST'){
     const p=verify(req.body,'deploy',now());
     if(p.publicKey!==config.authorityPublicKey||p.hostId!==config.hostId||p.realm!==config.realm||!['/gameservers','/api/matchmaker/handle-matchmaking-for-player'].includes(p.route))throw Error('Alocação não autorizada pela autoridade central.');
     if(seen.has(p.requestId)){res.json(await seen.get(p.requestId));return;}
     const promise=native(config.deployAddress||'127.0.0.1:61001',p.route,p.method,{'content-type':'application/json'},p.body);seen.set(p.requestId,promise);
     for(const [id,entry] of seen)if(seen.size>1000){seen.delete(id);break;}
     res.json(await promise);return;
    }
    throw Error('Use o endereço da autoridade central para esta operação.');
   }
   if(!routeOK(req.url))throw Error('Esta rota local está indisponível no modo global.');
   const gameKey=req.headers['x-undaunted-gameserver-apikey'];
   if(gameKey&&(!localRequest(req)||!gameKeyValid(gameKey)))throw Error('Chave do game server recusada no host.');
   const headers={};for(const name of ['authorization','x-undaunted-user-api-key','accept'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
   const result=await invoke(config.authority,'rpc',signed('rpc',{route:req.url,method:req.method,headers,body:req.body||{},game:!!gameKey}),undefined,300000);
   send(res,result);
  }catch(e){res.status(503).json({error:e.message||'Autoridade global offline.'});}
 }
 return {middleware,pulse};
}
function start(db,options={}){
 const role=process.env.FENYS_CLOUD_ROLE;if(!role)return {middleware:(req,res,next)=>next()};
 if(role==='authority'){
  const backup=createBackup(db,{directory:path.join(process.cwd(),'fenys-cloud-backups'),remote:process.env.FENYS_CLOUD_DRIVE_REMOTE||'dauntless-crypt:automaticos/globais',binary:process.env.FENYS_RCLONE_BINARY||undefined});
  running=createAuthority(db,{...options,address:process.env.FENYS_CLOUD_PUBLIC_ADDRESS,localAddress:'127.0.0.1:'+process.env.PORT,deployAddress:'127.0.0.1:61001',backup,allowLoopbackHosts:process.env.NODE_ENV==='test'});
  const adapter=http.createServer(async(req,res)=>{
   if(!localRequest(req)){res.writeHead(403);res.end();return;}
   try{let body='',size=0;for await(const d of req){size+=d.length;if(size>1024*1024)throw Error('Alocação inválida.');body+=d;}const result=await running.deploy(req.url,req.method,body?JSON.parse(body):{});res.writeHead(result.status,{'content-type':result.contentType});res.end(Buffer.from(result.data,'base64'));}catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"host_unavailable"}');}
  });adapter.on('error',e=>{console.error('Fenys: roteador de hosts indisponível: '+e.message);process.exitCode=1;});adapter.listen(Number(process.env.FENYS_CLOUD_ROUTER_PORT||61004),'127.0.0.1');
  return running;
 }
 if(role==='host'){
  const config=JSON.parse(fs.readFileSync(path.join(process.cwd(),'fenys','cloud-host.json'),'utf8'));
  running=createGateway(db,config,options);setInterval(()=>void running.pulse().catch(()=>{}),15000).unref();return running;
 }
 throw Error('FENYS_CLOUD_ROLE inválido.');
}
function hostForPlayer(id){return running?.hostForPlayer?.(id)||'';}
function hostForPlayers(ids){return running?.hostForPlayers?.(ids)||'';}
module.exports={createAuthority,createGateway,start,hostForPlayer,hostForPlayers,forward,routeOK};
