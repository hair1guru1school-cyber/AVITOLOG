CREATE OR REPLACE FUNCTION public.avito_bid_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; lease uuid; recent timestamptz;
begin
 -- A vanished worker can repeat a read, but never a possibly submitted write.
 update public.avito_bid_items i set status=case when j.intent->>'mode'='base' and i.attempts<5 then 'pending' else 'unknown' end,error_code='worker_lost_after_submit',finished_at=null,lease_token=null,lease_until=null,next_attempt_at=now()+interval '2 seconds' from public.avito_bid_jobs j where i.job_id=j.id and i.status='submitting' and i.lease_until<=now();
 update public.avito_bid_jobs j set status='blocked' where status in('queued','running') and intent->>'mode'<>'base' and exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status='unknown');
 update public.avito_bid_items i set status='cancelled',finished_at=now(),error_code='queue_stopped',lease_token=null,lease_until=null from public.avito_bid_jobs j where i.job_id=j.id and i.status in('pending','preparing') and (j.status='cancelled' or j.status='blocked' and j.intent->>'mode'<>'base' or j.expires_at<=now());
 update public.avito_bid_items i set status=case when i.attempts>=case when j.intent->>'mode'='base' then 5 else 3 end then 'rejected' else 'pending' end,error_code='worker_read_lease_expired',lease_token=null,lease_until=null,next_attempt_at=now()+interval '10 seconds' from public.avito_bid_jobs j where i.job_id=j.id and i.status='preparing' and i.lease_until<=now();
 update public.avito_bid_jobs j set status='blocked' where status in('queued','running') and intent->>'mode'<>'base' and exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status='rejected');
 update public.avito_bid_items i set status='cancelled',lease_token=null,lease_until=null,finished_at=now(),error_code='queue_stopped' from public.avito_bid_jobs j where i.job_id=j.id and i.status='pending' and j.status='blocked' and j.intent->>'mode'<>'base';
 update public.avito_bid_jobs set status='expired' where status in('queued','running','draft') and expires_at<=now();
 update public.avito_bid_jobs j set status=case when exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status<>'applied') then 'partial' else 'complete' end where j.status in('queued','running') and not exists(select 1 from public.avito_bid_items i where i.job_id=j.id and i.status in('pending','preparing','submitting'));
 for r in select i.job_id,i.item_id,j.module,j.organization_id,j.account_id,j.actor_id,j.credential_version,j.intent
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
  if r.intent->>'mode'<>'base' and exists(select 1 from public.avito_bidding_audit where module=r.module and organization_id=r.organization_id and account_id=r.account_id and item_id=r.item_id and status in('unknown','submitting')) then
   update public.avito_bid_jobs set status='blocked' where id=r.job_id;
   update public.avito_bid_items set status='cancelled',finished_at=now(),error_code='prior_submission_unknown' where job_id=r.job_id and status='pending';continue;
  end if;
  select max(created_at) into recent from public.avito_bidding_audit where module=r.module and organization_id=r.organization_id and account_id=r.account_id and item_id=r.item_id;
  if recent>now()-interval '31 seconds' then update public.avito_bid_items set next_attempt_at=recent+interval '31 seconds' where job_id=r.job_id and item_id=r.item_id;continue;end if;
  lease:=gen_random_uuid();
  begin
   update public.avito_bid_items set status='preparing',lease_token=lease,lease_until=now()+interval '180 seconds',attempts=attempts+1 where job_id=r.job_id and item_id=r.item_id and status='pending' and attempts<5 and exists(select 1 from public.avito_bid_jobs j where j.id=r.job_id and j.status in('queued','running') and j.expires_at>now());
   if not found then continue; end if;
  exception when unique_violation then continue;end;
  update public.avito_bid_jobs set status='running' where id=r.job_id and status in('queued','running');
  if not found then continue; end if;
  return public.avito_bid_validate_lease(r.job_id,r.item_id,lease);
 end loop;
 return null;
end $function$;

create or replace function public.avito_bid_reconcile_base(p_job uuid,p_item text,p_lease uuid,p_mode text)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.avito_bid_jobs;
begin
 perform public.avito_bid_validate_lease(p_job,p_item,p_lease);
 select * into j from public.avito_bid_jobs where id=p_job;
 if j.intent->>'mode'<>'base' or p_mode is null or p_mode not in('base','manual','auto') then return false;end if;
 -- Only the trusted worker can supply the just-read provider state. Paid intents stay single-shot.
 update public.avito_bidding_audit set status=case when p_mode='base' then 'applied' else 'rejected' end,
  error_code=case when p_mode='base' then 'bidding_base_readback_confirmed' else 'bidding_base_readback_paid' end,finished_at=now()
 where module=j.module and organization_id=j.organization_id and account_id=j.account_id and item_id=p_item
  and after_state->>'mode'='base' and (status='unknown' and created_at<now()-interval '31 seconds' or status='submitting' and created_at<now()-interval '180 seconds');
 return not exists(select 1 from public.avito_bidding_audit where module=j.module and organization_id=j.organization_id and account_id=j.account_id and item_id=p_item and status in('unknown','submitting'));
