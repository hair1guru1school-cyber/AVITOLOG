/**
 * Автобэкап всех данных профиля ФИЛ в Google Drive.
 * Сохраняет ВСЕ ключи localStorage (включая _month_ снапшоты).
 * Триггеры: любая запись в localStorage + каждые 60с + страт приложения.
 * Папка на Drive: AVITOLOG_FIL_BACKUP (внутри CRM_ROOT).
 * Файлы: fil-crm-backup-latest.json + ежедневные fil-crm-backup-YYYY-MM-DD-HHmm.json
 */
(function () {
  'use strict';

  var FORMAT = 'avitolog-fil-backup-v1';
  var BACKUP_FOLDER_NAME = 'AVITOLOG_FIL_BACKUP';
  var LATEST_FILENAME = 'fil-crm-backup-latest.json';

  var LS_FOLDER_ID = 'avitolog_fil_backup_folder_id';
  var LS_LATEST_FILE_ID = 'avitolog_fil_backup_latest_file_id';

  var DEBOUNCE_MS = 3500;
  var AUTO_INTERVAL_MS = 60000;

  var _debounceTimer = null;
  var _running = false;
  var _lastBackupHash = '';

  /* ─── Профиль ─────────────────────────────────────── */

  function isFilProfile() {
    return typeof window.AVITOLOG_KEY_SUFFIX === 'string' &&
      window.AVITOLOG_KEY_SUFFIX === '' &&
      typeof window.AVITOLOG_USER !== 'undefined';
  }

  /* ─── Сбор ключей ──────────────────────────────────── */

  function collectKeys() {
    var result = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        // Исключаем Сашины ключи и служебные
        if (/_sasha/.test(k)) continue;
        if (k.indexOf('avitolog_drive_auth') === 0) continue;
        if (k === 'avitolog_current_user' || k === 'avitolog_profile_bookmark') continue;
        if (k.indexOf('avitolog_fil_backup_') === 0) continue;
        if (k.indexOf('avitolog_sasha_') === 0) continue;
        // Берём всё avitolog_ и crm_ — включая _month_ снапшоты!
        if (k.indexOf('avitolog_') === 0 || k.indexOf('crm_') === 0) {
          result[k] = localStorage.getItem(k);
        }
      }
    } catch (e) {}
    return result;
  }

  function quickHash(keys) {
    var s = JSON.stringify(keys);
    var h = 0;
    for (var i = 0; i < Math.min(s.length, 2000); i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return String(h) + '_' + Object.keys(keys).length;
  }

  /* ─── Drive helpers ───────────────────────────────── */

  function driveTokenSafe() {
    if (typeof getDriveToken === 'function') return getDriveToken();
    return Promise.reject(new Error('getDriveToken не доступен'));
  }

  function crmRoot() {
    if (typeof CRM_ROOT !== 'undefined' && CRM_ROOT) return CRM_ROOT;
    return null;
  }

  async function ensureFolder() {
    try {
      var cached = localStorage.getItem(LS_FOLDER_ID);
      if (cached) return cached;
    } catch (e) {}
    if (typeof driveGetOrCreateFolder !== 'function') throw new Error('Drive API не загружен');
    var root = crmRoot();
    var id = await driveGetOrCreateFolder(BACKUP_FOLDER_NAME, root);
    if (!id) throw new Error('Не удалось создать папку ' + BACKUP_FOLDER_NAME);
    try { localStorage.setItem(LS_FOLDER_ID, id); } catch (e2) {}
    return id;
  }

  async function findFileInFolder(folderId, name) {
    var token = await driveTokenSafe();
    var q = "name='" + name.replace(/'/g, "\\'") + "' and '" + folderId + "' in parents and trashed=false";
    var r = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    var d = await r.json();
    if (!r.ok || !d.files || !d.files.length) return null;
    return d.files[0].id;
  }

  async function uploadFile(folderId, fileName, bodyText, existingId) {
    var token = await driveTokenSafe();
    if (existingId) {
      var resp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(existingId) + '?uploadType=media',
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: new Blob([bodyText], { type: 'application/json' })
        }
      );
      if (!resp.ok) {
        var et = await resp.text().catch(function () { return ''; });
        if (resp.status === 404) return null; // файл удалён — нужно пересоздать
        throw new Error('Drive PATCH ' + resp.status + ': ' + et.slice(0, 120));
      }
      return existingId;
    }
    var boundary = 'fil_bk_' + Date.now();
    var nl = '\r\n';
    var meta = JSON.stringify({ name: fileName, parents: [folderId] });
    var enc = new TextEncoder();
    var pre = '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl + meta + nl +
      '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl;
    var post = nl + '--' + boundary + '--';
    var preB = enc.encode(pre);
    var textB = enc.encode(bodyText);
    var postB = enc.encode(post);
    var buf = new Uint8Array(preB.length + textB.length + postB.length);
    buf.set(preB, 0);
    buf.set(textB, preB.length);
    buf.set(postB, preB.length + textB.length);
    var resp2 = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: buf
      }
    );
    var result = await resp2.json();
    if (!result.id) throw new Error('Drive CREATE: ' + JSON.stringify(result.error || result).slice(0, 120));
    return result.id;
  }

  /* ─── Основная функция бэкапа ─────────────────────── */

  async function runBackup(force) {
    if (_running) return;
    if (!isFilProfile()) return;

    var token;
    try { token = await driveTokenSafe(); } catch (e) { return; }
    if (!token) return;

    var keys = collectKeys();
    var keyCount = Object.keys(keys).length;
    if (keyCount === 0) return;

    var hash = quickHash(keys);
    if (!force && hash === _lastBackupHash) return; // данные не изменились

    _running = true;
    var folderId;
    try {
      folderId = await ensureFolder();
    } catch (e) {
      showToast('⚠️ Бэкап: не удалось получить папку Drive. ' + (e.message || ''), true);
      _running = false;
      return;
    }

    try {
      var now = new Date();
      var dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
      var timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');

      var payload = JSON.stringify({
        format: FORMAT,
        createdAt: now.toISOString(),
        profile: 'fil',
        keyCount: keyCount,
        keys: keys
      }, null, 0);

      // 1. Latest-файл (всегда перезаписываем)
      var latestId = null;
      try { latestId = localStorage.getItem(LS_LATEST_FILE_ID); } catch (e) {}
      if (!latestId) latestId = await findFileInFolder(folderId, LATEST_FILENAME);
      var newId = await uploadFile(folderId, LATEST_FILENAME, payload, latestId);
      if (!newId) {
        // файл удалён на Drive — создаём заново
        newId = await uploadFile(folderId, LATEST_FILENAME, payload, null);
      }
      try { localStorage.setItem(LS_LATEST_FILE_ID, newId); } catch (e) {}

      // 2. Ежедневный снапшот (один раз в день)
      var dailyFlagKey = 'avitolog_fil_backup_daily_' + dateStr;
      var dailyDone = false;
      try { dailyDone = localStorage.getItem(dailyFlagKey) === '1'; } catch (e) {}
      if (!dailyDone) {
        var dailyName = 'fil-crm-backup-' + dateStr + '-' + timeStr + '.json';
        await uploadFile(folderId, dailyName, payload, null);
        try { localStorage.setItem(dailyFlagKey, '1'); } catch (e) {}
      }

      _lastBackupHash = hash;
      showToast('☁️ Бэкап сохранён (' + keyCount + ' ключей · ' + dateStr + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ')', false);
    } catch (err) {
      showToast('⚠️ Бэкап Drive не удался: ' + (err.message || String(err)).slice(0, 100), true);
    } finally {
      _running = false;
    }
  }

  /* ─── Планировщик ─────────────────────────────────── */

  function scheduleBackup() {
    if (!isFilProfile()) return;
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      _debounceTimer = null;
      runBackup(false).catch(function () {});
    }, DEBOUNCE_MS);
  }

  /* ─── Toast ───────────────────────────────────────── */

  var _toastTimer = null;
  function showToast(text, isErr) {
    try {
      var el = document.getElementById('avitologFilBackupToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'avitologFilBackupToast';
        el.style.cssText = [
          'position:fixed', 'right:16px',
          'bottom:max(22px,env(safe-area-inset-bottom,0px))',
          'z-index:2147483001',
          'max-width:min(92vw,360px)',
          'padding:9px 14px',
          'border-radius:11px',
          'font-size:12px', 'font-weight:700', 'line-height:1.4',
          'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
          'pointer-events:none',
          'transition:opacity .3s',
          'white-space:pre-wrap', 'text-align:center'
        ].join(';');
        document.body.appendChild(el);
      }
      el.style.background = isErr ? 'rgba(85,18,26,0.97)' : 'rgba(7,38,28,0.97)';
      el.style.border = isErr ? '1px solid rgba(255,90,90,0.5)' : '1px solid rgba(0,190,90,0.5)';
      el.style.color = isErr ? '#ffd4d4' : '#c0ffe0';
      el.style.opacity = '1';
      el.textContent = text;
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function () {
        _toastTimer = null;
        try { el.style.opacity = '0'; } catch (e) {}
      }, isErr ? 10000 : 4500);
    } catch (e) {}
  }

  /* ─── Перехват localStorage.setItem ──────────────── */

  (function hookStorage() {
    var prev = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      prev.call(localStorage, k, v);
      if (k && (k.indexOf('avitolog_') === 0 || k.indexOf('crm_') === 0)) {
        // Не планируем бэкап на служебные ключи бэкапа
        if (k.indexOf('avitolog_fil_backup_') !== 0) {
          scheduleBackup();
        }
      }
    };
  }());

  /* ─── Автозапуск ──────────────────────────────────── */

  // Первый бэкап через 8с после загрузки
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { runBackup(true).catch(function () {}); }, 8000);
    // Периодический бэкап каждые 60с
    setInterval(function () { runBackup(false).catch(function () {}); }, AUTO_INTERVAL_MS);
  });

  /* ─── Публичный API ───────────────────────────────── */

  window.__filBackupNow = function () {
    return runBackup(true);
  };
  window.__filBackupSchedule = scheduleBackup;

}());
