'use strict';

const crypto = require('crypto');
const { buildStagingPlan } = require('./legacy-import');

function object(value) {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch (error) { return {}; }
}

function hash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12); }
function projectId(item) { return String((item && (item.id || item.projectId)) || '').trim(); }
function text(value) { return value == null ? '' : String(value).trim(); }
function isoDate(value) { const current=text(value); return /^\d{4}-\d{2}-\d{2}/.test(current) ? current.slice(0,10) : null; }
function goalKey(item, index) { const id=text(item && (item.id || item.goalId)); return id ? 'goal:'+id : 'goal:sha256:'+hash(JSON.stringify([text(item&&item.name),text(item&&item.company),text(item&&item.date),index])); }

function analyzeWorkPreview(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  const staging = buildStagingPlan(backup);
  const readyIds = new Set();
  const heldIds = new Set();
  staging.records.filter((row) => row.entity_type === 'project').forEach((row) => {
    const id = projectId(row.raw_data);
    if (!id) return;
    (row.resolution_status === 'ready' ? readyIds : heldIds).add(id);
  });

  const projectsData = object(keys.avitolog_projects);
  const projects = Array.isArray(projectsData.projects) ? projectsData.projects : [];
  const hiddenProjects = Array.isArray(projectsData.hiddenProjects) ? projectsData.hiddenProjects : [];
  const tasks = Array.isArray(projectsData.tasks) ? projectsData.tasks : [];
  const taskLog = Array.isArray(projectsData.taskLog) ? projectsData.taskLog : [];
  const taskStatus = tasks.reduce((acc, task) => { const status = String((task && task.status) || 'new'); acc[status] = (acc[status] || 0) + 1; return acc; }, {});
  const taskLinks = tasks.reduce((acc, task) => {
    const id = String((task && task.projectId) || '').trim();
    if (readyIds.has(id)) acc.ready += 1; else if (heldIds.has(id)) acc.held += 1; else acc.missing += 1;
    return acc;
  }, { ready: 0, held: 0, missing: 0 });

  const goalKeys = Object.keys(keys).filter((key) => /^avitolog_goals_v1(?:_month_\d{4}-\d{2})?$/.test(key)).sort();
  const goalSets = goalKeys.map((key) => {
    const data = object(keys[key]);
    const rows = Array.isArray(data.projects) ? data.projects : [];
    const monthMatch = key.match(/_month_(\d{4}-\d{2})$/);
    const stages = rows.reduce((acc, row) => { const stage = String((row && row.stage) || 'weekly'); acc[stage] = (acc[stage] || 0) + 1; return acc; }, {});
    return { key, month: monthMatch ? monthMatch[1] : null, live: !monthMatch, projects: rows.length, stages, fingerprint: hash(keys[key]) };
  });
  const fingerprints = goalSets.reduce((acc, set) => { acc[set.fingerprint] = (acc[set.fingerprint] || 0) + 1; return acc; }, {});
  goalSets.forEach((set) => { set.exactDuplicate = fingerprints[set.fingerprint] > 1; });
  const achievements = object(keys.avitolog_goal_achievements_v1);

  return {
    dryRun: true,
    projectSource: 'avitolog_projects',
    projects: { visible: projects.length, hidden: hiddenProjects.length, readyRelations: readyIds.size, heldRelations: heldIds.size },
    tasks: { total: tasks.length, statuses: taskStatus, links: taskLinks, withTags: tasks.filter((task) => Array.isArray(task && task.tags) && task.tags.length).length, withDeadlineTransfers: tasks.filter((task) => Array.isArray(task && task.deadlineTransfers) && task.deadlineTransfers.length).length },
    taskLog: { total: taskLog.length },
    goals: { datasets: goalSets, uniqueDatasetCount: new Set(goalSets.map((set) => set.fingerprint)).size },
    achievements: { keys: Object.keys(achievements).length, records: Array.isArray(achievements.items) ? achievements.items.length : Object.keys(achievements).length }
  };
}

