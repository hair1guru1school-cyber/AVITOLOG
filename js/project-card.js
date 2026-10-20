(function (root) {
  'use strict';
  var document = root.document;
  var current = null;
  var accounts = [];
  var accountScope = '';
  var accountRequest = null;
  var refreshTimer = null;
  var FIELDS = [
    ['title', 'Название проекта', 300], ['company', 'Компания', 300],
    ['contact_name', 'Контактное лицо', 200], ['phone', 'Телефон', 100],
    ['telegram', 'Телеграм', 200], ['vk', 'VK', 500],
    ['avito_account', 'Ссылка Avito клиента', 1000], ['category', 'Ниша', 300],
    ['city', 'География', 1000], ['client_type', 'Тип клиента', 100],
    ['kp_count', 'Объявлений по КП', 100], ['positions', 'Позиции', 5000],
    ['notes', 'Примечания', 20000], ['avito_connection_id', 'Аккаунт проекта', 100]
  ];
  function text(value) { return value == null ? '' : String(value); }
  function escape(value) { return text(value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalize(value) { return text(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
  function scope() {
    var key = typeof root.AVITOLOG_KEY === 'function' ? root.AVITOLOG_KEY : function (v) { return v; };
    var identity = typeof root.__avitologBackendIdentity === 'function' ? root.__avitologBackendIdentity() || {} : {};
    return [key('avitolog_projects'), key('avitolog_clients'), root.AVITOLOG_KEY_EMAIL || '', root.AVITOLOG_USER || '', identity.id || '', identity.email || ''].join('|');
  }
  function ready() { return !(root.AVITOLOG_BACKEND_SERVER_ONLY || root.AVITOLOG_BACKEND_MODE) || root.AVITOLOG_BACKEND_INITIAL_SYNC_READY === true; }
  function readOnly() {
    var identity = typeof root.__avitologBackendIdentity === 'function' ? root.__avitologBackendIdentity() || {} : {};
    return !!(root.AVITOLOG_BACKEND_MODE && root.AVITOLOG_KEY_SUFFIX === '_sasha' && text(identity.email).toLowerCase() !== 'cyplakovaleksandr153@gmail.com');
  }
  function safeAvitoUrl(value) {
    try { var u = new URL(text(value)); return u.protocol === 'https:' && /(^|\.)avito\.ru$/i.test(u.hostname) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function safeFolder(value) {
    var id = text(value && (value.folderId || (value.crmData && value.crmData.folderId)));
    return /^[a-zA-Z0-9_-]+$/.test(id) ? 'https://drive.google.com/drive/folders/' + id : '';
  }
  function linkedClient(project, clients) {
    if (!project) return null;
    if (project.crmClientId) {
      var byId = (clients || []).find(function (c) { return c && c.client_id === project.crmClientId; });
      if (byId) return byId;
    }
    return project.folderId ? (clients || []).find(function (c) { return c && c.folderId === project.folderId; }) || null : null;
  }
  function model(project, client) {
    var data = Object.assign({}, client || {}, project && project.crmData || {});
    var out = {};
    FIELDS.forEach(function (field) {
      var key = field[0];
      var value = key === 'title' ? project && project.title || data.company : data[key];
      if (key === 'avito_connection_id') value = project && project.avitoConnectionId || value;
      out[key] = Array.isArray(value) ? value.join(', ') : text(value);
    });
    return out;
  }
  function accountScore(name, account) {
    var a = normalize(name), b = normalize(account && account.display_name);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (Math.min(a.length, b.length) >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return 70;
    var words = a.split(' ').filter(function (v) { return v.length > 2; });
    return words.reduce(function (sum, word) { return sum + (b.split(' ').indexOf(word) >= 0 ? 10 : 0); }, 0);
  }
  function rankedAccounts(name, list) {
    return (list || []).slice().sort(function (a, b) { return accountScore(name, b) - accountScore(name, a) || text(a.display_name).localeCompare(text(b.display_name), 'ru'); });
  }
  function changedFields(before, after) {
    var changes = {};
    FIELDS.forEach(function (f) {
      var key = f[0], value = text(after[key]).trim();
      if (value.length > f[2]) throw new Error('Слишком длинное поле: ' + f[1]);
      if (value !== text(before[key])) changes[key] = value;
    });
    if (Object.prototype.hasOwnProperty.call(changes, 'title') && !changes.title) throw new Error('Укажите название проекта.');
    if (changes.avito_account && !safeAvitoUrl(changes.avito_account)) throw new Error('Укажите полную HTTPS-ссылку на профиль avito.ru.');
    if (changes.avito_connection_id && !/^(personal|oauth):[a-zA-Z0-9-]{1,80}$/.test(changes.avito_connection_id)) throw new Error('Выберите аккаунт из списка.');
    return changes;
  }
  function assertNoConflict(before, latest, changes) {
    Object.keys(changes).forEach(function (key) {
      if (text(latest[key]) !== text(before[key]) && text(latest[key]) !== text(changes[key])) throw new Error('Данные изменились в другом окне. Откройте карту заново, чтобы не потерять изменения.');
    });
  }
  function getProjects() { return typeof root.loadProjectsData === 'function' ? root.loadProjectsData() : { projects: [], tasks: [] }; }
  function getClients() { return typeof root.getCrmClients === 'function' ? root.getCrmClients() : []; }
  function ensureScope(expected) { if (expected !== scope() || !ready()) throw new Error('Режим пользователя изменился или ещё загружается. Откройте карту заново.'); }
  async function loadAccounts() {
    var expected = scope();
    if (accountScope === expected) return accounts;
    if (accountRequest && accountRequest.scope === expected) return accountRequest.promise;
    var bridge = root.AvitoWorkspaceBridge;
    if (!bridge || typeof bridge.listAccounts !== 'function') return [];
    var promise = Promise.resolve().then(function () { return bridge.listAccounts(); }).then(function (list) {
      ensureScope(expected);
      accounts = (Array.isArray(list) ? list : list && list.accounts || []).filter(function (a) { return a && /^(personal|oauth):[a-zA-Z0-9-]{1,80}$/.test(text(a.id)); });
      accountScope = expected;
      return accounts;
    }).finally(function () { if (accountRequest && accountRequest.promise === promise) accountRequest = null; });
    accountRequest = { scope: expected, promise: promise };
    return promise;
  }
  function fillAccountSelect(select, selected, name) {
    if (accountScope && accountScope !== scope()) { accounts = []; accountScope = ''; }
    var ranked = rankedAccounts(name, accounts);
    var signature = JSON.stringify(ranked.map(function (a, index) { return [a.id, a.display_name, a.avito_user_id, index === 0 && accountScore(name, a) >= 10]; })) + '|' + (ranked.some(function (a) { return a.id === selected; }) ? '' : selected || '');
    if (select._projectCardOptions === signature) {
      if (document.activeElement !== select && select.value !== (selected || '')) select.value = selected || '';
      return;
    }
    if (document.activeElement === select) {
      select._projectCardPendingName = name;
      if (!select._projectCardBlurBound) {
        select._projectCardBlurBound = true;
        select.addEventListener('blur', function () {
          if (select._projectCardPendingName == null) return;
          var pendingName = select._projectCardPendingName; select._projectCardPendingName = null;
          fillAccountSelect(select, select.value, pendingName);
        });
      }
      return;
    }
    select.replaceChildren();
    var empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Не привязан'; select.appendChild(empty);
    ranked.forEach(function (account, index) {
      var option = document.createElement('option'); option.value = account.id;
      option.textContent = text(account.display_name || account.avito_user_id || 'Аккаунт') + (index === 0 && accountScore(name, account) >= 10 ? ' · подходит по названию' : '');
      select.appendChild(option);
    });
    if (selected && !ranked.some(function (a) { return a.id === selected; })) {
      var missing = document.createElement('option'); missing.value = selected; missing.textContent = 'Привязанный аккаунт недоступен'; select.appendChild(missing);
    }
    select.value = selected || '';
    select._projectCardOptions = signature;
  }
  function projectForCurrent() {
    var selected = typeof root.getSelectedProject === 'function' ? root.getSelectedProject() : null;
    if (selected) return selected;
    var client = typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    return client && (getProjects().projects || []).find(function (p) { return linkedClient(p, [client]); }) || null;
  }
  function sidebarIdentity() {
    var p = projectForCurrent(), c = typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    return scope() + '|' + (p && p.id || '') + '|' + (c && (c.client_id || c.folderId) || '');
  }
  function refreshSidebar() {
    if (!document) return;
    var select = document.getElementById('projectAccountSelect'), input = document.getElementById('avito_connection_id');
    if (!select || !input) return;
    var identity = sidebarIdentity();
    select.disabled = readOnly() || !ready();
    var p = projectForCurrent(), c = typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    if (select.dataset.identity !== identity) {
      input.value = p ? p.avitoConnectionId || p.crmData && p.crmData.avito_connection_id || '' : c && c.avito_connection_id || '';
      select.dataset.identity = identity;
    }
    var name = p && p.title || (document.getElementById('company') || {}).value || '';
    fillAccountSelect(select, input.value, name);
    var expected = scope();
    loadAccounts().then(function () {
      if (expected === scope() && identity === sidebarIdentity()) fillAccountSelect(select, input.value, name);
    }).catch(function () { select.title = 'Список аккаунтов временно недоступен. Текущая привязка сохранена.'; });
  }
  function sidebarAccountChanged(select) {
    if (readOnly() || !ready()) return;
    var input = document.getElementById('avito_connection_id');
    if (input) input.value = select.value;
    var account = accounts.find(function (a) { return a.id === select.value; });
    var avito = document.getElementById('avito_account');
    var url = account && safeAvitoUrl(account.profile_url);
    if (avito && !avito.value.trim() && url) { avito.value = url; avito.dispatchEvent(new Event('input', { bubbles: true })); }
    if (!url && select.value && avito && !avito.value.trim() && root.AvitoWorkspaceBridge && typeof root.AvitoWorkspaceBridge.getAccountOverview === 'function') {
      var expected = scope(), identity = sidebarIdentity(), id = select.value;
      Promise.resolve(root.AvitoWorkspaceBridge.getAccountOverview(id)).then(function (result) {
        if (expected !== scope() || identity !== sidebarIdentity() || select.value !== id || avito.value.trim()) return;
        var profile = result && result.profile || {}, profileUrl = safeAvitoUrl(profile.profile_url);
        if (profileUrl) { avito.value = profileUrl; avito.dispatchEvent(new Event('input', { bubbles: true })); }
      }).catch(function () {});
    }
  }
  function style() {
    if (document.getElementById('projectCardStyle')) return;
    var element = document.createElement('style'); element.id = 'projectCardStyle';
    element.textContent = '.project-card-overlay{position:fixed;inset:0;z-index:18000;background:#020810b8;display:flex;align-items:center;justify-content:center;padding:22px}.project-card-dialog{width:min(1120px,100%);max-height:92vh;overflow:auto;background:var(--surface,#101b2b);color:var(--text,#eaf2ff);border:1px solid var(--border,#31445b);border-radius:15px;box-shadow:0 24px 90px #0009}.project-card-head,.project-card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 22px;background:var(--surface2,#132132);position:sticky;z-index:2}.project-card-head{top:0;border-bottom:1px solid var(--border,#31445b)}.project-card-head h2{font-size:21px;margin:0}.project-card-head button,.project-card-foot button,.project-card-row-button{cursor:pointer;border:1px solid var(--border,#31445b);border-radius:7px;background:var(--surface2,#132132);color:var(--text,#eaf2ff);padding:7px 11px}.project-card-body{padding:20px 22px;display:grid;gap:20px}.project-card-section{border:1px solid var(--border,#31445b);border-radius:11px;padding:15px}.project-card-section h3{margin:0 0 13px;font-size:15px}.project-card-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.project-card-field{display:flex;flex-direction:column;gap:6px;font-size:12px;min-width:0}.project-card-field input,.project-card-field textarea,.project-card-field select{width:100%;box-sizing:border-box;color:var(--text,#eaf2ff);background:var(--bg,#09111d);border:1px solid var(--border,#31445b);border-radius:7px;padding:9px;font:inherit}.project-card-field-wide{grid-column:1/-1}.project-card-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted,#9ab0c9);margin:0 0 14px}.project-card-meta a{color:var(--accent,#59d8ff)}.project-card-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.project-card-metric{padding:12px;background:var(--surface2,#132132);border-radius:8px;font-size:12px}.project-card-metric strong{display:block;font-size:24px;margin-top:6px}.project-card-note{font-size:12px;color:var(--muted,#9ab0c9);line-height:1.6}.project-card-list{margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8}.project-card-table{width:100%;border-collapse:collapse;font-size:13px}.project-card-table td,.project-card-table th{text-align:left;padding:9px;border-bottom:1px solid var(--border,#31445b)}.project-card-foot{bottom:0;border-top:1px solid var(--border,#31445b)}.project-card-foot [data-action="save"]{background:var(--accent,#09bcaa);color:#031518;font-weight:bold}.project-card-row-button{padding:1px 4px;font-size:11px;line-height:16px;flex:none}.project-card-sidebar{display:block;width:100%;margin-top:9px;padding:12px;border:1px solid var(--border,#31445b);background:var(--surface2,#132132);color:var(--accent,#59d8ff);border-radius:8px;font-weight:700;cursor:pointer}.project-card-account-field select{width:100%;padding:8px;background:var(--surface2,#132132);border:1px solid var(--border,#31445b);border-radius:7px;color:var(--text,#eaf2ff);font-size:12px}@media(max-width:720px){.project-card-overlay{padding:5px}.project-card-dialog{max-height:98vh}.project-card-fields{grid-template-columns:1fr 1fr}.project-card-metrics{grid-template-columns:1fr 1fr}.project-card-head,.project-card-foot,.project-card-body{padding:12px}}';
    document.head.appendChild(element);
  }
  function fieldHtml(field, values) {
    var key = field[0], multiline = key === 'notes' || key === 'positions';
    if (key === 'avito_connection_id') return '<label class="project-card-field project-card-field-wide">Аккаунт проекта<select name="avito_connection_id" data-account-select></select><small class="project-card-note">Вверху списка предложен подходящий по названию. Выберите вручную; аккаунт заявки в CRM не меняется.</small></label>';
    return '<label class="project-card-field' + (multiline ? ' project-card-field-wide' : '') + '">' + escape(field[1]) + (multiline ? '<textarea rows="3"' : '<input type="text"') + ' name="' + key + '" maxlength="' + field[2] + '"' + (multiline ? '>' + escape(values[key]) + '</textarea>' : ' value="' + escape(values[key]) + '">') + '</label>';
  }
  function formatMoney(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('ru-RU') + ' ₽' : '—'; }
  function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—'; }
  function metricBox(label, value) { return '<div class="project-card-metric">' + escape(label) + '<strong>' + escape(value) + '</strong></div>'; }
  function moscowDay() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function paymentsHtml(project) {
    var journal = root.ProjectPaymentJournal;
    if (!journal || typeof journal.getEntries !== 'function') return '<p class="project-card-note">История оплат пока недоступна.</p>';
    var entries = journal.getEntries(project) || [];
    var valid = entries.filter(function (entry) { return entry && Number.isFinite(entry.amount) && entry.currency === 'RUB'; });
    return '<p class="project-card-note">Подтверждённых оплат: ' + valid.length + ' · Всего ' + escape(formatMoney(valid.reduce(function (sum, e) { return sum + e.amount; }, 0))) + '. Только записи, явно связанные с этим проектом.</p>' + (valid.length ? '<table class="project-card-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Источник</th></tr></thead><tbody>' + valid.slice().reverse().map(function (entry) { return '<tr><td>' + escape(entry.date || 'Дата не указана') + '</td><td>' + escape(formatMoney(entry.amount)) + '</td><td>' + escape((entry.sources || [entry.source]).map(function (v) { return ({ cash: 'Касса', crm: 'CRM', journal: 'Журнал' })[v] || 'Журнал'; }).join(' + ')) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="project-card-note">Связанных записей об оплате пока нет.</p>') + (safeFolder(project) ? '<button type="button" data-payment-sync class="project-card-sidebar">Сохранить журнал в папку проекта</button>' : '') + '<div class="project-card-note" data-payment-file></div>';
  }
  function activityHtml(project, data) {
    var tasks = (data.tasks || []).filter(function (task) { return project && task.projectId === project.id; });
    var events = (project && project.events || []).filter(Boolean);
    var tasksHtml = tasks.slice(0, 30).map(function (task) { return '<li>' + escape(task.title || 'Задача') + ' · ' + escape(task.status || '') + (task.dueDate ? ' · ' + escape(task.dueDate) : '') + '</li>'; }).join('');
    var eventsHtml = events.slice().sort(function (a, b) { return text(b.date || b.startDate).localeCompare(text(a.date || a.startDate)); }).slice(0, 15).map(function (event) { return '<li>' + escape(event.date || event.startDate || '') + (event.endDate ? ' — ' + escape(event.endDate) : '') + ' · ' + escape(event.title || event.label || event.text || event.type || 'Отметка') + '</li>'; }).join('');
    return '<h3>Задачи и календарь</h3>' + (tasksHtml ? '<ul class="project-card-list">' + tasksHtml + '</ul>' : '<p class="project-card-note">Связанных задач пока нет.</p>') + (eventsHtml ? '<ul class="project-card-list">' + eventsHtml + '</ul>' : '');
  }
  async function loadMetrics(state, id, populateProfile) {
    var container = state.overlay.querySelector('[data-account-metrics]');
    var request = ++state.metricsRequest;
    if (!id) { container.innerHTML = '<p class="project-card-note">Привяжите аккаунт проекта, чтобы видеть статистику Avito.</p>'; return; }
    var bridge = root.AvitoWorkspaceBridge;
    if (!bridge || typeof bridge.getAccountOverview !== 'function') { container.innerHTML = '<p class="project-card-note">Статистика аккаунта пока недоступна.</p>'; return; }
    container.innerHTML = '<p class="project-card-note">Загружаем реальные показатели аккаунта…</p>';
    try {
      var result = await bridge.getAccountOverview(id);
      ensureScope(state.scope);
      if (current !== state || request !== state.metricsRequest) return;
      if (populateProfile) {
        var profileInput = state.overlay.querySelector('[name="avito_account"]');
        var profileUrl = safeAvitoUrl(result && result.profile && result.profile.profile_url);
        if (profileInput && !profileInput.value.trim() && profileUrl) profileInput.value = profileUrl;
      }
      var data = result && (result.overview || result.snapshot || result) || {};
      var day = moscowDay();
      var today = data.today && data.today.available && data.today.date === day ? data.today : {};
      var history = data.history && data.history.available && data.history.dateTo === day ? data.history.totals || {} : {};
      var advance = data.advance && data.advance.available ? data.advance.balance : null;
      var balanceSection = result && result.balance || data.balance;
      var balances = balanceSection && balanceSection.available ? balanceSection : {};
      var tariff = data.tariff || {};
      container.innerHTML = '<div class="project-card-metrics">' + metricBox('Аванс', advance === null ? '—' : formatMoney(advance)) + metricBox('Кошелёк', balances.real == null ? '—' : formatMoney(balances.real)) + metricBox('Активных объявлений', data.listings && data.listings.available ? metric(data.listings.active) : '—') + metricBox('Расходы сегодня', today.spending == null ? '—' : formatMoney(today.spending)) + metricBox('Контакты сегодня', metric(today.contacts)) + metricBox('Просмотры сегодня', metric(today.views)) + metricBox('Избранное сегодня', metric(today.favorites)) + metricBox('Контакты за 30 дней', metric(history.contacts)) + metricBox('Просмотры за 30 дней', metric(history.views)) + metricBox('Избранное за 30 дней', metric(history.favorites)) + metricBox('Расходы за 30 дней', history.spending == null ? '—' : formatMoney(history.spending)) + '</div><p class="project-card-note">' + escape(data.fetched_at ? 'Получено: ' + new Date(data.fetched_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : 'Показаны только доступные данные API.') + (data.stale ? ' · Последние успешные данные; обновление временно недоступно.' : '') + (tariff.available ? '<br>Тариф: ' + escape(tariff.name || 'Не указан') + (tariff.ends_at ? ' · до ' + escape(new Date(tariff.ends_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })) : '') + (Number.isSafeInteger(tariff.days_remaining) ? ' · осталось дней: ' + tariff.days_remaining : '') : '') + '</p>';
    } catch (_) { if (current === state && request === state.metricsRequest) container.innerHTML = '<p class="project-card-note">Не удалось получить статистику. Привязка сохранена; ключи повторно вводить не нужно.</p>'; }
  }
  function close(force) {
    if (!current) return true;
    if (!force && current.dirty && !root.confirm('Закрыть карту без сохранения изменений?')) return false;
    var state = current; current = null; state.overlay.remove();
    if (state.previousFocus && state.previousFocus.isConnected) state.previousFocus.focus();
    return true;
  }
  async function save(state) {
    var notice = state.overlay.querySelector('[data-notice]');
    try {
      ensureScope(state.scope);
      if (readOnly()) throw new Error('Режим Саши открыт только для просмотра. Сохранение доступно самому Саше.');
      var next = {};
      FIELDS.forEach(function (field) { var input = state.overlay.querySelector('[name="' + field[0] + '"]'); next[field[0]] = input ? input.value : state.before[field[0]]; });
      var changes = changedFields(state.before, next);
      var clients = getClients().map(clone), data = clone(getProjects());
      var project = state.projectId ? (data.projects || []).find(function (p) { return p.id === state.projectId; }) : null;
      var client = state.clientId ? clients.find(function (c) { return c.client_id === state.clientId; }) : state.folderId ? clients.find(function (c) { return c.folderId === state.folderId; }) : null;
      if (state.projectId && !project || !state.projectId && !client) throw new Error('Проект или клиент больше не найден. Откройте карту заново.');
      assertNoConflict(state.before, model(project, client), changes);
      if (changes.avito_connection_id && !accounts.some(function (account) { return account.id === changes.avito_connection_id; })) throw new Error('Этот аккаунт недоступен в текущем режиме. Выберите доступный аккаунт.');
      var crmPatch = Object.assign({}, changes); delete crmPatch.title;
      if (project) {
        project.crmData = Object.assign({}, project.crmData || {}, crmPatch);
        if (Object.prototype.hasOwnProperty.call(changes, 'title')) project.title = changes.title;
        if (Object.prototype.hasOwnProperty.call(changes, 'avito_connection_id')) project.avitoConnectionId = changes.avito_connection_id;
        if (client) Object.assign(client, crmPatch);
      } else {
        Object.assign(client, crmPatch);
        if (Object.prototype.hasOwnProperty.call(changes, 'title') && !Object.prototype.hasOwnProperty.call(changes, 'company')) client.company = changes.title;
      }
      ensureScope(state.scope);
      if (client && Object.keys(changes).length) { if (typeof root.saveCrmClients !== 'function') throw new Error('Сохранение CRM недоступно.'); root.saveCrmClients(clients); }
      if (project && Object.keys(changes).length) { if (typeof root.saveProjectsData !== 'function') throw new Error('Сохранение проектов недоступно.'); root.saveProjectsData(data); }
      if (project && typeof root.rerenderProjectsPreserveScroll === 'function' && root.projectsMode) root.rerenderProjectsPreserveScroll();
      if (project && typeof root.syncProjectToActiveSheet === 'function') root.syncProjectToActiveSheet(project.id, 'project_card_save');
      if (typeof root.fillClientForm === 'function' && (projectForCurrent() || {}).id === state.projectId) root.fillClientForm(Object.assign({}, project && project.crmData || client || {}, { avito_connection_id: project && project.avitoConnectionId || (client || {}).avito_connection_id || '' }));
      state.before = model(project, client); state.dirty = false;
      notice.textContent = 'Сохранено в текущем режиме. Серверная синхронизация выполняется как обычно.';
      refreshSidebar();
    } catch (error) { notice.textContent = error.message || 'Не удалось сохранить изменения.'; }
  }
  function open(projectId) {
    if (!ready()) return;
    if (!close(false)) return;
    var data = getProjects(), project = projectId ? (data.projects || []).find(function (p) { return p.id === projectId; }) : projectForCurrent();
    var client = project ? linkedClient(project, getClients()) : typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    if (!project && !client) { root.alert('Сначала выберите проект или клиента CRM.'); return; }
    style();
    var values = model(project, client), folder = safeFolder(project || client);
    var overlay = document.createElement('div'); overlay.className = 'project-card-overlay';
    overlay.innerHTML = '<section class="project-card-dialog" role="dialog" aria-modal="true" aria-labelledby="projectCardTitle"><header class="project-card-head"><h2 id="projectCardTitle">Карта проекта · ' + escape(values.title || values.company || 'Клиент') + '</h2><button type="button" data-action="close" aria-label="Закрыть карту проекта">✕</button></header><div class="project-card-body"><section class="project-card-section"><div class="project-card-meta">' + (project ? '<span>Статус: ' + escape(project.status || 'Не указан') + '</span><span>Раздел: ' + escape(({ active: 'Активные', sleep: 'Zzz', second_chance: 'Zzz', archive: 'Архив' })[project.zone] || project.zone || 'Активные') + '</span>' : '<span>Клиент CRM</span>') + (folder ? '<a target="_blank" rel="noopener noreferrer" href="' + escape(folder) + '">Папка проекта в Drive ↗</a>' : '<span>Папка Drive ещё не привязана</span>') + '</div><div class="project-card-fields">' + FIELDS.map(function (field) { return fieldHtml(field, values); }).join('') + '</div></section><section class="project-card-section"><h3>Статистика привязанного аккаунта</h3><div data-account-metrics></div></section><section class="project-card-section"><h3>История оплат</h3>' + paymentsHtml(project || client) + '</section><section class="project-card-section">' + activityHtml(project, data) + '</section></div><footer class="project-card-foot"><span class="project-card-note" data-notice role="status"></span><button type="button" data-action="save">Сохранить изменения</button></footer></section>';
    var state = { overlay: overlay, scope: scope(), projectId: project && project.id || '', clientId: client && client.client_id || '', folderId: client && client.folderId || '', before: values, dirty: false, metricsRequest: 0, previousFocus: document.activeElement };
    current = state;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="close"]').onclick = function () { close(false); };
    overlay.querySelector('[data-action="save"]').onclick = function () { save(state); };
    overlay.addEventListener('input', function () { state.dirty = true; });
    overlay.addEventListener('change', function () { state.dirty = true; });
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') {
        var focusable = Array.from(overlay.querySelectorAll('button,input,textarea,select,a[href]')).filter(function (el) { return !el.disabled; });
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    var select = overlay.querySelector('[data-account-select]'); fillAccountSelect(select, values.avito_connection_id, values.title);
    select.onchange = function () {
      var account = accounts.find(function (a) { return a.id === select.value; });
      var input = overlay.querySelector('[name="avito_account"]'), url = account && safeAvitoUrl(account.profile_url);
      if (input && !input.value.trim() && url) input.value = url;
      loadMetrics(state, select.value, true);
    };
    loadAccounts().then(function () { if (current === state && scope() === state.scope) fillAccountSelect(select, select.value, values.title); }).catch(function () {});
    loadMetrics(state, values.avito_connection_id);
    var journal = root.ProjectPaymentJournal;
    var sync = overlay.querySelector('[data-payment-sync]');
    if (sync && journal && typeof journal.syncProjectFile === 'function') {
      sync.onclick = async function () {
        var status = overlay.querySelector('[data-payment-file]');
        try {
          ensureScope(state.scope); sync.disabled = true; status.textContent = 'Сохраняем журнал…';
          var result = await journal.syncProjectFile(project || client);
          if (current !== state || scope() !== state.scope) return;
          status.textContent = result && result.ok ? 'Журнал оплат сохранён: AVITOBOSS-payments.json' : 'Drive недоступен или открыт другой профиль. История оплат в системе сохранена; попробуйте позже.';
        } catch (_) { if (current === state) status.textContent = 'Не удалось обновить файл Drive. История оплат в системе сохранена.'; }
        finally { sync.disabled = false; }
      };
    }
    if (readOnly()) {
      overlay.querySelectorAll('input,textarea,select,[data-action="save"],[data-payment-sync]').forEach(function (element) { element.disabled = true; });
      overlay.querySelector('[data-notice]').textContent = 'Режим Саши: только просмотр. Его данные не изменяются.';
    }
    overlay.querySelector('[data-action="close"]').focus();
  }
  function enhanceRows() {
    document.querySelectorAll('.projects-table-row[data-id] .proj-main-line').forEach(function (line) {
      if (line.querySelector('[data-project-card]')) return;
      var row = line.closest('.projects-table-row[data-id]'), id = row.getAttribute('data-id');
      var button = document.createElement('button'); button.type = 'button'; button.className = 'project-card-row-button';
      button.dataset.projectCard = id; button.title = 'Карта проекта'; button.setAttribute('aria-label', 'Карта проекта'); button.textContent = '▣';
      button.onclick = function (event) { event.stopPropagation(); open(id); };
      line.appendChild(button);
    });
  }
  function init() {
    var saveButton = document.getElementById('saveClientBtn');
    if (!saveButton || document.getElementById('projectCardOpenBtn')) return;
    style();
    var button = document.createElement('button'); button.type = 'button'; button.id = 'projectCardOpenBtn'; button.className = 'project-card-sidebar'; button.textContent = 'Карта проекта'; button.onclick = function () { open(); };
    saveButton.after(button);
    var field = document.createElement('div'); field.className = 'fg project-card-account-field'; field.innerHTML = '<label for="projectAccountSelect">Аккаунт проекта · Avito API</label><select id="projectAccountSelect" aria-label="Привязать аккаунт Avito к проекту"><option value="">Не привязан</option></select><input type="hidden" id="avito_connection_id" value="">';
    var avito = document.getElementById('avito_account');
    if (avito && avito.closest('.row2')) avito.closest('.row2').after(field); else saveButton.before(field);
    var select = document.getElementById('projectAccountSelect'); select.onchange = function () { sidebarAccountChanged(select); };
    var company = document.getElementById('company'); if (company) company.addEventListener('change', refreshSidebar);
    document.addEventListener('avitolog:active-client-changed', refreshSidebar);
    document.addEventListener('avitolog:backend-initial-ready', refreshSidebar);
    document.addEventListener('avitolog:backend-remote-applied', function () { refreshSidebar(); });
    if (typeof root.MutationObserver === 'function') {
      new root.MutationObserver(function (records) {
        if (!records.some(function (record) { return !field.contains(record.target) && !(current && current.overlay.contains(record.target)); })) return;
        if (refreshTimer) root.clearTimeout(refreshTimer);
        refreshTimer = root.setTimeout(function () {
          refreshTimer = null;
          if (current && current.scope !== scope()) close(true);
          if (accountScope && accountScope !== scope()) { accounts = []; accountScope = ''; }
          enhanceRows(); refreshSidebar();
        }, 100);
      }).observe(document.getElementById('mainContent') || document.body, { childList: true, subtree: true });
    }
    enhanceRows(); refreshSidebar();
  }
  var api = { open: open, close: close, refreshSidebar: refreshSidebar };
  root.ProjectCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { normalize: normalize, safeAvitoUrl: safeAvitoUrl, linkedClient: linkedClient, model: model, accountScore: accountScore, rankedAccounts: rankedAccounts, changedFields: changedFields, assertNoConflict: assertNoConflict, paymentsHtml: paymentsHtml, save: save, scope: scope, ready: ready, readOnly: readOnly };
  if (document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
