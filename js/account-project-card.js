(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AccountProjectCard=api.install(root);})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var ORIGIN='https://avitoboss.online',ACCOUNT=/^(personal|oauth):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/g,'');}
  function candidates(ids,name,data,clients){
    var exact=[],named=[],n=norm(name);
    (data.projects||[]).forEach(function(p){
      var linked=(clients||[]).filter(function(c){return p.crmClientId&&c.client_id===p.crmClientId||!p.crmClientId&&p.folderId&&c.folderId===p.folderId;});
      if(ids.indexOf(p.avitoConnectionId)>=0||ids.indexOf((p.crmData||{}).avito_connection_id)>=0||linked.length===1&&ids.indexOf(linked[0].avito_connection_id)>=0)exact.push(p);
      else if(n&&(norm(p.title)===n||norm((p.crmData||{}).company)===n))named.push(p);
    });return exact.length?exact:named;
  }
  function valid(event,frame,context){
    if(!frame||event.origin!==ORIGIN||event.source!==frame.contentWindow||!context.active||!context.uid||!context.org)return false;
    var data=event.data;
    if(!data||data.type!=='avitolog:project-card:open'||typeof data.requestId!=='string'||!/^[-\w]{16,80}$/.test(data.requestId)||data.userId!==context.uid||data.organizationId!==context.org||data.profile!==context.profile||!Array.isArray(data.accountIds)||!data.accountIds.length||data.accountIds.length>2||!data.accountIds.every(function(id){return typeof id==='string'&&ACCOUNT.test(id);})||typeof data.name!=='string'||data.name.length>200)return false;
    try{var url=new URL(frame.src);return url.origin===ORIGIN&&url.pathname==='/integrations/avito-accounts/'&&['embedded','expected_user_id','organization_id','profile'].every(function(k){return url.searchParams.getAll(k).length===1;})&&url.searchParams.get('embedded')==='1'&&url.searchParams.get('expected_user_id')===context.uid&&url.searchParams.get('organization_id')===context.org&&url.searchParams.get('profile')===context.profile;}catch(e){return false;}
  }
  function install(win){
    var doc=win.document,picker=null;
    function ready(){return !win.AVITOLOG_BACKEND_MODE||win.AVITOLOG_BACKEND_INITIAL_SYNC_READY===true;}
    function context(){var actor=typeof win.__avitologBackendIdentity==='function'&&win.__avitologBackendIdentity(),profile=win.AVITOLOG_KEY_SUFFIX==='_sasha'?'sasha':'fil';return {uid:actor&&actor.id||'',profile:profile,org:(win.AVITOLOG_SUPABASE?.profileOrganizations||{})[profile]||'',active:doc.body.classList.contains('avito-accounts-mode')};}
    function closePicker(){if(picker){picker.remove();picker=null;}}
    function open(ids,name){
      if(!ready()||!win.ProjectCard||!ids.every(function(id){return ACCOUNT.test(id);}))return false;
      var data=typeof win.loadProjectsData==='function'?win.loadProjectsData():{projects:[]},clients=typeof win.getCrmClients==='function'?win.getCrmClients():[],matches=candidates(ids,name,data,clients);
      if(matches.length===1){win.ProjectCard.open(matches[0].id);return true;}
      closePicker();var owner=context(),node=doc.createElement('div');picker=node;node.style.cssText='position:fixed;inset:0;z-index:18010;display:grid;place-items:center;background:#0008;padding:20px';
      node.innerHTML='<section role="dialog" aria-modal="true" aria-label="Выбор карты проекта" style="max-width:520px;width:100%;padding:20px;border:1px solid var(--border,#345);border-radius:14px;background:var(--surface,#142132);color:var(--text,#fff)"><h3>Карта проекта</h3><p data-description></p><label>Проект<select data-project style="display:block;width:100%;padding:9px;margin:10px 0"></select></label><div style="display:flex;gap:8px"><button type="button" data-open>Открыть карту</button><button type="button" data-cancel>Отмена</button></div></section>';
      node.querySelector('[data-description]').textContent=matches.length?'С этим аккаунтом связано несколько проектов. Выберите нужный.':'Однозначная привязка не найдена. Выберите проект; существующие привязки не изменятся.';
      var select=node.querySelector('[data-project]'),list=matches.length?matches:(data.projects||[]).slice().sort(function(a,b){return String(a.title||'').localeCompare(String(b.title||''),'ru');});
      list.forEach(function(p){var option=doc.createElement('option');option.value=String(p.id);option.textContent=p.title||p.crmData?.company||'Без названия';select.appendChild(option);});
      node.querySelector('[data-open]').disabled=!list.length;node.querySelector('[data-open]').onclick=function(){var now=context();if(now.uid!==owner.uid||now.profile!==owner.profile||!ready()){closePicker();return;}var id=select.value;closePicker();win.ProjectCard.open(id);};
      node.querySelector('[data-cancel]').onclick=closePicker;node.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker();}});doc.body.appendChild(node);select.focus();return true;
    }
    win.addEventListener('message',function(event){var ctx=context(),frame=doc.getElementById('avitoAccountsFrame');if(!valid(event,frame,ctx)||!ready())return;var ok=false;try{ok=open(event.data.accountIds,event.data.name);}catch(e){}event.source.postMessage({type:'avitolog:project-card:result',requestId:event.data.requestId,ok:ok},ORIGIN);});
    doc.addEventListener('avitolog:workspace-reset',closePicker);
    function fromUrl(){if(!ready())return;var url=new URL(win.location.href),id=url.searchParams.get('projectAccount');if(!id)return;url.searchParams.delete('projectAccount');win.history.replaceState(null,'',url.pathname+url.search+url.hash);if(ACCOUNT.test(id))open([id],'');}
    doc.addEventListener('avitolog:backend-initial-ready',fromUrl);if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',fromUrl);else fromUrl();
    return {open:open};
  }
  return {candidates:candidates,valid:valid,install:install};
});
