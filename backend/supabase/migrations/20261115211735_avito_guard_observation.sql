create table public.avito_guard_settings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 module text not null check(module in('personal','oauth')),account_id uuid not null,actor_id uuid not null references auth.users(id),
 enabled boolean not null default false,rules jsonb not null default '{"warningViews":3,"quarantineViews":4,"windowsMinutes":[5,10,15],"noContacts":true,"batchedTrigger":true,"cooldownMinutes":60,"pauseAutoload":true,"titles":[],"mode":"monitor"}',
 revision bigint not null default 0,updated_at timestamptz not null default now(),
 unique(organization_id,module,account_id),check(jsonb_typeof(rules)='object' and octet_length(rules::text)<8192 and rules->>'mode'='monitor'),
 check(revision between 0 and 9007199254740990)
);
create table public.avito_guard_runtime (
 settings_id uuid primary key references public.avito_guard_settings(id),organization_id uuid not null references public.organizations(id),
 page integer not null default 1 check(page between 1 and 1011),next_at timestamptz not null default now(),lease uuid,lease_until timestamptz,credential_version text,
 last_success_at timestamptz,last_error text,sampled_items integer not null default 0,cycle_items integer not null default 0,cycle_completed_at timestamptz
);
create table public.avito_guard_samples (
 settings_id uuid not null references public.avito_guard_settings(id),item_id text not null check(item_id~'^[1-9][0-9]{0,15}$'),
 observed_at timestamptz not null default now(),metric_date date not null,views bigint not null check(views>=0),contacts bigint not null check(contacts>=0),
 primary key(settings_id,item_id,observed_at)
);
create index avito_guard_samples_retention on public.avito_guard_samples(observed_at);
create table public.avito_guard_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),settings_id uuid not null references public.avito_guard_settings(id),
 item_id text not null,title text not null check(length(title)<=300),item_url text,
 severity text not null check(severity in('warning','quarantine')),stage text not null default 'signal' check(stage='signal'),
 views_delta bigint not null,contacts_delta bigint not null,window_minutes integer not null,batched boolean not null,
 created_at timestamptz not null default now(),action_status text not null default 'observation_only' check(action_status='observation_only')
);
create index avito_guard_events_item on public.avito_guard_events(settings_id,item_id,created_at desc);
create index avito_guard_events_org on public.avito_guard_events(organization_id,created_at desc);
alter table public.avito_guard_settings enable row level security;
alter table public.avito_guard_runtime enable row level security;
alter table public.avito_guard_samples enable row level security;
alter table public.avito_guard_events enable row level security;
revoke all on public.avito_guard_settings,public.avito_guard_runtime,public.avito_guard_samples,public.avito_guard_events from public,anon,authenticated;
grant select,insert,update on public.avito_guard_settings to authenticated;
grant select on public.avito_guard_runtime,public.avito_guard_events to authenticated;
grant all on public.avito_guard_settings,public.avito_guard_runtime,public.avito_guard_samples,public.avito_guard_events to service_role;
create policy avito_guard_settings_read on public.avito_guard_settings for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy avito_guard_settings_insert on public.avito_guard_settings for insert to authenticated with check(actor_id=(select auth.uid()) and public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]) and
 (module='personal' and exists(select 1 from public.avito_personal_accounts a where a.id=account_id and a.organization_id=avito_guard_settings.organization_id and a.status='connected') or module='oauth' and exists(select 1 from public.avito_connections a where a.id=account_id and a.organization_id=avito_guard_settings.organization_id and a.status='connected')));
create policy avito_guard_settings_update on public.avito_guard_settings for update to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])) with check(actor_id=(select auth.uid()) and public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]) and
 (module='personal' and exists(select 1 from public.avito_personal_accounts a where a.id=account_id and a.organization_id=avito_guard_settings.organization_id and a.status='connected') or module='oauth' and exists(select 1 from public.avito_connections a where a.id=account_id and a.organization_id=avito_guard_settings.organization_id and a.status='connected')));
create policy avito_guard_runtime_read on public.avito_guard_runtime for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy avito_guard_events_read on public.avito_guard_events for select to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

