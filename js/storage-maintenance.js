(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.mount(root);
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  var DB = 'avitolog_shadow_v1';
  var KEEP = 96;
  var POLICY_KEY = '__crm_shadow_policy_v2';

  function workingRows(rows) { return rows.filter(function (row) { return row.key !== POLICY_KEY; }); }
  function liveValues(rows) { return JSON.stringify(workingRows(rows).map(function (row) { return [row.key, row.value]; })); }
  function localValues(rows) {
    return JSON.stringify(rows.filter(function (row) {
      return row[0] !== '_crm_shadow_last_snap' && !/^avitolog_ads_snapshot_v1:.*:cache-meta$/.test(row[0]);
    }));
  }

  async function openExisting(env) {
    var databases = await env.indexedDB.databases();
    if (!databases.some(function (db) { return db.name === DB; })) throw Error('База резервных снимков не найдена. Ничего не изменено.');
    return new Promise(function (resolve, reject) {
      var request = env.indexedDB.open(DB);
      request.onupgradeneeded = function () { request.transaction.abort(); };
      request.onerror = function () { reject(request.error); };
      request.onsuccess = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('live') || !db.objectStoreNames.contains('snapshots')) {
          db.close(); reject(Error('Неожиданная структура базы.')); return;
        }
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
    });
  }

  function localData(env) {
    var rows = [];
    for (var i = 0; i < env.localStorage.length; i++) {
      var key = env.localStorage.key(i);
      rows.push([key, env.localStorage.getItem(key)]);
    }
    return rows.sort(function (a, b) { return a[0].localeCompare(b[0]); });
  }

  function readState(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['live', 'snapshots'], 'readonly');
      var live = tx.objectStore('live').getAll();
      var count = tx.objectStore('snapshots').count();
      tx.oncomplete = function () {
        var policy = live.result.find(function (row) { return row.key === POLICY_KEY; });
        resolve({ live: workingRows(live.result), count: count.result, boundedFrom: policy ? policy.value : null });
      };
      tx.onabort = tx.onerror = function () { reject(tx.error || Error('Не удалось прочитать базу.')); };
    });
  }

  function pruneSnapshots(db, expectedLive, progress) {
    return new Promise(function (resolve, reject) {
      var removed = 0;
      var kept = 0;
      var oldestKept = null;
      var problem = null;
      // Lock live while pruning, but never write or remove any live record.
      var tx = db.transaction(['live', 'snapshots'], 'readwrite');
      var live = tx.objectStore('live').getAll();
      live.onsuccess = function () {
        if (liveValues(live.result) !== liveValues(JSON.parse(expectedLive))) {
          problem = Error('Данные изменились после копирования. Сохраните свежую копию и повторите.');
          tx.abort(); return;
        }
        var snapshots = tx.objectStore('snapshots');
        var cursor = snapshots.openKeyCursor(null, 'prev');
        cursor.onsuccess = function () {
          var row = cursor.result;
          if (!row) {
            if (oldestKept) tx.objectStore('live').put({ key: POLICY_KEY, value: oldestKept, updatedAt: new Date().toISOString() });
            return;
          }
          if (++kept > KEEP) { snapshots.delete(row.primaryKey); removed++; }
          else oldestKept = row.primaryKey;
          if (progress && removed && removed % 250 === 0) progress(removed);
          row.continue();
        };
      };
      tx.oncomplete = function () { resolve({ removed: removed, retained: Math.min(KEEP, kept) }); };
      tx.onabort = tx.onerror = function () { reject(problem || tx.error || Error('Очистка отменена; изменения не сохранены.')); };
    });
  }

  function mount(env) {
    var doc = env.document;
    var status = doc.getElementById('status');
    var summary = doc.getElementById('summary');
    var exportButton = doc.getElementById('export');
    var clean = doc.getElementById('clean');
    var verified = doc.getElementById('archive-verified');
    var backup = null;
    var busy = false;
    function buttons() { exportButton.disabled = busy; clean.disabled = busy || !backup || !verified.checked; }
    function fail(error) { status.textContent = error.message || String(error); }
    async function audit() {
      var db = await openExisting(env);
      try {
        var data = await readState(db);
        summary.textContent = 'Снимков: ' + data.count + '. Останется: ' + Math.min(KEEP, data.count) + '. Текущих записей: ' + data.live.length + '.';
      } finally { db.close(); }
    }
    exportButton.onclick = async function () {
      busy = true; buttons();
      try {
        var db = await openExisting(env);
        var data;
        try { data = await readState(db); } finally { db.close(); }
        var next = { format: 'avitolog-current-storage-v1', origin: env.location.origin, createdAt: new Date().toISOString(), localStorage: localData(env), live: data.live, snapshotCount: data.count, boundedFrom: data.boundedFrom };
        var text = JSON.stringify(next);
        var blob = new env.Blob([text], { type: 'application/json' });
        var filename = 'AVITOLOG-current-storage-20261122.json';
        if (env.CompressionStream) {
          blob = await new env.Response(blob.stream().pipeThrough(new env.CompressionStream('gzip'))).blob();
          filename += '.gz';
        }
        var link = doc.createElement('a');
        link.href = env.URL.createObjectURL(blob); link.download = filename;
        doc.body.appendChild(link); link.click(); link.remove();
        env.setTimeout(function () { env.URL.revokeObjectURL(link.href); }, 60000);
        backup = next;
        status.textContent = 'Текущие данные выгружены. Проверьте сохранённый файл и полную внешнюю копию перед очисткой.';
      } catch (error) { backup = null; fail(error); }
      finally { busy = false; buttons(); }
    };
    verified.onchange = buttons;
    clean.onclick = async function () {
      if (busy || !backup || !verified.checked) return;
      busy = true; buttons();
      status.textContent = 'Очищаю только старую резервную историю…';
      try {
        if (localValues(localData(env)) !== localValues(backup.localStorage)) throw Error('Настройки изменились. Сохраните свежую копию.');
        var db = await openExisting(env);
        var result;
        try {
          result = await pruneSnapshots(db, JSON.stringify(backup.live), function (count) { status.textContent = 'Обрабатываю старые снимки: ' + count + '. Ожидаю завершения записи…'; });
        } finally { db.close(); }
        await audit();
        status.textContent = 'Готово. Удалено старых снимков: ' + result.removed + '. Сохранено последних: ' + result.retained + '. Текущие данные не изменены. Для освобождения файлов на диске закройте Chrome и откройте заново.';
        backup = null; verified.checked = false;
      } catch (error) { fail(error); }
      finally { busy = false; buttons(); }
    };
    audit().then(buttons).catch(function (error) { busy = true; fail(error); });
  }
  return { openExisting: openExisting, readState: readState, pruneSnapshots: pruneSnapshots, localData: localData, mount: mount, keep: KEEP };
});
