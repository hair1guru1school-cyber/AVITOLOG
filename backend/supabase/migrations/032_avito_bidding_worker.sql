-- Worker endpoint must be deployed with verify_jwt=false. HMAC is mandatory.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;
do $$ begin
 if not exists(select 1 from vault.secrets where name='avito_bid_worker_hmac') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'avito_bid_worker_hmac');
 end if;
end $$;
create table public.avito_bid_worker_nonces(id uuid primary key,created_at timestamptz not null default now());
alter table public.avito_bid_worker_nonces enable row level security;
revoke all on public.avito_bid_worker_nonces from public,anon,authenticated;
grant all on public.avito_bid_worker_nonces to service_role;
create function public.avito_bid_worker_key() returns text language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='avito_bid_worker_hmac' limit 1
$$;
create function public.avito_bid_worker_nonce(p_nonce uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 delete from public.avito_bid_worker_nonces where created_at<now()-interval '5 minutes';
 insert into public.avito_bid_worker_nonces(id) values(p_nonce) on conflict do nothing;
 return found;
end $$;
create function public.avito_bid_tick() returns bigint language plpgsql security definer set search_path='' as $$
declare ts text; nonce text; secret text; result bigint;
begin
 if not exists(select 1 from public.avito_bid_jobs where status in('queued','running') and expires_at>now()) then return null;end if;
 ts:=floor(extract(epoch from clock_timestamp()))::bigint::text;nonce:=gen_random_uuid()::text;secret:=public.avito_bid_worker_key();
 select net.http_post(url:='https://iexrnbvimnnbebrvfkha.supabase.co/functions/v1/avito-bidding-worker',
 headers:=jsonb_build_object('x-bid-time',ts,'x-bid-nonce',nonce,'x-bid-signature',encode(extensions.hmac(ts||'|'||nonce,secret,'sha256'),'hex')),
 body:='{}'::jsonb,timeout_milliseconds:=120000) into result;
 return result;
end $$;
revoke all on function public.avito_bid_worker_key(),public.avito_bid_worker_nonce(uuid),public.avito_bid_tick() from public,anon,authenticated;
grant execute on function public.avito_bid_worker_key(),public.avito_bid_worker_nonce(uuid),public.avito_bid_tick() to service_role;
select cron.schedule('avito-bidding-worker','30 seconds','select public.avito_bid_tick()');
commit;
