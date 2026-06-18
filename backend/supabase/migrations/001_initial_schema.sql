begin;

create extension if not exists pgcrypto;
create type public.organization_role as enum ('owner', 'admin', 'manager', 'viewer');
create type public.project_status as enum ('lead', 'active', 'paused', 'completed', 'archived');
create type public.document_status as enum ('draft', 'ready', 'sent', 'accepted', 'cancelled');
create type public.payment_status as enum ('planned', 'invoiced', 'paid', 'refunded', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'viewer', created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null, contact_name text, client_type text, phone text, email text, telegram text,
  avito_url text, niche text, geography text, notes text, drive_folder_id text, drive_folder_url text,
  legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (organization_id, legacy_source, legacy_key)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict, name text not null,
  status public.project_status not null default 'lead', starts_on date, ends_on date,
  budget numeric(14,2), currency text not null default 'RUB', details jsonb not null default '{}'::jsonb,
  legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (organization_id, legacy_source, legacy_key)
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict, project_id uuid references public.projects(id) on delete set null,
  status public.document_status not null default 'draft', title text not null default 'Коммерческое предложение',
  package_data jsonb not null default '{}'::jsonb, total_amount numeric(14,2), currency text not null default 'RUB',
  drive_file_id text, drive_file_url text, legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, legacy_source, legacy_key)
);
create table public.contracts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict, project_id uuid references public.projects(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null, status public.document_status not null default 'draft',
  contract_number text, starts_on date, ends_on date, total_amount numeric(14,2), currency text not null default 'RUB',
  contract_data jsonb not null default '{}'::jsonb, contract_drive_file_id text, appendix_drive_file_id text,
  legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, legacy_source, legacy_key)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict, project_id uuid references public.projects(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null, status public.payment_status not null default 'planned',
  amount numeric(14,2) not null check (amount >= 0), currency text not null default 'RUB', due_on date, paid_at timestamptz,
  details jsonb not null default '{}'::jsonb, legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, legacy_source, legacy_key)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null, project_id uuid references public.projects(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null, title text not null, description text,
  status text not null default 'open', priority smallint not null default 0, due_at timestamptz, completed_at timestamptz,
  details jsonb not null default '{}'::jsonb, legacy_source text, legacy_key text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, legacy_source, legacy_key)
);
create table public.google_drive_connections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  connection_type text not null check (connection_type in ('oauth', 'service_account')),
  google_account_email text, encrypted_refresh_token text, scopes text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, user_id, connection_type)
);
create table public.migration_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null, status text not null default 'started', summary jsonb not null default '{}'::jsonb,
  started_by uuid references auth.users(id), started_at timestamptz not null default now(), finished_at timestamptz
);
create table public.legacy_import_map (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null, entity_type text not null, legacy_key text not null, entity_id uuid not null,
  imported_at timestamptz not null default now(), primary key (organization_id, source, entity_type, legacy_key)
);
create table public.audit_log (
  id bigint generated always as identity primary key, organization_id uuid, actor_id uuid,
  table_name text not null, record_id uuid, action text not null, old_data jsonb, new_data jsonb,
  created_at timestamptz not null default now()
);

create index clients_org_idx on public.clients(organization_id) where deleted_at is null;
create index projects_client_idx on public.projects(client_id) where deleted_at is null;
create index tasks_project_idx on public.tasks(project_id);
create index audit_org_created_idx on public.audit_log(organization_id, created_at desc);

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create function public.is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid())
$$;
create function public.has_org_role(target_org uuid, allowed public.organization_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where organization_id=target_org and user_id=auth.uid() and role=any(allowed))
$$;
create function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations(name,created_by) values(org_name,auth.uid()) returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end; $$;
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,display_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1))) on conflict(id) do nothing;
  return new;
end; $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.handle_new_user();
create function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare payload jsonb; org_id uuid; row_id uuid;
begin
  payload=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  org_id=nullif(payload->>'organization_id','')::uuid; row_id=nullif(payload->>'id','')::uuid;
  insert into public.audit_log(organization_id,actor_id,table_name,record_id,action,old_data,new_data)
  values(org_id,auth.uid(),tg_table_name,row_id,tg_op,case when tg_op in('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op='DELETE' then old else new end;
end; $$;

do $$ declare t text; begin
  foreach t in array array['profiles','organizations','clients','projects','proposals','contracts','payments','tasks','google_drive_connections'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
  end loop;
  foreach t in array array['clients','projects','proposals','contracts','payments','tasks','google_drive_connections'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','organizations','organization_members','clients','projects','proposals','contracts','payments','tasks','google_drive_connections','migration_runs','legacy_import_map','audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy profiles_self_select on public.profiles for select using(id=auth.uid());
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy organizations_member_select on public.organizations for select using(public.is_org_member(id));
create policy organizations_admin_update on public.organizations for update using(public.has_org_role(id,array['owner','admin']::public.organization_role[]));
create policy members_member_select on public.organization_members for select using(public.is_org_member(organization_id));
create policy members_owner_write on public.organization_members for all using(public.has_org_role(organization_id,array['owner']::public.organization_role[])) with check(public.has_org_role(organization_id,array['owner']::public.organization_role[]));

do $$ declare t text; begin
  foreach t in array array['clients','projects','proposals','contracts','payments','tasks'] loop
    execute format('create policy %I_select on public.%I for select using(public.is_org_member(organization_id))',t,t);
    execute format('create policy %I_insert on public.%I for insert with check(public.has_org_role(organization_id,array[''owner'',''admin'',''manager'']::public.organization_role[]))',t,t);
    execute format('create policy %I_update on public.%I for update using(public.has_org_role(organization_id,array[''owner'',''admin'',''manager'']::public.organization_role[])) with check(public.has_org_role(organization_id,array[''owner'',''admin'',''manager'']::public.organization_role[]))',t,t);
    execute format('create policy %I_delete on public.%I for delete using(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t,t);
  end loop;
end $$;

create policy drive_read on public.google_drive_connections for select using(user_id=auth.uid() or public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy drive_write on public.google_drive_connections for all using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_org_member(organization_id));
create policy migrations_admin on public.migration_runs for all using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy legacy_map_admin on public.legacy_import_map for all using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy audit_admin_select on public.audit_log for select using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid,public.organization_role[]) to authenticated;

commit;
