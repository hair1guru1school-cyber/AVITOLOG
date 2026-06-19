begin;

alter table public.projects alter column client_id drop not null;

create table if not exists public.task_activity_log (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null, project_id uuid references public.projects(id) on delete set null,
  action text not null, occurred_at timestamptz, legacy_key text not null, details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(organization_id,legacy_key)
);
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, stage text not null default 'weekly', goal_date date, legacy_key text not null,
  details jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,legacy_key)
);
create table if not exists public.goal_month_states (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade, snapshot_month date not null, stage text not null,
  source_key text not null, record_index integer not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(organization_id,source_key,record_index)
);
create table if not exists public.goal_achievements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_key text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(organization_id,legacy_key)
);

create index if not exists task_activity_org_idx on public.task_activity_log(organization_id,occurred_at);
create index if not exists goal_states_month_idx on public.goal_month_states(organization_id,snapshot_month);
drop trigger if exists goals_updated_at on public.goals;
create trigger goals_updated_at before update on public.goals for each row execute function public.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['task_activity_log','goals','goal_month_states','goal_achievements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I_select on public.%I',t,t);
    execute format('create policy %I_select on public.%I for select using(public.is_org_member(organization_id))',t,t);
    execute format('drop policy if exists %I_write on public.%I',t,t);
    execute format('create policy %I_write on public.%I for all using(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[])) with check(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t,t);
  end loop;
end $$;

create or replace function public.import_work_management(
  p_checksum text,p_projects jsonb,p_tasks jsonb,p_logs jsonb,p_goals jsonb,p_goal_states jsonb,p_achievements jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_org uuid;v_run uuid;v jsonb;v_id uuid;v_client uuid;v_project uuid;v_task uuid;
declare c_projects int:=0;c_tasks int:=0;c_logs int:=0;c_goals int:=0;c_states int:=0;c_achievements int:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_array_length(p_projects)<>74 or jsonb_array_length(p_tasks)<>77 or jsonb_array_length(p_logs)<>127 or jsonb_array_length(p_goals)<>127 or jsonb_array_length(p_goal_states)<>301 or jsonb_array_length(p_achievements)<>2 then raise exception 'Approved work import counts changed'; end if;
  select organization_id,migration_run_id into v_org,v_run from public.migration_source_snapshots where checksum=p_checksum limit 1;
  if v_org is null then raise exception 'Snapshot not found'; end if;
  if not public.has_org_role(v_org,array['owner','admin']::public.organization_role[]) then raise exception 'Owner or admin required'; end if;

  for v in select value from jsonb_array_elements(p_projects) loop
    v_client:=null;
    if nullif(v->>'client_legacy_key','') is not null then select id into v_client from public.clients where organization_id=v_org and legacy_key=v->>'client_legacy_key' limit 1; end if;
    insert into public.projects(organization_id,client_id,name,status,details,legacy_source,legacy_key,created_by)
    values(v_org,v_client,v->>'name',(v->>'status')::public.project_status,coalesce(v->'details','{}'), 'avitolog-fil-backup-v1',v->>'legacy_key',auth.uid())
    on conflict(organization_id,legacy_source,legacy_key) do update set client_id=excluded.client_id,name=excluded.name,status=excluded.status,details=excluded.details,deleted_at=null
    returning id into v_project;c_projects:=c_projects+1;
  end loop;

  for v in select value from jsonb_array_elements(p_tasks) loop
    v_project:=null;if nullif(v->>'project_legacy_key','') is not null then select id into v_project from public.projects where organization_id=v_org and legacy_key=v->>'project_legacy_key' limit 1;end if;
    insert into public.tasks(organization_id,project_id,title,description,status,priority,due_at,details,legacy_source,legacy_key,created_by)
    values(v_org,v_project,v->>'title',nullif(v->>'description',''),v->>'status',coalesce((v->>'priority')::smallint,0),nullif(v->>'due_on','')::date,coalesce(v->'details','{}'),'avitolog-fil-backup-v1',v->>'legacy_key',auth.uid())
    on conflict(organization_id,legacy_source,legacy_key) do update set project_id=excluded.project_id,title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,due_at=excluded.due_at,details=excluded.details
    returning id into v_task;c_tasks:=c_tasks+1;
  end loop;

  for v in select value from jsonb_array_elements(p_logs) loop
    v_task:=null;v_project:=null;
    if nullif(v->>'task_legacy_key','') is not null then select id into v_task from public.tasks where organization_id=v_org and legacy_key=v->>'task_legacy_key' limit 1;end if;
    if nullif(v->>'project_legacy_key','') is not null then select id into v_project from public.projects where organization_id=v_org and legacy_key=v->>'project_legacy_key' limit 1;end if;
    insert into public.task_activity_log(organization_id,task_id,project_id,action,occurred_at,legacy_key,details,created_by)
    values(v_org,v_task,v_project,v->>'action',case when coalesce((v->>'occurred_at')::bigint,0)>0 then to_timestamp((v->>'occurred_at')::double precision/1000) end,v->>'legacy_key',coalesce(v->'details','{}'),auth.uid())
    on conflict(organization_id,legacy_key) do update set task_id=excluded.task_id,project_id=excluded.project_id,action=excluded.action,occurred_at=excluded.occurred_at,details=excluded.details;c_logs:=c_logs+1;
  end loop;

  for v in select value from jsonb_array_elements(p_goals) loop
    insert into public.goals(organization_id,name,stage,goal_date,legacy_key,details,created_by)
    values(v_org,v->>'name',v->>'stage',nullif(v->>'goal_date','')::date,v->>'legacy_key',coalesce(v->'details','{}'),auth.uid())
    on conflict(organization_id,legacy_key) do update set name=excluded.name,stage=excluded.stage,goal_date=excluded.goal_date,details=excluded.details
    returning id into v_id;c_goals:=c_goals+1;
  end loop;

  for v in select value from jsonb_array_elements(p_goal_states) loop
    select id into v_id from public.goals where organization_id=v_org and legacy_key=v->>'goal_legacy_key';
    insert into public.goal_month_states(organization_id,goal_id,snapshot_month,stage,source_key,record_index,details)
    values(v_org,v_id,(v->>'snapshot_month')::date,v->>'stage',v->>'source_key',(v->>'record_index')::int,coalesce(v->'details','{}'))
    on conflict(organization_id,source_key,record_index) do update set goal_id=excluded.goal_id,snapshot_month=excluded.snapshot_month,stage=excluded.stage,details=excluded.details;c_states:=c_states+1;
  end loop;

  for v in select value from jsonb_array_elements(p_achievements) loop
    insert into public.goal_achievements(organization_id,legacy_key,details) values(v_org,v->>'legacy_key',coalesce(v->'details','{}'))
    on conflict(organization_id,legacy_key) do update set details=excluded.details;c_achievements:=c_achievements+1;
  end loop;
  update public.migration_runs set status='work_imported',summary=summary||jsonb_build_object('work_import',jsonb_build_object('projects',c_projects,'tasks',c_tasks,'logs',c_logs,'goals',c_goals,'goal_states',c_states,'achievements',c_achievements,'imported_at',now())) where id=v_run;
  return jsonb_build_object('projects',c_projects,'tasks',c_tasks,'logs',c_logs,'goals',c_goals,'goal_states',c_states,'achievements',c_achievements,'migration_run_id',v_run);
end $$;

revoke all on function public.import_work_management(text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public;
grant execute on function public.import_work_management(text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
commit;
