(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClientFolderBoard=api.install(root);})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var FOLDER_MIME='application/vnd.google-apps.folder';
  function str(v){return String(v==null?'':v);}
  function esc(v){return str(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function folderId(value){var v=str(value).trim(),m=v.match(/^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/)([\w-]+)/);return m?m[1]:(/^[\w-]{10,200}$/.test(v)?v:'');}
  function stamp(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>946684800000&&value<Date.now()+86400000?value:0;
    var v=str(value).trim(),m=v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if(m)v=m[3]+'-'+m[2]+'-'+m[1];
    if(!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v))return 0;
    var n=Date.parse(v);return Number.isFinite(n)&&n<=Date.now()+86400000?n:0;
  }
  function created(row){return stamp(row.createdTime)||stamp(row.createdAt)||stamp(row.created_at)||stamp(row.addedAt)||(/^p\d{13}$/.test(str(row.id))?stamp(Number(row.id.slice(1))):0);}
  function cleanSettings(value){
    var v=value&&typeof value==='object'?value:{};
    return {enabled:v.enabled!==false,showEmpty:v.showEmpty===true,rootFolderId:folderId(v.rootFolderId),directions:(Array.isArray(v.directions)?v.directions:[]).slice(0,100).filter(function(d){return d&&/^[\w-]{1,220}$/.test(str(d.id))&&str(d.name).trim()&&str(d.name).length<=100;}).map(function(d){return {id:str(d.id),name:str(d.name).trim(),folderId:folderId(d.folderId)};})};
  }
  function buildBoard(context,cache,settings){
    context=context||{};cache=cache||{};settings=cleanSettings(settings);
    var rows=new Map(),cols=new Map(),folderCols=new Map(),root=folderId(settings.rootFolderId||context.rootFolderId||cache.rootFolderId);
    function column(id,name,fid){var c={id:id,name:str(name)||'Направление',folderId:folderId(fid),projects:[]};cols.set(id,c);if(c.folderId)folderCols.set(c.folderId,id);return c;}
    (context.categories||[]).forEach(function(c){if(folderId(c.v))column('drive_'+c.v,c.n,c.v);});
    function add(row,kind){
      if(!row)return;
      var crm=row.crmData||{},fid=folderId(row.folderId||row.folderLink||crm.folderId||crm.folderLink),id=fid?'folder_'+fid:kind+'_'+str(row.client_id||row.id);
      if(!fid&&!row.client_id&&!row.id)return;
      var old=rows.get(id),next=Object.assign({},old||{},row,{projectId:id,folderId:fid,folderLink:fid?'https://drive.google.com/drive/folders/'+fid:'',company:str(row.company||row.title||row.contact_name||crm.company||row.name||old&&old.company||'Без названия'),categoryFolderId:folderId(row.categoryFolderId||crm.categoryFolderId||old&&old.categoryFolderId),addedAtMs:created(row)||old&&old.addedAtMs||0});
      if(kind==='project')next.projectRecordId=row.id;
      rows.set(id,next);
    }
    (context.clients||[]).forEach(function(row){add(row,'client');});
    (context.projects||[]).forEach(function(row){
      var clientId=row.crmClientId||row.crmClientRecordId||row.crmData&&row.crmData.client_id;
      var linked=clientId&&(context.clients||[]).find(function(client){return client.client_id===clientId;});
      add(linked?Object.assign({},linked,row,{folderId:row.folderId||row.crmData&&row.crmData.folderId||linked.folderId}):row,'project');
    });
    var folders=(cache.folders||[]).filter(function(f){return f&&folderId(f.id);});
    folders.filter(function(f){return (f.parents||[]).indexOf(root)>=0&&!rows.has('folder_'+f.id);}).forEach(function(f){column('drive_'+f.id,f.name,f.id);});
    settings.directions.forEach(function(d){var original=cols.get(d.id);if(original&&original.folderId)folderCols.delete(original.folderId);column(d.id,d.name,d.folderId);});
    folders.forEach(function(f){
      if(folderCols.has(f.id))return;
      var parent=(f.parents||[]).find(function(id){return folderCols.has(id);});
      if(!parent&&!rows.has('folder_'+f.id)&&!(f.parents||[]).includes(root))return;
      add(Object.assign({},rows.get('folder_'+f.id)||{},{folderId:f.id,company:rows.has('folder_'+f.id)?rows.get('folder_'+f.id).company:f.name,createdTime:f.createdTime,categoryFolderId:parent||''}),'drive');
    });
    var other=column('unbound','Без направления','');
    rows.forEach(function(row){var id=folderCols.get(row.categoryFolderId);(cols.get(id)||other).projects.push(row);});
    cols.forEach(function(c){c.projects.sort(function(a,b){return b.addedAtMs-a.addedAtMs||a.company.localeCompare(b.company,'ru')||a.projectId.localeCompare(b.projectId);});});
    return {columns:Array.from(cols.values()).filter(function(c){return c.projects.length||(settings.showEmpty&&c.id!=='unbound');}),projects:Array.from(rows.values())};
  }
  async function listDriveFolders(fetcher,token,parent,signal){
    if(!folderId(parent)&&parent!=='root')throw Error('Укажите ссылку на папку Drive.');
    var out=[],page='',seen=new Set();
    do{
      if(seen.has(page))throw Error('Drive повторил страницу. Старый список сохранён.');seen.add(page);
      var q="'"+parent+"' in parents and mimeType='"+FOLDER_MIME+"' and trashed=false";
      var params=new URLSearchParams({q:q,fields:'nextPageToken,files(id,name,createdTime,parents)',pageSize:'1000',orderBy:'createdTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(page)params.set('pageToken',page);
      var response=await fetcher('https://www.googleapis.com/drive/v3/files?'+params.toString(),{headers:{Authorization:'Bearer '+token},signal:signal});
      if(!response.ok){var error=Error(response.status===401?'Сессия Drive истекла. Подключите Drive заново.':response.status===403?'Нет доступа к папке Drive. Проверьте привязку и Google-аккаунт.':'Drive временно недоступен ('+response.status+'). Старые данные сохранены.');error.status=response.status;throw error;}
      var data=await response.json();if(!Array.isArray(data.files))throw Error('Drive вернул неполный список. Старые данные сохранены.');
      out.push.apply(out,data.files);page=data.nextPageToken||'';
    }while(page);
    return out;
  }
  function install(win){
    var doc=win.document,states=new Map(),dbPromise=null,dialog=null,paintTimer=null;
    function context(){return typeof win.clientFolderBoardContext==='function'?win.clientFolderBoardContext():null;}
    function database(){
      if(!dbPromise)dbPromise=new Promise(function(resolve,reject){if(!win.indexedDB)return reject(Error('Нет хранилища браузера.'));var request=win.indexedDB.open('avitolog-client-folders-v1',1);request.onupgradeneeded=function(){request.result.createObjectStore('records');};request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};}).catch(function(e){dbPromise=null;throw e;});
      return dbPromise;
    }
    async function read(key){
      var record=null,fallback=null;try{var db=await database();record=await new Promise(function(resolve,reject){var request=db.transaction('records').objectStore('records').get(key);request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};});}catch(e){}
      try{fallback=JSON.parse(win.localStorage.getItem('client-folders|'+key)||'null');}catch(e){}
      if(fallback&&(!record||fallback.savedAt>record.savedAt))record=fallback;
      return record&&record.value;
    }
    async function write(key,value){
      var record={savedAt:Date.now(),value:value};
      try{var db=await database();await new Promise(function(resolve,reject){var tx=db.transaction('records','readwrite');tx.objectStore('records').put(record,key);tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};tx.onabort=function(){reject(tx.error||Error('Запись отменена.'));};});try{win.localStorage.removeItem('client-folders|'+key);}catch(ignore){}}
      catch(e){try{win.localStorage.setItem('client-folders|'+key,JSON.stringify(record));}catch(ignore){throw Error('Настройки не сохранены: хранилище браузера недоступно.');}}
    }
    function state(c){
      var s=states.get(c.scope);if(s)return s;
      s={settings:cleanSettings(),cache:{folders:[]},ready:false,busy:false,message:'',projects:[],lastAttempt:0};states.set(c.scope,s);
      s.loaded=Promise.all([read('settings|'+c.scope),read('cache|'+c.scope)]).then(function(values){s.settings=cleanSettings(values[0]);if(values[1]&&Array.isArray(values[1].folders))s.cache=values[1];s.ready=true;schedulePaint();});return s;
    }
    function isCurrent(scope){var c=context();return c&&c.scope===scope;}
    function schedulePaint(){clearTimeout(paintTimer);paintTimer=setTimeout(function(){var c=context();if(c&&c.canRender&&doc.getElementById('clientFolderBoard')&&!c.selected){if(!renderHome(c.tab)&&typeof win.refreshClientContents==='function')win.refreshClientContents(true);}},60);}
    function status(s){return s.message||(s.busy?'Обновляем папки, прежние данные остаются на экране…':s.cache.updatedAt?'Папки обновлены '+new Date(s.cache.updatedAt).toLocaleString('ru-RU'):'Проекты из CRM. Подключите Drive для загрузки папок и точных дат создания.');}
    function model(c,s){var result=buildBoard(c,s.cache,s.settings);s.projects=result.projects;return result;}
    function gear(){return '<button type="button" class="cfb-gear" data-cfb-settings title="Настройки вида клиента" aria-label="Настройки вида клиента">⚙</button>';}
    function renderHome(tab){
      var c=context();if(!c||!c.canRender||c.selected||c.tab!==tab)return false;
      var s=state(c);if(!s.settings.enabled)return false;
      var host=doc.getElementById('mainContent');if(!host)return false;
      var old=host.querySelector('.cfb-columns'),left=old?old.scrollLeft:0,tops={};if(old)old.querySelectorAll('[data-cfb-column]').forEach(function(col){tops[col.dataset.cfbColumn]=col.querySelector('.cfb-rows').scrollTop;});
      var board=model(c,s);
      host.innerHTML='<section id="clientFolderBoard" class="cfb"><header class="cfb-top"><div><h2>Клиенты по направлениям <span>'+board.projects.length+'</span></h2><p>Папки слева направо · новые проекты сверху</p></div><div class="cfb-tools"><input type="search" data-cfb-search aria-label="Поиск клиента" placeholder="Найти клиента…"><button type="button" data-cfb-refresh'+(s.busy||!s.ready?' disabled':'')+'>↻ Drive</button>'+gear()+'</div></header><div class="cfb-status" role="status">'+esc(status(s))+'</div><div class="cfb-columns" tabindex="0" aria-label="Направления клиентов">'+board.columns.map(function(col){return '<section class="cfb-column" data-cfb-column="'+esc(col.id)+'"><header class="cfb-column-head"><button type="button" data-cfb-direction="'+esc(col.id)+'" title="Изменить название и привязку папки"><span>📁</span><strong>'+esc(col.name)+'</strong><small>'+col.projects.length+'</small></button>'+(col.folderId?'<a href="https://drive.google.com/drive/folders/'+esc(col.folderId)+'" target="_blank" rel="noopener noreferrer" title="Открыть направление в Drive" aria-label="Открыть направление '+esc(col.name)+' в Drive">↗</a>':'')+'</header><div class="cfb-rows">'+col.projects.map(function(row){return '<article class="cfb-project" data-cfb-name="'+esc(row.company.toLowerCase())+'"><button type="button" data-cfb-project="'+esc(row.projectId)+'"><span class="cfb-avatar">'+esc(row.emoji||'📂')+'</span><span class="cfb-project-text"><strong>'+esc(row.company)+'</strong><small>'+(row.addedAtMs?new Date(row.addedAtMs).toLocaleDateString('ru-RU'):row.folderId?'Папка проекта':'Без папки Drive')+'</small></span></button>'+(row.folderId?'<a href="'+esc(row.folderLink)+'" target="_blank" rel="noopener noreferrer" title="Папка проекта в Drive" aria-label="Папка '+esc(row.company)+' в Drive">↗</a>':'')+'</article>';}).join('')+(col.projects.length?'':'<p class="cfb-empty">Пока нет проектов</p>')+'</div></section>';}).join('')+(board.columns.length?'':'<p class="cfb-empty">Папки появятся после подключения Drive. Уже добавленные клиенты отображаются без изменения данных.</p>')+'</div></section>';
      var columns=host.querySelector('.cfb-columns');columns.scrollLeft=left;columns.querySelectorAll('[data-cfb-column]').forEach(function(col){col.querySelector('.cfb-rows').scrollTop=tops[col.dataset.cfbColumn]||0;});
      host.querySelector('[data-cfb-settings]').onclick=openSettings;
      host.querySelector('[data-cfb-refresh]').disabled=s.busy||!s.ready||!c.canDrive;
      host.querySelector('[data-cfb-refresh]').onclick=function(){refresh(true);};
      host.querySelector('[data-cfb-search]').value=s.search||'';
      function filter(value){s.search=value;host.querySelectorAll('.cfb-project').forEach(function(row){row.hidden=!row.dataset.cfbName.includes(value.trim().toLowerCase());});}
      host.querySelector('[data-cfb-search]').oninput=function(e){filter(e.target.value);};filter(s.search||'');
      host.querySelectorAll('[data-cfb-project]').forEach(function(button){button.onclick=function(){var row=s.projects.find(function(p){return p.projectId===button.dataset.cfbProject;});if(row&&isCurrent(c.scope))win.openClientFolderBoardProject(row);};});
      host.querySelectorAll('[data-cfb-direction]').forEach(function(button){button.onclick=function(){var col=board.columns.find(function(col){return col.id===button.dataset.cfbDirection;});if(col&&col.id!=='unbound')openDirection(col);else openSettings();};});
      if(s.ready&&!s.busy&&Date.now()-s.lastAttempt>300000&&c.driveAvailable)refresh(false);
      return true;
    }
    async function refresh(manual){
      var c=context();if(!c||!c.canDrive)return;var s=state(c);await s.loaded;if(s.busy||!isCurrent(c.scope))return;
      s.busy=true;s.message='';s.lastAttempt=Date.now();schedulePaint();
      var controller=new win.AbortController(),timeout=setTimeout(function(){controller.abort();},45000);
      try{
        var token=await win.getDriveToken();if(!isCurrent(c.scope))return;
        var verified=typeof win.__avitologVerifiedDriveIdentity==='function'?win.__avitologVerifiedDriveIdentity():null;
        if(win.AVITOLOG_BACKEND_MODE&&(!verified||verified.id!==c.actorId))throw Error('Подключите свой Google Drive.');
        var root=folderId(s.settings.rootFolderId||c.rootFolderId||s.cache.rootFolderId),initial=[];
        if(!root){
          var top=await listDriveFolders(win.fetch.bind(win),token,'root',controller.signal),app=top.find(function(f){return f.name==='AVITOLOG';});
          if(app){var inside=await listDriveFolders(win.fetch.bind(win),token,app.id,controller.signal),clients=inside.find(function(f){return f.name==='Клиенты'||f.name==='CRM';});root=clients&&clients.id;}
          if(!root)throw Error('Укажите вашу папку CRM в настройках вида. Папки автоматически не создаются.');
        }
        initial=await listDriveFolders(win.fetch.bind(win),token,root,controller.signal);
        var known=new Set(model(c,s).projects.map(function(p){return p.folderId;}).filter(Boolean)),directions=initial.filter(function(f){return !known.has(f.id);}).map(function(f){return f.id;});
        s.settings.directions.forEach(function(d){if(d.folderId)directions.push(d.folderId);});directions=Array.from(new Set(directions));
        var all=initial.slice(),cursor=0;
        async function worker(){while(cursor<directions.length){var id=directions[cursor++],children=await listDriveFolders(win.fetch.bind(win),token,id,controller.signal);all.push.apply(all,children);}}
        await Promise.all([worker(),worker(),worker()]);
        if(!isCurrent(c.scope))return;
        var cache={rootFolderId:root,folders:Array.from(new Map(all.map(function(f){return [f.id,f];})).values()),updatedAt:Date.now()};
        await write('cache|'+c.scope,cache);if(!isCurrent(c.scope))return;s.cache=cache;s.message='';
      }catch(e){if(isCurrent(c.scope)){s.message=e.name==='AbortError'?'Drive отвечает долго. Предыдущий список сохранён; повторите обновление.':e.message;if(e.status===401&&typeof win.invalidateDriveToken==='function')win.invalidateDriveToken();}}
      finally{clearTimeout(timeout);s.busy=false;if(isCurrent(c.scope))schedulePaint();}
    }
    function closeDialog(){if(dialog){var focus=dialog.focus;dialog.node.remove();dialog=null;if(focus&&focus.isConnected)focus.focus();}}
    function modal(title,body){
      closeDialog();var c=context();if(!c)return null;var node=doc.createElement('div');node.className='cfb-overlay';node.innerHTML='<section class="cfb-dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header><h3>'+esc(title)+'</h3><button type="button" data-close aria-label="Закрыть настройки">×</button></header>'+body+'<p data-status role="status"></p></section>';dialog={node:node,focus:doc.activeElement,scope:c.scope};doc.body.appendChild(node);node.querySelector('[data-close]').onclick=closeDialog;
      node.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDialog();}if(e.key==='Tab'){var els=Array.from(node.querySelectorAll('button,input,a')).filter(function(el){return !el.disabled;});if(e.shiftKey&&doc.activeElement===els[0]){e.preventDefault();els[els.length-1].focus();}else if(!e.shiftKey&&doc.activeElement===els[els.length-1]){e.preventDefault();els[0].focus();}}});node.querySelector('[data-close]').focus();return node;
    }
    async function saveSettings(c,next,node){
      if(!isCurrent(c.scope))throw Error('Режим изменился. Откройте настройки заново.');
      var s=state(c);await s.loaded;await write('settings|'+c.scope,cleanSettings(next));
      if(!isCurrent(c.scope))return false;s.settings=cleanSettings(next);s.lastAttempt=0;
      if(node&&node.isConnected)node.querySelector('[data-status]').textContent='Сохранено в этом браузере для текущего режима.';
      if(typeof win.refreshClientContents==='function')win.refreshClientContents(true);return true;
    }
    async function openSettings(){
      var c=context();if(!c)return;var s=state(c);await s.loaded;if(!isCurrent(c.scope))return;
      var node=modal('Вид клиентов','<form><label class="cfb-check"><input type="checkbox" name="enabled"'+(s.settings.enabled?' checked':'')+'>Направления столбцами (новый вид)</label><label class="cfb-check"><input type="checkbox" name="showEmpty"'+(s.settings.showEmpty?' checked':'')+'>Показывать пустые направления</label><label>Папка CRM в Google Drive<input name="root" placeholder="https://drive.google.com/drive/folders/…" value="'+esc(s.settings.rootFolderId||c.rootFolderId||s.cache.rootFolderId)+'"></label><p>Новые папки сверху — по дате создания Drive. Названия и привязки направлений меняются нажатием на их шапки. Эти настройки сохраняются в этом браузере отдельно для каждого режима; сами папки и данные CRM не перемещаются.</p><div class="cfb-dialog-actions"><button type="submit">Сохранить</button><button type="button" data-add>+ Направление</button></div></form>');if(!node)return;
      node.querySelector('[data-add]').onclick=function(){openDirection({id:'custom_'+win.crypto.randomUUID(),name:'',folderId:''});};
      node.querySelector('form').onsubmit=async function(e){e.preventDefault();var f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;try{if(f.elements.root.value.trim()&&!folderId(f.elements.root.value))throw Error('Вставьте ссылку на папку Google Drive или её ID.');await saveSettings(c,Object.assign({},s.settings,{enabled:f.elements.enabled.checked,showEmpty:f.elements.showEmpty.checked,rootFolderId:folderId(f.elements.root.value)}),node);}catch(error){node.querySelector('[data-status]').textContent=error.message;}finally{b.disabled=false;}};
    }
    async function openDirection(col){
      var c=context();if(!c)return;var s=state(c);await s.loaded;if(!isCurrent(c.scope))return;
      var node=modal('Направление клиентов','<form><label>Название направления<input name="title" required maxlength="100" value="'+esc(col.name)+'" placeholder="Например, Мебель"></label><label>Папка Drive<input name="folder" value="'+esc(col.folderId)+'" placeholder="Ссылка или ID папки направления"></label><p>Это название и привязка в каталоге. Исходные папки, клиенты, оплаты и календарь не изменяются. Для более точной группировки можно привязать отдельную вложенную папку.</p><div class="cfb-dialog-actions"><button type="submit">Сохранить</button><button type="button" data-cancel>Отмена</button></div></form>');if(!node)return;
      node.querySelector('[data-cancel]').onclick=closeDialog;
      node.querySelector('form').onsubmit=async function(e){e.preventDefault();var f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;try{var fid=folderId(f.elements.folder.value);if(!fid)throw Error('Укажите папку Drive для этого направления.');if(!f.elements.title.value.trim())throw Error('Введите название направления.');var next=cleanSettings(s.settings),other=next.directions.find(function(d){return d.id!==col.id&&d.folderId===fid;});if(other)throw Error('Эта папка уже привязана к направлению «'+other.name+'».');next.directions=next.directions.filter(function(d){return d.id!==col.id;});next.directions.push({id:col.id,name:f.elements.title.value.trim(),folderId:fid});if(await saveSettings(c,next,node)){closeDialog();refresh(true);}}catch(error){node.querySelector('[data-status]').textContent=error.message;}finally{b.disabled=false;}};
    }
    function mountSettings(){
      var head=doc.querySelector('.client-contents-head');if(!head||head.querySelector('[data-cfb-settings]'))return;
      var c=context();if(c&&c.selected){var back=doc.createElement('button');back.type='button';back.className='cfb-gear';back.textContent='← Направления';back.onclick=function(){win.showClientContentsBack();};head.appendChild(back);}
      var button=doc.createElement('button');button.type='button';button.className='cfb-gear';button.dataset.cfbSettings='';button.textContent='⚙';button.title='Настройки вида клиента';button.setAttribute('aria-label',button.title);button.onclick=openSettings;head.appendChild(button);
    }
    function getProject(id){var c=context();if(!c)return null;return model(c,state(c)).projects.find(function(row){return row.projectId===id;})||null;}
    ['avitolog:backend-initial-ready','avitolog:backend-remote-applied','avitolog:workspace-reset'].forEach(function(event){doc.addEventListener(event,function(){var c=context();if(dialog&&(!c||dialog.scope!==c.scope))closeDialog();schedulePaint();});});
    function start(){var c=context();if(c&&c.canRender&&typeof win.refreshClientContents==='function')win.refreshClientContents(false);}
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else setTimeout(start,0);
    return {renderHome:renderHome,mountSettings:mountSettings,getProject:getProject,openSettings:openSettings};
  }
  return {folderId:folderId,stamp:stamp,created:created,cleanSettings:cleanSettings,buildBoard:buildBoard,listDriveFolders:listDriveFolders,install:install};
});
