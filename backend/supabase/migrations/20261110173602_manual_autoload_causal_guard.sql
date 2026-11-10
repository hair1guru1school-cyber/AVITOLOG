create or replace function public.avitolog_guard_manual_autoload_v1()
returns trigger language plpgsql set search_path='pg_catalog' as $function$
declare
 prior jsonb; incoming jsonb; prior_rows jsonb; prior_by_id jsonb;
 section text; field text; p jsonb; previous jsonb; rebuilt jsonb;
 old_stamp timestamptz; next_stamp timestamptz; fresh_manual boolean;
 old_events jsonb; next_events jsonb; old_ranges jsonb; next_ranges jsonb;
 row_index integer; row_count integer; row_events jsonb; child_events jsonb;
 protected boolean; had_manual boolean;
begin
 if new.storage_key not in ('avitolog_projects','avitolog_projects_sasha') or new.value_text is not distinct from old.value_text then return new; end if;
 prior:=old.value_text::jsonb;incoming:=new.value_text::jsonb;
 if jsonb_typeof(prior->'projects') is distinct from 'array' or jsonb_typeof(incoming->'projects') is distinct from 'array' then return new; end if;
 prior_rows:=(prior->'projects')||case when jsonb_typeof(prior->'hiddenProjects')='array' then prior->'hiddenProjects' else '[]'::jsonb end;
 select jsonb_object_agg(item->>'id',item) into prior_by_id from (select distinct on (item->>'id') item from jsonb_array_elements(prior_rows) with ordinality t(item,n) where item->>'id' is not null order by item->>'id',n) first_rows;
 foreach section in array array['projects','hiddenProjects'] loop
  if jsonb_typeof(incoming->section) is distinct from 'array' then continue; end if;
  rebuilt:='[]'::jsonb;
  for p in select value from jsonb_array_elements(incoming->section) loop
   previous:=prior_by_id->(p->>'id');old_stamp:=null;next_stamp:=null;
   if previous is not null then
    begin old_stamp:=nullif(previous->>'autoloadManualOverrideAt','')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then old_stamp:=null;end;
    begin next_stamp:=nullif(p->>'autoloadManualOverrideAt','')::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then next_stamp:=null;end;
    fresh_manual:=next_stamp is not null and (old_stamp is null or next_stamp>old_stamp);
    if old_stamp is not null and not fresh_manual then
     protected:=false;had_manual:=false;
     old_events:=case when jsonb_typeof(previous->'events')='array' then previous->'events' else '[]'::jsonb end;
     next_events:=case when jsonb_typeof(p->'events')='array' then p->'events' else '[]'::jsonb end;
     select coalesce(jsonb_agg(e),'[]') into old_ranges from jsonb_array_elements(old_events) e where e->>'type'='active_range';
     select coalesce(jsonb_agg(e),'[]') into next_ranges from jsonb_array_elements(next_events) e where e->>'type'='active_range';
     had_manual:=jsonb_array_length(old_ranges)=0 or exists(select 1 from jsonb_array_elements(old_ranges) e where e->>'source'='manual');
     if had_manual and old_ranges is distinct from next_ranges then
      p:=jsonb_set(p,'{events}',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(next_events) e where e->>'type' is distinct from 'active_range')||old_ranges);protected:=true;
     end if;
     if coalesce(previous->'childLines','[]')=coalesce(p->'childLines','[]') and jsonb_typeof(previous->'childLineEvents')='array' then
      row_count:=jsonb_array_length(previous->'childLineEvents');
      child_events:=case when jsonb_typeof(p->'childLineEvents')='array' then p->'childLineEvents' else '[]'::jsonb end;
      if row_count>0 then for row_index in 0..row_count-1 loop
       old_events:=case when jsonb_typeof(previous->'childLineEvents'->row_index)='array' then previous->'childLineEvents'->row_index else '[]'::jsonb end;
       next_events:=case when jsonb_typeof(child_events->row_index)='array' then child_events->row_index else '[]'::jsonb end;
       select coalesce(jsonb_agg(e),'[]') into old_ranges from jsonb_array_elements(old_events) e where e->>'type'='active_range';
       select coalesce(jsonb_agg(e),'[]') into next_ranges from jsonb_array_elements(next_events) e where e->>'type'='active_range';
       if exists(select 1 from jsonb_array_elements(old_ranges) e where e->>'source'='manual') and old_ranges is distinct from next_ranges then
        while jsonb_array_length(child_events)<=row_index loop child_events:=child_events||'[[]]'::jsonb;end loop;
        row_events:=(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(next_events) e where e->>'type' is distinct from 'active_range')||old_ranges;
        child_events:=jsonb_set(child_events,array[row_index::text],row_events);protected:=true;had_manual:=true;
       end if;
      end loop;end if;
      if protected then p:=jsonb_set(p,'{childLineEvents}',child_events);end if;
     end if;
     if protected or had_manual and (next_stamp is null or next_stamp<old_stamp) then
      foreach field in array array['autoloadUpdatedAt','autoloadManualOverrideAt','aoaxAutoloadManualClear'] loop
       p:=case when previous ? field then jsonb_set(p,array[field],previous->field) else p-field end;
      end loop;
      if protected and jsonb_typeof(previous->'clientPath')='object' and previous->'clientPath' ? 'autoload' then
       if jsonb_typeof(p->'clientPath') is distinct from 'object' then p:=jsonb_set(p,'{clientPath}','{}');end if;
       p:=jsonb_set(p,'{clientPath,autoload}',previous->'clientPath'->'autoload');
      end if;
     end if;
    end if;
   end if;
   rebuilt:=rebuilt||jsonb_build_array(p);
  end loop;
  incoming:=jsonb_set(incoming,array[section],rebuilt);
 end loop;
 new.value_text:=incoming::text;return new;
