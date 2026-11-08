CREATE OR REPLACE FUNCTION public.upsert_frontend_state(p_key text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_role public.organization_role;
  v_revision bigint;
  v_saved_value text;
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
  returning revision, value_text into v_revision, v_saved_value;

  return jsonb_build_object('storage_key',p_key,'revision',v_revision,'updated_at',now())
    || case when p_key ~ '^avitolog_projects(_sasha)?$' then jsonb_build_object('value_text',v_saved_value) else '{}'::jsonb end;
end $function$;


CREATE OR REPLACE FUNCTION public.avitolog_guard_project_snapshot_20261026()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  prior jsonb; incoming jsonb; prior_rows jsonb; incoming_rows jsonb; prior_by_id jsonb;
  lost_projects integer; lost_tasks integer; field text; calendar_field text; p jsonb; previous jsonb; rebuilt jsonb; intended boolean;
begin
  if new.value_text is not distinct from old.value_text then return new; end if;
  prior := old.value_text::jsonb; incoming := new.value_text::jsonb;
  if jsonb_typeof(prior->'projects') is distinct from 'array' or jsonb_typeof(incoming->'projects') is distinct from 'array' then
    raise exception 'Project snapshot rejected: invalid projects list; the draft is retained';
  end if;
  prior_rows := (prior->'projects') || case when jsonb_typeof(prior->'hiddenProjects')='array' then prior->'hiddenProjects' else '[]'::jsonb end;
  incoming_rows := (incoming->'projects') || case when jsonb_typeof(incoming->'hiddenProjects')='array' then incoming->'hiddenProjects' else '[]'::jsonb end;
  lost_projects := jsonb_array_length(prior_rows)-jsonb_array_length(incoming_rows);
  lost_tasks := jsonb_array_length(case when jsonb_typeof(prior->'tasks')='array' then prior->'tasks' else '[]'::jsonb end)
    -jsonb_array_length(case when jsonb_typeof(incoming->'tasks')='array' then incoming->'tasks' else '[]'::jsonb end);
  if lost_projects>=3 and lost_tasks>=3 then
    raise exception 'Project snapshot rejected: simultaneous project and task loss. Reload the system; the draft is retained';
  end if;
  foreach field in array array['projects','hiddenProjects'] loop
    if jsonb_typeof(incoming->field) is distinct from 'array' then continue; end if;
    select jsonb_object_agg(item->>'id',item) into prior_by_id from (
      select distinct on (item->>'id') item from jsonb_array_elements(
        coalesce(prior->field,'[]'::jsonb) || coalesce(prior->(case when field='projects' then 'hiddenProjects' else 'projects' end),'[]'::jsonb)
      ) with ordinality as listed(item,n) where item->>'id' is not null order by item->>'id',n
    ) first_records;
    rebuilt := '[]'::jsonb;
    for p in select value from jsonb_array_elements(incoming->field) loop
      previous := prior_by_id->(p->>'id');
      if previous is not null then

        -- Old browser versions can still send a freshly stamped but stale Sheets row.
        if jsonb_typeof(p->'events')='array'
          and exists(select 1 from jsonb_array_elements(p->'events') e where e->>'type'='active_range' and e->>'source'='sheet')
          and (select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(p->'events') e where e->>'type'='active_range')
            is distinct from (select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(coalesce(previous->'events','[]')) e where e->>'type'='active_range') then
          p := jsonb_set(p,'{events}',
            (select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(p->'events') e where e->>'type' is distinct from 'active_range')
            || (select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(coalesce(previous->'events','[]')) e where e->>'type'='active_range'));
          p := case when previous ? 'autoloadUpdatedAt' then jsonb_set(p,'{autoloadUpdatedAt}',previous->'autoloadUpdatedAt') else p-'autoloadUpdatedAt' end;
          if jsonb_typeof(p->'clientPath')='object' and previous->'clientPath' ? 'autoload' then
            p := jsonb_set(p,'{clientPath,autoload}',previous->'clientPath'->'autoload');
          end if;
        end if;
        -- Only an explicit manual clear may remove a saved !! marker.
        if previous->>'mustLaunchRequired'='true' and coalesce(p->>'mustLaunchRequired','false')<>'true'
          and not (coalesce(p->>'mustLaunchManualClearedAt','')>coalesce(previous->>'mustLaunchManualClearedAt','')
            and p->>'mustLaunchManualClearedAt'=p->>'mustLaunchUpdatedAt') then
          p := jsonb_set(p,'{mustLaunchRequired}','true');
          foreach calendar_field in array array['mustLaunchDate','mustLaunchSetSince','mustLaunchUpdatedAt','mustLaunchManualClearedAt'] loop
            p := case when previous ? calendar_field then jsonb_set(p,array[calendar_field],previous->calendar_field) else p-calendar_field end;
          end loop;
        end if;
        intended := coalesce(p->'zoneIntentV1'->>'version'='1' and p->'zoneIntentV1'->>'source'='manual'
          and length(p->'zoneIntentV1'->>'id') between 1 and 200
          and p->'zoneIntentV1'->>'id' is distinct from previous->'zoneIntentV1'->>'id'
          and p->'zoneIntentV1'->>'zone'=p->>'zone' and p->>'zone' in ('active','second_chance','archive')
          and (p->'zoneIntentV1'->>'parentId'=coalesce(previous->'zoneIntentV1'->>'id','')
            or case when jsonb_typeof(p->'zoneIntentV1'->'ancestorIds')='array'
              then jsonb_array_length(p->'zoneIntentV1'->'ancestorIds')<=16 and (p->'zoneIntentV1'->'ancestorIds') ? coalesce(previous->'zoneIntentV1'->>'id','')
              else false end),false);
        if not intended then
          if coalesce(p->>'zone','active')<>coalesce(previous->>'zone','active') then
            p := jsonb_set(p,'{zone}',to_jsonb(coalesce(previous->>'zone','active')));
            p := case when previous ? 'sortOrder' then jsonb_set(p,'{sortOrder}',previous->'sortOrder') else p-'sortOrder' end;
          end if;
          p := case when previous ? 'zoneIntentV1' then jsonb_set(p,'{zoneIntentV1}',previous->'zoneIntentV1') else p-'zoneIntentV1' end;
        end if;
      end if;
      rebuilt := rebuilt || jsonb_build_array(p);
    end loop;
    incoming := jsonb_set(incoming,array[field],rebuilt);
  end loop;
  new.value_text := incoming::text;
  return new;
end;
$function$;


do $test$
declare saved jsonb;
begin
 create temporary table avb_calendar_guard_test(value_text text) on commit drop;
 create trigger avb_calendar_guard_test before update on avb_calendar_guard_test
 for each row execute function public.avitolog_guard_project_snapshot_20261026();
 insert into avb_calendar_guard_test values ('{"projects":[{"id":"fixture","zone":"active","events":[{"type":"active_range","source":"manual","startDate":"2026-11-08","endDate":"2026-12-08"}],"mustLaunchRequired":true,"mustLaunchDate":"2026-11-10"}],"tasks":[]}');
 update avb_calendar_guard_test set value_text='{"projects":[{"id":"fixture","zone":"active","events":[{"type":"active_range","source":"sheet","startDate":"2020-01-01","endDate":"2020-02-01"}],"mustLaunchRequired":false}],"tasks":[]}';
 select value_text::jsonb->'projects'->0 into saved from avb_calendar_guard_test;
 if saved->'events'->0->>'startDate'<>'2026-11-08' or saved->>'mustLaunchRequired'<>'true' then raise exception 'Stale calendar protection failed'; end if;
 update avb_calendar_guard_test set value_text=jsonb_set(jsonb_set(jsonb_set(value_text::jsonb,'{projects,0,mustLaunchRequired}','false'),'{projects,0,mustLaunchManualClearedAt}','"2026-11-09T10:00:00.000Z"'),'{projects,0,mustLaunchUpdatedAt}','"2026-11-09T10:00:00.000Z"')::text;
 select value_text::jsonb->'projects'->0 into saved from avb_calendar_guard_test;
 if saved->>'mustLaunchRequired'<>'false' then raise exception 'Explicit manual clear blocked'; end if;
end
$test$;
