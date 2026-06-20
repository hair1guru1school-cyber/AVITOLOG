begin;

alter table public.frontend_state_records
drop constraint if exists frontend_state_records_storage_key_check;

alter table public.frontend_state_records
add constraint frontend_state_records_storage_key_check check (
  storage_key in ('avitolog_clients', 'avitolog_projects')
  or storage_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
  or storage_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
);

create or replace function public.upsert_frontend_state(p_key text, p_value text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    p_key in ('avitolog_clients', 'avitolog_projects')
    or p_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
    or p_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
    or p_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  ) then raise exception 'Storage key is not allowed'; end if;
  if p_value is null or length(p_value) > 25000000 then raise exception 'Invalid storage value'; end if;
  select organization_id into v_org from public.organization_members
   where user_id=auth.uid() and role in ('owner','admin')
   order by case role when 'owner' then 0 else 1 end limit 1;
  if v_org is null then raise exception 'Owner or admin role required'; end if;
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
commit;
