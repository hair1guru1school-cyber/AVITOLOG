(function () {
  'use strict';
  if (window.AVBTelegramLeads) return;
  var win=window,doc=document,data=null,months=Object.create(null),owner='',generation=0,loading=false,folderBusy=false,dialog=null,view=null,page=[],cursor=null,busy=false,configBusy=false;
  var messages={authentication_required:'Войдите в систему.',initial_sync_pending:'Данные ещё загружаются.',foreign_webhook:'У бота уже есть другой обработчик. Он не изменён.',bot_admin_required:'Боту нужны права администратора в группе.',bot_required:'Сначала подключите @avbssbot в настройках отправки Telegram.',settings_conflict:'Настройки изменены в другом окне. Обновите список.',copy_deleted:'Эта копия была удалена вручную. Автоматически не восстанавливаю.',invalid_crm_state:'CRM требует проверки. Оригинал заявки сохранён.',sasha_disabled:'Назначение Саше отключено в настройках.',invalid_target:'Выберите неделю текущего месяца.',context_changed:'Режим изменился. Откройте ящик заново.',telegram_context_unavailable:'Дождитесь загрузки или вернитесь в свой режим.',telegram_access_denied:'Проверьте доступ бота к группе.',storage_unavailable:'Сервер временно недоступен. Заявки не удалены.'};
  function message(error){return messages[error.message]||'Не удалось выполнить действие. Сохранённые заявки не изменены; обновите список.';}
  function el(tag,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
  function profile(){return win.AVITOLOG_KEY_SUFFIX==='_sasha'?'sasha':'fil';}
  function scope(){var id=typeof win.__avitologBackendIdentity==='function'&&win.__avitologBackendIdentity();return id&&id.id?id.id+'|'+profile():'';}
  function writable(){return typeof win.AVITOLOG_PROFILE_LOCKED!=='boolean'||(profile()==='sasha')===win.AVITOLOG_PROFILE_LOCKED;}
  function month(){var d=new Date(Date.now()-5*3600000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(d).replace(/^(\d{2})\/(\d{4})$/,'$2-$1');}
  function currentWeek(){return Math.min(4,Math.ceil(Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Moscow',day:'numeric'}).format(new Date()))/7));}
  function reset(){generation++;owner=scope();data=null;months=Object.create(null);page=[];cursor=null;loading=false;close();var status=doc.querySelector('.tg-lead-config-status');if(status){status.textContent='';delete status.dataset.manual;}paint();}
  async function request(action,body){var expected=scope(),gen=generation;if(!expected||typeof win.__avitologTelegramLeadsRequest!=='function')throw Error('authentication_required');var result=await win.__avitologTelegramLeadsRequest(action,body);if(expected!==scope()||gen!==generation)throw Error('context_changed');return result;}
  function notice(text,isError){if(dialog){var n=dialog.querySelector('.tg-inbox-status');if(n)n.textContent=text;}else if(win.AVBSaveStatus&&typeof win.AVBSaveStatus.set==='function')win.AVBSaveStatus.set('telegram-leads',isError?'error':'saved',text);}
  function weekButtonHtml(year,zeroMonth,week){return '<button type="button" class="tg-leads-week goal-week-add" data-tg-month="'+Number(year)+'-'+String(Number(zeroMonth)+1).padStart(2,'0')+'" data-tg-week="'+Number(week)+'"><span class="tg-leads-label">📨 + клиент с ТГ</span><span class="tg-leads-badge" hidden></span></button>';}
  function responsibleHtml(project){if(!project||!/^[0-9a-f-]{36}$/.test(project.telegramLeadId||''))return '';return '<select class="tg-lead-responsible" aria-label="Ответственный" title="Копировать в CRM исполнителя; оригинал остаётся в ящике" data-tg-lead="'+project.telegramLeadId+'" data-tg-target-week="'+Math.max(1,Math.min(4,Number(project.weekIndex)||1))+'"><option value="fil"'+(project.telegramResponsible!=='sasha'?' selected':'')+'>Фил</option><option value="sasha"'+(project.telegramResponsible==='sasha'?' selected':'')+'>Саша</option></select>';}
  function paint(){
    doc.querySelectorAll('.tg-leads-week').forEach(function(button){var same=button.dataset.tgMonth===month(),cached=months[button.dataset.tgMonth],count=cached&&cached.weeks?Number(cached.weeks[button.dataset.tgWeek]||0):null,pending=data?Number(data.pendingCount||0):0;
      button.hidden=!!(data&&data.config&&data.config.show_weekly===false)||count===0&&!(same&&Number(button.dataset.tgWeek)===currentWeek());
      var label='📨 + клиент с ТГ'+(count?' · '+count:''),labelNode=button.querySelector('.tg-leads-label'),badge=button.querySelector('.tg-leads-badge');if(labelNode&&labelNode.textContent!==label)labelNode.textContent=label;if(badge){var value=pending&&same&&Number(button.dataset.tgWeek)===currentWeek()?String(pending):'';badge.hidden=!value;if(badge.textContent!==value)badge.textContent=value;}
      button.title='Недельный ящик. Нераспределённых всего: '+pending;
      if(!cached&&scope()&&win.AVITOLOG_BACKEND_INITIAL_SYNC_READY){var ym=button.dataset.tgMonth;months[ym]={loading:true};request('snapshot',{month:ym}).then(function(value){months[ym]=value;paint();},function(){delete months[ym];});}
    });
    doc.querySelectorAll('.tg-lead-responsible').forEach(function(select){select.disabled=!writable()||busy||!data;var fil=select.querySelector('option[value="fil"]');if(fil)fil.disabled=!!data&&!data.canManage;});
    mountSettings();
  }
  async function refresh(){
    if(scope()!==owner)reset();if(!scope()||loading||!win.AVITOLOG_BACKEND_INITIAL_SYNC_READY)return;
    loading=true;var gen=generation;
    try{var result=await request('snapshot',{month:month()});data=result;months[month()]=result;paint();syncSettings();if(!folderBusy)folders(result.folders||[]);}
    catch(_){}finally{if(gen===generation)loading=false;}
  }
  function close(){if(dialog)dialog.remove();dialog=null;view=null;}
  async function open(ym,week,pending){
    close();view={month:ym,week:week,pending:!!pending};page=[];cursor=null;
    dialog=el('dialog','tg-inbox');var header=el('header'),title=el('strong','','Заявки Telegram · '+(pending?'Нераспределённые':ym+' · '+week+' неделя'));header.appendChild(title);
    var exit=el('button','','×');exit.type='button';exit.onclick=close;header.appendChild(exit);dialog.appendChild(header);
    var tools=el('div','tg-inbox-tools');[['По неделе',false],['Все нераспределённые',true]].forEach(function(pair){var button=el('button','',pair[0]);button.onclick=function(){open(ym,week,pair[1]);};tools.appendChild(button);});dialog.appendChild(tools);
    dialog.appendChild(el('p','tg-inbox-status','Загрузка…'));dialog.appendChild(el('div','tg-inbox-rows'));doc.body.appendChild(dialog);dialog.addEventListener('cancel',function(e){e.preventDefault();close();});dialog.showModal();await loadPage();
  }
  async function loadPage(){
    var target=dialog,selected=view;if(!target||busy)return;
    try{var result=await request('snapshot',{month:selected.month,week:selected.week,pending:selected.pending,before:cursor});if(target!==dialog)return;
      if(selected.month===month()){data=Object.assign({},data||{},result);paint();}
      var seen=new Set(page.map(function(row){return row.id;}));result.rows.forEach(function(row){if(!seen.has(row.id))page.push(row);});
      var last=result.rows[result.rows.length-1];cursor=last?{at:last.received_at,id:last.id}:null;renderRows(result.hasMore);notice(data&&data.config&&!data.config.ready?'Приём ещё не подключён. Откройте шестерёнку CRM.':'Оригиналы остаются в ящиках после копирования. Папки создаются при подключённом Drive.');
    }catch(error){if(target===dialog)notice(message(error));}
  }
  function renderRows(more){
    var holder=dialog.querySelector('.tg-inbox-rows');holder.replaceChildren();if(!page.length)holder.appendChild(el('p','','Пока нет заявок.'));
    page.forEach(function(row){var card=el('article','tg-inbox-card'),f=row.fields||{};card.appendChild(el('strong','',f.title||f.name||'Заявка Telegram'));card.appendChild(el('p','',[(f.niche?'Ниша: '+f.niche:''),(f.city?'Гео: '+f.city:''),f.phone,f.telegram].filter(Boolean).join(' · ')));
      var link=el('a','','Сообщение · '+row.source_date);link.href='https://t.me/c/2150164780/'+Number(row.message_id);link.target='_blank';link.rel='noopener noreferrer';card.appendChild(link);
      card.appendChild(el('small','',row.folder_confirmed?'Папка Drive привязана':'Папка Drive ожидает подключения/создания'));
      var copies=(row.copies||[]).map(function(c){return (c.profile==='sasha'?'Саша':'Фил')+' · '+c.month.slice(0,7)+' · '+c.week+' нед.';});if(copies.length)card.appendChild(el('p','tg-inbox-copies',copies.join(' | ')));
      var actions=el('div','tg-inbox-actions'),who=el('select'),week=el('select');who.setAttribute('aria-label','Исполнитель');week.setAttribute('aria-label','Неделя');
      (data&&data.canManage?['fil','sasha']:['sasha']).forEach(function(p){if(p==='sasha'&&data.config&&data.config.allow_sasha===false&&profile()!=='sasha')return;var option=el('option','',p==='sasha'?'Саша':'Фил');option.value=p;who.appendChild(option);});who.value=profile();
      for(var i=1;i<=4;i++){var option=el('option','',i+' неделя');option.value=String(i);week.appendChild(option);}week.value=String(view.month===month()?view.week:currentWeek());
      var add=el('button','tg-inbox-primary','В неделю'),pin=el('button','','В закреп');[who,week,add,pin].forEach(function(n){n.disabled=!writable()||busy;actions.appendChild(n);});
      add.onclick=function(){act(row.id,who.value,Number(week.value),false);};pin.onclick=function(){if(who.value!==profile()){notice('Для закрепления выберите текущий режим. Для передачи другому исполнителю нажмите «В неделю».');return;}act(row.id,who.value,Number(week.value),true);};card.appendChild(actions);holder.appendChild(card);
    });if(more){var next=el('button','','Ещё заявки');next.onclick=loadPage;holder.appendChild(next);}
  }
  async function act(id,target,week,pin){
    if(busy||!writable())return;busy=true;var expected=scope(),gen=generation;
    if(dialog)dialog.querySelectorAll('button,select').forEach(function(n){n.disabled=true;});paint();
    try{var result=await request(pin?'pin':'assign',{leadId:id,profile:target,month:month(),week:week});
      if(typeof win.__avitologBackendPullNow==='function')await win.__avitologBackendPullNow();if(expected!==scope()||gen!==generation)throw Error('context_changed');
      if(pin){var clients=typeof win.getCrmClients==='function'?win.getCrmClients():[],client=clients.find(function(c){return c.client_id===result.clientId;});if(!client)throw Error('storage_unavailable');win._selectedProjectId=null;if(typeof win.setActiveClient==='function')win.setActiveClient(client);if(typeof win.fillClientFormFromData==='function')win.fillClientFormFromData(client);}
      notice(pin?'Клиент закреплён слева.':'Сохранено в CRM '+(target==='sasha'?'Саши':'Фила')+'. Оригинал остался в ящике.');
    }catch(error){notice(message(error),true);}finally{busy=false;paint();if(dialog){page=[];cursor=null;await loadPage();}await refresh();}
  }
  function mountSettings(){
    var menu=doc.getElementById('crmSettingsMenu');if(!menu||menu.querySelector('.tg-lead-settings'))return;
    var section=el('section','tg-lead-settings');section.appendChild(el('h3','','Заявки из Telegram'));
    var status=el('p','tg-lead-config-status');section.appendChild(status);
    var setup=el('button','','Подключить / проверить приём');setup.onclick=async function(){if(configBusy)return;configBusy=true;status.dataset.manual='true';status.textContent='Проверяю доступ бота…';syncSettings();try{await request('configure',{});await refresh();status.textContent='Приём подключён. Новые заявки сохраняются и при закрытом браузере.';}catch(error){status.textContent=message(error);}finally{configBusy=false;syncSettings();}};section.appendChild(setup);
    [['enabled','Принимать заявки @Aces_Of_Ads_bot'],['auto_client','Создавать карточку клиента в базе'],['auto_folder','Создавать папку Drive в фоне'],['allow_sasha','Разрешить назначение Саше'],['show_weekly','Показывать недельные ящики']].forEach(function(pair){var label=el('label','crm-settings-option'),input=el('input');input.type='checkbox';input.dataset.tgSetting=pair[0];input.onchange=async function(){if(configBusy)return;var patch={revision:data&&data.config&&data.config.revision};patch[pair[0]]=input.checked;configBusy=true;status.dataset.manual='true';syncSettings();try{await request('settings',patch);await refresh();status.textContent='Настройка сохранена на сервере.';}catch(error){status.textContent=message(error);}finally{configBusy=false;syncSettings();}};label.appendChild(input);label.appendChild(el('span','',pair[1]));section.appendChild(label);});
    section.appendChild(el('p','crm-settings-hint','Источник: -1002150164780. Папки создаются при подключённом Google Drive; заявки в это время уже сохранены на сервере. Старую историю группы Telegram не отдаёт.'));menu.appendChild(section);syncSettings();
  }
  function syncSettings(){doc.querySelectorAll('[data-tg-setting]').forEach(function(input){input.checked=!data||!data.config||data.config[input.dataset.tgSetting]!==false;input.disabled=configBusy||!data||!data.canManage||!data.config||!writable();});var status=doc.querySelector('.tg-lead-config-status');if(status&&status.dataset.manual!=='true'){var text=data&&data.config&&data.config.ready?'Приём подключён.':'Нужно подключить приём заявок.';if(status.textContent!==text)status.textContent=text;}var setup=doc.querySelector('.tg-lead-settings button');if(setup)setup.disabled=configBusy||!data||!data.canManage||!writable();}
  async function folders(rows){
    if(folderBusy||!rows.length||!data||!data.canManage||profile()!=='fil'||!writable()||typeof win.getDriveToken!=='function')return;
    folderBusy=true;var expected=scope(),gen=generation;
    function guard(){if(scope()!==expected||gen!==generation)throw Error('context_changed');}
    try{var token=await win.getDriveToken();guard();var verified=typeof win.__avitologVerifiedDriveIdentity==='function'&&win.__avitologVerifiedDriveIdentity();if(!verified||verified.id!==expected.split('|')[0])return;
      async function drive(path,body){guard();var response=await fetch('https://www.googleapis.com/drive/v3/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});guard();return {ok:response.ok,status:response.status,value:await response.json()};}
      for(var row of rows){guard();try{
        var parent=row.folder_parent_id||(typeof win.getCrmDefaultCategory==='function'&&win.getCrmDefaultCategory().id);if(!parent)continue;
        var id=row.folder_id;if(!id){var ids=await drive('files/generateIds?count=1&space=drive&type=files');if(!ids.ok||!ids.value.ids||!ids.value.ids[0])continue;id=ids.value.ids[0];}
        var reservation=await request('folder',{leadId:row.id,folderId:id,parentId:parent});id=reservation.folderId;parent=reservation.parentId;
        var found=await drive('files/'+encodeURIComponent(id)+'?fields=id,trashed,parents,appProperties');
        if(found.status===404)found=await drive('files?fields=id,trashed,parents,appProperties',{id:id,name:String(row.fields.title||row.fields.name||'Заявка Telegram').slice(0,200),mimeType:'application/vnd.google-apps.folder',parents:[parent],appProperties:{avitologTelegramLead:row.id}});
        if(found.ok&&found.value.id===id&&!found.value.trashed&&found.value.appProperties&&found.value.appProperties.avitologTelegramLead===row.id&&(found.value.parents||[]).indexOf(parent)>=0){await request('folder',{leadId:row.id,folderId:id,parentId:parent,confirm:true});if(typeof win.__avitologBackendPullNow==='function')await win.__avitologBackendPullNow();}
      }catch(error){if(scope()!==expected||gen!==generation)break;}}
    }catch(_){}finally{folderBusy=false;}
  }
  win.AVBTelegramLeads={weekButtonHtml:weekButtonHtml,responsibleHtml:responsibleHtml,refresh:refresh};
  doc.addEventListener('click',function(event){if(event.target.closest('.tg-lead-responsible')){event.stopPropagation();return;}var button=event.target.closest('.tg-leads-week');if(button){event.preventDefault();event.stopPropagation();open(button.dataset.tgMonth,Number(button.dataset.tgWeek),false);}},true);
  doc.addEventListener('change',function(event){var select=event.target.closest('.tg-lead-responsible');if(select){event.stopPropagation();act(select.dataset.tgLead,select.value,Number(select.dataset.tgTargetWeek),false);}});
  function start(){
    var style=el('style');style.textContent='.tg-inbox{width:min(740px,94vw);max-height:86dvh;overflow:auto;background:var(--panel,#111b26);color:var(--text,#e8f3ff);border:1px solid #356078;border-radius:16px;padding:18px;z-index:11000}.tg-inbox::backdrop{background:#0009}.tg-inbox header,.tg-inbox-tools,.tg-inbox-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tg-inbox header{justify-content:space-between}.tg-inbox button,.tg-inbox select{background:#173044;color:inherit;border:1px solid #386079;border-radius:7px;padding:7px 10px;cursor:pointer}.tg-inbox button:disabled{opacity:.5}.tg-inbox-primary{background:#12726b!important}.tg-inbox-card{padding:12px;margin:10px 0;border:1px solid #375265;border-radius:10px}.tg-inbox-card p{margin:8px 0;white-space:pre-wrap}.tg-inbox-card a{color:#69cbef}.tg-inbox-card small{display:block;margin:8px 0;opacity:.65}.tg-inbox-copies,.tg-inbox-status{font-size:12px;opacity:.8}.tg-leads-week{white-space:nowrap}.tg-lead-responsible{max-width:65px;font-size:10px;border:1px solid #436077;border-radius:5px;background:transparent;color:inherit}.tg-lead-settings{border-top:1px solid #53708455;padding-top:8px;margin-top:12px}.tg-lead-config-status{font-size:12px}.tg-leads-week[hidden]{display:none!important}';doc.head.appendChild(style);
    style.textContent+='.tg-inbox{box-sizing:border-box;background:var(--surface,#111b26)}body.day-mode .tg-inbox button,body.day-mode .tg-inbox select{background:#e8f1f7;color:#173248;border-color:#b3c7d6}body.day-mode .tg-inbox a{color:#087499}body.day-mode .tg-inbox-primary{color:#fff!important}@media(max-width:560px){.tg-inbox{padding:12px}.tg-inbox button,.tg-inbox select{min-height:34px}}';
    style.textContent+='.tg-leads-week{position:relative;margin-right:5px}.tg-leads-badge{position:absolute;right:-5px;top:-7px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;background:#64dcea;color:#071a22;font:bold 10px/16px Arial;text-align:center;box-sizing:border-box}.tg-leads-badge[hidden]{display:none}';
    var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;if(scope()!==owner)reset();paint();syncSettings();});}).observe(doc.body,{childList:true,subtree:true});
    refresh();setInterval(function(){refresh();syncSettings();},20000);
  }
  ['avitolog:workspace-reset','avitolog:backend-initial-ready'].forEach(function(name){doc.addEventListener(name,function(){reset();refresh();});});win.addEventListener('focus',refresh);if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();
})();
