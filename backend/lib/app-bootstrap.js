'use strict';
const { supabaseUserRequest } = require('./supabase-rest');
async function loadBackendApp(authorization){
 const queries={clients:'clients?select=id,company_name,contact_name,phone,email,drive_folder_url&order=company_name',projects:'projects?select=id,client_id,name,status&order=name',cash:'cash_ledger_entries?select=id,owner_scope,ledger_month,name,received_amount,expected_amount,sold_for_amount,to_agent_amount&order=ledger_month.desc,name',tasks:'tasks?select=id,project_id,title,status,priority,due_at&order=due_at.desc.nullslast,title',goals:'goals?select=id,name,stage,goal_date&order=goal_date.desc.nullslast,name',content:'app_storage_records?select=id,category,storage_key,updated_at&order=category,storage_key'};
 const out={};for(const [name,path] of Object.entries(queries))out[name]=await supabaseUserRequest(path,authorization);return out;
}
module.exports={loadBackendApp};
