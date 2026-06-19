begin;

create table if not exists public.cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  owner_scope text not null check (owner_scope in ('owner','sasha')),
  ledger_month date not null,
  name text not null,
  received_amount numeric(14,2) not null default 0,
  legacy_paid_amount numeric(14,2) not null default 0,
  expected_amount numeric(14,2) not null default 0,
  sold_for_amount numeric(14,2) not null default 0,
  to_agent_amount numeric(14,2) not null default 0,
  aoa_percent numeric(8,3) not null default 0,
  payment_date date,
  start_date date,
  client_type text,
  drive_folder_id text,
  drive_folder_url text,
  source_key text not null,
  record_index integer not null,
  source_checksum text not null,
  legacy_key text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_key)
);

create table if not exists public.cash_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ledger_entry_id uuid not null references public.cash_ledger_entries(id) on delete cascade,
  event_index integer not null,
  event_type text not null check (event_type in ('received','client_payment','legacy_balance')),
  occurred_on date,
  amount numeric(14,2) not null,
  synthesized boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (ledger_entry_id, event_index)
);

create index if not exists cash_ledger_org_month_idx on public.cash_ledger_entries(organization_id, ledger_month, owner_scope);
create index if not exists cash_ledger_client_idx on public.cash_ledger_entries(client_id) where client_id is not null;
create index if not exists cash_events_entry_date_idx on public.cash_payment_events(ledger_entry_id, occurred_on);

drop trigger if exists cash_ledger_entries_updated_at on public.cash_ledger_entries;
create trigger cash_ledger_entries_updated_at before update on public.cash_ledger_entries
for each row execute function public.set_updated_at();

drop trigger if exists cash_ledger_entries_audit on public.cash_ledger_entries;
create trigger cash_ledger_entries_audit after insert or update or delete on public.cash_ledger_entries
for each row execute function public.write_audit_log();

drop trigger if exists cash_payment_events_audit on public.cash_payment_events;
create trigger cash_payment_events_audit after insert or update or delete on public.cash_payment_events
for each row execute function public.write_audit_log();

alter table public.cash_ledger_entries enable row level security;
alter table public.cash_payment_events enable row level security;

drop policy if exists cash_ledger_select on public.cash_ledger_entries;
create policy cash_ledger_select on public.cash_ledger_entries for select using(public.is_org_member(organization_id));
drop policy if exists cash_ledger_write on public.cash_ledger_entries;
create policy cash_ledger_write on public.cash_ledger_entries for all
using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]))
with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

drop policy if exists cash_events_select on public.cash_payment_events;
create policy cash_events_select on public.cash_payment_events for select using(public.is_org_member(organization_id));
drop policy if exists cash_events_write on public.cash_payment_events;
create policy cash_events_write on public.cash_payment_events for all
using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]))
with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

