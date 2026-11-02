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
  function weekButtonHtml(year,zeroMonth,week){return '<button type="button" class="tg-leads-week goal-week-add" data-tg-month="'+Number(year)+'-'+String(Number(zeroMonth)+1).padStart(2,'0')+'" data-tg-week="'+Number(week)+'"><span class="tg-leads-label">+ ТГ проект</span><span class="tg-leads-badge" aria-hidden="true" hidden></span></button>';}
  function responsibleHtml(project){if(!project||!/^[0-9a-f-]{36}$/.test(project.telegramLeadId||''))return '';return '<select class="tg-lead-responsible" aria-label="Ответственный" title="Копировать в CRM исполнителя; оригинал остаётся в ящике" data-tg-lead="'+project.telegramLeadId+'" data-tg-target-week="'+Math.max(1,Math.min(4,Number(project.weekIndex)||1))+'"><option value="fil"'+(project.telegramResponsible!=='sasha'?' selected':'')+'>Фил</option><option value="sasha"'+(project.telegramResponsible==='sasha'?' selected':'')+'>Саша</option></select>';}
  function paint(){
    doc.querySelectorAll('.tg-leads-week').forEach(function(button){var same=button.dataset.tgMonth===month(),cached=months[button.dataset.tgMonth],count=cached&&cached.weeks?Number(cached.weeks[button.dataset.tgWeek]||0):null,pending=data?Number(data.pendingCount||0):0;
      button.hidden=!!(data&&data.config&&data.config.show_weekly===false)||count===0&&!(same&&Number(button.dataset.tgWeek)===currentWeek());
      var label='+ ТГ проект',labelNode=button.querySelector('.tg-leads-label'),badge=button.querySelector('.tg-leads-badge');if(labelNode&&labelNode.textContent!==label)labelNode.textContent=label;if(badge){var value=pending&&same&&Number(button.dataset.tgWeek)===currentWeek()?String(pending):'';badge.hidden=!value;if(badge.textContent!==value)badge.textContent=value;}
      button.title='Недельный ящик. Нераспределённых всего: '+pending;
      button.setAttribute('aria-label',label+'. Нераспределённых: '+pending);
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
  function close(){if(dialog){try{if(dialog.hidePopover)dialog.hidePopover();}catch(_){}dialog.remove();}dialog=null;view=null;}
  function bounds(){var v=win.visualViewport;return {left:v?v.offsetLeft:0,top:v?v.offsetTop:0,width:v?v.width:win.innerWidth,height:v?v.height:win.innerHeight};}
  function moveWindow(left,top){
    if(!dialog)return;var rect=dialog.getBoundingClientRect(),area=bounds(),gap=8,scale=rect.width/dialog.offsetWidth||1;
    if(rect.width>area.width-gap*2){dialog.style.width=((area.width-gap*2)/scale)+'px';rect=dialog.getBoundingClientRect();}
    if(rect.height>area.height-gap*2){dialog.style.maxHeight=((area.height-gap*2)/scale)+'px';rect=dialog.getBoundingClientRect();}
    left=Math.max(area.left+gap,Math.min(left,area.left+area.width-rect.width-gap));top=Math.max(area.top+gap,Math.min(top,area.top+area.height-rect.height-gap));
    // Account for the application's CSS zoom when converting viewport pixels to layout units.
    dialog.style.left=((parseFloat(dialog.style.left)||0)+(left-rect.left)/scale)+'px';dialog.style.top=((parseFloat(dialog.style.top)||0)+(top-rect.top)/scale)+'px';
  }
  function positionWindow(){
    if(!dialog||!view)return;dialog.style.width='';dialog.style.maxHeight='';var rect=dialog.getBoundingClientRect(),anchor=view.anchor,area=bounds();
    if(view.moved||!anchor){moveWindow(rect.left,rect.top);return;}
    var below=anchor.bottom+6,above=anchor.top-rect.height-6;
    moveWindow(anchor.left,below+rect.height<=area.top+area.height-8?below:above>=area.top+8?above:below);
  }
  function draggable(header){
    var drag=null;header.tabIndex=0;header.setAttribute('aria-label','Переместить окно заявок. Можно перетащить или использовать стрелки.');
    header.addEventListener('pointerdown',function(event){if(event.button!==0||event.target.closest('button,select,a,input'))return;var rect=dialog.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};header.setPointerCapture(event.pointerId);view.moved=true;event.preventDefault();});
    header.addEventListener('pointermove',function(event){if(!drag||drag.id!==event.pointerId)return;moveWindow(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);});
    function stop(){drag=null;}header.addEventListener('pointerup',stop);header.addEventListener('pointercancel',stop);header.addEventListener('lostpointercapture',stop);
    header.addEventListener('keydown',function(event){if(event.target!==header||!/^Arrow(Left|Right|Up|Down)$/.test(event.key))return;var rect=dialog.getBoundingClientRect(),step=event.shiftKey?1:10;view.moved=true;moveWindow(rect.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),rect.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));event.preventDefault();event.stopPropagation();});
  }
  async function open(ym,week,pending,anchorElement){
    var previous=dialog&&dialog.getBoundingClientRect(),anchor=anchorElement?anchorElement.getBoundingClientRect():view&&view.anchor;
    close();view={month:ym,week:week,pending:!!pending,anchor:anchor,moved:!!previous&&!anchorElement};page=[];cursor=null;
    dialog=el('section','tg-inbox');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');dialog.setAttribute('aria-label','Заявки Telegram');dialog.style.left='0px';dialog.style.top='0px';
    var header=el('header','tg-inbox-head'),title=el('strong','','⠿ Заявки ТГ · '+(pending?'Нераспределённые':week+' нед. · '+ym));header.appendChild(title);draggable(header);
    var exit=el('button','tg-inbox-close','×');exit.type='button';exit.setAttribute('aria-label','Закрыть заявки Telegram');exit.onclick=close;header.appendChild(exit);dialog.appendChild(header);
    var tools=el('div','tg-inbox-tools');[['По неделе',false],['Все нераспределённые',true]].forEach(function(pair){var button=el('button','',pair[0]);button.type='button';button.setAttribute('aria-pressed',String(pair[1]===!!pending));button.onclick=function(){open(ym,week,pair[1]);};tools.appendChild(button);});dialog.appendChild(tools);
    dialog.appendChild(el('p','tg-inbox-status','Загрузка…'));dialog.appendChild(el('div','tg-inbox-rows'));doc.body.appendChild(dialog);
    if(typeof dialog.showPopover==='function'){dialog.setAttribute('popover','manual');dialog.showPopover();}
    if(previous&&!anchorElement)moveWindow(previous.left,previous.top);else positionWindow();header.focus({preventScroll:true});await loadPage();
  }
  async function loadPage(){
    var target=dialog,selected=view;if(!target||busy)return;
    try{var result=await request('snapshot',{month:selected.month,week:selected.week,pending:selected.pending,before:cursor});if(target!==dialog)return;
      if(selected.month===month()){data=Object.assign({},data||{},result);paint();}
      var seen=new Set(page.map(function(row){return row.id;}));result.rows.forEach(function(row){if(!seen.has(row.id))page.push(row);});
      var last=result.rows[result.rows.length-1];cursor=last?{at:last.received_at,id:last.id}:null;renderRows(result.hasMore);notice(data&&data.config&&!data.config.ready?'Приём ещё не подключён. Откройте шестерёнку CRM.':'Оригиналы сохранены в ящике. Наведите на значок для подробностей.');positionWindow();
    }catch(error){if(target===dialog)notice(message(error));}
  }
  function renderRows(more){
    var holder=dialog.querySelector('.tg-inbox-rows');holder.replaceChildren();if(!page.length)holder.appendChild(el('p','','Пока нет заявок.'));
    page.forEach(function(row){var card=el('article','tg-inbox-card'),f=row.fields||{},name=el('strong','tg-inbox-name',f.title||f.name||'Заявка Telegram');name.title=[f.name,f.niche,f.city,f.phone,f.telegram].filter(Boolean).join(' · ');card.appendChild(name);var city=el('span','tg-inbox-city',f.city||'');city.title=f.city||'';card.appendChild(city);
      var links=el('div','tg-inbox-links');function link(label,url,title){var a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.title=title;a.setAttribute('aria-label',title);links.appendChild(a);}
      if(/^@[a-z][a-z0-9_]{4,31}$/i.test(f.telegram||''))link('@','https://t.me/'+f.telegram.slice(1),'Telegram: '+f.telegram);
      if(/^\+?\d{10,15}$/.test(f.phone||''))link('☎','tel:'+f.phone,'Позвонить: '+f.phone);
      link('↗','https://t.me/c/2150164780/'+Number(row.message_id),'Исходная заявка · '+row.source_date);
      if(row.folder_confirmed&&/^[A-Za-z0-9_-]+$/.test(row.folder_id||''))link('📁','https://drive.google.com/drive/folders/'+row.folder_id,'Открыть папку Drive');else{var folder=el('span','tg-inbox-folder-pending','📁');folder.title='Папка Drive ожидает подключения/создания';links.appendChild(folder);}
      var copies=(row.copies||[]).map(function(c){return (c.profile==='sasha'?'Саша':'Фил')+' · '+c.month.slice(0,7)+' · '+c.week+' нед.';});if(copies.length){var copied=el('span','tg-inbox-copies','✓');copied.title=copies.join(' | ');copied.setAttribute('aria-label','Добавлено: '+copies.join(' | '));links.appendChild(copied);}card.appendChild(links);
      var actions=el('div','tg-inbox-actions'),who=el('select'),week=el('select');who.setAttribute('aria-label','Исполнитель');week.setAttribute('aria-label','Неделя');
      (data&&data.canManage?['fil','sasha']:['sasha']).forEach(function(p){if(p==='sasha'&&data.config&&data.config.allow_sasha===false&&profile()!=='sasha')return;var option=el('option','',p==='sasha'?'Саша':'Фил');option.value=p;who.appendChild(option);});who.value=profile();
      for(var i=1;i<=4;i++){var option=el('option','',i+' нед.');option.value=String(i);week.appendChild(option);}week.value=String(view.month===month()?view.week:currentWeek());
      var add=el('button','tg-inbox-primary','→'),pin=el('button','','📌');add.setAttribute('aria-label','В неделю');add.title='Добавить выбранному исполнителю в неделю';pin.setAttribute('aria-label','В закреп');pin.title='Закрепить клиента в левом меню';[add,pin].forEach(function(n){n.type='button';});[who,week,add,pin].forEach(function(n){n.disabled=!writable()||busy;actions.appendChild(n);});
      add.onclick=function(){act(row.id,who.value,Number(week.value),false);};pin.onclick=function(){if(who.value!==profile()){notice('Для закрепления выберите текущий режим. Для передачи другому исполнителю нажмите «В неделю».');return;}act(row.id,who.value,Number(week.value),true);};card.appendChild(actions);holder.appendChild(card);
    });if(more){var next=el('button','','Ещё заявки');next.onclick=loadPage;holder.appendChild(next);}
  }
  async function act(id,target,week,pin){
    if(busy||!writable())return;busy=true;var expected=scope(),gen=generation;
    if(dialog)dialog.querySelectorAll('.tg-inbox-rows button,.tg-inbox-rows select').forEach(function(n){n.disabled=true;});paint();
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
  doc.addEventListener('click',function(event){if(event.target.closest('.tg-lead-responsible')){event.stopPropagation();return;}var button=event.target.closest('.tg-leads-week');if(button){event.preventDefault();event.stopPropagation();open(button.dataset.tgMonth,Number(button.dataset.tgWeek),false,button);}},true);
  doc.addEventListener('keydown',function(event){if(event.key==='Escape'&&dialog&&!event.defaultPrevented&&!doc.querySelector('dialog[open]')){close();event.preventDefault();}});
  win.addEventListener('resize',positionWindow);if(win.visualViewport)win.visualViewport.addEventListener('resize',positionWindow);
  doc.addEventListener('change',function(event){var select=event.target.closest('.tg-lead-responsible');if(select){event.stopPropagation();act(select.dataset.tgLead,select.value,Number(select.dataset.tgTargetWeek),false);}});
  function start(){
    var style=el('style');style.textContent=[
      '.tg-inbox{position:fixed;inset:auto;margin:0;width:min(820px,calc(100vw - 16px));max-height:min(380px,calc(100dvh - 16px));box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:8px;background:var(--surface,#111b26);color:var(--text,#e8f3ff);border:1px solid #356078;border-radius:10px;box-shadow:0 8px 28px #0005;z-index:19010;font:12px/1.35 Arial,sans-serif}',
      '.tg-inbox[popover]:not(:popover-open){display:none}.tg-inbox::backdrop{background:transparent;pointer-events:none}',
      '.tg-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px;margin:0 0 4px;cursor:move;touch-action:none;user-select:none}.tg-inbox-head strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tg-inbox-head:focus-visible{outline:1px solid #64dcea;outline-offset:2px;border-radius:4px}',
      '.tg-inbox button,.tg-inbox select{box-sizing:border-box;min-height:26px;height:26px;background:#173044;color:inherit;border:1px solid #386079;border-radius:5px;padding:3px 6px;font:11px/1.2 Arial,sans-serif;white-space:nowrap;cursor:pointer}.tg-inbox button:disabled,.tg-inbox select:disabled{opacity:.5;cursor:default}.tg-inbox .tg-inbox-close{width:26px;padding:0;font-size:17px}',
      '.tg-inbox-tools{display:flex;gap:5px;margin-bottom:2px}.tg-inbox-tools button[aria-pressed=true]{border-color:#64dcea;background:#1d485b}.tg-inbox-status{flex:none;font-size:10px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0 6px}.tg-inbox-rows{overflow:auto;min-height:0;overscroll-behavior:contain}',
      '.tg-inbox-card{display:grid;grid-template-columns:minmax(140px,1fr) minmax(65px,100px) auto auto;align-items:center;gap:8px;min-width:620px;min-height:35px;box-sizing:border-box;padding:4px 6px;border:1px solid #37526588;border-radius:5px;margin:0 0 4px}.tg-inbox-card:last-child{margin-bottom:0}.tg-inbox-name,.tg-inbox-city{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tg-inbox-name{font-size:12px;font-weight:650}.tg-inbox-city{font-size:10px;opacity:.65}',
      '.tg-inbox-links,.tg-inbox-actions{display:flex;align-items:center;flex-wrap:nowrap;gap:4px}.tg-inbox-links{min-width:76px;justify-content:flex-end}.tg-inbox-links a,.tg-inbox-links>span{display:inline-flex;align-items:center;justify-content:center;width:21px;height:24px;text-decoration:none;color:#69cbef;font-size:12px}.tg-inbox-folder-pending{opacity:.35}.tg-inbox-links .tg-inbox-copies{color:#41d4a2}.tg-inbox-actions select{width:65px}.tg-inbox-actions button{width:27px;padding:0;font-size:14px}.tg-inbox-actions .tg-inbox-primary{background:#12726b;border-color:#36a69f}',
      '.tg-leads-week{position:relative;margin-right:5px;white-space:nowrap}.tg-leads-week[hidden]{display:none!important}.tg-leads-badge{position:absolute;right:-5px;top:-7px;min-width:16px;height:16px;padding:0 3px;border-radius:9px;background:#64dcea;color:#071a22;font:bold 10px/16px Arial;text-align:center;box-sizing:border-box}.tg-leads-badge[hidden]{display:none}',
      '.tg-lead-responsible{max-width:65px;font-size:10px;border:1px solid #436077;border-radius:5px;background:transparent;color:inherit}.tg-lead-settings{border-top:1px solid #53708455;padding-top:8px;margin-top:12px}.tg-lead-config-status{font-size:12px}',
      'body.day-mode .tg-inbox button,body.day-mode .tg-inbox select{background:#e8f1f7;color:#173248;border-color:#b3c7d6}body.day-mode .tg-inbox a{color:#087499}body.day-mode .tg-inbox .tg-inbox-primary{background:#12726b;color:#fff}body.day-mode .tg-inbox-tools button[aria-pressed=true]{background:#ccecf2}body.day-mode .tg-inbox-card{border-color:#b3c7d6}',
      '@media(max-width:560px){.tg-inbox{padding:6px}.tg-inbox-card{min-height:38px}.tg-inbox-actions button,.tg-inbox-actions select{height:28px;min-height:28px}}'
    ].join('\n');doc.head.appendChild(style);
    var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;if(scope()!==owner)reset();paint();syncSettings();});}).observe(doc.body,{childList:true,subtree:true});
    refresh();setInterval(function(){refresh();syncSettings();},20000);
  }
  ['avitolog:workspace-reset','avitolog:backend-initial-ready'].forEach(function(name){doc.addEventListener(name,function(){reset();refresh();});});win.addEventListener('focus',refresh);if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();
})();
