create schema if not exists avito_guard_private;
revoke all on schema avito_guard_private from public,anon,authenticated;
grant usage on schema avito_guard_private to authenticated,service_role;
create table public.avito_guard_cloud (
 settings_id uuid primary key references public.avito_guard_settings(id),organization_id uuid not null references public.organizations(id),
 source_url text not null check(source_url~'^https://storage[.]yandexcloud[.]net/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]/[^?#[:space:]]+[.]xlsx$' and length(source_url)<=2048),
 retention_hours integer not null default 24 check(retention_hours between 1 and 720),auto_edit boolean not null default false,
 has_credentials boolean not null default false,access_key_hint text,revision bigint not null default 0,updated_at timestamptz not null default now(),
 profile_checked_at timestamptz,actual_feeds jsonb,autoload_enabled boolean,profile_error text,
 file_checked_at timestamptz,file_items integer,file_sheets jsonb,file_etag text,last_published_at timestamptz,last_error text,
 lease uuid,lease_until timestamptz,credential_version text,next_cleanup_at timestamptz not null default now(),
 unique(organization_id,source_url)
);
create table avito_guard_private.cloud_secrets(settings_id uuid primary key references public.avito_guard_cloud(settings_id),secret_id uuid not null);
alter table avito_guard_private.cloud_secrets enable row level security;
revoke all on avito_guard_private.cloud_secrets from public,anon,authenticated,service_role;
create table public.avito_guard_cloud_versions (
 id uuid primary key default gen_random_uuid(),settings_id uuid not null references public.avito_guard_cloud(settings_id),organization_id uuid not null references public.organizations(id),
 object_key text not null unique,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),bytes integer not null check(bytes between 1 and 10485760),
 created_at timestamptz not null default now(),deleted_at timestamptz
);
create index avito_guard_cloud_versions_expiry on public.avito_guard_cloud_versions(settings_id,created_at) where deleted_at is null;
create table public.avito_guard_cloud_batches (
 id uuid primary key default gen_random_uuid(),settings_id uuid not null references public.avito_guard_cloud(settings_id),organization_id uuid not null references public.organizations(id),
 backup_id uuid not null references public.avito_guard_cloud_versions(id),state text not null default 'prepared' check(state in('prepared','publishing','applied','conflict','review')),
 base_etag text not null,base_sha text not null check(base_sha~'^[a-f0-9]{64}$'),new_sha text not null check(new_sha~'^[a-f0-9]{64}$'),
 changes jsonb not null check(jsonb_typeof(changes)='array' and jsonb_array_length(changes) between 1 and 20 and octet_length(changes::text)<65536),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index avito_guard_cloud_one_pending on public.avito_guard_cloud_batches(settings_id) where state in('prepared','publishing');
create table public.avito_guard_cloud_actions(event_id uuid primary key references public.avito_guard_events(id),batch_id uuid not null references public.avito_guard_cloud_batches(id));
alter table public.avito_guard_cloud enable row level security;
alter table public.avito_guard_cloud_versions enable row level security;
alter table public.avito_guard_cloud_batches enable row level security;
alter table public.avito_guard_cloud_actions enable row level security;
revoke all on public.avito_guard_cloud,public.avito_guard_cloud_versions,public.avito_guard_cloud_batches,public.avito_guard_cloud_actions from public,anon,authenticated;
grant select on public.avito_guard_cloud,public.avito_guard_cloud_versions,public.avito_guard_cloud_batches to authenticated;
grant all on public.avito_guard_cloud,public.avito_guard_cloud_versions,public.avito_guard_cloud_batches,public.avito_guard_cloud_actions to service_role;
create policy guard_cloud_read on public.avito_guard_cloud for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy guard_versions_read on public.avito_guard_cloud_versions for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy guard_batches_read on public.avito_guard_cloud_batches for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

create function avito_guard_private.cloud_save(p_id uuid,p_revision bigint,p_url text,p_hours integer,p_auto boolean,p_access text,p_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.avito_guard_settings;c public.avito_guard_cloud;secret_id uuid;
begin
 select * into s from public.avito_guard_settings where id=p_id;
 if auth.uid() is null or s.id is null or not public.has_org_role(s.organization_id,array['owner','admin']::public.organization_role[]) then raise exception 'Permission denied' using errcode='42501';end if;
 perform public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,auth.uid());
 if p_url is null or p_url!~'^https://storage[.]yandexcloud[.]net/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]/[^?#[:space:]]+[.]xlsx$' or length(p_url)>2048 or p_hours is null or p_hours not between 1 and 720 or p_auto is null then raise exception 'Invalid cloud settings' using errcode='22023';end if;
 if coalesce(p_access,'')<>'' or coalesce(p_secret,'')<>'' then
  if p_access is null or p_secret is null or p_access!~'^[A-Za-z0-9_-]{8,128}$' or length(p_secret) not between 16 and 256 or p_secret!~'^[!-~]+$' then raise exception 'Both S3 keys required' using errcode='22023';end if;
 end if;
 select * into c from public.avito_guard_cloud where settings_id=p_id for update;
 if c.settings_id is null then
  if p_revision<>-1 then raise exception 'Revision conflict' using errcode='40001';end if;
  insert into public.avito_guard_cloud(settings_id,organization_id,source_url,retention_hours,auto_edit) values(p_id,s.organization_id,p_url,p_hours,p_auto) returning * into c;
 else
  if c.revision<>p_revision or c.lease_until>now() then raise exception 'Revision conflict' using errcode='40001';end if;
  if c.source_url<>p_url and exists(select 1 from public.avito_guard_cloud_versions where settings_id=p_id and deleted_at is null) then raise exception 'Keep source until versions expire' using errcode='22023';end if;
  update public.avito_guard_cloud set source_url=p_url,retention_hours=p_hours,auto_edit=p_auto,revision=revision+1,updated_at=now(),profile_checked_at=case when source_url=p_url then profile_checked_at else null end where settings_id=p_id returning * into c;
 end if;
 if coalesce(p_access,'')<>'' then
  select x.secret_id into secret_id from avito_guard_private.cloud_secrets x where settings_id=p_id;
  if secret_id is null then
   secret_id:=vault.create_secret(jsonb_build_object('settings_id',p_id,'organization_id',s.organization_id,'access_key',p_access,'secret_key',p_secret)::text);
   insert into avito_guard_private.cloud_secrets values(p_id,secret_id);
  else perform vault.update_secret(secret_id,jsonb_build_object('settings_id',p_id,'organization_id',s.organization_id,'access_key',p_access,'secret_key',p_secret)::text);end if;
  update public.avito_guard_cloud set has_credentials=true,access_key_hint=right(p_access,4),revision=revision+1 where settings_id=p_id returning * into c;
 end if;
 update public.avito_guard_runtime set next_at=now(),page=1 where settings_id=p_id and (lease_until is null or lease_until<now());
 return to_jsonb(c)-array['lease','lease_until','credential_version'];
end $$;
revoke all on function avito_guard_private.cloud_save(uuid,bigint,text,integer,boolean,text,text) from public,anon;
grant execute on function avito_guard_private.cloud_save(uuid,bigint,text,integer,boolean,text,text) to authenticated;
create function public.avito_guard_cloud_save(p_id uuid,p_revision bigint,p_url text,p_hours integer,p_auto boolean,p_access text default null,p_secret text default null)
returns jsonb language sql security invoker set search_path='' as $$select avito_guard_private.cloud_save(p_id,p_revision,p_url,p_hours,p_auto,p_access,p_secret)$$;
create function public.avito_guard_cloud_dashboard(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('connections',coalesce((select jsonb_agg(to_jsonb(c)-array['lease','lease_until','credential_version']) from public.avito_guard_cloud c where organization_id=p_org),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(v) from(select id,settings_id,created_at,deleted_at,bytes from public.avito_guard_cloud_versions where organization_id=p_org order by created_at desc limit 100)v),'[]'::jsonb),
 'batches',coalesce((select jsonb_agg(b) from(select id,settings_id,state,changes,created_at,updated_at from public.avito_guard_cloud_batches where organization_id=p_org order by created_at desc limit 100)b),'[]'::jsonb))
 where public.has_org_role(p_org,array['owner','admin']::public.organization_role[])
$$;
revoke all on function public.avito_guard_cloud_save(uuid,bigint,text,integer,boolean,text,text),public.avito_guard_cloud_dashboard(uuid) from public,anon;
grant execute on function public.avito_guard_cloud_save(uuid,bigint,text,integer,boolean,text,text),public.avito_guard_cloud_dashboard(uuid) to authenticated;

create function avito_guard_private.cloud_keys(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select v.decrypted_secret::jsonb into result from avito_guard_private.cloud_secrets s join vault.decrypted_secrets v on v.id=s.secret_id where s.settings_id=p_id;
 if result is not null and (result->>'settings_id')::uuid<>p_id then raise exception 'Invalid key binding';end if;return result;
end $$;
revoke all on function avito_guard_private.cloud_keys(uuid) from public,anon,authenticated;
grant execute on function avito_guard_private.cloud_keys(uuid) to service_role;
create function public.avito_guard_cloud_claim(p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.avito_guard_cloud;s public.avito_guard_settings;k jsonb;version text;
begin
 select * into c from public.avito_guard_cloud where (p_id is not null and settings_id=p_id or p_id is null and has_credentials and next_cleanup_at<=now()) and (lease_until is null or lease_until<now()) order by next_cleanup_at for update skip locked limit 1;
 if c.settings_id is null then return null;end if;
 select * into s from public.avito_guard_settings where id=c.settings_id;
 begin version:=public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id);exception when others then update public.avito_guard_cloud set last_error='account_access_changed',next_cleanup_at=now()+interval '5 minutes' where settings_id=c.settings_id;return null;end;
 k:=avito_guard_private.cloud_keys(c.settings_id);
 if k is not null and (k->>'organization_id')::uuid<>c.organization_id then raise exception 'Invalid key binding';end if;
 update public.avito_guard_cloud set lease=gen_random_uuid(),lease_until=now()+interval '120 seconds',credential_version=version where settings_id=c.settings_id returning * into c;
 return jsonb_build_object('config',to_jsonb(c),'keys',k,'rules',s.rules,'enabled',s.enabled,
 'pending',(select to_jsonb(b) from public.avito_guard_cloud_batches b where b.settings_id=c.settings_id and state in('prepared','publishing') limit 1),
 'events',coalesce((select jsonb_agg(e) from(select id,item_id,title from public.avito_guard_events e where e.settings_id=c.settings_id and e.severity='quarantine' and e.created_at>now()-interval '1 hour' and not exists(select 1 from public.avito_guard_cloud_actions a where a.event_id=e.id) order by e.created_at limit 20)e),'[]'::jsonb),
 'expired',coalesce((select jsonb_agg(v) from(select id,object_key from public.avito_guard_cloud_versions where settings_id=c.settings_id and deleted_at is null and created_at<now()-make_interval(hours=>c.retention_hours) order by created_at limit 20)v),'[]'::jsonb));
end $$;
create function public.avito_guard_cloud_validate(p_id uuid,p_lease uuid,p_revision bigint) returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.avito_guard_cloud;s public.avito_guard_settings;
begin select * into c from public.avito_guard_cloud where settings_id=p_id and lease=p_lease and lease_until>now() and revision=p_revision;
 select * into s from public.avito_guard_settings where id=p_id;
 if c.settings_id is null or public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id) is distinct from c.credential_version then raise exception 'Cloud lease changed' using errcode='40001';end if;return true;end $$;
create function public.avito_guard_cloud_profile(p_id uuid,p_lease uuid,p_revision bigint,p_enabled boolean,p_feeds jsonb,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);
 if p_error is not null and p_error!~'^[a-z_]{1,80}$' or jsonb_typeof(p_feeds) is distinct from 'array' or jsonb_array_length(p_feeds)>30 or octet_length(p_feeds::text)>32768 then raise exception 'Invalid profile';end if;
 update public.avito_guard_cloud set profile_checked_at=now(),actual_feeds=p_feeds,autoload_enabled=p_enabled,profile_error=p_error where settings_id=p_id;return true;end $$;
create function public.avito_guard_cloud_finish(p_id uuid,p_lease uuid,p_revision bigint,p_error text default null,p_meta jsonb default '{}'::jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);
 if p_error is not null and p_error!~'^[a-z_]{1,80}$' or octet_length(p_meta::text)>8192 then raise exception 'Invalid metadata';end if;
 update public.avito_guard_cloud set file_checked_at=case when p_meta?'file_items' then now() else file_checked_at end,file_items=coalesce((p_meta->>'file_items')::integer,file_items),file_sheets=coalesce(p_meta->'file_sheets',file_sheets),file_etag=coalesce(p_meta->>'file_etag',file_etag),last_error=p_error,next_cleanup_at=now()+interval '5 minutes',lease=null,lease_until=null where settings_id=p_id;return true;end $$;
create function public.avito_guard_cloud_plan(p_id uuid,p_lease uuid,p_revision bigint,p_etag text,p_before text,p_after text,p_bytes integer,p_changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.avito_guard_cloud;vid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();ch jsonb;
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);select * into c from public.avito_guard_cloud where settings_id=p_id;
 if not c.auto_edit or not c.has_credentials or not exists(select 1 from public.avito_guard_settings where id=p_id and enabled) or c.profile_error is not null or not exists(select 1 from jsonb_array_elements(c.actual_feeds) f where f->>'feed_url'=c.source_url) then raise exception 'Feed not ready';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 20 or octet_length(p_changes::text)>65536 or p_etag is null or length(p_etag)>200 then raise exception 'Invalid changes';end if;
 for ch in select value from jsonb_array_elements(p_changes) loop
  if not exists(select 1 from public.avito_guard_events where id=(ch->>'event_id')::uuid and settings_id=p_id and item_id=ch->>'item_id' and severity='quarantine') or length(ch->>'new_title') not between 1 and 50 then raise exception 'Invalid event';end if;
 end loop;
 insert into public.avito_guard_cloud_versions(id,settings_id,organization_id,object_key,sha256,bytes) values(vid,p_id,c.organization_id,'_avb_versions/'||c.organization_id||'/'||p_id||'/'||vid||'.xlsx',p_before,p_bytes);
 insert into public.avito_guard_cloud_batches(id,settings_id,organization_id,backup_id,base_etag,base_sha,new_sha,changes) values(bid,p_id,c.organization_id,vid,p_etag,p_before,p_after,p_changes);
 insert into public.avito_guard_cloud_actions select (x->>'event_id')::uuid,bid from jsonb_array_elements(p_changes)x;
 return (select to_jsonb(b) from public.avito_guard_cloud_batches b where id=bid);
end $$;
create function public.avito_guard_cloud_batch(p_id uuid,p_lease uuid,p_revision bigint,p_batch uuid,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);if p_state not in('publishing','applied','conflict','review') then raise exception 'Invalid state';end if;
 update public.avito_guard_cloud_batches set state=p_state,updated_at=now() where id=p_batch and settings_id=p_id and state in('prepared','publishing');
 if not found then raise exception 'Batch changed';end if;
 if p_state='applied' then update public.avito_guard_cloud set last_published_at=now() where settings_id=p_id;end if;return true;end $$;
create function public.avito_guard_cloud_deleted(p_id uuid,p_lease uuid,p_revision bigint,p_version uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);
 update public.avito_guard_cloud_versions v set deleted_at=now() from public.avito_guard_cloud c where v.id=p_version and v.settings_id=p_id and c.settings_id=p_id and v.deleted_at is null and v.created_at<now()-make_interval(hours=>c.retention_hours);return found;end $$;
revoke all on function public.avito_guard_cloud_claim(uuid),public.avito_guard_cloud_validate(uuid,uuid,bigint),public.avito_guard_cloud_profile(uuid,uuid,bigint,boolean,jsonb,text),public.avito_guard_cloud_finish(uuid,uuid,bigint,text,jsonb),public.avito_guard_cloud_plan(uuid,uuid,bigint,text,text,text,integer,jsonb),public.avito_guard_cloud_batch(uuid,uuid,bigint,uuid,text),public.avito_guard_cloud_deleted(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.avito_guard_cloud_claim(uuid),public.avito_guard_cloud_validate(uuid,uuid,bigint),public.avito_guard_cloud_profile(uuid,uuid,bigint,boolean,jsonb,text),public.avito_guard_cloud_finish(uuid,uuid,bigint,text,jsonb),public.avito_guard_cloud_plan(uuid,uuid,bigint,text,text,text,integer,jsonb),public.avito_guard_cloud_batch(uuid,uuid,bigint,uuid,text),public.avito_guard_cloud_deleted(uuid,uuid,bigint,uuid) to service_role;
