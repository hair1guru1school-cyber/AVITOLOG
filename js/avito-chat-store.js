(function () {
  'use strict';
  if (window.AvitoChatStore) return;
  var DB_NAME = 'avitolog_chat_preferences_v1', STORE = 'settings', LIMIT = 128 * 1024, TIMEOUT = 5000;
  var prefixes = ['avitolog_chat_preferences_v1:', 'avitolog_chat_layout_v1:', 'avitolog_chat_accounts_v1:', 'avitolog_chat_replies_v1:'];
  var cache = Object.create(null), queues = Object.create(null), db = null, opening = null, readyPromise = null, initialized = false, wasOpened = false;
  function failure(code) { var error = new Error(code); error.code = code; return error; }
  function utf8Size(value) {
    var bytes = 0;
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code < 128) bytes++; else if (code < 2048) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }
  function keyKind(key) {
    if (typeof key !== 'string' || key.length > 1024 || /[\u0000-\u001f\u007f]/.test(key)) return -1;
    for (var i = 0; i < prefixes.length; i++) if (key.indexOf(prefixes[i]) === 0 && key.length > prefixes[i].length) return i;
    return -1;
  }
  function valid(key, raw) {
    var kind = keyKind(key); if (kind < 0 || typeof raw !== 'string' || raw.length > LIMIT || utf8Size(raw) > LIMIT) return false;
    try {
      var value = JSON.parse(raw);
      if (kind === 2) return Array.isArray(value) && value.every(function (id) { return typeof id === 'string' && id.length <= 1024; });
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    } catch (_) { return false; }
  }
  function local() { try { return window.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null); } catch (_) { return null; } }
  function legacy(key) {
    try { var storage = local(), value = storage && storage.getItem(key); return valid(key, value) ? value : null; } catch (_) { return null; }
  }
  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      var provider, request, done = false;
      function finish(error, result) {
        if (done) { if (result) result.close(); return; }
        done = true; clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      }
      var timer = setTimeout(function () { finish(failure('chat_storage_open_timeout')); }, TIMEOUT);
      try {
        provider = window.indexedDB; if (!provider) { finish(failure('chat_storage_unavailable')); return; }
        request = provider.open(DB_NAME, 1);
        request.onupgradeneeded = function () {
          if (done) { try { request.transaction.abort(); } catch (_) {} return; }
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
        };
        request.onblocked = function () { finish(failure('chat_storage_blocked')); };
        request.onerror = function () { finish(failure('chat_storage_open_failed')); };
        request.onsuccess = function () {
          var result = request.result;
          if (done) { result.close(); return; }
          db = result; wasOpened = true;
          result.onversionchange = function () { result.close(); if (db === result) db = null; };
          finish(null, result);
        };
      } catch (_) { finish(failure('chat_storage_unavailable')); }
    });
    return opening;
  }
  function transaction(mode, action) {
    return new Promise(function (resolve, reject) {
      if (!db) { reject(failure('chat_storage_unavailable')); return; }
      var tx, result, done = false;
      function finish(error) {
        if (done) return; done = true; clearTimeout(timer);
        if (error) reject(error); else resolve(result);
      }
      var timer = setTimeout(function () { try { if (tx) tx.abort(); } catch (_) {} finish(failure('chat_storage_timeout')); }, TIMEOUT);
      try {
        tx = db.transaction(STORE, mode);
        tx.oncomplete = function () { finish(); };
        tx.onabort = function () { finish(failure('chat_storage_transaction_aborted')); };
        tx.onerror = function () { /* Aborted transactions are not successful writes. */ };
        action(tx.objectStore(STORE), function (value) { result = value; });
      } catch (_) { try { if (tx) tx.abort(); } catch (_) {} finish(failure('chat_storage_transaction_failed')); }
    });
  }
  function readAll() {
    return transaction('readonly', function (store, result) {
      var values = Object.create(null), cursor = store.openCursor();
      cursor.onsuccess = function () {
        var row = cursor.result;
        if (!row) { result(values); return; }
        var record = row.value;
        if (record && record.key === row.primaryKey && valid(record.key, record.value)) values[record.key] = record.value;
        row.continue();
      };
    });
  }
  function legacyEntries() {
    var entries = [], storage = local(); if (!storage) return entries;
    try {
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i); if (keyKind(key) < 0) continue;
        var value = storage.getItem(key); if (valid(key, value)) entries.push({ key: key, value: value });
      }
    } catch (_) {}
    return entries;
  }
  function migrate(records) {
    return transaction('readwrite', function (store, result) {
      var committed = Object.create(null); result(committed);
      records.forEach(function (record) {
        var request = store.get(record.key);
        request.onsuccess = function () {
          var existing = request.result;
          if (existing && existing.key === record.key && valid(existing.key, existing.value)) { committed[record.key] = existing.value; return; }
          store.put({ key: record.key, value: record.value }); committed[record.key] = record.value;
        };
      });
    }).then(function (values) { Object.keys(values).forEach(function (key) { cache[key] = values[key]; }); });
  }
  function ready() {
    if (!readyPromise) readyPromise = open().then(readAll).then(function (values) {
      cache = values;
      var missing = legacyEntries().filter(function (record) { return !Object.prototype.hasOwnProperty.call(cache, record.key); });
      return missing.length ? migrate(missing).catch(function () {}) : undefined;
    }).catch(function () {
      if (db) { db.close(); db = null; }
    }).then(function () { initialized = true; });
    return readyPromise;
  }
  function getItem(key) {
    if (keyKind(key) < 0) throw failure('chat_storage_invalid_key');
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    return legacy(key);
  }
  function setItem(key, raw) {
    if (!valid(key, raw)) return Promise.reject(failure('chat_storage_invalid_record'));
    var previous = queues[key] || Promise.resolve();
    var next = previous.catch(function () {}).then(ready).then(function () {
      if (db) return transaction('readwrite', function (store) { store.put({ key: key, value: raw }); });
      if (wasOpened) throw failure('chat_storage_unavailable');
      var storage = local(); if (!storage) throw failure('chat_storage_unavailable');
      try { storage.setItem(key, raw); } catch (_) { throw failure('chat_storage_write_failed'); }
    }).then(function () { cache[key] = raw; });
    queues[key] = next;
    next.then(function () { if (queues[key] === next) delete queues[key]; }, function () { if (queues[key] === next) delete queues[key]; });
    return next;
  }
  function stats() {
    var value = { localBytes: 0, localEntries: 0, categories: { crm: 0, projects: 0, finance: 0, imageCache: 0, other: 0 }, backend: db ? 'indexeddb' : 'unavailable', indexedDBAvailable: !!db, localReadable: false, ready: initialized };
    try {
      var storage = local(); if (!storage) return value;
      var count = storage.length; value.localReadable = true;
      if (!db && !wasOpened) value.backend = 'localstorage';
      for (var i = 0; i < count; i++) {
        var key = storage.key(i); if (typeof key !== 'string') continue;
        var raw = storage.getItem(key); if (typeof raw !== 'string') continue;
        var bytes = (key.length + raw.length) * 2, category = /^avito_img_/i.test(key) ? 'imageCache' : /^avitolog_(assets_|goals_v1|goal_achievements|project_payment)/i.test(key) || /cash|finance|payment|expense|income/i.test(key) ? 'finance' : /crm|leads/i.test(key) ? 'crm' : /project|goals|calendar|tasks/i.test(key) ? 'projects' : 'other';
        value.localBytes += bytes; value.localEntries++; value.categories[category] += bytes;
      }
    } catch (_) { value.localReadable = false; if (!db) value.backend = 'unavailable'; }
    return value;
  }
  window.AvitoChatStore = Object.freeze({ ready: ready, getItem: getItem, setItem: setItem, stats: stats });
})();
