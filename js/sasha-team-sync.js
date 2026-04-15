/**
 * Синхронизация профиля «Саша» с Google Drive (как общая таблица):
 * — любое сохранение ключей *_sasha в localStorage → через ~2 с выгрузка merge в Drive;
 * — каждые ~8 с (если вкладка видна) — подтягивание с Drive и мягкое обновление CRM/Проекты/Касса.
 * Саша пишет у себя — файл на твоём Google Drive обновляется; у тебя данные подтягиваются автоматически.
 */
(function() {
  'use strict';

  var FORMAT = 'avitolog-sasha-team-v1';
  var SYNC_FOLDER = 'AVITOLOG_SASHA_TEAM';
  var SYNC_FILENAME = 'sasha-team-data.json';
  var LS_FILE_ID = 'avitolog_sasha_team_sync_file_id';
  var LS_FOLDER_ID = 'avitolog_sasha_team_sync_folder_id';

  var PUSH_DEBOUNCE_MS = 2200;
  var PULL_INTERVAL_MS = 8000;
  var _syncApplyDepth = 0;
  var _debouncePushTimer = null;
  var _pushRunning = false;
  var _pullRunning = false;
  var _autoPullTimer = null;

  function driveEmail() {
    try { return String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase(); } catch (e) { return ''; }
  }

  function shouldOfferSync() {
    // Любой контекст с ключами *_sasha (в т.ч. режим сотрудника с email Саши) — иначе pull/push и обновление UI отключались.
    return typeof window.AVITOLOG_KEY_SUFFIX === 'string' && window.AVITOLOG_KEY_SUFFIX === '_sasha';
  }

  function isSyncableKey(k) {
    if (!k || typeof k !== 'string') return false;
    if (k.indexOf('avitolog_drive_') === 0) return false;
    if (k.indexOf('_month_') >= 0) return false;
    if (k === LS_FILE_ID || k === LS_FOLDER_ID) return false;
    if (k === 'avitolog_current_user' || k === 'avitolog_profile_bookmark') return false;
    if (/_sasha$/.test(k)) return true;
    if (k.indexOf('_sasha_') >= 0) return true;
    return false;
  }

  var _toastTimer = null;
  function showSashaTeamToast(text, isErr) {
    try {
      var el = document.getElementById('avitologSashaSyncToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'avitologSashaSyncToast';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,440px);padding:12px 16px;border-radius:14px;font-size:13px;font-weight:700;line-height:1.4;box-shadow:0 12px 40px rgba(0,0,0,0.55);pointer-events:none;transition:opacity .25s;white-space:pre-wrap;word-break:break-word;text-align:center';
        document.body.appendChild(el);
      }
      el.style.background = isErr ? 'linear-gradient(180deg,rgba(90,24,30,0.98),rgba(50,12,18,0.99))' : 'linear-gradient(180deg,rgba(12,52,42,0.98),rgba(8,32,28,0.99))';
      el.style.border = isErr ? '1px solid rgba(255,140,140,0.55)' : '1px solid rgba(0,217,126,0.55)';
      el.style.color = isErr ? '#ffd6d6' : '#d4fff0';
      el.textContent = text;
      el.style.opacity = '1';
      if (_toastTimer) clearTimeout(_toastTimer);
      var hideMs = isErr ? 10000 : 5200;
      _toastTimer = setTimeout(function() {
        _toastTimer = null;
        try {
          if (el) el.style.opacity = '0';
        } catch (e2) {}
      }, hideMs);
    } catch (e) {}
  }

  /** Тост + строка под CRM — на телефоне/ GitHub Pages так видно, что ☁️ сработал. */
  function cloudSyncUserHint(kind, text) {
    showSashaTeamToast(text, kind === 'err');
    try {
      showTeamSyncLine(kind === 'err' ? 'err' : 'ok', text);
    } catch (e) {}
  }

  function waitForGoogleIdentityMs(maxMs) {
    var step = 120;
    var deadline = Date.now() + (maxMs || 5000);
    return new Promise(function(resolve) {
      function tick() {
        try {
          if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            resolve(true);
            return;
          }
        } catch (e) {}
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, step);
      }
      tick();
    });
  }

  function collectSashaKeys() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!isSyncableKey(k)) continue;
        try {
          var v = localStorage.getItem(k);
          if (v !== null) out[k] = v;
        } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  function applyKeysToLocal(keys) {
    if (!keys || typeof keys !== 'object') return 0;
    var n = 0;
    _syncApplyDepth++;
    try {
      Object.keys(keys).forEach(function(k) {
        if (!isSyncableKey(k)) return;
        try {
          var v = keys[k];
          if (v === null || v === undefined) return;
          var nv = String(v);
          var prev = localStorage.getItem(k);
          if (prev === nv) return;
          localStorage.setItem(k, nv);
          n++;
        } catch (e) {}
      });
    } finally {
      _syncApplyDepth--;
    }
    return n;
  }

  function isSashaDriveSession() {
    try {
      var em = String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase();
      var sashaEm = String(localStorage.getItem('avitolog_sasha_email') || 'cyplakovaleksandr153@gmail.com').trim().toLowerCase();
      return !!em && !!sashaEm && em === sashaEm;
    } catch (e) { return false; }
  }

  function crmRootId() {
    // Если залогинен именно Саша — пишем в его Drive root, а не в папку Фила
    if (isSashaDriveSession()) return 'root';
    if (typeof CRM_ROOT !== 'undefined' && CRM_ROOT) return CRM_ROOT;
    return '1d8oElVgTO2vzbs0HjOYPnReVmGUPltIk';
  }

  function showTeamSyncLine(kind, text) {
    try {
      var st = document.getElementById('crmSt');
      if (!st) return;
      st.style.display = 'block';
      st.className = kind === 'err' ? 'crm-st err' : 'crm-st';
      st.textContent = text;
    } catch (e) {}
  }

  window.__avitologSashaTeamResetCache = function() {
    try {
      localStorage.removeItem(LS_FILE_ID);
      localStorage.removeItem(LS_FOLDER_ID);
    } catch (e) {}
    showTeamSyncLine('ok', '☁️ Кэш пути к файлу синка сброшен. Нажми ☁️ ещё раз.');
  };

  async function ensureFolderId() {
    try {
      var cached = localStorage.getItem(LS_FOLDER_ID);
      if (cached) return cached;
    } catch (e) {}
    if (typeof driveGetOrCreateFolder !== 'function') throw new Error('Drive API не загружен');
    var id = await driveGetOrCreateFolder(SYNC_FOLDER, crmRootId());
    if (!id) throw new Error('Не удалось создать папку синка');
    try { localStorage.setItem(LS_FOLDER_ID, id); } catch (e2) {}
    return id;
  }

  async function findSyncFileId(parentId) {
    var token = await getDriveToken();
    var safeName = SYNC_FILENAME.replace(/'/g, "\\'");
    var q = "name='" + safeName + "' and '" + parentId + "' in parents and trashed=false";
    var r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,modifiedTime)', {
      headers: { Authorization: 'Bearer ' + token }
    });
    var d = await r.json();
    if (!r.ok || !d.files || !d.files.length) return null;
    return d.files[0].id;
  }

  var LS_REMOTE_FILE_ID = 'avitolog_sasha_sync_remote_file_id';

  async function ensureSyncFileId() {
    try {
      var fid = localStorage.getItem(LS_FILE_ID);
      if (fid) return fid;
    } catch (e) {}
    // Фил смотрит профиль Саши — пробуем файл из Сашиного Drive (если он поделился)
    if (!isSashaDriveSession()) {
      try {
        var remoteId = localStorage.getItem(LS_REMOTE_FILE_ID);
        if (remoteId) return remoteId;
      } catch (e2) {}
    }
    var parentId = await ensureFolderId();
    var found = await findSyncFileId(parentId);
    if (found) {
      try { localStorage.setItem(LS_FILE_ID, found); } catch (e3) {}
      return found;
    }
    return null;
  }

  async function createSyncFile(parentId, bodyText) {
    var token = await getDriveToken();
    var boundary = 'avitolog_sasha_' + Date.now();
    var nl = '\r\n';
    var meta = JSON.stringify({ name: SYNC_FILENAME, parents: [parentId] });
    var enc = new TextEncoder();
    var pre = '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl + meta + nl +
      '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl;
    var post = nl + '--' + boundary + '--';
    var preB = enc.encode(pre);
    var textB = enc.encode(bodyText || '{}');
    var postB = enc.encode(post);
    var buf = new Uint8Array(preB.length + textB.length + postB.length);
    buf.set(preB, 0);
    buf.set(textB, preB.length);
    buf.set(postB, preB.length + textB.length);
    var resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: buf
    });
    var result = await resp.json();
    if (!result.id) throw new Error((result.error && result.error.message) || 'Не создан файл синка');
    try { localStorage.setItem(LS_FILE_ID, result.id); } catch (e3) {}
    return result.id;
  }

  async function updateSyncFile(fileId, bodyText) {
    var token = await getDriveToken();
    var blob = new Blob([bodyText], { type: 'application/json' });
    var resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: blob
    });
    if (!resp.ok) {
      var errT = await resp.text();
      throw new Error('Запись в Drive: ' + resp.status + ' ' + errT.slice(0, 200));
    }
  }

  async function readRemotePayload() {
    var fileId = await ensureSyncFileId();
    if (!fileId) return null;
    var raw = await driveGetFileContent(fileId, 'application/json');
    if (!raw) {
      try { localStorage.removeItem(LS_FILE_ID); } catch (e) {}
      fileId = await ensureSyncFileId();
      if (!fileId) return null;
      raw = await driveGetFileContent(fileId, 'application/json');
    }
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      if (!obj || obj.format !== FORMAT || !obj.keys || typeof obj.keys !== 'object') return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  async function pullMerge() {
    try {
      var remote = await readRemotePayload();
      if (!remote) {
        return { ok: true, message: 'В облаке ещё нет файла синка — открой доступ к папке CRM обоим аккаунтам, профиль «Саша», затем ☁️.', applied: 0, noRemoteFile: true };
      }
      var local = collectSashaKeys();
      var merged = Object.assign({}, local, remote.keys);
      var n = applyKeysToLocal(merged);
      return { ok: true, message: 'Подтянуто, изменено полей: ' + n, applied: n };
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      showTeamSyncLine('err', '☁️ Ошибка чтения синка: ' + msg);
      return { ok: false, applied: 0, message: msg, syncError: true };
    }
  }

  async function pushMerge(opts) {
    opts = opts || {};
    var silentToast = !!opts.silentToast;
    try {
      var parentId = await ensureFolderId();
      var fileId = await ensureSyncFileId();
      var remote = await readRemotePayload();
      var local = collectSashaKeys();
      var baseKeys = (remote && remote.keys) ? remote.keys : {};
      var merged = Object.assign({}, baseKeys, local);
      var payload = {
        format: FORMAT,
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        byEmail: driveEmail() || '',
        note: 'CRM+Проекты+Касса (ключи *_sasha). Автосинк.',
        keyCount: Object.keys(merged).length,
        keys: merged
      };
      var text = JSON.stringify(payload);
      if (!fileId) {
        await createSyncFile(parentId, text);
      } else {
        await updateSyncFile(fileId, text);
      }
      var nKeys = Object.keys(merged).length;
      var storedFileId = '';
      try { storedFileId = localStorage.getItem(LS_FILE_ID) || ''; } catch (e) {}
      showTeamSyncLine('ok', '☁️ Выгружено в Drive: ' + nKeys + ' ключей.' + (isSashaDriveSession() && storedFileId ? ' ID файла: ' + storedFileId : ''));
      if (!silentToast) {
        if (nKeys === 0) {
          showSashaTeamToast('В облако нечего выгрузить: нет ключей *_sasha (проверь профиль «Саша» и 🔑 Drive).', true);
        } else {
          var msg = 'Данные сгружены в облако (' + nKeys + ' ключей).';
          if (isSashaDriveSession() && storedFileId) {
            msg += '\n\nID файла для Фила:\n' + storedFileId;
          }
          showSashaTeamToast(msg, false);
        }
      }
      return { ok: true, message: 'Выгружено ключей: ' + nKeys, fileId: storedFileId };
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      showTeamSyncLine('err', '☁️ Ошибка синка (запись/папка CRM): ' + msg);
      throw e;
    }
  }

  async function bidirectionalSync() {
    var r1 = await pullMerge();
    var r2 = await pushMerge();
    return {
      ok: true,
      message: r1.message + '\n\n' + r2.message,
      pullApplied: r1.applied || 0
    };
  }

  function refreshUiAfterPull() {
    try {
      if (typeof window.__crmRefreshAfterSashaSync === 'function') window.__crmRefreshAfterSashaSync();
    } catch (eCrm) {}
    try {
      if (typeof rerenderProjectsPreserveScroll === 'function' && typeof projectsMode !== 'undefined' && projectsMode) {
        rerenderProjectsPreserveScroll();
      }
    } catch (e) {}
    try {
      if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function' && typeof goalsMode !== 'undefined' && goalsMode) {
        window.AVITOLOG_GOALS.render();
      }
    } catch (e2) {}
    try {
      if (typeof window.__renderAssetsPage === 'function' && typeof assetsMode !== 'undefined' && assetsMode) {
        window.__renderAssetsPage();
      }
    } catch (e3) {}
    try {
      if (typeof refreshClientContents === 'function' && typeof docReady !== 'undefined' && !docReady &&
          typeof currentTab !== 'undefined' && ['analysis', 'presale', 'avito1'].indexOf(currentTab) >= 0 &&
          typeof projectsMode !== 'undefined' && !projectsMode && typeof goalsMode !== 'undefined' && !goalsMode) {
        refreshClientContents(true);
      }
    } catch (e4) {}
  }

  function scheduleAutoPush() {
    if (!shouldOfferSync()) return;
    if (_syncApplyDepth > 0) return;
    if (_debouncePushTimer) clearTimeout(_debouncePushTimer);
    _debouncePushTimer = setTimeout(function() {
      _debouncePushTimer = null;
      if (!shouldOfferSync() || document.hidden) return;
      if (_pushRunning || _pullRunning) return;
      _pushRunning = true;
      Promise.resolve()
        .then(function() {
          if (typeof getDriveToken !== 'function') return;
          return getDriveToken();
        })
        .then(function() {
          return pushMerge({ silentToast: true });
        })
        .catch(function(e) {
          console.warn('sasha-team-sync auto-push', e && e.message ? e.message : e);
        })
        .finally(function() {
          _pushRunning = false;
        });
    }, PUSH_DEBOUNCE_MS);
  }

  function runAutoPull() {
    if (!shouldOfferSync() || document.hidden) return;
    if (_pushRunning || _pullRunning) return;
    _pullRunning = true;
    Promise.resolve()
      .then(function() {
        if (typeof getDriveToken !== 'function') return null;
        return getDriveToken();
      })
      .then(function() {
        return pullMerge();
      })
      .then(function(res) {
        if (res && res.applied > 0) {
          refreshUiAfterPull();
          try {
            var st = document.getElementById('crmSt');
            if (st) {
              st.style.display = 'block';
              st.className = 'crm-st';
              st.textContent = '☁️ Синк Саша: обновлено с Drive (' + res.applied + ').';
            }
          } catch (e) {}
        }
      })
      .catch(function() {})
      .finally(function() {
        _pullRunning = false;
      });
  }

  function installLocalStorageHook() {
    try {
      var proto = Storage.prototype;
      var origSet = proto.setItem;
      if (proto.setItem.__avitologSashaPatched) return;
      proto.setItem = function(key, value) {
        origSet.call(this, key, value);
        if (this !== localStorage) return;
        if (_syncApplyDepth > 0) return;
        if (!shouldOfferSync()) return;
        if (!isSyncableKey(key)) return;
        scheduleAutoPush();
      };
      proto.setItem.__avitologSashaPatched = true;
    } catch (e) {
      console.warn('sasha-team-sync hook', e);
    }
  }

  function updateSashaTeamSyncBtn() {
    var btn = document.getElementById('sashaTeamSyncBtn');
    if (!btn) return;
    var can = shouldOfferSync();
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    if (can) {
      btn.style.opacity = '1';
      btn.style.filter = '';
      btn.title = 'Синк Саша ↔ Google Drive (авто: запись ~2 с после правок, подтягивание ~каждые 8 с). Вручную — полный цикл.';
    } else {
      btn.style.opacity = '0.55';
      btn.style.filter = 'grayscale(0.35)';
      btn.title = 'Сначала нажми «👤 Саша» в шапке и войди в 🔑 Drive — тогда подтянутся его CRM/Касса. Нажми для переключения на профиль Саши.';
    }
  }

  /**
   * Ручной ☁️: без confirm после await. Всегда дублируем статус в crmSt + тост (GitHub Pages / моб.).
   */
  async function syncUi() {
    try {
      cloudSyncUserHint('ok', '☁️ Нажато: готовлю синхронизацию…');
      if (!shouldOfferSync()) {
        cloudSyncUserHint('ok', '☁️ Включаю профиль «Саша» и перезагружаю страницу… Открой ссылку с ?u=sasha если снова пусто.');
        try {
          localStorage.setItem('avitolog_current_user', 'sasha');
          localStorage.setItem('avitolog_profile_bookmark', 'sasha');
        } catch (e0) {}
        setTimeout(function() { location.reload(); }, 500);
        return;
      }
      if (typeof getDriveToken !== 'function') {
        cloudSyncUserHint('err', '☁️ Ошибка: не загружен main.js. Обнови страницу (Ctrl+F5).');
        return;
      }
      var gisReady = await waitForGoogleIdentityMs(6000);
      if (!gisReady) {
        cloudSyncUserHint('err', '☁️ Не подгрузился Google (кнопка 🔑). Проверь интернет, обнови страницу и нажми 🔑 Drive, затем ☁️.');
        return;
      }
      try {
        await getDriveToken();
      } catch (eTok) {
        cloudSyncUserHint('err', '☁️ Нет входа в Google Drive. Сейчас откроется окно входа — выбери аккаунт, после перезагрузки нажми ☁️ ещё раз.');
        try {
          if (typeof window.startAuth === 'function') window.startAuth(null);
        } catch (e2) {}
        return;
      }
      cloudSyncUserHint('ok', '☁️ Обмен с Google Drive (загрузка и отправка данных)…');
      var res = await bidirectionalSync();
      var msg = (res && res.message) ? String(res.message) : 'Готово.';
      var oneLine = msg.replace(/\s+/g, ' ').trim();
      if (oneLine.length > 220) oneLine = oneLine.slice(0, 217) + '…';
      cloudSyncUserHint('ok', '☁️ Готово: ' + oneLine);
      refreshUiAfterPull();
    } catch (err) {
      var em = err && err.message ? err.message : String(err);
      cloudSyncUserHint('err', '☁️ Ошибка: ' + em);
    }
  }

  /** Вызывается из HTML до загрузки скрипта — не даём «пустому» клику. */
  window.__avitologSashaCloudClick = function() {
    try {
      if (typeof window.__avitologSashaTeamSyncUi === 'function') {
        var p = window.__avitologSashaTeamSyncUi();
        if (p && typeof p.catch === 'function') p.catch(function(e) {
          cloudSyncUserHint('err', '☁️ Сбой: ' + (e && e.message ? e.message : e));
        });
        return;
      }
    } catch (e) {}
    try {
      var st = document.getElementById('crmSt');
      if (st) {
        st.style.display = 'block';
        st.className = 'crm-st err';
        st.textContent = '☁️ Обнови страницу (Ctrl+F5) — скрипт синка не подгрузился.';
      }
    } catch (e2) {}
    try {
      alert('☁️ Обнови страницу полностью (Ctrl+F5), затем снова нажми облако.');
    } catch (e3) {}
  };

  function pullNowWithRetries() {
    var attempt = 0;
    var max = 14;
    function step() {
      attempt++;
      return Promise.resolve()
        .then(function() {
          if (typeof getDriveToken !== 'function') throw new Error('getDriveToken');
          return getDriveToken();
        })
        .then(function() {
          return pullMerge();
        })
        .catch(function() {
          if (attempt < max) {
            return new Promise(function(r) { setTimeout(r, 320); }).then(step);
          }
          return { ok: false, applied: 0, message: 'Не удалось подключиться к Drive после нескольких попыток.', noRemoteFile: false, driveFailed: true };
        });
    }
    return step().then(function(res) {
      try {
        if (!shouldOfferSync()) return res;
        if (res && res.applied > 0) refreshUiAfterPull();
        if (res && res.noRemoteFile) {
          var st = document.getElementById('crmSt');
          if (st) {
            st.style.display = 'block';
            st.className = 'crm-st';
            st.textContent = '☁️ Нет общего файла данных Саши на Drive. Саша: войди в 🔑 Drive → профиль «Саша» → поработай или нажми ☁️. У обоих должен быть доступ к корню CRM.';
          }
        } else if (res && res.driveFailed) {
          var st2 = document.getElementById('crmSt');
          if (st2) {
            st2.style.display = 'block';
            st2.className = 'crm-st err';
            st2.textContent = '🔑 Войди в Google Drive — иначе не подтянуть данные Саши с облака.';
          }
        }
      } catch (e) {}
      return res;
    });
  }

  window.__avitologSashaPullNow = pullNowWithRetries;
  window.__avitologSashaTeamPull = pullMerge;
  window.__avitologSashaTeamPush = pushMerge;
  window.__avitologSashaTeamBidirectional = bidirectionalSync;
  window.__avitologSashaTeamPushSilent = function() {
    return pushMerge({ silentToast: true }).catch(function() {});
  };
  window.__avitologSashaTeamSyncUi = syncUi;
  window.__avitologUpdateSashaTeamSyncBtn = updateSashaTeamSyncBtn;

  function startIntervals() {
    if (_autoPullTimer) clearInterval(_autoPullTimer);
    _autoPullTimer = setInterval(runAutoPull, PULL_INTERVAL_MS);
  }

  function onVisibility() {
    if (!document.hidden && shouldOfferSync()) {
      runAutoPull();
      scheduleAutoPush();
    }
  }

  function init() {
    installLocalStorageHook();
    updateSashaTeamSyncBtn();
    startIntervals();
    document.addEventListener('visibilitychange', onVisibility);
    setTimeout(function() {
      if (shouldOfferSync()) runAutoPull();
    }, 1500);
    if (window.AVITOLOG_AUTOSYNC_ON_LOAD && shouldOfferSync()) {
      showSashaTeamToast('☁️ Автосинк: запускаю синхронизацию данных Саши…', false);
      setTimeout(function() {
        syncUi().catch(function(e) {
          cloudSyncUserHint('err', '☁️ Автосинк: ' + (e && e.message ? e.message : String(e)));
        });
      }, 2800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
