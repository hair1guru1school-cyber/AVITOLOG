(function () {
  'use strict';

  if (window.AVITOLOG_ADS_CACHE) return;

  var DATABASE = 'avitolog_ads_cache';
  var STORE = 'snapshots';
  var TIMEOUT = 1200;
  var memory = Object.create(null);
  var versions = Object.create(null);
  var reads = Object.create(null);
  var database = null;
  var opening = null;
  var writeTail = Promise.resolve();
  var lastStamp = 0;

  function limit(key) {
    if (typeof key !== 'string' || key.length > 512) return 0;
    if (key.indexOf('avitolog_ads_dashboard_v1:') === 0 && key.length > 26) return 64000;
    if (key.indexOf('avitolog_ads_snapshot_v1:') === 0 && key.length > 25) return 500000;
    return 0;
  }

  function valid(key, raw) {
    var maximum = limit(key);
    return maximum > 0 && typeof raw === 'string' && raw.length <= maximum;
  }

  function fingerprint(raw) {
    if (raw === null) return 'removed';
    var hash = 2166136261;
    for (var index = 0; index < raw.length; index += 1) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return raw.length + ':' + (hash >>> 0).toString(16);
  }

  function localRead(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw !== null && !valid(key, raw)) return null;
      var meta = null;
      try { meta = JSON.parse(window.localStorage.getItem(key + ':cache-meta')); } catch (error) {}
      if (meta && typeof meta.updatedAt === 'number' && Number.isFinite(meta.updatedAt) && meta.updatedAt >= 0 && meta.fingerprint === fingerprint(raw)) {
        return { key: key, raw: raw, updatedAt: meta.updatedAt };
      }
      return raw === null ? null : { key: key, raw: raw, updatedAt: 0 };
    } catch (error) { return null; }
  }

  function localWrite(record) {
    try {
      window.localStorage.setItem(record.key + ':cache-meta', JSON.stringify({
        updatedAt: record.updatedAt,
        fingerprint: fingerprint(record.raw)
      }));
      if (record.raw === null) window.localStorage.removeItem(record.key);
      else window.localStorage.setItem(record.key, record.raw);
      return true;
    } catch (error) { return false; }
  }

  function get(key) {
    if (!limit(key)) return null;
    if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
    var record = localRead(key);
    if (record) {
      lastStamp = Math.max(lastStamp, record.updatedAt);
      memory[key] = record.raw;
    }
    return record ? record.raw : null;
  }

  function open() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    var pending = new Promise(function (resolve) {
      var request;
      var settled = false;
      var timer = setTimeout(function () { finish(null); }, TIMEOUT);
      function finish(db) {
        if (settled) {
          if (db) db.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        database = db;
        if (db) db.onversionchange = function () {
          db.close();
          if (database === db) database = null;
        };
        if (db) db.onclose = function () { if (database === db) database = null; };
        resolve(db);
      }
      try {
        if (!window.indexedDB) { finish(null); return; }
        request = window.indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
        };
        request.onsuccess = function () { finish(request.result); };
        request.onerror = request.onblocked = function () { finish(null); };
      } catch (error) { finish(null); }
    });
    opening = pending;
    pending.then(function () { if (opening === pending) opening = null; });
    return pending;
  }

  function operate(mode, key, record) {
    return open().then(function (db) {
      if (!db) return { ok: false, value: null };
      return new Promise(function (resolve) {
        var transaction;
        var result = null;
        var settled = false;
        var timer = setTimeout(function () {
          try { if (transaction) transaction.abort(); } catch (error) {}
          db.close();
          if (database === db) database = null;
          finish(false);
        }, TIMEOUT);
        function finish(ok) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ok: ok, value: result });
        }
        try {
          transaction = db.transaction(STORE, mode === 'read' ? 'readonly' : 'readwrite');
          transaction.oncomplete = function () { finish(true); };
          transaction.onerror = transaction.onabort = function () { finish(false); };
          var store = transaction.objectStore(STORE);
          if (mode === 'read') {
            var request = store.get(key);
            request.onsuccess = function () { result = request.result || null; };
            request.onerror = function () { finish(false); };
          } else store.put(record);
        } catch (error) {
          if (!transaction) {
            db.close();
            if (database === db) database = null;
          }
          finish(false);
        }
      });
    });
  }

  function enqueue(mode, key, record, expectedVersion) {
    var pending = writeTail.then(function () {
      if (expectedVersion !== undefined && (versions[key] || 0) !== expectedVersion) return { ok: false };
      return operate(mode, key, record);
    });
    writeTail = pending.catch(function () { return { ok: false }; });
    return writeTail;
  }

  function read(key) {
    if (!limit(key)) return Promise.resolve(null);
    if (versions[key]) return Promise.resolve(memory[key]);
    if (reads[key]) return reads[key];
    var version = versions[key] || 0;
    var fallback = localRead(key);
    var fallbackRaw = get(key);
    var pending = operate('read', key).then(function (result) {
      if ((versions[key] || 0) !== version) return memory[key];
      var record = result.value;
      var validRecord = result.ok && record && record.key === key && (record.raw === null || valid(key, record.raw));
      var recordStamp = validRecord && Number.isFinite(record.updatedAt) ? record.updatedAt : 0;
      if (validRecord && (!fallback || recordStamp >= fallback.updatedAt)) {
        record.updatedAt = recordStamp;
        lastStamp = Math.max(lastStamp, recordStamp);
        memory[key] = record.raw;
        localWrite(record);
        return record.raw;
      }
      if (fallback) {
        lastStamp = Math.max(lastStamp, fallback.updatedAt);
        memory[key] = fallback.raw;
        if (result.ok) enqueue('write', key, fallback, version);
        return fallback.raw;
      }
      return fallbackRaw;
    }).catch(function () {
      return (versions[key] || 0) !== version ? memory[key] : fallbackRaw;
    });
    reads[key] = pending;
    pending.then(function () { if (reads[key] === pending) delete reads[key]; });
    return pending;
  }

  function write(key, raw) {
    if (!valid(key, raw)) return Promise.resolve(false);
    versions[key] = (versions[key] || 0) + 1;
    memory[key] = raw;
    var record = { key: key, raw: raw, updatedAt: lastStamp = Math.max(Date.now(), lastStamp + 1) };
    var local = localWrite(record);
    return enqueue('write', key, record).then(function (result) { return local || result.ok; });
  }

  function remove(key) {
    if (!limit(key)) return Promise.resolve(false);
    versions[key] = (versions[key] || 0) + 1;
    memory[key] = null;
    var record = { key: key, raw: null, updatedAt: lastStamp = Math.max(Date.now(), lastStamp + 1) };
    var local = localWrite(record);
    return enqueue('write', key, record).then(function (result) { return local || result.ok; });
  }

  window.AVITOLOG_ADS_CACHE = { get: get, read: read, write: write, remove: remove };
})();