create or replace function public.import_cash_ledger(
  p_checksum text,
  p_entries jsonb,
  p_events jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid;
  v_run_id uuid;
  v_entry jsonb;
  v_event jsonb;
  v_entry_id uuid;
  v_client_id uuid;
  v_project_id uuid;
  v_entries_count integer := 0;
  v_events_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_checksum !~ '^[a-f0-9]{64}$' then raise exception 'Invalid snapshot checksum'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_typeof(p_events) <> 'array' then raise exception 'Entries and events must be arrays'; end if;
  if jsonb_array_length(p_entries) <> 108 or jsonb_array_length(p_events) <> 92 then raise exception 'Approved cash import counts changed'; end if;

  select organization_id, migration_run_id into v_org_id, v_run_id
  from public.migration_source_snapshots where checksum = p_checksum limit 1;
  if v_org_id is null then raise exception 'Snapshot not found'; end if;
  if not public.has_org_role(v_org_id,array['owner','admin']::public.organization_role[]) then raise exception 'Owner or admin role required'; end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    v_client_id := null; v_project_id := null;
    if nullif(v_entry->>'drive_folder_id','') is not null then
      select id into v_client_id from public.clients where organization_id=v_org_id and drive_folder_id=v_entry->>'drive_folder_id' and deleted_at is null limit 1;
    end if;
    if nullif(v_entry->'details'->>'goalProjectId','') is not null then
      select id into v_project_id from public.projects where organization_id=v_org_id and legacy_key='project:'||(v_entry->'details'->>'goalProjectId') and deleted_at is null limit 1;
    end if;
    insert into public.cash_ledger_entries (
      organization_id,client_id,project_id,owner_scope,ledger_month,name,received_amount,legacy_paid_amount,
      expected_amount,sold_for_amount,to_agent_amount,aoa_percent,payment_date,start_date,client_type,
      drive_folder_id,drive_folder_url,source_key,record_index,source_checksum,legacy_key,details,created_by
    ) values (
      v_org_id,v_client_id,v_project_id,v_entry->>'owner_scope',(v_entry->>'ledger_month')::date,v_entry->>'name',
      coalesce((v_entry->>'received_amount')::numeric,0),coalesce((v_entry->>'legacy_paid_amount')::numeric,0),
      coalesce((v_entry->>'expected_amount')::numeric,0),coalesce((v_entry->>'sold_for_amount')::numeric,0),
      coalesce((v_entry->>'to_agent_amount')::numeric,0),coalesce((v_entry->>'aoa_percent')::numeric,0),
      nullif(v_entry->>'payment_date','')::date,nullif(v_entry->>'start_date','')::date,nullif(v_entry->>'client_type',''),
      nullif(v_entry->>'drive_folder_id',''),nullif(v_entry->>'drive_folder_url',''),v_entry->>'source_key',
      (v_entry->>'record_index')::integer,p_checksum,v_entry->>'legacy_key',coalesce(v_entry->'details','{}'::jsonb),auth.uid()
    ) on conflict (organization_id,legacy_key) do update set
      client_id=excluded.client_id,project_id=excluded.project_id,owner_scope=excluded.owner_scope,ledger_month=excluded.ledger_month,
      name=excluded.name,received_amount=excluded.received_amount,legacy_paid_amount=excluded.legacy_paid_amount,
      expected_amount=excluded.expected_amount,sold_for_amount=excluded.sold_for_amount,to_agent_amount=excluded.to_agent_amount,
      aoa_percent=excluded.aoa_percent,payment_date=excluded.payment_date,start_date=excluded.start_date,client_type=excluded.client_type,
      drive_folder_id=excluded.drive_folder_id,drive_folder_url=excluded.drive_folder_url,source_checksum=excluded.source_checksum,details=excluded.details
    returning id into v_entry_id;
    v_entries_count := v_entries_count + 1;
  end loop;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    select id into v_entry_id from public.cash_ledger_entries where organization_id=v_org_id and legacy_key=v_event->>'ledger_legacy_key';
    if v_entry_id is null then raise exception 'Cash ledger entry not found for event'; end if;
    insert into public.cash_payment_events (
      organization_id,ledger_entry_id,event_index,event_type,occurred_on,amount,synthesized,details,created_by
    ) values (
      v_org_id,v_entry_id,(v_event->>'event_index')::integer,v_event->>'event_type',nullif(v_event->>'occurred_on','')::date,
      (v_event->>'amount')::numeric,coalesce((v_event->>'synthesized')::boolean,false),coalesce(v_event->'details','{}'::jsonb),auth.uid()
    ) on conflict (ledger_entry_id,event_index) do update set
      event_type=excluded.event_type,occurred_on=excluded.occurred_on,amount=excluded.amount,
      synthesized=excluded.synthesized,details=excluded.details;
    v_events_count := v_events_count + 1;
  end loop;

  update public.migration_runs set
    status='cash_imported',
    summary=summary||jsonb_build_object('cash_import',jsonb_build_object('entries',v_entries_count,'events',v_events_count,'snapshot_checksum',p_checksum,'imported_at',now()))
  where id=v_run_id;

  return jsonb_build_object('entries',v_entries_count,'events',v_events_count,'migration_run_id',v_run_id,'snapshot_checksum',p_checksum);
end;
$$;

revoke all on function public.import_cash_ledger(text,jsonb,jsonb) from public;
grant execute on function public.import_cash_ledger(text,jsonb,jsonb) to authenticated;

commit;
