import { normalizeRules, defaultAccountIds } from '../../js/avito-protection-model.mjs';
import { createCloudUI } from './cloud-ui.mjs?v=20261116-protection-cloud1';
const $=id=>document.getElementById(id),cfg=window.AVITOLOG_SUPABASE||{},params=new URL(location.href).searchParams;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let data=null,selected='',user='',loading=false,generation=0,seeded=false,editing=null;
const org=params.get('organization_id')||cfg.profileOrganizations?.[params.get('profile')||'fil'],expected=params.get('expected_user_id')||'';
const subject=token=>{try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub||'';}catch(_){return '';}};
const key=a=>a.module+':'+a.account_id,setting=()=>data?.settings.find(s=>key(s)===selected),account=()=>data?.accounts.find(a=>key(a)===selected);
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function status(text,error=false){$('status').textContent=text;$('status').dataset.error=String(error);}
function message(error){return ({auth_required:'Войдите в модуль «Аккаунты» под своим пользователем.',subject_mismatch:'Пользователь CRM и модуля не совпадает. Перезайдите в «Аккаунты».',revision_conflict:'Настройки изменены в другой вкладке. Обновите данные и повторите сохранение.',permission_denied:'Нет доступа к этой организации.'})[error.code]||'Не удалось подтвердить данные на сервере. Ранее полученные данные сохранены.';}
async function session(){
 const store=window.AVITOLOG_AVITO_SESSION_STORE;let record=await store?.readVersioned();
 if(!record?.available||record.signedOut||!record.session?.access_token)throw {code:'auth_required'};
 let s=record.session;const id=subject(s.access_token);
 if(!UUID.test(id)||expected&&id!==expected||user&&id!==user)throw {code:'subject_mismatch'};
 if(Number(s.expires_at)*1000<Date.now()+60000){
  if(!s.refresh_token)throw {code:'auth_required'};
  const r=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw {code:'auth_required'};const next=await r.json();if(subject(next.access_token)!==id)throw {code:'subject_mismatch'};
  const written=await store.writeRefresh(next,record.revision,s.access_token);if(!written.saved&&!written.conflict)throw {code:'auth_required'};
  record=await store.readVersioned();s=record.session;if(record.signedOut||!s||subject(s.access_token)!==id)throw {code:'auth_required'};
 }
 user=id;return s;
}
async function rpc(name,body){
 if(!['avito_guard_dashboard','avito_guard_save','avito_guard_cloud_dashboard','avito_guard_cloud_save'].includes(name))throw {code:'invalid_request'};
 const s=await session(),owner=user;
 const response=await fetch(cfg.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const value=await response.json();await session();if(owner!==user)throw {code:'subject_mismatch'};
 if(!response.ok)throw {code:response.status===401?'auth_required':value?.code==='40001'?'revision_conflict':response.status===403?'permission_denied':'server_error'};return value;
}
const cloudUI=createCloudUI({rpc,setting,account,org,onStatus:status});
function time(value){return value?new Date(value).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'нет данных';}
function viewEvents(){return (data?.events||[]).filter(e=>(!selected||e.settings_id===setting()?.id)&&(!$('filter').value||e.severity===$('filter').value));}
function render(){
 if(!data)return;
 const select=$('account'),old=selected;select.replaceChildren();for(const a of data.accounts){const option=el('option',a.display_name);option.value=key(a);select.append(option);}selected=data.accounts.some(a=>key(a)===old)?old:data.settings.length?key(data.settings[0]):data.accounts[0]?key(data.accounts[0]):'';select.value=selected;
 const s=setting(),runtime=data.runtime.find(r=>r.settings_id===s?.id);$('enabled').checked=s?.enabled===true;$('enabled').disabled=!account();
 $('runtime').textContent=runtime?'Последний срез: '+time(runtime.last_success_at)+(runtime.last_error?' · данные неполные / API временно недоступен':'')+' · в текущем обходе: '+runtime.cycle_items:s?'Ожидаем первый серверный срез':'Наблюдение не подключено';
 const rows=viewEvents();$('signals').textContent=String(rows.length);$('quarantines').textContent=String(rows.filter(e=>e.severity==='quarantine').length);
 let seen='';try{seen=localStorage.getItem('avito_guard_seen:'+user+':'+org)||'';}catch(_){}$('unread').textContent=String(rows.filter(e=>e.created_at>seen).length);
 $('events').replaceChildren();for(const event of rows){const tr=el('tr');tr.append(el('td',time(event.created_at)),el('td',event.item_id));const title=el('td');if(/^https:\/\/(?:[a-z0-9-]+\.)?avito\.ru\//i.test(event.item_url||'')){const a=el('a',event.title||event.item_id);a.href=event.item_url;a.target='_blank';a.rel='noopener noreferrer';title.append(a);}else title.textContent=event.title||event.item_id;title.title=event.title;tr.append(title);const signal=el('td','+'+event.views_delta+' / '+event.window_minutes+' мин · контакты +'+event.contacts_delta);signal.className='severity-'+event.severity;tr.append(signal,el('td',cloudUI.result(event)||(event.severity==='quarantine'?'Порог карантина · не снято с публикации':'Предупреждение')));$('events').append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','Сигналов пока нет. Нужны как минимум два подтверждённых среза.');td.colSpan=5;tr.append(td);$('events').append(tr);}chart(rows);cloudUI.render();
}
function chart(events){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 190');svg.setAttribute('role','img');svg.setAttribute('aria-label','Сигналы за последние 24 часа');
 const end=Math.floor(Date.now()/3600000)*3600000,start=end-23*3600000,bins=Array.from({length:24},()=>({warning:0,quarantine:0,files:0}));for(const e of events){const i=Math.floor((Date.parse(e.created_at)-start)/3600000);if(i>=0&&i<24)bins[i][e.severity]++;}for(const action of cloudUI.actions()){const i=Math.floor((Date.parse(action.updated_at)-start)/3600000);if(i>=0&&i<24)bins[i].files++;}const max=Math.max(1,...bins.map(b=>Math.max(b.warning,b.quarantine,b.files)));
 for(const severity of ['warning','quarantine','files']){const line=document.createElementNS(ns,'polyline');line.setAttribute('points',bins.map((b,i)=>(30+i*40)+','+(155-125*b[severity]/max)).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',severity==='warning'?'#ffd47c':severity==='quarantine'?'#ff899c':'#6ae2d2');line.setAttribute('stroke-width','3');svg.append(line);}
 for(const i of [0,6,12,18,23]){const t=document.createElementNS(ns,'text');t.setAttribute('x',String(30+i*40));t.setAttribute('y','180');t.setAttribute('fill','#9bb1c3');t.setAttribute('font-size','12');t.textContent=new Date(start+i*3600000).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});svg.append(t);}$('chart').replaceChildren(svg);
}
async function save(enabled,rules,edit){const a=edit?.account||account(),s=setting();if(!a)throw {code:'invalid_request'};const saved=await rpc('avito_guard_save',{p_org:org,p_module:a.module,p_account:a.account_id,p_revision:edit?edit.revision:s?.revision??-1,p_enabled:enabled,p_rules:normalizeRules(rules||s?.rules||{})});data.settings=data.settings.filter(x=>x.id!==saved.id).concat(saved);render();return saved;}
async function load(seed=false){if(loading)return;loading=true;const turn=++generation;$('refresh').disabled=true;try{
 if(!UUID.test(org||'')||params.get('embedded')==='1'&&!UUID.test(expected))throw {code:'subject_mismatch'};
 const result=await rpc('avito_guard_dashboard',{p_org:org});if(turn!==generation)return;if(!result||!Array.isArray(result.accounts)||!Array.isArray(result.settings))throw {code:'permission_denied'};data=result;await cloudUI.load();
 if(seed&&!seeded){seeded=true;const ids=defaultAccountIds(data.accounts.map(a=>({...a,id:key(a)})));for(const id of ids){if(data.settings.some(s=>key(s)===id))continue;selected=id;await save(true,{});}}
 render();status('Мониторинг работает на сервере без открытой вкладки. Статус изменений файла показан в подключении облака.');
 }catch(error){if(['auth_required','subject_mismatch','permission_denied'].includes(error.code)){generation++;data=null;selected='';cloudUI.clear();$('account').replaceChildren();$('events').replaceChildren();$('chart').replaceChildren();for(const id of ['signals','quarantines','unread'])$(id).textContent='—';$('runtime').textContent='';$('enabled').checked=false;$('enabled').disabled=true;if($('rules').open)$('rules').close();$('rules-form').reset();}status(message(error),true);}finally{loading=false;$('refresh').disabled=false;}}
$('refresh').addEventListener('click',()=>load());$('account').addEventListener('change',()=>{selected=$('account').value;render();});$('filter').addEventListener('change',render);
$('enabled').addEventListener('change',async()=>{const checkbox=$('enabled'),enabled=checkbox.checked;checkbox.disabled=true;try{await save(enabled);status(enabled?'Наблюдение включено. Объявления не меняются.':'Наблюдение выключено.');}catch(e){status(message(e),true);render();}});
$('add').addEventListener('click',async()=>{try{await save(false);status('Аккаунт подключён. Включите сбор сигналов.');}catch(e){status(message(e),true);}});
$('seen').addEventListener('click',()=>{try{localStorage.setItem('avito_guard_seen:'+user+':'+org,new Date().toISOString());render();}catch(_){status('Не удалось сохранить отметку прочтения.',true);}});
$('settings').addEventListener('click',()=>{if(!account())return;editing={account:{...account()},revision:setting()?.revision??-1,enabled:setting()?.enabled===true};const form=$('rules-form'),rules=normalizeRules(setting()?.rules||{});for(const [name,value]of Object.entries(rules)){const input=form.elements.namedItem(name);if(!input)continue;if(input.type==='checkbox')input.checked=value;else input.value=Array.isArray(value)?value.join(name==='titles'?'\n':', '):value;}$('save-status').textContent='';$('rules').showModal();});$('close-rules').addEventListener('click',()=>$('rules').close());
$('rules').addEventListener('close',()=>{editing=null;});
$('rules-form').addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget,submit=f.querySelector('[type=submit]');submit.disabled=true;try{if(!editing)throw {code:'auth_required'};const rules=normalizeRules({warningViews:Number(f.warningViews.value),quarantineViews:Number(f.quarantineViews.value),windowsMinutes:f.windowsMinutes.value.split(',').map(x=>Number(x.trim())),noContacts:f.noContacts.checked,batchedTrigger:f.batchedTrigger.checked,cooldownMinutes:Number(f.cooldownMinutes.value),pauseAutoload:f.pauseAutoload.checked,titles:f.titles.value.split('\n').map(x=>x.trim()).filter(Boolean),mode:'monitor'});await save(editing.enabled,rules,editing);$('rules').close();status('Правила сохранены.');}catch(error){$('save-status').textContent=error.code?.startsWith('invalid_')?'Проверьте числа, интервалы и заголовки (до 50 символов).':message(error);}finally{submit.disabled=false;}});

load(true);setInterval(()=>{if(document.visibilityState!=='hidden')load();},15000);
