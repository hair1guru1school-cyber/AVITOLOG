'use strict';
const { buildWorkImportPlan } = require('./work-preview');
const { getPreviewSnapshot } = require('./production-preview');
const { supabaseUserRequest } = require('./supabase-rest');
async function executeWorkImport(checksum,confirmation,authorization){
  if(confirmation!=='IMPORT_WORK_74_77_127_127_301_2'){const e=new Error('Exact work import confirmation is required');e.status=400;throw e;}
  const snapshot=await getPreviewSnapshot(checksum,authorization);const p=buildWorkImportPlan(snapshot.backup);const s=p.summary;
  if(s.projects!==74||s.tasks!==77||s.taskLogs!==127||s.goals!==127||s.goalStates!==301||s.achievements!==2){const e=new Error('Work import counts changed');e.status=409;throw e;}
  return supabaseUserRequest('rpc/import_work_management',authorization,{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({p_checksum:snapshot.checksum,p_projects:p.projects,p_tasks:p.tasks,p_logs:p.taskLogs,p_goals:p.goals,p_goal_states:p.goalStates,p_achievements:p.achievements})});
}
async function workStatus(authorization){const paths=['projects?select=id','tasks?select=id','task_activity_log?select=id','goals?select=id','goal_month_states?select=id','goal_achievements?select=id'];const rows=[];for(const path of paths)rows.push(await supabaseUserRequest(path,authorization));return {projects:rows[0].length,tasks:rows[1].length,logs:rows[2].length,goals:rows[3].length,goalStates:rows[4].length,achievements:rows[5].length};}
module.exports={executeWorkImport,workStatus};
