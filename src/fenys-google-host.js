'use strict';
// Each game host runs its native Metagame. Google owns the canonical player snapshot in Supabase.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createHost}=require('./fenys-roaming-host');
const {cloud,signed,encodeInvite}=require('./fenys-google-cloud');
const {lanRequest}=require('./fenys-network');
const {privateRequest,localRequest,hash}=require('./fenys-cloud-protocol');
function createGoogleHost(db,{config,invoke=cloud,online=()=>[],revoke=()=>{},validateToken=()=>null,now=Date.now,autoStart=true}={}){
 const progress=createHost(db,{online,revoke,force:true});
 db.exec(`CREATE TABLE IF NOT EXISTS launcher_google_sessions(userId TEXT PRIMARY KEY,authId TEXT NOT NULL,session TEXT NOT NULL,revision INTEGER NOT NULL,leaseUntil INTEGER NOT NULL,active INTEGER NOT NULL,dirty INTEGER NOT NULL,changes INTEGER NOT NULL,pending TEXT,error TEXT); CREATE TABLE IF NOT EXISTS launcher_google_invites(secretHash TEXT PRIMARY KEY,expiresAt INTEGER NOT NULL,usedBy TEXT);`);
 let queue=Promise.resolve(),transferring=false,inFlight=0,registered=false,timer=null;
 const call=(operation,fields={},token)=>invoke(operation,{envelope:signed(config,operation,fields)},token);
 const account=key=>typeof key==='string'?db.prepare('SELECT u.* FROM users u JOIN userapikeys k ON u.userId=k.userId WHERE k.keyHash=?').get(hash(key)):null;
 const rows=()=>db.prepare('SELECT * FROM launcher_google_sessions WHERE active=1').all();
 const enqueue=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 async function register(){await call('host-register',{realm:config.realm,address:config.address,secret:config.secret});registered=true;}
 async function save(row){
  let pending=row.pending?JSON.parse(row.pending):null;
  const renewed=await call('renew',{userId:row.userId,session:row.session});
  if(renewed.revision!==row.revision&&(!pending||renewed.commitId!==pending.commitId))throw Error('Existe outra revisão na nuvem. Os dados locais foram preservados.');
  if(!pending&&row.dirty){const snapshot=progress.capture(row.userId,config.publicKey,row.revision+1);pending={userId:row.userId,session:row.session,expectedRevision:row.revision,commitId:crypto.randomUUID(),snapshot,changes:row.changes};db.prepare('UPDATE launcher_google_sessions SET pending=? WHERE userId=?').run(JSON.stringify(pending),row.userId);}
  if(pending){const r=await call('save',pending);if(r.commitId!==pending.commitId||r.revision!==pending.expectedRevision+1)throw Error('A nuvem não confirmou a revisão do personagem.');db.prepare('UPDATE launcher_google_sessions SET revision=?,pending=NULL,dirty=CASE WHEN changes=? THEN 0 ELSE 1 END WHERE userId=?').run(r.revision,pending.changes,row.userId);}
  const lease=await call('renew',{userId:row.userId,session:row.session});const current=db.prepare('SELECT revision FROM launcher_google_sessions WHERE userId=?').get(row.userId);
  if(lease.revision!==current.revision)throw Error('Existe outra revisão na nuvem. Os dados locais foram preservados.');
  db.prepare('UPDATE launcher_google_sessions SET leaseUntil=?,error=NULL WHERE userId=?').run(Date.parse(lease.leaseUntil),row.userId);
 }
 function flush(){return enqueue(async()=>{if(!registered)await register();let failure;for(const row of rows())try{await save(row);}catch(e){db.prepare('UPDATE launcher_google_sessions SET leaseUntil=0,error=? WHERE userId=?').run(String(e.message).slice(0,220),row.userId);failure??=e;}if(failure)throw failure;return {confirmed:true};});}
 function mark(){db.prepare('UPDATE launcher_google_sessions SET dirty=1,changes=changes+1 WHERE active=1').run();}
 function identities(req){const ids=new Set(),me=account(req.headers['x-undaunted-user-api-key']);if(me)ids.add(me.userId);const bearer=req.headers.authorization;try{if(typeof bearer==='string'&&/^Bearer /i.test(bearer)){const token=validateToken(bearer.slice(7));if(token?.userId)ids.add(token.userId);}}catch{}
  for(const [k,v] of Object.entries(req.body||{}))if(/^(password|auth_password|exchange_code|key|uuk)$/i.test(k)&&typeof v==='string'){const user=account(v);if(user)ids.add(user.userId);}
  const text=req.url+' '+JSON.stringify(req.body||{});for(const row of db.prepare('SELECT userId FROM launcher_google_sessions').all())if(text.includes(row.userId))ids.add(row.userId);
  const matches=text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi)||[];for(const id of matches){const c=db.prepare('SELECT userId FROM characters WHERE characterId=?').get(id);if(c)ids.add(c.userId);}return [...ids];
 }
 async function transfer(fn){if(transferring)throw Error('Aguarde a sincronização em andamento.');transferring=true;try{const deadline=now()+15000;while(inFlight){if(now()>deadline)throw Error('Há saves em andamento. Aguarde antes de trocar de servidor.');await new Promise(r=>setTimeout(r,10));}await queue;return await fn();}finally{transferring=false;}}
 async function middleware(req,res,next){
  const prefix='/launcher/google/';
  if(!req.url.startsWith(prefix)){
   const admin=account(req.headers['x-undaunted-user-api-key']);const administrative=admin?.isAdmin&&/^\/undaunted\/api\/(GetUserInfo|ServerStatus|RegistrationStatus|DashboardAccounts|CreateInvite)(?:\?|$)/.test(req.url);
   if(!administrative){if(transferring){res.status(503).json({error:'Aguarde a confirmação do progresso.'});return;}for(const id of identities(req)){const s=db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(id);if(s&&(!s.active||s.leaseUntil<=now())){res.status(409).json({error:'Reconecte com Google. O personagem está em outro servidor ou aguardando a nuvem.'});return;}}}
   const before=db.prepare('SELECT total_changes() n').get().n;inFlight++;let ended=false;const original=res.end;res.end=function(...args){if(ended)return this;ended=true;const changed=db.prepare('SELECT total_changes() n').get().n>before;if(changed)mark();const finish=()=>{inFlight--;original.apply(this,args);};if(changed&&this.statusCode<400&&rows().length){void flush().then(finish).catch(()=>{inFlight--;this.end=original;if(!this.headersSent){this.statusCode=503;this.setHeader('content-type','application/json');this.removeHeader?.('content-length');original.call(this,JSON.stringify({error:'O progresso local foi preservado, mas o Supabase ainda não confirmou o save. Aguarde a reconexão.'}));}else this.destroy?.();});}else finish();return this;};next();return;
  }
  try{
   if(!privateRequest(req)&&!(process.env.FENYS_LAN_IP&&lanRequest(req))&&!req.dluPublic)throw Error('Use a conexão configurada pelo dono do servidor.');const route=req.url.slice(prefix.length);
   if(route==='status'&&req.method==='GET'){res.json({version:3,mode:'google',hostKey:config.publicKey,address:config.address,registered,schema:progress.schema});return;}
   if(req.method!=='POST')throw Error('Operação inválida.');
   const bearer=req.headers.authorization;const token=typeof bearer==='string'&&bearer.startsWith('Bearer ')?bearer.slice(7):null;
   if(['invite','host-invite','sync-status','sync-now'].includes(route)){
    if(!localRequest(req)||!account(req.headers['x-undaunted-user-api-key'])?.isAdmin)throw Error('Use a conta administradora local para configurar o servidor.');
    if(route==='sync-status'){res.json({players:rows().map(s=>({userId:s.userId,revision:s.revision,dirty:!!s.dirty,error:s.error,ready:s.leaseUntil>now()}))});return;}
    if(route==='sync-now'){res.json(await flush());return;}
    if(!registered)await register();
    if(route==='host-invite'){const r=await call('host-invite');res.json({code:'DLUH3.'+Buffer.from(JSON.stringify(r)).toString('base64url'),expiresAt:Date.parse(r.expiresAt)});return;}
    const secret=crypto.randomBytes(24).toString('hex'),expiresAt=now()+900000;db.prepare('INSERT INTO launcher_google_invites VALUES(?,?,NULL)').run(hash(secret),expiresAt);res.json({code:encodeInvite(config.address,secret,expiresAt,config.publicKey),expiresAt});return;
   }
   if(!token)throw Error('Entre com Google antes de acessar o personagem.');
   const me=await invoke('profile',{},token);
   if(route==='link'){await transfer(async()=>{const user=account(req.body?.key);if(!user)throw Error('A conta existente não foi reconhecida neste servidor.');if(online().some(x=>x.UserId===user.userId))throw Error('Feche o jogo antes de vincular seu personagem.');const old=db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(user.userId);if(old?.active)throw Error('Encerre a sessão antes de vincular.');const snapshot=progress.capture(user.userId,config.publicKey,1);const r=await call('link',{userId:user.userId,nativeKey:req.body.key,snapshot,commitId:crypto.randomUUID()},token);const linked=await invoke('profile',{},token);if(!linked.linked||linked.userId!==user.userId||!linked.authId)throw Error('A nuvem não confirmou o vínculo do personagem.');db.prepare('INSERT INTO launcher_google_sessions VALUES(?,?,?,?,?,0,0,0,NULL,NULL) ON CONFLICT(userId) DO UPDATE SET authId=excluded.authId').run(user.userId,linked.authId,crypto.randomUUID(),r.revision,0);revoke(user.userId);res.json(r);});return;}
   if(!me.linked&&route!=='join')throw Error('Vincule o personagem existente ou conecte com um convite para criar um novo.');
   if(route==='leave'){await transfer(async()=>{const s=db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(me.userId);if(!s?.active){res.json({released:true});return;}if(online().some(x=>x.UserId===me.userId))throw Error('Feche o jogo e aguarde a confirmação de saída (até 90 segundos).');await flush();await call('release',{userId:me.userId,session:s.session});db.prepare('UPDATE launcher_google_sessions SET active=0,leaseUntil=0 WHERE userId=?').run(me.userId);revoke(me.userId);res.json({released:true});});return;}
   if(route==='join'){await transfer(async()=>{
    if(!registered)await register();if(me.linked&&online().some(x=>x.UserId===me.userId))throw Error('O personagem ainda está em uma partida. Feche o jogo antes de conectar.');
    const secret=String(req.body?.secret||''),invite=db.prepare('SELECT * FROM launcher_google_invites WHERE secretHash=? AND expiresAt>?').get(hash(secret),now());const existing=me.linked&&db.prepare('SELECT * FROM launcher_google_sessions WHERE userId=?').get(me.userId);
    const admitted=existing&&existing.authId===me.authId;
    if(!localRequest(req)&&!admitted&&(!invite||(invite.usedBy&&invite.usedBy!==me.userId)))throw Error('Use um convite válido do dono do servidor.');
    if(existing?.active&&(existing.dirty||existing.pending))await flush();
    const sid=existing?.active?existing.session:crypto.randomUUID();const r=await call('join',{session:sid,name:req.body?.name||undefined},token);
    try{
     const local=db.prepare('SELECT * FROM users WHERE userId=?').get(r.userId);if(local&&existing?.dirty&&(r.revision!==existing.revision||existing.pending))throw Error('Há progresso local pendente. Confirme o envio antes de restaurar o personagem da nuvem.');
     db.transaction(()=>{
      if(r.snapshot){const snapshot={...r.snapshot,publicKey:config.publicKey,revision:Math.max(1,r.revision)};progress.apply(snapshot,{userId:r.userId,publicKey:config.publicKey},r.originHost===config.publicKey&&local?.isAdmin?1:0);}
      else{if(db.prepare('SELECT userId FROM users WHERE lower(name)=lower(?) AND userId<>?').get(r.name,r.userId))throw Error('Nome já usado neste servidor. Vincule seu personagem existente antes de criar outro.');db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,0) ON CONFLICT(userId) DO NOTHING').run(r.userId,r.name);}
      db.prepare('INSERT INTO userapikeys(userId,keyHash) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET keyHash=excluded.keyHash').run(r.userId,hash(r.key));
      if(invite)db.prepare('UPDATE launcher_google_invites SET usedBy=? WHERE secretHash=?').run(r.userId,invite.secretHash);
      db.prepare('INSERT INTO launcher_google_sessions VALUES(?,?,?,?,?,1,1,1,NULL,NULL) ON CONFLICT(userId) DO UPDATE SET authId=excluded.authId,session=excluded.session,revision=excluded.revision,leaseUntil=excluded.leaseUntil,active=1,dirty=1,changes=changes+1,error=NULL').run(r.userId,r.authId,r.session,r.revision,Date.parse(r.leaseUntil));
     }).immediate();revoke(r.userId);await flush();res.json({server:config.address,userId:r.userId,confirmed:true});
    }catch(e){await call('release',{userId:r.userId,session:r.session}).catch(()=>{});db.prepare('UPDATE launcher_google_sessions SET leaseUntil=0 WHERE userId=?').run(r.userId);throw e;}
   });return;}
   throw Error('Operação inválida.');
  }catch(e){res.status(409).json({error:e.message||'A nuvem não confirmou o acesso.'});}
 }
 if(autoStart){void register().then(()=>flush()).catch(()=>{});timer=setInterval(()=>void flush().catch(()=>{}),20000);timer.unref?.();}
 async function close(){if(timer)clearInterval(timer);await flush();for(const s of rows())await call('release',{userId:s.userId,session:s.session});}
 return {middleware,flush,close,progress,register,mark};
}
function start(db,options){if(process.env.FENYS_GOOGLE_MODE!=='1')return {middleware:(_req,_res,next)=>next()};const config=JSON.parse(fs.readFileSync(path.join(process.cwd(),'fenys/google-host.json'),'utf8'));return createGoogleHost(db,{...options,config});}
module.exports={createGoogleHost,start};

