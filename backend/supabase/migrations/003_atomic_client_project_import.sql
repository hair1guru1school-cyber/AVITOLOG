begin;

create or replace function public.import_legacy_clients_projects(
  p_checksum text,
  p_clients jsonb,
  p_projects jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid;
  v_run_id uuid;
  v_source text;
  v_client jsonb;
  v_project jsonb;
  v_client_id uuid;
  v_project_id uuid;
  v_clients_count integer := 0;
  v_projects_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_checksum !~ '^[a-f0-9]{64}$' then raise exception 'Invalid snapshot checksum'; end if;
  if jsonb_typeof(p_clients) <> 'array' or jsonb_typeof(p_projects) <> 'array' then
    raise exception 'Clients and projects must be arrays';
  end if;
  if jsonb_array_length(p_clients) <> 91 or jsonb_array_length(p_projects) <> 48 then
    raise exception 'Approved import counts changed';
  end if;

  select organization_id, migration_run_id, source
  into v_org_id, v_run_id, v_source
  from public.migration_source_snapshots
  where checksum = p_checksum
  limit 1;

  if v_org_id is null then raise exception 'Snapshot not found'; end if;
  if not public.has_org_role(v_org_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Owner or admin role required';
  end if;

  for v_client in select value from jsonb_array_elements(p_clients)
  loop
    if coalesce(v_client->>'legacy_key', '') = '' then raise exception 'Client legacy key is required'; end if;
    insert into public.clients (
      organization_id, company_name, contact_name, client_type, phone, email, telegram,
      avito_url, niche, geography, notes, drive_folder_id, drive_folder_url,
      legacy_source, legacy_key, created_by
    ) values (
      v_org_id, coalesce(nullif(v_client->>'company_name',''), 'Без названия'), nullif(v_client->>'contact_name',''),
      nullif(v_client->>'client_type',''), nullif(v_client->>'phone',''), nullif(v_client->>'email',''),
      nullif(v_client->>'telegram',''), nullif(v_client->>'avito_url',''), nullif(v_client->>'niche',''),
      nullif(v_client->>'geography',''), nullif(v_client->>'notes',''), nullif(v_client->>'drive_folder_id',''),
      nullif(v_client->>'drive_folder_url',''), v_source, v_client->>'legacy_key', auth.uid()
    )
    on conflict (organization_id, legacy_source, legacy_key) do update set
      company_name = excluded.company_name, contact_name = excluded.contact_name, client_type = excluded.client_type,
      phone = excluded.phone, email = excluded.email, telegram = excluded.telegram, avito_url = excluded.avito_url,
      niche = excluded.niche, geography = excluded.geography, notes = excluded.notes,
      drive_folder_id = excluded.drive_folder_id, drive_folder_url = excluded.drive_folder_url, deleted_at = null
    returning id into v_client_id;

    insert into public.legacy_import_map (organization_id, source, entity_type, legacy_key, entity_id)
    values (v_org_id, v_source, 'client', v_client->>'legacy_key', v_client_id)
    on conflict (organization_id, source, entity_type, legacy_key) do update
      set entity_id = excluded.entity_id, imported_at = now();
    v_clients_count := v_clients_count + 1;
  end loop;

  for v_project in select value from jsonb_array_elements(p_projects)
  loop
    if coalesce(v_project->>'legacy_key', '') = '' then raise exception 'Project legacy key is required'; end if;
    if coalesce(v_project->>'client_legacy_key', '') = '' then raise exception 'Project client legacy key is required'; end if;
    select id into v_client_id from public.clients
    where organization_id = v_org_id and legacy_source = v_source
      and legacy_key = v_project->>'client_legacy_key' and deleted_at is null;
    if v_client_id is null then raise exception 'Project client was not imported: %', v_project->>'client_legacy_key'; end if;

    insert into public.projects (
      organization_id, client_id, name, status, details, legacy_source, legacy_key, created_by
    ) values (
      v_org_id, v_client_id, coalesce(nullif(v_project->>'name',''), 'Без названия'), 'lead',
      coalesce(v_project->'details', '{}'::jsonb), v_source, v_project->>'legacy_key', auth.uid()
    )
    on conflict (organization_id, legacy_source, legacy_key) do update set
      client_id = excluded.client_id, name = excluded.name, details = excluded.details, deleted_at = null
    returning id into v_project_id;

    insert into public.legacy_import_map (organization_id, source, entity_type, legacy_key, entity_id)
    values (v_org_id, v_source, 'project', v_project->>'legacy_key', v_project_id)
    on conflict (organization_id, source, entity_type, legacy_key) do update
      set entity_id = excluded.entity_id, imported_at = now();
    v_projects_count := v_projects_count + 1;
  end loop;

  update public.migration_runs set
    status = 'clients_projects_imported',
    summary = summary || jsonb_build_object(
      'production_import', jsonb_build_object(
        'clients', v_clients_count, 'projects', v_projects_count,
        'held_projects', 23, 'imported_at', now(), 'snapshot_checksum', p_checksum
      )
    ),
    finished_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'clients', v_clients_count, 'projects', v_projects_count, 'held_projects', 23,
    'migration_run_id', v_run_id, 'snapshot_checksum', p_checksum
  );
end;
$$;

revoke all on function public.import_legacy_clients_projects(text,jsonb,jsonb) from public;
grant execute on function public.import_legacy_clients_projects(text,jsonb,jsonb) to authenticated;

commit;
