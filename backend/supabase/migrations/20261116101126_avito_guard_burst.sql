alter table public.avito_guard_today_items add column pricing jsonb,add column pricing_observed_at timestamptz;
alter table public.avito_guard_events add column trigger_kind text not null default 'item_growth' check(trigger_kind in('item_growth','multi_item_growth')),
 add column cohort_id uuid,add column cohort_started_at timestamptz,add column cohort_size integer;
create table avito_guard_private.spread_candidates (
 settings_id uuid not null references public.avito_guard_settings(id),item_id text not null,
 metric_date date not null,baseline_at timestamptz not null,detected_at timestamptz not null default now(),last_at timestamptz not null default now(),
 views_delta bigint not null check(views_delta>0),contacts_delta bigint not null check(contacts_delta>=0),cohort_id uuid,
 primary key(settings_id,item_id)
);
alter table avito_guard_private.spread_candidates enable row level security;
revoke all on avito_guard_private.spread_candidates from public,anon,authenticated;
grant all on avito_guard_private.spread_candidates to service_role;

create function public.avito_guard_spread(p_id uuid,p_rules jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare n integer;g uuid;started timestamptz;w integer:=(p_rules->>'spreadWindowMinutes')::integer;org uuid;
begin
 select organization_id into org from public.avito_guard_settings where id=p_id and enabled;
 if org is null or not coalesce((p_rules->>'spreadTrigger')::boolean,false) then return;end if;
 delete from avito_guard_private.spread_candidates where settings_id=p_id and (detected_at<now()-make_interval(mins=>w) or metric_date<>(now() at time zone 'Europe/Moscow')::date);
 select count(*),min(baseline_at) into n,started from avito_guard_private.spread_candidates where settings_id=p_id;
 if n<(p_rules->>'spreadMinItems')::integer then return;end if;
 select cohort_id into g from avito_guard_private.spread_candidates where settings_id=p_id and cohort_id is not null order by detected_at limit 1;
 g:=coalesce(g,gen_random_uuid());
 update avito_guard_private.spread_candidates set cohort_id=g where settings_id=p_id;
 insert into public.avito_guard_events(organization_id,settings_id,item_id,title,item_url,severity,views_delta,contacts_delta,window_minutes,batched,trigger_kind,cohort_id,cohort_started_at,cohort_size)
 select org,p_id,x.item_id,t.title,t.item_url,'quarantine',x.views_delta,x.contacts_delta,w,true,'multi_item_growth',g,started,n
 from avito_guard_private.spread_candidates x join public.avito_guard_today_items t on t.settings_id=x.settings_id and t.item_id=x.item_id and t.metric_date=x.metric_date
 where x.settings_id=p_id and not exists(select 1 from public.avito_guard_events e where e.settings_id=p_id and e.item_id=x.item_id and e.severity='quarantine' and e.created_at>now()-make_interval(mins=>(p_rules->>'cooldownMinutes')::integer));
 update public.avito_guard_events set cohort_size=n where settings_id=p_id and cohort_id=g and cohort_size<n;
end $$;
revoke all on function public.avito_guard_spread(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.avito_guard_spread(uuid,jsonb) to service_role;

alter table public.avito_guard_cloud add column last_upload_attempt_at timestamptz;
alter table public.avito_guard_cloud_batches add column upload_state text not null default 'scheduled' check(upload_state in('scheduled','pending','sending','requested','rate_limited','unknown','blocked','superseded')),
 add column upload_at timestamptz,add column upload_after timestamptz,add column upload_error text;

create function public.avito_guard_cloud_upload(p_id uuid,p_lease uuid,p_revision bigint,p_batch uuid,p_state text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.avito_guard_cloud;
begin
 perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);
 select * into c from public.avito_guard_cloud where settings_id=p_id for update;
 if p_state='sending' then
  if not c.auto_edit or not exists(select 1 from public.avito_guard_settings where id=p_id and enabled and coalesce((rules->>'uploadNow')::boolean,false)) then return false;end if;
  if exists(select 1 from public.avito_guard_cloud_batches where settings_id=p_id and state in('prepared','publishing')) then return false;end if;
  if c.last_upload_attempt_at>now()-interval '1 hour' then
   update public.avito_guard_cloud_batches set upload_state='rate_limited',upload_after=c.last_upload_attempt_at+interval '1 hour',upload_error='autoload_hourly_limit' where id=p_batch and settings_id=p_id and upload_state in('pending','rate_limited');return false;
  end if;
  update public.avito_guard_cloud_batches set upload_state='sending',upload_at=now(),upload_after=null,upload_error=null where id=p_batch and settings_id=p_id and state='applied' and upload_state in('pending','rate_limited') and (upload_after is null or upload_after<=now());
  if not found then return false;end if;
  update public.avito_guard_cloud_batches set upload_state='superseded' where settings_id=p_id and id<>p_batch and state='applied' and upload_state in('pending','rate_limited') and created_at<(select created_at from public.avito_guard_cloud_batches where id=p_batch);
  update public.avito_guard_cloud set last_upload_attempt_at=now() where settings_id=p_id;return true;
 end if;
 if p_state not in('requested','rate_limited','unknown','blocked') then raise exception 'Invalid upload state';end if;
 update public.avito_guard_cloud_batches set upload_state=p_state,upload_after=case when p_state='rate_limited' then now()+interval '1 hour' end,
  upload_error=case p_state when 'unknown' then 'autoload_upload_unconfirmed' when 'blocked' then 'autoload_upload_rejected' when 'rate_limited' then 'autoload_hourly_limit' end
 where id=p_batch and settings_id=p_id and upload_state='sending';return found;
end $$;
revoke all on function public.avito_guard_cloud_upload(uuid,uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.avito_guard_cloud_upload(uuid,uuid,bigint,uuid,text) to service_role;

create or replace function public.avito_guard_save(p_org uuid,p_module text,p_account uuid,p_revision bigint,p_enabled boolean,p_rules jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.avito_guard_settings; n jsonb;
begin
 if not public.has_org_role(p_org,array['owner','admin']::public.organization_role[]) or auth.uid() is null then raise exception 'Permission denied' using errcode='42501';end if;
 if jsonb_typeof(p_rules)='object' then p_rules:='{"spreadTrigger":true,"spreadMinItems":5,"spreadWindowMinutes":5,"uploadNow":false}'::jsonb||p_rules;end if;
 if jsonb_typeof(p_rules) is distinct from 'object' or octet_length(p_rules::text)>8192 or p_rules->>'mode' is distinct from 'monitor' or
  (select count(*) from jsonb_object_keys(p_rules))<>13 or not p_rules ?& array['warningViews','quarantineViews','windowsMinutes','noContacts','batchedTrigger','cooldownMinutes','pauseAutoload','titles','mode','spreadTrigger','spreadMinItems','spreadWindowMinutes','uploadNow'] then raise exception 'Invalid rules' using errcode='22023';end if;
 if (p_rules->>'warningViews')!~'^[0-9]+$' or (p_rules->>'quarantineViews')!~'^[0-9]+$' or (p_rules->>'cooldownMinutes')!~'^[0-9]+$' or
  (p_rules->>'warningViews')::integer not between 1 and 1440 or (p_rules->>'quarantineViews')::integer not between (p_rules->>'warningViews')::integer and 1440 or (p_rules->>'cooldownMinutes')::integer not between 1 and 1440 then raise exception 'Invalid thresholds' using errcode='22023';end if;
 foreach n in array array[p_rules->'noContacts',p_rules->'batchedTrigger',p_rules->'pauseAutoload',p_rules->'spreadTrigger',p_rules->'uploadNow'] loop if jsonb_typeof(n) is distinct from 'boolean' then raise exception 'Invalid flag';end if;end loop;
 if jsonb_typeof(p_rules->'windowsMinutes') is distinct from 'array' or jsonb_array_length(p_rules->'windowsMinutes') not between 1 and 6 or jsonb_typeof(p_rules->'titles') is distinct from 'array' or jsonb_array_length(p_rules->'titles')>20 then raise exception 'Invalid arrays';end if;
 for n in select value from jsonb_array_elements(p_rules->'windowsMinutes') loop if n::text!~'^[0-9]+$' or (n::text)::integer not between 1 and 60 then raise exception 'Invalid window';end if;end loop;
 for n in select value from jsonb_array_elements(p_rules->'titles') loop if jsonb_typeof(n)<>'string' or length(btrim(n#>>'{}')) not between 1 and 50 or (n#>>'{}')~'[[:cntrl:]]' then raise exception 'Invalid title';end if;end loop;
 if coalesce(p_rules->>'spreadMinItems','')!~'^[0-9]{1,3}$' or coalesce(p_rules->>'spreadWindowMinutes','')!~'^[0-9]{1,2}$' then raise exception 'Invalid spread rule';end if;
 if (p_rules->>'spreadMinItems')::integer not between 2 and 100 or (p_rules->>'spreadWindowMinutes')::integer not between 1 and 30 then raise exception 'Invalid spread rule';end if;
 if p_revision=-1 then insert into public.avito_guard_settings(organization_id,module,account_id,actor_id,enabled,rules) values(p_org,p_module,p_account,auth.uid(),p_enabled,p_rules) returning * into saved;
 else update public.avito_guard_settings set enabled=p_enabled,rules=p_rules,revision=revision+1,actor_id=auth.uid(),updated_at=now() where organization_id=p_org and module=p_module and account_id=p_account and revision=p_revision returning * into saved;end if;
 if not found then raise exception 'Revision conflict' using errcode='40001';end if;return to_jsonb(saved);
end $$;


create or replace function public.avito_guard_record(p_id uuid,p_lease uuid,p_revision bigint,p_rows jsonb,p_more boolean,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare c jsonb;r jsonb;b public.avito_guard_samples;prev public.avito_guard_samples;w integer;dv bigint;dc bigint;sev text;cool integer;counted integer:=0; spread integer:=coalesce((select (rules->>'spreadWindowMinutes')::integer from public.avito_guard_settings where id=p_id),5);
begin
 c:=public.avito_guard_validate(p_id,p_lease);if (c->>'revision')::bigint<>p_revision then raise exception 'Rules changed' using errcode='40001';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>99 or octet_length(p_rows::text)>131072 or p_error is not null and p_error!~'^[a-z_]{1,80}$' then raise exception 'Invalid samples';end if;
 cool:=(c->'rules'->>'cooldownMinutes')::integer;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'id','')!~'^[1-9][0-9]{0,15}$' or length(coalesce(r->>'title',''))>300 or r->>'date' is distinct from to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD') then raise exception 'Invalid item';end if;
  if exists(select 1 from jsonb_each(r) e where e.key in('views','contacts') and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'number' or e.value::text!~'^[0-9]+$' or length(e.value::text)>16)) then raise exception 'Invalid counters';end if;
  if r?'pricing' and (jsonb_typeof(r->'pricing') is distinct from 'object' or coalesce(r->'pricing'->>'mode','') not in('manual','auto','base') or coalesce(r->'pricing'->>'action_type_id','')!~'^[1-9][0-9]{0,8}$' or r->'pricing'->>'mode'='manual' and (coalesce(r->'pricing'->>'bid_penny','')!~'^[0-9]{1,12}$' or (r->'pricing'->>'bid_penny')::bigint>100000000000)) then raise exception 'Invalid pricing';end if;
  insert into public.avito_guard_today_items as t(settings_id,organization_id,item_id,title,item_url,metric_date,views,contacts,views_observed_at,contacts_observed_at)
  values(p_id,(c->>'organization_id')::uuid,r->>'id',coalesce(r->>'title',''),case when r->>'url'~'^https://([a-z0-9-]+\.)?avito\.ru/' then r->>'url' else null end,(r->>'date')::date,(r->>'views')::bigint,(r->>'contacts')::bigint,case when r->>'views' is not null then now() end,case when r->>'contacts' is not null then now() end)
  on conflict(settings_id,item_id) do update set title=excluded.title,item_url=excluded.item_url,metric_date=excluded.metric_date,observed_at=now(),
   views=coalesce(excluded.views,case when t.metric_date=excluded.metric_date then t.views end),contacts=coalesce(excluded.contacts,case when t.metric_date=excluded.metric_date then t.contacts end),
   views_observed_at=coalesce(excluded.views_observed_at,case when t.metric_date=excluded.metric_date then t.views_observed_at end),contacts_observed_at=coalesce(excluded.contacts_observed_at,case when t.metric_date=excluded.metric_date then t.contacts_observed_at end);
  if r?'pricing' then update public.avito_guard_today_items set pricing=r->'pricing',pricing_observed_at=now() where settings_id=p_id and item_id=r->>'id';end if;
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
  if coalesce((c->'rules'->>'spreadTrigger')::boolean,false) then
   select * into b from public.avito_guard_samples where settings_id=p_id and item_id=r->>'id' and metric_date=(r->>'date')::date and observed_at>=now()-make_interval(mins=>spread) order by observed_at limit 1;
   if b.item_id is not null and prev.metric_date=b.metric_date and (r->>'views')::bigint>b.views and (r->>'views')::bigint>=prev.views and (r->>'contacts')::bigint>=prev.contacts and (r->>'contacts')::bigint>=b.contacts and (not (c->'rules'->>'noContacts')::boolean or (r->>'contacts')::bigint=b.contacts) then
    insert into avito_guard_private.spread_candidates as x(settings_id,item_id,metric_date,baseline_at,views_delta,contacts_delta)
    values(p_id,r->>'id',(r->>'date')::date,b.observed_at,(r->>'views')::bigint-b.views,(r->>'contacts')::bigint-b.contacts)
    on conflict(settings_id,item_id) do update set metric_date=excluded.metric_date,baseline_at=excluded.baseline_at,last_at=now(),views_delta=excluded.views_delta,contacts_delta=excluded.contacts_delta,
     detected_at=case when x.detected_at<now()-make_interval(mins=>spread) or x.metric_date<>excluded.metric_date then now() else x.detected_at end,
     cohort_id=case when x.detected_at<now()-make_interval(mins=>spread) or x.metric_date<>excluded.metric_date then null else x.cohort_id end;
   else delete from avito_guard_private.spread_candidates where settings_id=p_id and item_id=r->>'id';end if;
  end if;
  insert into public.avito_guard_samples(settings_id,item_id,metric_date,views,contacts) values(p_id,r->>'id',(r->>'date')::date,(r->>'views')::bigint,(r->>'contacts')::bigint) on conflict do nothing;counted:=counted+1;
 end loop;
 if coalesce((c->'rules'->>'spreadTrigger')::boolean,false) then perform public.avito_guard_spread(p_id,c->'rules');end if;
 update public.avito_guard_runtime set page=case when p_more then least(1011,page+1) else 1 end,next_at=now()+case when p_more then interval '5 seconds' else interval '60 seconds' end,
  last_success_at=now(),last_error=p_error,sampled_items=sampled_items+counted,cycle_items=case when p_more then cycle_items+jsonb_array_length(p_rows) else 0 end,
  cycle_completed_at=case when p_more then cycle_completed_at else now() end,lease=null,lease_until=null where settings_id=p_id and lease=p_lease;
 delete from public.avito_guard_samples where (settings_id,item_id,observed_at) in(select settings_id,item_id,observed_at from public.avito_guard_samples where observed_at<now()-interval '2 hours' limit 10000);
 delete from public.avito_guard_events where id in(select id from public.avito_guard_events where created_at<now()-interval '90 days' limit 1000);
 delete from public.avito_guard_today_items where (settings_id,item_id) in(select settings_id,item_id from public.avito_guard_today_items where metric_date<(now() at time zone 'Europe/Moscow')::date-1 limit 10000);
 return true;
end $$;

create or replace function public.avito_guard_today(p_id uuid,p_after text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.avito_guard_settings;d date:=(now() at time zone 'Europe/Moscow')::date;items jsonb;cursor text;summary jsonb;
begin
 select * into s from public.avito_guard_settings where id=p_id;
 if s.id is null or auth.uid() is null or not public.has_org_role(s.organization_id,array['owner','admin']::public.organization_role[]) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_after is not null and p_after!~'^[1-9][0-9]{0,15}$' then raise exception 'Invalid cursor' using errcode='22023';end if;
 select jsonb_build_object('checked',count(*),'known_views',count(views),'with_views',count(*) filter(where views>0),'views',coalesce(sum(views),0)::text,'last_scan_at',max(observed_at),'last_views_at',max(views_observed_at)) into summary
 from public.avito_guard_today_items where settings_id=p_id and metric_date=d;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.item_id),'[]'::jsonb) into items from (
  select item_id,title,item_url,views,contacts,observed_at,views_observed_at,contacts_observed_at,pricing,pricing_observed_at,(select to_jsonb(e) from public.avito_guard_events e where e.settings_id=today.settings_id and e.item_id=today.item_id and (e.created_at at time zone 'Europe/Moscow')::date=d order by (e.severity='quarantine') desc,e.created_at desc limit 1) as signal from public.avito_guard_today_items today
  where settings_id=p_id and metric_date=d and views>0 and (p_after is null or item_id>p_after) order by item_id limit 500
 ) t;
 if jsonb_array_length(items)=500 and exists(select 1 from public.avito_guard_today_items where settings_id=p_id and metric_date=d and views>0 and item_id>(items->499->>'item_id')) then cursor:=items->499->>'item_id';end if;
 return jsonb_build_object('date',d,'summary',summary,'items',items,'next_cursor',cursor);
end $$;
revoke all on function public.avito_guard_today(uuid,text) from public,anon;
grant execute on function public.avito_guard_today(uuid,text) to authenticated;


create or replace function public.avito_guard_cloud_claim(p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.avito_guard_cloud;s public.avito_guard_settings;k jsonb;version text;
begin
 select * into c from public.avito_guard_cloud where (p_id is not null and settings_id=p_id or p_id is null and has_credentials and next_cleanup_at<=now()) and (lease_until is null or lease_until<now()) order by next_cleanup_at for update skip locked limit 1;
 if c.settings_id is null then return null;end if;
 select * into s from public.avito_guard_settings where id=c.settings_id;
 begin version:=public.avito_bidding_account_version(s.module,s.organization_id,s.account_id,s.actor_id);exception when others then update public.avito_guard_cloud set last_error='account_access_changed',next_cleanup_at=now()+interval '5 minutes' where settings_id=c.settings_id;return null;end;
 update public.avito_guard_cloud_batches set upload_state='unknown',upload_error='autoload_upload_unconfirmed' where settings_id=c.settings_id and upload_state='sending' and upload_at<now()-interval '2 minutes';
 k:=avito_guard_private.cloud_keys(c.settings_id);
 if k is not null and (k->>'organization_id')::uuid<>c.organization_id then raise exception 'Invalid key binding';end if;
 update public.avito_guard_cloud set lease=gen_random_uuid(),lease_until=now()+interval '120 seconds',credential_version=version where settings_id=c.settings_id returning * into c;
 return jsonb_build_object('config',to_jsonb(c),'keys',k,'rules',s.rules,'enabled',s.enabled,
 'delivery',(select to_jsonb(b) from public.avito_guard_cloud_batches b where b.settings_id=c.settings_id and b.state='applied' and b.upload_state in('pending','rate_limited') and (b.upload_after is null or b.upload_after<=now()) order by b.created_at desc limit 1),
 'pending',(select to_jsonb(b) from public.avito_guard_cloud_batches b where b.settings_id=c.settings_id and state in('prepared','publishing') limit 1),
 'events',coalesce((select jsonb_agg(e) from(select id,item_id,title from public.avito_guard_events e where e.settings_id=c.settings_id and e.severity='quarantine' and e.created_at>now()-interval '1 hour' and not exists(select 1 from public.avito_guard_cloud_actions a where a.event_id=e.id) order by e.created_at limit 20)e),'[]'::jsonb),
 'expired',coalesce((select jsonb_agg(v) from(select id,object_key from public.avito_guard_cloud_versions where settings_id=c.settings_id and deleted_at is null and created_at<now()-make_interval(hours=>c.retention_hours) order by created_at limit 20)v),'[]'::jsonb));
end $$;

create or replace function public.avito_guard_cloud_batch(p_id uuid,p_lease uuid,p_revision bigint,p_batch uuid,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);if p_state not in('publishing','applied','conflict','review') then raise exception 'Invalid state';end if;
 update public.avito_guard_cloud_batches set state=p_state,updated_at=now(),upload_state=case when p_state='applied' and exists(select 1 from public.avito_guard_settings s where s.id=p_id and coalesce((s.rules->>'uploadNow')::boolean,false)) then 'pending' else upload_state end where id=p_batch and settings_id=p_id and state in('prepared','publishing');
 if not found then raise exception 'Batch changed';end if;
 if p_state='applied' then update public.avito_guard_cloud set last_published_at=now() where settings_id=p_id;end if;return true;end $$;

create or replace function public.avito_guard_cloud_dashboard(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('connections',coalesce((select jsonb_agg(to_jsonb(c)-array['lease','lease_until','credential_version']) from public.avito_guard_cloud c where organization_id=p_org),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(v) from(select id,settings_id,created_at,deleted_at,bytes from public.avito_guard_cloud_versions where organization_id=p_org order by created_at desc limit 100)v),'[]'::jsonb),
 'batches',coalesce((select jsonb_agg(b) from(select id,settings_id,state,changes,created_at,updated_at,upload_state,upload_at,upload_after,upload_error from public.avito_guard_cloud_batches where organization_id=p_org order by created_at desc limit 100)b),'[]'::jsonb))
 where public.has_org_role(p_org,array['owner','admin']::public.organization_role[])
$$;
