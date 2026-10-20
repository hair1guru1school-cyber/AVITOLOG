/**
 * Автобэкап всех данных профиля САША в Google Drive.
 * Сохраняет только ключи бизнес-данных Саши, включая месячные снимки.
 * Триггеры: любая запись в localStorage + каждые 60с + старт приложения.
 * Папка на Drive: AVITOLOG_SASHA_BACKUP (внутри CRM_ROOT).
 * Файлы: sasha-crm-backup-latest.json + ежедневные sasha-crm-backup-YYYY-MM-DD-HHmm.json
 */
(function () {
  'use strict';
  if (window.AVITOLOG_BACKEND_PREVIEW) return;

  var FORMAT = 'avitolog-sasha-backup-v1';
  var BACKUP_FOLDER_NAME = 'AVITOLOG_SASHA_BACKUP';
  var LATEST_FILENAME = 'sasha-crm-backup-latest.json';

  var LS_FOLDER_ID = 'avitolog_sasha_backup_folder_id';
  var LS_LATEST_FILE_ID = 'avitolog_sasha_backup_latest_file_id';

  var DEBOUNCE_MS = 3500;
  var AUTO_INTERVAL_MS = 60000;

  var _debounceTimer = null;
  var _running = false;
  var _lastBackupHash = '';

  /* ─── Профиль ─────────────────────────────────────── */

  function isSashaProfile() {
    return typeof window.AVITOLOG_KEY_SUFFIX === 'string' &&
      window.AVITOLOG_KEY_SUFFIX === '_sasha';
  }

  function backupUserAllowed() {
    if (!isSashaProfile()) return false;
    if (!window.AVITOLOG_BACKEND_MODE) return true;
    if (window.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) return false;
    try {
      var identity = window.__avitologBackendIdentity();
      return !!identity && identity.email === 'cyplakovaleksandr153@gmail.com';
    } catch (error) { return false; }
  }

  function backupContext() {
    if (!backupUserAllowed()) return null;
    if (!window.AVITOLOG_BACKEND_MODE) return { scope: '', id: '' };
    try {
      var identity = window.__avitologBackendIdentity();
      var verified = window.__avitologVerifiedDriveIdentity();
      if (!verified || verified.id !== identity.id || verified.email !== identity.email) return null;
      return { scope: 'v2_' + verified.id + '_' + encodeURIComponent(verified.email), id: verified.id };
    } catch (error) { return null; }
  }

  function assertBackupContext(context) {
    var current = backupContext();
    if (!current || current.scope !== context.scope) throw new Error('Пользователь бэкапа изменился. Повторите после подключения своего Drive.');
  }

  function metadataKey(key, context) {
    return context.scope ? key + '__' + context.scope : key;
  }

  /* ─── Сбор ключей ──────────────────────────────────── */

  function collectKeys() {
    var result = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (!isBackupDataKey(k)) continue;
        result[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return result;
  }

  function isBackupDataKey(key) {
    return /^(avitolog_clients|avitolog_projects|crm_tasks_v1)_sasha$/.test(key) ||
      /^avitolog_goals_v1_sasha(?:_month_\d{4}-\d{2})?$/.test(key) ||
      /^avitolog_goal_achievements_v1_sasha$/.test(key) ||
      /^avitolog_assets_(?:my|sasha|base)_v2_sasha(?:_month_\d{4}-\d{2})?$/.test(key);
  }

  function quickHash(keys) {
    var ordered = {};
    Object.keys(keys).sort().forEach(function (key) { ordered[key] = keys[key]; });
    var s = JSON.stringify(ordered);
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return String(h) + '_' + Object.keys(keys).length;
  }

  /* ─── Drive helpers ───────────────────────────────── */

  async function driveTokenSafe(context) {
    if (typeof getDriveToken !== 'function') throw new Error('getDriveToken не доступен');
    var token = await getDriveToken();
    if (context) assertBackupContext(context);
    return token;
  }

  function crmRoot() {
    if (typeof CRM_ROOT !== 'undefined' && CRM_ROOT) return CRM_ROOT;
    return null;
  }

  async function driveFetchWithRetry(url, init, context) {
    for (var attempt = 0; attempt < 3; attempt++) {
      assertBackupContext(context);
      var response = null;
      try {
        response = await fetch(url, init);
      } catch (error) {
        if (!error || error.name !== 'TypeError' || attempt === 2) throw error;
      }
      if (response && ([429, 500, 502, 503, 504].indexOf(response.status) < 0 || attempt === 2)) return response;
      assertBackupContext(context);
      var delay = attempt === 0 ? 500 : 1500;
      var retryAfter = response && response.headers && response.headers.get('Retry-After');
      if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)) delay = Math.max(delay, Math.min(10000, Number(retryAfter) * 1000));
      await new Promise(function (resolve) { setTimeout(resolve, delay); });
    }
  }

  async function ensureFolder(context) {
    assertBackupContext(context);
    try {
      var cached = localStorage.getItem(metadataKey(LS_FOLDER_ID, context));
      if (cached) return cached;
    } catch (e) {}
    if (typeof driveGetOrCreateFolder !== 'function') throw new Error('Drive API не загружен');
    var root = context.scope ? 'root' : crmRoot();
    var folderName = context.scope ? BACKUP_FOLDER_NAME + '_' + context.id : BACKUP_FOLDER_NAME;
    var id = await driveGetOrCreateFolder(folderName, root);
    assertBackupContext(context);
    if (!id) throw new Error('Не удалось создать папку ' + BACKUP_FOLDER_NAME);
    try { localStorage.setItem(metadataKey(LS_FOLDER_ID, context), id); } catch (e2) {}
    return id;
  }

  async function findFileInFolder(folderId, name, context) {
    var token = await driveTokenSafe(context);
    var q = "name='" + name.replace(/'/g, "\\'") + "' and '" + folderId + "' in parents and trashed=false";
    var r = await driveFetchWithRetry(
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)',
      { headers: { Authorization: 'Bearer ' + token } }, context
    );
    if (!r.ok) throw new Error('Drive LIST ' + r.status + ': ' + (await r.text()).slice(0, 120));
    var d = await r.json();
    if (!Array.isArray(d.files)) throw new Error('Drive LIST: некорректный ответ');
    if (!d.files.length) return null;
    return d.files[0].id;
  }

  async function uploadFile(folderId, fileName, bodyText, existingId, context) {
    var token = await driveTokenSafe(context);
    if (existingId) {
      var resp = await driveFetchWithRetry(
        'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(existingId) + '?uploadType=media',
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: new Blob([bodyText], { type: 'application/json' })
        }, context
      );
      if (!resp.ok) {
        var et = await resp.text().catch(function () { return ''; });
        if (resp.status === 404) return null;
        throw new Error('Drive PATCH ' + resp.status + ': ' + et.slice(0, 120));
      }
      return existingId;
    }
    var boundary = 'sasha_bk_' + Date.now();
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
    if (!backupUserAllowed()) return;

    var token;
    try { token = await driveTokenSafe(); } catch (e) { return; }
    if (!token) return;
    var context = backupContext();
    if (!context) return;
    if (_running) return;

    var keys = collectKeys();
    var keyCount = Object.keys(keys).length;
    if (keyCount === 0) return;

    var hash = context.scope + '|' + quickHash(keys);
    if (!force && hash === _lastBackupHash) return;

    _running = true;
    var folderId;
    try {
      folderId = await ensureFolder(context);
    } catch (e) {
      showToast('⚠️ Саша-бэкап: не удалось получить папку Drive. ' + (e.message || ''), true);
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
        profile: 'sasha',
        keyCount: keyCount,
        keys: keys
      }, null, 0);

      // 1. Latest-файл
      var latestId = null;
      try { latestId = localStorage.getItem(metadataKey(LS_LATEST_FILE_ID, context)); } catch (e) {}
      if (!latestId) latestId = await findFileInFolder(folderId, LATEST_FILENAME, context);
      var newId = await uploadFile(folderId, LATEST_FILENAME, payload, latestId, context);
      if (!newId) {
        newId = await uploadFile(folderId, LATEST_FILENAME, payload, null, context);
      }
      assertBackupContext(context);
      try { localStorage.setItem(metadataKey(LS_LATEST_FILE_ID, context), newId); } catch (e) {}

      // 2. Ежедневный снапшот
      var dailyFlagKey = metadataKey('avitolog_sasha_backup_daily_' + dateStr, context);
      var dailyDone = false;
      try { dailyDone = localStorage.getItem(dailyFlagKey) === '1'; } catch (e) {}
      if (!dailyDone) {
        var dailyName = 'sasha-crm-backup-' + dateStr + '-' + timeStr + '.json';
        await uploadFile(folderId, dailyName, payload, null, context);
        assertBackupContext(context);
        try { localStorage.setItem(dailyFlagKey, '1'); } catch (e) {}
      }

      _lastBackupHash = hash;
      showToast('☁️ Саша-бэкап сохранён (' + keyCount + ' ключей · ' + dateStr + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ')', false);
    } catch (err) {
      showToast('⚠️ Саша-бэкап Drive не удался: ' + (err.message || String(err)).slice(0, 100), true);
    } finally {
      _running = false;
    }
  }

  /* ─── Планировщик ─────────────────────────────────── */

  function scheduleBackup() {
    if (!backupUserAllowed()) return;
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
      var el = document.getElementById('avitologSashaBackupToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'avitologSashaBackupToast';
        el.style.cssText = [
          'position:fixed', 'right:16px',
          'bottom:max(60px,calc(env(safe-area-inset-bottom,0px) + 38px))',
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
      el.style.background = isErr ? 'rgba(85,18,26,0.97)' : 'rgba(7,28,50,0.97)';
      el.style.border = isErr ? '1px solid rgba(255,90,90,0.5)' : '1px solid rgba(60,140,255,0.5)';
      el.style.color = isErr ? '#ffd4d4' : '#c0e4ff';
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
      if (k && isBackupDataKey(String(k))) {
        scheduleBackup();
      }
    };
  }());

  /* ─── Автозапуск ──────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { runBackup(true).catch(function () {}); }, 9000);
    setInterval(function () { runBackup(false).catch(function () {}); }, AUTO_INTERVAL_MS);
  });

  /* ─── Публичный API ───────────────────────────────── */

  window.__sashaBackupNow = function () {
    return runBackup(true);
  };
  window.__sashaBackupSchedule = scheduleBackup;

}());
