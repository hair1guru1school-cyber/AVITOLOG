-- Sasha can have his own personal organization after sign-up. For *_sasha
-- frontend-state keys we must write into Fil's shared organization where
-- Sasha is manager, otherwise Fil cannot see Sasha CRM/projects.

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
    select organization_id, role into v_org, v_role
    from public.organization_members
    where user_id=auth.uid() and role in ('manager','owner','admin')
    order by case role when 'manager' then 0 when 'owner' then 1 else 2 end, created_at asc
    limit 1;
  else
    select organization_id, role into v_org, v_role
    from public.organization_members
    where user_id=auth.uid() and role in ('owner','admin','manager')
    order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at asc
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
    select organization_id into v_org
    from public.organization_members
    where user_id=auth.uid() and role in ('manager','owner','admin')
    order by case role when 'manager' then 0 when 'owner' then 1 else 2 end, created_at asc
    limit 1;
  else
    select organization_id into v_org
    from public.organization_members
    where user_id=auth.uid() and role in ('owner','admin','manager')
    order by case role when 'owner' then 0 when 'admin' then 1 else 2 end, created_at asc
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
