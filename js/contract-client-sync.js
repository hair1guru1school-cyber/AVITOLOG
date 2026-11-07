(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ContractClientSync=api.install(root);}(typeof window==='object'?window:this,function(){
  'use strict';
  var FIELDS=['fio','fullName','shortName','companyName','legalAddress','postalAddress','actualAddress','ceo','contacts','phone','email','inn','kpp','ogrn','account','bank','bik','corrAccount','passport'];
  function text(value){return value==null?'':String(value).trim();}
  function same(a,b){return !!text(a)&&text(a)===text(b);}
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function requisites(data){var fields={};FIELDS.forEach(function(key){var value=text(data&&data[key]);if(value){if(value.length>2000)throw Error('Слишком длинное поле реквизитов.');fields[key]=value;}});return fields;}
  function clientFields(fields){
    var legal=fields.shortName||fields.fullName||fields.companyName||fields.fio||'',person=fields.ceo||fields.fio||'';
    if(/^(?:ООО|АО|ПАО|ОАО|ЗАО|общество)(?:\s|[«"]|$)/i.test(person))person='';
    person=person.replace(/^(?:ИП|индивидуальный предприниматель)\s+/i,'');
    if(!person&&!fields.kpp&&!fields.ogrn&&!/^(?:ООО|АО|ПАО|ОАО|ЗАО|общество)(?:\s|[«"]|$)/i.test(legal))person=legal.replace(/^(?:ИП|индивидуальный предприниматель)\s+/i,'');
    var type=/^(?:ИП|индивидуальный предприниматель)(?:\s|$)/i.test(legal)?'ИП':/^(?:ООО|общество с ограниченной ответственностью)(?:\s|[«"]|$)/i.test(legal)?'ООО':person&&!fields.kpp&&!fields.ogrn&&(!fields.inn||/^\d{12}$/.test(fields.inn.replace(/\s/g,'')))?'Физ':'';
    return {company:legal,contact_name:person,phone:fields.phone||'',email:fields.email||'',client_type:type};
  }
  function merge(record,fields,at){
    var out=copy(record||{}),previous=out.contractRequisitesV1||{},old=previous.fields||{},entityChanged=old.inn&&fields.inn&&old.inn!==fields.inn,next=Object.assign({},entityChanged?{}:old,fields),auto=Object.assign({},out.contractClientAutoV1||{}),values=clientFields(next);
    Object.keys(values).forEach(function(key){if(values[key]&&(!text(out[key])||text(out[key])===text(auto[key]))){out[key]=values[key];auto[key]=values[key];}});
    if(JSON.stringify(next)!==JSON.stringify(old)){
      var history=Array.isArray(previous.history)?previous.history.slice():[];if(Object.keys(old).length)history.push({fields:copy(old),at:previous.updatedAt||''});
      out.contractRequisitesV1={version:1,fields:next,updatedAt:at,history:history};
    }
    if(Object.keys(auto).length)out.contractClientAutoV1=auto;
    return out;
  }
  function locate(clients,projects,binding){
    if(!Array.isArray(clients)||!projects||!Array.isArray(projects.projects))throw Error('Данные клиента ещё не загружены.');
    var matches=clients.filter(function(c){return binding.clientId?same(c.client_id,binding.clientId):same(c.folderId,binding.folderId);});
    if(matches.length>1||binding.clientId&&matches.length!==1)throw Error('Не удалось однозначно определить клиента договора.');
    var source=matches[0]||null;
    if(source&&binding.folderId&&source.folderId&&!same(source.folderId,binding.folderId))throw Error('Папка клиента договора изменилась.');
    var linked=projects.projects.concat(projects.hiddenProjects||[]).filter(function(p){return source?(p.crmClientId?same(p.crmClientId,source.client_id):same(p.folderId,source.folderId)):!p.crmClientId&&same(p.folderId,binding.folderId);});
    if(linked.length>1)throw Error('Клиент связан с несколькими проектами. Проверьте привязку.');
    if(!source&&!linked.length)throw Error('Не удалось однозначно определить клиента договора.');
    if(binding.folderId&&linked.some(function(p){return p.folderId&&!same(p.folderId,binding.folderId);}))throw Error('Папка проекта не совпадает с клиентом договора.');
    return {source:source,linked:linked};
  }
  function plan(clients,projects,binding,fields,at){
    var rows=copy(clients),data=copy(projects),found=locate(rows,data,binding),source=found.source,linked=found.linked;
    var before=source||linked[0].crmData||{},updated=merge(before,fields,at);if(source)rows[rows.indexOf(source)]=updated;
    linked.forEach(function(p){p.crmData=merge(p.crmData||{},fields,at);});
    return {clients:rows,projects:data,client:updated,before:before,clientChanged:JSON.stringify(rows)!==JSON.stringify(clients),projectChanged:JSON.stringify(data)!==JSON.stringify(projects)};
  }
  function install(win){
    var tail=Promise.resolve(),pending=0;
    function key(base){return typeof win.AVITOLOG_KEY==='function'?win.AVITOLOG_KEY(base):base;}
    function scope(){var id=typeof win.__avitologBackendIdentity==='function'?win.__avitologBackendIdentity()||{}:{};return JSON.stringify([id.id||'',key('avitolog_clients'),key('avitolog_projects'),win.AVITOLOG_KEY_EMAIL||'']);}
    function ready(){return !(win.AVITOLOG_BACKEND_MODE||win.AVITOLOG_BACKEND_SERVER_ONLY)||win.AVITOLOG_BACKEND_INITIAL_SYNC_READY===true;}
    function active(){return typeof win.getActiveClient==='function'?win.getActiveClient():null;}
    function target(){return (typeof win.getSelectedAnalyticsRecentProject==='function'&&win.getSelectedAnalyticsRecentProject())||active()||(typeof win.__goalsGetActiveClient==='function'&&win.__goalsGetActiveClient())||null;}
    function identify(c){var link=text(c&&(c.folderLink||c.driveFolderUrl||c.folderUrl)),match=link.match(/\/folders\/([a-zA-Z0-9_-]+)/);return {scope:scope(),clientId:text(c&&(c.client_id||c.crmClientId)),folderId:text(c&&(c.folderId||c.folder_id||c.drive_folder_id))||(match?match[1]:'')};}
    function capture(){var c=target(),b=identify(c);return ready()&&c&&(b.clientId||b.folderId)?b:null;}
    function guard(binding){var current=capture();if(!binding||!current||binding.scope!==current.scope||binding.clientId!==current.clientId||binding.folderId!==current.folderId)throw Error('Клиент или режим изменился. Данные договора не перенесены.');}
    function read(binding){
      try{guard(binding);var found=locate(win.getCrmClients(),win.loadProjectsData(),binding),sources=[found.source].concat(found.linked.map(function(p){return p.crmData;})).filter(Boolean).map(function(c){return c.contractRequisitesV1;}).filter(function(r){return r&&r.fields;});
        sources.sort(function(a,b){return text(b.updatedAt).localeCompare(text(a.updatedAt));});return sources.length?requisites(sources[0].fields):{};
      }catch(_){return {};}
    }
    function refresh(result,binding){
      guard(binding);var c=active(),b=identify(c);if(!c||b.clientId!==binding.clientId||b.folderId!==binding.folderId)return;Object.assign(c,result.client);
      if(win.document){Object.keys(clientFields(result.client.contractRequisitesV1.fields)).forEach(function(key){var input=win.document.getElementById(key);if(input&&text(input.value)===text(result.before[key]))input.value=result.client[key]||'';});}
    }
    function save(data,binding){
      var fields;try{guard(binding);fields=requisites(data);if(!Object.keys(fields).length)return Promise.resolve({ok:true,empty:true});}catch(error){return Promise.resolve({ok:false,error:error.message});}
      pending++;
      var task=tail.then(async function(){
        guard(binding);var result,clientKey=key('avitolog_clients'),projectKey=key('avitolog_projects'),at=new Date().toISOString();
        if(win.AVITOLOG_BACKEND_MODE||win.AVITOLOG_BACKEND_SERVER_ONLY){
          if(typeof win.__avitologBackendCommitStatePatch!=='function')throw Error('Обновите страницу для надёжного сохранения данных договора.');
          await win.__avitologBackendCommitStatePatch([clientKey,projectKey],function(values){guard(binding);result=plan(JSON.parse(values[clientKey]||'null'),JSON.parse(values[projectKey]||'null'),binding,fields,at);var updates={};if(result.clientChanged)updates[clientKey]=JSON.stringify(result.clients);if(result.projectChanged)updates[projectKey]=JSON.stringify(result.projects);return updates;});
        }else{
          result=plan(win.getCrmClients(),win.loadProjectsData(),binding,fields,at);
          if(result.clientChanged)win.saveCrmClients(result.clients);if(result.projectChanged)win.saveProjectsData(result.projects);
          if(result.clientChanged&&win.localStorage.getItem(clientKey)!==JSON.stringify(result.clients)||result.projectChanged&&win.localStorage.getItem(projectKey)!==JSON.stringify(result.projects))throw Error('Хранилище не подтвердило запись реквизитов. Повторите сохранение.');
        }
        guard(binding);refresh(result,binding);return {ok:true,changed:result.clientChanged||result.projectChanged};
      }).catch(function(error){return {ok:false,error:error.message||'Не удалось сохранить реквизиты клиента.'};}).finally(function(){pending--;});
      tail=task;return task;
    }
    if(win.addEventListener)win.addEventListener('beforeunload',function(event){if(pending){event.preventDefault();event.returnValue='';}});
    return Object.freeze({capture:capture,target:target,read:read,save:save});
  }
  return {requisites:requisites,clientFields:clientFields,merge:merge,plan:plan,install:install};
}));
