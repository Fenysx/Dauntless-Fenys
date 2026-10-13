-- Dauntless Launcher Ultimate • Community directory (additive, no player/save changes)
-- Install once in the SAME Supabase project as fenys_global.google_hosts.
create table if not exists public.dlu_community_servers (
  id uuid primary key default gen_random_uuid(),
  host_key text not null unique,
  owner_auth_id uuid not null,
  name text not null check (char_length(name) between 3 and 70),
  description text not null default '' check (char_length(description) <= 280),
  address text not null,
  policy text not null default 'invite' check (policy in ('open','invite','vip')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dlu_host_registered foreign key (host_key) references fenys_global.google_hosts(public_key)
);
create index if not exists dlu_servers_owner on public.dlu_community_servers(owner_auth_id);
create table if not exists public.dlu_community_usernames (
  auth_id uuid primary key,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  updated_at timestamptz not null default now()
);
create table if not exists public.dlu_community_invitations (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.dlu_community_servers(id) on delete cascade,
  recipient text not null,
  recipient_email text,
  recipient_auth_id uuid,
  tier text not null default 'member' check (tier in ('member','vip')),
  duration_days integer check (duration_days in (30,90,365)),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  unique (server_id,recipient),
  constraint dlu_invite_recipient check ((recipient_email is not null) <> (recipient_auth_id is not null))
);
create index if not exists dlu_invites_email on public.dlu_community_invitations(recipient_email,status);
create index if not exists dlu_invites_auth on public.dlu_community_invitations(recipient_auth_id,status);
create table if not exists public.dlu_community_memberships (
  server_id uuid not null references public.dlu_community_servers(id) on delete cascade,
  auth_id uuid not null,
  tier text not null check (tier in ('member','vip')),
  granted_by uuid not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (server_id,auth_id)
);
create index if not exists dlu_memberships_auth on public.dlu_community_memberships(auth_id);
-- Neither anon nor authenticated browser/launcher clients receive direct SQL table access.
-- Only the Edge Function with service_role reads/writes these tables.
alter table public.dlu_community_servers enable row level security;
alter table public.dlu_community_usernames enable row level security;
alter table public.dlu_community_invitations enable row level security;
alter table public.dlu_community_memberships enable row level security;
revoke all on public.dlu_community_servers,public.dlu_community_usernames,
 public.dlu_community_invitations,public.dlu_community_memberships from public,anon,authenticated;
grant select,insert,update,delete on public.dlu_community_servers,public.dlu_community_usernames,
 public.dlu_community_invitations,public.dlu_community_memberships to service_role;
-- Google host registration lives in a private schema. Only service_role may query it.
create or replace function public.dlu_community_host_lookup(host_public_key text)
returns table(host_address text,host_active boolean)
language sql stable security definer set search_path = ''
as $$
 select h.address,h.active from fenys_global.google_hosts h
 where h.public_key=host_public_key limit 1
$$;
revoke all on function public.dlu_community_host_lookup(text) from public,anon,authenticated;
grant execute on function public.dlu_community_host_lookup(text) to service_role;

-- Accept/decline in a single transaction: no invitation may appear accepted without access.
create or replace function public.dlu_community_decide(
  invite_uuid uuid, google_auth_id uuid, google_email text, answer text)
returns table(accepted boolean, server_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare invitation public.dlu_community_invitations%rowtype;
begin
  if answer not in ('accept','decline') then raise exception 'invalid_decision'; end if;
  select * into invitation from public.dlu_community_invitations i
   where i.id=invite_uuid for update;
  if not found or invitation.status <> 'pending' or invitation.expires_at <= now()
    or not (invitation.recipient_auth_id=google_auth_id
      or invitation.recipient_email=lower(google_email))
  then raise exception 'invite_unavailable'; end if;
  update public.dlu_community_invitations set status=case when answer='accept'
    then 'accepted' else 'declined' end where id=invite_uuid;
  if answer='accept' then
    insert into public.dlu_community_memberships(
      server_id,auth_id,tier,granted_by,expires_at,revoked_at)
    values(invitation.server_id,google_auth_id,invitation.tier,google_auth_id,
      case when invitation.tier='vip' then now()+make_interval(days=>coalesce(invitation.duration_days,30))
           else null end,null)
    on conflict (server_id,auth_id) do update
      set tier=case when public.dlu_community_memberships.tier='vip'
                        and public.dlu_community_memberships.revoked_at is null
                        and public.dlu_community_memberships.expires_at>now()
                        and excluded.tier='member' then 'vip' else excluded.tier end,
          expires_at=case when public.dlu_community_memberships.tier='vip'
                        and public.dlu_community_memberships.revoked_at is null
                        and public.dlu_community_memberships.expires_at>now()
                        and excluded.tier='member'
                        then public.dlu_community_memberships.expires_at
                        else excluded.expires_at end,
          revoked_at=null;
  end if;
  accepted=(answer='accept'); server_id=invitation.server_id;
  return next;
end $$;
revoke all on function public.dlu_community_decide(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dlu_community_decide(uuid,uuid,text,text) to service_role;
