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
  var FIELDS = [
    ['title', 'Название проекта', 300], ['company', 'Компания', 300],
    ['contact_name', 'Контактное лицо', 200], ['phone', 'Телефон', 100],
    ['telegram', 'Телеграм', 200], ['vk', 'VK', 500],
    ['avito_account', 'Ссылка Avito клиента', 1000], ['category', 'Ниша', 300],
    ['city', 'География', 1000], ['client_type', 'Тип клиента', 100],
    ['kp_count', 'Объявлений по КП', 100], ['positions', 'Позиции', 5000],
    ['notes', 'Примечания', 20000], ['avito_connection_id', 'Аккаунт проекта', 100]
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
    element.textContent += '@media(max-width:1100px){.project-card-body{grid-template-rows:none;grid-auto-rows:max-content}}';
    element.textContent += '@media(min-width:1101px) and (max-height:820px){.project-card-head{padding:10px 15px}.project-card-foot{padding:8px 15px}.project-card-body{padding:10px;gap:10px}.project-card-section{padding:10px}.project-card-section h3,.project-card-section-title{margin-bottom:8px}.project-card-fields{gap:6px 8px}.project-card-field{gap:3px}.project-card-field input,.project-card-field textarea,.project-card-field select{padding:5px 7px;font-size:11px}.project-card-metric{padding:7px 8px}.project-card-metric strong{font-size:18px;margin-top:4px}.project-card-meta{margin-bottom:8px}.project-card-disclosure{margin-top:8px;padding-top:7px}.project-card-trend{margin:8px 0 5px}.project-card-bars{height:65px;margin-top:5px}.project-card-context .project-context{font-size:11px;gap:7px}.project-card-context .project-context textarea{min-height:64px;padding:6px}.project-card-context .project-context-note{font-size:10px}.project-card-context .project-context-actions{margin:4px 0}.project-card-context .project-context button{padding:4px 7px;font-size:10px}}';
    element.textContent += '.project-card-account-controls{display:flex;gap:6px;align-items:center}.project-card-account-controls select{flex:1;min-width:0}.project-card-account-refresh{flex:none;padding:8px;border:1px solid var(--border,#31445b);border-radius:7px;background:var(--surface2,#132132);color:var(--text,#eaf2ff);font:inherit;font-size:11px;cursor:pointer}.project-card-account-refresh:disabled{opacity:.6;cursor:wait}.project-card-account-status{display:block;font-size:10px;line-height:1.4;color:var(--muted,#9ab0c9)}.project-card-account-status:empty{display:none}';
    document.head.appendChild(element);
  }
  function fieldHtml(field, values) {
    var key = field[0], multiline = key === 'notes' || key === 'positions';
    if (key === 'avito_connection_id') return '<label class="project-card-field project-card-field-wide">Аккаунт проекта<select name="avito_connection_id" data-account-select title="Подходящий по названию аккаунт предложен первым. Аккаунт заявки CRM не меняется."></select></label>';
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
  function paymentSummaryHtml(project) {
    var journal = root.ProjectPaymentJournal;
    if (!journal || typeof journal.getEntries !== 'function') return '<p class="project-card-note">История оплат пока недоступна.</p>';
    var summary = typeof journal.getSummary === 'function' ? journal.getSummary(project, moscowDay()) : null;
    var entries = summary && Array.isArray(summary.entries) ? summary.entries : journal.getEntries(project) || [];
    var valid = entries.filter(function (entry) { return entry && Number.isFinite(entry.amount) && entry.currency === 'RUB'; });
    var ledgerTotal = summary ? summary.total : valid.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
    var report = reportedFinancialSummary(project), total = report ? report.totalPaid : ledgerTotal;
    var cycles = summary && Number.isSafeInteger(summary.promotionCycles) && summary.promotionCycles >= 0 ? metric(summary.promotionCycles) : 'Не определено';
    if (summary && summary.unknownCyclePayments > 0 && Number.isSafeInteger(summary.knownPromotionCycles) && summary.knownPromotionCycles > 0) cycles = 'Не менее ' + metric(summary.knownPromotionCycles);
    if (report) cycles = metric(report.promotionCycles);
    var count = summary && Number.isSafeInteger(summary.count) && summary.count >= 0 ? summary.count : valid.length;
    var cards = '<div class="project-card-metrics">' + metricBox(report ? 'Последняя известная оплата' : 'Последняя оплата', paymentDateLabel(summary && summary.lastPaymentDate)) + metricBox(report ? 'Дней после известной оплаты' : 'Дней после оплаты', metric(summary && summary.daysSinceLastPayment)) + metricBox('Всего оплачено', formatMoney(total)) + metricBox('Циклов продвижения', cycles) + '</div>';
    if (report) cards += '<p class="project-card-note">Общий итог · подтверждено вручную · ' + escape(new Date(report.recordedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })) + '. Отдельно в журнале датированных оплат: ' + escape(formatMoney(ledgerTotal)) + '. Итог не прибавляется к журналу; даты и график ниже относятся только к его записям.</p>';
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
    if (target && container) container.innerHTML = paymentSummaryHtml(target);
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
  function formValues(state) {
    var values = {};
    FIELDS.forEach(function (field) { var input = state.overlay.querySelector('[name="' + field[0] + '"]'); values[field[0]] = input ? input.value : state.before[field[0]]; });
    return values;
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
    if (root.ProjectContext && typeof root.ProjectContext.mount === 'function') return Promise.resolve();
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
    contextRequest = Promise.resolve().then(function () { return root.ProjectContextStore ? null : script('project-context-store.js?v=20261022-context2'); }).then(function () { return root.ProjectContext && typeof root.ProjectContext.mount === 'function' ? null : script('project-context.js?v=20261022-context2'); }).then(function () {
      if (!root.ProjectContext || typeof root.ProjectContext.mount !== 'function') throw new Error('Модуль контекста недоступен.');
    }).catch(function (error) { contextRequest = null; throw error; });
    return contextRequest;
  }
  async function mountContext(state, title) {
    var container = state.overlay.querySelector('[data-project-context]');
    if (!container) return;
    try {
      await loadContextModule();
      if (current !== state || state.scope !== scope() || !ready()) return;
      container.innerHTML = '<h3>AI-контекст проекта</h3>';
      state.contextPanel = root.ProjectContext.mount(container, {
        projectId: state.projectId, clientId: state.clientId, folderId: state.folderId,
        scope: state.scope, readOnly: readOnly(), projectTitle: title,
        getValues: function () { return formValues(state); },
        onApply: function (patch) { return applyContextFields(state, patch); },
        onConfirm: async function (patch) {
          applyContextFields(state, patch);
          var fields = CONTEXT_FIELDS.filter(function (key) { return patch && Object.prototype.hasOwnProperty.call(patch, key); });
          if (!fields.length) return { ok: true };
          var result = await save(state, fields);
          if (!result.ok) throw new Error(result.error);
          ensureScope(state.scope);
          if (current !== state) throw new Error('Карта больше недоступна для редактирования.');
          return result;
        },
        isCurrent: function () { return current === state && state.scope === scope() && ready(); }
      });
      refreshPaymentSummary();
    } catch (_) { if (current === state && state.scope === scope()) container.innerHTML = '<p class="project-card-note" role="status">Не удалось загрузить AI-контекст. Поля проекта сохранены без изменений. Откройте карту повторно, чтобы повторить загрузку.</p>'; }
  }
  function close(force) {
    if (!current) return true;
    var contextDirty = current.contextPanel && typeof current.contextPanel.isDirty === 'function' && current.contextPanel.isDirty();
    if (!force && (current.dirty || contextDirty) && !root.confirm('Закрыть карту без сохранения изменений?')) return false;
    var state = current; current = null;
    if (state.contextPanel && typeof state.contextPanel.destroy === 'function') state.contextPanel.destroy();
    state.overlay.remove();
    if (state.previousFocus && state.previousFocus.isConnected) state.previousFocus.focus();
    return true;
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
      var clients = getClients().map(clone), data = clone(getProjects());
      var project = findById(data.projects, 'id', state.projectId);
      var client = hasId(state.clientId) ? findById(clients, 'client_id', state.clientId) : findById(clients, 'folderId', state.folderId);
      if (hasId(state.projectId) && !project || !hasId(state.projectId) && !client) throw new Error('Проект или клиент больше не найден. Откройте карту заново.');
      assertNoConflict(Object.assign({}, state.before, state.draftBaselines || {}), model(project, client), changes);
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
      ensureScope(state.scope);
      if (project && Object.keys(changes).length) { if (typeof root.saveProjectsData !== 'function') throw new Error('Сохранение проектов недоступно.'); root.saveProjectsData(data); }
      ensureScope(state.scope);
      if (project && typeof root.rerenderProjectsPreserveScroll === 'function' && root.projectsMode) root.rerenderProjectsPreserveScroll();
      if (project && typeof root.syncProjectToActiveSheet === 'function') root.syncProjectToActiveSheet(project.id, 'project_card_save');
      if (typeof root.fillClientForm === 'function' && sameId((projectForCurrent() || {}).id, state.projectId)) root.fillClientForm(Object.assign({}, project && project.crmData || client || {}, { avito_connection_id: project && project.avitoConnectionId || (client || {}).avito_connection_id || '' }));
      var previousBefore = state.before, previousDraftBaselines = state.draftBaselines || {};
      state.before = model(project, client); state.draftBaselines = {};
      FIELDS.forEach(function (field) {
        var key = field[0], input = state.overlay.querySelector('[name="' + key + '"]');
        var retained = selected && selected.indexOf(key) < 0 && drafts.indexOf(key) >= 0;
        if (input && !retained) input.value = state.before[key];
        if (input && retained && text(input.value).trim() !== text(state.before[key])) state.draftBaselines[key] = Object.prototype.hasOwnProperty.call(previousDraftBaselines, key) ? previousDraftBaselines[key] : previousBefore[key];
      });
      var remaining = formValues(state);
      state.dirty = FIELDS.some(function (field) { return text(remaining[field[0]]).trim() !== text(state.before[field[0]]); });
      notice.textContent = state.dirty ? 'Выбранные поля сохранены. Другие изменения в форме остаются черновиком.' : 'Сохранено в текущем режиме. Серверная синхронизация выполняется как обычно.';
      refreshSidebar();
      return { ok: true };
    } catch (error) { notice.textContent = error.message || 'Не удалось сохранить изменения.'; return { ok: false, error: notice.textContent }; }
  }
  function dashboardHtml(project, client, values, data, folder) {
    var title = values.title || values.company || 'Клиент';
    var initials = title.trim().split(/\s+/).slice(0, 2).map(function (part) { return Array.from(part)[0] || ''; }).join('').toUpperCase();
    var hue = Array.from(title).reduce(function (sum, character) { return sum + character.codePointAt(0); }, 0) % 360;
    var primary = ['title', 'company', 'contact_name', 'phone', 'telegram', 'category', 'city', 'avito_connection_id'];
    var fields = FIELDS.filter(function (field) { return primary.indexOf(field[0]) >= 0; }).map(function (field) { return fieldHtml(field, values); }).join('');
    var secondary = FIELDS.filter(function (field) { return primary.indexOf(field[0]) < 0; }).map(function (field) { return fieldHtml(field, values); }).join('');
    var metadata = project ? '<span>' + escape(project.status || 'Статус не указан') + '</span><span>' + escape(({ active: 'Активные', sleep: 'Zzz', second_chance: 'Zzz', archive: 'Архив' })[project.zone] || project.zone || 'Активные') + '</span>' : '<span>Клиент CRM</span>';
    return '<section class="project-card-dialog" role="dialog" aria-modal="true" aria-labelledby="projectCardTitle"><header class="project-card-head"><div class="project-card-heading"><div class="project-card-avatar" style="--avatar-hue:' + hue + '" aria-hidden="true">' + escape(initials || 'К') + '</div><div style="min-width:0"><div class="project-card-kicker">Клиент и продвижение</div><h2 id="projectCardTitle">Карта проекта · ' + escape(title) + '</h2></div></div><button type="button" data-action="close" aria-label="Закрыть карту проекта">×</button></header><div class="project-card-body"><section class="project-card-section project-card-details"><h3>Данные клиента</h3><div class="project-card-meta">' + metadata + (folder ? '<a target="_blank" rel="noopener noreferrer" href="' + escape(folder) + '">Папка Drive ↗</a>' : '<span>Папка Drive не привязана</span>') + '</div><div class="project-card-fields">' + fields + '</div><details class="project-card-disclosure"><summary>Ссылки, позиции и примечания</summary><div class="project-card-fields">' + secondary + '</div></details></section><section class="project-card-section project-card-avito"><div class="project-card-section-title"><h3>Аккаунт Avito</h3><button type="button" class="project-card-tool" data-card-account-refresh>Обновить</button></div><div data-account-metrics></div></section><section class="project-card-section project-card-payments"><h3>Оплаты и динамика</h3>' + paymentsHtml(project || client) + '</section><section class="project-card-section project-card-activity">' + activityHtml(project, data) + '</section><section class="project-card-section project-card-context"><div data-project-context><h3>AI-контекст проекта</h3><p class="project-card-note" role="status">Загружаем приём материалов и помощника по заполнению…</p></div></section></div><footer class="project-card-foot"><span class="project-card-note" data-notice role="status"></span><button type="button" data-action="save">Сохранить изменения</button></footer></section>';
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
    var state = { overlay: overlay, scope: scope(), projectId: project ? project.id : '', clientId: client ? client.client_id : '', folderId: project && project.folderId || client && client.folderId || '', before: values, dirty: false, metricsRequest: 0, previousFocus: document.activeElement };
    current = state;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="close"]').onclick = function () { close(false); };
    overlay.querySelector('[data-action="save"]').onclick = function () { save(state); };
    function markDirty(event) {
      var target = event.target, name = target && (target.name || target.getAttribute && target.getAttribute('name'));
      if (target && target.closest && target.closest('[data-project-context]')) return;
      if (FIELDS.some(function (field) { return field[0] === name; })) state.dirty = true;
    }
    overlay.addEventListener('input', markDirty);
    overlay.addEventListener('change', markDirty);
    overlay.addEventListener('keydown', function (event) {
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
      overlay.querySelectorAll('input,textarea,select,[data-action="save"],[data-payment-sync]').forEach(function (element) { element.disabled = true; });
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { normalize: normalize, safeAvitoUrl: safeAvitoUrl, linkedClient: linkedClient, model: model, accountScore: accountScore, rankedAccounts: rankedAccounts, changedFields: changedFields, assertNoConflict: assertNoConflict, paymentsHtml: paymentsHtml, paymentTrend: paymentTrend, dashboardHtml: dashboardHtml, save: save, scope: scope, ready: ready, readOnly: readOnly, sameId: sameId, findById: findById, projectForCurrent: projectForCurrent, activityHtml: activityHtml, loadAccounts: loadAccounts, refreshSidebarAccounts: refreshSidebarAccounts };
  if (document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
