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
  function install(win) {
    if (win.__clientGenerators) return win.__clientGenerators;
    var doc = win.document, library = win.__showScriptsPanel, originalSwitch = win.switchTab;
    var drafts = new Map(), batches = [], dialogs = new Map(), holder = null, panelKey = '', errorText = '', dismissed = null, statusDialog = null, statusBatch = null;
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
      data = contextData(contextData(contextData(data, client), linked), projectData);
      var headers = {};
      [['analysis', 'getAnalyticsHeaderImg'], ['presale', 'getPresaleHeaderImgForExport'], ['avito1', 'getAvito1HeaderImgForExport']].forEach(function (entry) {
        if (typeof win[entry[1]] !== 'function') return;
        try { var url = new win.URL(win[entry[1]](), win.location.href); if (url.protocol === 'https:' || /^data:image\/(png|jpeg|webp);base64,/i.test(url.href)) headers[entry[0]] = url.href; } catch (_) {}
      });
      return { scope: scope(), folderId: String(client.folderId), clientId: String(client.client_id || client.id || ''), title: data.company || 'Клиент', data: data, headers: headers };
    }
    function key(snapshot) { return snapshot.scope + '|' + snapshot.folderId + '|' + snapshot.clientId; }
    function draft(snapshot) { var id = key(snapshot); if (!drafts.has(id)) drafts.set(id, { selected: ['analysis'], comments: {}, depth: 'mid' }); return drafts.get(id); }
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
      onChange: function () { updateProgress(); renderResults(); renderStatus(); }
    });
    function showComments(type, snapshot, state, control) {
      var modal = el('dialog', 'cg-comments'); modal.setAttribute('aria-label', 'Комментарий: ' + type.title);
      modal.append(el('h3', '', type.emoji + ' ' + type.title), el('p', '', 'Уточнения только для этого документа. Подсказки добавляются по выбору.'));
      var input = el('textarea'); input.rows = 5; input.maxLength = 6000; input.value = state.comments[type.id] || ''; input.setAttribute('aria-label', 'Комментарий к документу'); modal.append(input);
      suggestions(snapshot.data).forEach(function (suggestion) { var label = el('label', 'cg-suggestion'), check = el('input'); check.type = 'checkbox'; label.append(check, el('span', '', suggestion)); check.addEventListener('change', function () { var parts = input.value.split('\n'); if (check.checked && parts.indexOf(suggestion) < 0) parts.push(suggestion); if (!check.checked) parts = parts.filter(function (line) { return line !== suggestion; }); input.value = parts.join('\n').slice(0, 6000); }); modal.append(label); });
      var actions = el('div', 'cg-actions'); actions.append(button('Сохранить комментарий', function () { if (snapshot.scope === scope()) { state.comments[type.id] = input.value; control.title = input.value ? 'Есть комментарий. Удерживайте, чтобы изменить.' : 'Удерживайте для комментария'; control.classList.toggle('cg-has-comment', !!input.value); } modal.close(); }), button('Отмена', function () { modal.close(); })); modal.append(actions); doc.body.append(modal); dialogs.set(modal, snapshot.scope); modal.addEventListener('close', function () { dialogs.delete(modal); modal.remove(); }); modal.showModal(); input.focus();
    }
    function jobRow(job) {
      var row = el('div', 'cg-result'); row.append(el('strong', '', job.emoji + ' ' + job.title), el('span', '', ({ waiting: 'В очереди', generating: 'Генерация…', saving: 'Сохранение в Drive…', saved: 'Сохранено в Drive', failed: 'Ошибка генерации', save_failed: 'Запись не подтверждена', not_started: 'Не запускался' })[job.state]));
      if (job.file) { var a = el('a', '', 'Открыть документ ↗'); a.href = job.file.url; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
      if (job.error) row.append(el('small', 'cg-error', job.error));
      if (job.html && job.state !== 'saved') row.append(button('Скачать HTML', function () { var blob = new win.Blob([win.buildWordHtml(job.html)], { type: 'text/html;charset=utf-8' }), url = win.URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = job.title + '.html'; a.click(); win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 30000); }));
      return row;
    }
    function renderStatus() {
      if (!statusDialog || !statusDialog.isConnected || !statusBatch) return;
      if (statusBatch.snapshot.scope !== scope()) { statusDialog.close(); return; }
      var rows = statusDialog.querySelector('.cg-results'); rows.replaceChildren();
      if (statusBatch.error) rows.append(el('p', 'cg-error', statusBatch.error));
      statusBatch.jobs.forEach(function (job) { rows.append(jobRow(job)); });
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
        batch.jobs.forEach(function (job) { target.append(jobRow(job)); });
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
      holder.append(el('h2', '', '🌀 Скрипт и документы'), el('p', 'cg-caption', snapshot.title + ' · папка захвачена'));
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
      var actions = el('div', 'cg-actions'), depth = el('select'); depth.setAttribute('aria-label', 'Подробность документов'); [['light', 'Кратко'], ['mid', 'Стандарт'], ['max', 'Подробно']].forEach(function (row) { var option = el('option', '', row[1]); option.value = row[0]; depth.append(option); }); depth.value = state.depth; depth.addEventListener('change', function () { state.depth = depth.value; });
      var start = button('Сгенерировать выбранное (' + state.selected.length + ')', async function () {
        if (runner.active()) return; errorText = '';
        try {
          var fresh = captured(); if (key(fresh) !== panelKey) { render(container); throw Error('Выбран другой проект. Проверьте документы и нажмите генерацию заново.'); }
          var batch = plan(fresh, state.selected, state.comments, function (type, data, comment) { return build(type, data, comment, state.depth); });
          batches.push(batch); dismissed = null; await runner.run(batch);
        } catch (error) { errorText = message(error); renderResults(); }
      }, 'cg-start'); actions.append(depth, start); holder.append(actions, el('p', 'cg-caption', 'Выбранные документы и комментарии отправляются в текущий AI-сервис (Anthropic, платный API). Файлы сохраняются в захваченную папку Google Drive. Можно менять вкладки; не закрывайте страницу до завершения.'), el('div', 'cg-results'));
      var templates = el('details', 'cg-library'); templates.append(el('summary', '', 'Быстрые скрипты и шаблоны сообщений')); var libraryHost = el('div'); templates.append(libraryHost); holder.append(templates); if (library) library(libraryHost); renderResults();
    }
    win.__showScriptsPanel = render;
    win.switchTab = function (tab) {
      if (['analysis', 'presale', 'avito1'].indexOf(tab) >= 0) { try { var snap = captured(); draft(snap).selected = [tab]; } catch (_) {} tab = 'scripts'; }
      return originalSwitch.apply(this, [tab]);
    };
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
  return { TYPES: TYPES, plan: plan, createRunner: createRunner, parseResult: parseResult, suggestions: suggestions, contextData: contextData, install: install };
}));
