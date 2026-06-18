begin;

create table if not exists public.migration_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null,
  source_created_at timestamptz,
  key_count integer not null default 0,
  checksum text not null,
  raw_backup jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, source, checksum)
);

create table if not exists public.migration_staging_records (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null,
  entity_type text not null,
  legacy_key text not null,
  record_index integer not null,
  raw_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'pending'
    check (resolution_status in ('ready', 'duplicate', 'unlinked', 'ambiguous', 'pending', 'resolved', 'imported', 'skipped')),
  resolution_note text,
  resolved_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (migration_run_id, entity_type, record_index)
);

create table if not exists public.migration_issues (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staging_record_id uuid references public.migration_staging_records(id) on delete cascade,
  issue_code text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error')),
  message text not null,
  candidates jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists migration_staging_run_idx
  on public.migration_staging_records(migration_run_id, entity_type, resolution_status);
create index if not exists migration_issues_run_idx
  on public.migration_issues(migration_run_id, resolved_at);
create index if not exists migration_snapshots_org_idx
  on public.migration_source_snapshots(organization_id, created_at desc);

create trigger migration_staging_records_updated_at
before update on public.migration_staging_records
for each row execute function public.set_updated_at();

alter table public.migration_source_snapshots enable row level security;
alter table public.migration_staging_records enable row level security;
alter table public.migration_issues enable row level security;

create policy migration_snapshots_admin on public.migration_source_snapshots
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy migration_staging_admin on public.migration_staging_records
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy migration_issues_admin on public.migration_issues
for all
using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

commit;
