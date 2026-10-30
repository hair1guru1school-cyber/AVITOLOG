(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) root.ClientGenerators = api.install(root);
}(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  var TYPES = [
    { id: 'scripts', title: 'Скрипт', emoji: '🌀' },
    { id: 'analysis', title: 'Аналитика', emoji: '📊' },
    { id: 'presale', title: 'Нужно сейчас', emoji: '⏰' },
    { id: 'avito1', title: 'Авито №1', emoji: '🏆' }
  ];
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function message(error) { return String(error && error.message || error || 'Неизвестная ошибка'); }
  function plan(snapshot, selected, comments, build) {
    if (!snapshot || !/^[a-zA-Z0-9_-]+$/.test(snapshot.folderId || '')) throw Error('Выберите привязанную папку клиента в левом меню.');
    var captured = copy(snapshot);
    var jobs = TYPES.filter(function (type) { return selected.indexOf(type.id) >= 0; }).map(function (type) {
      var comment = String(comments[type.id] || '').slice(0, 6000);
      return { type: type.id, title: type.title, emoji: type.emoji, comment: comment, prompt: build(type.id, copy(captured.data), comment), state: 'waiting', html: '', file: null, error: '' };
    });
    if (!jobs.length) throw Error('Выберите хотя бы один документ.');
    return { snapshot: captured, jobs: jobs, running: false, cancelled: false };
  }
  function createRunner(env) {
    var active = null;
    function notify(batch) { if (env.onChange) env.onChange(batch); }
    function guard(batch) { if (batch.cancelled || !env.isCurrent(batch.snapshot)) throw Error('Пользователь или режим изменился. Оставшиеся документы не отправлены.'); }
    async function run(batch) {
      if (active) throw Error('Предыдущая очередь ещё выполняется.');
      active = batch; batch.running = true; notify(batch);
      try {
        guard(batch);
        await env.prepare(batch.snapshot); guard(batch);
        for (var i = 0; i < batch.jobs.length; i++) {
          var job = batch.jobs[i];
          try {
            guard(batch); job.state = 'generating'; notify(batch);
            var raw = await env.generate(job.prompt, job.type);
            guard(batch); job.html = env.parse(raw);
            job.state = 'saving'; notify(batch);
            job.file = await env.save(batch.snapshot, job, function () { guard(batch); });
            guard(batch);
            if (!job.file || !job.file.id) throw Error('Google Drive не подтвердил сохранение. Проверьте папку перед повторным запуском.');
            job.state = 'saved';
          } catch (error) {
            job.error = message(error); job.state = job.html ? 'save_failed' : 'failed';
            if (!env.isCurrent(batch.snapshot) || batch.cancelled) { batch.cancelled = true; break; }
          }
          notify(batch);
        }
      } catch (error) {
        batch.error = message(error);
      } finally {
        batch.jobs.forEach(function (job) { if (job.state === 'waiting') { job.state = 'not_started'; job.error = batch.error || 'Очередь остановлена.'; } });
        batch.running = false; active = null; notify(batch);
      }
      return batch;
    }
    return { run: run, active: function () { return active; }, cancel: function () { if (active) { active.cancelled = true; notify(active); } } };
  }
  function parseResult(raw, sanitize) {
    if (typeof raw !== 'string' || raw.length > 500000) throw Error('Некорректный ответ генератора.');
    var text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var value = JSON.parse(text);
    if (!value || typeof value.html !== 'string' || !value.html.trim()) throw Error('Генератор не вернул документ.');
    var html = sanitize(value.html);
    if (!html.trim()) throw Error('В документе нет допустимого содержимого.');
    return html;
  }
  function suggestions(data) {
    return [['Ниша', data.category], ['География', data.city], ['Позиции', (data.positions || []).join(', ')], ['УТП / заметки', data.notes]].filter(function (row) { return !!row[1]; }).map(function (row) { return row[0] + ': ' + String(row[1]).slice(0, 1500); });
  }
  function contextData(input, saved) {
    var out = Object.assign({}, input);
    ['company','name','phone','tg','vk','category','city','notes','avito_account','client_type','kp'].forEach(function (field) {
      var alias = { name: 'contact_name', tg: 'telegram', kp: 'kp_count' }[field] || field;
      if (!String(out[field] || '').trim()) out[field] = String(saved[field] || saved[alias] || '');
    });
    if (!Array.isArray(out.positions) || !out.positions.length) out.positions = Array.isArray(saved.positions) ? saved.positions.slice() : saved.positions ? [String(saved.positions)] : [];
    return out;
  }
  function pdfName(snapshot,job) {
    var name=String(job.title||'Документ')+' - '+String(snapshot.title||'Проект');
    return (name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,160).replace(/[. ]+$/,'')||'Документ')+'.pdf';
  }
  async function validatePdf(blob) {
    if(!blob||typeof blob.slice!=='function'||blob.size<8||blob.size>25*1024*1024)throw Error('PDF пустой или превышает 25 МБ.');
    if(await blob.slice(0,5).text()!=='%PDF-')throw Error('Сервис вернул не PDF. Файл не скачан.');
    return blob;
  }
  function createPdfDelivery(env) {
    var cache=new WeakMap(),tail=Promise.resolve();
    function owner(batch){return JSON.stringify([batch.snapshot.scope,batch.snapshot.folderId,batch.snapshot.clientId]);}
    function guard(batch){if(!env.isCurrent(batch.snapshot))throw Error('Пользователь или режим изменился. Передача PDF остановлена.');}
    function peek(batch,job){var row=cache.get(job);return env.isCurrent(batch.snapshot)&&row&&row.owner===owner(batch)&&row.html===job.html?row.file||null:null;}
    function get(batch,job){
      try{guard(batch);}catch(error){return Promise.reject(error);}
      if(!job.html&&!job.file)return Promise.reject(Error('Документ ещё создаётся.'));
      var row=cache.get(job),id=owner(batch);
      if(row&&row.owner!==id)return Promise.reject(Error('Этот PDF принадлежит другому проекту.'));
      if(row&&row.html===job.html){if(row.file)return Promise.resolve(row.file);if(row.pending)return row.pending;}
      row={owner:id,html:job.html};cache.set(job,row);job.pdfState='preparing';job.pdfError='';
      row.pending=tail.then(async function(){
        guard(batch);var blob=await env.render(batch.snapshot,job);guard(batch);await validatePdf(blob);guard(batch);
        row.file=env.file(blob,pdfName(batch.snapshot,job));job.pdfState='ready';return row.file;
      }).catch(function(error){job.pdfState='failed';job.pdfError=message(error);if(cache.get(job)===row)cache.delete(job);throw error;}).finally(function(){row.pending=null;if(env.changed)env.changed();});
      tail=row.pending.catch(function(){});if(env.changed)env.changed();return row.pending;
    }
    function files(batch,jobs){if(!jobs.length)return null;var list=jobs.map(function(job){return peek(batch,job);});return list.every(Boolean)?list:null;}
    function requireFiles(batch,jobs){guard(batch);var list=files(batch,jobs);if(!list)throw Error('Дождитесь подготовки PDF.');return list;}
    function canShare(batch,jobs){try{var list=files(batch,jobs);return !!(list&&env.share&&env.canShare&&env.canShare({files:list}));}catch(_){return false;}}
    return {get:get,peek:peek,files:files,canShare:canShare,
      download:function(batch,jobs){var list=requireFiles(batch,jobs);list.forEach(function(file){guard(batch);env.download(file);});return list.length;},
      share:function(batch,jobs){var list=requireFiles(batch,jobs);if(!canShare(batch,jobs))throw Error('Браузер не поддерживает передачу этих PDF.');return env.share({files:list,title:batch.snapshot.title});}
    };
  }
  function install(win) {
    if (win.__clientGenerators) return win.__clientGenerators;
    var doc = win.document, library = win.__showScriptsPanel, originalSwitch = win.switchTab;
    var drafts = new Map(), batches = [], dialogs = new Map(), documents = new Map(), holder = null, panelKey = '', errorText = '', dismissed = null, statusDialog = null, statusBatch = null;
    var database,deliveryDialog=null,deliveryRequest=null;
    function prefs(id, value) {
      if (!database) database = new Promise(function(resolve,reject){if(!win.indexedDB)return reject(Error('IndexedDB недоступна'));var req=win.indexedDB.open('avitolog-client-generators',1);req.onupgradeneeded=function(){req.result.createObjectStore('preferences');};req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error);};});
      return database.then(function(db){return new Promise(function(resolve,reject){var tx=db.transaction('preferences',value===undefined?'readonly':'readwrite'),store=tx.objectStore('preferences'),req=value===undefined?store.get(id):store.put(copy(value),id);tx.oncomplete=function(){resolve(req.result);};tx.onerror=function(){reject(tx.error);};tx.onabort=function(){reject(tx.error||Error('Запись не завершена'));};});});
    }
    function el(tag, cls, text) { var node = doc.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; }
    function button(label, fn, cls) { var node = el('button', cls || '', label); node.type = 'button'; node.addEventListener('click', fn); return node; }
    function scope() {
      var identity = typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() || {} : {};
      var key = typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY('avitolog_projects') : '';
      return [identity.id || '', identity.email || '', key, win.AVITOLOG_USER || '', win.AVITOLOG_KEY_EMAIL || '', typeof win.getCurrentDriveEmail === 'function' ? win.getCurrentDriveEmail() : ''].join('|');
    }
    function captured() {
      if ((win.AVITOLOG_BACKEND_MODE || win.AVITOLOG_BACKEND_SERVER_ONLY) && win.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) throw Error('Дождитесь загрузки данных текущего пользователя.');
      var client = win._activeClient || (typeof win.getActiveClient === 'function' ? win.getActiveClient() : null);
      if (!client || !client.folderId) throw Error('Сначала захватите папку проекта в левом меню.');
      var read = function (id) { var node = doc.getElementById(id); return node ? String(node.value || '').trim() : ''; };
      var data = { company: read('company') || client.company || client.title || '', name: read('contact_name'), phone: read('phone'), tg: read('tg'), vk: read('vk'), category: read('category'), city: typeof win.getGeoValues === 'function' ? win.getGeoValues().join(', ') : read('city'), notes: read('notes'), avito_account: read('avito_account'), client_type: read('client_type'), kp: read('kp_count'), positions: typeof win.getPos === 'function' ? win.getPos() : [] };
      var linked = typeof win.crmLinkedClientForContact === 'function' ? win.crmLinkedClientForContact(client) || {} : {}, project = typeof win.getSelectedProject === 'function' ? win.getSelectedProject() : null;
      if (linked.folderId && String(linked.folderId) !== String(client.folderId)) linked = {};
      var projectFolder = project && (project.folderId || project.crmData && project.crmData.folderId);
      var projectData = projectFolder && String(projectFolder) === String(client.folderId) ? project.crmData || {} : {};
      data = contextData(contextData(contextData(data, linked), client), projectData);
      var headers = {};
      [['analysis', 'getAnalyticsHeaderImg'], ['presale', 'getPresaleHeaderImgForExport'], ['avito1', 'getAvito1HeaderImgForExport']].forEach(function (entry) {
        if (typeof win[entry[1]] !== 'function') return;
        try { var url = new win.URL(win[entry[1]](), win.location.href); if (url.protocol === 'https:' || /^data:image\/(png|jpeg|webp);base64,/i.test(url.href)) headers[entry[0]] = url.href; } catch (_) {}
      });
      return { scope: scope(), folderId: String(client.folderId), clientId: String(client.client_id || client.id || ''), title: data.company || 'Клиент', data: data, headers: headers };
    }
    function key(snapshot) { return snapshot.scope + '|' + snapshot.folderId + '|' + snapshot.clientId; }
    function draft(snapshot) { var id = key(snapshot); if (!drafts.has(id)) drafts.set(id, { selected: ['analysis'], comments: {}, common: '', depth: 'mid' }); return drafts.get(id); }
    function existingDocuments(snapshot, target) {
      var id=key(snapshot), saved=documents.get(id);
      function draw(files,error){if(snapshot.scope!==scope()||!target.isConnected)return;target.replaceChildren(el('strong','','Документы в папке проекта'),button('Обновить список',function(){load();},'cg-refresh'));
        (files||[]).forEach(function(file){if(!/^[a-zA-Z0-9_-]+$/.test(file.id||''))return;var a=el('a','',file.name);a.href='https://drive.google.com/file/d/'+encodeURIComponent(file.id)+'/view';a.target='_blank';a.rel='noopener';target.append(a);});
        if(error)target.append(el('small','cg-error',error));else if(!files||!files.length)target.append(el('small','', 'Подходящих документов в полученном списке пока нет.'));
      }
      async function load(){if(typeof win.driveListFolderItems!=='function')return;try{var files=await win.driveListFolderItems(snapshot.folderId);if(snapshot.scope!==scope())return;files=files.filter(function(f){return !f.isFolder&&/аналит|анализ|авито|avito|коммерчес|(?:^|\s)кп(?:\s|$)|скрипт|нужно сейчас/i.test(f.name||'');});documents.set(id,files);draw(files);}catch(error){draw(documents.get(id),message(error));}}
      draw(saved);if(win._driveToken)load();
    }
    function renderTemplates(snapshot,target) {
      if(typeof win.__getScriptsPanelData!=='function'){if(library)library(target);return;}
      var id=key(snapshot), base=win.__getScriptsPanelData(), data={auto:false,variants:{}}, ready=false, writable=false, saving=false;
      var settings=el('details','cg-template-settings');settings.append(el('summary','','⚙ Настройки быстрых скриптов'));var check=el('input');check.type='checkbox';check.disabled=true;var label=el('label','cg-suggestion');label.append(check,el('span','','Автоматически добавлять вариант с данными захваченного проекта (локально, без платного API)'));settings.append(label);target.append(settings);
      target.append(el('p','cg-caption','Нажатие — копировать. Если вариантов несколько — выбрать. Правая кнопка мыши или удержание — настроить варианты.'));
      var cards=el('div','cg-template-grid');target.append(cards);var status=el('p','cg-caption');status.setAttribute('role','status');target.append(status);
      function current(){return snapshot.scope===scope()&&target.isConnected;}
      function personal(text){var facts=suggestions(snapshot.data);return String(text||'')+(facts.length?'\n\nПо вашему проекту «'+snapshot.title+'»:\n'+facts.join('\n'):'');}
      function variants(template){
        var saved=data.variants[template.id], values=Array.isArray(saved)&&saved.length?saved.slice(0,20):template.variants?template.variants.slice(0,20):[template.text||''];
        values=values.map(function(text){return String(text||'').slice(0,20000);});
        if(data.auto&&!saved&&values.length<20)values.push(personal(values[0]));
        return values;
      }
      async function save(next){
        if(!current()||!writable||saving)return false;
        saving=true;check.disabled=true;draw();
        try{await prefs(id,next);data=copy(next);if(current())status.textContent='Варианты сохранены для этого проекта в браузере.';return true;}
        catch(error){if(current())status.textContent='Не сохранено: '+message(error);return false;}
        finally{saving=false;if(current()){check.checked=data.auto;check.disabled=!writable;draw();}}
      }
      async function copyVariant(text,control,feedback){
        if(!current())return false;
        if(!String(text).trim()){feedback.textContent='Вариант пустой. Добавьте текст в настройках.';return false;}
        try{
          await win.navigator.clipboard.writeText(text);
          if(current()){
            feedback.textContent='Скопировано: '+control.getAttribute('data-label');
            control.classList.add('cg-is-copied');
            win.setTimeout(function(){control.classList.remove('cg-is-copied');},1400);
          }
          return true;
        }catch(_){feedback.textContent='Копирование недоступно. Откройте настройку варианта и скопируйте выделенный текст.';return false;}
      }
      function openTemplate(template,control,editing){
        if(!ready||saving||!current())return;
        var modal=el('dialog','cg-template-menu'), heading=el('div','cg-template-menu-heading'), body=el('div'), feedback=el('p','cg-caption');
        modal.setAttribute('aria-label','Варианты: '+template.label);feedback.setAttribute('role','status');
        heading.append(el('h3','',template.emoji+' '+template.label),button('×',function(){modal.close();},'cg-template-close'));
        heading.lastChild.setAttribute('aria-label','Закрыть варианты');modal.append(heading,el('small','cg-template-project',snapshot.title),body,feedback);
        function editor(){
          if(!current()||!writable)return;
          editing=true;
          var values=variants(template), selected=0, tabs=el('div','cg-variant-tabs'), input=el('textarea','cg-variant-input'), actions=el('div','cg-template-menu-actions');
          input.rows=7;input.maxLength=20000;input.setAttribute('aria-label','Текст варианта');
          var add=button('+ Вариант',function(){if(values.length>=20)return;values[selected]=input.value;values.push(input.value);selected=values.length-1;drawTabs();input.focus();},'cg-variant-add');
          var remove=button('Удалить вариант',function(){if(values.length<=1)return;values.splice(selected,1);selected=Math.min(selected,values.length-1);drawTabs();},'cg-variant-delete');
          function drawTabs(){
            tabs.replaceChildren();values.forEach(function(_,i){var tab=button('Вариант '+(i+1),function(){values[selected]=input.value;selected=i;drawTabs();input.focus();},'cg-variant-tab');tab.setAttribute('aria-pressed',String(i===selected));tabs.append(tab);});
            input.value=values[selected];add.disabled=values.length>=20;remove.disabled=values.length<=1;
          }
          async function commit(){
            if(saving||!current())return;
            values[selected]=input.value;
            var next=copy(data);next.variants[template.id]=values.slice();
            saveButton.disabled=true;add.disabled=true;remove.disabled=true;input.disabled=true;
            Array.from(tabs.children).forEach(function(tab){tab.disabled=true;});
            if(await save(next)){modal.close();return;}
            saveButton.disabled=false;input.disabled=false;drawTabs();feedback.textContent=status.textContent;
          }
          var saveButton=button('Сохранить варианты',commit,'cg-template-save');
          input.addEventListener('keydown',function(event){if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();commit();}});
          actions.append(add,remove,saveButton,button('Отмена',function(){modal.close();}));
          body.replaceChildren(el('p','cg-caption','Выберите вариант или добавьте новый. Изменения применяются только после сохранения.'),tabs,input,actions);drawTabs();input.focus();
        }
        function picker(){
          var list=el('div','cg-variant-list');
          variants(template).forEach(function(text,i){
            var item=button('',async function(){if(await copyVariant(text,control,feedback)){modal.close();control.focus();}},'cg-variant-copy');
            item.setAttribute('aria-label','Скопировать вариант '+(i+1));item.append(el('strong','','Вариант '+(i+1)),el('span','cg-variant-preview',text.replace(/\s+/g,' ').slice(0,180)||'Пустой вариант'),el('span','cg-variant-copy-label','Копировать'));list.append(item);
          });
          var edit=button('Настроить варианты',editor,'cg-template-configure');edit.disabled=!writable;
          body.replaceChildren(el('p','cg-caption','Выберите текст — он сразу скопируется.'),list,edit);
        }
        doc.body.append(modal);dialogs.set(modal,snapshot.scope);
        modal.addEventListener('close',function(){dialogs.delete(modal);modal.remove();});
        modal.addEventListener('click',function(event){if(event.target===modal&&!editing)modal.close();});
        modal.showModal();if(editing&&writable)editor();else picker();
      }
      function draw(){cards.replaceChildren();base.forEach(function(template){
        var values=variants(template), timer=null, held=false, x=0, y=0;
        var control=button('',function(){if(held){held=false;return;}if(values.length>1)openTemplate(template,control,false);else copyVariant(values[0],control,status);},'cg-template-button');
        control.disabled=!ready||saving;control.setAttribute('data-label',template.label);control.setAttribute('aria-haspopup','dialog');
        control.title='Нажатие — '+(values.length>1?'выбрать и скопировать':'копировать')+'. Правая кнопка мыши / F2 — варианты.';
        if(/^#[0-9a-f]{3,8}$/i.test(template.color||''))control.style.setProperty('--cg-template-color',template.color);
        control.append(el('span','cg-template-icon',template.emoji),el('span','cg-template-name',template.label));
        if(values.length>1)control.append(el('span','cg-template-count',values.length+' ▾'));
        function stop(){if(timer)win.clearTimeout(timer);timer=null;}
        control.addEventListener('pointerdown',function(event){held=false;if(event.button!==0||event.pointerType==='mouse')return;x=event.clientX;y=event.clientY;stop();timer=win.setTimeout(function(){timer=null;held=true;openTemplate(template,control,true);},550);});
        control.addEventListener('pointermove',function(event){if(Math.abs(event.clientX-x)+Math.abs(event.clientY-y)>12)stop();});
        ['pointerup','pointercancel','pointerleave'].forEach(function(name){control.addEventListener(name,stop);});
        control.addEventListener('contextmenu',function(event){event.preventDefault();stop();if(!held)openTemplate(template,control,true);});
        control.addEventListener('keydown',function(event){if(event.key==='F2'||event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();openTemplate(template,control,true);}});
        cards.append(control);
      });}
      check.addEventListener('change',function(){var next=copy(data);next.auto=check.checked;save(next);});
      draw();prefs(id).then(function(saved){
        if(!current())return;
        if(saved)data=Object.assign({},saved,{auto:saved.auto===true,variants:saved.variants&&typeof saved.variants==='object'?saved.variants:{}});
        ready=true;writable=true;check.checked=data.auto;check.disabled=false;draw();
      }).catch(function(error){if(current()){ready=true;draw();status.textContent='Варианты не удалось загрузить; редактирование заблокировано: '+message(error);}});
    }
    function build(type, data, comment, depth) {
      var before = win.currentData, beforeDepth = win.currentDepth;
      try {
        win.currentData = data; win.currentDepth = depth;
        var publicContext = { company: data.company, category: data.category, city: data.city, notes: data.notes, kp: data.kp, positions: data.positions };
        var prompt = type === 'analysis' ? win.buildAnalysisPrompt() : type === 'presale' ? win.buildPresalePrompt() : type === 'avito1' ? win.buildAvito1Prompt() : 'Создай практичные скрипты продаж для клиента на Авито: первый ответ, уточнение потребности, предложение, возражения, следующий контакт. Не придумывай цены, гарантии и результаты клиента.\nДанные клиента:\n' + JSON.stringify(publicContext) + '\nВерни только JSON {"html":"<h1>Скрипты продаж</h1>..."}. Используй h2, h3, p, ul, li; без скриптов и форм.';
        return prompt + '\n\nКомментарий оператора (уточнения к документу):\n' + (comment || 'Нет дополнительных указаний.') + '\nНе выдавай предположения за факты и не придумывай реальные показатели проекта.';
      } finally { win.currentData = before; win.currentDepth = beforeDepth; }
    }
    function sanitize(html) {
      var parsed = doc.createElement('template'); parsed.innerHTML = html;
      var allowed = /^(H[1-6]|P|DIV|SPAN|UL|OL|LI|STRONG|B|EM|I|BR|TABLE|THEAD|TBODY|TR|TD|TH|BLOCKQUOTE|A)$/;
      function clean(parent) { Array.from(parent.children).forEach(function (node) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|FORM|INPUT|BUTTON|IMG|LINK|META)$/.test(node.tagName)) { node.remove(); return; }
        clean(node);
        if (!allowed.test(node.tagName)) { node.replaceWith.apply(node, Array.from(node.childNodes)); return; }
        Array.from(node.attributes).forEach(function (attr) { if (!(node.tagName === 'A' && attr.name === 'href' && /^https:\/\//i.test(attr.value)) && !(/^(TD|TH)$/.test(node.tagName) && /^(colspan|rowspan)$/.test(attr.name) && /^\d{1,2}$/.test(attr.value))) node.removeAttribute(attr.name); });
      }); }
      clean(parsed.content); return parsed.innerHTML;
    }
    function assertPdfScope(snapshot){if(snapshot.scope!==scope())throw Error('Пользователь или Google-аккаунт изменился.');}
    async function localPdf(snapshot,job){
      assertPdfScope(snapshot);
      if(typeof win.html2pdf!=='function')throw Error('Модуль PDF не загрузился. Обновите страницу или проверьте доступ к Google Drive.');
      var host=el('div'),content=el('div','cg-pdf-document');
      host.style.cssText='position:fixed;left:-10000px;top:0;width:710px;pointer-events:none';host.setAttribute('aria-hidden','true');
      content.style.cssText='position:static;width:710px;background:#fff;color:#222;font:14px/1.65 Arial,sans-serif;box-sizing:border-box;overflow-wrap:anywhere';
      content.innerHTML=sanitize(job.html);
      Array.from(content.querySelectorAll('*')).forEach(function(node){
        node.style.color=node.tagName==='A'?'#1165a0':'#222';node.style.fontFamily='Arial,sans-serif';node.style.letterSpacing='normal';
        var heading={H1:26,H2:21,H3:17,H4:15,H5:14,H6:14}[node.tagName];
        if(heading){node.style.fontSize=heading+'px';node.style.lineHeight='1.3';node.style.margin=(node.tagName==='H1'?'0':'20px')+' 0 10px';node.style.fontWeight='700';}
        if(node.tagName==='P')node.style.margin='0 0 10px';
        if(/^(UL|OL)$/.test(node.tagName)){node.style.paddingLeft='24px';node.style.margin='8px 0 12px';}
        if(node.tagName==='LI')node.style.margin='4px 0';
        if(node.tagName==='TABLE'){node.style.width='100%';node.style.borderCollapse='collapse';node.style.margin='12px 0';}
        if(/^(TD|TH)$/.test(node.tagName)){node.style.padding='7px';node.style.border='1px solid #ccd5df';node.style.fontSize='12px';}
        if(node.tagName==='TH')node.style.background='#edf3f8';
      });
      var header=snapshot.headers&&snapshot.headers[job.type];
      if(header){var img=el('img');img.src=header;img.crossOrigin='anonymous';img.alt='';img.style.cssText='display:block;width:100%;height:auto;margin:0 0 20px';content.prepend(img);}
      host.append(content);doc.body.append(host);
      try{return await win.html2pdf().set({margin:[12,12,12,12],filename:pdfName(snapshot,job),image:{type:'jpeg',quality:.94},html2canvas:{scale:1.5,useCORS:true,allowTaint:false,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['h1','h2','h3','tr','li']}}).from(content).outputPdf('blob');}
      finally{host.remove();}
    }
    async function pdfBlob(snapshot,job){
      assertPdfScope(snapshot);
      if(job.file&&/^[a-zA-Z0-9_-]+$/.test(job.file.id||'')&&win._driveToken){
        var controller=new win.AbortController(),timer=win.setTimeout(function(){controller.abort();},30000);
        try{
          var token=await win.getDriveToken();assertPdfScope(snapshot);
          var response=await win.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(job.file.id)+'/export?mimeType=application/pdf',{headers:{Authorization:'Bearer '+token},credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
          assertPdfScope(snapshot);if(!response.ok)throw Error('Экспорт Drive: HTTP '+response.status);
          var blob=await response.blob();await validatePdf(blob);assertPdfScope(snapshot);job.pdfSource='Google Drive';return blob;
        }catch(error){assertPdfScope(snapshot);if(!job.html)throw error;}
        finally{win.clearTimeout(timer);}
      }
      if(!job.html)throw Error('Содержимое документа ещё не готово.');
      job.pdfSource='Локальная копия';return localPdf(snapshot,job);
    }
    function savePdfFile(file){
      var url=win.URL.createObjectURL(file),link=el('a');link.href=url;link.download=file.name;doc.body.append(link);link.click();link.remove();win.setTimeout(function(){win.URL.revokeObjectURL(url);},30000);
    }
    var delivery=createPdfDelivery({
      isCurrent:function(snapshot){return snapshot.scope===scope();},render:pdfBlob,
      file:function(blob,name){if(typeof win.File==='function')return new win.File([blob],name,{type:'application/pdf'});var file=new win.Blob([blob],{type:'application/pdf'});file.name=name;return file;},
      download:savePdfFile,canShare:function(data){return !!(win.navigator.share&&win.navigator.canShare&&win.navigator.canShare(data));},
      share:function(data){return win.navigator.share(data);},changed:function(){renderResults();renderStatus();renderDelivery();}
    });
    function warmPdfs(batch){if(batch.snapshot.scope!==scope())return;batch.jobs.forEach(function(job){if(['saved','save_failed'].indexOf(job.state)>=0&&!job.pdfState)delivery.get(batch,job).catch(function(){});});}
    var runner = createRunner({
      isCurrent: function (snapshot) { return snapshot.scope === scope(); },
      prepare: async function (snapshot) {
        var token = await win.getDriveToken();
        if (snapshot.scope !== scope()) throw Error('Режим пользователя изменился.');
        if (!await win.driveCanWriteFolder(snapshot.folderId)) throw Error('Нет доступа к захваченной папке Drive. Подключите нужный Google-аккаунт.');
        if (snapshot.scope !== scope()) throw Error('Режим пользователя изменился.');
        snapshot.driveToken = token;
      },
      generate: function (prompt) { return win.callAPI(prompt, 6000); },
      parse: function (raw) { return parseResult(raw, sanitize); },
      save: async function (snapshot, job, guard) {
        var controller = new win.AbortController(), timeout = win.setTimeout(function () { controller.abort(); }, 90000);
        function validate(token) { guard(); if (controller.signal.aborted) throw Error('Drive не подтвердил запись вовремя. Проверьте папку перед повтором.'); if (snapshot.driveToken !== win._driveToken || token && token !== snapshot.driveToken) throw Error('Подключение Google изменилось. Файл не отправлен в другую папку или аккаунт.'); }
        try {
        validate();
        var name = job.emoji + ' ' + job.title + ' — ' + snapshot.title;
        var header = snapshot.headers && snapshot.headers[job.type], body = job.html;
        if (header && typeof win.insertHeaderImg === 'function') body = win.insertHeaderImg(body, header.replace(/"/g, '%22'));
        var file = await win.driveCreateGoogleDoc(name, win.buildWordHtml(body), snapshot.folderId, validate, controller.signal);
        return { id: file.id, name: name, url: 'https://docs.google.com/document/d/' + encodeURIComponent(file.id) + '/edit' };
        } catch (error) { if (controller.signal.aborted) throw Error('Drive не подтвердил запись вовремя. Проверьте папку перед повтором.'); throw error; }
        finally { win.clearTimeout(timeout); }
      },
      onChange: function (batch) { updateProgress(); renderResults(); renderStatus(); warmPdfs(batch); }
    });
    function showComments(type, snapshot, state, control) {
      var modal = el('dialog', 'cg-comments'); modal.setAttribute('aria-label', 'Комментарий: ' + type.title);
      modal.append(el('h3', '', type.emoji + ' ' + type.title), el('p', '', 'Уточнения только для этого документа. Подсказки добавляются по выбору.'));
      var input = el('textarea'); input.rows = 5; input.maxLength = 6000; input.value = state.comments[type.id] || ''; input.setAttribute('aria-label', 'Комментарий к документу'); modal.append(input);
      suggestions(snapshot.data).forEach(function (suggestion) { var label = el('label', 'cg-suggestion'), check = el('input'); check.type = 'checkbox'; label.append(check, el('span', '', suggestion)); check.addEventListener('change', function () { var parts = input.value.split('\n'); if (check.checked && parts.indexOf(suggestion) < 0) parts.push(suggestion); if (!check.checked) parts = parts.filter(function (line) { return line !== suggestion; }); input.value = parts.join('\n').slice(0, 6000); }); modal.append(label); });
      var actions = el('div', 'cg-actions'); actions.append(button('Сохранить комментарий', function () { if (snapshot.scope === scope()) { state.comments[type.id] = input.value; control.title = input.value ? 'Есть комментарий. Удерживайте, чтобы изменить.' : 'Удерживайте для комментария'; control.classList.toggle('cg-has-comment', !!input.value); } modal.close(); }), button('Отмена', function () { modal.close(); })); modal.append(actions); doc.body.append(modal); dialogs.set(modal, snapshot.scope); modal.addEventListener('close', function () { dialogs.delete(modal); modal.remove(); }); modal.showModal(); input.focus();
    }
    function deliveryMessage(batch,text){batch.deliveryMessage=text;renderResults();renderStatus();renderDelivery();}
    function downloadPdfs(batch,jobs){
      try{var count=delivery.download(batch,jobs);deliveryMessage(batch,count>1?'PDF переданы браузеру. Разрешите скачивание нескольких файлов или скачайте каждый кнопкой ↓ PDF.':'PDF передан браузеру для скачивания.');}
      catch(error){deliveryMessage(batch,message(error));}
    }
    function sharePdfs(batch,jobs){
      try{
        var pending=delivery.share(batch,jobs);
        Promise.resolve(pending).then(function(){if(batch.snapshot.scope===scope())deliveryMessage(batch,'Выбор приложения завершён. Получателя и отправку подтвердите в Telegram.');},function(error){if(batch.snapshot.scope===scope())deliveryMessage(batch,error.name==='AbortError'?'Передача отменена. Файлы остаются доступны.':'Не удалось открыть передачу файлов: '+message(error));});
      }catch(error){deliveryMessage(batch,message(error));}
    }
    function openDelivery(batch,jobs,mode){
      if(batch.snapshot.scope!==scope())return;
      if(deliveryDialog)deliveryDialog.close();
      deliveryRequest={batch:batch,jobs:jobs.slice(),mode:mode};deliveryDialog=el('dialog','cg-template-menu cg-delivery-modal');deliveryDialog.setAttribute('aria-label','Скачать PDF или передать в Telegram');
      deliveryDialog.addEventListener('close',function(){this.remove();if(deliveryDialog===this){deliveryDialog=null;deliveryRequest=null;}});
      doc.body.append(deliveryDialog);renderDelivery();deliveryDialog.showModal();
      jobs.forEach(function(job){delivery.get(batch,job).catch(function(){});});
    }
    function renderDelivery(){
      if(!deliveryDialog||!deliveryRequest)return;
      var batch=deliveryRequest.batch,jobs=deliveryRequest.jobs,modal=deliveryDialog;
      if(batch.snapshot.scope!==scope()){modal.close();return;}
      var head=el('div','cg-template-menu-heading');head.append(el('h3','',deliveryRequest.mode==='share'?'PDF в Telegram':'Скачать PDF'),button('×',function(){modal.close();},'cg-template-close'));
      modal.replaceChildren(head,el('strong','cg-template-project',batch.snapshot.title));
      var list=el('div','cg-pdf-list');
      jobs.forEach(function(job){
        var item=el('div','cg-pdf-item');item.append(el('span','',pdfName(batch.snapshot,job)));
        if(delivery.peek(batch,job))item.append(button('↓ PDF',function(){downloadPdfs(batch,[job]);},'cg-pdf-button'));
        else if(job.pdfState==='failed'){item.append(el('small','cg-error',job.pdfError),button('Повторить PDF',function(){delivery.get(batch,job).catch(function(){});},'cg-pdf-button'));}
        else item.append(el('small','','Подготовка PDF…'));
        list.append(item);
      });modal.append(list);
      var ready=!!delivery.files(batch,jobs),actions=el('div','cg-template-menu-actions');
      var download=button(jobs.length>1?'Скачать все PDF':'Скачать PDF',function(){downloadPdfs(batch,jobs);});download.disabled=!ready;actions.append(download);
      if(ready&&delivery.canShare(batch,jobs))actions.append(button('Выбрать Telegram / получателя',function(){sharePdfs(batch,jobs);},'cg-template-save'));
      else if(ready){
        modal.append(el('p','cg-delivery-help','Браузер не передаёт вложения напрямую. Скачайте PDF, откройте Telegram и прикрепите файлы к нужному чату.'));
        var telegram=el('a','cg-telegram-link','Открыть Telegram Web ↗');telegram.href='https://web.telegram.org/k/';telegram.target='_blank';telegram.rel='noopener noreferrer';actions.append(telegram);
      }
      if(jobs.length>1)modal.append(el('p','cg-delivery-help','Каждый документ скачивается отдельным PDF. Браузер может запросить разрешение на несколько скачиваний.'));
      modal.append(actions);if(batch.deliveryMessage)modal.append(el('p','cg-delivery-help',batch.deliveryMessage));
    }
    function pdfAction(batch,jobs,mode){
      if(mode==='download'&&delivery.files(batch,jobs))downloadPdfs(batch,jobs);
      else if(mode==='share'&&delivery.canShare(batch,jobs))sharePdfs(batch,jobs);
      else openDelivery(batch,jobs,mode);
    }
    function batchActions(batch){
      var jobs=batch.jobs.filter(function(job){return !!(job.html||job.file);});
      if(batch.running||jobs.length<2)return null;
      var bar=el('div','cg-batch-actions'),all=jobs.length===batch.jobs.length;
      bar.append(button(all?'Скачать всё · PDF':'Скачать готовые ('+jobs.length+' PDF)',function(){pdfAction(batch,jobs,'download');},'cg-pdf-button'),button('В Telegram',function(){pdfAction(batch,jobs,'share');},'cg-pdf-button'));
      if(batch.deliveryMessage)bar.append(el('small','',batch.deliveryMessage));return bar;
    }
    function jobRow(job,batch) {
      var row = el('div', 'cg-result'); row.append(el('strong', '', job.emoji + ' ' + job.title), el('span', '', ({ waiting: 'В очереди', generating: 'Генерация…', saving: 'Сохранение в Drive…', saved: 'Сохранено в Drive', failed: 'Ошибка генерации', save_failed: 'Запись не подтверждена', not_started: 'Не запускался' })[job.state]));
      if (job.file) { var a = el('a', '', 'Открыть документ ↗'); a.href = job.file.url; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
      if (job.error) row.append(el('small', 'cg-error', job.error));
      var actions=el('div','cg-document-actions'),available=!!(job.html||job.file);
      var download=button('↓ PDF',function(){pdfAction(batch,[job],'download');},'cg-pdf-button'),share=button('В Telegram',function(){pdfAction(batch,[job],'share');},'cg-pdf-button');
      download.title='Скачать документ в PDF';download.disabled=share.disabled=!available;actions.append(download,share);
      if(job.pdfState==='preparing')actions.append(el('small','','PDF…'));
      if(job.pdfState==='failed')actions.append(el('small','cg-error','PDF не готов: нажмите ↓ PDF для повтора.'));
      row.append(actions);
      return row;
    }
    function renderStatus() {
      if (!statusDialog || !statusDialog.isConnected || !statusBatch) return;
      if (statusBatch.snapshot.scope !== scope()) { statusDialog.close(); return; }
      var rows = statusDialog.querySelector('.cg-results'); rows.replaceChildren();
      if (statusBatch.error) rows.append(el('p', 'cg-error', statusBatch.error));
      statusBatch.jobs.forEach(function (job) { rows.append(jobRow(job,statusBatch)); });
      var actions=batchActions(statusBatch);if(actions)rows.append(actions);
    }
    function showStatus(batch) {
      if (!batch || batch.snapshot.scope !== scope()) return;
      if (statusDialog) statusDialog.close();
      statusBatch = batch; statusDialog = el('dialog', 'cg-comments'); statusDialog.setAttribute('aria-label', 'Фоновые документы проекта');
      statusDialog.append(el('h3', '', batch.snapshot.title));
      var folder = el('a', 'cg-folder', 'Захваченная папка Drive ↗'); folder.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(batch.snapshot.folderId); folder.target = '_blank'; folder.rel = 'noopener';
      statusDialog.append(folder, el('div', 'cg-results'), button('Закрыть', function () { statusDialog.close(); }));
      statusDialog.addEventListener('close', function () { this.remove(); if (statusDialog === this) { statusDialog = null; statusBatch = null; } }); doc.body.append(statusDialog); renderStatus(); statusDialog.showModal();
    }
    function renderResults() {
      var target = holder && holder.querySelector('.cg-results'); if (!target || !holder.isConnected) return;
      target.replaceChildren();
      var relevant = batches.filter(function (batch) { return key(batch.snapshot) === panelKey && batch.snapshot.scope === scope(); });
      relevant.slice(-5).forEach(function (batch) {
        if (batch.error) target.append(el('p', 'cg-error', batch.error));
        batch.jobs.forEach(function (job) { target.append(jobRow(job,batch)); });
        var actions=batchActions(batch);if(actions)target.append(actions);
      });
      var start = holder.querySelector('.cg-start'); if (start) start.disabled = !!runner.active();
      if (errorText) target.prepend(el('p', 'cg-error', errorText));
    }
    var progress = el('aside', 'cg-progress'); progress.hidden = true; progress.setAttribute('aria-label', 'Фоновая генерация документов');
    var progressOpen = button('', function () { showStatus(runner.active() || batches[batches.length - 1]); }), meter = el('progress'), progressClose = button('×', function () { if (runner.active()) runner.cancel(); else { dismissed = batches[batches.length - 1]; updateProgress(); } });
    progressClose.setAttribute('aria-label', 'Остановить оставшиеся документы или скрыть результат'); progress.append(progressOpen, meter, progressClose); doc.body.append(progress);
    function updateProgress() {
      var active = runner.active(), batch = active || batches[batches.length - 1];
      if (active && active.snapshot.scope !== scope()) active.cancelled = true;
      dialogs.forEach(function (owner, modal) { if (owner !== scope()) modal.close(); });
      if (statusDialog && statusBatch && statusBatch.snapshot.scope !== scope()) statusDialog.close();
      if (deliveryDialog && deliveryRequest && deliveryRequest.batch.snapshot.scope !== scope()) deliveryDialog.close();
      progress.hidden = !batch || batch.snapshot.scope !== scope() || dismissed === batch;
      if (progress.hidden) return;
      var done = batch.jobs.filter(function (job) { return job.state === 'saved'; }).length, finished = batch.jobs.filter(function (job) { return ['saved', 'failed', 'save_failed', 'not_started'].indexOf(job.state) >= 0; }).length;
      progressOpen.textContent = batch.snapshot.title + ' · ' + (batch.running ? 'готово ' : 'сохранено ') + done + '/' + batch.jobs.length;
      progress.setAttribute('aria-busy', String(batch.running)); meter.max = batch.jobs.length; meter.value = finished; meter.setAttribute('aria-label', 'Обработано документов: ' + finished + ' из ' + batch.jobs.length);
    }
    function render(container) {
      container.replaceChildren(); holder = el('section', 'cg-panel'); container.append(holder);
      var snapshot;
      try { snapshot = captured(); } catch (error) { holder.append(el('h2', '', '🌀 Скрипт и документы'), el('p', 'cg-error', message(error))); if (library) { var fallback = el('div'); holder.append(fallback); library(fallback); } return; }
      panelKey = key(snapshot); var state = draft(snapshot);
      holder.append(button('← К папкам клиентов', function () { originalSwitch.call(win, 'analysis'); if (typeof win.showClientContentsBack === 'function') win.showClientContentsBack(); }, 'cg-back'));
      var heading=el('div','cg-heading');heading.append(el('h2', '', '🌀 Скрипт и документы'),el('strong','cg-project-title',snapshot.title));holder.append(heading);
      holder.append(el('p','cg-project-facts',suggestions(snapshot.data).join(' · ')||'Заполните данные клиента в левом меню — генераторы используют их автоматически.'));
      var folder = el('a', 'cg-folder', 'Открыть папку Drive ↗'); folder.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(snapshot.folderId); folder.target = '_blank'; folder.rel = 'noopener'; holder.append(folder);
      holder.append(el('p', 'cg-caption', 'Нажмите, чтобы выбрать документы. Удерживайте кнопку для комментария; также можно нажать её маленький карандаш.'));
      var choices = el('div', 'cg-choices');
      TYPES.forEach(function (type) {
        var wrap = el('div', 'cg-choice'), timer = null, held = false, x = 0, y = 0;
        var control = button(type.emoji + ' ' + type.title, function () { if (held) { held = false; return; } var index = state.selected.indexOf(type.id); if (index < 0) state.selected.push(type.id); else state.selected.splice(index, 1); control.setAttribute('aria-pressed', String(state.selected.indexOf(type.id) >= 0)); start.textContent = 'Сгенерировать выбранное (' + state.selected.length + ')'; });
        control.setAttribute('aria-pressed', String(state.selected.indexOf(type.id) >= 0)); control.classList.toggle('cg-has-comment', !!state.comments[type.id]);
        function stop() { if (timer) win.clearTimeout(timer); timer = null; }
        control.addEventListener('pointerdown', function (event) { if (event.button !== 0) return; held = false; x = event.clientX; y = event.clientY; stop(); timer = win.setTimeout(function () { timer = null; held = true; showComments(type, snapshot, state, control); }, 550); });
        control.addEventListener('pointermove', function (event) { if (Math.abs(event.clientX - x) + Math.abs(event.clientY - y) > 12) stop(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (event) { control.addEventListener(event, stop); });
        control.addEventListener('contextmenu', function (event) { event.preventDefault(); stop(); if (!held) showComments(type, snapshot, state, control); held = true; });
        control.addEventListener('keydown', function (event) { if (event.key === 'F2') { event.preventDefault(); showComments(type, snapshot, state, control); } });
        var edit = button('✎', function () { showComments(type, snapshot, state, control); }, 'cg-edit'); edit.setAttribute('aria-label', 'Комментарий: ' + type.title); wrap.append(control, edit); choices.append(wrap);
      }); holder.append(choices);
      var common=el('textarea','cg-common');common.rows=3;common.maxLength=6000;common.placeholder='Общий комментарий для всех выбранных документов';common.setAttribute('aria-label','Общий комментарий для всех документов');common.value=state.common||'';common.addEventListener('input',function(){state.common=common.value;});holder.append(common);
      var actions = el('div', 'cg-actions'), depth = el('select'); depth.setAttribute('aria-label', 'Подробность документов'); [['light', 'Кратко'], ['mid', 'Стандарт'], ['max', 'Подробно']].forEach(function (row) { var option = el('option', '', row[1]); option.value = row[0]; depth.append(option); }); depth.value = state.depth; depth.addEventListener('change', function () { state.depth = depth.value; });
      var start = button('Сгенерировать выбранное (' + state.selected.length + ')', async function () {
        if (runner.active()) return; errorText = '';
        try {
          var fresh = captured(); if (key(fresh) !== panelKey) { render(container); throw Error('Выбран другой проект. Проверьте документы и нажмите генерацию заново.'); }
          var comments={};TYPES.forEach(function(type){comments[type.id]=[state.common,state.comments[type.id]].filter(Boolean).join('\n\n').slice(0,6000);});
          var batch = plan(fresh, state.selected, comments, function (type, data, comment) { return build(type, data, comment, state.depth); });
          batches.push(batch); dismissed = null; await runner.run(batch);
        } catch (error) { errorText = message(error); renderResults(); }
      }, 'cg-start'); actions.append(depth, start); holder.append(actions, el('p', 'cg-caption', 'Выбранные документы и комментарии отправляются в текущий AI-сервис (Anthropic, платный API). Файлы сохраняются в захваченную папку Google Drive. Можно менять вкладки; не закрывайте страницу до завершения.'), el('div', 'cg-results'));
      var files=el('section','cg-documents');holder.append(files);existingDocuments(snapshot,files);
      var templates = el('details', 'cg-library');templates.open=true; templates.append(el('summary', '', 'Быстрые скрипты и шаблоны сообщений')); var libraryHost = el('div'); templates.append(libraryHost); holder.append(templates); renderTemplates(snapshot,libraryHost); renderResults();
    }
    win.__showScriptsPanel = render;
    var scriptTab = doc.getElementById('tab-scripts'); if (scriptTab) { var icon = scriptTab.querySelector('.rtab-ico'); if (icon) icon.textContent = '🌀'; }
    var lastKey = ''; win.setInterval(function () {
      updateProgress();
      if (win.currentTab !== 'scripts' || !holder || !holder.isConnected || ['projects-mode','goals-mode','assets-mode','ads-mode','tasks-mode','avito-accounts-mode','agency-mode','strategy-mode'].some(function (name) { return doc.body.classList.contains(name); })) return;
      try { var nextKey = key(captured()); if (nextKey !== panelKey) render(holder.parentNode); lastKey = nextKey; }
      catch (_) { if (lastKey) { lastKey = ''; render(holder.parentNode); } }
    }, 800);
    win.addEventListener('beforeunload', function (event) { if (runner.active()) { event.preventDefault(); event.returnValue = ''; } });
    var api = { show: render }; win.__clientGenerators = api;
    if (win.currentTab === 'scripts') { var current = doc.getElementById('mainContent'); if (current) render(current); }
    return api;
  }
  return { TYPES: TYPES, plan: plan, createRunner: createRunner, parseResult: parseResult, suggestions: suggestions, contextData: contextData, pdfName:pdfName,validatePdf:validatePdf,createPdfDelivery:createPdfDelivery, install: install };
}));
