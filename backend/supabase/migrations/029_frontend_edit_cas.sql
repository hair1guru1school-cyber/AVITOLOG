begin;
create function public.compare_and_swap_frontend_edits(p_edits jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare org uuid; item jsonb; current_revision bigint; result jsonb; results jsonb := '[]';
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_edits) is distinct from 'array' or jsonb_array_length(p_edits) not between 1 and 12 or octet_length(p_edits::text)>12000000 then raise exception 'Invalid edits'; end if;
 select organization_id into org from public.organization_members where user_id=auth.uid() and role in ('owner','admin','manager') order by case role when 'owner' then 0 when 'admin' then 1 else 2 end limit 1;
 if org is null then raise exception 'Permission denied' using errcode='42501'; end if;
 if (select count(distinct value->>'key') from jsonb_array_elements(p_edits))<>jsonb_array_length(p_edits) then raise exception 'Duplicate edit key'; end if;
 for item in select value from jsonb_array_elements(p_edits) order by value->>'key' loop
  if item->>'key' is null or not (item->>'key' ~ '^(avitolog_(projects|clients)(_sasha)?|crm_tasks_v1(_sasha)?|avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?)$')
   or jsonb_typeof(item->'value') is distinct from 'string' or item->>'expected_revision' is null or (item->>'expected_revision') !~ '^[1-9][0-9]{0,17}$' then raise exception 'Invalid edit'; end if;
  select revision into current_revision from public.frontend_state_records where organization_id=org and storage_key=item->>'key' for update;
  if not found or current_revision<>(item->>'expected_revision')::bigint then raise exception 'Edit conflict: refresh and retry' using errcode='40001'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_edits) order by value->>'key' loop
  result := public.upsert_frontend_state(item->>'key',item->>'value');
  results := results || jsonb_build_array(result);
 end loop;
 return results;
end;
$$;
revoke all on function public.compare_and_swap_frontend_edits(jsonb) from public,anon;
grant execute on function public.compare_and_swap_frontend_edits(jsonb) to authenticated;
commit;
