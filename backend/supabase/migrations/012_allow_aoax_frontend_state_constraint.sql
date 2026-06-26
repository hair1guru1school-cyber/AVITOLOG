-- Keep the frontend state table constraint in sync with upsert_frontend_state.

alter table public.frontend_state_records
drop constraint if exists frontend_state_records_storage_key_check;

alter table public.frontend_state_records
add constraint frontend_state_records_storage_key_check check (
  storage_key in (
    'avitolog_clients', 'avitolog_projects', 'crm_tasks_v1',
    'avitolog_clients_sasha', 'avitolog_projects_sasha', 'crm_tasks_v1_sasha',
    'avito_kp_saved_client_packages_v1', 'avito_kp_custom',
    'avitolog_aoax_autoloads_v1'
  )
  or storage_key ~ '^avitolog_goals_v1(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_goal_achievements_v1(_sasha)?$'
  or storage_key ~ '^avitolog_assets_(my|sasha|base)_v2(_sasha)?(_month_[0-9]{4}-[0-9]{2})?$'
  or storage_key ~ '^avitolog_kp_'
  or storage_key ~ '^crm_ads_(expenses_v1|expenses_month_[0-9]{4}-[0-9]{2}|posts_plan_v1|posts_source_v1|links_v1|posts_sync_queue_v1)$'
);
