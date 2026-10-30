begin;
create table public.agency_ads_daily (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 avito_user_id text not null check(avito_user_id ~ '^[1-9][0-9]{0,24}$'),
 metric_date date not null, metrics jsonb not null check(jsonb_typeof(metrics)='object' and octet_length(metrics::text)<4096),
 fetched_at timestamptz not null, primary key(organization_id,avito_user_id,metric_date)
);
create table public.agency_ads_months (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 month date not null check(extract(day from month)=1), sources jsonb not null,
 saved_at timestamptz not null default now(), primary key(organization_id,month)
);
create table public.agency_ads_history_limits(organization_id uuid not null,avito_user_id text not null,attempted_at timestamptz not null,primary key(organization_id,avito_user_id));
alter table public.agency_ads_history_limits enable row level security;
revoke all on public.agency_ads_history_limits from public,anon,authenticated;
create function public.agency_ads_history_reserve(p_org uuid,p_actor uuid,p_account text) returns boolean language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then return false;end if;
 insert into public.agency_ads_history_limits as old values(p_org,p_account,now()) on conflict(organization_id,avito_user_id) do update set attempted_at=excluded.attempted_at where old.attempted_at<now()-interval '65 seconds' returning true into allowed;
 return coalesce(allowed,false);
end $$;
revoke all on function public.agency_ads_history_reserve(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_ads_history_reserve(uuid,uuid,text) to service_role;
alter table public.agency_ads_daily enable row level security;
alter table public.agency_ads_months enable row level security;
revoke all on public.agency_ads_daily,public.agency_ads_months from public,anon,authenticated;
grant select on public.agency_ads_daily to service_role;
create function public.agency_ads_store_days(p_organization_id uuid,p_avito_user_id text,p_days jsonb,p_fetched_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare d jsonb; clean jsonb; day date;
begin
 if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days)>93 or p_fetched_at is null or p_fetched_at>now()+interval '1 minute' then raise exception 'Invalid ADS days';end if;
 if not exists(select 1 from public.avito_personal_accounts where organization_id=p_organization_id and avito_user_id=p_avito_user_id and status='connected' union all select 1 from public.avito_connections where organization_id=p_organization_id and avito_user_id=p_avito_user_id and status='connected') then return false;end if;
 for d in select value from jsonb_array_elements(p_days) loop
  if coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid ADS date';end if;
  day:=(d->>'date')::date;if day>(now() at time zone 'Europe/Moscow')::date then raise exception 'Future ADS date';end if;
  clean:=public._agency_ads_metrics(d)-'date';
  clean:=(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(clean) where key in ('views','contacts','contactsShowPhone','contactsMessenger','favorites','spending') and jsonb_typeof(value)='number' and (value#>>'{}')::numeric between 0 and 9007199254740991);
  if clean='{}'::jsonb then continue;end if;
  insert into public.agency_ads_daily as old values(p_organization_id,p_avito_user_id,day,clean,p_fetched_at)
  on conflict(organization_id,avito_user_id,metric_date) do update set metrics=old.metrics||excluded.metrics,fetched_at=excluded.fetched_at where old.fetched_at<=excluded.fetched_at;
 end loop;return true;
end $$;
revoke all on function public.agency_ads_store_days(uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.agency_ads_store_days(uuid,text,jsonb,timestamptz) to service_role;
create function public.agency_ads_capture_cache() returns trigger language plpgsql security definer set search_path='' as $$
declare aid text;
begin
 select avito_user_id into aid from (select avito_user_id from public.avito_personal_accounts where new.module='personal' and organization_id=new.organization_id and id=new.account_id union all select avito_user_id from public.avito_connections where new.module='oauth' and organization_id=new.organization_id and id=new.account_id) a;
 if aid is not null and new.overview#>>'{history,available}'='true' and jsonb_typeof(new.overview#>'{history,days}')='array' then perform public.agency_ads_store_days(new.organization_id,aid,new.overview#>'{history,days}',new.snapshot_started_at);end if;
 perform public.agency_ads_capture_month(new.organization_id,(date_trunc('month',new.metric_date)-interval '1 month')::date);return new;
end $$;
revoke all on function public.agency_ads_capture_cache() from public,anon,authenticated;
create trigger agency_ads_capture_metrics after insert or update on public.avito_account_metric_cache for each row execute function public.agency_ads_capture_cache();
create function public.agency_ads_capture_month(p_org uuid,p_month date) returns void language plpgsql security definer set search_path='' as $$
declare ym text:=to_char(p_month,'YYYY-MM');g jsonb;s jsonb;c jsonb;sc jsonb;
begin
 if p_month>=date_trunc('month',now() at time zone 'Europe/Moscow')::date or extract(day from p_month)<>1 then return;end if;
 if exists(select 1 from public.agency_ads_months where organization_id=p_org and month=p_month) then return;end if;
 g:=public._agency_ads_source(p_org,'avitolog_goals_v1',array[ym],'goals');s:=public._agency_ads_source(p_org,'avitolog_goals_v1_sasha',array[ym],'goals');
 c:=public._agency_ads_source(p_org,'avitolog_assets_my_v2',array[ym],'cash');sc:=public._agency_ads_source(p_org,'avitolog_assets_sasha_v2',array[ym],'cash');
 insert into public.agency_ads_months values(p_org,p_month,jsonb_build_object('goals',coalesce(g#>array['months',ym],g->'live'),'sashaGoals',coalesce(s#>array['months',ym],s->'live'),'cash',coalesce(c#>array['months',ym],c->'live'),'sashaCash',coalesce(sc#>array['months',ym],sc->'live')),now()) on conflict do nothing;
end $$;
revoke all on function public.agency_ads_capture_month(uuid,date) from public,anon,authenticated;
create function public.read_agency_ads_period(p_organization_id uuid,p_date_from date,p_date_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb;ms text[];g jsonb;c jsonb;sg jsonb;sc jsonb;ym text;frozen jsonb;stats jsonb;first_month date;
begin
 base:=public.read_agency_ads(p_organization_id);
 if p_date_from is null or p_date_to is null or p_date_from>p_date_to or p_date_to-p_date_from>92 or p_date_to>(now() at time zone 'Europe/Moscow')::date or p_date_from<'2000-01-01'::date then raise exception 'Invalid ADS period' using errcode='22023';end if;
 select array_agg(distinct to_char(d,'YYYY-MM')) into ms from generate_series(p_date_from,p_date_to,interval '1 day') d;
 g:=public._agency_ads_source(p_organization_id,'avitolog_goals_v1',ms,'goals');sg:=public._agency_ads_source(p_organization_id,'avitolog_goals_v1_sasha',ms,'goals');c:=public._agency_ads_source(p_organization_id,'avitolog_assets_my_v2',ms,'cash');sc:=public._agency_ads_source(p_organization_id,'avitolog_assets_sasha_v2',ms,'cash');
 foreach ym in array ms loop
  first_month:=(ym||'-01')::date;perform public.agency_ads_capture_month(p_organization_id,first_month);
  select sources into frozen from public.agency_ads_months where organization_id=p_organization_id and month=first_month;
  if frozen is not null then g:=jsonb_set(g,array['months',ym],frozen->'goals');sg:=jsonb_set(sg,array['months',ym],frozen->'sashaGoals');c:=jsonb_set(c,array['months',ym],frozen->'cash');sc:=jsonb_set(sc,array['months',ym],frozen->'sashaCash');end if;
 end loop;
 if p_date_to<date_trunc('month',now() at time zone 'Europe/Moscow')::date then g:=g||'{"live":null}';sg:=sg||'{"live":null}';c:=c||'{"live":null}';sc:=sc||'{"live":null}';end if;
 select coalesce(jsonb_agg(jsonb_build_object('avitoUserId',a->>'avitoUserId','name',a->>'name','today',jsonb_build_object('available',false,'date',p_date_to),'history',jsonb_build_object('available',true,'dateFrom',p_date_from,'dateTo',p_date_to,'days',(
  select jsonb_agg(jsonb_build_object('date',to_char(d,'YYYY-MM-DD'))||coalesce(v.metrics,'{}'::jsonb) order by d) from generate_series(p_date_from,p_date_to,interval '1 day') d left join public.agency_ads_daily v on v.organization_id=p_organization_id and v.avito_user_id=(a->>'avitoUserId') and v.metric_date=d::date
 )))),'[]'::jsonb) into stats from jsonb_array_elements(base->'accounts') a;
 return base||jsonb_build_object('date',p_date_to,'dateFrom',p_date_from,'dateTo',p_date_to,'goals',g,'cash',c||jsonb_build_object('sasha',sc),'sellerGoals',jsonb_build_object('fil',g,'sasha',sg),'statistics',stats,'archiveMonths',(select coalesce(jsonb_agg(to_char(month,'YYYY-MM') order by month desc),'[]'::jsonb) from public.agency_ads_months where organization_id=p_organization_id));
end $$;
revoke all on function public.read_agency_ads_period(uuid,date,date) from public,anon,authenticated;
grant execute on function public.read_agency_ads_period(uuid,date,date) to authenticated;
do $$ declare r record; aid text;begin for r in select * from public.avito_account_metric_cache loop
 select avito_user_id into aid from (select avito_user_id from public.avito_personal_accounts where r.module='personal' and organization_id=r.organization_id and id=r.account_id union all select avito_user_id from public.avito_connections where r.module='oauth' and organization_id=r.organization_id and id=r.account_id) a;
 if aid is not null and r.overview#>>'{history,available}'='true' then perform public.agency_ads_store_days(r.organization_id,aid,r.overview#>'{history,days}',r.snapshot_started_at);end if;
end loop;end $$;
commit;
