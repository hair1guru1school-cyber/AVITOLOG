create or replace function public.avitolog_sasha_writer_guard_20261026() returns trigger
language plpgsql security invoker set search_path='' as $$
declare data jsonb;owner_edit boolean;
begin
 if new.storage_key !~ '_sasha(_month_[0-9]{4}-[0-9]{2})?$' then return new;end if;
 owner_edit:=coalesce(auth.uid()='aa63f3cd-73bc-40c0-9b5f-ce62f3d28e49'::uuid
  and current_setting('avitolog.sasha_owner_edit',true)=auth.uid()::text
  and public.has_org_role(new.organization_id,array['owner','admin']::public.organization_role[]),false);
 if auth.uid() is not null and auth.uid()<>'d1915d6d-2f70-4c75-be95-454dd1b64dce'::uuid and not owner_edit then
  raise exception 'Sasha profile is read-only for this viewer; his saved data was not changed';
 end if;
 if new.storage_key='avitolog_projects_sasha' then
  data:=new.value_text::jsonb;
  if jsonb_typeof(data->'projects') is distinct from 'array' then raise exception 'Invalid Sasha projects list';end if;
  if exists(select 1 from jsonb_array_elements(data->'projects') p join jsonb_array_elements(case when jsonb_typeof(data->'hiddenProjects')='array' then data->'hiddenProjects' else '[]'::jsonb end) h on p->>'id'=h->>'id') then
   raise exception 'A hidden project cannot be resurrected by a stale snapshot; the draft is retained';
  end if;
 end if;
 return new;
end $$;

create function public.upsert_sasha_owner_state(p_key text,p_value text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is distinct from 'aa63f3cd-73bc-40c0-9b5f-ce62f3d28e49'::uuid or p_key is null or p_key!~'_sasha(_month_[0-9]{4}-[0-9]{2})?$' then raise exception 'Permission denied' using errcode='42501';end if;
 perform set_config('avitolog.sasha_owner_edit',auth.uid()::text,true);
 return public.upsert_frontend_state(p_key,p_value);
end $$;
create function public.compare_and_swap_sasha_owner_edits(p_edits jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is distinct from 'aa63f3cd-73bc-40c0-9b5f-ce62f3d28e49'::uuid or jsonb_typeof(p_edits) is distinct from 'array' then raise exception 'Permission denied' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(p_edits) e where coalesce(e->>'key','')!~'_sasha(_month_[0-9]{4}-[0-9]{2})?$') then raise exception 'Permission denied' using errcode='42501';end if;
 perform set_config('avitolog.sasha_owner_edit',auth.uid()::text,true);
 return public.compare_and_swap_frontend_edits(p_edits);
end $$;
revoke all on function public.upsert_sasha_owner_state(text,text),public.compare_and_swap_sasha_owner_edits(jsonb) from public,anon;
grant execute on function public.upsert_sasha_owner_state(text,text),public.compare_and_swap_sasha_owner_edits(jsonb) to authenticated;
