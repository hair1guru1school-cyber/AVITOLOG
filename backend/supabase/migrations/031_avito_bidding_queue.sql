-- Durable, explicitly confirmed financial intents. No browser JWTs or provider tokens.
begin;
create sequence public.avito_bid_confirmation_seq;
create table public.avito_bid_jobs (
 id uuid primary key, module text not null check(module in ('personal','oauth')),
 organization_id uuid not null references public.organizations(id),account_id uuid not null,actor_id uuid not null,
 credential_version text not null, intent jsonb not null check(jsonb_typeof(intent)='object' and octet_length(intent::text)<4096),
 item_count integer not null check(item_count between 1 and 10000),
 status text not null default 'draft' check(status in ('draft','queued','running','complete','partial','cancelled','blocked','expired')),
 confirmation_seq bigint unique,created_at timestamptz not null default now(),confirmed_at timestamptz,
 draft_expires_at timestamptz not null,expires_at timestamptz not null default now()+interval '24 hours'
);
create table public.avito_bid_items (
 job_id uuid not null references public.avito_bid_jobs(id),item_id text not null check(item_id~'^[1-9][0-9]{0,15}$'),
 module text not null,organization_id uuid not null,account_id uuid not null,ordinal integer not null,
 status text not null default 'pending' check(status in ('pending','preparing','submitting','applied','rejected','unknown','superseded','cancelled')),
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default now(),error_code text,finished_at timestamptz,
 primary key(job_id,item_id)
);
create index avito_bid_jobs_account on public.avito_bid_jobs(module,organization_id,account_id,created_at desc);
create index avito_bid_items_pending on public.avito_bid_items(next_attempt_at,job_id,ordinal) where status='pending';
create index avito_bid_items_lease on public.avito_bid_items(lease_until) where status in ('preparing','submitting');
create unique index avito_bid_one_active on public.avito_bid_items(module,organization_id,account_id) where status in ('preparing','submitting');
alter table public.avito_bid_jobs enable row level security;
alter table public.avito_bid_items enable row level security;
revoke all on public.avito_bid_jobs,public.avito_bid_items,public.avito_bid_confirmation_seq from public,anon,authenticated;
grant all on public.avito_bid_jobs,public.avito_bid_items,public.avito_bid_confirmation_seq to service_role;

create function public.avito_bid_summary(p_job_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'module',j.module,'account_id',j.account_id,'status',j.status,'intent',j.intent,
  'item_count',j.item_count,'created_at',j.created_at,'confirmed_at',j.confirmed_at,
  'counts',coalesce((select jsonb_object_agg(s.status,s.n) from(select status,count(*) n from public.avito_bid_items where job_id=j.id group by status)s),'{}'::jsonb),
  'results',coalesce((select jsonb_agg(r) from(select item_id,status,error_code from public.avito_bid_items where job_id=j.id and status not in('pending','preparing','submitting') order by finished_at desc nulls last,ordinal limit 30)r),'[]'::jsonb))
 from public.avito_bid_jobs j where j.id=p_job_id
