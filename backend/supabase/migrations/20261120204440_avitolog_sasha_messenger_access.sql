-- A service-only permission check; the Edge handlers verify the caller's JWT first.
create or replace function public.avito_messenger_actor_allowed(p_organization_id uuid, p_actor_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id and user_id = p_actor_id
      and (role in ('owner', 'admin') or (
        p_organization_id = '2d775d05-277d-4955-82cd-f2abfaa25311'::uuid
        and p_actor_id = 'd1915d6d-2f70-4c75-be95-454dd1b64dce'::uuid
        and role = 'manager'
      ))
  );
$$;
revoke all on function public.avito_messenger_actor_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.avito_messenger_actor_allowed(uuid, uuid) to service_role;

create policy avito_personal_accounts_sasha_messenger_read
on public.avito_personal_accounts for select to authenticated
using (
  organization_id = '2d775d05-277d-4955-82cd-f2abfaa25311'::uuid
  and (select auth.uid()) = 'd1915d6d-2f70-4c75-be95-454dd1b64dce'::uuid
  and public.has_org_role(organization_id, array['manager']::public.organization_role[])
);

CREATE OR REPLACE FUNCTION public.avito_accounts_update_token(p_organization_id uuid, p_account_id uuid, p_actor_id uuid, p_expected_version uuid, p_credential_version uuid, p_token_expires_at timestamp with time zone, p_encrypted_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.avito_messenger_actor_allowed(p_organization_id, p_actor_id) then raise exception 'Permission denied' using errcode='42501'; end if;
  perform 1 from public.avito_personal_accounts where id=p_account_id and organization_id=p_organization_id and status='connected' and credential_version=p_expected_version for update;
  if not found then return false; end if;
  if p_token_expires_at is null or p_token_expires_at<=now() or p_credential_version is null or p_credential_version=p_expected_version then raise exception 'Invalid token generation' using errcode='22023'; end if;
  update public.avito_personal_account_secrets set encrypted_payload=p_encrypted_payload,credential_version=p_credential_version,updated_at=now()
    where account_id=p_account_id and organization_id=p_organization_id and credential_version=p_expected_version;
  if not found then return false; end if;
  update public.avito_personal_accounts set token_expires_at=p_token_expires_at,credential_version=p_credential_version,updated_at=now() where id=p_account_id and organization_id=p_organization_id;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.avito_accounts_reserve_request(p_organization_id uuid, p_actor_id uuid, p_action text, p_account_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bucket_name text; maximum integer; window_length interval; counter integer;
begin
  if not (exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_actor_id and role in ('owner','admin')) or (p_action in ('read','renew') and public.avito_messenger_actor_allowed(p_organization_id, p_actor_id))) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_action='exchange' then bucket_name:='exchange'; maximum:=5; window_length:=interval '10 minutes';
  elsif p_action='read' then bucket_name:='read'; maximum:=60; window_length:=interval '1 minute';
  elsif p_action='renew' and p_account_id is not null then
    if not exists(select 1 from public.avito_personal_accounts where id=p_account_id and organization_id=p_organization_id and status='connected') then return false; end if;
    bucket_name:='renew:'||p_account_id::text; maximum:=5; window_length:=interval '10 minutes';
  elsif p_action='metrics' and p_account_id is not null then
    if not exists(select 1 from public.avito_personal_accounts where id=p_account_id and organization_id=p_organization_id and status='connected') then return false; end if;
    bucket_name:='metrics:'||p_account_id::text; maximum:=1; window_length:=interval '1 minute';
  else raise exception 'Invalid request' using errcode='22023'; end if;
  insert into public.avito_account_rate_limits(organization_id,bucket,window_started_at,request_count)
    values(p_organization_id,bucket_name,now(),1)
    on conflict(organization_id,bucket) do update set
      window_started_at=case when avito_account_rate_limits.window_started_at<=now()-window_length then now() else avito_account_rate_limits.window_started_at end,
      request_count=case when avito_account_rate_limits.window_started_at<=now()-window_length then 1 else least(avito_account_rate_limits.request_count+1,maximum+1) end
    returning request_count into counter;
  return counter<=maximum;
end $function$
;

CREATE OR REPLACE FUNCTION public.avito_invite_release_renewal(p_organization_id uuid, p_connection_id uuid, p_actor_id uuid, p_claim_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avito-oauth-invites:' || p_organization_id::text, 0));
  if not public.avito_messenger_actor_allowed(p_organization_id, p_actor_id) then
    raise exception 'Avito permission denied' using errcode = '42501';
  end if;
  delete from public.avito_invite_renewal_claims where organization_id = p_organization_id
    and connection_id = p_connection_id and claim_id = p_claim_id;
  return found;
end $function$
;

CREATE OR REPLACE FUNCTION public.avito_invite_reserve_request(p_organization_id uuid, p_actor_id uuid, p_action text, p_connection_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.avito_invite_require_admin(p_organization_id, p_actor_id) or (p_action = 'read' and public.avito_messenger_actor_allowed(p_organization_id, p_actor_id))) then
    raise exception 'Avito permission denied' using errcode = '42501';
  end if;
  if p_action = 'read' then
    return public.avito_invite_bump_rate(p_organization_id, 'read:' || p_actor_id::text, 30, interval '1 minute');
  elsif p_action = 'metrics' and p_connection_id is not null then
    perform 1 from public.avito_connections where organization_id = p_organization_id
      and id = p_connection_id and status = 'connected' for share;
    if not found then return false; end if;
    return public.avito_invite_bump_rate(p_organization_id, 'metrics:' || p_connection_id::text, 1, interval '1 minute');
  end if;
  raise exception 'Invalid request' using errcode = '22023';
end $function$
;

CREATE OR REPLACE FUNCTION public.avito_invite_claim_renewal(p_organization_id uuid, p_connection_id uuid, p_actor_id uuid, p_expected_version bigint, p_claim_id uuid, p_expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avito-oauth-invites:' || p_organization_id::text, 0));
  if not public.avito_messenger_actor_allowed(p_organization_id, p_actor_id) then
    raise exception 'Avito permission denied' using errcode = '42501';
  end if;
  if p_claim_id is null or p_expires_at is null or p_expires_at <= now() then return false; end if;
  perform 1 from public.avito_connections where organization_id = p_organization_id and id = p_connection_id
    and status = 'connected' and credential_version = p_expected_version for update;
  if not found or not exists(select 1 from public.avito_connection_secrets where connection_id = p_connection_id) then return false; end if;
  perform 1 from public.avito_invite_renewal_claims where connection_id = p_connection_id and expires_at > now() for update;
  if found then return false; end if;
  if not public.avito_invite_bump_rate(p_organization_id, 'renew:' || p_connection_id::text, 5, interval '10 minutes') then return false; end if;
  insert into public.avito_invite_renewal_claims(organization_id, connection_id, credential_version, claim_id, expires_at)
    values(p_organization_id, p_connection_id, p_expected_version, p_claim_id,
      least(p_expires_at, now() + interval '90 seconds'))
    on conflict(connection_id) do update set credential_version = excluded.credential_version,
      claim_id = excluded.claim_id, expires_at = excluded.expires_at, created_at = now();
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.avito_invite_update_token(p_organization_id uuid, p_connection_id uuid, p_actor_id uuid, p_expected_version bigint, p_claim_id uuid, p_token_expires_at timestamp with time zone, p_scopes text[], p_encrypted_tokens jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avito-oauth-invites:' || p_organization_id::text, 0));
  if not public.avito_messenger_actor_allowed(p_organization_id, p_actor_id) then
    raise exception 'Avito permission denied' using errcode = '42501';
  end if;
  perform 1 from public.avito_connections where organization_id = p_organization_id and id = p_connection_id
    and status = 'connected' and credential_version = p_expected_version for update;
  if not found then return false; end if;
  perform 1 from public.avito_invite_renewal_claims where organization_id = p_organization_id and connection_id = p_connection_id
    and credential_version = p_expected_version and claim_id = p_claim_id and expires_at > now() for update;
  if not found then return false; end if;
  if p_expected_version >= 9007199254740991 or p_token_expires_at is null or p_token_expires_at <= now()
    or p_token_expires_at > now() + interval '90 days' or not public.avito_invite_valid_tokens(p_encrypted_tokens)
    or coalesce(pg_catalog.cardinality(p_scopes), 0) > 50 then
    raise exception 'Invalid token generation' using errcode = '22023';
  end if;
  update public.avito_connection_secrets set encrypted_tokens = p_encrypted_tokens, updated_at = now()
    where connection_id = p_connection_id;
  if not found then return false; end if;
  update public.avito_connections set token_expires_at = p_token_expires_at,
    scopes = coalesce(p_scopes, scopes), credential_version = p_expected_version + 1, updated_at = now()
    where id = p_connection_id and organization_id = p_organization_id;
  delete from public.avito_invite_renewal_claims where connection_id = p_connection_id;
  return true;
end $function$
;

