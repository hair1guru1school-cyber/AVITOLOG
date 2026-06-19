begin;
create table if not exists public.app_storage_records(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 category text not null check(category in('kp','ads')),storage_key text not null,value_jsonb jsonb,value_text text,
 source_checksum text not null,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,storage_key)
);
drop trigger if exists app_storage_records_updated_at on public.app_storage_records;
create trigger app_storage_records_updated_at before update on public.app_storage_records for each row execute function public.set_updated_at();
alter table public.app_storage_records enable row level security;
drop policy if exists app_storage_records_select on public.app_storage_records;
create policy app_storage_records_select on public.app_storage_records for select using(public.is_org_member(organization_id));
drop policy if exists app_storage_records_write on public.app_storage_records;
create policy app_storage_records_write on public.app_storage_records for all using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));
create or replace function public.import_content_storage(p_checksum text,p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_org uuid;v_run uuid;v jsonb;c int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_array_length(p_records)<>51 then raise exception 'Approved content count changed';end if;
 select organization_id,migration_run_id into v_org,v_run from public.migration_source_snapshots where checksum=p_checksum limit 1;
 if v_org is null then raise exception 'Snapshot not found';end if;
 if not public.has_org_role(v_org,array['owner','admin']::public.organization_role[]) then raise exception 'Owner/admin required';end if;
 for v in select value from jsonb_array_elements(p_records) loop
  insert into public.app_storage_records(organization_id,category,storage_key,value_jsonb,value_text,source_checksum,created_by)
  values(v_org,v->>'category',v->>'storage_key',v->'value_jsonb',v->>'value_text',p_checksum,auth.uid())
  on conflict(organization_id,storage_key) do update set category=excluded.category,value_jsonb=excluded.value_jsonb,value_text=excluded.value_text,source_checksum=excluded.source_checksum;
  c:=c+1;
 end loop;
 update public.migration_runs set status='content_imported',summary=summary||jsonb_build_object('content_import',jsonb_build_object('records',c,'imported_at',now())) where id=v_run;
 return jsonb_build_object('records',c,'migration_run_id',v_run);
end $$;
revoke all on function public.import_content_storage(text,jsonb) from public;
grant execute on function public.import_content_storage(text,jsonb) to authenticated;
commit;
