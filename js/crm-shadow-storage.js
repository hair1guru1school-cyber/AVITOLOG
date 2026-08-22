/**
 * CRM Shadow Storage — дублирует все CRM/проектные данные из localStorage → IndexedDB.
 * IndexedDB не очищается при «очистить кэш» и гораздо надёжнее localStorage.
 * При каждом localStorage.setItem на нужный ключ — пишет и в IndexedDB.
 * Каждые 3 минуты делает полный снимок всех ключей.
 */
(function () {
  'use strict';

  var DB_NAME    = 'avitolog_shadow_v1';
  var DB_VERSION = 1;
  var LIVE_STORE = 'live';       // живые ключи: {key, value, updatedAt}
  var SNAP_STORE = 'snapshots';  // снимки:       {savedAt, keyCount, keys}

  var BACKUP_PREFIXES = [
    'avitolog_projects',
    'avitolog_goals_v1',
    'avitolog_goal_achievements_v1',
    'avitolog_clients',
    'avitolog_active_client',
    'crm_tasks_v1',
    'avitolog_assets',
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

  function takeSnapshot(db) {
    try {
      var keys = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (isBackupKey(k)) {
          try { keys[k] = localStorage.getItem(k); } catch (e2) {}
        }
      }
      var count = Object.keys(keys).length;
      if (count === 0) return;
      var savedAt = new Date().toISOString();
      var snap = { savedAt: savedAt, keyCount: count, keys: keys };

      var txSnap = db.transaction(SNAP_STORE, 'readwrite');
      txSnap.objectStore(SNAP_STORE).put(snap);

      var txLive = db.transaction(LIVE_STORE, 'readwrite');
      var lStore = txLive.objectStore(LIVE_STORE);
      Object.keys(keys).forEach(function (k) {
        lStore.put({ key: k, value: keys[k], updatedAt: savedAt });
      });

      try {
        localStorage.setItem('_crm_shadow_last_snap', savedAt);
      } catch (e3) {}
    } catch (e) {}
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
    }, 3 * 60 * 1000);
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
      if (_db) takeSnapshot(_db);
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
