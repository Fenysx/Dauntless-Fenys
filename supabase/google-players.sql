-- Google users own private cloud characters. Only the signed-host Edge API accesses these tables.
create table if not exists fenys_global.google_hosts(
 public_key text primary key, realm_id uuid not null references fenys_global.realms(id),
 address text not null, active boolean not null default true
);
create table if not exists fenys_global.google_host_invites(
 secret_hash text primary key, realm_id uuid not null references fenys_global.realms(id),
 expires_at timestamptz not null, used_by text
);
create table if not exists fenys_global.google_players(
 auth_id uuid primary key references auth.users(id), user_id text unique not null,
 native_key text unique not null, name text not null, origin_host text not null references fenys_global.google_hosts(public_key),
 snapshot jsonb, revision bigint not null default 0, commit_id uuid,
 holder text references fenys_global.google_hosts(public_key), session_id uuid, lease_until timestamptz,
 updated_at timestamptz not null default now(),
 check(snapshot is null or octet_length(snapshot::text)<=16777216)
);
create index if not exists google_players_holder_idx on fenys_global.google_players(holder);
alter table fenys_global.google_hosts enable row level security;
alter table fenys_global.google_host_invites enable row level security;
alter table fenys_global.google_players enable row level security;
revoke all on all tables in schema fenys_global from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema fenys_global to service_role;
create function public.launcher_google_api(operation text,args jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 host_key text := args->>'hostKey';
 uid uuid := nullif(args->>'authId','')::uuid;
 p fenys_global.google_players%rowtype;
 h fenys_global.google_hosts%rowtype;
 inv fenys_global.google_host_invites%rowtype;
 r uuid;
 sid uuid;
begin
 if operation='host-register' then
  r := (args->>'realm')::uuid;
  select * into h from fenys_global.google_hosts where public_key=host_key for update;
  if found then
   if h.realm_id<>r or not h.active then raise exception 'host_authorization_required'; end if;
  elsif not exists(select 1 from fenys_global.realms where id=r and owner_key=host_key) then
   select * into inv from fenys_global.google_host_invites where secret_hash=args->>'secretHash' for update;
   if not found or inv.realm_id<>r or inv.expires_at<=now() or (inv.used_by is not null and inv.used_by<>host_key) then raise exception 'host_authorization_required'; end if;
   update fenys_global.google_host_invites set used_by=host_key where secret_hash=inv.secret_hash;
  end if;
  insert into fenys_global.google_hosts(public_key,realm_id,address) values(host_key,r,args->>'address')
   on conflict(public_key) do update set address=excluded.address;
  return jsonb_build_object('registered',true,'realm',r);
 end if;
 if operation='profile' then
  select * into p from fenys_global.google_players where auth_id=uid;
  if not found then return jsonb_build_object('linked',false); end if;
  return jsonb_build_object('linked',true,'authId',p.auth_id,'userId',p.user_id,'name',p.name,'key',p.native_key,'revision',p.revision,'schema',p.snapshot->>'schema','activeHost',(select address from fenys_global.google_hosts where public_key=p.holder),'leaseUntil',p.lease_until);
 end if;
 select * into h from fenys_global.google_hosts where public_key=host_key and active;
 if not found then raise exception 'host_authorization_required'; end if;
 if operation='host-invite' then
  insert into fenys_global.google_host_invites(secret_hash,realm_id,expires_at) values(args->>'secretHash',h.realm_id,now()+interval '15 minutes');
  return jsonb_build_object('realm',h.realm_id,'expiresAt',now()+interval '15 minutes');
 end if;
 if operation='link' then
  select * into p from fenys_global.google_players where auth_id=uid for update;
  if found then
   if p.user_id<>args->>'userId' then raise exception 'google_already_linked'; end if;
   return jsonb_build_object('linked',true,'userId',p.user_id,'revision',p.revision);
  end if;
  if exists(select 1 from fenys_global.google_players where user_id=args->>'userId' or native_key=args->>'nativeKey') then raise exception 'character_already_linked'; end if;
  insert into fenys_global.google_players(auth_id,user_id,native_key,name,origin_host,snapshot,revision,commit_id)
   values(uid,args->>'userId',args->>'nativeKey',args->>'name',host_key,args->'snapshot',1,(args->>'commitId')::uuid);
  return jsonb_build_object('linked',true,'userId',args->>'userId','revision',1);
 end if;
 if operation='join' then
  -- Concurrent first registration is serialized by the verified Auth identity.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into p from fenys_global.google_players where auth_id=uid for update;
  if not found then
   insert into fenys_global.google_players(auth_id,user_id,native_key,name,origin_host)
    values(uid,'UID-'||gen_random_uuid()::text,'UUK_'||replace(gen_random_uuid()::text,'-','')||substr(replace(gen_random_uuid()::text,'-',''),1,16),args->>'name',host_key) returning * into p;
  end if;
  sid := (args->>'session')::uuid;
  if p.lease_until>now() and (p.holder<>host_key or p.session_id<>sid) then raise exception 'character_busy'; end if;
  update fenys_global.google_players set holder=host_key,session_id=sid,lease_until=now()+interval '75 seconds' where auth_id=uid;
  return jsonb_build_object('authId',uid,'userId',p.user_id,'name',p.name,'key',p.native_key,'snapshot',p.snapshot,'revision',p.revision,'commitId',p.commit_id,'session',sid,'originHost',p.origin_host,'leaseUntil',now()+interval '75 seconds');
 end if;
 select * into p from fenys_global.google_players where user_id=args->>'userId' for update;
 if not found then raise exception 'character_unknown'; end if;
 if operation='save' and p.commit_id=(args->>'commitId')::uuid then
  return jsonb_build_object('revision',p.revision,'commitId',p.commit_id,'leaseUntil',p.lease_until);
 end if;
 if p.holder is distinct from host_key or p.session_id is distinct from (args->>'session')::uuid or (operation not in ('renew','release') and (p.lease_until is null or p.lease_until<=now())) then raise exception 'session_expired'; end if;
 if operation='renew' then
  update fenys_global.google_players set lease_until=now()+interval '75 seconds' where auth_id=p.auth_id;
  return jsonb_build_object('revision',p.revision,'commitId',p.commit_id,'leaseUntil',now()+interval '75 seconds');
 elsif operation='save' then
  if p.revision<>(args->>'expectedRevision')::bigint then raise exception 'stale_progress'; end if;
  if args->'snapshot'->>'userId'<>p.user_id then raise exception 'identity_mismatch'; end if;
  update fenys_global.google_players set snapshot=args->'snapshot',revision=revision+1,commit_id=(args->>'commitId')::uuid,updated_at=now(),lease_until=now()+interval '75 seconds' where auth_id=p.auth_id returning * into p;
  return jsonb_build_object('revision',p.revision,'commitId',p.commit_id,'leaseUntil',p.lease_until);
 elsif operation='release' then
  update fenys_global.google_players set lease_until=now() where auth_id=p.auth_id;
  return jsonb_build_object('released',true);
 end if;
 raise exception 'operation_invalid';
end $$;
revoke all on function public.launcher_google_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.launcher_google_api(text,jsonb) to service_role;