create function public.avito_guard_save(p_org uuid,p_module text,p_account uuid,p_revision bigint,p_enabled boolean,p_rules jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.avito_guard_settings; n jsonb;
begin
 if not public.has_org_role(p_org,array['owner','admin']::public.organization_role[]) or auth.uid() is null then raise exception 'Permission denied' using errcode='42501';end if;
 if jsonb_typeof(p_rules) is distinct from 'object' or octet_length(p_rules::text)>8192 or p_rules->>'mode' is distinct from 'monitor' or
  (select count(*) from jsonb_object_keys(p_rules))<>9 or not p_rules ?& array['warningViews','quarantineViews','windowsMinutes','noContacts','batchedTrigger','cooldownMinutes','pauseAutoload','titles','mode'] then raise exception 'Invalid rules' using errcode='22023';end if;
 if (p_rules->>'warningViews')!~'^[0-9]+$' or (p_rules->>'quarantineViews')!~'^[0-9]+$' or (p_rules->>'cooldownMinutes')!~'^[0-9]+$' or
  (p_rules->>'warningViews')::integer not between 1 and 1440 or (p_rules->>'quarantineViews')::integer not between (p_rules->>'warningViews')::integer and 1440 or (p_rules->>'cooldownMinutes')::integer not between 1 and 1440 then raise exception 'Invalid thresholds' using errcode='22023';end if;
 foreach n in array array[p_rules->'noContacts',p_rules->'batchedTrigger',p_rules->'pauseAutoload'] loop if jsonb_typeof(n) is distinct from 'boolean' then raise exception 'Invalid flag';end if;end loop;
 if jsonb_typeof(p_rules->'windowsMinutes') is distinct from 'array' or jsonb_array_length(p_rules->'windowsMinutes') not between 1 and 6 or jsonb_typeof(p_rules->'titles') is distinct from 'array' or jsonb_array_length(p_rules->'titles')>20 then raise exception 'Invalid arrays';end if;
 for n in select value from jsonb_array_elements(p_rules->'windowsMinutes') loop if n::text!~'^[0-9]+$' or (n::text)::integer not between 1 and 60 then raise exception 'Invalid window';end if;end loop;
 for n in select value from jsonb_array_elements(p_rules->'titles') loop if jsonb_typeof(n)<>'string' or length(btrim(n#>>'{}')) not between 1 and 50 or (n#>>'{}')~'[[:cntrl:]]' then raise exception 'Invalid title';end if;end loop;
 if p_revision=-1 then insert into public.avito_guard_settings(organization_id,module,account_id,actor_id,enabled,rules) values(p_org,p_module,p_account,auth.uid(),p_enabled,p_rules) returning * into saved;
 else update public.avito_guard_settings set enabled=p_enabled,rules=p_rules,revision=revision+1,actor_id=auth.uid(),updated_at=now() where organization_id=p_org and module=p_module and account_id=p_account and revision=p_revision returning * into saved;end if;
 if not found then raise exception 'Revision conflict' using errcode='40001';end if;return to_jsonb(saved);
end $$;

create function public.avito_guard_dashboard(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('accounts',coalesce((select jsonb_agg(a) from(
 select 'personal' as module,id as account_id,display_name,avito_user_id from public.avito_personal_accounts where organization_id=p_org and status='connected'
 union all select 'oauth',id,coalesce(nullif(display_name,''),avito_user_id,''),avito_user_id from public.avito_connections where organization_id=p_org and status='connected')a),'[]'::jsonb),
 'settings',coalesce((select jsonb_agg(s) from public.avito_guard_settings s where organization_id=p_org),'[]'::jsonb),
 'runtime',coalesce((select jsonb_agg(s) from public.avito_guard_runtime s where organization_id=p_org),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e) from(select * from public.avito_guard_events where organization_id=p_org and created_at>now()-interval '30 days' order by created_at desc limit 500)e),'[]'::jsonb),
 'capabilities',jsonb_build_object('archive',false,'rename',false,'reactivate',false,'pauseAutoload',false,'sourceResolution','daily_counters','reason','source_file_required'))
 where public.has_org_role(p_org,array['owner','admin']::public.organization_role[])
$$;

create function public.avito_guard_claim() returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.avito_guard_settings;r public.avito_guard_runtime;version text;
begin
 insert into public.avito_guard_runtime(settings_id,organization_id) select id,organization_id from public.avito_guard_settings where enabled on conflict do nothing;
 for r in select rr.* from public.avito_guard_runtime rr join public.avito_guard_settings ss on ss.id=rr.settings_id where ss.enabled and rr.next_at<=now() and (rr.lease_until is null or rr.lease_until<now()) order by rr.next_at for update of rr skip locked limit 4 loop
  select * into s from public.avito_guard_settings where id=r.settings_id;
  begin version:=public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id);
  exception when others then update public.avito_guard_runtime set last_error='account_access_changed',next_at=now()+interval '5 minutes',lease=null,lease_until=null where settings_id=s.id;continue;end;
  update public.avito_guard_runtime set lease=gen_random_uuid(),lease_until=now()+interval '120 seconds',credential_version=version where settings_id=s.id returning * into r;
  return jsonb_build_object('id',s.id,'module',s.module,'organization_id',s.organization_id,'account_id',s.account_id,'actor_id',s.actor_id,'rules',s.rules,'revision',s.revision,'lease',r.lease,'page',r.page,'credential_version',version);
 end loop;return null;
end $$;
create function public.avito_guard_validate(p_id uuid,p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.avito_guard_settings;r public.avito_guard_runtime;
begin
 select * into s from public.avito_guard_settings where id=p_id and enabled;
 select * into r from public.avito_guard_runtime where settings_id=p_id and lease=p_lease and lease_until>now();
 if s.id is null or r.settings_id is null or public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id) is distinct from r.credential_version then raise exception 'Lease or account changed' using errcode='40001';end if;
 return jsonb_build_object('module',s.module,'organization_id',s.organization_id,'account_id',s.account_id,'actor_id',s.actor_id,'credential_version',r.credential_version,'page',r.page,'rules',s.rules,'revision',s.revision);
end $$;
create function public.avito_guard_rotate(p_id uuid,p_lease uuid,p_old text,p_next text) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.avito_guard_settings;
begin select * into s from public.avito_guard_settings where id=p_id and enabled;
 if s.id is null or public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id) is distinct from p_next then return false;end if;
 update public.avito_guard_runtime set credential_version=p_next where settings_id=p_id and lease=p_lease and lease_until>now() and credential_version=p_old;return found;
