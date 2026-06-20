begin;

alter table public.frontend_state_records
drop constraint if exists frontend_state_records_storage_key_check;

alter table public.frontend_state_records
add constraint frontend_state_records_storage_key_check check (
  storage_key in (
    'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
    'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha',
    'avito_kp_saved_client_packages_v1', 'avito_kp_custom'
  )
  or storage_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
  or storage_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_kp_'
  or storage_key ~ '^crm_ads_(expenses_v1|expenses_month_[0-9]{4}-[0-9]{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$'
);

drop policy if exists frontend_state_records_select on public.frontend_state_records;
create policy frontend_state_records_select on public.frontend_state_records
for select using (
  public.has_org_role(organization_id, array['owner','admin']::public.organization_role[])
  or (
    public.has_org_role(organization_id, array['manager']::public.organization_role[])
    and storage_key ~ '_sasha($|_)'
  )
);

drop policy if exists frontend_state_records_write on public.frontend_state_records;
create policy frontend_state_records_write on public.frontend_state_records
for all
using (
  public.has_org_role(organization_id, array['owner','admin']::public.organization_role[])
  or (
    public.has_org_role(organization_id, array['manager']::public.organization_role[])
    and storage_key ~ '_sasha($|_)'
  )
)
with check (
  public.has_org_role(organization_id, array['owner','admin']::public.organization_role[])
  or (
    public.has_org_role(organization_id, array['manager']::public.organization_role[])
    and storage_key ~ '_sasha($|_)'
  )
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
      'avito_kp_saved_client_packages_v1', 'avito_kp_custom'
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
  if v_role='manager' and p_key !~ '_sasha($|_)' then
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

create or replace function public.add_team_member_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select organization_id into v_org
  from public.organization_members
  where user_id=auth.uid() and role='owner'
  limit 1;
  if v_org is null then raise exception 'Owner role required'; end if;

  select id into v_user from public.profiles where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'User must sign up or accept Supabase invite first'; end if;

  insert into public.organization_members(organization_id,user_id,role)
  values(v_org,v_user,'manager')
  on conflict(organization_id,user_id) do update set role='manager';

  return jsonb_build_object('organization_id',v_org,'user_id',v_user,'email',lower(trim(p_email)),'role','manager');
end $$;

revoke all on function public.add_team_member_by_email(text) from public;
grant execute on function public.add_team_member_by_email(text) to authenticated;

commit;
