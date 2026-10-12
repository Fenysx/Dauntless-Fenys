const handlePlayers=(()=>{
const MAX=24*1024*1024;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const operations=new Set(['profile','host-register','host-invite','link','join','save','renew','release']);
async function handlePlayers(req: Request){
 if(req.method==='GET')return reply({service:'launcher-players',version:3});
 if(req.method!=='POST')return reply({error:'method_denied'},405);
 try{
  const reader=req.body?.getReader();if(!reader)return reply({error:'body_required'},400);let size=0;const chunks:Uint8Array[]=[];
  for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>MAX){await reader.cancel();return reply({error:'too_large'},413);}chunks.push(p.value);}
  const raw=new Uint8Array(size);let at=0;for(const c of chunks){raw.set(c,at);at+=c.length;}
  const body=JSON.parse(new TextDecoder().decode(raw)),operation=body.operation;if(!operations.has(operation))return reply({error:'operation_invalid'},400);
  const api=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!api||!service)return reply({error:'service_unavailable'},503);
  let userId:string|undefined;
  if(['profile','link','join'].includes(operation)){
   const bearer=req.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return reply({error:'Entre com Google para acessar seu personagem.'},401);
   const r=await fetch(api+'/auth/v1/user',{headers:{apikey:service,authorization:bearer}});if(!r.ok)return reply({error:'Sua sessão expirou. Entre novamente com Google.'},401);
   const user=await r.json();if(!uuid(user.id)||!user.identities?.some((i:{provider:string})=>i.provider==='google'))return reply({error:'Use uma conta autenticada pelo Google.'},401);userId=user.id;
  }
  const args:Record<string,unknown>={...(userId?{authId:userId}:{})};let p:Record<string,any>={};
  if(operation!=='profile'){
   const e=body.envelope;if(typeof e?.message!=='string'||typeof e.publicKey!=='string'||e.publicKey.length!==60||typeof e.signature!=='string'||e.signature.length!==88)return reply({error:'host_signature_required'},401);
   const k=await crypto.subtle.importKey('spki',decode(e.publicKey),{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',k,decode(e.signature),new TextEncoder().encode(e.message)))return reply({error:'host_signature_denied'},401);
   p=JSON.parse(e.message);if(p.version!==2||p.operation!==operation||!uuid(p.requestId)||!Number.isSafeInteger(p.time)||Math.abs(Date.now()-p.time)>300000)return reply({error:'request_invalid'},401);args.hostKey=e.publicKey;
  }
  let invitationSecret:string|undefined;
  if(operation==='host-register'){
   if(!uuid(p.realm)||typeof p.address!=='string'||!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}:61000$/.test(p.address))return reply({error:'Use o endereço Tailscale do servidor.'},400);
   Object.assign(args,{realm:p.realm,address:p.address});if(p.secret){if(!/^[a-f0-9]{48}$/.test(p.secret))return reply({error:'host_authorization_required'},401);args.secretHash=await sha(p.secret);}
  }
  if(operation==='host-invite'){const b=crypto.getRandomValues(new Uint8Array(24));invitationSecret=hex(b.buffer);args.secretHash=await sha(invitationSecret);}
  if(operation==='join'){if(!uuid(p.session))return reply({error:'session_invalid'},400);if(p.name!==undefined&&!/^[A-Za-z0-9_]{3,16}$/.test(p.name))return reply({error:'Escolha um nome de jogador com 3–16 letras, números ou underscore.'},400);Object.assign(args,{session:p.session,name:p.name||'User_'+crypto.randomUUID().slice(0,8)});}
  if(['save','link'].includes(operation)){
   if(typeof p.userId!=='string'||!/^UID-[a-f0-9-]{36}$/i.test(p.userId)||!uuid(p.commitId)||!p.snapshot||p.snapshot.userId!==p.userId||p.snapshot.tables?.users?.length!==1||p.snapshot.tables.users[0].userId!==p.userId||p.snapshot.tables.users[0].isAdmin!==0)return reply({error:'snapshot_invalid'},400);
   if(new TextEncoder().encode(JSON.stringify(p.snapshot)).length>16777216)return reply({error:'snapshot_too_large'},413);
   Object.assign(args,{userId:p.userId,snapshot:p.snapshot,commitId:p.commitId});
  }
  if(operation==='link'){if(typeof p.nativeKey!=='string'||!/^UUK_[a-f0-9]{48}$/.test(p.nativeKey))return reply({error:'account_proof_required'},401);Object.assign(args,{nativeKey:p.nativeKey,name:String(p.snapshot.tables.users[0].name).slice(0,64)});}
  if(['save','renew','release'].includes(operation)){if(typeof p.userId!=='string'||!/^UID-[a-f0-9-]{36}$/i.test(p.userId)||!uuid(p.session))return reply({error:'session_invalid'},400);Object.assign(args,{userId:p.userId,session:p.session});}
  if(operation==='save'){if(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0)return reply({error:'revision_invalid'},400);args.expectedRevision=p.expectedRevision;}
  const r=await fetch(api+'/rest/v1/rpc/launcher_google_api',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},body:JSON.stringify({operation,args})});
  if(!r.ok){const e=await r.json();const codes:Record<string,string>={host_authorization_required:'O servidor ainda não foi autorizado na nuvem.',google_already_linked:'Esta conta Google já está vinculada a outro personagem.',character_already_linked:'O personagem já está vinculado a outra conta Google.',character_busy:'O personagem está ativo em outro servidor. Feche o jogo e confirme a saída antes de trocar.',character_unknown:'Personagem não encontrado na nuvem.',session_expired:'A sessão de progresso expirou. Reconecte antes de jogar.',stale_progress:'Há progresso mais recente na nuvem. Os dados locais foram preservados.',identity_mismatch:'Identidade do personagem incompatível.'};const code=Object.keys(codes).find(k=>String(e.message).includes(k));return reply({error:code?codes[code]:'A nuvem não confirmou a operação.'},409);}
  const result=await r.json();return reply(invitationSecret?{...result,secret:invitationSecret}:result);
 }catch{return reply({error:'request_denied'},400);}
}

