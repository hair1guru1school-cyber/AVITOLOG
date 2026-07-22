-- Fix restore history query ambiguity and keep frontend-state key whitelist
-- in sync for KP presets/groups and other app-owned state keys.

alter table public.frontend_state_records
drop constraint if exists frontend_state_records_storage_key_check;

alter table public.frontend_state_records
add constraint frontend_state_records_storage_key_check check (
  storage_key in (
    'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
    'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha',
    'avito_kp_saved_client_packages_v1', 'avito_kp_custom',
    'avitolog_aoax_autoloads_v1'
  )
  or storage_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
  or storage_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_kp_'
  or storage_key ~ '^crm_ads_(expenses_v1|expenses_month_[0-9]{4}-[0-9]{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$'
);

create or replace function public.upsert_frontend_state(p_key text,p_value text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  v_org uuid;
  v_role public.organization_role;
  v_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    p_key in (
      'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
      'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha',
      'avito_kp_saved_client_packages_v1', 'avito_kp_custom',
      'avitolog_aoax_autoloads_v1'
    )
    or p_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
    or p_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
    or p_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
    or p_key ~ '^avitolog_kp_'
    or p_key ~ '^crm_ads_(expenses_v1|expenses_month_[0-9]{4}-[0-9]{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$'
  ) then raise exception 'Storage key is not allowed'; end if;
  if p_value is null or length(p_value)>25000000 then raise exception 'Invalid storage value'; end if;

  if p_key ~ '_sasha($|_)' then
    select om.organization_id, om.role into v_org, v_role
    from public.organization_members om
    where om.user_id=auth.uid() and om.role in ('manager','owner','admin')
    order by case om.role when 'manager' then 0 when 'owner' then 1 else 2 end, om.created_at asc
    limit 1;
  else
    select om.organization_id, om.role into v_org, v_role
    from public.organization_members om
    where om.user_id=auth.uid() and om.role in ('owner','admin','manager')
    order by case om.role when 'owner' then 0 when 'admin' then 1 else 2 end, om.created_at asc
    limit 1;
  end if;

  if v_org is null then raise exception 'Organization membership required'; end if;
  if v_role='manager' and p_key !~ '_sasha($|_)' and p_key <> 'avitolog_aoax_autoloads_v1' then
    raise exception 'Manager can write only Sasha profile data';
  end if;

  insert into public.frontend_state_records(organization_id,storage_key,value_text,updated_by)
  values(v_org,p_key,p_value,auth.uid())
  on conflict(organization_id,storage_key) do update set
    value_text=excluded.value_text,
    revision=public.frontend_state_records.revision+1,
    updated_by=auth.uid()
  returning revision into v_revision;

  return jsonb_build_object('storage_key',p_key,'revision',v_revision,'updated_at',now());
end $$;

revoke all on function public.upsert_frontend_state(text,text) from public;
grant execute on function public.upsert_frontend_state(text,text) to authenticated;

create or replace function public.read_frontend_state(p_sasha boolean default false)
returns table(storage_key text,value_text text,revision bigint,updated_at timestamptz)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if p_sasha then
    select om.organization_id into v_org
    from public.organization_members om
    where om.user_id=auth.uid() and om.role in ('manager','owner','admin')
    order by case om.role when 'manager' then 0 when 'owner' then 1 else 2 end, om.created_at asc
    limit 1;
  else
    select om.organization_id into v_org
    from public.organization_members om
    where om.user_id=auth.uid() and om.role in ('owner','admin','manager')
    order by case om.role when 'owner' then 0 when 'admin' then 1 else 2 end, om.created_at asc
    limit 1;
  end if;

  if v_org is null then raise exception 'Organization membership required'; end if;

  return query
  select r.storage_key, r.value_text, r.revision, r.updated_at
  from public.frontend_state_records r
  where r.organization_id = v_org
  order by r.storage_key;
end $$;

revoke all on function public.read_frontend_state(boolean) from public;
grant execute on function public.read_frontend_state(boolean) to authenticated;

create or replace function public.frontend_state_history(p_key text, p_limit integer default 25)
returns table(
  audit_id bigint,
  action text,
  created_at timestamptz,
  revision bigint,
  value_text text
)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    p_key in (
      'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
      'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha',
      'avito_kp_saved_client_packages_v1', 'avito_kp_custom',
      'avitolog_aoax_autoloads_v1'
    )
    or p_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
    or p_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
    or p_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
    or p_key ~ '^avitolog_kp_'
    or p_key ~ '^crm_ads_(expenses_v1|expenses_month_[0-9]{4}-[0-9]{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$'
  ) then
    raise exception 'History key is not allowed';
  end if;

  select om.organization_id into v_org
  from public.organization_members om
  where om.user_id=auth.uid() and om.role in ('owner','admin')
  order by case om.role when 'owner' then 0 else 1 end, om.created_at asc
  limit 1;

  if v_org is null then raise exception 'Owner or admin role required'; end if;

  return query
  select
    a.id as audit_id,
    a.action,
    a.created_at,
    coalesce(
      nullif(a.new_data->>'revision','')::bigint,
      nullif(a.old_data->>'revision','')::bigint
    ) as revision,
    coalesce(a.new_data->>'value_text', a.old_data->>'value_text') as value_text
  from public.audit_log a
  where a.organization_id = v_org
    and a.table_name = 'frontend_state_records'
    and coalesce(a.new_data->>'storage_key', a.old_data->>'storage_key') = p_key
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit,25), 100));
end $$;

revoke all on function public.frontend_state_history(text,integer) from public;
grant execute on function public.frontend_state_history(text,integer) to authenticated;
