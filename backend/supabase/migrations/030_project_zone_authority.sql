begin;

-- Give legacy records a causal baseline before enabling the stricter guard.
with source as (
  select id,value_text::jsonb doc from public.frontend_state_records
  where id='e66b2a5f-5215-4946-81af-91114c5f2f20'::uuid
), prepared as (
  select id,jsonb_set(doc,'{projects}',(
    select jsonb_agg(case when p->'zoneIntentV1'->>'id' is null
      or p->'zoneIntentV1'->>'zone' is distinct from coalesce(p->>'zone','active')
      then p || jsonb_build_object('zoneIntentV1',jsonb_build_object('version',1,'source','baseline',
        'id','baseline_'||gen_random_uuid()::text,'zone',coalesce(p->>'zone','active'),'at',now()))
      else p end order by n)
    from jsonb_array_elements(doc->'projects') with ordinality as listed(p,n)
  )) patched from source
)
update public.frontend_state_records r set value_text=p.patched::text,revision=r.revision+1,updated_at=now()
from prepared p where r.id=p.id and p.patched is distinct from r.value_text::jsonb;

create or replace function public.avitolog_guard_project_snapshot_20261026()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare
  prior jsonb; incoming jsonb; prior_rows jsonb; incoming_rows jsonb; prior_by_id jsonb;
  lost_projects integer; lost_tasks integer; field text; p jsonb; previous jsonb; rebuilt jsonb; intended boolean;
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
$$;
revoke all on function public.avitolog_guard_project_snapshot_20261026() from public,anon,authenticated;
commit;
