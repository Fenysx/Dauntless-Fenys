-- The Edge Function authenticates signed machines; no public table access.
create schema if not exists fenys_global;
revoke all on schema fenys_global from public, anon, authenticated;
grant usage on schema fenys_global to service_role;
create table if not exists fenys_global.activations (
 secret_hash text primary key check (secret_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, realm_id uuid, owner_key text
);
create table if not exists fenys_global.realms (
 id uuid primary key, owner_key text not null,
 revision bigint not null default 0, latest_commit uuid,
 holder text, lease_until timestamptz,
 last_success timestamptz, snapshot_digest text
);
create table if not exists fenys_global.snapshots (
 realm_id uuid not null references fenys_global.realms(id),
 slot bigint not null check(slot in (0,1)), commit_id uuid not null,
 ciphertext bytea not null, digest text not null,
 created_at timestamptz not null default now(),
 primary key(realm_id, slot), unique(realm_id,commit_id),
 check(octet_length(ciphertext) <= 16777216)
);
alter table fenys_global.activations enable row level security;
alter table fenys_global.realms enable row level security;
alter table fenys_global.snapshots enable row level security;
revoke all on all tables in schema fenys_global from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema fenys_global to service_role;

create function public.fenys_global_api(operation text, args jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 r fenys_global.realms%rowtype;
 a fenys_global.activations%rowtype;
 rid uuid := (args->>'realm')::uuid;
 pub text := args->>'publicKey';
 holder_id text := args->>'holder';
 expected bigint := coalesce((args->>'expectedRevision')::bigint,0);
 commit_uuid uuid;
begin
 if operation='enroll' then
  select * into a from fenys_global.activations where secret_hash=args->>'secretHash' for update;
  if not found or (a.realm_id is null and a.expires_at<=now()) then raise exception 'activation_denied'; end if;
  if a.realm_id is not null then
   if a.realm_id<>rid or a.owner_key<>pub then raise exception 'activation_used'; end if;
  else
   if exists(select 1 from fenys_global.realms where id=rid) then raise exception 'realm_exists'; end if;
   insert into fenys_global.realms(id,owner_key) values(rid,pub);
   update fenys_global.activations set realm_id=rid,owner_key=pub where secret_hash=a.secret_hash;
  end if;
 end if;
 select * into r from fenys_global.realms where id=rid for update;
 if not found or r.owner_key<>pub then raise exception 'owner_denied'; end if;
 if operation in ('enroll','state') then
  return jsonb_build_object('revision',r.revision,'latestCommit',r.latest_commit,'lastSuccess',r.last_success,'digest',r.snapshot_digest);
 elsif operation='lease' then
  if holder_id is null or holder_id !~ '^[a-f0-9]{64}$' then raise exception 'holder_invalid'; end if;
  if r.lease_until>now() and r.holder<>holder_id then raise exception 'authority_already_running'; end if;
  update fenys_global.realms set holder=holder_id,lease_until=now()+interval '75 seconds' where id=rid;
  return jsonb_build_object('revision',r.revision,'latestCommit',r.latest_commit,'leaseUntil',now()+interval '75 seconds');
 elsif operation='save' then
  commit_uuid := (args->>'commitId')::uuid;
  if r.latest_commit=commit_uuid then return jsonb_build_object('revision',r.revision,'latestCommit',r.latest_commit,'lastSuccess',r.last_success,'digest',r.snapshot_digest); end if;
  if r.holder is distinct from holder_id or r.lease_until is null or r.lease_until<=now() then raise exception 'lease_expired'; end if;
  if r.revision<>expected then raise exception 'stale_snapshot'; end if;
  if args->>'digest' !~ '^[a-f0-9]{64}$' then raise exception 'digest_invalid'; end if;
  insert into fenys_global.snapshots(realm_id,slot,commit_id,ciphertext,digest)
   values(rid,(r.revision+1)%2,commit_uuid,decode(args->>'ciphertext','base64'),args->>'digest')
   on conflict(realm_id,slot) do update set commit_id=excluded.commit_id,ciphertext=excluded.ciphertext,digest=excluded.digest,created_at=now();
  update fenys_global.realms set revision=revision+1,latest_commit=commit_uuid,last_success=now(),snapshot_digest=args->>'digest' where id=rid returning * into r;
  return jsonb_build_object('revision',r.revision,'latestCommit',r.latest_commit,'lastSuccess',r.last_success,'digest',r.snapshot_digest);
 elsif operation='download' then
  return (select jsonb_build_object('revision',r.revision,'commitId',commit_id,'digest',digest,'ciphertext',encode(ciphertext,'base64')) from fenys_global.snapshots where realm_id=rid and slot=r.revision%2);
 elsif operation='release' then
  if r.holder=holder_id then update fenys_global.realms set lease_until=now() where id=rid; end if;
  return jsonb_build_object('released',true);
 end if;
 raise exception 'operation_invalid';
end $$;
revoke all on function public.fenys_global_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.fenys_global_api(text,jsonb) to service_role;
