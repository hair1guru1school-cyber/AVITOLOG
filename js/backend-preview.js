(function () {
  'use strict';
  var SESSION_KEY = 'avitolog_backend_preview_session';
  var cfg = window.AVITOLOG_SUPABASE || {};
  var status = document.getElementById('previewStatus');
  var loginCard = document.getElementById('loginCard');
  var loadCard = document.getElementById('loadCard');

  function setStatus(text) { status.textContent = text; }
  function session() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('avitolog_backend_app_session') || 'null');
    } catch (e) { return null; }
  }
  function showReady() { loginCard.classList.add('off'); loadCard.classList.remove('off'); }

  document.getElementById('previewLoginBtn').addEventListener('click', async function () {
    var button = this; button.disabled = true; setStatus('Проверяю вход и RLS...');
    try {
      var response = await fetch(cfg.url + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('previewEmail').value.trim(), password: document.getElementById('previewPassword').value })
      });
      var data = await response.json();
      if (!response.ok || !data.access_token) throw new Error(data.error_description || data.msg || 'Ошибка входа');
      document.getElementById('previewPassword').value = '';
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: data.access_token, expires_at: data.expires_at }));
      showReady(); setStatus('Вход выполнен. Можно загрузить изолированную копию.');
    } catch (error) { setStatus('Ошибка: ' + error.message); }
    finally { button.disabled = false; }
  });

  document.getElementById('loadSnapshotBtn').addEventListener('click', async function () {
    var current = session();
    if (!current || !current.access_token) { setStatus('Сессия истекла. Войдите снова.'); loginCard.classList.remove('off'); loadCard.classList.add('off'); return; }
    var button = this; button.disabled = true; setStatus('Загружаю проверенный snapshot из Supabase...');
    try {
      var response = await fetch(cfg.url + '/rest/v1/migration_source_snapshots?select=checksum,raw_backup,created_at&order=created_at.desc&limit=20', { headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + current.access_token } });
      var rows = await response.json();
      if (!response.ok) throw new Error((rows && rows.message) || ('HTTP ' + response.status));
      var found = (rows || []).find(function (row) { try { var c = JSON.parse(row.raw_backup.keys.avitolog_clients || '[]'); return c.length >= 90; } catch (e) { return false; } });
      if (!found) throw new Error('Проверенный snapshot не найден');
      var backup = found.raw_backup, prefix = 'sb_backend::', remove = [];
      for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && key.indexOf(prefix) === 0) remove.push(key); }
      remove.forEach(function (key) { localStorage.removeItem(key); });
      Object.keys(backup.keys || {}).forEach(function (key) { if (!/(auth|token|secret|password|api[_-]?key)/i.test(key)) localStorage.setItem(prefix + key, backup.keys[key]); });
      localStorage.setItem(prefix + 'avitolog_current_user', 'fil');
      localStorage.setItem(prefix + 'avitolog_drive_bypass', '1');
      sessionStorage.setItem('avitolog_backend_preview_summary', JSON.stringify({ checksum: found.checksum, keyCount: Object.keys(backup.keys || {}).length }));
      setStatus('Готово: ' + Object.keys(backup.keys || {}).length + ' ключей. Открываю привычный AVITOLOG...');
      window.location.href = 'index.html?backendPreview=1&backendSource=supabase';
    } catch (error) { setStatus('Ошибка загрузки preview: ' + error.message); button.disabled = false; }
  });

  if (session() && session().access_token) showReady();
})();
