// Dauntless Launcher Ultimate • community directory, invitations and admission
// This function is intentionally independent from fenys-global/players (game saves).
// Deploy with verify_jwt=false: Google tokens are verified below against auth/v1/user.
const MAX_BODY=8192;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const USERNAME=/^[a-z0-9_]{3,20}$/;
const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const modes=new Set(['open','invite','vip']);
const tiers=new Set(['member','vip']);
const now=()=>new Date().toISOString();
const api=Deno.env.get('SUPABASE_URL')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
function invalid(message:string,status=400):never{throw {message,status};}
function normEmail(v:unknown){return typeof v==='string'&&v.length<=254&&EMAIL.test(v.toLowerCase().trim())?v.toLowerCase().trim():'';}
function limited(v:unknown,max:number){return typeof v==='string'?v.trim().slice(0,max):'';}
async function db(table:string,params:Record<string,string>={},method='GET',data?:unknown,extra:Record<string,string>={}):Promise<any>{
 const url=api+'/rest/v1/'+table+'?'+new URLSearchParams(params).toString();
 const response=await fetch(url,{method,headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json',prefer:method==='GET'?'return=representation':'return=representation',...extra},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
 const text=await response.text();if(!response.ok)invalid(response.status===409?'Nome ou registro já está em uso.':'Banco da comunidade indisponível.',response.status===409?409:503);
 return text?JSON.parse(text):[];
}
async function google(req:Request){
 const bearer=req.headers.get('authorization');
 if(!bearer?.startsWith('Bearer '))invalid('Entre com Google para acessar os servidores.',401);
 const response=await fetch(api+'/auth/v1/user',{headers:{apikey:service,authorization:bearer},signal:AbortSignal.timeout(15000)});
 if(!response.ok)invalid('Sua sessão Google expirou. Entre novamente.',401);
 const user=await response.json();
 if(!uuid(user.id)||!user.identities?.some((i:{provider:string})=>i.provider==='google')||!normEmail(user.email))invalid('É necessário usar uma conta Google com e-mail verificado.',401);
 return {id:user.id as string,email:normEmail(user.email)};
}
async function signedHost(envelope:any,authId:string){
 if(typeof envelope?.message!=='string'||envelope.message.length>4096||typeof envelope?.publicKey!=='string'||envelope.publicKey.length!==60||typeof envelope.signature!=='string'||envelope.signature.length!==88)invalid('Identidade do host inválida.',401);
 try{
  const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('spki',decode(envelope.publicKey),{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,decode(envelope.signature),new TextEncoder().encode(envelope.message)))invalid('Assinatura do host recusada.',401);
  const p=JSON.parse(envelope.message);
  if(p.version!==2||p.operation!=='community-register'||!uuid(p.requestId)||!Number.isSafeInteger(p.time)||Math.abs(Date.now()-p.time)>120000||p.authId!==authId)invalid('Autorização de publicação inválida ou expirada.',401);
  return {...p,hostKey:envelope.publicKey};
 }catch(e){if((e as any)?.status)throw e;invalid('Não foi possível verificar a assinatura do host.',401);}
}
async function getServer(id:unknown){
 if(!uuid(id))invalid('Servidor inválido.');
 const rows=await db('dlu_community_servers',{id:'eq.'+id,select:'*',limit:'1'});
 if(!rows.length)invalid('Servidor não encontrado.',404);
 return rows[0];
}
async function ownerServer(id:unknown,owner:string){
 const server=await getServer(id);
 if(server.owner_auth_id!==owner)invalid('Somente o dono deste servidor pode alterar permissões.',403);
 return server;
}
async function membership(serverId:string,authId:string){
 const rows=await db('dlu_community_memberships',{server_id:'eq.'+serverId,auth_id:'eq.'+authId,select:'tier,expires_at,revoked_at',limit:'1'});
 return rows[0]||null;
}
async function permitted(server:any,userId:string){
 if(!server.enabled)return {allowed:false,reason:'Servidor temporariamente indisponível.'};
 if(server.owner_auth_id===userId)return {allowed:true,reason:'Administrador'};
 const member=await membership(server.id,userId);
 const active=member&&!member.revoked_at&&(!member.expires_at||Date.parse(member.expires_at)>Date.now());
 const allowed=server.policy==='open'||(active&&(server.policy!=='vip'||member.tier==='vip'));
 return {allowed:!!allowed,reason:allowed?'Acesso autorizado':server.policy==='vip'?'Este servidor exige autorização VIP ativa.':'É necessário aceitar um convite do servidor.'};
}
async function invitesFor(user:{id:string,email:string}){
 const rows=await db('dlu_community_invitations',{
  or:'(recipient_auth_id.eq.'+user.id+',recipient_email.eq.'+user.email+')',
  status:'eq.pending',expires_at:'gt.'+now(),
  select:'id,server_id,tier,expires_at,created_at',order:'created_at.desc',limit:'50'});
 if(!rows.length)return [];
 const servers=await db('dlu_community_servers',{id:'in.('+rows.map((r:any)=>r.server_id).join(',')+')',select:'id,name'});
 return rows.map((r:any)=>({...r,serverName:servers.find((s:any)=>s.id===r.server_id)?.name||'Servidor'}));
}
async function handle(req:Request){
 if(req.method==='GET')return json({service:'dlu-community',version:1});
 if(req.method!=='POST')return json({error:'method_denied'},405);
 if(!api||!service)return json({error:'Serviço indisponível.'},503);
 try{
  const raw=await req.text();if(raw.length>MAX_BODY)invalid('Requisição muito grande.',413);
  const b=JSON.parse(raw||'{}'),op=b.operation;
  if(typeof op!=='string')invalid('Operação inválida.');
  const user=await google(req);
  if(op==='username'){
   const username=limited(b.username,24).toLowerCase();
   if(!USERNAME.test(username))invalid('O nome de usuário deve ter entre 3 e 20 letras, números ou _.');
   await db('dlu_community_usernames',{on_conflict:'auth_id'},'POST',{auth_id:user.id,username,updated_at:now()},{prefer:'resolution=merge-duplicates,return=representation'});
   return json({username});
  }
  if(op==='list'){
   const all=await db('dlu_community_servers',{enabled:'eq.true',select:'id,host_key,owner_auth_id,name,description,address,policy,enabled',order:'name.asc',limit:'100'});
   const mine=await db('dlu_community_memberships',{auth_id:'eq.'+user.id,revoked_at:'is.null',select:'server_id,expires_at',limit:'200'});
   const inbox=await invitesFor(user);
   const accessible=new Set(mine.filter((m:any)=>!m.expires_at||Date.parse(m.expires_at)>Date.now()).map((m:any)=>m.server_id));
   for(const i of inbox)accessible.add(i.server_id);
   return json({servers:all.filter((s:any)=>s.policy!=='invite'||s.owner_auth_id===user.id||accessible.has(s.id)).map((s:any)=>({id:s.id,name:s.name,description:s.description,address:s.address,hostKey:s.host_key,policy:s.policy,owned:s.owner_auth_id===user.id,hasAccess:s.policy==='open'||s.owner_auth_id===user.id||accessible.has(s.id)}))});
  }
  if(op==='inbox')return json({invitations:await invitesFor(user)});
  if(op==='access'){
   const rows=uuid(b.serverId)?await db('dlu_community_servers',{id:'eq.'+b.serverId,select:'*',limit:'1'}):
    typeof b.hostKey==='string'&&b.hostKey.length===60?await db('dlu_community_servers',{host_key:'eq.'+b.hostKey,select:'*',limit:'1'}):[];
   if(!rows.length)return json({managed:false,allowed:false});
   const server=rows[0];const access=await permitted(server,user.id);
   return json({managed:true,serverId:server.id,hostKey:server.host_key,address:server.address,...access});
  }
  if(op==='register'){
   const p=await signedHost(b.envelope,user.id);
   const name=limited(p.name,70),description=limited(p.description,280),policy=p.policy;
   if(name.length<3||!modes.has(policy)||typeof p.address!=='string'||!p.address.startsWith('https://'))invalid('Informe nome, acesso e endpoint HTTPS do servidor.');
   const registered=await db('rpc/dlu_community_host_lookup',{},'POST',{host_public_key:p.hostKey});
   if(!registered[0]?.host_active||registered[0].host_address!==p.address)invalid('Ative este host Google e seu endereço HTTPS antes de publicá-lo.',403);
   const previous=await db('dlu_community_servers',{host_key:'eq.'+p.hostKey,select:'owner_auth_id,id',limit:'1'});
   if(previous[0]&&previous[0].owner_auth_id!==user.id)invalid('Este servidor já pertence a outra conta Google.',403);
   const saved=await db('dlu_community_servers',{on_conflict:'host_key'},'POST',{
    host_key:p.hostKey,owner_auth_id:user.id,name,description,address:p.address,policy,enabled:true,updated_at:now()
   },{prefer:'resolution=merge-duplicates,return=representation'});
   return json({serverId:saved[0].id,name:saved[0].name,policy:saved[0].policy});
  }
  if(op==='invite'){
   const server=await ownerServer(b.serverId,user.id);
   const target=limited(b.target,254).toLowerCase(),tier=tiers.has(b.tier)?b.tier:'member',duration=b.durationDays;
   if(!target)invalid('Informe o e-mail Google ou nome de usuário.');
   let recipient='',recipient_email:null|string=null,recipient_auth_id:null|string=null;
   if(target.includes('@')){
    recipient_email=normEmail(target);if(!recipient_email)invalid('E-mail inválido.');
    recipient='email:'+recipient_email;
   }else{
    if(!USERNAME.test(target))invalid('Nome de usuário inválido.');
    const profile=await db('dlu_community_usernames',{username:'eq.'+target,select:'auth_id',limit:'1'});
    if(!profile.length)invalid('Usuário ainda não cadastrado no launcher. Convide pelo e-mail Google.');
    recipient_auth_id=profile[0].auth_id;recipient='user:'+recipient_auth_id;
   }
   if(recipient_auth_id===user.id||recipient_email===user.email)invalid('Não é necessário convidar o dono.');
   const days=tier==='vip'&&[30,90,365].includes(duration)?duration:30;
   const pending=await db('dlu_community_invitations',{server_id:'eq.'+server.id,status:'eq.pending',select:'id',limit:'101'});
   if(pending.length>=100)invalid('Limite de convites pendentes atingido. Revise os convites antigos.',429);
   await db('dlu_community_invitations',{on_conflict:'server_id,recipient'},'POST',{
    server_id:server.id,recipient,recipient_email,recipient_auth_id,tier,duration_days:tier==='vip'?days:null,
    status:'pending',expires_at:new Date(Date.now()+14*86400000).toISOString()
   },{prefer:'resolution=merge-duplicates,return=representation'});
   return json({sent:true,recipient:target,tier});
  }
  if(op==='decide'){
   if(!uuid(b.inviteId)||!['accept','decline'].includes(b.decision))invalid('Convite inválido.');
   const rows=await db('dlu_community_invitations',{id:'eq.'+b.inviteId,select:'*',limit:'1'});
   const invite=rows[0];
   if(!invite||invite.status!=='pending'||Date.parse(invite.expires_at)<=Date.now()||(invite.recipient_auth_id!==user.id&&invite.recipient_email!==user.email))invalid('Este convite não está disponível para sua conta Google.',403);
   const rowsChanged=await db('dlu_community_invitations',{id:'eq.'+invite.id,status:'eq.pending'},'PATCH',{status:b.decision==='accept'?'accepted':'declined'},{prefer:'return=representation'});
   if(!rowsChanged.length)invalid('O convite já foi respondido.',409);
   if(b.decision==='accept'){
    const validUntil=invite.tier==='vip'?new Date(Date.now()+(invite.duration_days||30)*86400000).toISOString():null;
    await db('dlu_community_memberships',{on_conflict:'server_id,auth_id'},'POST',{
     server_id:invite.server_id,auth_id:user.id,tier:invite.tier,granted_by:user.id,expires_at:validUntil,revoked_at:null
    },{prefer:'resolution=merge-duplicates,return=representation'});
   }
   return json({accepted:b.decision==='accept',serverId:invite.server_id});
  }
  if(op==='revoke'){
   await ownerServer(b.serverId,user.id);
   const username=limited(b.username,20).toLowerCase();
   if(!USERNAME.test(username))invalid('Informe o nome de usuário a revogar.');
   const people=await db('dlu_community_usernames',{username:'eq.'+username,select:'auth_id',limit:'1'});
   if(!people.length)invalid('Usuário não encontrado.',404);
   await db('dlu_community_memberships',{server_id:'eq.'+b.serverId,auth_id:'eq.'+people[0].auth_id},'PATCH',{revoked_at:now()});
   return json({revoked:true});
  }
  invalid('Operação inválida.');
 }catch(e){const status=typeof (e as any)?.status==='number'?(e as any).status:400;return json({error:typeof (e as any)?.message==='string'?(e as any).message:'Não foi possível processar a solicitação.'},status);}
}
Deno.serve(handle);