end $$;
create function public.avito_guard_record(p_id uuid,p_lease uuid,p_revision bigint,p_rows jsonb,p_more boolean,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare c jsonb;r jsonb;b public.avito_guard_samples;prev public.avito_guard_samples;w integer;dv bigint;dc bigint;sev text;cool integer;counted integer:=0;
begin
 c:=public.avito_guard_validate(p_id,p_lease);if (c->>'revision')::bigint<>p_revision then raise exception 'Rules changed' using errcode='40001';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>99 or octet_length(p_rows::text)>131072 or p_error is not null and p_error!~'^[a-z_]{1,80}$' then raise exception 'Invalid samples';end if;
 cool:=(c->'rules'->>'cooldownMinutes')::integer;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'id','')!~'^[1-9][0-9]{0,15}$' or length(coalesce(r->>'title',''))>300 or r->>'date' is distinct from to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD') then raise exception 'Invalid item';end if;
  if jsonb_typeof(r->'views') is distinct from 'number' or jsonb_typeof(r->'contacts') is distinct from 'number' then continue;end if;
  if (r->>'views')!~'^[0-9]+$' or (r->>'contacts')!~'^[0-9]+$' then raise exception 'Invalid counters';end if;
  select * into prev from public.avito_guard_samples where settings_id=p_id and item_id=r->>'id' order by observed_at desc limit 1;
  if prev.metric_date=(r->>'date')::date and prev.views<=(r->>'views')::bigint and prev.contacts<=(r->>'contacts')::bigint then
   for w in select value::integer from jsonb_array_elements_text(c->'rules'->'windowsMinutes') order by value::integer loop
    select * into b from public.avito_guard_samples where settings_id=p_id and item_id=r->>'id' and metric_date=(r->>'date')::date and observed_at>=now()-make_interval(mins=>w) order by observed_at limit 1;
    if b.item_id is null then continue;end if;
    dv:=(r->>'views')::bigint-b.views;dc:=(r->>'contacts')::bigint-b.contacts;
    if dv<(c->'rules'->>'warningViews')::integer or dc<0 or (c->'rules'->>'noContacts')::boolean and dc<>0 then continue;end if;
    sev:=case when dv>=(c->'rules'->>'quarantineViews')::integer then 'quarantine' else 'warning' end;
    if not exists(select 1 from public.avito_guard_events where settings_id=p_id and item_id=r->>'id' and created_at>now()-make_interval(mins=>cool) and (severity='quarantine' or severity=sev)) then
     insert into public.avito_guard_events(organization_id,settings_id,item_id,title,item_url,severity,views_delta,contacts_delta,window_minutes,batched)
     values((c->>'organization_id')::uuid,p_id,r->>'id',coalesce(r->>'title',''),case when r->>'url'~'^https://([a-z0-9-]+\.)?avito\.ru/' then r->>'url' else null end,sev,dv,dc,w,(r->>'views')::bigint-prev.views>=(c->'rules'->>'quarantineViews')::integer);
    end if;exit;
   end loop;
  end if;
  insert into public.avito_guard_samples(settings_id,item_id,metric_date,views,contacts) values(p_id,r->>'id',(r->>'date')::date,(r->>'views')::bigint,(r->>'contacts')::bigint) on conflict do nothing;counted:=counted+1;
 end loop;
 update public.avito_guard_runtime set page=case when p_more then least(1011,page+1) else 1 end,next_at=now()+case when p_more then interval '5 seconds' else interval '60 seconds' end,
  last_success_at=now(),last_error=p_error,sampled_items=sampled_items+counted,cycle_items=case when p_more then cycle_items+jsonb_array_length(p_rows) else 0 end,
  cycle_completed_at=case when p_more then cycle_completed_at else now() end,lease=null,lease_until=null where settings_id=p_id and lease=p_lease;
 delete from public.avito_guard_samples where (settings_id,item_id,observed_at) in(select settings_id,item_id,observed_at from public.avito_guard_samples where observed_at<now()-interval '2 hours' limit 10000);
 delete from public.avito_guard_events where id in(select id from public.avito_guard_events where created_at<now()-interval '90 days' limit 1000);
 return true;