return handlePlayers;
})();
// Only signed machines can access the encrypted game database. No user login required.
const MAX=24*1024*1024;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const operations=new Set(['enroll','state','lease','save','download','release']);
Deno.serve(async req=>{
 if(new URL(req.url).pathname.endsWith('/players'))return handlePlayers(req);
 if(req.method==='GET')return reply({service:'fenys-global',version:1});
 if(req.method!=='POST')return reply({error:'method_denied'},405);
 try{
  if(Number(req.headers.get('content-length'))>MAX)return reply({error:'too_large'},413);
  const reader=req.body?.getReader();if(!reader)return reply({error:'body_required'},400);
  let length=0;const parts:Uint8Array[]=[];
  for(;;){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>MAX){await reader.cancel();return reply({error:'too_large'},413);}parts.push(p.value);}
  const raw=new Uint8Array(length);let cursor=0;for(const p of parts){raw.set(p,cursor);cursor+=p.length;}
  const e=JSON.parse(new TextDecoder().decode(raw));
  if(typeof e.message!=='string'||typeof e.publicKey!=='string'||e.publicKey.length!==60||typeof e.signature!=='string'||e.signature.length!==88)return reply({error:'signature_required'},401);
  const key=await crypto.subtle.importKey('spki',decode(e.publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,decode(e.signature),new TextEncoder().encode(e.message)))return reply({error:'signature_denied'},401);
  const p=JSON.parse(e.message);
  if(p.version!==1||!operations.has(p.operation)||!uuid(p.realm)||!uuid(p.requestId)||!Number.isSafeInteger(p.time)||Math.abs(Date.now()-p.time)>300000)return reply({error:'request_invalid'},401);
  const args:Record<string,unknown>={realm:p.realm,publicKey:e.publicKey};
  if(p.operation==='enroll'){
   if(typeof p.secret!=='string'||!/^[a-f0-9]{48}$/.test(p.secret))return reply({error:'activation_required'},401);
   args.secretHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.secret)));
  }
  if(['lease','save','release'].includes(p.operation)){
   if(typeof p.holder!=='string'||!/^[a-f0-9]{64}$/.test(p.holder))return reply({error:'holder_invalid'},400);
   args.holder=p.holder;
  }
  if(p.operation==='save'){
   if(!uuid(p.commitId)||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||typeof p.ciphertext!=='string'||typeof p.digest!=='string'||!/^[a-f0-9]{64}$/.test(p.digest))return reply({error:'snapshot_invalid'},400);
   const cipher=decode(p.ciphertext);if(cipher.length>16777216||cipher.length<32)return reply({error:'snapshot_size'},413);
   if(hex(await crypto.subtle.digest('SHA-256',cipher))!==p.digest)return reply({error:'snapshot_digest'},400);
   Object.assign(args,{expectedRevision:p.expectedRevision,commitId:p.commitId,ciphertext:p.ciphertext,digest:p.digest});
  }
  const api=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!api||!secret)return reply({error:'service_unavailable'},503);
  const result=await fetch(api+'/rest/v1/rpc/fenys_global_api',{method:'POST',headers:{apikey:secret,authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({operation:p.operation,args})});
  if(!result.ok){const error=await result.json();const allowed=['activation_denied','activation_used','realm_exists','owner_denied','authority_already_running','lease_expired','stale_snapshot'];const code=allowed.find(s=>String(error.message).includes(s));return reply({error:code||'storage_denied'},409);}
  return reply(await result.json());
 }catch{return reply({error:'request_denied'},400);}
});