function buildWorkImportPlan(backup) {
  const keys = backup && backup.keys && typeof backup.keys === 'object' ? backup.keys : {};
  const staging = buildStagingPlan(backup);
  const projectData = object(keys.avitolog_projects);
  const visible = Array.isArray(projectData.projects) ? projectData.projects : [];
  const hidden = Array.isArray(projectData.hiddenProjects) ? projectData.hiddenProjects : [];
  const visibleIds = new Set(visible.map(projectId).filter(Boolean));
  const relationById = new Map();
  staging.records.filter((row)=>row.entity_type==='project').forEach((row)=>relationById.set(projectId(row.raw_data),row));
  const projects = visible.map((item,index)=>{
    const id=projectId(item);const relation=relationById.get(id);const zone=text(item.zone).toLowerCase();const statusText=text(item.status).toLowerCase();
    const status=zone==='archive'?'archived':(statusText.indexOf('готов')>=0?'completed':(zone==='second_chance'?'paused':'active'));
    return {legacy_key:id?'project:'+id:'project:sha256:'+hash(JSON.stringify([item.name,item.title,index])),name:text(item.name||item.title)||('Проект '+(index+1)),status,client_legacy_key:relation&&relation.normalized_data.client_legacy_key||null,resolution_status:relation&&relation.resolution_status||'unlinked',details:item};
  });
  const hiddenProjects=hidden.filter((item)=>!visibleIds.has(projectId(item))).map((item,index)=>{const id=projectId(item);return {legacy_key:id?'project:'+id:'hidden-project:sha256:'+hash(JSON.stringify([item.name,item.title,index])),name:text(item.name||item.title)||('Скрытый проект '+(index+1)),status:'archived',client_legacy_key:null,resolution_status:'unlinked',details:item};});
  const tasks=(Array.isArray(projectData.tasks)?projectData.tasks:[]).map((item,index)=>({legacy_key:text(item.id)?'task:'+text(item.id):'task:sha256:'+hash(JSON.stringify([item.projectId,item.title,index])),project_legacy_key:text(item.projectId)?'project:'+text(item.projectId):null,title:text(item.title||item.name)||('Задача '+(index+1)),description:text(item.description||item.comment)||null,status:text(item.status)||'new',priority:text(item.priority)==='urgent'?2:0,due_on:isoDate(item.dueDate),details:item}));
  const taskLogs=(Array.isArray(projectData.taskLog)?projectData.taskLog:[]).map((item,index)=>({legacy_key:'task-log:sha256:'+hash(JSON.stringify([item.taskId,item.action,item.at,index])),task_legacy_key:text(item.taskId)?'task:'+text(item.taskId):null,project_legacy_key:text(item.projectId)?'project:'+text(item.projectId):null,action:text(item.action)||'legacy',occurred_at:Number(item.at)||null,details:item}));
  const goalSourceKeys=Object.keys(keys).filter((key)=>/^avitolog_goals_v1_month_\d{4}-\d{2}$/.test(key)).sort();
  const masterByKey=new Map();const goalStates=[];
  goalSourceKeys.forEach((sourceKey)=>{const month=sourceKey.slice(-7);const data=object(keys[sourceKey]);const rows=Array.isArray(data.projects)?data.projects:[];rows.forEach((item,index)=>{const legacyKey=goalKey(item,index);masterByKey.set(legacyKey,{legacy_key:legacyKey,name:text(item.name||item.title)||('Цель '+(index+1)),stage:text(item.stage)||'weekly',goal_date:isoDate(item.date),details:item});goalStates.push({goal_legacy_key:legacyKey,source_key:sourceKey,record_index:index,snapshot_month:month+'-01',stage:text(item.stage)||'weekly',details:item});});});
  const achievementsData=object(keys.avitolog_goal_achievements_v1);const achievementRows=Array.isArray(achievementsData.items)?achievementsData.items:Object.keys(achievementsData).map((key)=>({key,value:achievementsData[key]}));
  const achievements=achievementRows.map((item,index)=>({legacy_key:'achievement:sha256:'+hash(JSON.stringify([item,index])),details:item}));
  return {projects:projects.concat(hiddenProjects),tasks,taskLogs,goals:Array.from(masterByKey.values()),goalStates,achievements,summary:{projects:projects.length+hiddenProjects.length,unresolvedProjects:projects.concat(hiddenProjects).filter((p)=>!p.client_legacy_key).length,hiddenProjects:hiddenProjects.length,tasks:tasks.length,taskLogs:taskLogs.length,goals:masterByKey.size,goalStates:goalStates.length,achievements:achievements.length}};
}

module.exports = { analyzeWorkPreview, buildWorkImportPlan };
