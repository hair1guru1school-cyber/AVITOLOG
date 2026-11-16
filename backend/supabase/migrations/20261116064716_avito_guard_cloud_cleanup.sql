create or replace function public.avito_guard_cloud_claim(p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 'events',coalesce((select jsonb_agg(e) from(select id,item_id,title from public.avito_guard_events e where e.settings_id=c.settings_id and e.severity='quarantine' and e.created_at>now()-interval '1 hour' and e.created_at>=c.updated_at and not exists(select 1 from public.avito_guard_cloud_actions a where a.event_id=e.id) order by e.created_at limit 20)e),'[]'::jsonb),
 'expired',coalesce((select jsonb_agg(v) from(select id,object_key from public.avito_guard_cloud_versions where settings_id=c.settings_id and deleted_at is null and created_at<now()-make_interval(hours=>c.retention_hours) order by created_at limit 20)v),'[]'::jsonb));
end $$;

create or replace function public.avito_guard_cloud_batch(p_id uuid,p_lease uuid,p_revision bigint,p_batch uuid,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
begin perform public.avito_guard_cloud_validate(p_id,p_lease,p_revision);if p_state not in('publishing','applied','conflict','review') then raise exception 'Invalid state';end if;
 if p_state='publishing' then update public.avito_guard_cloud_versions v set created_at=now() from public.avito_guard_cloud_batches b where b.id=p_batch and b.settings_id=p_id and b.state='prepared' and v.id=b.backup_id;end if;
 update public.avito_guard_cloud_batches set state=p_state,updated_at=now() where id=p_batch and settings_id=p_id and state in('prepared','publishing');
 if not found then raise exception 'Batch changed';end if;
 if p_state='applied' then update public.avito_guard_cloud set last_published_at=now() where settings_id=p_id;end if;return true;end $$;

create function public.avito_guard_cloud_tick() returns bigint language plpgsql security invoker set search_path='' as $$
declare ts text;nonce text;secret text;result bigint;
begin
 if not exists(select 1 from public.avito_guard_cloud where has_credentials and next_cleanup_at<=now() and (lease_until is null or lease_until<now())) then return null;end if;
 ts:=floor(extract(epoch from clock_timestamp()))::bigint::text;nonce:=gen_random_uuid()::text;secret:=public.avito_bid_worker_key();
 select net.http_post(url:='https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-protection-worker',headers:=jsonb_build_object('Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlleHJuYnZpbW5uYmVicnZma2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTM2NjMsImV4cCI6MjA5NzM2OTY2M30.0mgPfQdtYuQcMcnFbjQK2bdDU_zbxPIjN5wTSLEpo3w','x-bid-time',ts,'x-bid-nonce',nonce,'x-bid-signature',encode(extensions.hmac(ts||'|'||nonce,secret,'sha256'),'hex')),body:='{}'::jsonb,timeout_milliseconds:=120000) into result;
 return result;
end $$;
revoke all on function public.avito_guard_cloud_tick() from public,anon,authenticated;
grant execute on function public.avito_guard_cloud_tick() to service_role;
select cron.schedule('avito-protection-cloud-cleanup','*/5 * * * *','select public.avito_guard_cloud_tick();');
