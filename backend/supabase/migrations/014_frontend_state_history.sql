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
  if p_key not in (
    'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
    'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha'
  ) then
    raise exception 'History key is not allowed';
  end if;

  select organization_id into v_org
  from public.organization_members
  where user_id=auth.uid() and role in ('owner','admin')
  order by case role when 'owner' then 0 else 1 end, created_at asc
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