$$;
create function public.avito_bid_list(p_module text,p_org uuid,p_account uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.avito_bidding_account_version(p_module,p_org,p_account,p_actor);
 return coalesce((select jsonb_agg(public.avito_bid_summary(s.id)) from(select id from public.avito_bid_jobs where module=p_module and organization_id=p_org and account_id=p_account and status<>'draft' order by created_at desc limit 10)s),'[]'::jsonb);
end $$;
create function public.avito_bid_draft(p_id uuid,p_module text,p_org uuid,p_account uuid,p_actor uuid,p_version text,p_intent jsonb,p_ids jsonb,p_expires timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
declare mode text; n integer;
begin
 if public.avito_bidding_account_version(p_module,p_org,p_account,p_actor)<>p_version then raise exception 'Account changed' using errcode='40001';end if;
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or octet_length(p_intent::text)>=4096 or p_ids is null or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids) not between 1 and 10000 or p_expires is null or p_expires<=now() or p_expires>now()+interval '15 minutes' then raise exception 'Invalid queue' using errcode='22023';end if;
 mode:=p_intent->>'mode';
 if mode is null or mode not in('manual','auto','base') or coalesce((p_intent->>'action_type_id')::integer,0) not in(1,5,7) or
  (mode='manual' and (coalesce((p_intent->>'bid_penny')::bigint,0) not between 1 and 35000 or coalesce((p_intent->>'limit_penny')::bigint,0) not between 1 and 100000000000)) or
  (mode='auto' and (coalesce((p_intent->>'budget_penny')::bigint,0) not between 1 and 100000000000 or coalesce(p_intent->>'budget_type','') not in('1d','7d','30d'))) then raise exception 'Invalid queue plan' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(p_intent))<>6 or not (p_intent ?& array['mode','action_type_id','bid_penny','limit_penny','budget_penny','budget_type']) or jsonb_typeof(p_intent->'action_type_id')<>'number' or
  (mode='manual' and (jsonb_typeof(p_intent->'bid_penny')<>'number' or jsonb_typeof(p_intent->'limit_penny')<>'number' or p_intent->'budget_penny'<>'null'::jsonb or p_intent->'budget_type'<>'null'::jsonb)) or
  (mode='auto' and (jsonb_typeof(p_intent->'budget_penny')<>'number' or p_intent->'bid_penny'<>'null'::jsonb or p_intent->'limit_penny'<>'null'::jsonb)) or
  (mode='base' and (p_intent->'bid_penny'<>'null'::jsonb or p_intent->'limit_penny'<>'null'::jsonb or p_intent->'budget_penny'<>'null'::jsonb or p_intent->'budget_type'<>'null'::jsonb)) then raise exception 'Invalid queue fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_ids)e where jsonb_typeof(e)<>'string' or e#>>'{}'!~'^[1-9][0-9]{0,15}$') then raise exception 'Invalid item IDs' using errcode='22023';end if;
 select count(distinct value) into n from jsonb_array_elements_text(p_ids);if n<>jsonb_array_length(p_ids) then raise exception 'Duplicate IDs' using errcode='22023';end if;
 if (select count(*) from public.avito_bid_jobs where module=p_module and organization_id=p_org and account_id=p_account and (status in('queued','running') or status='draft' and draft_expires_at>now()))>=10 then raise exception 'Too many queues' using errcode='54000';end if;
 insert into public.avito_bid_jobs(id,module,organization_id,account_id,actor_id,credential_version,intent,item_count,draft_expires_at)
 values(p_id,p_module,p_org,p_account,p_actor,p_version,p_intent,n,p_expires);
 insert into public.avito_bid_items(job_id,item_id,module,organization_id,account_id,ordinal)
 select p_id,value,p_module,p_org,p_account,ordinality from jsonb_array_elements_text(p_ids) with ordinality;
 return true;
