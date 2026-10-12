// Only signed machines can access the encrypted game database. No user login required.
const MAX=24*1024*1024;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const operations=new Set(['enroll','state','lease','save','download','release']);
Deno.serve(async req=>{
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
