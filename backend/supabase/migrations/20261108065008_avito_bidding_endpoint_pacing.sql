create table public.avito_bidding_pacing (
  module text not null check (module in ('personal','oauth')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null,
  kind text not null check (kind in ('list','detail','own','promotions','manual','auto','base')),
  next_at timestamptz not null,
  primary key (module,organization_id,account_id,kind)
);
alter table public.avito_bidding_pacing enable row level security;
revoke all on public.avito_bidding_pacing from public,anon,authenticated;
grant select,insert,update,delete on public.avito_bidding_pacing to service_role;

create function public.avito_bidding_wait_slot(p_module text,p_organization_id uuid,p_account_id uuid,p_actor_id uuid,p_kind text)
returns integer language plpgsql security definer set search_path='' as $$
declare maximum integer; v_now timestamptz; slot timestamptz;
begin
 perform public.avito_bidding_account_version(p_module,p_organization_id,p_account_id,p_actor_id);
 maximum:=case p_kind when 'list' then 25 when 'detail' then 20 when 'own' then 500 when 'promotions' then 400 when 'manual' then 20 when 'auto' then 10 when 'base' then 300 else 0 end;
 if maximum=0 then raise exception 'Invalid rate kind';end if;
 v_now:=clock_timestamp();
 insert into public.avito_bidding_pacing(module,organization_id,account_id,kind,next_at)
 values(p_module,p_organization_id,p_account_id,p_kind,v_now)
 on conflict do nothing;
 select greatest(next_at,clock_timestamp()) into slot from public.avito_bidding_pacing
 where module=p_module and organization_id=p_organization_id and account_id=p_account_id and kind=p_kind for update;
 if slot>clock_timestamp()+interval '120 seconds' then raise exception 'Rate queue full';end if;
 update public.avito_bidding_pacing set next_at=slot+((ceil(60000.0/maximum)+1)::text||' milliseconds')::interval
 where module=p_module and organization_id=p_organization_id and account_id=p_account_id and kind=p_kind;
 return greatest(0,ceil(extract(epoch from slot-clock_timestamp())*1000)::integer);
end $$;
revoke all on function public.avito_bidding_wait_slot(text,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.avito_bidding_wait_slot(text,uuid,uuid,uuid,text) to service_role;

alter table public.avito_bidding_rate_limits drop constraint avito_bidding_rate_limits_kind_check;
alter table public.avito_bidding_rate_limits add constraint avito_bidding_rate_limits_kind_check check (kind in ('list','detail','own','promotions','manual','auto','base'));
alter table public.avito_bidding_rate_limits drop constraint avito_bidding_rate_limits_requests_check;
alter table public.avito_bidding_rate_limits add constraint avito_bidding_rate_limits_requests_check check (requests>=1 and requests<=500);

create or replace function public.avito_bidding_reserve(p_module text,p_organization_id uuid,p_account_id uuid,p_actor_id uuid,p_kind text)
returns boolean language plpgsql security definer set search_path='' as $$
declare used integer; maximum integer; bucket timestamptz;
begin
 perform public.avito_bidding_account_version(p_module,p_organization_id,p_account_id,p_actor_id);
 maximum:=case p_kind when 'list' then 25 when 'detail' then 20 when 'own' then 500 when 'promotions' then 400 when 'manual' then 20 when 'auto' then 10 when 'base' then 300 else 0 end;
 if maximum=0 then return false;end if;
 bucket:=date_trunc('minute',now());
 insert into public.avito_bidding_rate_limits(module,organization_id,account_id,kind,window_start,requests)
 values(p_module,p_organization_id,p_account_id,p_kind,bucket,1)
 on conflict(module,organization_id,account_id,kind,window_start) do update set requests=public.avito_bidding_rate_limits.requests+1
 where public.avito_bidding_rate_limits.requests<maximum returning requests into used;
 delete from public.avito_bidding_rate_limits where window_start<now()-interval '1 day';
 return used is not null;
end $$;

create or replace function public.avito_bid_summary(p_job_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'module',j.module,'account_id',j.account_id,'status',j.status,'intent',j.intent,
 'item_count',j.item_count,'created_at',j.created_at,'confirmed_at',j.confirmed_at,
 'counts',coalesce((select jsonb_object_agg(s.status,s.n) from(select status,count(*) n from public.avito_bid_items where job_id=j.id group by status)s),'{}'::jsonb)
 ||jsonb_build_object('unchanged',(select count(*) from public.avito_bid_items where job_id=j.id and status='applied' and error_code='bidding_no_paid_promotion')),
 'results',coalesce((select jsonb_agg(r) from(select item_id,status,error_code from public.avito_bid_items where job_id=j.id and status not in('pending','preparing','submitting') order by finished_at desc nulls last,ordinal limit 30)r),'[]'::jsonb))
 from public.avito_bid_jobs j where j.id=p_job_id
$$;

select cron.alter_job(jobid,schedule:='5 seconds') from cron.job where jobname='avito-bidding-worker';

