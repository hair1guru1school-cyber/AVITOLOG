-- Allow AoA-X Excel bridge to save its autoload/project bindings through
-- the same guarded frontend state RPC as the AVITOLOG app.

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

  select organization_id, role into v_org, v_role
  from public.organization_members
  where user_id=auth.uid() and role in ('owner','admin','manager')
  order by case role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;

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
