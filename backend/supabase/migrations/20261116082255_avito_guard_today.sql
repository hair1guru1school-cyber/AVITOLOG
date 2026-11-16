create table public.avito_guard_today_items (
 settings_id uuid not null references public.avito_guard_settings(id),organization_id uuid not null references public.organizations(id),
 item_id text not null check(item_id~'^[1-9][0-9]{0,15}$'),title text not null check(length(title)<=300),item_url text,
 metric_date date not null,views bigint check(views between 0 and 9007199254740991),contacts bigint check(contacts between 0 and 9007199254740991),
 observed_at timestamptz not null default now(),views_observed_at timestamptz,contacts_observed_at timestamptz,
 primary key(settings_id,item_id)
);
create index avito_guard_today_org on public.avito_guard_today_items(organization_id);
create index avito_guard_today_retention on public.avito_guard_today_items(metric_date);
alter table public.avito_guard_today_items enable row level security;
revoke all on public.avito_guard_today_items from public,anon,authenticated;
grant select on public.avito_guard_today_items to authenticated;
grant all on public.avito_guard_today_items to service_role;
create policy avito_guard_today_read on public.avito_guard_today_items for select to authenticated using (
 public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])
 and exists(select 1 from public.avito_guard_settings s where s.id=settings_id and s.organization_id=avito_guard_today_items.organization_id)
);

create function public.avito_guard_today(p_id uuid,p_after text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.avito_guard_settings;d date:=(now() at time zone 'Europe/Moscow')::date;items jsonb;cursor text;summary jsonb;
begin
 select * into s from public.avito_guard_settings where id=p_id;
 if s.id is null or auth.uid() is null or not public.has_org_role(s.organization_id,array['owner','admin']::public.organization_role[]) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_after is not null and p_after!~'^[1-9][0-9]{0,15}$' then raise exception 'Invalid cursor' using errcode='22023';end if;
 select jsonb_build_object('checked',count(*),'known_views',count(views),'with_views',count(*) filter(where views>0),'views',coalesce(sum(views),0)::text,'last_scan_at',max(observed_at),'last_views_at',max(views_observed_at)) into summary
 from public.avito_guard_today_items where settings_id=p_id and metric_date=d;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.item_id),'[]'::jsonb) into items from (
  select item_id,title,item_url,views,contacts,observed_at,views_observed_at,contacts_observed_at from public.avito_guard_today_items
  where settings_id=p_id and metric_date=d and views>0 and (p_after is null or item_id>p_after) order by item_id limit 500
 ) t;
 if jsonb_array_length(items)=500 and exists(select 1 from public.avito_guard_today_items where settings_id=p_id and metric_date=d and views>0 and item_id>(items->499->>'item_id')) then cursor:=items->499->>'item_id';end if;
 return jsonb_build_object('date',d,'summary',summary,'items',items,'next_cursor',cursor);
end $$;
revoke all on function public.avito_guard_today(uuid,text) from public,anon;
grant execute on function public.avito_guard_today(uuid,text) to authenticated;

create or replace function public.avito_guard_record(p_id uuid,p_lease uuid,p_revision bigint,p_rows jsonb,p_more boolean,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare c jsonb;r jsonb;b public.avito_guard_samples;prev public.avito_guard_samples;w integer;dv bigint;dc bigint;sev text;cool integer;counted integer:=0;
begin
 c:=public.avito_guard_validate(p_id,p_lease);if (c->>'revision')::bigint<>p_revision then raise exception 'Rules changed' using errcode='40001';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>99 or octet_length(p_rows::text)>131072 or p_error is not null and p_error!~'^[a-z_]{1,80}$' then raise exception 'Invalid samples';end if;
 cool:=(c->'rules'->>'cooldownMinutes')::integer;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'id','')!~'^[1-9][0-9]{0,15}$' or length(coalesce(r->>'title',''))>300 or r->>'date' is distinct from to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD') then raise exception 'Invalid item';end if;
  if exists(select 1 from jsonb_each(r) e where e.key in('views','contacts') and e.value<>'null'::jsonb and (jsonb_typeof(e.value)<>'number' or e.value::text!~'^[0-9]+$' or length(e.value::text)>16)) then raise exception 'Invalid counters';end if;
  insert into public.avito_guard_today_items as t(settings_id,organization_id,item_id,title,item_url,metric_date,views,contacts,views_observed_at,contacts_observed_at)
  values(p_id,(c->>'organization_id')::uuid,r->>'id',coalesce(r->>'title',''),case when r->>'url'~'^https://([a-z0-9-]+\.)?avito\.ru/' then r->>'url' else null end,(r->>'date')::date,(r->>'views')::bigint,(r->>'contacts')::bigint,case when r->>'views' is not null then now() end,case when r->>'contacts' is not null then now() end)
  on conflict(settings_id,item_id) do update set title=excluded.title,item_url=excluded.item_url,metric_date=excluded.metric_date,observed_at=now(),
   views=coalesce(excluded.views,case when t.metric_date=excluded.metric_date then t.views end),contacts=coalesce(excluded.contacts,case when t.metric_date=excluded.metric_date then t.contacts end),
   views_observed_at=coalesce(excluded.views_observed_at,case when t.metric_date=excluded.metric_date then t.views_observed_at end),contacts_observed_at=coalesce(excluded.contacts_observed_at,case when t.metric_date=excluded.metric_date then t.contacts_observed_at end);
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
 delete from public.avito_guard_today_items where (settings_id,item_id) in(select settings_id,item_id from public.avito_guard_today_items where metric_date<(now() at time zone 'Europe/Moscow')::date-1 limit 10000);
 return true;
end $$;