end $$;

create or replace function public.avito_bid_finish_item(p_job uuid,p_item text,p_lease uuid,p_status text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare base_job boolean; retriable boolean; tries integer;
begin
 if p_status not in('applied','rejected','unknown') or p_error is not null and p_error!~'^[a-z_]{1,80}$' then return false;end if;
 select intent->>'mode'='base' into base_job from public.avito_bid_jobs where id=p_job;
 select attempts into tries from public.avito_bid_items where job_id=p_job and item_id=p_item and lease_token=p_lease and status in('preparing','submitting') for update;
 if not found then return false;end if;
 retriable:=base_job and tries<5 and (p_status='unknown' or p_status='rejected' and p_error in('bidding_rate_limited','bidding_item_unavailable','bidding_promotions_unavailable','bidding_unavailable','bidding_changed','bidding_reconciliation_pending','bidding_quote_consumed','queue_worker_failed','storage_unavailable'));
 update public.avito_bid_items set status=case when retriable then 'pending' else p_status end,error_code=p_error,
  finished_at=case when retriable then null else now() end,next_attempt_at=case when retriable then now()+make_interval(secs=>least(120,10*greatest(tries,1))) else next_attempt_at end,lease_until=null,lease_token=null
 where job_id=p_job and item_id=p_item and lease_token=p_lease;
 if p_status in('rejected','unknown') and (not base_job or p_error in('account_changed','account_disconnected','permission_denied','bidding_scope_required','bidding_provider_unauthorized','bidding_provider_forbidden')) then
  update public.avito_bid_jobs set status='blocked' where id=p_job and status<>'cancelled';
  if not base_job then update public.avito_bid_items set status='cancelled',error_code='queue_stopped',finished_at=now() where job_id=p_job and status='pending';end if;
 elsif not exists(select 1 from public.avito_bid_items where job_id=p_job and status in('pending','preparing','submitting')) then
  update public.avito_bid_jobs set status=case when exists(select 1 from public.avito_bid_items where job_id=p_job and status<>'applied') then 'partial' else 'complete' end where id=p_job and status in('queued','running');
 end if;
 return true;
end $$;

create or replace function public.avito_bid_resume(p_id uuid,p_module text,p_org uuid,p_account uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.avito_bid_jobs; current_version text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bid-account:'||p_module||':'||p_org||':'||p_account,0));
 current_version:=public.avito_bidding_account_version(p_module,p_org,p_account,p_actor);
 select * into j from public.avito_bid_jobs where id=p_id and module=p_module and organization_id=p_org and account_id=p_account for update;
 if not found or j.confirmed_at is null or j.intent->>'mode'<>'base' then raise exception 'Only confirmed base-price queues can resume' using errcode='22023';end if;
 if j.credential_version<>current_version then raise exception 'Account changed' using errcode='40001';end if;
 if j.status in('queued','running','complete') then return public.avito_bid_summary(p_id);end if;
 update public.avito_bid_items i set status=case when exists(select 1 from public.avito_bid_items ni join public.avito_bid_jobs nj on nj.id=ni.job_id where ni.module=i.module and ni.organization_id=i.organization_id and ni.account_id=i.account_id and ni.item_id=i.item_id and nj.confirmation_seq>j.confirmation_seq) then 'superseded' else 'pending' end,
  lease_token=null,lease_until=null,attempts=0,next_attempt_at=now(),finished_at=null,error_code=null
 where i.job_id=p_id and i.status in('pending','preparing','rejected','unknown','cancelled');
 update public.avito_bid_jobs set status=case when exists(select 1 from public.avito_bid_items where job_id=p_id and status in('pending','preparing','submitting')) then 'queued' else 'partial' end,expires_at=now()+interval '24 hours' where id=p_id;
 return public.avito_bid_summary(p_id);
end $$;

revoke all on function public.avito_bid_reconcile_base(uuid,text,uuid,text),public.avito_bid_resume(uuid,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.avito_bid_reconcile_base(uuid,text,uuid,text),public.avito_bid_resume(uuid,text,uuid,uuid,uuid) to service_role;

create or replace function public.avito_bid_summary(p_job_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'module',j.module,'account_id',j.account_id,'status',j.status,'intent',j.intent,
 'item_count',j.item_count,'created_at',j.created_at,'confirmed_at',j.confirmed_at,
 'counts',coalesce((select jsonb_object_agg(s.status,s.n) from(select status,count(*) n from public.avito_bid_items where job_id=j.id group by status)s),'{}'::jsonb)
 ||jsonb_build_object('unchanged',(select count(*) from public.avito_bid_items where job_id=j.id and status='applied' and error_code='bidding_no_paid_promotion'),
 'retrying',(select count(*) from public.avito_bid_items where job_id=j.id and status='pending' and attempts>0)),
 'results',coalesce((select jsonb_agg(r) from(select item_id,status,error_code from public.avito_bid_items where job_id=j.id and status not in('pending','preparing','submitting') order by finished_at desc nulls last,ordinal limit 30)r),'[]'::jsonb))
 from public.avito_bid_jobs j where j.id=p_job_id
$$;
