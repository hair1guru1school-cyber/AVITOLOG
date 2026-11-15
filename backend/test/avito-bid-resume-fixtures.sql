do $test$
declare claim jsonb; old_failed boolean:=false; v jsonb;
 org uuid:='00000000-0000-4000-8000-000000000011'; acct uuid:='00000000-0000-4000-8000-000000000012'; actor uuid:='00000000-0000-4000-8000-000000000013';
 base uuid:='00000000-0000-4000-8000-000000000021'; paid uuid:='00000000-0000-4000-8000-000000000022';
begin
 insert into pg_temp.avito_bid_jobs(id,module,organization_id,account_id,actor_id,credential_version,intent,item_count,status,confirmation_seq,confirmed_at,draft_expires_at)
 values(base,'personal',org,acct,actor,'v1','{"mode":"base","action_type_id":5,"bid_penny":null,"limit_penny":null,"budget_penny":null,"budget_type":null}',3,'queued',1,now(),now()+interval '10 minutes');
 insert into pg_temp.avito_bid_items(job_id,item_id,module,organization_id,account_id,ordinal)
 select base,n::text,'personal',org,acct,n from generate_series(1,3)n;
 insert into pg_temp.avito_bidding_audit(quote_id,module,organization_id,account_id,actor_id,credential_version,item_id,before_state,after_state,status,created_at)
 values(gen_random_uuid(),'personal',org,acct,actor,'v1','1','{"mode":"manual"}','{"mode":"base"}','unknown',now()-interval '10 minutes');
 begin perform pg_temp.avito_bid_claim_old();exception when serialization_failure then old_failed:=true;end;
 if not old_failed then raise exception 'Expected to reproduce the old stale-cursor lease failure';end if;
 claim:=pg_temp.avito_bid_claim();
 if claim->>'item_id' is distinct from '1' then raise exception 'Base queue failed to claim uncertain item for readback';end if;
 if pg_temp.avito_bid_reconcile_base(base,'1',(claim->>'lease')::uuid,'base') is distinct from true then raise exception 'Readback reconciliation failed';end if;
 perform pg_temp.avito_bid_finish_item(base,'1',(claim->>'lease')::uuid,'applied',null);
 claim:=pg_temp.avito_bid_claim();
 perform pg_temp.avito_bid_finish_item(base,'2',(claim->>'lease')::uuid,'unknown','bidding_result_unknown');
 if not exists(select 1 from pg_temp.avito_bid_items where job_id=base and item_id='2' and status='pending') or not exists(select 1 from pg_temp.avito_bid_items where job_id=base and item_id='3' and status='pending') then raise exception 'One uncertain base result stopped the other items';end if;
 claim:=pg_temp.avito_bid_claim();
 if claim->>'item_id' is distinct from '3' then raise exception 'Other cards did not continue during backoff';end if;
 perform pg_temp.avito_bid_finish_item(base,'3',(claim->>'lease')::uuid,'applied',null);
 update pg_temp.avito_bid_items set next_attempt_at=now() where job_id=base and item_id='2';
 claim:=pg_temp.avito_bid_claim();
 perform pg_temp.avito_bid_finish_item(base,'2',(claim->>'lease')::uuid,'applied',null);
 if not exists(select 1 from pg_temp.avito_bid_jobs where id=base and status='complete') then raise exception 'Retried queue did not complete';end if;
 -- A later paid intent must never be overwritten by resuming an older disable job.
 insert into pg_temp.avito_bid_jobs(id,module,organization_id,account_id,actor_id,credential_version,intent,item_count,status,confirmation_seq,confirmed_at,draft_expires_at)
 values(paid,'personal',org,acct,actor,'v1','{"mode":"manual"}',1,'complete',2,now(),now()+interval '10 minutes');
 insert into pg_temp.avito_bid_items(job_id,item_id,module,organization_id,account_id,ordinal,status) values(paid,'3','personal',org,acct,1,'applied');
 update pg_temp.avito_bid_items set status='unknown' where job_id=base and item_id='3';
 update pg_temp.avito_bid_items set status='rejected' where job_id=base and item_id='2';
 update pg_temp.avito_bid_jobs set status='partial' where id=base;
 perform pg_temp.avito_bid_resume(base,'personal',org,acct,actor);
 if not exists(select 1 from pg_temp.avito_bid_items where job_id=base and item_id='1' and status='applied') or not exists(select 1 from pg_temp.avito_bid_items where job_id=base and item_id='2' and status='pending') or not exists(select 1 from pg_temp.avito_bid_items where job_id=base and item_id='3' and status='superseded') then raise exception 'Resume replayed completed or superseded work';end if;
 -- Paid changes retain their single-shot fail-closed behavior.
 update pg_temp.avito_bid_jobs set status='cancelled' where id=base;
 update pg_temp.avito_bid_items set status='cancelled' where job_id=base and status='pending';
 update pg_temp.avito_bid_jobs set status='queued' where id=paid;
 update pg_temp.avito_bid_items set status='pending',attempts=0 where job_id=paid;
 claim:=pg_temp.avito_bid_claim();
 perform pg_temp.avito_bid_finish_item(paid,'3',(claim->>'lease')::uuid,'unknown','bidding_result_unknown');
 if not exists(select 1 from pg_temp.avito_bid_jobs where id=paid and status='blocked') then raise exception 'Paid uncertainty was incorrectly retried';end if;
end $test$;
select 'old failure reproduced; base readback, retry, resume and paid safety passed' as result;
