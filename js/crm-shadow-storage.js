/**
 * CRM Shadow Storage — дублирует все CRM/проектные данные из localStorage → IndexedDB.
 * IndexedDB не очищается при «очистить кэш» и гораздо надёжнее localStorage.
 * При каждом localStorage.setItem на нужный ключ — пишет и в IndexedDB.
 * Снимки только при изменениях, не чаще раза в 30 минут.
 * Новая история ограничена 96 снимками; старую очищают только после резервной копии.
 */
(function () {
  'use strict';

  var DB_NAME    = 'avitolog_shadow_v1';
  var DB_VERSION = 1;
  var LIVE_STORE = 'live';       // живые ключи: {key, value, updatedAt}
  var SNAP_STORE = 'snapshots';  // снимки:       {savedAt, keyCount, keys}
  var SNAPSHOT_INTERVAL = 30 * 60 * 1000;
  var SNAPSHOT_LIMIT = 96;
  var RETENTION_KEY = '_crm_shadow_bounded_from_v2';

  var BACKUP_PREFIXES = [
    'avitolog_projects',
    'avitolog_goals_v1',
    'avitolog_goal_achievements_v1',
    'avitolog_clients',
    'avitolog_active_client',
    'crm_tasks_v1',
    'avitolog_assets',
    'avitolog_backend_dirty',
    'avitolog_backend_pending_payload_',
    'client_tags_',
    'client_avatar_',
    'crm_ads_'
  ];
  var BACKUP_EXACT = ['avitolog_assets_projects_v1'];

  function isBackupKey(k) {
    if (!k || typeof k !== 'string') return false;
    if (BACKUP_EXACT.indexOf(k) !== -1) return true;
    for (var i = 0; i < BACKUP_PREFIXES.length; i++) {
      if (k.indexOf(BACKUP_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  var _db    = null;
  var _queue = [];
  var _snapshotRunning = false;

  function openDB(callback) {
    try {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(LIVE_STORE)) {
          db.createObjectStore(LIVE_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(SNAP_STORE)) {
          db.createObjectStore(SNAP_STORE, { keyPath: 'savedAt' });
        }
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        _db.onversionchange = function () { _db.close(); _db = null; };
        try { callback(_db); } catch (ce) {}
        var q = _queue.slice(); _queue = [];
        q.forEach(function (fn) { try { fn(_db); } catch (err) {} });
      };
      req.onerror = function () {};
    } catch (e) {}
  }

  function writeLiveKey(db, key, value) {
    try {
      var tx = db.transaction(LIVE_STORE, 'readwrite');
      tx.objectStore(LIVE_STORE).put({ key: key, value: value, updatedAt: new Date().toISOString() });
    } catch (e) {}
  }

  function shadowWrite(key, value) {
    if (!isBackupKey(key)) return;
    if (_db) {
      writeLiveKey(_db, key, value);
    } else {
      _queue.push(function (db) { writeLiveKey(db, key, value); });
    }
  }

  function takeSnapshot(db, force) {
    if (_snapshotRunning) return;
    try {
      var keys = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (isBackupKey(k)) {
          var value = localStorage.getItem(k);
          if (value !== null) keys[k] = value;
        }
      }
      var count = Object.keys(keys).length;
      if (count === 0) return;
      var now = Date.now();
      var boundedFrom = null;
      try {
        boundedFrom = localStorage.getItem(RETENTION_KEY);
        if (!boundedFrom || !isFinite(Date.parse(boundedFrom))) {
          boundedFrom = new Date(now).toISOString();
          localStorage.setItem(RETENTION_KEY, boundedFrom);
        }
      } catch (e2) { boundedFrom = null; }
      _snapshotRunning = true;
      var savedAt = null;
      var tx = db.transaction([SNAP_STORE, LIVE_STORE], 'readwrite');
      var snapshots = tx.objectStore(SNAP_STORE);
      tx.onabort = tx.onerror = function () { _snapshotRunning = false; };
      tx.oncomplete = function () {
        _snapshotRunning = false;
        if (savedAt) {
          try { localStorage.setItem('_crm_shadow_last_snap', savedAt); } catch (e3) {}
        }
      };
      var latest = snapshots.openCursor(null, 'prev');
      latest.onsuccess = function () {
        var previous = latest.result && latest.result.value;
        var same = previous && previous.keys && Object.keys(previous.keys).length === count &&
          Object.keys(keys).every(function (key) { return previous.keys[key] === keys[key]; });
        var elapsed = previous ? now - Date.parse(previous.savedAt) : Infinity;
        var live = tx.objectStore(LIVE_STORE);
        Object.keys(keys).forEach(function (key) {
          live.put({ key: key, value: keys[key], updatedAt: new Date(now).toISOString() });
        });
        if (same || (!force && elapsed >= 0 && elapsed < SNAPSHOT_INTERVAL)) return;
        savedAt = new Date(previous && Date.parse(previous.savedAt) === now ? now + 1 : now).toISOString();
        snapshots.put({ savedAt: savedAt, keyCount: count, keys: keys });
        // Only prune history created since the bounded policy was installed.
        // Key cursors avoid loading gigabytes of legacy snapshot values.
        if (boundedFrom) {
          var retained = 0;
          var cursor = snapshots.openKeyCursor(IDBKeyRange.lowerBound(boundedFrom), 'prev');
          cursor.onsuccess = function () {
            if (!cursor.result) return;
            if (++retained > SNAPSHOT_LIMIT) snapshots.delete(cursor.result.primaryKey);
            cursor.result.continue();
          };
        }
      };
    } catch (e) { _snapshotRunning = false; }
  }

  // Патч localStorage.setItem
  var _origSetItem = localStorage.setItem.bind(localStorage);
  Object.defineProperty(localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: function (key, value) {
      var stringValue = String(value);
      try { shadowWrite(key, stringValue); } catch (e) {}
      try {
        _origSetItem(key, value);
      } catch (err) {
        try { shadowWrite(key, stringValue); } catch (e2) {}
        throw err;
      }
    }
  });

  // Инициализация
  openDB(function (db) {
    takeSnapshot(db);
    setInterval(function () {
      try { takeSnapshot(db); } catch (e) {}
    }, SNAPSHOT_INTERVAL);
  });

  // Публичный API для CRM/table.html
  window.__crmShadow = {
    dbName: DB_NAME,
    liveStore: LIVE_STORE,
    snapStore: SNAP_STORE,
    isBackupKey: isBackupKey,
    writeLive: function (key, value) {
      try { shadowWrite(String(key), String(value)); } catch (e) {}
    },
    takeSnapshot: function () {
      if (_db) takeSnapshot(_db, true);
    },
    readAllLive: function (callback) {
      if (!_db) { callback(null); return; }
      try {
        var result = {};
        var tx = _db.transaction(LIVE_STORE, 'readonly');
        var req = tx.objectStore(LIVE_STORE).openCursor();
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            result[cursor.value.key] = cursor.value;
            cursor.continue();
          } else {
            callback(result);
          }
        };
        req.onerror = function () { callback(null); };
      } catch (e) { callback(null); }
    },
    getLastSnapshotTime: function () {
      try { return localStorage.getItem('_crm_shadow_last_snap') || null; } catch (e) { return null; }
    }
  };
})();
