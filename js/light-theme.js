(function () {
  'use strict';
  if (window.AVITOLOG_THEME) return;
  var location = new URL(window.location.href);
  if (location.searchParams.has('workspaceBridge') || location.searchParams.has('adsBridge')) return;
  var LEGACY = 'avitolog_day_mode', DB = 'avitolog_display_preferences_v1', STORE = 'preferences';
  var PARENTS = ['https://hair1guru1school-cyber.github.io', 'https://avitoboss.online', 'https://www.avitoboss.online'];
  var theme = 'dark', revision = 0, database = null, opening = null, initialized = false, readyTask = null, writeTail = Promise.resolve(), channel = null;
  var watched = new WeakSet();
  function valid(value) { return value === 'light' || value === 'dark'; }
  function legacy() { try { return window.localStorage.getItem(LEGACY) === '1' ? 'light' : 'dark'; } catch (_) { return 'dark'; } }
  function open() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    var pending = new Promise(function (resolve, reject) {
      var request, done = false, timer = setTimeout(function () { finish(new Error('theme_storage_timeout')); }, 1600);
      function finish(error, result) {
        if (done) { if (result) result.close(); return; }
        done = true; clearTimeout(timer); if (error) reject(error); else resolve(result);
      }
      try {
        if (!window.indexedDB) throw new Error('theme_storage_unavailable');
        request = window.indexedDB.open(DB, 1);
        request.onupgradeneeded = function () { if (done) { try { request.transaction.abort(); } catch (_) {} return; } if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
        request.onerror = request.onblocked = function () { finish(new Error('theme_storage_unavailable')); };
        request.onsuccess = function () {
          var db = request.result; if (done) { db.close(); return; }
          database = db; db.onversionchange = function () { db.close(); if (database === db) database = null; }; finish(null, db);
        };
      } catch (error) { finish(error); }
    });
    opening = pending; pending.then(function () { if (opening === pending) opening = null; }, function () { if (opening === pending) opening = null; });
    return pending;
  }
  function record(value, guard) {
    return open().then(function (db) {
      if (guard && !guard()) return null;
      return new Promise(function (resolve, reject) {
        var tx, result, done = false, timer = setTimeout(function () { try { if (tx) tx.abort(); } catch (_) {} finish(new Error('theme_storage_timeout')); }, 1600);
        function finish(error) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(result); }
        try {
          tx = db.transaction(STORE, value === undefined ? 'readonly' : 'readwrite');
          tx.oncomplete = function () { finish(); }; tx.onabort = tx.onerror = function () { finish(new Error('theme_storage_failed')); };
          var store = tx.objectStore(STORE), request = value === undefined ? store.get('theme') : store.put(value, 'theme');
          request.onsuccess = function () { result = request.result; };
        } catch (error) { try { if (tx) tx.abort(); } catch (_) {} finish(error); }
      });
    });
  }
  function frameAllowed(frame) {
    try {
      var url = new URL(frame.src, window.location.href);
      if (frame.id === 'avitoAccountsFrame' && url.origin === 'https://avitoboss.online' && url.pathname.replace(/\/$/, '') === '/integrations/avito-accounts') return true;
      return (' ' + (frame.className || '') + ' ').indexOf(' kp-editor-embed ') !== -1 && url.origin === location.origin && url.pathname === new URL('kp-editor.html', location).pathname;
    } catch (_) { return false; }
  }
  function sendFrame(frame) { if (frameAllowed(frame) && frame.contentWindow) frame.contentWindow.postMessage({ type: 'avitolog:theme:set', value: theme }, new URL(frame.src, window.location.href).origin); }
  function watchFrame(frame) { if (!frameAllowed(frame) || watched.has(frame)) return; watched.add(frame); frame.addEventListener('load', function () { sendFrame(frame); }); sendFrame(frame); }
  function syncFrames() { Array.prototype.forEach.call(document.querySelectorAll('iframe#avitoAccountsFrame, iframe.kp-editor-embed'), watchFrame); Array.prototype.forEach.call(document.querySelectorAll('iframe#avitoAccountsFrame, iframe.kp-editor-embed'), sendFrame); }
  function updateButton(button) {
    if (!button) return;
    var label = theme === 'light' ? 'Включить тёмный режим' : 'Включить светлый режим';
    button.textContent = theme === 'light' ? '🌙' : '☀️'; button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(theme === 'light'));
  }
  function apply(value) {
    theme = value; document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; document.body.classList.toggle('day-mode', value === 'light');
    var meta = document.querySelector('meta[name="color-scheme"]'); if (meta) meta.setAttribute('content', value);
    updateButton(document.getElementById('dayModeToggle')); updateButton(document.getElementById('avitoDayModeToggle')); syncFrames();
  }
  function choose(value, broadcast) {
    if (!valid(value)) return Promise.reject(new Error('invalid_theme'));
    revision += 1; var ownerRevision = revision; apply(value);
    if (broadcast !== false && channel) { try { channel.postMessage({ type: 'theme', value: value }); } catch (_) {} }
    var operation = writeTail.catch(function () {}).then(function () {
      if (revision !== ownerRevision) return 'superseded';
      return record(value, function () { return revision === ownerRevision; }).then(function (result) {
        if (result === null || revision !== ownerRevision) return 'superseded';
        try { window.localStorage.setItem(LEGACY, value === 'light' ? '1' : ''); } catch (_) {}
        return 'indexeddb';
      }, function () {
        if (revision !== ownerRevision) return 'superseded';
        window.localStorage.setItem(LEGACY, value === 'light' ? '1' : ''); return 'localstorage';
      });
    });
    writeTail = operation;
    return operation.then(function (storage) { if (revision === ownerRevision && storage !== 'superseded') document.body.dataset.themeStorage = storage; }, function (error) {
      if (revision === ownerRevision) { document.body.dataset.themeStorage = 'temporary';
      var button = document.getElementById('dayModeToggle') || document.getElementById('avitoDayModeToggle'); if (button) button.title += '. Браузер не подтвердил сохранение темы.'; }
      throw error;
    });
  }
  function init() {
    if (initialized) return; initialized = true;
    var editor = /\/kp-editor\.html$/.test(location.pathname), actions = document.querySelector('.topbar-actions') || (editor ? document.querySelector('.top') : null);
    if ((editor || location.pathname.indexOf('/integrations/avito-accounts') === 0) && !location.searchParams.has('embedded') && actions && !document.getElementById('avitoDayModeToggle')) {
      var button = document.createElement('button'); button.id = 'avitoDayModeToggle'; button.type = 'button'; button.className = editor ? 'btn' : 'button'; button.addEventListener('click', function () { choose(theme === 'light' ? 'dark' : 'light').catch(function () {}); }); actions.appendChild(button);
    }
    apply(legacy());
    window.toggleDayMode = function () { choose(theme === 'light' ? 'dark' : 'light').catch(function () {}); };
    window.initDayMode = function () { apply(theme); };
    try { if (window.BroadcastChannel) { channel = new window.BroadcastChannel('avitolog-display-theme-v1'); channel.onmessage = function (event) { var data = event.data; if (data && data.type === 'theme' && valid(data.value)) { revision += 1; apply(data.value); } }; } } catch (_) {}
    window.addEventListener('storage', function (event) { if (!channel && event.key === LEGACY && (event.newValue === '1' || event.newValue === '')) { revision += 1; apply(event.newValue === '1' ? 'light' : 'dark'); } });
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (window.parent === window || event.source !== window.parent || PARENTS.indexOf(event.origin) === -1 || !data || data.type !== 'avitolog:theme:set' || !valid(data.value) || Object.keys(data).some(function (key) { return key !== 'type' && key !== 'value'; })) return;
      choose(data.value).catch(function () {});
    });
    if (window.MutationObserver) new window.MutationObserver(function (records) {
      records.forEach(function (entry) { Array.prototype.forEach.call(entry.addedNodes, function (node) { if (node.nodeType !== 1) return; if (node.tagName === 'IFRAME') watchFrame(node); else if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll('iframe#avitoAccountsFrame, iframe.kp-editor-embed'), watchFrame); }); });
    }).observe(document.body, { childList: true, subtree: true });
    var initialRevision = revision;
    readyTask = record().then(function (stored) { document.body.dataset.themeStorage = 'indexeddb'; if (valid(stored) && revision === initialRevision) apply(stored); }, function () { document.body.dataset.themeStorage = 'localstorage'; });
  }
  window.AVITOLOG_THEME = Object.freeze({ current: function () { return theme; }, set: function (value) { if (!initialized && document.body) init(); return choose(value); }, ready: function () { if (!initialized && document.body) init(); return readyTask || Promise.resolve(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
