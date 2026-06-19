(function () {
  'use strict';
  var SESSION_KEY = 'avitolog_backend_preview_session';
  var cfg = window.AVITOLOG_SUPABASE || {};
  var status = document.getElementById('previewStatus');
  var loginCard = document.getElementById('loginCard');
  var loadCard = document.getElementById('loadCard');

  function setStatus(text) { status.textContent = text; }
  function session() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
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
      var response = await fetch('http://127.0.0.1:8787/api/migration/preview-snapshot', { headers: { Authorization: 'Bearer ' + current.access_token } });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      var backup = data.result.backup;
      var remove = [];
      for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && (key.indexOf('avitolog_') === 0 || key.indexOf('crm_') === 0)) remove.push(key); }
      remove.forEach(function (key) { localStorage.removeItem(key); });
      Object.keys(backup.keys).forEach(function (key) { localStorage.setItem(key, backup.keys[key]); });
      localStorage.setItem('avitolog_current_user', 'fil');
      localStorage.setItem('avitolog_drive_bypass', '1');
      sessionStorage.setItem('avitolog_backend_preview_summary', JSON.stringify({ checksum: data.result.checksum, originalKeyCount: backup.originalKeyCount, previewKeyCount: backup.previewKeyCount, omittedKeys: backup.omittedKeys }));
      setStatus('Готово: ' + backup.previewKeyCount + ' безопасных ключей из ' + backup.originalKeyCount + '. Открываю preview...');
      window.location.href = 'index.html?backendPreview=1';
    } catch (error) { setStatus('Ошибка загрузки preview: ' + error.message); button.disabled = false; }
  });

  if (session() && session().access_token) showReady();
})();
