'use strict';
// Loaded INSIDE Metagame: transfers use the same SQLite writer and drain game requests first.
const crypto=require('node:crypto');
const os=require('node:os');
const {VERSION,MAX_BYTES,UID,UUID,hash,verify,encodeCode}=require('./fenys-roaming-protocol');
const TABLES={users:'userId',characters:'userId',inventories:'characterId',loadouts:'userId',
 breadcrumbs:'userId',encounteredcontent:'userId',loadoutslots:'userId',inventorytransactions:'userId',
 progress_tracks:'accountId',objectives:'accountId',huntpassselection:'accountId',entitlements:'accountId',
 cooldowns:'accountId',bounties:'accountId',bountydraft:'accountId',escalationprogression:'accountId',
 escalationtalents:'accountId',escalationunlocks:'accountId',storepurchases:'accountId',leaderboardprofiles:'accountId',huntregions:'userId'};
const quote=x=>'"'+x+'"'; // Identifiers below come exclusively from this allowlist / SQLite schema.
function createHost(db,{now=Date.now,revoke=()=>{},online=()=>[]}={}){
 if(process.env.FENYS_CLOUD_ROLE)return {middleware:(_req,_res,next)=>next()};
 db.exec(`CREATE TABLE IF NOT EXISTS fenys_passports(
  userId TEXT PRIMARY KEY,publicKey TEXT NOT NULL,revision INTEGER NOT NULL,active INTEGER NOT NULL,
  session TEXT,operation TEXT,snapshot TEXT,home INTEGER NOT NULL,baseKeyHash TEXT,localAdmin INTEGER NOT NULL,
  lastSeen INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS fenys_invites(secretHash TEXT PRIMARY KEY,expiresAt INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS fenys_events(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL,time INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS fenys_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO fenys_metadata VALUES(?,?)').run('realm',crypto.randomUUID());
 const realm=db.prepare('SELECT value FROM fenys_metadata WHERE key=?').get('realm').value;
 const columns={};
 for(const table of Object.keys(TABLES)){
  columns[table]=db.prepare('PRAGMA table_info('+quote(table)+')').all().map(c=>({name:c.name,type:c.type,pk:c.pk}));
  if(!columns[table].length)throw Error('Versão do Metagame incompatível: tabela '+table+' ausente.');
 }
 const policy=Object.fromEntries(['PROGRESSION_MODE','PROGRESSION_REAL_ACCOUNTS','ESCALATION_MODE','STORE','PROGRESSION_CONFIG_DIR','ACTIVE_HUNT_PASS'].map(k=>[k,process.env[k]||'']));
 const schema=hash(JSON.stringify({columns,policy}));
 function account(key){
  if(typeof key!=='string'||key.length>128)return null;
  return db.prepare('SELECT u.*,k.keyHash FROM users u JOIN userapikeys k ON k.userId=u.userId WHERE k.keyHash=?').get(hash(key));
 }
 function passport(p){
  const row=db.prepare('SELECT * FROM fenys_passports WHERE userId=?').get(p.userId);
  if(!row||row.publicKey!==p.publicKey)throw Error('Identidade não reconhecida neste servidor.');
  return row;
 }
 function epoch(userId){
  db.prepare('INSERT INTO authepochs(userId,epoch) VALUES(?,1) ON CONFLICT(userId) DO UPDATE SET epoch=epoch+1').run(userId);
 }
 function event(name,kind){
  db.prepare('INSERT INTO fenys_events(name,kind,time) VALUES(?,?,?)').run(String(name).slice(0,32),kind,now());
  db.prepare('DELETE FROM fenys_events WHERE id <= (SELECT coalesce(max(id),0)-2000 FROM fenys_events)').run();
 }
 function capture(userId,publicKey,revision){
  const characters=db.prepare('SELECT characterId FROM characters WHERE userId=?').all(userId).map(c=>c.characterId);
  const tables={};
  for(const [table,owner] of Object.entries(TABLES)){
   const isChar=owner==='characterId';
   const values=isChar?characters:[userId];
   tables[table]=values.length?db.prepare('SELECT * FROM '+quote(table)+' WHERE '+quote(owner)+' IN ('+values.map(()=>'?').join(',')+')').all(...values):[];
   if(table==='users')tables[table]=tables[table].map(u=>({...u,isAdmin:0}));
   if(table==='inventorytransactions')tables[table]=tables[table].map(({id,...r})=>r);
  }
  const snapshot={version:VERSION,schema,userId,publicKey,revision,tables};
  if(Buffer.byteLength(JSON.stringify(snapshot))>MAX_BYTES-65536)throw Error('Progresso muito grande para transferência.');
  return snapshot;
 }
 function validateSnapshot(s,p){
  if(!s||s.version!==VERSION||s.schema!==schema||s.userId!==p.userId||s.publicKey!==p.publicKey||
   !Number.isSafeInteger(s.revision)||s.revision<1||!s.tables||JSON.stringify(Object.keys(s.tables).sort())!==JSON.stringify(Object.keys(TABLES).sort()))
   throw Error('Progresso incompatível com este Metagame. Nenhum dado foi substituído.');
  const chars=s.tables.characters;
  if(!Array.isArray(chars)||chars.length>100||chars.some(c=>c.userId!==p.userId||typeof c.characterId!=='string'||!UUID.test(c.characterId)))
   throw Error('Personagens inválidos no progresso.');
  const ids=new Set(chars.map(c=>c.characterId));
  for(const [table,owner] of Object.entries(TABLES)){
   const rows=s.tables[table],allowed=columns[table].map(c=>c.name).filter(c=>!(table==='inventorytransactions'&&c==='id'));
   if(!Array.isArray(rows)||rows.length>100000)throw Error('Tabela de progresso inválida.');
   for(const row of rows){
    if(!row||JSON.stringify(Object.keys(row).sort())!==JSON.stringify([...allowed].sort())||
     (owner==='characterId'?!ids.has(row[owner]):row[owner]!==p.userId)||
     ('characterId' in row&&!ids.has(row.characterId))||Object.values(row).some(v=>v!==null&&!['string','number'].includes(typeof v)))
     throw Error('Dados de outro jogador ou campos inválidos na transferência.');
   }
  }
  if(s.tables.users.length!==1||s.tables.users[0].isAdmin!==0||typeof s.tables.users[0].name!=='string'||s.tables.users[0].name.length>64)
   throw Error('Conta inválida na transferência.');
 }
 function apply(s,p,localAdmin){
  validateSnapshot(s,p);
  const taken=db.prepare('SELECT userId FROM users WHERE lower(name)=lower(?) AND userId<>?').get(s.tables.users[0].name,p.userId);
  if(taken)throw Error('Já existe outro jogador com esse nome neste servidor.');
  if(db.prepare('SELECT active FROM account_bans WHERE account_id=?').get(p.userId)?.active)throw Error('Acesso bloqueado pelo administrador deste servidor.');
  for(const c of s.tables.characters){
   const existing=db.prepare('SELECT userId FROM characters WHERE characterId=?').get(c.characterId);
   if(existing&&existing.userId!==p.userId)throw Error('Conflito de identidade de personagem.');
  }
  const oldChars=db.prepare('SELECT characterId FROM characters WHERE userId=?').all(p.userId).map(c=>c.characterId);
  for(const [table,owner] of Object.entries(TABLES).reverse()){
   const values=owner==='characterId'?oldChars:[p.userId];
   if(table==='users')continue;
   if(values.length)db.prepare('DELETE FROM '+quote(table)+' WHERE '+quote(owner)+' IN ('+values.map(()=>'?').join(',')+')').run(...values);
  }
  for(const [table,rows] of Object.entries(s.tables))for(const original of rows){
   const row=table==='users'?{...original,isAdmin:localAdmin?1:0}:original;
   const names=Object.keys(row);
   const insert='INSERT INTO '+quote(table)+' ('+names.map(quote).join(',')+') VALUES ('+names.map(()=>'?').join(',')+')';
   db.prepare(table==='users'?insert+' ON CONFLICT(userId) DO UPDATE SET name=excluded.name,notes=excluded.notes,isAdmin=excluded.isAdmin':insert).run(...names.map(n=>row[n]));
  }
 }
 function checkout(p,key){
  const current=db.prepare('SELECT * FROM fenys_passports WHERE userId=?').get(p.userId);
  if(current&&current.publicKey!==p.publicKey)throw Error('Esta conta já pertence a outra identidade Fenys.');
  if(current&&!current.active){
   if(current.operation===p.requestId)return {snapshot:JSON.parse(current.snapshot)};
   throw Error('O progresso já está fora deste servidor. Recupere a conexão anterior.');
  }
  if(current&&!current.home)throw Error('Use a desconexão da sessão atual para recuperar o progresso.');
  const me=account(key);
  if(!me||me.userId!==p.userId)throw Error('A chave não reconhece esta conta no servidor de origem.');
  if(online().some(x=>x.UserId===p.userId))throw Error('Feche o jogo e aguarde até 90 segundos antes de transferir o personagem.');
  const snapshot=capture(p.userId,p.publicKey,(current?.revision||0)+1);
  db.prepare(`INSERT INTO fenys_passports VALUES(?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(userId) DO UPDATE SET revision=excluded.revision,active=0,session=NULL,operation=excluded.operation,snapshot=excluded.snapshot`)
   .run(p.userId,p.publicKey,snapshot.revision,0,null,p.requestId,JSON.stringify(snapshot),1,me.keyHash,me.isAdmin?1:0,0);
  epoch(p.userId);return {snapshot};
 }
 function join(p){
  if(!UUID.test(p.session)||typeof p.gameKey!=='string'||!/^UUK_[a-f0-9]{48}$/i.test(p.gameKey))throw Error('Sessão inválida.');
  const current=db.prepare('SELECT * FROM fenys_passports WHERE userId=?').get(p.userId);
  if(current&&current.publicKey!==p.publicKey)throw Error('Conflito de identidade.');
  if(current?.active){
   if(current.session===p.session&&current.operation===p.requestId)return {session:p.session,userId:p.userId,cursor:db.prepare('SELECT coalesce(max(id),0) id FROM fenys_events').get().id};
   throw Error('Este personagem já possui uma sessão ativa.');
  }
  validateSnapshot(p.snapshot,p);
  if(current&&p.snapshot.revision<current.revision)throw Error('Progresso antigo recusado. Recupere a última sessão.');
  if(!current&&db.prepare('SELECT userId FROM users WHERE userId=?').get(p.userId))throw Error('Conta local existente: vincule primeiro no servidor original.');
  // Only returning HOME needs no fresh invitation. Guests always need host consent.
  if(!current?.home){
   if(typeof p.secret!=='string'||! /^[a-f0-9]{40}$/.test(p.secret))throw Error('Código de conexão inválido.');
   const invite=db.prepare('SELECT * FROM fenys_invites WHERE secretHash=? AND used=0 AND expiresAt>?').get(hash(p.secret),now());
   if(!invite)throw Error('Convite inválido, expirado ou já utilizado.');
   db.prepare('UPDATE fenys_invites SET used=1 WHERE secretHash=?').run(hash(p.secret));
  }
  apply(p.snapshot,p,current?.localAdmin||0);
  db.prepare(`INSERT INTO fenys_passports VALUES(?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(userId) DO UPDATE SET revision=excluded.revision,active=1,session=excluded.session,operation=excluded.operation,snapshot=NULL,lastSeen=excluded.lastSeen`)
   .run(p.userId,p.publicKey,p.snapshot.revision,1,p.session,p.requestId,null,0,null,0,now());
  db.prepare('INSERT INTO userapikeys VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET keyHash=excluded.keyHash').run(p.userId,hash(p.gameKey));
  db.prepare('DELETE FROM userapikeystoregister WHERE userId=?').run(p.userId);
  epoch(p.userId);event(p.snapshot.tables.users[0].name,'joined');
  return {session:p.session,userId:p.userId,cursor:db.prepare('SELECT coalesce(max(id),0) id FROM fenys_events').get().id};
 }
 function leave(p){
  const row=passport(p);
  if(!row.active){
   if(row.operation===p.requestId)return {snapshot:JSON.parse(row.snapshot)};
   throw Error('Sessão encerrada. Recupere a transferência pendente.');
  }
  if(row.session!==p.session)throw Error('Sessão não reconhecida.');
  if(online().some(x=>x.UserId===p.userId))throw Error('Feche o jogo e aguarde o heartbeat expirar antes de sincronizar o progresso (até 90 segundos).');
  const snapshot=capture(p.userId,p.publicKey,row.revision+1);
  db.prepare('UPDATE fenys_passports SET revision=?,active=0,session=NULL,operation=?,snapshot=?,lastSeen=0 WHERE userId=?')
   .run(snapshot.revision,p.requestId,JSON.stringify(snapshot),p.userId);
  if(row.home)db.prepare('UPDATE userapikeys SET keyHash=? WHERE userId=?').run(row.baseKeyHash,p.userId);
  else db.prepare('DELETE FROM userapikeys WHERE userId=?').run(p.userId);
  epoch(p.userId);event(snapshot.tables.users[0].name,'left');return {snapshot};
 }
 function invite(key,address){
  const me=account(key);if(!me?.isAdmin)throw Error('Somente o administrador pode gerar código de conexão.');
  const host=String(address).split(':')[0];
  const addresses=Object.values(os.networkInterfaces()).flat().filter(Boolean).map(x=>x.address);
  if(!addresses.includes(host))throw Error('O endereço compartilhado deve ser o IP Tailscale deste computador.');
  const secret=crypto.randomBytes(20).toString('hex'),expiresAt=now()+15*60000;
  const code=encodeCode(address,secret,expiresAt);
  db.prepare('DELETE FROM fenys_invites WHERE expiresAt<?').run(now());
  db.prepare('INSERT INTO fenys_invites VALUES(?,?,0)').run(hash(secret),expiresAt);
  return {code,expiresAt};
 }
 function pulse(p){
  const row=passport(p);if(!row.active||row.session!==p.session)throw Error('Sessão de conexão encerrada.');
  db.prepare('UPDATE fenys_passports SET lastSeen=? WHERE userId=?').run(now(),p.userId);
  return events(p.cursor);
 }
 function events(cursor){
  const latest=db.prepare('SELECT coalesce(max(id),0) id FROM fenys_events').get().id;
  if(cursor===null)cursor=latest;
  if(!Number.isSafeInteger(cursor)||cursor<0)cursor=0;
  return {cursor:latest,events:db.prepare('SELECT * FROM fenys_events WHERE id>? ORDER BY id LIMIT 100').all(cursor),
   players:db.prepare('SELECT u.name,p.lastSeen FROM fenys_passports p JOIN users u ON u.userId=p.userId WHERE p.active=1 AND p.lastSeen>?').all(now()-45000)};
 }
 function blocked(req){
  const dormant=db.prepare('SELECT userId FROM fenys_passports WHERE active=0').all().map(x=>x.userId);
  if(!dormant.length)return false;
  const me=account(req.headers['x-undaunted-user-api-key']);
  // A host can administer the original realm while their character is visiting a friend.
  if(me?.isAdmin&&/^\/undaunted\/api\/(?:GetUserInfo|ServerStatus|DashboardAccounts|CreateInvite|RegistrationStatus)\/?(?:\?|$)/i.test(req.url))return false;
  let text=req.url+' '+JSON.stringify(req.body||{});
  const auth=req.headers.authorization;
  if(typeof auth==='string'&&auth.length<8192){try{text+=' '+Buffer.from(auth.split('.')[1]||'','base64url').toString();}catch{}}
  if(me)text+=' '+me.userId;
  for(const id of dormant){
   if(text.includes(id))return true;
   const chars=db.prepare('SELECT characterId FROM characters WHERE userId=?').all(id);
   if(chars.some(c=>text.includes(c.characterId)))return true;
  }
  return false;
 }
 // All non-Fenys HTTP requests are counted before their async controllers. Transfers
 // refuse new requests and wait for existing saves to finish, then transact synchronously.
 let inFlight=0,transferring=false;
 const limits=new Map();
 async function middleware(req,res,next){
  if(!req.url.startsWith('/fenys/v1/')){
   if(transferring){res.status(503).json({error:'progress_transfer'});return;}
   if(blocked(req)){res.status(409).json({error:'character_on_another_server'});return;}
   inFlight++;let counted=true;const done=()=>{if(counted){counted=false;inFlight--;}};
   const end=res.end;res.end=function(...args){const result=end.apply(this,args);done();return result;};
   res.once('finish',done);res.once('close',()=>{if(res.writableEnded)done();});next();return;
  }
  try{
   if(req.headers.forwarded||req.headers['x-forwarded-for']||req.headers['x-forwarded-host'])throw Error('Conecte diretamente pelo Tailscale.');
   const ip=req.socket.remoteAddress||'';
   const normalized=ip.replace(/^::ffff:/,'');const octets=normalized.split('.').map(Number);
   if(!normalized.startsWith('127.')&&normalized!=='::1'&&!(octets.length===4&&octets[0]===100&&octets[1]>=64&&octets[1]<=127))throw Error('Esta API exige conexão privada pelo Tailscale.');
   const at=now(),rate=limits.get(ip)||{at,count:0};
   if(at-rate.at>60000){rate.at=at;rate.count=0;}rate.count++;limits.set(ip,rate);
   if(limits.size>2048)for(const [k,v] of limits)if(at-v.at>60000)limits.delete(k);
   if(rate.count>120){res.status(429).json({error:'Aguarde antes de tentar novamente.'});return;}
   const route=req.url.slice('/fenys/v1/'.length);
   if(route==='status'&&req.method==='GET'){res.json({version:VERSION,realm,schema});return;}
   if(req.method!=='POST'){res.status(404).end();return;}
   if(route==='invite'){
    if(!/^(?:::ffff:)?127\./.test(ip)&&ip!=='::1')throw Error('Gere o código no computador hospedeiro.');
    res.json(invite(req.headers['x-undaunted-user-api-key'],req.body?.address));return;
   }
   if(route==='events'){
    if(!account(req.headers['x-undaunted-user-api-key'])?.isAdmin)throw Error('Acesso negado.');
    res.json(events(req.body?.cursor));return;
   }
   if(!['checkout','join','leave','pulse','inspect'].includes(route)){res.status(404).end();return;}
   const p=verify(req.body,route);
   if(route==='inspect'){
    const row=db.prepare('SELECT * FROM fenys_passports WHERE userId=?').get(p.userId);
    if(row&&row.publicKey!==p.publicKey)throw Error('Conflito de identidade.');
    res.json({active:!!row?.active,session:row?.session||null,operation:row?.operation||null,revision:row?.revision||0});return;
   }
   if(route==='pulse'){res.json(pulse(p));return;}
   if(transferring)throw Error('Outra transferência está em andamento. Tente novamente.');
   transferring=true;
   try{
    const deadline=Date.now()+10000;
    while(inFlight){if(Date.now()>deadline)throw Error('Há gravações em andamento. Tente novamente.');await new Promise(r=>setTimeout(r,10));}
    const result=db.transaction(()=>route==='checkout'?checkout(p,req.headers['x-undaunted-user-api-key']):route==='join'?join(p):leave(p)).immediate();
    revoke(p.userId);res.json(result);
   }finally{transferring=false;}
  }catch(error){res.status(409).json({error:error.message||'Transferência não concluída.'});}
 }
 return {middleware,checkout:(p,key)=>db.transaction(()=>checkout(p,key)).immediate(),join:p=>db.transaction(()=>join(p)).immediate(),
  leave:p=>db.transaction(()=>leave(p)).immediate(),capture,blocked,pulse,events,schema,realm};
}
module.exports={createHost,TABLES};
