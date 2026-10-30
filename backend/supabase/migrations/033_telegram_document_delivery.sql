begin;

-- Isolated service-only storage; business records remain unchanged.
create table public.telegram_delivery_connections (
 owner_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 profile text not null check (profile in ('fil','sasha')),
 revision uuid not null default gen_random_uuid(),
 bot_id bigint not null check (bot_id>0), bot_username text not null check (bot_username='avbssbot'),
 encrypted_token jsonb not null check (jsonb_typeof(encrypted_token)='object' and octet_length(encrypted_token::text)<2048),
 destination_id text check (destination_id ~ '^-[1-9][0-9]{4,19}$'),
 destination_title text check (length(destination_title)<=200),
 destination_type text check (destination_type in ('channel','group','supergroup')),
 template jsonb not null default '{}' check (jsonb_typeof(template)='object' and octet_length(template::text)<=20000),
 updated_at timestamptz not null default now(), primary key(owner_id,organization_id,profile)
);
create table public.telegram_delivery_jobs (
 request_id uuid not null, owner_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 profile text not null check (profile in ('fil','sasha')), connection_revision uuid not null,
 destination_id text not null, destination_title text not null,
 project_title text not null check (length(project_title)<=200), file_count integer not null check (file_count between 1 and 10),
 payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'sending' check (state in ('sending','sent','failed','unknown')),
 message_id bigint, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(owner_id,organization_id,profile,request_id)
);
create index telegram_delivery_jobs_recent on public.telegram_delivery_jobs(owner_id,organization_id,profile,created_at desc);
alter table public.telegram_delivery_connections enable row level security;
alter table public.telegram_delivery_jobs enable row level security;
revoke all on public.telegram_delivery_connections,public.telegram_delivery_jobs from public,anon,authenticated;
grant select,insert,update on public.telegram_delivery_connections,public.telegram_delivery_jobs to service_role;

create function public.telegram_delivery_require_actor(p_owner uuid,p_org uuid,p_profile text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_profile not in ('fil','sasha') or not exists(select 1 from public.organization_members where user_id=p_owner and organization_id=p_org and (role in ('owner','admin') or role='manager' and p_profile='sasha')) then raise exception 'telegram_forbidden' using errcode='42501'; end if;
end $$;

create function public.telegram_delivery_save(p_owner uuid,p_org uuid,p_profile text,p_expected uuid,p_value jsonb,p_connect boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare current public.telegram_delivery_connections; next_revision uuid:=gen_random_uuid();
begin
 perform public.telegram_delivery_require_actor(p_owner,p_org,p_profile);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_org::text||p_profile,381));
 select * into current from public.telegram_delivery_connections where owner_id=p_owner and organization_id=p_org and profile=p_profile for update;
 if current.revision is distinct from p_expected then raise exception 'settings_conflict' using errcode='40001'; end if;
 if exists(select 1 from public.telegram_delivery_jobs where owner_id=p_owner and organization_id=p_org and profile=p_profile and state='sending' and created_at>now()-interval '5 minutes') then raise exception 'delivery_busy'; end if;
 if p_connect then
  insert into public.telegram_delivery_connections(owner_id,organization_id,profile,revision,bot_id,bot_username,encrypted_token,template)
  values(p_owner,p_org,p_profile,next_revision,(p_value->>'bot_id')::bigint,p_value->>'bot_username',p_value->'encrypted_token',coalesce(current.template,'{}'))
  on conflict(owner_id,organization_id,profile) do update set revision=excluded.revision,bot_id=excluded.bot_id,bot_username=excluded.bot_username,encrypted_token=excluded.encrypted_token,destination_id=null,destination_title=null,destination_type=null,updated_at=now();
 else
  if current.revision is null then raise exception 'bot_required'; end if;
  update public.telegram_delivery_connections set revision=next_revision,destination_id=p_value->>'destination_id',destination_title=p_value->>'destination_title',destination_type=p_value->>'destination_type',template=p_value->'template',updated_at=now() where owner_id=p_owner and organization_id=p_org and profile=p_profile;
 end if;
 return next_revision;
end $$;

create function public.telegram_delivery_begin(p_owner uuid,p_org uuid,p_profile text,p_request uuid,p_revision uuid,p_target text,p_hash text,p_project text,p_count integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.telegram_delivery_jobs; connection public.telegram_delivery_connections;
begin
 perform public.telegram_delivery_require_actor(p_owner,p_org,p_profile);
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_org::text||p_profile,381));
 select * into existing from public.telegram_delivery_jobs where owner_id=p_owner and organization_id=p_org and profile=p_profile and request_id=p_request;
 if existing.request_id is not null then
  if existing.payload_hash<>p_hash or existing.connection_revision<>p_revision or existing.destination_id<>p_target then raise exception 'request_conflict'; end if;
  return jsonb_build_object('claimed',false,'state',existing.state,'message_id',existing.message_id);
 end if;
 select * into connection from public.telegram_delivery_connections where owner_id=p_owner and organization_id=p_org and profile=p_profile for update;
 if connection.revision is distinct from p_revision or connection.destination_id is distinct from p_target or p_target is null then raise exception 'settings_conflict' using errcode='40001'; end if;
 if exists(select 1 from public.telegram_delivery_jobs where owner_id=p_owner and organization_id=p_org and profile=p_profile and state='sending' and created_at>now()-interval '5 minutes') then raise exception 'delivery_busy'; end if;
 if (select count(*) from public.telegram_delivery_jobs where owner_id=p_owner and created_at>now()-interval '1 minute')>=5 then raise exception 'try_later'; end if;
 insert into public.telegram_delivery_jobs(request_id,owner_id,organization_id,profile,connection_revision,destination_id,destination_title,project_title,file_count,payload_hash) values(p_request,p_owner,p_org,p_profile,p_revision,p_target,connection.destination_title,p_project,p_count,p_hash);
 return jsonb_build_object('claimed',true,'state','sending');
end $$;

create function public.telegram_delivery_finish(p_owner uuid,p_org uuid,p_profile text,p_request uuid,p_hash text,p_state text,p_message bigint default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('sent','failed','unknown') or p_state='sent' and (p_message is null or p_message<=0) then raise exception 'invalid_receipt'; end if;
 update public.telegram_delivery_jobs set state=p_state,message_id=p_message,updated_at=now() where owner_id=p_owner and organization_id=p_org and profile=p_profile and request_id=p_request and payload_hash=p_hash and state='sending';
 return found;
end $$;
revoke all on function public.telegram_delivery_require_actor(uuid,uuid,text),public.telegram_delivery_save(uuid,uuid,text,uuid,jsonb,boolean),public.telegram_delivery_begin(uuid,uuid,text,uuid,uuid,text,text,text,integer),public.telegram_delivery_finish(uuid,uuid,text,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.telegram_delivery_require_actor(uuid,uuid,text),public.telegram_delivery_save(uuid,uuid,text,uuid,jsonb,boolean),public.telegram_delivery_begin(uuid,uuid,text,uuid,uuid,text,text,text,integer),public.telegram_delivery_finish(uuid,uuid,text,uuid,text,text,bigint) to service_role;
commit;
