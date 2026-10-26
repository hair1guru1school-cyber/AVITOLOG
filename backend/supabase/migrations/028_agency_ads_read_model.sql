begin;

create table public.agency_ads_view_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  selected_account_ids jsonb not null,
  source_map jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.agency_ads_view_settings enable row level security;
revoke all on public.agency_ads_view_settings from public,anon,authenticated;

create function public._agency_ads_ref(p_value text,p_org uuid) returns text
language sql immutable set search_path='' as $$
  select case when nullif(btrim(p_value),'') is null then '' else md5(p_org::text||':'||p_value) end
$$;

create function public._agency_ads_goals(p_data jsonb,p_org uuid) returns jsonb
language sql immutable set search_path='' as $$
select case when jsonb_typeof(p_data)='object' then jsonb_build_object(
  'projects',coalesce((select jsonb_agg(jsonb_build_object(
    'id',public._agency_ads_ref(p->>'id',p_org),'name',left(coalesce(p->>'name',p->>'company',''),200),
    'stage',left(p->>'stage',30),'date',left(p->>'date',40),'createdAt',left(coalesce(p->>'createdAt',p->>'createdDate',p->>'created_at'),40),
    'sourceAccountId',left(coalesce(p->>'sourceAccountId',p->>'source_account_id',''),100),
    'soldFromId',public._agency_ads_ref(p->>'soldFromId',p_org),
    'workCopyOfWeekId',public._agency_ads_ref(p->>'workCopyOfWeekId',p_org),
    'archiveCopyOfWeekId',public._agency_ads_ref(p->>'archiveCopyOfWeekId',p_org),
    'crmClientId',public._agency_ads_ref(p->>'crmClientId',p_org),'folderId',public._agency_ads_ref(p->>'folderId',p_org),
    'crmClientRecordId',public._agency_ads_ref(p->>'crmClientRecordId',p_org),'client_id',public._agency_ads_ref(p->>'client_id',p_org),
    'paidDate',left(p->>'paidDate',40),'paidCycleId',public._agency_ads_ref(p->>'paidCycleId',p_org),
    'saleAmount',case when regexp_replace(p->>'saleAmount','[[:space:]]','','g') ~ '^[0-9]+([.,][0-9]+)?$' then left(p->>'saleAmount',100) else null end,
    'mainPrice',case when regexp_replace(p->>'mainPrice','[[:space:]]','','g') ~ '^[0-9]+([.,][0-9]+)?$' then left(p->>'mainPrice',100) else null end,
    'statusDates',jsonb_build_object('kp',left(p#>>'{statusDates,kp}',40),'kp_sent',left(p#>>'{statusDates,kp_sent}',40),'paid',left(p#>>'{statusDates,paid}',40))
  )) from (select value p from jsonb_array_elements(case when jsonb_typeof(p_data->'projects')='array' then p_data->'projects' else '[]'::jsonb end) limit 5000) x),'[]'::jsonb),
  'sourceAccounts',coalesce((select jsonb_agg(jsonb_build_object('id',left(a->>'id',100),'name',left(a->>'name',200),'icon',left(a->>'icon',32))) from jsonb_array_elements(case when jsonb_typeof(p_data->'sourceAccounts')='array' then p_data->'sourceAccounts' else '[]'::jsonb end) a),'[]'::jsonb),
  'deletedProjectIds',coalesce((select jsonb_agg(public._agency_ads_ref(a#>>'{}',p_org)) from jsonb_array_elements(case when jsonb_typeof(p_data->'deletedProjectIds')='array' then p_data->'deletedProjectIds' else '[]'::jsonb end) a),'[]'::jsonb)
) else null end
$$;

create function public._agency_ads_cash(p_data jsonb,p_org uuid) returns jsonb
language sql immutable set search_path='' as $$
select case when jsonb_typeof(p_data)='array' then coalesce((select jsonb_agg(jsonb_build_object(
  'goalProjectId',public._agency_ads_ref(p->>'goalProjectId',p_org),'crmClientId',public._agency_ads_ref(p->>'crmClientId',p_org),
  'paymentDate',left(p->>'paymentDate',40),
  'paid',case when regexp_replace(p->>'paid','[[:space:]]','','g') ~ '^[0-9]+([.,][0-9]+)?$' then left(p->>'paid',100) else null end,
  'aoaPercent',case when regexp_replace(p->>'aoaPercent','[[:space:]]','','g') ~ '^[0-9]+([.,][0-9]+)?$' then left(p->>'aoaPercent',100) else null end,
  'paymentHistory',coalesce((select jsonb_agg(jsonb_build_object('date',left(h->>'date',40),'amount',case when regexp_replace(h->>'amount','[[:space:]]','','g') ~ '^[0-9]+([.,][0-9]+)?$' then left(h->>'amount',100) else null end)) from (select value h from jsonb_array_elements(case when jsonb_typeof(p->'paymentHistory')='array' then p->'paymentHistory' else '[]'::jsonb end) limit 500) history),'[]'::jsonb)
)) from (select value p from jsonb_array_elements(p_data) limit 5000) rows),'[]'::jsonb) else null end
$$;

create function public._agency_ads_source(p_org uuid,p_base text,p_months text[],p_kind text) returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object(
 'live',(select case when p_kind='goals' then public._agency_ads_goals(value_text::jsonb,p_org) else public._agency_ads_cash(value_text::jsonb,p_org) end from public.frontend_state_records where organization_id=p_org and storage_key=p_base),
 'months',coalesce((select jsonb_object_agg(substring(storage_key from length(p_base)+8),case when p_kind='goals' then public._agency_ads_goals(value_text::jsonb,p_org) else public._agency_ads_cash(value_text::jsonb,p_org) end) from public.frontend_state_records where organization_id=p_org and storage_key=any(select p_base||'_month_'||m from unnest(p_months) m)),'{}'::jsonb)
)
$$;

create function public._agency_ads_metrics(p_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
select case when jsonb_typeof(p_data)='object' then
  coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_data) where
    (key in ('date','dateFrom','dateTo') and jsonb_typeof(value)='string' and length(value#>>'{}')=10)
    or (key='available' and jsonb_typeof(value)='boolean')
    or (key in ('views','contacts','contactsShowPhone','contactsMessenger','favorites','spending') and jsonb_typeof(value) in ('number','null'))),'{}'::jsonb)
  || case when jsonb_typeof(p_data->'days')='array' then jsonb_build_object('days',coalesce((select jsonb_agg(public._agency_ads_metrics(value-'days')) from (select value from jsonb_array_elements(p_data->'days') limit 31) days),'[]'::jsonb)) else '{}'::jsonb end
else null end
$$;

create function public.save_agency_ads_settings(p_organization_id uuid,p_selected jsonb,p_source_map jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Permission denied' using errcode='42501'; end if;
  if jsonb_typeof(p_selected) is distinct from 'array' or jsonb_array_length(p_selected)>200 or jsonb_typeof(p_source_map) is distinct from 'object' or octet_length(p_source_map::text)>64000 then raise exception 'Invalid ADS settings'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_selected) a where a !~ '^[1-9][0-9]{0,19}$' or not exists(select 1 from public.avito_personal_accounts where organization_id=p_organization_id and avito_user_id=a and status='connected' union all select 1 from public.avito_connections where organization_id=p_organization_id and avito_user_id=a and status='connected')) then raise exception 'Account is not available'; end if;
  if exists(select 1 from jsonb_each_text(p_source_map) m where length(m.key)>100 or m.key in ('__proto__','constructor') or m.value !~ '^[1-9][0-9]{0,19}$') then raise exception 'Invalid source mapping'; end if;
  insert into public.agency_ads_view_settings(organization_id,selected_account_ids,source_map) values(p_organization_id,p_selected,p_source_map)
  on conflict(organization_id) do update set selected_account_ids=excluded.selected_account_ids,source_map=excluded.source_map,updated_at=now();
  return true;
end;
$$;

create function public.read_agency_ads(p_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 today date := (now() at time zone 'Europe/Moscow')::date;
 months text[];
 goals jsonb; cash jsonb; sasha_goals jsonb; selected jsonb; mapping jsonb; accounts jsonb; stats jsonb; fetched_at timestamptz; member_role text;
begin
 select role::text into member_role from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin','manager');
 if auth.uid() is null or member_role is null then raise exception 'Permission denied' using errcode='42501'; end if;
 select array_agg(distinct to_char(d,'YYYY-MM')) into months from generate_series(today-29,today,interval '1 day') d;
 goals := public._agency_ads_source(p_organization_id,'avitolog_goals_v1',months,'goals');
 sasha_goals := public._agency_ads_source(p_organization_id,'avitolog_goals_v1_sasha',months,'goals');
 cash := public._agency_ads_source(p_organization_id,'avitolog_assets_my_v2',months,'cash') || jsonb_build_object('sasha',public._agency_ads_source(p_organization_id,'avitolog_assets_sasha_v2',months,'cash'));
 select selected_account_ids,source_map into selected,mapping from public.agency_ads_view_settings where organization_id=p_organization_id;
 if selected is null then
   select coalesce(jsonb_agg(distinct avito_user_id),'[]'::jsonb) into selected from (
    select avito_user_id,display_name from public.avito_personal_accounts where organization_id=p_organization_id and status='connected'
    union all select avito_user_id,display_name from public.avito_connections where organization_id=p_organization_id and status='connected'
   ) a where regexp_replace(lower(display_name),'[^a-zа-яё0-9]','','g') in ('филпродвижение','филproдвижение','filaiмаркетинг');
 end if;
 with available as (
  select 'personal'::text module,id,avito_user_id,display_name,credential_version::text credential_version from public.avito_personal_accounts where organization_id=p_organization_id and status='connected'
  union all select 'oauth',id,avito_user_id,display_name,credential_version::text from public.avito_connections where organization_id=p_organization_id and status='connected'
 ), chosen as (
  select distinct on(a.avito_user_id) a.avito_user_id,a.display_name,c.overview,c.snapshot_started_at
  from available a left join public.avito_account_metric_cache c on c.module=a.module and c.organization_id=p_organization_id and c.account_id=a.id and c.credential_version=a.credential_version and c.metric_date=today
  where selected ? a.avito_user_id order by a.avito_user_id,c.snapshot_started_at desc nulls last
 )
 select coalesce(jsonb_agg(jsonb_build_object('avitoUserId',avito_user_id,'name',display_name)),'[]'::jsonb),
        coalesce(jsonb_agg(jsonb_build_object('avitoUserId',avito_user_id,'name',display_name,'today',public._agency_ads_metrics(overview->'today'),'history',public._agency_ads_metrics(overview->'history'))),'[]'::jsonb),
        min((overview->>'fetched_at')::timestamptz)
 into accounts,stats,fetched_at from chosen;
 return jsonb_build_object('version',1,'organizationId',p_organization_id,'role',member_role,'date',today,'configured',exists(select 1 from public.agency_ads_view_settings where organization_id=p_organization_id),'goals',goals,'cash',cash,'sellerGoals',jsonb_build_object('fil',goals,'sasha',sasha_goals),'accounts',accounts,'statistics',stats,'selectedAccountIds',selected,'sourceMap',coalesce(mapping,'{}'::jsonb),'metricFetchedAt',fetched_at);
end;
$$;

revoke all on function public._agency_ads_ref(text,uuid),public._agency_ads_goals(jsonb,uuid),public._agency_ads_cash(jsonb,uuid),public._agency_ads_source(uuid,text,text[],text),public._agency_ads_metrics(jsonb),public.save_agency_ads_settings(uuid,jsonb,jsonb),public.read_agency_ads(uuid) from public,anon,authenticated;
grant execute on function public.read_agency_ads(uuid),public.save_agency_ads_settings(uuid,jsonb,jsonb) to authenticated;
commit;