end;
$function$;
revoke all on function public.avitolog_guard_manual_autoload_v1() from public;
create trigger avitolog_manual_autoload_guard_v1 before update on public.frontend_state_records
for each row execute function public.avitolog_guard_manual_autoload_v1();

do $test$
declare saved jsonb;
begin
 create temporary table avb_autoload_guard_test(storage_key text,value_text text) on commit drop;
 create trigger autoload_guard_test before update on avb_autoload_guard_test for each row execute function public.avitolog_guard_manual_autoload_v1();
 insert into avb_autoload_guard_test values('avitolog_projects','{"projects":[{"id":"fixture","zone":"active","events":[{"type":"active_range","source":"manual","startDate":"2026-11-10","endDate":"2026-12-01"}],"autoloadManualOverrideAt":"2026-11-10T10:00:00.000Z","autoloadUpdatedAt":"2026-11-10T10:00:00.000Z","clientPath":{"autoload":true},"childLines":["first"],"childLineEvents":[[{"type":"active_range","source":"manual","startDate":"2026-11-10","endDate":"2026-12-01"}]]}],"tasks":[{"id":"keep"}]}');
 update avb_autoload_guard_test set value_text=jsonb_set(jsonb_set(jsonb_set(value_text::jsonb,'{projects,0,events}','[]'),'{projects,0,childLineEvents}','[[]]'),'{projects,0,autoloadManualOverrideAt}','"2026-09-27T10:00:00.000Z"')::text;
 select value_text::jsonb->'projects'->0 into saved from avb_autoload_guard_test;
 if saved->'events'->0->>'endDate'<>'2026-12-01' or saved->'childLineEvents'->0->0->>'endDate'<>'2026-12-01' then raise exception 'Stale copy erased manual autoload';end if;
 update avb_autoload_guard_test set value_text=jsonb_set(jsonb_set(value_text::jsonb,'{projects,0,events}','[]'),'{projects,0,autoloadManualOverrideAt}','"2026-11-10T11:00:00.000Z"')::text;
 select value_text::jsonb->'projects'->0 into saved from avb_autoload_guard_test;
 if jsonb_array_length(saved->'events')<>0 then raise exception 'Explicit clear blocked';end if;
 update avb_autoload_guard_test set value_text=jsonb_set(jsonb_set(value_text::jsonb,'{projects,0,events}','[{"type":"active_range","source":"manual","startDate":"2026-09-01","endDate":"2026-10-01"}]'),'{projects,0,autoloadManualOverrideAt}','"2026-09-27T10:00:00.000Z"')::text;
 select value_text::jsonb->'projects'->0 into saved from avb_autoload_guard_test;
 if jsonb_array_length(saved->'events')<>0 then raise exception 'Old range resurrected after explicit clear';end if;
 update avb_autoload_guard_test set value_text=jsonb_set(jsonb_set(value_text::jsonb,'{projects,0,events}','[{"type":"active_range","source":"manual","startDate":"2026-11-10","endDate":"2026-12-01"}]'),'{projects,0,autoloadManualOverrideAt}','"2026-11-10T12:00:00.000Z"')::text;
 select value_text::jsonb->'projects'->0 into saved from avb_autoload_guard_test;
 if saved->'events'->0->>'endDate'<>'2026-12-01' then raise exception 'New manual range blocked';end if;
end;
$test$;