end $$;
create function public.avito_guard_failed(p_id uuid,p_lease uuid,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin if p_error!~'^[a-z_]{1,80}$' then return false;end if;update public.avito_guard_runtime set last_error=p_error,next_at=now()+interval '60 seconds',lease=null,lease_until=null where settings_id=p_id and lease=p_lease;return found;end $$;
revoke all on function public.avito_guard_save(uuid,text,uuid,bigint,boolean,jsonb),public.avito_guard_dashboard(uuid) from public,anon;
grant execute on function public.avito_guard_save(uuid,text,uuid,bigint,boolean,jsonb),public.avito_guard_dashboard(uuid) to authenticated;
revoke all on function public.avito_guard_claim(),public.avito_guard_validate(uuid,uuid),public.avito_guard_rotate(uuid,uuid,text,text),public.avito_guard_record(uuid,uuid,bigint,jsonb,boolean,text),public.avito_guard_failed(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.avito_guard_claim(),public.avito_guard_validate(uuid,uuid),public.avito_guard_rotate(uuid,uuid,text,text),public.avito_guard_record(uuid,uuid,bigint,jsonb,boolean,text),public.avito_guard_failed(uuid,uuid,text) to service_role;


create function public.avito_guard_tick() returns bigint
language plpgsql security invoker set search_path='' as $$
declare ts text;nonce text;secret text;result bigint;
begin
 if not exists(select 1 from public.avito_guard_settings s left join public.avito_guard_runtime r on r.settings_id=s.id
  where s.enabled and (r.next_at is null or r.next_at<=now()) and (r.lease_until is null or r.lease_until<now())) then return null;end if;
 ts:=floor(extract(epoch from clock_timestamp()))::bigint::text;nonce:=gen_random_uuid()::text;secret:=public.avito_bid_worker_key();
 select net.http_post(url:='https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-protection-worker',
  headers:=jsonb_build_object('Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlleHJuYnZpbW5uYmVicnZma2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTM2NjMsImV4cCI6MjA5NzM2OTY2M30.0mgPfQdtYuQcMcnFbjQK2bdDU_zbxPIjN5wTSLEpo3w','x-bid-time',ts,'x-bid-nonce',nonce,
   'x-bid-signature',encode(extensions.hmac(ts||'|'||nonce,secret,'sha256'),'hex')),
  body:='{}'::jsonb,timeout_milliseconds:=120000) into result;
 return result;
end $$;
revoke all on function public.avito_guard_tick() from public,anon,authenticated;
grant execute on function public.avito_guard_tick() to service_role;
select cron.schedule('avito-protection-observer','5 seconds','select public.avito_guard_tick();');
