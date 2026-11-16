export const DEFAULT_RULES = Object.freeze({ warningViews: 3, quarantineViews: 4, windowsMinutes: [5, 10, 15], noContacts: true, batchedTrigger: true, cooldownMinutes: 60, pauseAutoload: true, titles: [], mode: 'monitor', spreadTrigger: true, spreadMinItems: 5, spreadWindowMinutes: 5, uploadNow: false });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = code => Object.assign(new Error(code), { code });
export function normalizeRules(value = {}) {
  if (!object(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_RULES,key))) throw fail('invalid_rules');
  const result = { ...DEFAULT_RULES, ...value };
  for (const key of ['warningViews', 'quarantineViews', 'cooldownMinutes']) if (!Number.isSafeInteger(result[key]) || result[key] < 1 || result[key] > 1440) throw fail('invalid_rules');
  if (result.quarantineViews < result.warningViews || !['monitor', 'protect'].includes(result.mode)) throw fail('invalid_rules');
  if (!Array.isArray(result.windowsMinutes) || !result.windowsMinutes.length || result.windowsMinutes.length > 6 || result.windowsMinutes.some(n => !Number.isSafeInteger(n) || n < 1 || n > 60)) throw fail('invalid_rules');
  result.windowsMinutes = [...new Set(result.windowsMinutes)].sort((a,b)=>a-b);
  for (const key of ['noContacts','batchedTrigger','pauseAutoload','spreadTrigger','uploadNow']) if (typeof result[key] !== 'boolean') throw fail('invalid_rules');
  if (!Number.isSafeInteger(result.spreadMinItems)||result.spreadMinItems<2||result.spreadMinItems>100||!Number.isSafeInteger(result.spreadWindowMinutes)||result.spreadWindowMinutes<1||result.spreadWindowMinutes>30) throw fail('invalid_rules');
  if (!Array.isArray(result.titles) || result.titles.length > 20 || result.titles.some(title => typeof title !== 'string' || !title.trim() || Array.from(title.trim()).length > 50 || /[\p{Cc}\p{Cs}]/u.test(title))) throw fail('invalid_titles');
  result.titles = [...new Set(result.titles.map(title=>title.trim()))]; return result;
}
export function detectSpread(items,input={}) {
  const rules=normalizeRules(input);if(!rules.spreadTrigger||!Array.isArray(items))return null;
  const seen=new Set(),candidates=[];
  for(const item of items){if(!item||seen.has(item.id)||!validSample(item.latest))continue;seen.add(item.id);const latest=item.latest,at=Date.parse(latest.at),points=(item.history||[]).filter(validSample).filter(p=>p.date===latest.date&&Date.parse(p.at)<at&&at-Date.parse(p.at)<=rules.spreadWindowMinutes*60000).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),base=points[0],prev=points.at(-1);
    if(!base||latest.views<=base.views||latest.views<prev.views||latest.contacts<prev.contacts||latest.contacts<base.contacts||rules.noContacts&&latest.contacts!==base.contacts)continue;
    candidates.push({id:item.id,views:latest.views-base.views,contacts:latest.contacts-base.contacts,from:base.at,at:latest.at});
  }
  if(!candidates.length)return null;const end=Math.max(...candidates.map(c=>Date.parse(c.at))),recent=candidates.filter(c=>end-Date.parse(c.at)<=rules.spreadWindowMinutes*60000);
  return recent.length>=rules.spreadMinItems?{reason:'multi_item_growth',severity:'quarantine',windowMinutes:rules.spreadWindowMinutes,items:recent,sourceResolution:'daily_counters'}:null;
}
function validSample(value) { return object(value) && Number.isFinite(Date.parse(value.at)) && /^\d{4}-\d{2}-\d{2}$/.test(value.date||'') && Number.isSafeInteger(value.views) && value.views >= 0 && Number.isSafeInteger(value.contacts) && value.contacts >= 0; }
export function detectSignal(history, latest, input = DEFAULT_RULES) {
  const rules=normalizeRules(input); if (!validSample(latest)||!Array.isArray(history)) return null;
  const now=Date.parse(latest.at),points=history.filter(validSample).filter(p=>p.date===latest.date&&Date.parse(p.at)<now).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),previous=points.at(-1);
  if (!previous||latest.views<previous.views||latest.contacts<previous.contacts) return null;
  for (const minutes of rules.windowsMinutes) {
    const base=points.find(p=>now-Date.parse(p.at)<=minutes*60000); if(!base||latest.views<base.views||latest.contacts<base.contacts)continue;
    const views=latest.views-base.views,contacts=latest.contacts-base.contacts;
    if(rules.noContacts&&contacts!==0||views<rules.warningViews)continue;
    const batched=latest.views-previous.views>=rules.quarantineViews;
    return {severity:views>=rules.quarantineViews||rules.batchedTrigger&&batched?'quarantine':'warning',views,contacts,windowMinutes:minutes,elapsedSeconds:Math.round((now-Date.parse(base.at))/1000),batched,observedAt:latest.at,sourceResolution:'daily_counters',reason:'views_without_contacts'};
  } return null;
}
export function nextAction(record,input,capabilities={}) {
  const rules=normalizeRules(input); if(rules.mode!=='protect')return {action:null,blocked:'observation_only'};
  if(!record||['unknown','blocked','active','cancelled'].includes(record.stage))return {action:null,blocked:'operator_review_required'};
  let action;
  if(record.stage==='quarantine')action='archive';
  else if(record.stage==='archived'&&rules.pauseAutoload&&!record.autoloadPaused)action='pauseAutoload';
  else if(record.stage==='archived')action='rename';
  else if(record.stage==='renamed') {
    if(!record.newUrl||record.newUrl===record.oldUrl)return {action:null,blocked:'url_change_not_verified'};
    if(record.publicationCost!==0)return {action:null,blocked:'free_reactivation_not_verified'};action='reactivate';
  }else return {action:null,blocked:'invalid_stage'};
  if(capabilities[action]!==true)return {action:null,blocked:'provider_action_not_connected',required:action};
  if(action==='rename'&&!rules.titles.some(t=>t!==record.oldTitle))return {action:null,blocked:'title_variants_required'};
  return {action,...(action==='rename'?{title:rules.titles.find(t=>t!==record.oldTitle)}:{})};
}
export function pausedAutoloadProfile(previous) {
  if(!object(previous)||typeof previous.autoload_enabled!=='boolean'||!Array.isArray(previous.schedule)||previous.feeds_data!==null&&!Array.isArray(previous.feeds_data)||typeof previous.report_email!=='string')throw fail('incomplete_autoload_profile');
  return structuredClone({autoload_enabled:false,feeds_data:previous.feeds_data,schedule:previous.schedule,report_email:previous.report_email});
}
export function defaultAccountIds(accounts) {
  const wanted=new Set(['фил proдвижение','fil ai маркетинг']),name=v=>String(v||'').replace(/^[^\p{L}\p{N}]+/u,'').trim().toLowerCase().replace(/\s+/g,' ');
  const matches=accounts.filter(a=>wanted.has(name(a.display_name)));
  return matches.length===2&&new Set(matches.map(a=>name(a.display_name))).size===2?matches.map(a=>a.id):[];
}
