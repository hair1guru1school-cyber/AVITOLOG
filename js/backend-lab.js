(function () {
  'use strict';

  var SESSION_KEY = 'avitolog_backend_lab_session';
  var cfg = window.AVITOLOG_SUPABASE || {};
  var form = document.getElementById('loginForm');
  var loginPanel = document.getElementById('loginPanel');
  var sessionPanel = document.getElementById('sessionPanel');
  var statusEl = document.getElementById('status');
  var organizationCard = document.getElementById('organizationCard');
  var loginBtn = document.getElementById('loginBtn');
  var backupFile = document.getElementById('backupFile');
  var migrationPreview = document.getElementById('migrationPreview');
  var autoPreviewBtn = document.getElementById('autoPreviewBtn');
  var saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
  var currentBackupPayload = null;
  var prepareStagingBtn = document.getElementById('prepareStagingBtn');
  var savedSnapshotChecksum = '';

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function saveSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user
    }));
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function request(path, options) {
    var response = await fetch(cfg.url + path, options);
    var text = await response.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { message: text }; }
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || ('HTTP ' + response.status));
    return data;
  }

  async function loadOrganization(session) {
    var rows = await request('/rest/v1/organizations?select=id,name,organization_members(role)&limit=5', {
      headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + session.access_token }
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('RLS работает, но организация для пользователя не найдена');
    var org = rows[0];
    var role = org.organization_members && org.organization_members[0] ? org.organization_members[0].role : 'member';
    organizationCard.innerHTML = '<b>' + String(org.name || 'AVITOLOG') + '</b><br>Роль: ' + String(role) + '<br>RLS: доступ разрешён';
    loginPanel.classList.add('off');
    sessionPanel.classList.add('on');
    setStatus('Успешно: Auth и RLS работают. Основной фронт ещё не переключён.', 'ok');
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    loginBtn.disabled = true;
    setStatus('Проверяю вход и права доступа...');
    try {
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      var session = await request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      document.getElementById('password').value = '';
      saveSession(session);
      await loadOrganization(session);
    } catch (error) {
      clearSession();
      setStatus('Ошибка: ' + error.message, 'err');
    } finally {
      loginBtn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearSession();
    sessionPanel.classList.remove('on');
    loginPanel.classList.remove('off');
    organizationCard.textContent = '';
    setStatus('Тестовая сессия удалена из этой вкладки.');
  });

  async function runMigrationPreview(payload, label) {
    migrationPreview.classList.add('on');
    migrationPreview.textContent = 'Проверяю ' + label + '...';
    var response = await fetch('http://127.0.0.1:8787/api/migration/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || ('HTTP ' + response.status));
    var preview = result.preview;
    currentBackupPayload = payload;
    saveSnapshotBtn.disabled = false;
    saveSnapshotBtn.textContent = 'Сохранить полный snapshot в Supabase staging';
    var relations = preview.relations;
    var duplicateLines = [];
    (preview.duplicates.clients || []).forEach(function (group) {
      duplicateLines.push('• ' + group.legacyKey + ': ' + group.records.map(function (record) { return record.label; }).join(' ↔ '));
    });
    migrationPreview.textContent = [
      'DRY RUN: данные не записаны',
      'Источник: ' + preview.source,
      'Клиенты: ' + preview.counts.clients + ' (уникальных ключей: ' + preview.uniqueCounts.clients + ')',
      'Проекты: ' + preview.counts.projects + ' (уникальных ключей: ' + preview.uniqueCounts.projects + ')',
      'Связи: ' + relations.linked + ' привязано, ' + relations.orphaned + ' без клиента, ' + relations.ambiguous + ' неоднозначных',
      'По ID/папке: ' + relations.linkedById + '; по уникальному имени: ' + relations.linkedByName,
      relations.orphanSamples.length ? 'Без клиента: ' + relations.orphanSamples.join(', ') : '',
      relations.ambiguousSamples.length ? 'Неоднозначные: ' + relations.ambiguousSamples.join(', ') : '',
      preview.warnings.length ? 'Предупреждения: ' + preview.warnings.join('; ') : 'Предупреждений нет',
      duplicateLines.length ? 'Конфликты клиентов:\n' + duplicateLines.join('\n') : ''
    ].filter(Boolean).join('\n');
  }

  function collectCurrentBackup() {
    var keys = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || (key.indexOf('avitolog_') !== 0 && key.indexOf('crm_') !== 0)) continue;
      if (key.indexOf('avitolog_drive_auth') === 0 || key.indexOf('avitolog_fil_backup_') === 0) continue;
      keys[key] = localStorage.getItem(key);
    }
    return { format: 'avitolog-fil-backup-v1', createdAt: new Date().toISOString(), profile: 'fil', keys: keys };
  }

  autoPreviewBtn.addEventListener('click', async function () {
    autoPreviewBtn.disabled = true;
    try {
      await runMigrationPreview(collectCurrentBackup(), 'текущие данные AVITOLOG');
    } catch (error) {
      migrationPreview.classList.add('on');
      migrationPreview.textContent = 'Ошибка проверки: ' + error.message;
    } finally {
      autoPreviewBtn.disabled = false;
    }
  });

  saveSnapshotBtn.addEventListener('click', async function () {
    if (!currentBackupPayload) {
      setStatus('Сначала выполните автоматическую проверку.', 'err');
      return;
    }
    if (!window.confirm('Сохранить полный исходный бэкап в защищённую staging-зону Supabase? Рабочие CRM-таблицы не изменятся.')) return;
    var session = readSession();
    if (!session || !session.access_token) {
      setStatus('Тестовая сессия истекла. Войдите снова.', 'err');
      return;
    }
    saveSnapshotBtn.disabled = true;
    setStatus('Сохраняю полный snapshot в staging...');
    try {
      var response = await fetch('http://127.0.0.1:8787/api/migration/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ backup: currentBackupPayload })
      });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      var result = data.result;
      savedSnapshotChecksum = result.checksum;
      prepareStagingBtn.disabled = false;
      setStatus((result.alreadyExists ? 'Snapshot уже был сохранён ранее.' : 'Полный snapshot сохранён.') +
        '\nКлючей: ' + result.summary.keyCount + '\nChecksum: ' + result.checksum, 'ok');
    } catch (error) {
      setStatus('Ошибка сохранения snapshot: ' + error.message, 'err');
    } finally {
      saveSnapshotBtn.disabled = false;
    }
  });

  prepareStagingBtn.addEventListener('click', async function () {
    if (!savedSnapshotChecksum) return;
    if (!window.confirm('Разобрать snapshot на промежуточные записи? Рабочие CRM-таблицы останутся без изменений.')) return;
    var session = readSession();
    if (!session || !session.access_token) { setStatus('Тестовая сессия истекла. Войдите снова.', 'err'); return; }
    prepareStagingBtn.disabled = true;
    setStatus('Разбираю snapshot в staging...');
    try {
      var response = await fetch('http://127.0.0.1:8787/api/migration/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ checksum: savedSnapshotChecksum })
      });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      var result = data.result;
      setStatus('Snapshot разобран в staging.\nЗаписей: ' + result.records + '\nПроблем: ' + result.issues + '\nСтатусы: ' + JSON.stringify(result.statuses), 'ok');
    } catch (error) {
      setStatus('Ошибка подготовки staging: ' + error.message, 'err');
      prepareStagingBtn.disabled = false;
    }
  });

  backupFile.addEventListener('change', async function () {
    var file = backupFile.files && backupFile.files[0];
    migrationPreview.classList.add('on');
    if (!file) {
      migrationPreview.textContent = 'Файл не выбран.';
      return;
    }
    migrationPreview.textContent = 'Читаю и проверяю ' + file.name + '...';
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ');
      var payload = JSON.parse(await file.text());
      await runMigrationPreview(payload, file.name);
    } catch (error) {
      migrationPreview.textContent = 'Ошибка проверки: ' + error.message;
    }
  });

  var session = readSession();
  if (session && session.access_token) {
    loadOrganization(session).catch(function (error) {
      clearSession();
      setStatus('Сессия устарела: ' + error.message, 'err');
    });
  }
})();
