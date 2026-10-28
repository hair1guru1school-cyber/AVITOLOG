(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document && !root.CrmSettings) root.CrmSettings = api.install(root, root.document);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var BASE = 'avitolog_crm_settings_v1';
  var DEFAULTS = { weeklyAutoSort: true, autoVk: true, autoTelegram: true, autoChatPositions: false, autoAccountDetails: false, soldColor: '#1b2b25', workColor: '#2a2722' };
  var FLAGS = ['weeklyAutoSort', 'autoVk', 'autoTelegram', 'autoChatPositions', 'autoAccountDetails'];
  function text(value) { return value == null ? '' : String(value); }
  function normalize(value) {
    var out = Object.assign({}, DEFAULTS); value = value || {};
    FLAGS.forEach(function (name) { if (typeof value[name] === 'boolean') out[name] = value[name]; });
    ['soldColor', 'workColor'].forEach(function (name) { if (/^#[a-f0-9]{6}$/i.test(text(value[name]))) out[name] = value[name].toLowerCase(); });
    return out;
  }
  function scope(win) {
    var name = typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(BASE) : BASE + text(win.AVITOLOG_KEY_SUFFIX);
    var identity = typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() || {} : {};
    return name + '|' + text(identity.id || identity.email || win.AVITOLOG_KEY_EMAIL || 'local').toLowerCase();
  }
  function database(win) {
    var opening;
    function open() {
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        if (!win.indexedDB || typeof win.indexedDB.open !== 'function') { reject(new Error('indexeddb_unavailable')); return; }
        var done = false, request, timer = win.setTimeout(function () { finish(new Error('indexeddb_timeout')); }, 2000);
        function finish(error, db) {
          if (done) { if (db) try { db.close(); } catch (_) {} return; }
          done = true; win.clearTimeout(timer); if (error) reject(error); else resolve(db);
        }
        try {
          request = win.indexedDB.open('avitolog-crm-settings-v1', 1);
          request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings', { keyPath: 'scope' }); };
          request.onerror = request.onblocked = function () { finish(new Error('indexeddb_unavailable')); };
          request.onsuccess = function () { var db = request.result; db.onversionchange = function () { db.close(); opening = null; }; finish(null, db); };
        } catch (error) { finish(error); }
      });
      return opening;
    }
    function transaction(mode, record, key) {
      return open().then(function (db) { return new Promise(function (resolve, reject) {
        var done = false, result = null, tx, timer = win.setTimeout(function () { finish(new Error('indexeddb_timeout')); }, 2000);
        function finish(error) { if (done) return; done = true; win.clearTimeout(timer); if (error) reject(error); else resolve(result); }
        try {
          tx = db.transaction('settings', mode);
          var store = tx.objectStore('settings'), request = mode === 'readonly' ? store.get(key) : store.put(record);
          request.onsuccess = function () { result = request.result || null; };
          request.onerror = function () { finish(new Error('indexeddb_failed')); };
          tx.oncomplete = function () { finish(); };
          tx.onabort = tx.onerror = function () { finish(new Error('indexeddb_failed')); };
        } catch (error) { finish(error); }
      }); });
    }
    return { read: function (key) { return transaction('readonly', null, key); }, write: function (record) { return transaction('readwrite', record); } };
  }
  function createStore(win, durable) {
    var records = Object.create(null), listeners = [], current = '', persistence = durable || database(win);
    function emit(state) { if (records[state.scope] !== state) return; listeners.slice().forEach(function (listener) { listener({ scope: state.scope, ready: state.ready, settings: normalize(state.settings), mode: state.mode }); }); }
    function validRecord(value, key) { return value && value.scope === key && typeof value.updatedAt === 'number' && isFinite(value.updatedAt) && value.settings && typeof value.settings === 'object'; }
    function ensure() {
      var key = scope(win); current = key;
      if (records[key]) return records[key];
      var local = null;
      try { local = JSON.parse(win.localStorage.getItem(key) || 'null'); } catch (_) {}
      if (!validRecord(local, key)) local = null;
      var state = { scope: key, settings: normalize(local && local.settings), updatedAt: local ? local.updatedAt : 0, ready: false, mode: local ? 'localStorage' : 'memory', lastSaved: null, queue: Promise.resolve() };
      records[key] = state;
      state.loading = Promise.resolve().then(function () { return persistence.read(key); }).then(function (stored) {
        if (validRecord(stored, key) && stored.updatedAt > state.updatedAt) { state.settings = normalize(stored.settings); state.updatedAt = stored.updatedAt; state.mode = 'indexeddb'; }
      }, function () {}).then(function () { state.ready = true; emit(state); return normalize(state.settings); });
      return state;
    }
    function get() { return normalize(ensure().settings); }
    function set(patch) {
      var state = ensure(), owner = current;
      return state.loading.then(function () {
        if (scope(win) !== owner) throw new Error('Профиль изменился. Откройте настройки заново.');
        state.settings = normalize(Object.assign({}, state.settings, patch));
        state.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
        var record = { scope: owner, settings: normalize(state.settings), updatedAt: state.updatedAt }, local = false;
        try { win.localStorage.setItem(owner, JSON.stringify(record)); local = true; } catch (_) {}
        state.mode = local ? 'localStorage' : 'memory'; state.lastSaved = local; emit(state);
        state.queue = state.queue.catch(function () {}).then(function () { return persistence.write(record); }).then(function () {
          if (state.updatedAt === record.updatedAt) { state.mode = 'indexeddb'; state.lastSaved = true; emit(state); }
          return { saved: true, mode: 'indexeddb', settings: normalize(record.settings) };
        }, function () { return { saved: local, mode: local ? 'localStorage' : 'memory', settings: normalize(record.settings) }; });
        return state.queue;
      });
    }
    function refresh() { var key = scope(win); delete records[key]; return ensure().loading; }
    return { get: get, set: set, whenReady: function () { return ensure().loading; }, isReady: function () { return ensure().ready; }, status: function () { var state = ensure(); return { ready: state.ready, mode: state.mode, saved: state.lastSaved }; }, isEnabled: function (name) { var state = ensure(); return FLAGS.indexOf(name) >= 0 && state.ready && state.settings[name] === true; }, subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (row) { return row !== listener; }); }; }, refresh: refresh, scope: function () { return ensure().scope; } };
  }
  function contrast(hex) {
    var rgb = [1, 3, 5].map(function (start) { var c = parseInt(hex.slice(start, start + 2), 16) / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); });
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .35 ? { ink: '#173027', muted: '#486257' } : { ink: '#edf8f2', muted: '#b5cbbf' };
  }
  function install(win, doc) {
    var store = createStore(win), menu, button, status, observer, scheduled = false, appliedScope = '', viewScope = '', saving = false;
    function element(tag, cls, label) { var node = doc.createElement(tag); if (cls) node.className = cls; if (label) node.textContent = label; return node; }
    function writable() {
      var sasha = typeof win.AVITOLOG_KEY === 'function' && /_sasha$/.test(win.AVITOLOG_KEY('avitolog_clients'));
      return !(win.AVITOLOG_BACKEND_MODE && typeof win.AVITOLOG_PROFILE_LOCKED === 'boolean' && sasha !== win.AVITOLOG_PROFILE_LOCKED);
    }
    function applyColors(settings) {
      ['sold', 'work'].forEach(function (stage) {
        var value = settings[stage + 'Color'], custom = value !== DEFAULTS[stage + 'Color'], colors = contrast(value);
        ['bg', 'ink', 'muted'].forEach(function (kind) {
          var name = '--crm-' + stage + '-' + kind;
          if (custom) doc.body.style.setProperty(name, kind === 'bg' ? value : colors[kind]); else doc.body.style.removeProperty(name);
        });
      });
    }
    function close() { if (menu) menu.hidden = true; if (button) button.setAttribute('aria-expanded', 'false'); }
    function statusText(message, warning) { if (!status) return; status.textContent = message; status.dataset.warning = warning ? 'true' : 'false'; }
    function sync() {
      if (!doc.body) return;
      var key = store.scope(), enabled = doc.body.classList.contains('goals-mode');
      if (key !== appliedScope) { close(); appliedScope = key; }
      applyColors(store.get());
      if (!enabled) close();
      var robot = doc.getElementById('goalsSmartOpenBtn');
      if (robot && robot.parentNode && (!button || !button.isConnected)) {
        button = element('button', 'crm-settings-button', '\u2699'); button.id = 'crmSettingsBtn'; button.type = 'button';
        button.title = 'Настройки CRM'; button.setAttribute('aria-label', 'Настройки CRM'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'crmSettingsMenu');
        button.addEventListener('click', function (event) { event.stopPropagation(); if (menu && !menu.hidden) close(); else open(); });
        robot.parentNode.insertBefore(button, robot.nextSibling);
      }
      if (button) button.hidden = !enabled;
    }
    function schedule() { if (scheduled) return; scheduled = true; (win.requestAnimationFrame || win.setTimeout).call(win, function () { scheduled = false; sync(); }); }
    function populate() {
      if (!menu) return;
      var settings = store.get(), ready = store.isReady(), allowed = writable() && ready && !saving;
      menu.querySelectorAll('[data-setting]').forEach(function (input) { var name = input.dataset.setting; if (input.type === 'checkbox') input.checked = settings[name]; else input.value = settings[name]; input.disabled = !allowed; });
      menu.querySelectorAll('[data-reset]').forEach(function (node) { node.disabled = !allowed; });
      if (!ready) statusText('Загрузка сохранённых настроек…'); else if (!writable()) statusText('Настройки этого профиля доступны только для просмотра.'); else if (!saving) statusText(store.status().saved === false ? 'Не удалось сохранить в браузере. Изменение действует только до перезагрузки.' : 'Сохраняется в этом браузере отдельно для каждого профиля.', store.status().saved === false);
    }
    function change(name, value) {
      if (saving || viewScope !== store.scope() || !writable()) { close(); return; }
      saving = true; populate(); var patch = {}; patch[name] = value;
      store.set(patch).then(function (result) {
        saving = false;
        if (viewScope !== store.scope()) return;
        populate(); statusText(result.saved ? 'Сохранено.' : 'Не удалось сохранить в браузере. Изменение действует только до перезагрузки.', !result.saved);
      }, function (error) { saving = false; if (viewScope === store.scope()) { populate(); statusText(error.message || 'Настройка не сохранена.', true); } });
    }
    function open() {
      if (!menu) build();
      viewScope = store.scope(); menu.hidden = false; button.setAttribute('aria-expanded', 'true'); populate();
      var rect = button.getBoundingClientRect(), top = Math.max(8, Math.min(rect.bottom + 7, win.innerHeight - 140)); menu.style.top = top + 'px'; menu.style.left = Math.max(8, Math.min(rect.right - 330, win.innerWidth - 346)) + 'px'; menu.style.maxHeight = Math.max(120, win.innerHeight - top - 12) + 'px';
      store.whenReady().then(function () { if (!menu.hidden && viewScope === store.scope()) populate(); });
    }
    function build() {
      menu = element('section', 'crm-settings-menu'); menu.id = 'crmSettingsMenu'; menu.hidden = true; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Настройки CRM');
      var head = element('div', 'crm-settings-head'); head.appendChild(element('strong', '', 'Настройки CRM'));
      var exit = element('button', 'crm-settings-close', '\u00d7'); exit.type = 'button'; exit.setAttribute('aria-label', 'Закрыть настройки CRM'); exit.addEventListener('click', close); head.appendChild(exit); menu.appendChild(head);
      var sorting = element('label', 'crm-settings-option'), sortingInput = element('input'); sortingInput.type = 'checkbox'; sortingInput.dataset.setting = 'weeklyAutoSort';
      sortingInput.addEventListener('change', function () { change('weeklyAutoSort', sortingInput.checked); }); sorting.appendChild(sortingInput); sorting.appendChild(element('span', '', 'Автосортировка проектов на неделях')); menu.appendChild(sorting);
      menu.appendChild(element('p', 'crm-settings-hint', 'Сначала КП с ценой, затем цена без КП, без цены и оплаченные. Отключите для ручного порядка.'));
      menu.appendChild(element('h3', '', 'Автоматизация'));
      [['autoVk', 'VK из входящих чатов'], ['autoTelegram', 'Telegram из входящих чатов'], ['autoChatPositions', 'Позиции товаров и услуг из чата в заметки'], ['autoAccountDetails', 'Города из чата, ИП / ООО из чата и имени клиента']].forEach(function (row) {
        var label = element('label', 'crm-settings-option'), input = element('input'); input.type = 'checkbox'; input.dataset.setting = row[0];
        input.addEventListener('change', function () { change(row[0], input.checked); }); label.appendChild(input); label.appendChild(element('span', '', row[1])); menu.appendChild(label);
      });
      menu.appendChild(element('p', 'crm-settings-hint', 'Ручные поля не заменяются; заметки только дополняются.'));
      menu.appendChild(element('p', 'crm-settings-hint', 'Чужие объявления и архив текущий API не предоставляет. Если город или тип компании неизвестны, поле останется без изменений.'));
      menu.appendChild(element('h3', '', 'Фон блоков'));
      [['soldColor', 'Продано'], ['workColor', 'В работе']].forEach(function (row) {
        var label = element('label', 'crm-settings-color'); label.appendChild(element('span', '', row[1]));
        var input = element('input'); input.type = 'color'; input.dataset.setting = row[0]; input.setAttribute('aria-label', 'Цвет блока ' + row[1]); input.addEventListener('change', function () { change(row[0], input.value); }); label.appendChild(input);
        var reset = element('button', 'crm-settings-reset', 'Сбросить'); reset.type = 'button'; reset.dataset.reset = row[0]; reset.addEventListener('click', function () { change(row[0], DEFAULTS[row[0]]); }); label.appendChild(reset); menu.appendChild(label);
      });
      status = element('p', 'crm-settings-status'); status.setAttribute('role', 'status'); menu.appendChild(status); doc.body.appendChild(menu);
    }
    store.subscribe(function (event) {
      if (event.scope !== store.scope()) return;
      applyColors(event.settings); if (menu && !menu.hidden && !saving) populate();
      if (typeof win.CustomEvent === 'function') doc.dispatchEvent(new win.CustomEvent('avitolog:crm-settings-changed', { detail: { scope: event.scope, ready: event.ready } }));
    });
    doc.addEventListener('click', function (event) { if (menu && !menu.hidden && !menu.contains(event.target) && event.target !== button) close(); });
    doc.addEventListener('keydown', function (event) { if (event.key === 'Escape' && menu && !menu.hidden) { close(); if (button && button.isConnected) button.focus(); } });
    ['avitolog:workspace-reset', 'avitolog:backend-initial-ready', 'avitolog:active-client-changed'].forEach(function (name) { doc.addEventListener(name, function () { close(); schedule(); }); });
    win.addEventListener('resize', close);
    win.addEventListener('storage', function (event) { if (event.key === store.scope()) { close(); store.refresh().then(schedule); } });
    function start() { if (win.MutationObserver) { observer = new win.MutationObserver(schedule); observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } sync(); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
    return store;
  }
  return { normalize: normalize, defaults: normalize(), scope: scope, createStore: createStore, contrast: contrast, install: install };
});
