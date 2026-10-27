(function (root) {
  'use strict';
  var document = root.document;
  var cardScript = document && document.currentScript;
  var contextBase = cardScript && cardScript.src ? new URL('.', cardScript.src).href : '';
  var contextRequest = null;
  var current = null;
  var accounts = [];
  var accountScope = '';
  var accountRequest = null;
  var sidebarRefreshRequest = null;
  var rowClickBound = false;
  var refreshTimer = null;
  var metricsCache = new Map();
  var metricsScope = '';
  var FIELDS = [
    ['title', 'Название проекта', 300], ['company', 'Компания', 300],
    ['contact_name', 'Контактное лицо', 200], ['phone', 'Телефон', 100],
    ['telegram', 'Телеграм', 200], ['vk', 'VK', 500],
    ['avito_account', 'Ссылка Avito клиента', 1000], ['category', 'Ниша', 300],
    ['city', 'География', 1000], ['client_type', 'Тип клиента', 100],
    ['kp_count', 'Объявлений по КП', 100], ['positions', 'Позиции', 5000],
    ['notes', 'Примечания', 20000], ['avito_connection_id', 'Аккаунт проекта', 100], ['project_group_id', 'Группа проекта', 80]
  ];
  var CONTEXT_FIELDS = ['title', 'company', 'contact_name', 'phone', 'telegram', 'vk', 'category', 'city', 'client_type', 'kp_count', 'positions', 'notes'];
  function text(value) { return value == null ? '' : String(value); }
  function hasId(value) { return value != null && String(value) !== ''; }
  function sameId(left, right) { return hasId(left) && hasId(right) && String(left) === String(right); }
  function findById(list, key, id) { return hasId(id) ? (list || []).find(function (item) { return item && sameId(item[key], id); }) || null : null; }
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
    if (hasId(project.crmClientId)) {
      var byId = findById(clients, 'client_id', project.crmClientId);
      if (byId) return byId;
    }
    return findById(clients, 'folderId', project.folderId);
  }
  function model(project, client) {
    var data = Object.assign({}, client || {}, project && project.crmData || {});
    var out = {};
    FIELDS.forEach(function (field) {
      var key = field[0];
      var value = key === 'title' ? project && project.title || data.company : data[key];
      if (key === 'avito_connection_id') value = project && project.avitoConnectionId || value;
      if (key === 'project_group_id') value = root.ProjectGroups ? root.ProjectGroups.selected(project, client) : project && Object.prototype.hasOwnProperty.call(project, 'projectGroupId') ? project.projectGroupId : data.project_group_id;
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
    if (Object.prototype.hasOwnProperty.call(changes, 'project_group_id') && root.ProjectGroups && !root.ProjectGroups.has(changes.project_group_id)) throw new Error('Группа удалена или недоступна. Выберите другую группу.');
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
  async function loadAccounts(force) {
    var expected = scope();
    if (accountRequest && accountRequest.scope === expected) {
      if (!force || accountRequest.force) return accountRequest.promise;
      return accountRequest.promise.catch(function () {}).then(function () { ensureScope(expected); return loadAccounts(true); });
    }
    if (!force && accountScope === expected) return accounts;
    var bridge = root.AvitoWorkspaceBridge;
    if (!bridge || typeof bridge.listAccounts !== 'function') throw new Error('Список аккаунтов недоступен. Откройте модуль «Аккаунты».');
    var request = { scope: expected, force: force === true, promise: null };
    var promise = Promise.resolve().then(function () { return bridge.listAccounts(force === true); }).then(function (list) {
      ensureScope(expected);
      if (accountRequest !== request) throw new Error('Запрос списка аккаунтов устарел.');
      accounts = (Array.isArray(list) ? list : list && list.accounts || []).filter(function (a) { return a && /^(personal|oauth):[a-zA-Z0-9-]{1,80}$/.test(text(a.id)); });
      accountScope = expected;
      return accounts;
    }).finally(function () { if (accountRequest === request) accountRequest = null; });
    request.promise = promise; accountRequest = request;
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
    selected = findById(getProjects().projects, 'id', root._selectedProjectId);
    if (selected) return selected;
    var client = typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    return client && (getProjects().projects || []).find(function (p) { return linkedClient(p, [client]); }) || null;
  }
  function sidebarIdentity() {
    var p = projectForCurrent(), c = typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    return scope() + '|' + (p ? text(p.id) : '') + '|' + (c ? text(hasId(c.client_id) ? c.client_id : c.folderId) : '');
  }
  function refreshSidebar() {
    if (!document) return;
    var select = document.getElementById('projectAccountSelect'), input = document.getElementById('avito_connection_id');
    if (!select || !input) return;
    var refreshButton = document.getElementById('projectAccountRefreshBtn');
    if (refreshButton) { var loading = !!(sidebarRefreshRequest && sidebarRefreshRequest.scope === scope()); refreshButton.disabled = !ready() || loading; refreshButton.textContent = loading ? 'Обновляем…' : 'Обновить'; refreshButton.setAttribute('aria-busy', loading ? 'true' : 'false'); }
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
      if (expected === scope() && identity === sidebarIdentity()) { fillAccountSelect(select, input.value, name); select.title = ''; }
    }).catch(function () { if (expected === scope() && identity === sidebarIdentity()) select.title = 'Список аккаунтов временно недоступен. Текущая привязка сохранена.'; });
  }
  async function refreshSidebarAccounts() {
    if (!document || !ready()) return false;
    var expected = scope(), request = { scope: expected };
    if (sidebarRefreshRequest && sidebarRefreshRequest.scope === expected) return false;
    sidebarRefreshRequest = request;
    var status = document.getElementById('projectAccountRefreshStatus');
    if (status) status.textContent = 'Обновляем список аккаунтов…';
    try {
      var task = loadAccounts(true); refreshSidebar(); await task; ensureScope(expected);
      if (sidebarRefreshRequest !== request) return false;
      refreshSidebar(); if (status) status.textContent = 'Список аккаунтов обновлён.';
      return true;
    } catch (_) {
      if (expected === scope() && sidebarRefreshRequest === request && status) status.textContent = 'Не удалось обновить список. Текущая привязка сохранена; повторите попытку.';
      return false;
    } finally { if (sidebarRefreshRequest === request) { sidebarRefreshRequest = null; if (expected !== scope() && status) status.textContent = ''; refreshSidebar(); } }
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
    element.textContent = [
      '.project-card-overlay{position:fixed;inset:0;z-index:18000;background:#020810bd;backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:2vh 2vw;box-sizing:border-box}.project-card-dialog{width:min(1800px,96vw);height:96vh;height:96dvh;max-height:980px;overflow:hidden;display:flex;flex-direction:column;background:var(--surface,#101b2b);color:var(--text,#eaf2ff);border:1px solid var(--border,#31445b);border-radius:18px;box-shadow:0 24px 90px #0009;font-size:13px}.project-card-dialog *{box-sizing:border-box}',
      '.project-card-head,.project-card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;background:var(--surface2,#132132);flex:none}.project-card-head{border-bottom:1px solid var(--border,#31445b)}.project-card-head h2{font-size:18px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-card-heading{display:flex;gap:11px;align-items:center;min-width:0}.project-card-kicker{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted,#9ab0c9);margin-bottom:3px}.project-card-avatar{width:40px;height:40px;display:grid;place-items:center;flex:none;border-radius:13px;background:linear-gradient(135deg,hsl(var(--avatar-hue) 61% 41%),hsl(calc(var(--avatar-hue) + 38) 57% 25%));color:#fff;border:1px solid #ffffff2e;font-weight:700;font-size:16px;box-shadow:inset 0 1px #ffffff25}',
      '.project-card-head button,.project-card-foot button,.project-card-row-button,.project-card-tool{cursor:pointer;border:1px solid var(--border,#31445b);border-radius:7px;background:var(--surface2,#132132);color:var(--text,#eaf2ff);padding:7px 11px}.project-card-head [data-action="close"]{font-size:21px;line-height:1;padding:6px 10px}.project-card-body{flex:1;min-height:0;padding:13px;display:grid;grid-template-columns:minmax(0,.98fr) minmax(0,1.08fr) minmax(0,1fr);grid-template-rows:minmax(0,1.45fr) minmax(0,1fr);grid-template-areas:"details metrics payments" "context context activity";gap:12px}.project-card-section{min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;border:1px solid var(--border,#31445b);border-radius:12px;padding:13px;scrollbar-width:thin}.project-card-details{grid-area:details}.project-card-avito{grid-area:metrics}.project-card-payments{grid-area:payments}.project-card-activity{grid-area:activity}.project-card-context{grid-area:context}.project-card-section h3{margin:0 0 10px;font-size:13px;letter-spacing:.01em}.project-card-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.project-card-section-title h3{margin:0}.project-card-tool{padding:5px 8px;font-size:10px}.project-card-tool:disabled{opacity:.55;cursor:wait}',
      '.project-card-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px}.project-card-field{display:flex;flex-direction:column;gap:4px;font-size:10px;color:var(--muted,#9ab0c9);min-width:0}.project-card-field input,.project-card-field textarea,.project-card-field select{width:100%;min-width:0;color:var(--text,#eaf2ff);background:var(--bg,#09111d);border:1px solid var(--border,#31445b);border-radius:6px;padding:7px 8px;font:inherit;font-size:12px}.project-card-field textarea{resize:vertical;min-height:62px}.project-card-field-wide{grid-column:1/-1}.project-card-meta{display:flex;flex-wrap:wrap;gap:7px 12px;font-size:10px;color:var(--muted,#9ab0c9);margin:0 0 10px}.project-card-meta a{color:var(--accent,#59d8ff)}.project-card-disclosure{margin-top:10px;border-top:1px solid var(--border,#31445b);padding-top:9px}.project-card-disclosure>summary{cursor:pointer;font-size:11px;color:var(--accent,#59d8ff);padding:2px 0}.project-card-disclosure[open]>summary{margin-bottom:10px}.project-card-disclosure .project-card-fields{margin-top:6px}',
      '.project-card-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.project-card-avito .project-card-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.project-card-metric{min-width:0;padding:9px 10px;background:var(--surface2,#132132);border:1px solid #ffffff05;border-radius:8px;font-size:10px;color:var(--muted,#9ab0c9);line-height:1.35}.project-card-metric strong{display:block;font-size:19px;line-height:1.2;margin-top:5px;color:var(--text,#eaf2ff);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.project-card-note{font-size:10px;color:var(--muted,#9ab0c9);line-height:1.45;margin:8px 0}.project-card-note:empty{display:none}.project-card-empty{display:grid;align-content:center;min-height:150px;text-align:center;padding:20px;color:var(--muted,#9ab0c9);font-size:12px;line-height:1.7}.project-card-list{margin:7px 0;padding-left:17px;font-size:11px;line-height:1.65}.project-card-table{width:100%;border-collapse:collapse;font-size:11px}.project-card-table td,.project-card-table th{text-align:left;padding:7px 5px;border-bottom:1px solid var(--border,#31445b);overflow-wrap:anywhere}.project-card-table-wrap{max-height:220px;overflow:auto}.project-card-foot{border-top:1px solid var(--border,#31445b);padding:10px 18px}.project-card-foot [data-action="save"]{background:var(--accent,#09bcaa);color:#031518;font-weight:700;white-space:nowrap}.project-card-foot .project-card-note{margin:0}',
      '.project-card-trend{margin:11px 0 7px}.project-card-trend figcaption{font-size:10px;color:var(--muted,#9ab0c9);display:flex;justify-content:space-between;gap:8px}.project-card-bars{height:73px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;align-items:end;margin-top:8px}.project-card-bar-column{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;font-size:9px;color:var(--muted,#9ab0c9)}.project-card-bar{display:block;width:75%;min-height:2px;border-radius:4px 4px 2px 2px;background:linear-gradient(0deg,#218b89,var(--accent,#49d7bf))}.project-card-bar-negative{background:#d88279}.project-card-progress-line{display:flex;justify-content:space-between;gap:10px;font-size:11px}.project-card-progress-line strong{color:var(--accent,#59d8ff)}.project-card-progress{display:block;width:100%;height:5px;overflow:hidden;border-radius:9px;background:var(--bg,#09111d);margin:8px 0}.project-card-progress span{display:block;height:100%;border-radius:9px;background:var(--accent,#09bcaa)}.project-card-task-counts{display:flex;flex-wrap:wrap;gap:5px 12px;font-size:10px;color:var(--muted,#9ab0c9)}.project-card-step-list{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.project-card-step{font-size:9px;padding:4px 6px;border:1px solid var(--border,#31445b);border-radius:5px;color:var(--muted,#9ab0c9)}.project-card-step.is-done{border-color:#20b6a34d;color:var(--accent,#59d8ff);background:#20b6a30b}.project-card-upcoming{margin:10px 0 0;padding:0;list-style:none}.project-card-upcoming li{display:flex;gap:8px;justify-content:space-between;border-top:1px solid var(--border,#31445b);padding:6px 0;font-size:10px}.project-card-upcoming li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-card-upcoming time{white-space:nowrap;color:var(--muted,#9ab0c9)}',
      '.project-card-row-button{padding:1px 4px;font-size:11px;line-height:16px;flex:none}.project-card-sidebar{display:block;width:100%;margin-top:9px;padding:12px;border:1px solid var(--border,#31445b);background:var(--surface2,#132132);color:var(--accent,#59d8ff);border-radius:8px;font-weight:700;cursor:pointer}.project-card-payments .project-card-sidebar{font-size:10px;padding:7px;margin-top:7px}.project-card-account-field select{width:100%;padding:8px;background:var(--surface2,#132132);border:1px solid var(--border,#31445b);border-radius:7px;color:var(--text,#eaf2ff);font-size:12px}',
      '@media(max-width:1100px){.project-card-dialog{width:96vw;max-height:none}.project-card-body{overflow:auto;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto;grid-template-areas:"details metrics" "payments activity" "context context";align-content:start}.project-card-section{overflow:visible}.project-card-context{min-height:260px}.project-card-head h2{font-size:16px}}@media(max-width:720px){.project-card-overlay{padding:4px}.project-card-dialog{width:100%;height:calc(100dvh - 8px);border-radius:11px}.project-card-head,.project-card-foot{padding:10px}.project-card-body{padding:8px;gap:8px;grid-template-columns:1fr;grid-template-areas:"details" "metrics" "payments" "activity" "context"}.project-card-section{padding:11px}.project-card-head h2{font-size:14px}.project-card-kicker{font-size:9px}.project-card-avatar{width:34px;height:34px;border-radius:10px;font-size:14px}.project-card-foot{align-items:flex-start}.project-card-foot [data-action="save"]{font-size:11px}.project-card-avito .project-card-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:360px){.project-card-avito .project-card-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    ].join('');
    element.textContent += '.project-card-context{display:block}.project-card-notes-pane{height:100%;min-width:0;min-height:0}.project-card-notes-pane .project-card-field{height:calc(100% - 25px)}.project-card-notes-pane textarea{flex:1;min-height:120px;resize:vertical}.project-card-payments .project-card-payment-value{display:block;width:100%;padding:0;border:0;border-radius:3px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:text}.project-card-payment-value:focus-visible{outline:1px solid var(--accent,#59d8ff);outline-offset:3px}.project-card-payments [data-manual-payment]{box-sizing:border-box;width:100%;min-width:0;margin-top:5px;padding:0;border:0;border-bottom:1px solid var(--accent,#59d8ff);border-radius:0;background:transparent;color:var(--text,#eaf2ff);font:inherit;font-size:19px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums}.project-card-payments [data-manual-payment]:focus{outline:none}.project-card-payments [data-manual-payment][hidden],.project-card-payment-value[hidden]{display:none}.project-card-payment-value:disabled{opacity:1;cursor:default}';
    element.textContent += '@media(max-width:1100px){.project-card-body{grid-template-rows:none;grid-auto-rows:max-content}}';
    element.textContent += '@media(min-width:1101px) and (max-height:820px){.project-card-head{padding:10px 15px}.project-card-foot{padding:8px 15px}.project-card-body{padding:10px;gap:10px}.project-card-section{padding:10px}.project-card-section h3,.project-card-section-title{margin-bottom:8px}.project-card-fields{gap:6px 8px}.project-card-field{gap:3px}.project-card-field input,.project-card-field textarea,.project-card-field select{padding:5px 7px;font-size:11px}.project-card-metric{padding:7px 8px}.project-card-metric strong{font-size:18px;margin-top:4px}.project-card-meta{margin-bottom:8px}.project-card-disclosure{margin-top:8px;padding-top:7px}.project-card-trend{margin:8px 0 5px}.project-card-bars{height:65px;margin-top:5px}.project-card-context .project-context{font-size:11px;gap:7px}.project-card-context .project-context textarea{min-height:64px;padding:6px}.project-card-context .project-context-note{font-size:10px}.project-card-context .project-context-actions{margin:4px 0}.project-card-context .project-context button{padding:4px 7px;font-size:10px}}';
    element.textContent += '.project-card-account-controls{display:flex;gap:6px;align-items:center}.project-card-account-controls select{flex:1;min-width:0}.project-card-account-refresh{flex:none;padding:8px;border:1px solid var(--border,#31445b);border-radius:7px;background:var(--surface2,#132132);color:var(--text,#eaf2ff);font:inherit;font-size:11px;cursor:pointer}.project-card-account-refresh:disabled{opacity:.6;cursor:wait}.project-card-account-status{display:block;font-size:10px;line-height:1.4;color:var(--muted,#9ab0c9)}.project-card-account-status:empty{display:none}';
    element.textContent += [
      '@media(min-width:1101px){.project-card-body{grid-template-columns:minmax(0,.86fr) minmax(0,1.65fr) minmax(0,.86fr)}}.project-card-avito{container-type:inline-size}.project-avito-dashboard{--avito-blue:65,166,255;--avito-purple:173,116,255;--avito-teal:18,207,187;font-variant-numeric:tabular-nums}.project-avito-period{font-size:9px;color:var(--muted,#9ab0c9);margin:-3px 0 8px}.project-avito-primary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.project-avito-metric{--tone:var(--avito-blue);border:1px solid rgba(var(--tone),.3);background:linear-gradient(145deg,rgba(var(--tone),.12),rgba(var(--tone),.015));border-radius:10px;padding:10px;min-width:0}.project-avito-favorites{--tone:var(--avito-purple)}.project-avito-views{--tone:var(--avito-teal)}.project-avito-metric h4{display:flex;align-items:center;gap:6px;margin:0;font-size:11px;font-weight:600}.project-avito-icon{width:17px;height:17px;flex:none;color:rgb(var(--tone,var(--avito-blue)))}.project-avito-total{display:block;font-size:clamp(25px,4.5cqw,38px);font-weight:750;line-height:1.05;margin:7px 0 3px;letter-spacing:-.03em;overflow-wrap:anywhere}.project-avito-subtitle{font-size:9px;color:var(--muted,#9ab0c9)}',
      '.project-avito-columns{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;align-items:end;padding-top:7px}.project-avito-column{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;outline-offset:2px;border-radius:3px}.project-avito-plot{height:47px;width:100%;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid var(--border,#31445b)}.project-avito-bar{display:block;width:74%;max-width:54px;border-radius:4px 4px 0 0;background:linear-gradient(0deg,rgba(var(--tone),.65),rgb(var(--tone)));box-shadow:inset 0 1px 0 #ffffff38}.project-avito-value{font-size:9px;color:var(--text,#eaf2ff);white-space:nowrap;margin-bottom:3px}.project-avito-date{font-size:8px;color:var(--muted,#9ab0c9);white-space:nowrap;margin-top:4px}.project-avito-column.is-unknown .project-avito-bar{width:45%;height:1px!important;background:none;border-top:1px dashed var(--muted,#9ab0c9);box-shadow:none}.project-avito-column.is-zero .project-avito-bar{height:1px!important;box-shadow:none;opacity:.5}.project-avito-five{display:flex;justify-content:space-between;gap:4px;margin-top:7px;padding-top:6px;border-top:1px solid rgba(var(--tone),.18);font-size:9px;color:var(--muted,#9ab0c9)}.project-avito-five b{color:var(--text,#eaf2ff)}',
      '.project-avito-secondary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0}.project-avito-secondary>div{min-width:0;padding:8px 9px;border:1px solid var(--border,#31445b);border-radius:8px;background:var(--surface2,#132132)}.project-avito-secondary span{display:block;font-size:9px;color:var(--muted,#9ab0c9)}.project-avito-secondary strong{display:block;font-size:20px;line-height:1.2;margin-top:4px;overflow-wrap:anywhere}.project-avito-secondary small{display:block;font-size:8px;margin-top:3px;color:var(--muted,#9ab0c9)}.project-avito-secondary .project-avito-active{color:#2fc79b}',
      '.project-avito-bottom{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(135px,1fr);gap:9px}.project-avito-chart,.project-avito-summary{min-width:0;border:1px solid var(--border,#31445b);border-radius:9px;padding:9px;background:var(--bg,#09111d)}.project-avito-chart-head{display:flex;justify-content:space-between;gap:5px;align-items:center;font-size:10px;margin-bottom:4px}.project-avito-tabs{display:flex;gap:3px}.project-avito-tabs button{display:grid;place-items:center;width:25px;height:23px;padding:3px;cursor:pointer;border:1px solid var(--border,#31445b);background:var(--surface2,#132132);border-radius:5px;color:var(--muted,#9ab0c9)}.project-avito-tabs button[aria-pressed="true"]{background:rgba(var(--tone),.15);border-color:rgba(var(--tone),.6);color:rgb(var(--tone))}.project-avito-chart{--tone:var(--avito-blue)}.project-avito-chart .project-avito-plot{height:79px;background:repeating-linear-gradient(to top,transparent 0,transparent 25px,var(--border,#31445b) 26px,transparent 27px)}.project-avito-chart .project-avito-columns{gap:10px;padding-top:7px}.project-avito-chart .project-avito-value{font-size:10px}.project-avito-chart .project-avito-date{font-size:9px}.project-avito-summary h4{font-size:10px;margin:0 0 6px}.project-avito-summary ul{margin:0;padding:0;list-style:none}.project-avito-summary li{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border,#31445b);font-size:9px}.project-avito-summary li:last-child{border-bottom:0}.project-avito-summary li span{display:flex;align-items:center;gap:5px;color:var(--muted,#9ab0c9)}.project-avito-summary b{white-space:nowrap;font-size:11px}.project-avito-summary .project-avito-icon{width:12px;height:12px}',
      '.project-avito-footer{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font-size:9px;color:var(--muted,#9ab0c9);margin-top:8px}.project-avito-footer b{color:var(--text,#eaf2ff)}.project-avito-status{flex-basis:100%;line-height:1.4}.project-avito-status:empty{display:none}.project-avito-tariff{flex-basis:100%}@container(max-width:560px){.project-avito-metric{padding:7px}.project-avito-metric h4{font-size:10px;gap:4px}.project-avito-primary{gap:5px}.project-avito-columns{gap:3px}.project-avito-date{font-size:7px}.project-avito-value{font-size:8px}.project-avito-bottom{grid-template-columns:1fr}.project-avito-summary ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px 10px}.project-avito-summary li{flex-wrap:wrap;justify-content:flex-start;border:0;padding:2px 0}.project-avito-secondary{gap:5px}.project-avito-secondary>div{padding:7px}.project-avito-secondary strong{font-size:17px}.project-avito-chart .project-avito-plot{height:90px}}'
    ].join('');
    element.textContent += '@media(min-width:1101px){.project-card-body{grid-template-rows:minmax(0,1.9fr) minmax(0,1fr)}}.project-avito-plot{height:35px}.project-avito-bar{min-height:2px}.project-avito-column.is-zero .project-avito-bar,.project-avito-column.is-unknown .project-avito-bar{min-height:0}.project-avito-chart.project-avito-favorites{--tone:var(--avito-purple)}.project-avito-chart.project-avito-views{--tone:var(--avito-teal)}@container(min-width:421px) and (max-width:560px){.project-avito-bottom{grid-template-columns:minmax(0,1.8fr) minmax(125px,1fr)}.project-avito-summary ul{display:block}.project-avito-summary li{flex-wrap:nowrap;justify-content:space-between;border-bottom:1px solid var(--border,#31445b);padding:4px 0}.project-avito-chart .project-avito-plot{height:79px}}@media(min-width:1101px) and (max-height:820px){.project-avito-period{margin-bottom:5px;font-size:8px}.project-avito-metric{padding:7px}.project-avito-metric h4{font-size:10px}.project-avito-total{font-size:25px;margin:4px 0 1px}.project-avito-subtitle{font-size:8px}.project-avito-columns{padding-top:3px}.project-avito-plot{height:30px}.project-avito-value{font-size:8px;margin-bottom:2px}.project-avito-date{font-size:7px;margin-top:3px}.project-avito-five{font-size:8px;margin-top:4px;padding-top:4px}.project-avito-secondary{margin:6px 0;gap:6px}.project-avito-secondary>div{padding:6px}.project-avito-secondary span{font-size:8px}.project-avito-secondary strong{font-size:17px;margin-top:2px}.project-avito-secondary small{font-size:7px;margin-top:2px}.project-avito-chart,.project-avito-summary{padding:7px}.project-avito-chart-head,.project-avito-summary h4{font-size:9px}.project-avito-chart .project-avito-plot{height:47px}.project-avito-chart .project-avito-columns{padding-top:3px;gap:7px}.project-avito-chart .project-avito-value{font-size:8px}.project-avito-chart .project-avito-date{font-size:8px}.project-avito-summary li{padding:3px 0;font-size:8px}.project-avito-summary b{font-size:10px}.project-avito-tabs button{width:23px;height:21px}.project-avito-footer{margin-top:6px;font-size:8px;gap:3px 9px}}';
    element.textContent += '.project-avito-tabs [data-avito-chart="favorites"]{--tone:var(--avito-purple)}.project-avito-tabs [data-avito-chart="views"]{--tone:var(--avito-teal)}.project-avito-metric{padding:8px}.project-avito-total{font-size:clamp(25px,4cqw,34px);margin:6px 0 3px}.project-avito-period-total{display:flex;justify-content:space-between;gap:4px;font-size:8px;color:var(--muted,#9ab0c9);line-height:1.3}.project-avito-period-total b{color:var(--text,#eaf2ff);margin-left:3px}.project-avito-chart .project-avito-plot{height:62px}@media(min-width:1101px){.project-card-body{grid-template-rows:minmax(0,2.05fr) minmax(0,1fr)}}@media(min-width:1101px) and (max-height:820px){.project-card-body{grid-template-rows:minmax(0,2.4fr) minmax(0,1fr)}.project-avito-metric{padding:7px}.project-avito-total{font-size:25px;margin:4px 0 2px}.project-avito-chart .project-avito-plot{height:40px}.project-avito-period-total{font-size:7px}}';
    element.textContent += '@media(min-width:1101px){.project-card-body{grid-template-rows:minmax(0,2.15fr) minmax(0,1fr)}}@media(min-width:1101px) and (max-height:820px){.project-card-body{grid-template-rows:minmax(0,2.4fr) minmax(0,1fr)}.project-avito-summary li{padding-top:2px;padding-bottom:2px}}';
    element.textContent += '.project-card-foot{display:grid;grid-template-columns:minmax(0,1fr) 180px;align-items:center;gap:12px;height:56px;min-height:56px;padding:8px 14px}.project-card-foot [data-notice],.project-card-foot [data-notice]:empty{display:block;min-width:0;min-height:16px;max-height:36px;overflow:auto;overflow-wrap:anywhere;line-height:16px;font-size:10px;margin:0}.project-card-foot [data-action="save"]{grid-column:2;justify-self:end;width:180px;min-width:180px;max-width:180px;white-space:nowrap}.project-card-foot [data-notice][data-error="true"]{color:#e56c75}.project-card-payment-value strong[hidden]{display:none}@media(max-width:720px){.project-card-foot{grid-template-columns:minmax(0,1fr) 155px;gap:8px;height:60px;min-height:60px;padding:8px 10px}.project-card-foot [data-action="save"]{width:155px;min-width:155px;max-width:155px;font-size:11px}.project-card-foot [data-notice]{font-size:9px;line-height:14px;max-height:36px}}';
    document.head.appendChild(element);
  }
  function fieldHtml(field, values) {
    var key = field[0], multiline = key === 'notes' || key === 'positions';
    if (key === 'avito_connection_id') return '<label class="project-card-field project-card-field-wide">Аккаунт проекта<select name="avito_connection_id" data-account-select title="Подходящий по названию аккаунт предложен первым. Аккаунт заявки CRM не меняется."></select></label>';
    if (key === 'project_group_id') return root.ProjectGroups ? root.ProjectGroups.fieldHtml(values[key]) : '<label class="project-card-field project-card-field-wide">Группа проекта<select name="project_group_id" disabled><option value="' + escape(values[key]) + '">' + escape(values[key] || 'Без группы') + '</option></select></label>';
    return '<label class="project-card-field' + (multiline || key === 'title' ? ' project-card-field-wide' : '') + '">' + escape(field[1]) + (multiline ? '<textarea rows="3"' : '<input type="text"') + ' name="' + key + '" maxlength="' + field[2] + '"' + (multiline ? '>' + escape(values[key]) + '</textarea>' : ' value="' + escape(values[key]) + '">') + '</label>';
  }
  function formatMoney(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('ru-RU') + ' ₽' : '—'; }
  function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—'; }
  function metricBox(label, value) { return '<div class="project-card-metric">' + escape(label) + '<strong>' + escape(value) + '</strong></div>'; }
  function moscowDay() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function paymentDateLabel(value) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    return parts ? parts[3] + '.' + parts[2] + '.' + parts[1] : '—';
  }
  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
    var date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function paymentTrend(entries, asOf) {
    if (!validDay(asOf)) return [];
    var end = new Date(asOf.slice(0, 7) + '-01T00:00:00Z');
    var months = Array.from({ length: 6 }, function (_, index) {
      var date = new Date(end); date.setUTCMonth(end.getUTCMonth() - 5 + index);
      return { month: date.toISOString().slice(0, 7), amount: 0, count: 0 };
    });
    (entries || []).forEach(function (entry) {
      if (!entry || entry.currency !== 'RUB' || !Number.isFinite(entry.amount) || !validDay(entry.date) || entry.date > asOf) return;
      var month = months.find(function (item) { return item.month === entry.date.slice(0, 7); });
      if (month) { month.amount += entry.amount; month.count++; }
    });
    return months;
  }
  function paymentTrendHtml(entries) {
    var months = paymentTrend(entries, moscowDay());
    if (!months.some(function (month) { return month.count; })) return '<p class="project-card-note">За последние 6 месяцев нет подтверждённых оплат с корректной датой для графика.</p>';
    var maximum = Math.max.apply(Math, months.map(function (month) { return Math.abs(month.amount); })) || 1;
    var labels = months.map(function (month) { return month.month + ': ' + formatMoney(month.amount); }).join('; ');
    return '<figure class="project-card-trend"><figcaption><span>Оплаты по месяцам</span><span>6 месяцев · ₽</span></figcaption><div class="project-card-bars" role="img" aria-label="' + escape(labels) + '">' + months.map(function (month) {
      var label = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' }).format(new Date(month.month + '-01T00:00:00Z'));
      return '<div class="project-card-bar-column" title="' + escape(month.month + ': ' + formatMoney(month.amount) + ' · записей: ' + month.count) + '"><span class="project-card-bar' + (month.amount < 0 ? ' project-card-bar-negative' : '') + '" style="height:' + Math.max(2, Math.round(Math.abs(month.amount) / maximum * 54)) + 'px"></span><span>' + escape(label) + '</span></div>';
    }).join('') + '</div></figure>';
  }
  function reportedFinancialSummary(project) {
    var store = root.ProjectContextStore;
    if (!project || !hasId(project.id) || !store || typeof store.getFinancialSummary !== 'function') return null;
    try {
      var summary = store.getFinancialSummary({ projectId: project.id, folderId: project.folderId || project.crmData && project.crmData.folderId || '', scope: scope() });
      return summary && summary.kind === 'reported_total' && summary.confirmed === true && summary.currency === 'RUB' && Number.isFinite(summary.totalPaid) && summary.totalPaid >= 0 && Number.isSafeInteger(summary.promotionCycles) && summary.promotionCycles >= 0 && Number.isFinite(new Date(summary.recordedAt).getTime()) ? summary : null;
    } catch (_) { return null; }
  }
  function reportedPaymentRecency(project) {
    var store = root.ProjectContextStore;
    if (!project || !hasId(project.id) || !store || typeof store.getPaymentRecency !== 'function') return null;
    try {
      var recency = store.getPaymentRecency({ projectId: project.id, folderId: project.folderId || project.crmData && project.crmData.folderId || '', scope: scope() });
      if (!recency || recency.kind !== 'reported_last_payment' || recency.confirmed !== true || !validDay(recency.lastPaymentDate) || recency.lastPaymentDate > moscowDay() || !Number.isFinite(new Date(recency.recordedAt).getTime())) return null;
      return recency;
    } catch (_) { return null; }
  }
  function manualPaymentMoney(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12 && Math.round(value * 100) / 100 === value;
  }
  function manualPaymentCycles(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100000; }
  function manualPaymentValues(project, asOf) {
    var source = project && project.manualPaymentsV1, result = {};
    if (!source || typeof source !== 'object' || Array.isArray(source) || source.version !== 1) return result;
    if (manualPaymentMoney(source.totalPaid)) result.totalPaid = source.totalPaid;
    if (manualPaymentCycles(source.promotionCycles)) result.promotionCycles = source.promotionCycles;
    if (validDay(source.lastPaymentDate) && source.lastPaymentDate <= asOf) result.lastPaymentDate = source.lastPaymentDate;
    return result;
  }
  function paymentEditorValues(project) {
    var asOf = moscowDay(), manual = manualPaymentValues(project, asOf);
    var report = reportedFinancialSummary(project), recency = reportedPaymentRecency(project);
    var journal = root.ProjectPaymentJournal, summary = null, entries = [];
    try {
      if (journal && typeof journal.getSummary === 'function') summary = journal.getSummary(project, asOf);
      entries = summary && Array.isArray(summary.entries) ? summary.entries : journal && typeof journal.getEntries === 'function' ? journal.getEntries(project) || [] : [];
    } catch (_) { summary = null; entries = []; }
    var valid = entries.filter(function (entry) { return entry && entry.currency === 'RUB' && Number.isFinite(entry.amount); });
    var hasLedger = summary && summary.count > 0 || valid.length > 0;
    var ledgerTotal = summary && Number.isFinite(summary.total) ? summary.total : valid.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
    var total = Object.prototype.hasOwnProperty.call(manual, 'totalPaid') ? manual.totalPaid : report ? report.totalPaid : hasLedger && manualPaymentMoney(ledgerTotal) ? ledgerTotal : '';
    var cycles = Object.prototype.hasOwnProperty.call(manual, 'promotionCycles') ? manual.promotionCycles : report ? report.promotionCycles : summary && manualPaymentCycles(summary.promotionCycles) ? summary.promotionCycles : '';
    var date = manual.lastPaymentDate || recency && recency.lastPaymentDate || summary && summary.lastPaymentDate || '';
    return { totalPaid: text(total), promotionCycles: text(cycles), lastPaymentDate: validDay(date) && date <= asOf ? date : '' };
  }
  function parseManualPaymentField(key, value, asOf) {
    var raw = text(value).trim();
    if (!raw) return '';
    if (key === 'lastPaymentDate') {
      if (!validDay(raw) || raw > asOf) throw new Error('Укажите корректную дату последней оплаты, не позднее сегодняшней.');
      return raw;
    }
    if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(key === 'totalPaid' ? 'Укажите сумму оплаты числом, не более двух знаков после запятой.' : 'Укажите целое число циклов.');
    var number = Number(raw.replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
    if (key === 'totalPaid' ? !manualPaymentMoney(number) : !manualPaymentCycles(number)) throw new Error(key === 'totalPaid' ? 'Сумма должна быть от 0 до 1 000 000 000 000 ₽.' : 'Количество циклов должно быть целым числом от 0 до 100 000.');
    return number;
  }
  function parseManualPayments(before, form, previousOverride, asOf) {
    var day = asOf === undefined ? moscowDay() : asOf;
    if (!validDay(day)) throw new Error('Не удалось определить текущую дату.');
    var result = manualPaymentValues({ manualPaymentsV1: previousOverride }, day), changed = false;
    ['totalPaid', 'promotionCycles', 'lastPaymentDate'].forEach(function (key) {
      var next = parseManualPaymentField(key, form && form[key], day);
      var prior = parseManualPaymentField(key, before && before[key], day);
      if (next === prior) return;
      changed = true;
      if (next === '') delete result[key]; else result[key] = next;
    });
    if (!changed) return null;
    return Object.assign({ version: 1 }, result, { updatedAt: new Date().toISOString() });
  }
  function paymentMetricBox(label, display, key, value) {
    var date = key === 'lastPaymentDate', disabled = readOnly() ? ' disabled' : '';
    return '<div class="project-card-metric"><button type="button" class="project-card-payment-value" data-payment-edit="' + key + '" aria-label="Изменить: ' + escape(label) + '" title="Нажмите, чтобы изменить"' + disabled + '>' + escape(label) + '<strong>' + escape(display) + '</strong></button><input hidden name="payment_' + key + '" data-manual-payment="' + key + '" aria-label="' + escape(label) + '" type="' + (date ? 'date' : 'text') + '"' + (date ? ' max="' + moscowDay() + '"' : ' inputmode="decimal"') + ' value="' + escape(value) + '"' + disabled + '></div>';
  }
  function finishPaymentEditor(state, input, cancel, restoreFocus) {
    var edit = input.__paymentEditBefore;
    if (!edit) return;
    var key = input.getAttribute('data-manual-payment'), button = input.closest('.project-card-metric').querySelector('[data-payment-edit]');
    try {
      var value = cancel ? null : parseManualPaymentField(key, input.value, moscowDay());
      if (cancel) {
        input.value = edit.value;
        if (!edit.touched) delete state.manualTouched[key];
        state.dirty = edit.dirty;
      }
      button.querySelector('strong').textContent = cancel ? edit.display : value === '' ? '—' : key === 'totalPaid' ? formatMoney(value) : key === 'lastPaymentDate' ? paymentDateLabel(value) : metric(value);
      var notice = state.overlay.querySelector('[data-notice]');
      if (input.__paymentValidationError && notice.textContent === input.__paymentValidationError) notice.textContent = '';
      input.setCustomValidity(''); delete input.__paymentEditBefore; delete input.__paymentValidationError;
      input.hidden = true; button.querySelector('strong').hidden = false;
      if (restoreFocus) button.focus();
    } catch (error) {
      input.__paymentValidationError = error.message;
      input.setCustomValidity(error.message);
      state.overlay.querySelector('[data-notice]').textContent = error.message;
    }
  }
  function bindPaymentEditors(state) {
    state.overlay.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('[data-payment-edit]');
      if (!button || state.saving || readOnly() || !ready() || state.scope !== scope()) return;
      var key = button.getAttribute('data-payment-edit'), input = state.overlay.querySelector('[name="payment_' + key + '"]');
      if (!input || !input.hidden) return;
      input.__paymentEditBefore = { value: input.value, display: button.querySelector('strong').textContent, touched: !!state.manualTouched[key], dirty: state.dirty };
      button.querySelector('strong').hidden = true; input.hidden = false; input.focus();
      if (input.type !== 'date') input.select();
    });
    state.overlay.addEventListener('focusout', function (event) {
      var input = event.target;
      if (input.getAttribute && input.getAttribute('data-manual-payment') && input.__paymentEditBefore) finishPaymentEditor(state, input, false, false);
    });
  }
  function paymentSummaryHtml(project) {
    var journal = root.ProjectPaymentJournal;
    var available = journal && typeof journal.getEntries === 'function';
    var summary = available && typeof journal.getSummary === 'function' ? journal.getSummary(project, moscowDay()) : null;
    var entries = summary && Array.isArray(summary.entries) ? summary.entries : available ? journal.getEntries(project) || [] : [];
    var valid = entries.filter(function (entry) { return entry && Number.isFinite(entry.amount) && entry.currency === 'RUB'; });
    var ledgerTotal = summary ? summary.total : valid.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
    var manual = manualPaymentValues(project, moscowDay()), hasManual = Object.keys(manual).length > 0;
    var report = reportedFinancialSummary(project), recency = reportedPaymentRecency(project), total = Object.prototype.hasOwnProperty.call(manual, 'totalPaid') ? manual.totalPaid : report ? report.totalPaid : ledgerTotal;
    var lastDate = manual.lastPaymentDate || (recency ? recency.lastPaymentDate : summary && summary.lastPaymentDate);
    var manualDate = !!manual.lastPaymentDate || !!recency;
    var daysSince = manualDate ? Math.round((Date.parse(moscowDay() + 'T00:00:00Z') - Date.parse(lastDate + 'T00:00:00Z')) / 86400000) : summary && summary.daysSinceLastPayment;
    var cycles = summary && Number.isSafeInteger(summary.promotionCycles) && summary.promotionCycles >= 0 ? metric(summary.promotionCycles) : 'Не определено';
    if (summary && summary.unknownCyclePayments > 0 && Number.isSafeInteger(summary.knownPromotionCycles) && summary.knownPromotionCycles > 0) cycles = 'Не менее ' + metric(summary.knownPromotionCycles);
    if (report) cycles = metric(report.promotionCycles);
    if (Object.prototype.hasOwnProperty.call(manual, 'promotionCycles')) cycles = metric(manual.promotionCycles);
    var count = summary && Number.isSafeInteger(summary.count) && summary.count >= 0 ? summary.count : valid.length;
    var values = paymentEditorValues(project);
    var cards = '<div class="project-card-metrics">' + paymentMetricBox(manualDate ? 'Последняя оплата · вручную' : report ? 'Последняя известная оплата' : 'Последняя оплата', paymentDateLabel(lastDate), 'lastPaymentDate', values.lastPaymentDate) + metricBox(manualDate ? 'Дней после указанной оплаты' : report ? 'Дней после известной оплаты' : 'Дней после оплаты', metric(daysSince)) + paymentMetricBox('Всего оплачено', formatMoney(total), 'totalPaid', values.totalPaid) + paymentMetricBox('Циклов продвижения', cycles, 'promotionCycles', values.promotionCycles) + '</div>';
    if (hasManual) cards += '<p class="project-card-note">Ручные значения имеют приоритет. Они не создают платежи и не меняют кассу или журнал.</p>';
    if (recency && !manual.lastPaymentDate) cards += '<p class="project-card-note">Дата последней оплаты подтверждена вручную · ' + escape(new Date(recency.recordedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })) + '. Это уточнение даты, не новый платёж.' + (summary && summary.lastPaymentDate && summary.lastPaymentDate !== recency.lastPaymentDate ? ' Последняя известная дата в журнале: ' + escape(paymentDateLabel(summary.lastPaymentDate)) + '.' : '') + '</p>';
    if (report && (!Object.prototype.hasOwnProperty.call(manual, 'totalPaid') || !Object.prototype.hasOwnProperty.call(manual, 'promotionCycles'))) cards += '<p class="project-card-note">Общий итог · подтверждено вручную · ' + escape(new Date(report.recordedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })) + '. Отдельно в журнале датированных оплат: ' + escape(formatMoney(ledgerTotal)) + '. Итог не прибавляется к журналу; даты и график ниже относятся только к его записям.</p>';
    if (!available) cards += '<p class="project-card-note">История оплат пока недоступна.</p>';
    var cycleNote = summary && summary.unknownCyclePayments > 0 ? ' У части платежей цикл не указан: число переводов не равно числу продвижений.' : '';
    return cards + paymentTrendHtml(valid) + '<p class="project-card-note">Подтверждённых платежей: ' + count + '. Только записи, явно связанные с этим проектом.' + cycleNote + '</p>' + (valid.length ? '<details class="project-card-disclosure"><summary>Все платежи · ' + valid.length + '</summary><div class="project-card-table-wrap"><table class="project-card-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Источник</th></tr></thead><tbody>' + valid.slice().reverse().map(function (entry) { return '<tr><td>' + escape(entry.date || 'Дата не указана') + '</td><td>' + escape(formatMoney(entry.amount)) + '</td><td>' + escape((entry.sources || [entry.source]).map(function (v) { return ({ cash: 'Касса', crm: 'CRM', journal: 'Журнал' })[v] || 'Журнал'; }).join(' + ')) + '</td></tr>'; }).join('') + '</tbody></table></div></details>' : '<p class="project-card-note">Связанных записей об оплате пока нет.</p>');
  }
  function paymentsHtml(project) {
    var journal = root.ProjectPaymentJournal;
    return '<div data-payment-summary>' + paymentSummaryHtml(project) + '</div>' + (journal && typeof journal.getEntries === 'function' && safeFolder(project) ? '<button type="button" data-payment-sync class="project-card-sidebar">Сохранить журнал в папку проекта</button>' : '') + '<div class="project-card-note" data-payment-file></div>';
  }
  function refreshPaymentSummary() {
    var state = current;
    if (!state || state.scope !== scope() || !ready()) return;
    var target = hasId(state.projectId) ? findById(getProjects().projects, 'id', state.projectId) : findById(getClients(), 'client_id', state.clientId) || findById(getClients(), 'folderId', state.folderId);
    var container = state.overlay.querySelector('[data-payment-summary]');
    if (Object.keys(state.manualTouched || {}).length || container && container.querySelector && container.querySelector('[data-manual-payment]:not([hidden])')) return;
    if (target && container) { container.innerHTML = paymentSummaryHtml(target); syncPaymentEditor(state, target); }
  }
  function activityHtml(project, data) {
    var tasks = (data.tasks || []).filter(function (task) { return project && sameId(task.projectId, project.id); });
    var events = (project && project.events || []).filter(Boolean);
    var today = moscowDay(), done = tasks.filter(function (task) { return task.status === 'done'; }).length;
    var overdue = tasks.filter(function (task) { return task.status !== 'done' && (task.status === 'overdue' || validDay(task.dueDate) && task.dueDate < today); }).length;
    var statuses = { new: 'Новая', working: 'В работе', done: 'Готово', waiting: 'Ожидает', overdue: 'Просрочено' };
    var percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    var tasksHtml = tasks.map(function (task) { return '<li>' + escape(task.title || 'Задача') + ' · ' + escape(statuses[task.status] || task.status || 'Новая') + (task.dueDate ? ' · ' + escape(task.dueDate) : '') + '</li>'; }).join('');
    var orderedEvents = events.slice().sort(function (a, b) { return text(a.date || a.startDate).localeCompare(text(b.date || b.startDate)); });
    var eventsHtml = orderedEvents.map(function (event) { return '<li>' + escape(event.date || event.startDate || '') + (event.endDate ? ' — ' + escape(event.endDate) : '') + ' · ' + escape(event.title || event.label || event.text || ({ active_range: 'Автозагрузка', launch_range: 'Запуск' })[event.type] || event.type || 'Отметка') + '</li>'; }).join('');
    var upcoming = tasks.filter(function (task) { return task.status !== 'done'; }).sort(function (a, b) { return text(a.dueDate || '9999').localeCompare(text(b.dueDate || '9999')); }).slice(0, 3);
    var path = project && project.clientPath;
    var stages = [['autoload', 'Автозагрузка'], ['analytics', 'Аналитика'], ['texts', 'Тексты'], ['packaging', 'Упаковка'], ['portfolio', 'Портфолио']];
    var activeRanges = events.filter(function (event) { return validDay(event.startDate) && validDay(event.endDate) && event.startDate <= today && event.endDate >= today; }).length;
    var nextEvent = orderedEvents.find(function (event) { return validDay(event.date || event.startDate) && (event.date || event.startDate) >= today; });
    return '<h3>Задачи и календарь</h3><div class="project-card-progress-line"><span>Выполнено задач: ' + done + ' / ' + tasks.length + '</span><strong>' + (tasks.length ? percent + '%' : 'Нет задач') + '</strong></div><div class="project-card-progress" role="progressbar" aria-label="Выполненные задачи" aria-valuemin="0" aria-valuemax="' + Math.max(1, tasks.length) + '" aria-valuenow="' + done + '"><span style="width:' + percent + '%"></span></div><div class="project-card-task-counts"><span>Открыто: ' + (tasks.length - done) + '</span><span>Просрочено: ' + overdue + '</span><span>Отметок календаря: ' + events.length + '</span></div>' + (path ? '<div class="project-card-step-list" aria-label="Отмеченные этапы проекта">' + stages.map(function (stage) { return '<span class="project-card-step' + (path[stage[0]] ? ' is-done' : '') + '" title="' + (path[stage[0]] ? 'Отмечено в проекте' : 'Не отмечено') + '">' + (path[stage[0]] ? '✓ ' : '') + stage[1] + '</span>'; }).join('') + '</div>' : '') + (upcoming.length ? '<ul class="project-card-upcoming">' + upcoming.map(function (task) { return '<li><span title="' + escape(task.title) + '">' + escape(task.title || 'Задача') + '</span><time>' + escape(task.dueDate || 'Без срока') + '</time></li>'; }).join('') + '</ul>' : '<p class="project-card-note">' + (tasks.length ? 'Все связанные задачи выполнены.' : 'Связанных задач пока нет.') + '</p>') + '<p class="project-card-note">' + (activeRanges ? 'Действующих диапазонов календаря: ' + activeRanges + '.' : 'На сегодня нет действующих диапазонов.') + (nextEvent ? ' Ближайшая отметка: ' + escape(paymentDateLabel(nextEvent.date || nextEvent.startDate)) + '.' : '') + '</p>' + (tasksHtml || eventsHtml ? '<details class="project-card-disclosure"><summary>Все задачи и календарь</summary>' + (tasksHtml ? '<ul class="project-card-list">' + tasksHtml + '</ul>' : '') + (eventsHtml ? '<ul class="project-card-list">' + eventsHtml + '</ul>' : '') + '</details>' : '');
  }
  function accountAnalytics(result, asOf) {
    var day = asOf === undefined ? moscowDay() : asOf;
    if (typeof day !== 'string' || !validDay(day)) throw new RangeError('invalid_analytics_date');
    function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    function amount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
    function balance(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
    function timezone(section) { return section.timezone === undefined || section.timezone === 'Europe/Moscow'; }
    function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : ''; }
    var outer = object(result), data = object(outer.overview || outer.snapshot || outer);
    var history = object(data.history), today = object(data.today);
    var keys = ['contacts', 'favorites', 'views', 'spending'];
    var end = Date.parse(day + 'T00:00:00Z');
    var dates = Array.from({ length: 30 }, function (_, index) { return new Date(end - (29 - index) * 86400000).toISOString().slice(0, 10); });
    var byDate = Object.create(null), duplicate = Object.create(null);
    var usableHistory = history.available === true && timezone(history);
    if (usableHistory && Array.isArray(history.days)) {
      history.days.forEach(function (value) {
        var row = object(value);
        if (typeof row.date !== 'string' || !validDay(row.date) || row.date < dates[0] || row.date > day) return;
        if (Object.prototype.hasOwnProperty.call(byDate, row.date)) duplicate[row.date] = true;
        else byDate[row.date] = row;
      });
    }
    var usableToday = today.available === true && today.date === day && timezone(today);
    var days = dates.map(function (date) {
      var row = !duplicate[date] && byDate[date] || {}, next = { date: date };
      keys.forEach(function (key) {
        next[key] = amount(row[key]);
        var currentValue = usableToday && date === day ? amount(today[key]) : null;
        if (currentValue !== null) next[key] = currentValue;
      });
      return next;
    });
    function total(rows, key) {
      if (rows.some(function (row) { return row[key] === null; })) return null;
      var value = rows.reduce(function (sum, row) { return sum + row[key]; }, 0);
      return Number.isFinite(value) ? value : null;
    }
    var exactPeriod = usableHistory && history.dateFrom === dates[0] && history.dateTo === day;
    var totals = {}, fiveTotals = {}, todayValues = {}, lastFive = days.slice(-5), suppliedTotals = object(history.totals);
    keys.forEach(function (key) {
      var supplied = exactPeriod ? amount(suppliedTotals[key]) : null;
      totals[key] = supplied !== null ? supplied : total(days, key);
      fiveTotals[key] = total(lastFive, key);
      todayValues[key] = days[days.length - 1][key];
    });
    var advance = object(data.advance), wallet = object(outer.balance || data.balance), listings = object(data.listings), tariff = object(data.tariff);
    return {
      dateFrom: dates[0], dateTo: day, days: lastFive, totals: totals, fiveTotals: fiveTotals, today: todayValues,
      advance: advance.available === true ? balance(advance.balance) : null,
      wallet: wallet.available === true ? balance(wallet.real) : null,
      active: listings.available === true && Number.isSafeInteger(listings.active) && listings.active >= 0 ? listings.active : null,
      fetchedAt: timestamp(data.fetched_at),
      stale: data.stale === true || [history, today, advance, wallet, listings].some(function (section) { return section.stale === true; }) || usableHistory && history.dateTo !== day || today.available === true && today.date !== day,
      tariff: tariff.available === true ? {
        available: true, name: typeof tariff.name === 'string' ? tariff.name.trim().slice(0, 200) : '',
        ends_at: timestamp(tariff.ends_at) || null,
        days_remaining: Number.isSafeInteger(tariff.days_remaining) && tariff.days_remaining >= 0 ? tariff.days_remaining : null
      } : { available: false, name: '', ends_at: null, days_remaining: null }
    };
  }
  function accountIcon(kind) {
    var paths = {
      contacts: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
      favorites: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
      views: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      spending: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h5M6 5V3h12"/>',
      active: '<path d="M4 9h5l10-5v16L9 15H4V9Zm2 6 2 6h4l-2-6"/>'
    };
    return '<svg class="project-avito-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[kind] || paths.views) + '</svg>';
  }
  function accountColumns(days, key, large) {
    var maximum = Math.max.apply(Math, [1].concat(days.map(function (day) { return Number.isFinite(day[key]) ? day[key] : 0; })));
    var label = { contacts: 'Контакты', favorites: 'Избранное', views: 'Просмотры' }[key];
    var description = days.map(function (day) { return paymentDateLabel(day.date) + ': ' + (day[key] === null ? 'нет данных' : metric(day[key])); }).join('; ');
    return '<div class="project-avito-columns" role="img" aria-label="' + escape(label + '. ' + description) + '">' + days.map(function (day) {
      var value = day[key], known = Number.isFinite(value), size = known && value > 0 ? Math.max(2, Math.round(value / maximum * 100)) : 0;
      return '<div class="project-avito-column' + (!known ? ' is-unknown' : value === 0 ? ' is-zero' : '') + '" title="' + escape(day.date + ' · ' + label + ': ' + (known ? metric(value) : 'нет данных')) + '"><span class="project-avito-value">' + escape(metric(value)) + '</span><div class="project-avito-plot"><span class="project-avito-bar" style="height:' + size + '%"></span></div><span class="project-avito-date">' + escape(paymentDateLabel(day.date).slice(0, 5)) + '</span></div>';
    }).join('') + '</div>';
  }
  function accountAnalyticsHtml(data, selected) {
    var metrics = [{ key: 'contacts', label: 'Контакты' }, { key: 'favorites', label: 'Избранное' }, { key: 'views', label: 'Просмотры' }];
    var active = metrics.find(function (item) { return item.key === selected; }) || metrics[0];
    function money(value) { return Number.isFinite(value) ? formatMoney(value) : '—'; }
    var rows = metrics.concat([{ key: 'spending', label: 'Расходы' }, { key: 'active', label: 'Активные' }]);
    var stamp = data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    var tariff = data.tariff || {};
    var tariffLabel = tariff.available ? 'Тариф: ' + (tariff.name || 'Не указан') + (tariff.ends_at ? ' · до ' + new Date(tariff.ends_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '') + (Number.isSafeInteger(tariff.days_remaining) ? ' · осталось дней: ' + tariff.days_remaining : '') : '';
    return '<div class="project-avito-dashboard"><div class="project-avito-period">30 дней · ' + escape(paymentDateLabel(data.dateFrom) + ' — ' + paymentDateLabel(data.dateTo)) + ' · МСК</div><div class="project-avito-primary">' + metrics.map(function (item) {
      return '<article class="project-avito-metric project-avito-' + item.key + '"><h4>' + accountIcon(item.key) + escape(item.label) + '</h4><strong class="project-avito-total">' + escape(metric(data.totals[item.key])) + '</strong><div class="project-avito-period-total"><span>за 30 дней</span><span title="Сумма только при наличии всех пяти дней">5 дней: <b>' + escape(metric(data.fiveTotals[item.key])) + '</b></span></div>' + accountColumns(data.days, item.key, false) + '</article>';
    }).join('') + '</div><div class="project-avito-secondary"><div><span>Расходы · 30 дней</span><strong>' + escape(money(data.totals.spending)) + '</strong></div><div><span>Активные объявления</span><strong class="project-avito-active">' + escape(metric(data.active)) + '</strong></div><div><span>Получено сегодня · контакты</span><strong>' + escape(metric(data.today.contacts)) + '</strong><small>Избр. ' + escape(metric(data.today.favorites)) + ' · Просм. ' + escape(metric(data.today.views)) + '</small></div></div><div class="project-avito-bottom"><section class="project-avito-chart project-avito-' + active.key + '"><div class="project-avito-chart-head"><strong>5 дней · ' + escape(active.label) + '</strong><div class="project-avito-tabs" role="group" aria-label="Показатель графика">' + metrics.map(function (item) { return '<button type="button" data-avito-chart="' + item.key + '" aria-label="График: ' + item.label + '" title="' + item.label + '" aria-pressed="' + (item.key === active.key) + '">' + accountIcon(item.key) + '</button>'; }).join('') + '</div></div>' + accountColumns(data.days, active.key, true) + '</section><section class="project-avito-summary"><h4>Итоги за 30 дней</h4><ul>' + rows.map(function (item) {
      var value = item.key === 'active' ? metric(data.active) : item.key === 'spending' ? money(data.totals.spending) : metric(data.totals[item.key]);
      return '<li class="project-avito-' + item.key + '"' + (item.key === 'active' ? ' title="Текущее количество активных объявлений, не сумма за период"' : '') + '><span>' + accountIcon(item.key) + escape(item.label) + '</span><b>' + escape(value) + '</b></li>';
    }).join('') + '</ul></section></div><div class="project-avito-footer"><span>Аванс <b>' + escape(money(data.advance)) + '</b></span><span>Кошелёк <b>' + escape(money(data.wallet)) + '</b></span><span>Расходы сегодня <b>' + escape(money(data.today.spending)) + '</b></span>' + (stamp ? '<span>Обновлено ' + escape(stamp) + ' МСК</span>' : '') + (tariffLabel ? '<span class="project-avito-tariff">' + escape(tariffLabel) + '</span>' : '') + '<span class="project-avito-status" data-account-status role="status">' + (data.stale ? 'Последние успешные данные API. Часть показателей может обновляться с задержкой.' : '') + '</span></div></div>';
  }
  function renderAccountMetrics(state, model) {
    var container = state.overlay.querySelector('[data-account-metrics]');
    state.analyticsModel = model;
    container.innerHTML = accountAnalyticsHtml(model, state.analyticsMetric);
    container.querySelectorAll('[data-avito-chart]').forEach(function (button) {
      button.onclick = function () {
        if (current !== state || state.scope !== scope()) return;
        state.analyticsMetric = button.getAttribute('data-avito-chart');
        renderAccountMetrics(state, state.analyticsModel);
        var selected = container.querySelector('[data-avito-chart="' + state.analyticsMetric + '"]');
        if (selected) selected.focus();
      };
    });
  }
  function accountAccessLost(code) {
    return /^(auth_required|subject_mismatch|organization_forbidden|account_forbidden|permission_denied|forbidden|account_disconnected|account_changed|reconnect_required)$/.test(text(code));
  }
  function resetAccountMetrics(event) {
    if (event && event.detail && event.detail.reason === 'transport_unavailable') return;
    metricsCache.clear(); metricsScope = '';
    var state = current;
    if (!state) return;
    state.analyticsModel = null; ++state.metricsRequest;
    if (state.scope !== scope()) return;
    var container = state.overlay.querySelector('[data-account-metrics]');
    if (container) container.innerHTML = '<p class="project-card-note">Связь с аккаунтами сброшена. Проверьте вход и нажмите «Обновить».</p>';
  }
  async function loadMetrics(state, id, populateProfile) {
    var container = state.overlay.querySelector('[data-account-metrics]');
    var request = ++state.metricsRequest;
    if (metricsScope !== state.scope) { metricsCache.clear(); metricsScope = state.scope; }
    if (state.metricsId !== id) { state.analyticsModel = null; state.metricsId = id; }
    if (!id) { container.innerHTML = '<p class="project-card-note">Привяжите аккаунт проекта, чтобы видеть статистику Avito.</p>'; return; }
    var bridge = root.AvitoWorkspaceBridge;
    if (!bridge || typeof bridge.getAccountOverview !== 'function') { container.innerHTML = '<p class="project-card-note">Статистика аккаунта пока недоступна.</p>'; return; }
    if (!state.analyticsModel && metricsCache.has(id)) renderAccountMetrics(state, accountAnalytics(metricsCache.get(id), moscowDay()));
    var status = container.querySelector('[data-account-status]');
    if (state.analyticsModel && status) status.textContent = 'Обновляем данные…';
    else container.innerHTML = '<p class="project-card-note">Загружаем реальные показатели аккаунта…</p>';
    try {
      var response = bridge.getAccountOverview(id);
      // The bridge may synchronously reset its previous profile before starting this request.
      request = state.metricsRequest;
      var result = await response;
      ensureScope(state.scope);
      if (current !== state || request !== state.metricsRequest) return;
      var overview = result && (result.overview || result.snapshot || result) || {};
      if (accountAccessLost(overview.error)) throw new Error(overview.error);
      if (populateProfile) {
        var profileInput = state.overlay.querySelector('[name="avito_account"]');
        var profileUrl = safeAvitoUrl(result && result.profile && result.profile.profile_url);
        if (profileInput && !profileInput.value.trim() && profileUrl) profileInput.value = profileUrl;
      }
      metricsCache.set(id, result);
      if (metricsCache.size > 32) metricsCache.delete(metricsCache.keys().next().value);
      renderAccountMetrics(state, accountAnalytics(result, moscowDay()));
    } catch (error) {
      if (current !== state || state.scope !== scope() || request !== state.metricsRequest) return;
      if (accountAccessLost(error && (error.code || error.message))) {
        if (/^(auth_required|subject_mismatch|organization_forbidden)$/.test(error.code || error.message)) metricsCache.clear();
        else metricsCache.delete(id);
        state.analyticsModel = null;
        container.innerHTML = '<p class="project-card-note">Нет доступа к статистике аккаунта. Проверьте его подключение во вкладке «Аккаунты».</p>';
        return;
      }
      var message = 'Не удалось обновить статистику. Привязка сохранена; ключи повторно вводить не нужно.';
      var lastStatus = container.querySelector('[data-account-status]');
      if (state.analyticsModel && lastStatus) lastStatus.textContent = message + ' Показаны последние полученные данные.';
      else container.innerHTML = '<p class="project-card-note">' + message + '</p>';
    }
  }
  function formValues(state) {
    var values = {};
    FIELDS.forEach(function (field) { var input = state.overlay.querySelector('[name="' + field[0] + '"]'); values[field[0]] = input ? input.value : state.before[field[0]]; });
    return values;
  }
  function syncChatContacts(event) {
    var state = current, clientId = event && event.detail && event.detail.clientId;
    if (!state || state.saving || !state.overlay.isConnected || !ready() || readOnly() || state.scope !== scope() || !sameId(state.clientId, clientId)) return;
    var clients = getClients(), client = findById(clients, 'client_id', clientId);
    if (!client) return;
    var project = hasId(state.projectId) ? findById(getProjects().projects, 'id', state.projectId) : null;
    if (hasId(state.projectId) && (!project || !sameId((linkedClient(project, clients) || {}).client_id, clientId))) return;
    var latest = model(project, client);
    var isInsight = event.type === 'avitolog:chat-insights-updated';
    (isInsight ? ['notes', 'positions', 'city', 'client_type'] : ['phone', 'telegram', 'vk']).forEach(function (key) {
      var input = state.overlay.querySelector('[name="' + key + '"]');
      if (!input || input.disabled || document.activeElement === input || state.contactTouched && state.contactTouched[key] || !text(latest[key]).trim()) return;
      if (isInsight ? text(input.value) !== text(state.before[key]) : text(input.value).trim() || text(state.before[key]).trim()) return;
      input.value = latest[key];
      state.before[key] = latest[key];
    });
  }
  function manualPaymentForm(state) {
    var values = {};
    ['totalPaid', 'promotionCycles', 'lastPaymentDate'].forEach(function (key) {
      var input = state.overlay.querySelector('[name="payment_' + key + '"]');
      values[key] = input ? input.value : state.manualBefore && state.manualBefore[key] || '';
    });
    return values;
  }
  function syncPaymentEditor(state, project) {
    var values = paymentEditorValues(project);
    state.manualBefore = state.manualBefore || {};
    Object.keys(values).forEach(function (key) {
      if (state.manualTouched && state.manualTouched[key]) return;
      var input = state.overlay.querySelector('[name="payment_' + key + '"]');
      if (input) input.value = values[key];
      state.manualBefore[key] = values[key];
    });
  }
  function applyContextFields(state, patch) {
    ensureScope(state.scope);
    if (current !== state || readOnly()) throw new Error('Карта больше недоступна для редактирования.');
    var before = formValues(state), proposed = {}, baseline = {};
    FIELDS.forEach(function (field) { baseline[field[0]] = ''; proposed[field[0]] = ''; });
    CONTEXT_FIELDS.forEach(function (key) { if (patch && Object.prototype.hasOwnProperty.call(patch, key)) proposed[key] = text(patch[key]); });
    changedFields(baseline, proposed);
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'title') && !proposed.title.trim()) throw new Error('Укажите название проекта.');
    var changes = {};
    CONTEXT_FIELDS.forEach(function (key) { if (patch && Object.prototype.hasOwnProperty.call(patch, key) && before[key] !== proposed[key].trim()) changes[key] = proposed[key].trim(); });
    Object.keys(changes).forEach(function (key) { var input = state.overlay.querySelector('[name="' + key + '"]'); if (input) input.value = changes[key]; });
    if (Object.keys(changes).length) { state.dirty = true; state.overlay.querySelector('[data-notice]').textContent = 'Предложения внесены в черновик. Проверьте поля и сохраните изменения.'; }
    return changes;
  }
  function loadContextModule() {
    if (root.ProjectContextStore) return Promise.resolve();
    if (contextRequest) return contextRequest;
    function script(file) {
      return new Promise(function (resolve, reject) {
        var element = document.createElement('script');
        element.src = contextBase ? new URL(file, contextBase).href : 'js/' + file;
        element.onload = resolve;
        element.onerror = function () { if (typeof element.remove === 'function') element.remove(); reject(new Error('Не удалось загрузить модуль контекста.')); };
        document.head.appendChild(element);
      });
    }
    contextRequest = Promise.resolve().then(function () { return root.ProjectContextStore ? null : script('project-context-store.js?v=20261022-context3'); }).then(function () {
      if (!root.ProjectContextStore) throw new Error('История ручных итогов недоступна.');
    }).catch(function (error) { contextRequest = null; throw error; });
    return contextRequest;
  }
  async function mountContext(state, title) {
    try {
      await loadContextModule();
      if (current !== state || state.scope !== scope() || !ready()) return;
      var project = hasId(state.projectId) ? findById(getProjects().projects, 'id', state.projectId) : findById(getClients(), 'client_id', state.clientId) || findById(getClients(), 'folderId', state.folderId);
      if (project) syncPaymentEditor(state, project);
      refreshPaymentSummary();
    } catch (_) { /* Existing notes and manual fields remain usable without the legacy summary reader. */ }
  }
  function close(force) {
    if (!current) return true;
    if (current.saving && !force) { current.overlay.querySelector('[data-notice]').textContent = 'Сохраняем изменения. Дождитесь завершения.'; return false; }
    var contextDirty = current.contextPanel && typeof current.contextPanel.isDirty === 'function' && current.contextPanel.isDirty();
    if (!force && (current.dirty || contextDirty) && !root.confirm('Закрыть карту без сохранения изменений?')) return false;
    var state = current; current = null;
    if (state.contextPanel && typeof state.contextPanel.destroy === 'function') state.contextPanel.destroy();
    state.overlay.remove();
    if (state.previousFocus && state.previousFocus.isConnected) state.previousFocus.focus();
    return true;
  }
  async function saveAndExit(state) {
    if (current !== state || state.saving) return { ok: false, error: 'Сохранение уже выполняется или карта закрыта.' };
    var notice = state.overlay.querySelector('[data-notice]'), button = state.overlay.querySelector('[data-action="save"]');
    var controls = typeof state.overlay.querySelectorAll === 'function' ? Array.from(state.overlay.querySelectorAll('input,textarea,select,[data-project-groups-manage]')).map(function(element) { return { element: element, disabled: element.disabled }; }) : [];
    state.saving = true; button.disabled = true; button.textContent = 'Сохраняем…'; button.setAttribute('aria-busy', 'true');
    controls.forEach(function(item) { item.element.disabled = true; });
    try {
      ensureScope(state.scope);
      var result = await save(state);
      if (!result || result.ok !== true) throw new Error(result && result.error || 'Не удалось сохранить все изменения. Проверьте записи и повторите.');
      ensureScope(state.scope);
      if (current !== state) throw new Error('Карта больше недоступна для редактирования.');
      if (state.dirty) throw new Error('В карте остались несохранённые изменения. Проверьте записи и повторите.');
      close(true);
      return { ok: true };
    } catch (error) {
      if (current === state) notice.textContent = error.message || 'Не удалось сохранить все изменения.';
      return { ok: false, error: error.message || 'Не удалось сохранить все изменения.' };
    } finally {
      state.saving = false;
      if (current === state) { controls.forEach(function(item) { item.element.disabled = item.disabled || readOnly() || !ready(); }); button.disabled = readOnly() || !ready(); button.textContent = 'Сохранить и выйти'; button.setAttribute('aria-busy', 'false'); }
    }
  }
  function verifyCardWrite(state, base, target, changes) {
    ensureScope(state.scope);
    try {
      var key = typeof root.AVITOLOG_KEY === 'function' ? root.AVITOLOG_KEY(base) : base;
      var value = JSON.parse(root.localStorage.getItem(key));
      var rows = base === 'avitolog_projects' ? value && value.projects : value;
      if (!Array.isArray(rows)) throw new Error('storage_unconfirmed');
      var saved = base === 'avitolog_projects' ? findById(rows, 'id', target.id) : hasId(target.client_id) ? findById(rows, 'client_id', target.client_id) : findById(rows, 'folderId', target.folderId);
      if (!saved || Object.keys(changes).some(function (field) {
        if (field === 'manualPaymentsV1') return JSON.stringify(saved.manualPaymentsV1) !== JSON.stringify(changes[field]);
        var actual = base !== 'avitolog_projects' || field === 'title' ? saved[field] : field === 'avito_connection_id' ? saved.avitoConnectionId : field === 'project_group_id' ? saved.projectGroupId : saved.crmData && saved.crmData[field];
        return text(actual) !== text(changes[field]) || base === 'avitolog_projects' && field === 'avito_connection_id' && text(saved.crmData && saved.crmData[field]) !== text(changes[field]);
      })) throw new Error('storage_unconfirmed');
    } catch (_) { throw new Error('Хранилище не подтвердило сохранение. Черновик оставлен в карте; повторите сохранение.'); }
    ensureScope(state.scope);
  }
  async function save(state, onlyFields) {
    var notice = state.overlay.querySelector('[data-notice]');
    try {
      ensureScope(state.scope);
      if (readOnly()) throw new Error('Режим Саши открыт только для просмотра. Сохранение доступно самому Саше.');
      var form = formValues(state), next = Object.assign({}, state.before), selected = Array.isArray(onlyFields) ? onlyFields : null;
      FIELDS.forEach(function (field) { if (!selected || selected.indexOf(field[0]) >= 0) next[field[0]] = form[field[0]]; });
      var changes = changedFields(state.before, next);
      var drafts = FIELDS.filter(function (field) { return text(form[field[0]]).trim() !== text(state.before[field[0]]); }).map(function (field) { return field[0]; });
      var clients, data, project, client, paymentTarget, manual, crmPatch;
      function prepare(freshProjects, freshClients) {
      data = clone(freshProjects); clients = freshClients.map(clone);
      project = findById(data.projects, 'id', state.projectId);
      client = hasId(state.clientId) ? findById(clients, 'client_id', state.clientId) : findById(clients, 'folderId', state.folderId);
      if (hasId(state.projectId) && !project || !hasId(state.projectId) && !client) throw new Error('Проект или клиент больше не найден. Откройте карту заново.');
      paymentTarget = project || client; var paymentBaseline = Object.assign({}, state.manualBefore || {});
      Object.keys(state.manualTouched || {}).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(paymentTarget.manualPaymentsV1 || {}, key)) paymentBaseline[key] = '';
      });
      manual = !selected && state.manualBefore ? parseManualPayments(paymentBaseline, manualPaymentForm(state), paymentTarget.manualPaymentsV1, moscowDay()) : null;
      if (manual && JSON.stringify(paymentTarget.manualPaymentsV1 || null) !== JSON.stringify(state.manualOverrideBefore || null) && JSON.stringify(paymentTarget.manualPaymentsV1 || null) !== JSON.stringify(state.unconfirmedManual || null)) throw new Error('Итоги оплат изменились в другом окне. Откройте карту заново; ваш черновик пока оставлен здесь.');
      assertNoConflict(Object.assign({}, state.before, state.draftBaselines || {}), model(project, client), changes);
      if (changes.avito_connection_id && !accounts.some(function (account) { return account.id === changes.avito_connection_id; })) throw new Error('Этот аккаунт недоступен в текущем режиме. Выберите доступный аккаунт.');
      if (changes.project_group_id && data.projectGroupsV1 && !data.projectGroupsV1.groups.some(function(g) { return g.id === changes.project_group_id && !g.deleted; })) throw new Error('Группа удалена. Выберите другую группу.');
      crmPatch = Object.assign({}, changes); delete crmPatch.title;
      if (project) {
        project.crmData = Object.assign({}, project.crmData || {}, crmPatch);
        if (Object.prototype.hasOwnProperty.call(changes, 'title')) project.title = changes.title;
        if (Object.prototype.hasOwnProperty.call(changes, 'avito_connection_id')) project.avitoConnectionId = changes.avito_connection_id;
        if (Object.prototype.hasOwnProperty.call(changes, 'project_group_id')) { project.projectGroupId = changes.project_group_id; project.projectGroupSource = 'manual'; }
        if (client) Object.assign(client, crmPatch);
      } else {
        Object.assign(client, crmPatch);
        if (Object.prototype.hasOwnProperty.call(changes, 'title') && !Object.prototype.hasOwnProperty.call(changes, 'company')) client.company = changes.title;
      }
      if (manual) { paymentTarget.manualPaymentsV1 = manual; if (confirmed) state.unconfirmedManual = clone(manual); }
      }
      var confirmed = root.AVITOLOG_BACKEND_SERVER_ONLY && typeof root.__avitologBackendCommitStatePatch === 'function';
      if (root.AVITOLOG_BACKEND_SERVER_ONLY && !confirmed) throw new Error('Обновите страницу: модуль подтверждённого сохранения ещё не загружен.');
      if (confirmed) {
        var projectKey = typeof root.AVITOLOG_KEY === 'function' ? root.AVITOLOG_KEY('avitolog_projects') : 'avitolog_projects';
        var clientKey = typeof root.AVITOLOG_KEY === 'function' ? root.AVITOLOG_KEY('avitolog_clients') : 'avitolog_clients';
        await root.__avitologBackendCommitStatePatch(hasId(state.projectId) ? [projectKey, clientKey] : [clientKey], function(values) {
          ensureScope(state.scope);
          prepare(values[projectKey] ? JSON.parse(values[projectKey]) : { projects: [] }, values[clientKey] ? JSON.parse(values[clientKey]) : []);
          var updates = {};
          if (client && (Object.keys(changes).length || !project && manual)) updates[clientKey] = JSON.stringify(clients);
          if (project && (Object.keys(changes).length || manual)) updates[projectKey] = JSON.stringify(data);
          return updates;
        });
      } else {
      prepare(getProjects(), getClients());
      ensureScope(state.scope);
      if (client && (Object.keys(changes).length || !project && manual)) {
        if (typeof root.saveCrmClients !== 'function') throw new Error('Сохранение CRM недоступно.');
        root.saveCrmClients(clients);
        var clientChanges = Object.assign({}, crmPatch);
        if (!project && manual) clientChanges.manualPaymentsV1 = manual;
        if (!project && Object.prototype.hasOwnProperty.call(changes, 'title') && !Object.prototype.hasOwnProperty.call(changes, 'company')) clientChanges.company = changes.title;
        verifyCardWrite(state, 'avitolog_clients', client, clientChanges);
      }
      ensureScope(state.scope);
      if (project && (Object.keys(changes).length || manual)) {
        if (typeof root.saveProjectsData !== 'function') throw new Error('Сохранение проектов недоступно.');
        if (manual) state.unconfirmedManual = clone(manual);
        root.saveProjectsData(data);
        verifyCardWrite(state, 'avitolog_projects', project, Object.assign({}, changes, manual ? { manualPaymentsV1: manual } : {}));
      }
      }
      ensureScope(state.scope);
      var previousBefore = state.before, previousDraftBaselines = state.draftBaselines || {};
      state.before = model(project, client); state.draftBaselines = {};
      FIELDS.forEach(function (field) {
        var key = field[0], input = state.overlay.querySelector('[name="' + key + '"]');
        var retained = selected && selected.indexOf(key) < 0 && drafts.indexOf(key) >= 0;
        if (input && !retained) input.value = state.before[key];
        if (input && retained && text(input.value).trim() !== text(state.before[key])) state.draftBaselines[key] = Object.prototype.hasOwnProperty.call(previousDraftBaselines, key) ? previousDraftBaselines[key] : previousBefore[key];
      });
      var remaining = formValues(state);
      if (!selected && state.manualBefore) {
        state.manualTouched = {}; state.manualOverrideBefore = clone(paymentTarget.manualPaymentsV1 || null); state.unconfirmedManual = null;
        syncPaymentEditor(state, paymentTarget);
      }
      state.dirty = FIELDS.some(function (field) { return text(remaining[field[0]]).trim() !== text(state.before[field[0]]); });
      notice.textContent = state.dirty ? 'Выбранные поля сохранены. Другие изменения в форме остаются черновиком.' : 'Сохранено в текущем режиме. Серверная синхронизация выполняется как обычно.';
      // Optional view refreshes cannot invalidate writes that storage has already confirmed.
      try { if (project && typeof root.rerenderProjectsPreserveScroll === 'function' && root.projectsMode) root.rerenderProjectsPreserveScroll(); } catch (_) {}
      try { if (project && typeof root.syncProjectToActiveSheet === 'function') root.syncProjectToActiveSheet(project.id, 'project_card_save'); } catch (_) {}
      try { if (typeof root.fillClientForm === 'function' && sameId((projectForCurrent() || {}).id, state.projectId)) root.fillClientForm(Object.assign({}, project && project.crmData || client || {}, { avito_connection_id: project && project.avitoConnectionId || (client || {}).avito_connection_id || '' })); } catch (_) {}
      try { refreshSidebar(); } catch (_) {}
      return { ok: true };
    } catch (error) {
      var draft = formValues(state);
      state.dirty = state.dirty || FIELDS.some(function (field) { return text(draft[field[0]]).trim() !== text(state.before && state.before[field[0]]); });
      notice.textContent = error.message || 'Не удалось сохранить изменения.'; return { ok: false, error: notice.textContent };
    }
  }
  function dashboardHtml(project, client, values, data, folder) {
    var title = values.title || values.company || 'Клиент';
    var initials = title.trim().split(/\s+/).slice(0, 2).map(function (part) { return Array.from(part)[0] || ''; }).join('').toUpperCase();
    var hue = Array.from(title).reduce(function (sum, character) { return sum + character.codePointAt(0); }, 0) % 360;
    var primary = ['title', 'company', 'contact_name', 'phone', 'telegram', 'vk', 'category', 'city', 'avito_connection_id', 'project_group_id'];
    var fields = FIELDS.filter(function (field) { return primary.indexOf(field[0]) >= 0; }).map(function (field) { return fieldHtml(field, values); }).join('');
    var secondary = FIELDS.filter(function (field) { return primary.indexOf(field[0]) < 0 && field[0] !== 'notes'; }).map(function (field) { return fieldHtml(field, values); }).join('');
    var notes = fieldHtml(FIELDS.find(function (field) { return field[0] === 'notes'; }), values);
    var metadata = project ? '<span>' + escape(project.status || 'Статус не указан') + '</span><span>' + escape(({ active: 'Активные', sleep: 'Zzz', second_chance: 'Zzz', archive: 'Архив' })[project.zone] || project.zone || 'Активные') + '</span>' : '<span>Клиент CRM</span>';
    return [
      '<section class="project-card-dialog" role="dialog" aria-modal="true" aria-labelledby="projectCardTitle"><header class="project-card-head"><div class="project-card-heading"><div class="project-card-avatar" style="--avatar-hue:' + hue + '" aria-hidden="true">' + escape(initials || 'К') + '</div><div style="min-width:0"><div class="project-card-kicker">Клиент и продвижение</div><h2 id="projectCardTitle">Карта проекта · ' + escape(title) + '</h2></div></div><button type="button" data-action="close" aria-label="Закрыть карту проекта">×</button></header>',
      '<div class="project-card-body"><section class="project-card-section project-card-details"><h3>Данные клиента</h3><div class="project-card-meta">' + metadata + (folder ? '<a target="_blank" rel="noopener noreferrer" href="' + escape(folder) + '">Папка Drive ↗</a>' : '<span>Папка Drive не привязана</span>') + '</div><div class="project-card-fields">' + fields + '</div><details class="project-card-disclosure"><summary>Ссылки и позиции</summary><div class="project-card-fields">' + secondary + '</div></details></section>',
      '<section class="project-card-section project-card-avito"><div class="project-card-section-title"><h3>Аккаунт Avito</h3><button type="button" class="project-card-tool" data-card-account-refresh>Обновить</button></div><div data-account-metrics></div></section>',
      '<section class="project-card-section project-card-payments"><h3>Оплаты и динамика</h3>' + paymentsHtml(project || client) + '</section>',
      '<section class="project-card-section project-card-activity">' + activityHtml(project, data) + '</section>',
      '<section class="project-card-section project-card-context"><div class="project-card-notes-pane"><h3>Заметки к проекту</h3>' + notes + '</div></section></div>',
      '<footer class="project-card-foot"><span class="project-card-note" data-notice role="status"></span><button type="button" data-action="save">Сохранить и выйти</button></footer></section>'
    ].join('');
  }
  function open(projectId) {
    if (!ready()) return;
    if (!close(false)) return;
    var data = getProjects(), project = hasId(projectId) ? findById(data.projects, 'id', projectId) : projectForCurrent();
    if (hasId(projectId) && !project) { root.alert('Проект больше не найден. Обновите список проектов.'); return; }
    var client = project ? linkedClient(project, getClients()) : typeof root.getActiveClient === 'function' ? root.getActiveClient() : null;
    if (!project && !client) { root.alert('Сначала выберите проект или клиента CRM.'); return; }
    style();
    var values = model(project, client), folder = safeFolder(project) || safeFolder(client);
    var overlay = document.createElement('div'); overlay.className = 'project-card-overlay';
    overlay.innerHTML = dashboardHtml(project, client, values, data, folder);
    var state = { overlay: overlay, scope: scope(), projectId: project ? project.id : '', clientId: client ? client.client_id : '', folderId: project && project.folderId || client && client.folderId || '', before: values, manualBefore: paymentEditorValues(project || client), manualOverrideBefore: clone((project || client).manualPaymentsV1 || null), manualTouched: {}, dirty: false, metricsRequest: 0, previousFocus: document.activeElement };
    current = state;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="close"]').onclick = function () { close(false); };
    overlay.querySelector('[data-action="save"]').onclick = function () { return saveAndExit(state); };
    function markDirty(event) {
      var target = event.target, name = target && (target.name || target.getAttribute && target.getAttribute('name'));
      var paymentKey = target && target.getAttribute && target.getAttribute('data-manual-payment');
      if (paymentKey) { state.manualTouched[paymentKey] = true; state.dirty = true; }
      if (['phone', 'telegram', 'vk', 'notes', 'positions', 'city', 'client_type'].indexOf(name) >= 0) { state.contactTouched = state.contactTouched || {}; state.contactTouched[name] = true; }
      if (FIELDS.some(function (field) { return field[0] === name; })) state.dirty = true;
    }
    overlay.addEventListener('input', markDirty);
    overlay.addEventListener('change', markDirty);
    var groupButton = overlay.querySelector('[data-project-groups-manage]');
    if (groupButton && root.ProjectGroups) groupButton.onclick = function () {
      if (state.saving || readOnly()) return;
      root.ProjectGroups.openManager(function () {
        if (current !== state || state.scope !== scope()) return;
        var field = overlay.querySelector('[data-project-group-select]'), selected = field.value;
        field.innerHTML = root.ProjectGroups.options(selected);
        field.value = root.ProjectGroups.has(selected) ? selected : '';
        if (field.value !== selected) { state.dirty = true; }
      });
    };
    bindPaymentEditors(state);
    overlay.addEventListener('keydown', function (event) {
      if (event.target.__paymentEditBefore && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation(); finishPaymentEditor(state, event.target, event.key === 'Escape', true); return;
      }
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') {
        var focusable = Array.from(overlay.querySelectorAll('button,input,textarea,select,a[href],summary')).filter(function (el) { return !el.disabled && (!el.getClientRects || el.getClientRects().length > 0); });
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
    var refresh = overlay.querySelector('[data-card-account-refresh]');
    if (refresh) refresh.onclick = async function () {
      try {
        refresh.disabled = true; refresh.textContent = 'Обновляем…';
        await loadAccounts(true); ensureScope(state.scope);
        if (current !== state) return;
        fillAccountSelect(select, select.value, values.title);
        await loadMetrics(state, select.value);
      } catch (_) { if (current === state && state.scope === scope()) overlay.querySelector('[data-notice]').textContent = 'Список аккаунтов не обновился. Привязка и черновик сохранены; повторите попытку.'; }
      finally { if (current === state) { refresh.disabled = false; refresh.textContent = 'Обновить'; } }
    };
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
      overlay.querySelectorAll('input,textarea,select,[data-action="save"],[data-payment-sync],[data-project-groups-manage]').forEach(function (element) { element.disabled = true; });
      overlay.querySelector('[data-notice]').textContent = 'Режим Саши: только просмотр. Его данные не изменяются.';
    }
    mountContext(state, values.title || values.company || 'Клиент');
    overlay.querySelector('[data-action="close"]').focus();
  }
  function enhanceRows() {
    document.querySelectorAll('.projects-table-row[data-id] .proj-main-line').forEach(function (line) {
      if (line.querySelector('[data-project-card]')) return;
      var row = line.closest('.projects-table-row[data-id]'), id = row.getAttribute('data-id');
      var button = document.createElement('button'); button.type = 'button'; button.className = 'project-card-row-button';
      button.dataset.projectCard = id; button.title = 'Карта проекта'; button.setAttribute('aria-label', 'Карта проекта'); button.textContent = '▣';
      button.onpointerdown = function (event) { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); } };
      button.onmousedown = function (event) { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); } };
      button.onclick = function (event) { event.stopPropagation(); open(id); };
      line.appendChild(button);
    });
  }
  function bindRowCardClicks() {
    if (rowClickBound) return;
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest && event.target.closest('button[data-project-card]');
      var row = button && button.closest('.projects-table-row[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (!hasId(id)) return;
      event.preventDefault(); event.stopPropagation(); open(id);
    }, true);
    rowClickBound = true;
  }
  function init() {
    var saveButton = document.getElementById('saveClientBtn');
    if (!saveButton) return;
    style();
    bindRowCardClicks();
    if (!document.getElementById('projectCardOpenBtn')) {
      var button = document.createElement('button'); button.type = 'button'; button.id = 'projectCardOpenBtn'; button.className = 'project-card-sidebar'; button.textContent = '🗂️ Карта проекта'; button.title = 'Карта выбранного проекта'; button.setAttribute('aria-label', 'Карта выбранного проекта');
      button.onclick = function (event) { event.stopPropagation(); open(); };
      saveButton.after(button);
    }
    var contactButton = document.getElementById('sidebarContactBtn');
    if (contactButton && !document.getElementById('projectCardTopBtn')) {
      var topButton = document.createElement('button'); topButton.type = 'button'; topButton.id = 'projectCardTopBtn'; topButton.className = 'sidebar-contact-btn project-card-top-button'; topButton.textContent = '🗂️'; topButton.title = 'Карта выбранного проекта'; topButton.setAttribute('aria-label', 'Карта выбранного проекта');
      topButton.onclick = function (event) { event.stopPropagation(); open(); };
      contactButton.after(topButton);
    }
    if (document.getElementById('projectAccountSelect')) return;
    var field = document.createElement('div'); field.className = 'fg project-card-account-field'; field.innerHTML = '<label for="projectAccountSelect">Аккаунт проекта · Avito API</label><div class="project-card-account-controls"><select id="projectAccountSelect" aria-label="Привязать аккаунт Avito к проекту"><option value="">Не привязан</option></select><button type="button" id="projectAccountRefreshBtn" class="project-card-account-refresh" title="Обновить список аккаунтов Avito" aria-label="Обновить список аккаунтов Avito">Обновить</button></div><input type="hidden" id="avito_connection_id" value=""><small id="projectAccountRefreshStatus" class="project-card-account-status" role="status" aria-live="polite"></small>';
    var avito = document.getElementById('avito_account');
    if (avito && avito.closest('.row2')) avito.closest('.row2').after(field); else saveButton.before(field);
    var select = document.getElementById('projectAccountSelect'); select.onchange = function () { sidebarAccountChanged(select); };
    document.getElementById('projectAccountRefreshBtn').onclick = refreshSidebarAccounts;
    var company = document.getElementById('company'); if (company) company.addEventListener('change', refreshSidebar);
    document.addEventListener('avitolog:active-client-changed', refreshSidebar);
    document.addEventListener('avitolog:backend-initial-ready', refreshSidebar);
    document.addEventListener('avitolog:backend-remote-applied', function () { refreshSidebar(); });
    document.addEventListener('avitolog:project-payments-changed', refreshPaymentSummary);
    document.addEventListener('avitolog:project-payments-file', refreshPaymentSummary);
    document.addEventListener('avitolog:project-context-changed', refreshPaymentSummary);
    document.addEventListener('avitolog:workspace-reset', resetAccountMetrics);
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { normalize: normalize, safeAvitoUrl: safeAvitoUrl, linkedClient: linkedClient, model: model, accountScore: accountScore, rankedAccounts: rankedAccounts, changedFields: changedFields, assertNoConflict: assertNoConflict, paymentsHtml: paymentsHtml, paymentEditorValues: paymentEditorValues, parseManualPayments: parseManualPayments, paymentTrend: paymentTrend, dashboardHtml: dashboardHtml, save: save, scope: scope, ready: ready, readOnly: readOnly, sameId: sameId, findById: findById, projectForCurrent: projectForCurrent, activityHtml: activityHtml, loadAccounts: loadAccounts, refreshSidebarAccounts: refreshSidebarAccounts, accountAnalytics: accountAnalytics, accountAnalyticsHtml: accountAnalyticsHtml, accountColumns: accountColumns, loadMetrics: loadMetrics };
  if (document) {
    document.addEventListener('avitolog:chat-contacts-updated', syncChatContacts);
    document.addEventListener('avitolog:chat-insights-updated', syncChatContacts);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
