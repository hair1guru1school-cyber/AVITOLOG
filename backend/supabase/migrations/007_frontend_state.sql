begin;

create table if not exists public.frontend_state_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_key text not null check (storage_key in ('avitolog_clients', 'avitolog_projects')),
  value_text text not null,
  revision bigint not null default 1,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, storage_key)
);

drop trigger if exists frontend_state_records_updated_at on public.frontend_state_records;
create trigger frontend_state_records_updated_at
before update on public.frontend_state_records
for each row execute function public.set_updated_at();

drop trigger if exists frontend_state_records_audit on public.frontend_state_records;
create trigger frontend_state_records_audit
after insert or update or delete on public.frontend_state_records
for each row execute function public.write_audit_log();

alter table public.frontend_state_records enable row level security;

drop policy if exists frontend_state_records_select on public.frontend_state_records;
create policy frontend_state_records_select on public.frontend_state_records
for select using (public.is_org_member(organization_id));

drop policy if exists frontend_state_records_write on public.frontend_state_records;
create policy frontend_state_records_write on public.frontend_state_records
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create or replace function public.upsert_frontend_state(p_key text, p_value text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_key not in ('avitolog_clients', 'avitolog_projects') then raise exception 'Storage key is not allowed'; end if;
  if p_value is null or length(p_value) > 25000000 then raise exception 'Invalid storage value'; end if;

  select organization_id into v_org
  from public.organization_members
  where user_id = auth.uid() and role in ('owner','admin')
  order by case role when 'owner' then 0 else 1 end
  limit 1;

  if v_org is null then raise exception 'Owner or admin role required'; end if;

  insert into public.frontend_state_records (organization_id, storage_key, value_text, updated_by)
  values (v_org, p_key, p_value, auth.uid())
  on conflict (organization_id, storage_key) do update set
    value_text = excluded.value_text,
    revision = public.frontend_state_records.revision + 1,
    updated_by = auth.uid()
  returning revision into v_revision;

  return jsonb_build_object('storage_key', p_key, 'revision', v_revision, 'updated_at', now());
end;
$$;

grant select on public.frontend_state_records to authenticated;
revoke all on function public.upsert_frontend_state(text,text) from public;
grant execute on function public.upsert_frontend_state(text,text) to authenticated;

commit;