end $$;
create function public.avito_bid_confirm(p_id uuid,p_module text,p_org uuid,p_account uuid,p_actor uuid,p_version text,p_intent jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.avito_bid_jobs; seq bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bid-account:'||p_module||':'||p_org||':'||p_account,0));
 if public.avito_bidding_account_version(p_module,p_org,p_account,p_actor)<>p_version then raise exception 'Account changed' using errcode='40001';end if;
 select * into j from public.avito_bid_jobs where id=p_id and module=p_module and organization_id=p_org and account_id=p_account and actor_id=p_actor for update;
 if not found or j.credential_version<>p_version or j.intent<>p_intent then raise exception 'Invalid confirmation' using errcode='22023';end if;
 if j.status<>'draft' then return public.avito_bid_summary(j.id);end if;
 if j.draft_expires_at<=now() then raise exception 'Expired confirmation' using errcode='22023';end if;
 seq:=nextval('public.avito_bid_confirmation_seq');
 update public.avito_bid_jobs set status='queued',confirmation_seq=seq,confirmed_at=now() where id=j.id;
 -- Later confirmed intents supersede only work that has not reached submission.
 update public.avito_bid_items old set status='superseded',lease_token=null,lease_until=null,finished_at=now()
 from public.avito_bid_jobs prior where old.job_id=prior.id and prior.module=p_module and prior.organization_id=p_org and prior.account_id=p_account and prior.confirmation_seq<seq and old.status in('pending','preparing')
 and exists(select 1 from public.avito_bid_items fresh where fresh.job_id=j.id and fresh.item_id=old.item_id);
 update public.avito_bid_jobs prior set status='partial' where prior.module=p_module and prior.organization_id=p_org and prior.account_id=p_account and prior.confirmation_seq<seq and prior.status in('queued','running') and not exists(select 1 from public.avito_bid_items i where i.job_id=prior.id and i.status in('pending','preparing','submitting'));
 return public.avito_bid_summary(j.id);
end $$;
create function public.avito_bid_cancel(p_id uuid,p_module text,p_org uuid,p_account uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.avito_bidding_account_version(p_module,p_org,p_account,p_actor);
 update public.avito_bid_jobs set status='cancelled' where id=p_id and module=p_module and organization_id=p_org and account_id=p_account and status in('queued','running','draft');
 if not found then return null;end if;
 update public.avito_bid_items set status='cancelled',lease_token=null,lease_until=null,finished_at=now() where job_id=p_id and status in('pending','preparing');
 return public.avito_bid_summary(p_id);
end $$;
create function public.avito_bid_validate_lease(p_job uuid,p_item text,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.avito_bid_jobs; i public.avito_bid_items;
begin
 select * into j from public.avito_bid_jobs where id=p_job;
 select * into i from public.avito_bid_items where job_id=p_job and item_id=p_item;
 if j.id is null or i.item_id is null or p_lease is null or j.status not in('queued','running') or j.expires_at<=now() or i.status not in('preparing','submitting') or i.lease_token is distinct from p_lease or i.lease_until<=now() then raise exception 'Lease changed' using errcode='40001';end if;
 if public.avito_bidding_account_version(j.module,j.organization_id,j.account_id,j.actor_id)<>j.credential_version then raise exception 'Account changed' using errcode='40001';end if;
 return jsonb_build_object('job_id',j.id,'item_id',i.item_id,'lease',i.lease_token,'module',j.module,'organization_id',j.organization_id,'account_id',j.account_id,'actor_id',j.actor_id,'credential_version',j.credential_version,'intent',j.intent);
end $$;
create function public.avito_bid_rotate_version(p_job uuid,p_item text,p_lease uuid,p_old text,p_next text) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.avito_bid_jobs;
begin
 select * into j from public.avito_bid_jobs where id=p_job;
 if j.credential_version<>p_old or not exists(select 1 from public.avito_bid_items where job_id=p_job and item_id=p_item and status='preparing' and lease_token=p_lease and lease_until>now()) then return false;end if;
 if public.avito_bidding_account_version(j.module,j.organization_id,j.account_id,j.actor_id)<>p_next then return false;end if;
 update public.avito_bid_jobs set credential_version=p_next where module=j.module and organization_id=j.organization_id and account_id=j.account_id and credential_version=p_old and status in('draft','queued','running');
 return true;
end $$;
create function public.avito_bid_mark_submitting(p_job uuid,p_item text,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.avito_bid_validate_lease(p_job,p_item,p_lease);
 update public.avito_bid_items set status='submitting' where job_id=p_job and item_id=p_item and status='preparing' and lease_token=p_lease;
 return found;
end $$;
create function public.avito_bid_finish_item(p_job uuid,p_item text,p_lease uuid,p_status text,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in('applied','rejected','unknown') or p_error is not null and p_error!~'^[a-z_]{1,80}$' then return false;end if;
 update public.avito_bid_items set status=p_status,error_code=p_error,finished_at=now(),lease_until=null,lease_token=null where job_id=p_job and item_id=p_item and lease_token=p_lease and status in('preparing','submitting');
 if not found then return false;end if;
 if p_status in('rejected','unknown') then
  update public.avito_bid_jobs set status='blocked' where id=p_job and status<>'cancelled';
  update public.avito_bid_items set status='cancelled',error_code='queue_stopped',finished_at=now() where job_id=p_job and status='pending';
 elsif not exists(select 1 from public.avito_bid_items where job_id=p_job and status in('pending','preparing','submitting')) then
  update public.avito_bid_jobs set status=case when exists(select 1 from public.avito_bid_items where job_id=p_job and status<>'applied') then 'partial' else 'complete' end where id=p_job and status in('queued','running');
 end if;
 return true;
end $$;
create function public.avito_bid_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; lease uuid; recent timestamptz;
begin
 -- A vanished worker can repeat a read, but never a possibly submitted write.
 update public.avito_bid_items set status='unknown',error_code='worker_lost_after_submit',finished_at=now(),lease_token=null,lease_until=null where status='submitting' and lease_until<=now();
 update public.avito_bid_jobs j set status='blocked' where status in('queued','running') and exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status='unknown');
 update public.avito_bid_items i set status='cancelled',finished_at=now(),error_code='queue_stopped' from public.avito_bid_jobs j where i.job_id=j.id and i.status in('pending','preparing') and (j.status in('blocked','cancelled') or j.expires_at<=now());
 update public.avito_bid_items set status=case when attempts>=3 then 'rejected' else 'pending' end,error_code='worker_read_lease_expired',lease_token=null,lease_until=null,next_attempt_at=now()+interval '10 seconds' where status='preparing' and lease_until<=now();
 update public.avito_bid_jobs j set status='blocked' where status in('queued','running') and exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status='rejected');
 update public.avito_bid_items i set status='cancelled',lease_token=null,lease_until=null,finished_at=now(),error_code='queue_stopped' from public.avito_bid_jobs j where i.job_id=j.id and i.status='pending' and j.status='blocked';
 update public.avito_bid_jobs set status='expired' where status in('queued','running','draft') and expires_at<=now();
 for r in select i.job_id,i.item_id,j.module,j.organization_id,j.account_id,j.actor_id,j.credential_version
  from public.avito_bid_items i join public.avito_bid_jobs j on j.id=i.job_id
  where i.status='pending' and i.next_attempt_at<=now() and j.status in('queued','running') and j.expires_at>now()
   and not exists(select 1 from public.avito_bid_items live where live.module=j.module and live.organization_id=j.organization_id and live.account_id=j.account_id and live.status in('preparing','submitting'))
  order by j.confirmation_seq,i.ordinal for update of i skip locked limit 12
 loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('bid-account:'||r.module||':'||r.organization_id||':'||r.account_id,0)) then continue;end if;
  begin
   if public.avito_bidding_account_version(r.module,r.organization_id,r.account_id,r.actor_id)<>r.credential_version then raise exception 'Account changed';end if;
  exception when others then
   update public.avito_bid_jobs set status='blocked' where id=r.job_id;
   update public.avito_bid_items set status='cancelled',finished_at=now(),error_code='account_changed' where job_id=r.job_id and status='pending';continue;
  end;
  if exists(select 1 from public.avito_bidding_audit where module=r.module and organization_id=r.organization_id and account_id=r.account_id and item_id=r.item_id and status in('unknown','submitting')) then
   update public.avito_bid_jobs set status='blocked' where id=r.job_id;
   update public.avito_bid_items set status='cancelled',finished_at=now(),error_code='prior_submission_unknown' where job_id=r.job_id and status='pending';continue;
  end if;
  select max(created_at) into recent from public.avito_bidding_audit where module=r.module and organization_id=r.organization_id and account_id=r.account_id and item_id=r.item_id;
  if recent>now()-interval '31 seconds' then update public.avito_bid_items set next_attempt_at=recent+interval '31 seconds' where job_id=r.job_id and item_id=r.item_id;continue;end if;
  lease:=gen_random_uuid();
  begin
   update public.avito_bid_items set status='preparing',lease_token=lease,lease_until=now()+interval '180 seconds',attempts=attempts+1 where job_id=r.job_id and item_id=r.item_id and status='pending';
  exception when unique_violation then continue;end;
  update public.avito_bid_jobs set status='running' where id=r.job_id;
  return public.avito_bid_validate_lease(r.job_id,r.item_id,lease);
 end loop;
 return null;
end $$;

revoke all on function public.avito_bid_summary(uuid),public.avito_bid_list(text,uuid,uuid,uuid),public.avito_bid_draft(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb,timestamptz),public.avito_bid_confirm(uuid,text,uuid,uuid,uuid,text,jsonb),public.avito_bid_cancel(uuid,text,uuid,uuid,uuid),public.avito_bid_validate_lease(uuid,text,uuid),public.avito_bid_rotate_version(uuid,text,uuid,text,text),public.avito_bid_mark_submitting(uuid,text,uuid),public.avito_bid_finish_item(uuid,text,uuid,text,text),public.avito_bid_claim() from public,anon,authenticated;
grant execute on function public.avito_bid_summary(uuid),public.avito_bid_list(text,uuid,uuid,uuid),public.avito_bid_draft(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb,timestamptz),public.avito_bid_confirm(uuid,text,uuid,uuid,uuid,text,jsonb),public.avito_bid_cancel(uuid,text,uuid,uuid,uuid),public.avito_bid_validate_lease(uuid,text,uuid),public.avito_bid_rotate_version(uuid,text,uuid,text,text),public.avito_bid_mark_submitting(uuid,text,uuid),public.avito_bid_finish_item(uuid,text,uuid,text,text),public.avito_bid_claim() to service_role;
commit;
