/**
 * Резервная копия: касса, CRM, проекты (и связанные месячные снимки) в один JSON-файл.
 */
(function() {
  'use strict';

  var FORMAT = 'avitolog-backup-v1';

  function isBackupKey(k) {
    if (!k || typeof k !== 'string') return false;
    if (k.indexOf('avitolog_projects') === 0) return true;
    if (k.indexOf('avitolog_goals_v1') === 0) return true;
    if (k.indexOf('avitolog_goal_achievements_v1') === 0) return true;
    if (k.indexOf('avitolog_clients') === 0) return true;
    if (k.indexOf('avitolog_active_client') === 0) return true;
    if (k.indexOf('crm_tasks_v1') === 0) return true;
    if (k.indexOf('avitolog_assets') === 0) return true;
    if (k === 'avitolog_assets_projects_v1') return true;
    if (k.indexOf('client_tags_') === 0) return true;
    if (k.indexOf('client_avatar_') === 0) return true;
    if (k.indexOf('crm_ads_') === 0) return true;
    return false;
  }

  function collectBackupPayload() {
    var keys = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || !isBackupKey(k)) continue;
        try {
          keys[k] = localStorage.getItem(k);
        } catch (e) {}
      }
    } catch (e) {}
    return {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      note: 'Касса (активы, снимки месяцев), CRM (клиенты, задачи, теги, аватары, реклама), проекты и цели.',
      keyCount: Object.keys(keys).length,
      keys: keys
    };
  }

  function triggerDownload(obj) {
    var blob = new Blob([JSON.stringify(obj, null, 0)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    var ymd = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    var fname = 'avitolog-backup-' + ymd.getFullYear() + '-' + pad(ymd.getMonth() + 1) + '-' + pad(ymd.getDate()) + '-' + pad(ymd.getHours()) + pad(ymd.getMinutes()) + '.json';
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function downloadBackup() {
    var payload = collectBackupPayload();
    triggerDownload(payload);
    try {
      alert('Сохранено ключей: ' + payload.keyCount + '. Файл скачан — положи в надёжное место (облако, папка).');
    } catch (e) {}
  }

  function restoreBackup(obj) {
    if (!obj || obj.format !== FORMAT || !obj.keys || typeof obj.keys !== 'object') {
      alert('Неверный формат файла (ожидается ' + FORMAT + ').');
      return;
    }
    var list = Object.keys(obj.keys);
    var n = list.length;
    if (n === 0) {
      alert('В файле нет ключей.');
      return;
    }
    var msg = 'Восстановить ' + n + ' ключей';
    if (obj.createdAt) msg += ' из копии от ' + obj.createdAt;
    msg += '? Текущие данные по этим ключам в браузере будут заменены.';
    if (!confirm(msg)) return;

    var ok = 0;
    var fail = 0;
    list.forEach(function(k) {
      if (!isBackupKey(k)) return;
      try {
        var v = obj.keys[k];
        if (v === null || v === undefined) return;
        localStorage.setItem(k, String(v));
        ok++;
      } catch (e) {
        fail++;
      }
    });
    alert('Готово: записано ' + ok + (fail ? ', ошибок: ' + fail : '') + '. Перезагрузи страницу (F5).');
    try {
      if (typeof window.location !== 'undefined' && window.location.reload) {
        if (confirm('Перезагрузить сейчас?')) window.location.reload();
      }
    } catch (e2) {}
  }

  function restoreFromFileInput(el) {
    var f = el && el.files && el.files[0];
    if (el) el.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var obj = JSON.parse(reader.result);
        restoreBackup(obj);
      } catch (e) {
        alert('Не удалось прочитать JSON: ' + (e && e.message ? e.message : e));
      }
    };
    reader.onerror = function() {
      alert('Ошибка чтения файла.');
    };
    reader.readAsText(f, 'UTF-8');
  }

  window.__avitologDownloadDataBackup = downloadBackup;
  window.__avitologRestoreDataBackup = restoreBackup;
  window.__avitologRestoreDataBackupFromFile = restoreFromFileInput;
})();
