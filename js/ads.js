/**
 * Ads page — рекламные расходы и быстрые ссылки
 * localStorage: crm_ads_expenses_v1, crm_ads_links_v1
 */
(function() {
  'use strict';

  var EXPENSES_KEY = 'crm_ads_expenses_v1';
  var LINKS_KEY = 'crm_ads_links_v1';
  var AVITO_KEY_LS = 'crm_ads_avito_api_key_v1';
  var AVITO_BASE_LS = 'crm_ads_avito_backend_base_v1';
  var AVITO_PATH_LS = 'crm_ads_avito_path_v1';
  var ROW_KEYS = ['main', 'new', 'both'];
  var ROW_LABELS = { main: 'Основной', new: 'Новый', both: 'Оба' };

  var DEFAULT_LINKS = [
    { id: 'channel_clients', icon: '📣', label: 'Канал для клиентов', url: '', snippet: '', avatar: '' },
    { id: 'bot_clients', icon: '🤖', label: 'Бот для клиентов', url: '', snippet: '', avatar: '' },
    { id: 'channel_learn', icon: '🎓', label: 'Канал обучения', url: '', snippet: '', avatar: '' },
    { id: 'channel_vk_blog', icon: '🟦', label: 'Личный блог ВК', url: 'https://vk.com/fil_the_bizz', snippet: 'VK блог', avatar: '' },
    { id: 'bot_learn', icon: '🤖', label: 'Бот обучения', url: '', snippet: '', avatar: '' },
    { id: 'site', icon: '🌐', label: 'Сайт агентства', url: '', snippet: '', avatar: '' },
    { id: 'avito1', icon: '🛒', label: 'Авито аккаунт 1', url: '', snippet: '', avatar: '' },
    { id: 'avito2', icon: '🛒', label: 'Авито аккаунт 2', url: '', snippet: '', avatar: '' }
  ];

  function loadExpenses() {
    try {
      var raw = localStorage.getItem(EXPENSES_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        var y = String(data.y || new Date().getFullYear());
        var m = String(data.m || (new Date().getMonth() + 1));
        return { data: data.cells || {}, year: y, month: m };
      }
    } catch (e) {}
    var now = new Date();
    return { data: {}, year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
  }

  function saveExpenses(state) {
    try {
      var payload = {
        y: state.year,
        m: state.month,
        cells: state.data
      };
      localStorage.setItem(EXPENSES_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadLinks() {
    try {
      var raw = localStorage.getItem(LINKS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          var byId = {};
          arr.forEach(function(item) {
            if (item && item.id) byId[item.id] = item;
          });
          var merged = DEFAULT_LINKS.map(function(def) {
            return Object.assign({}, def, byId[def.id] || {});
          });
          arr.forEach(function(item) {
            if (!item || !item.id) return;
            if (!merged.some(function(m) { return m.id === item.id; })) merged.push(item);
          });
          return merged;
        }
      }
    } catch (e) {}
    return DEFAULT_LINKS.map(function(l) { return Object.assign({}, l); });
  }

  function saveLinks(links) {
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(links));
    } catch (e) {}
  }

  function getCellKey(row, day) {
    return row + '_' + day;
  }

  function parseNum(val) {
    if (val == null || val === '') return 0;
    var n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function formatNum(n) {
    return n === 0 ? '' : String(n);
  }

  function getTodayDayForState(state) {
    var now = new Date();
    var currentYear = String(now.getFullYear());
    var currentMonth = String(now.getMonth() + 1);
    if (!state || String(state.year) !== currentYear || String(state.month) !== currentMonth) return 0;
    return now.getDate();
  }

  function recomputeBothRow(state) {
    for (var d = 1; d <= 31; d++) {
      var mainVal = parseNum(state.data[getCellKey('main', d)]);
      var newVal = parseNum(state.data[getCellKey('new', d)]);
      state.data[getCellKey('both', d)] = (mainVal + newVal) || null;
    }
  }

  function renderExpensesTable(container, state, onChange) {
    recomputeBothRow(state);
    saveExpenses(state);
    var days = 31;
    var todayDay = getTodayDayForState(state);
    var html = '<div class="ads-expenses-wrap"><table class="ads-expenses-table"><thead><tr><th class="ads-th-label">Ряд</th>';
    for (var d = 1; d <= days; d++) {
      var todayHeadClass = d === todayDay ? ' ads-day-today' : '';
      html += '<th class="ads-th-day' + todayHeadClass + '">' + d + '</th>';
    }
    html += '<th class="ads-th-total">Итог</th></tr></thead><tbody>';

    ROW_KEYS.forEach(function(rowKey) {
      html += '<tr data-row="' + rowKey + '"><td class="ads-td-label">' + (ROW_LABELS[rowKey] || rowKey) + '</td>';
      var rowTotal = 0;
      for (var d = 1; d <= days; d++) {
        var key = getCellKey(rowKey, d);
        var val = state.data[key] != null ? state.data[key] : '';
        var displayVal = formatNum(parseNum(val));
        rowTotal += parseNum(val);
        var isBoth = rowKey === 'both';
        var todayCellClass = d === todayDay ? ' ads-day-today' : '';
        if (isBoth) {
          html += '<td class="ads-td-cell ads-td-cell-auto' + todayCellClass + '" title="Авто: Основной + Новый">' + (displayVal ? String(displayVal) : '') + '</td>';
        } else {
          html += '<td class="ads-td-cell ads-td-cell-editable' + todayCellClass + '" data-row="' + rowKey + '" data-day="' + d + '" title="ПКМ: добавить сумму к этому дню">' + (displayVal ? String(displayVal) : '') + '</td>';
        }
      }
      html += '<td class="ads-td-row-total" data-row="' + rowKey + '">' + (rowTotal ? rowTotal.toLocaleString('ru') : '0') + '</td></tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.ads-td-cell-editable').forEach(function(td) {
      td.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        var row = td.getAttribute('data-row');
        if (!row || row === 'both') return;
        var day = parseInt(td.getAttribute('data-day'), 10);
        if (!day) return;
        startCellAddMode(td, container, state, row, day, onChange);
      });
    });
  }

  function startCellAddMode(td, container, state, row, day, onChange) {
    if (!td) return;
    var key = getCellKey(row, day);
    var baseVal = parseNum(state.data[key]);
    td.classList.add('ads-td-cell-editing');
    td.innerHTML =
      '<span class="ads-cell-base-val">' + (baseVal ? formatNum(baseVal) : '0') + '</span>' +
      '<span class="ads-cell-plus-sep">+</span>' +
      '<span class="ads-cell-inline-editor" contenteditable="true" inputmode="numeric"></span>';

    var editor = td.querySelector('.ads-cell-inline-editor');
    if (!editor) return;

    var close = function(apply) {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      td.classList.remove('ads-td-cell-editing');

      if (apply) {
        var raw = String(editor.textContent || '').trim();
        var addVal = parseNum(raw);
        if (raw && addVal !== 0) {
          var nextVal = baseVal + addVal;
          state.data[key] = nextVal || null;
          recomputeBothRow(state);
          saveExpenses(state);
          renderExpensesTable(container, state, onChange);
          if (typeof onChange === 'function') onChange();
          return;
        }
      }

      td.textContent = baseVal ? formatNum(baseVal) : '';
    };

    var onDocMouseDown = function(evt) {
      if (!td.contains(evt.target)) close(true);
    };

    editor.addEventListener('keydown', function(evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        close(true);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        close(false);
      }
    });

    editor.addEventListener('blur', function() {
      close(true);
    });

    document.addEventListener('mousedown', onDocMouseDown, true);
    editor.focus();
  }

  function computeTotals(state) {
    recomputeBothRow(state);
    var totals = { main: 0, new: 0, both: 0 };
    ROW_KEYS.forEach(function(rowKey) {
      for (var d = 1; d <= 31; d++) {
        var key = getCellKey(rowKey, d);
        var v = state.data[key];
        totals[rowKey] += parseNum(v);
      }
    });
    totals.all = totals.both;
    return totals;
  }

  function updateTotalsPanel(container, state) {
    var totals = computeTotals(state);

    container.innerHTML =
      '<div class="ads-totals-title">Итоги</div>' +
      '<div class="ads-total-row"><span class="ads-total-label">Всего</span><span class="ads-total-val ads-total-all">' + (totals.all ? totals.all.toLocaleString('ru') : '0') + '</span></div>' +
      '<div class="ads-total-row"><span class="ads-total-label">Основной</span><span class="ads-total-val">' + (totals.main ? totals.main.toLocaleString('ru') : '0') + '</span></div>' +
      '<div class="ads-total-row"><span class="ads-total-label">Новый</span><span class="ads-total-val">' + (totals.new ? totals.new.toLocaleString('ru') : '0') + '</span></div>' +
      '<div class="ads-total-row"><span class="ads-total-label">Оба</span><span class="ads-total-val">' + (totals.both ? totals.both.toLocaleString('ru') : '0') + '</span></div>';
  }

  function updateAdsTopSummary(container, state) {
    if (!container) return;
    var totals = computeTotals(state);
    var fmt = function(n) { return n ? n.toLocaleString('ru') : '0'; };
    var set = function(id, val) {
      var el = container.querySelector('[data-ads-val="' + id + '"]');
      if (el) el.textContent = fmt(val || 0);
    };
    set('all', totals.all);
    set('main', totals.main);
    set('new', totals.new);
    set('both', totals.both);
  }

  function openLinkEdit(links, index, container, onSave) {
    var item = links[index];
    var url = prompt('URL для: ' + item.label, item.url || 'https://');
    if (url === null) return;
    var snippet = prompt('Сниппет для карточки (например: 637 подписчиков)', item.snippet || '');
    if (snippet === null) return;
    var avatar = prompt('URL аватарки канала (опционально)', item.avatar || '');
    if (avatar === null) return;
    item.url = (url || '').trim();
    item.snippet = (snippet || '').trim();
    item.avatar = (avatar || '').trim();
    saveLinks(links);
    renderLinksPanel(container, links);
    if (typeof onSave === 'function') onSave();
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getLinksCategory(item) {
    var id = String(item.id || '').toLowerCase();
    var label = String(item.label || '').toLowerCase();
    if (id.indexOf('channel') >= 0 || label.indexOf('канал') >= 0) return 'channels';
    if (id.indexOf('bot') >= 0 || label.indexOf('бот') >= 0) return 'bots';
    if (id.indexOf('site') >= 0 || label.indexOf('сайт') >= 0) return 'sites';
    if (id.indexOf('avito') >= 0 || label.indexOf('авито') >= 0) return 'avito';
    return 'other';
  }

  function readImageAsDataURL(file, cb) {
    if (!file || !file.type.match(/^image\/(png|jpeg|jpg|webp|gif)$/i)) {
      cb(new Error('Выберите изображение (png/jpg/webp/gif)'));
      return;
    }
    var reader = new FileReader();
    reader.onload = function() { cb(null, reader.result); };
    reader.onerror = function() { cb(new Error('Не удалось прочитать изображение')); };
    reader.readAsDataURL(file);
  }

  function renderLinksPanel(container, links) {
    var editingIdx = Number.isInteger(renderLinksPanel._editingIdx) ? renderLinksPanel._editingIdx : -1;
    var groups = [
      { id: 'channels', title: '📚 Каналы' },
      { id: 'bots', title: '🤖 Боты' },
      { id: 'sites', title: '🌐 Сайты' },
      { id: 'avito', title: '🛒 Avito аккаунты' },
      { id: 'other', title: '🔗 Прочее' }
    ];
    var grouped = { channels: [], bots: [], sites: [], avito: [], other: [] };
    links.forEach(function(item, idx) {
      var cat = getLinksCategory(item);
      grouped[cat].push({ item: item, idx: idx });
    });

    var html = '<div class="ads-links-title">🔗 Быстрые ссылки</div>';
    groups.forEach(function(g) {
      if (!grouped[g.id].length) return;
      html += '<div class="ads-snippet-group"><div class="ads-snippet-group-title">' + g.title + '</div><div class="ads-snippet-grid">';
      grouped[g.id].forEach(function(w) {
        var item = w.item;
        var idx = w.idx;
        var hasUrl = item.url && String(item.url).trim().length;
        var avatar = item.avatar && String(item.avatar).trim();
        html += '<div class="ads-snippet-card" data-idx="' + idx + '">';
        html += '<button type="button" class="ads-snippet-main" data-open="' + idx + '"' + (hasUrl ? '' : ' title="Добавьте ссылку"') + '>';
        if (avatar) html += '<span class="ads-snippet-avatar"><img src="' + escapeHtml(item.avatar) + '" alt=""></span>';
        else html += '<span class="ads-snippet-avatar ads-snippet-avatar-fallback">' + escapeHtml(item.icon || '🔗') + '</span>';
        html += '<span class="ads-snippet-meta"><span class="ads-snippet-name">' + escapeHtml(item.label || '') + '</span><span class="ads-snippet-sub">' + escapeHtml(item.snippet || 'Добавьте сниппет') + '</span></span>';
        html += '</button>';
        html += '<button type="button" class="ads-snippet-edit-btn" data-edit="' + idx + '" title="Редактировать">✎</button>';
        if (editingIdx === idx) {
          html += '<div class="ads-snippet-editor">' +
            '<input type="text" class="ads-editor-input ads-editor-url" data-field="url" data-idx="' + idx + '" placeholder="https://..." value="' + escapeHtml(item.url || '') + '">' +
            '<input type="text" class="ads-editor-input ads-editor-snippet" data-field="snippet" data-idx="' + idx + '" placeholder="Сниппет" value="' + escapeHtml(item.snippet || '') + '">' +
            '<input type="text" class="ads-editor-input ads-editor-avatar" data-field="avatar" data-idx="' + idx + '" placeholder="URL аватарки" value="' + escapeHtml(item.avatar || '') + '">' +
            '<label class="ads-editor-upload" title="Загрузить картинку"><input type="file" class="ads-editor-file" data-idx="' + idx + '" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif">🖼</label>' +
            '<button type="button" class="ads-editor-save" data-save="' + idx + '">OK</button>' +
            '<button type="button" class="ads-editor-cancel" data-cancel="1">✕</button>' +
          '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    });

    container.innerHTML = html;

    container.querySelectorAll('[data-open]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-open'), 10);
        var url = (links[idx] && links[idx].url) ? String(links[idx].url).trim() : '';
        if (url) window.open(url, '_blank', 'noopener');
        else {
          renderLinksPanel._editingIdx = idx;
          renderLinksPanel(container, links);
        }
      });
    });

    container.querySelectorAll('[data-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        renderLinksPanel._editingIdx = parseInt(btn.getAttribute('data-edit'), 10);
        renderLinksPanel(container, links);
      });
    });

    container.querySelectorAll('[data-cancel]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        renderLinksPanel._editingIdx = -1;
        renderLinksPanel(container, links);
      });
    });

    container.querySelectorAll('[data-save]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-save'), 10);
        var item = links[idx];
        if (!item) return;
        var urlInp = container.querySelector('.ads-editor-url[data-idx="' + idx + '"]');
        var snInp = container.querySelector('.ads-editor-snippet[data-idx="' + idx + '"]');
        var avInp = container.querySelector('.ads-editor-avatar[data-idx="' + idx + '"]');
        item.url = urlInp ? String(urlInp.value || '').trim() : '';
        item.snippet = snInp ? String(snInp.value || '').trim() : '';
        item.avatar = avInp ? String(avInp.value || '').trim() : '';
        saveLinks(links);
        renderLinksPanel._editingIdx = -1;
        renderLinksPanel(container, links);
      });
    });

    container.querySelectorAll('.ads-editor-file').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var idx = parseInt(inp.getAttribute('data-idx'), 10);
        var file = inp.files && inp.files[0];
        if (!file || !links[idx]) return;
        readImageAsDataURL(file, function(err, dataUrl) {
          if (err) {
            alert(err.message || 'Ошибка загрузки изображения');
            return;
          }
          links[idx].avatar = dataUrl;
          saveLinks(links);
          renderLinksPanel._editingIdx = idx;
          renderLinksPanel(container, links);
        });
      });
    });
  }

  function renderAdsPage(mainContentEl) {
    var state = loadExpenses();
    var links = loadLinks();

    var wrap = document.createElement('div');
    wrap.className = 'ads-page';
    wrap.innerHTML =
      '<div class="ads-header">📢 Рекламные расходы</div>' +
      '<div class="ads-subtabs">' +
        '<button type="button" class="ads-subtab-btn on" data-ads-subtab="expenses">Расходы</button>' +
        '<button type="button" class="ads-subtab-btn" data-ads-subtab="api">Avito API</button>' +
      '</div>' +
      '<div class="ads-subtab-page on" data-ads-page="expenses">' +
        '<div class="ads-top-summary" id="adsTopSummary">' +
          '<div class="ads-summary-card ads-summary-all"><span class="ads-summary-label">Всего</span><span class="ads-summary-val" data-ads-val="all">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Основной</span><span class="ads-summary-val" data-ads-val="main">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Новый</span><span class="ads-summary-val" data-ads-val="new">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Оба</span><span class="ads-summary-val" data-ads-val="both">0</span></div>' +
        '</div>' +
        '<div class="ads-body">' +
          '<div class="ads-main">' +
            '<div class="ads-card ads-expenses-card">' +
              '<div class="ads-card-title">Расходы по дням</div>' +
              '<div class="ads-expenses-container" id="adsExpensesContainer"></div>' +
            '</div>' +
            '<div class="ads-card ads-links-card">' +
              '<div id="adsLinksContainer"></div>' +
            '</div>' +
          '</div>' +
          '<div class="ads-sidebar">' +
            '<div class="ads-card ads-totals-card">' +
              '<div id="adsTotalsContainer"></div>' +
            '</div>' +
          '</div>' +
        </div>' +
      '</div>' +
      '<div class="ads-subtab-page" data-ads-page="api">' +
        '<div class="ads-card ads-api-card">' +
          '<div class="ads-card-title">Интеграция Avito API</div>' +
          '<div class="ads-api-grid">' +
            '<label class="ads-api-field"><span>Backend URL</span><input type="text" id="adsApiBackendBase" placeholder="http://localhost:8787/api"></label>' +
            '<label class="ads-api-field"><span>Ключ API</span><input type="password" id="adsApiKeyInput" placeholder="Вставьте ваш Avito API key"></label>' +
            '<label class="ads-api-field ads-api-field-path"><span>API путь</span><input type="text" id="adsApiPathInput" placeholder="/core/v1/accounts/self"></label>' +
          '</div>' +
          '<div class="ads-api-actions">' +
            '<button type="button" class="ads-api-btn" id="adsApiLoadBtn">Загрузить данные</button>' +
            '<button type="button" class="ads-api-btn ads-api-btn-ghost" id="adsApiSaveBtn">Сохранить настройки</button>' +
          '</div>' +
          '<div class="ads-api-status" id="adsApiStatus">Готово к подключению. Введите ключ и нажмите "Загрузить данные".</div>' +
          '<pre class="ads-api-result" id="adsApiResult">Ответ API появится здесь.</pre>' +
        '</div>' +
      '</div>';

    mainContentEl.innerHTML = '';
    mainContentEl.appendChild(wrap);

    var expensesContainer = document.getElementById('adsExpensesContainer');
    var totalsContainer = document.getElementById('adsTotalsContainer');
    var linksContainer = document.getElementById('adsLinksContainer');

    function refreshTotals() {
      updateTotalsPanel(totalsContainer, state);
      updateAdsTopSummary(wrap.querySelector('#adsTopSummary'), state);
    }

    renderExpensesTable(expensesContainer, state, refreshTotals);
    updateTotalsPanel(totalsContainer, state);
    updateAdsTopSummary(wrap.querySelector('#adsTopSummary'), state);
    renderLinksPanel(linksContainer, links);

    setupAdsSubtabs(wrap);
    setupAdsApiPanel(wrap);
  }

  function setupAdsSubtabs(root) {
    if (!root) return;
    var btns = root.querySelectorAll('[data-ads-subtab]');
    var pages = root.querySelectorAll('[data-ads-page]');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-ads-subtab');
        btns.forEach(function(b) { b.classList.toggle('on', b === btn); });
        pages.forEach(function(p) {
          p.classList.toggle('on', p.getAttribute('data-ads-page') === id);
        });
      });
    });
  }

  function setupAdsApiPanel(root) {
    if (!root) return;
    var baseInp = root.querySelector('#adsApiBackendBase');
    var keyInp = root.querySelector('#adsApiKeyInput');
    var pathInp = root.querySelector('#adsApiPathInput');
    var saveBtn = root.querySelector('#adsApiSaveBtn');
    var loadBtn = root.querySelector('#adsApiLoadBtn');
    var st = root.querySelector('#adsApiStatus');
    var out = root.querySelector('#adsApiResult');
    if (!baseInp || !keyInp || !pathInp || !saveBtn || !loadBtn || !st || !out) return;

    baseInp.value = localStorage.getItem(AVITO_BASE_LS) || 'http://localhost:8787/api';
    keyInp.value = localStorage.getItem(AVITO_KEY_LS) || '';
    pathInp.value = localStorage.getItem(AVITO_PATH_LS) || '/core/v1/accounts/self';

    function setStatus(text, isErr) {
      st.textContent = text;
      st.classList.toggle('is-error', !!isErr);
    }

    function saveSettings() {
      localStorage.setItem(AVITO_BASE_LS, String(baseInp.value || '').trim());
      localStorage.setItem(AVITO_KEY_LS, String(keyInp.value || '').trim());
      localStorage.setItem(AVITO_PATH_LS, String(pathInp.value || '').trim());
      setStatus('Настройки сохранены локально.', false);
    }

    saveBtn.addEventListener('click', saveSettings);

    loadBtn.addEventListener('click', function() {
      var backendBase = String(baseInp.value || '').trim().replace(/\/+$/, '');
      var apiKey = String(keyInp.value || '').trim();
      var apiPath = String(pathInp.value || '').trim();
      if (!backendBase || !apiKey || !apiPath) {
        setStatus('Заполните Backend URL, API ключ и API путь.', true);
        return;
      }
      saveSettings();
      setStatus('Загрузка данных из Avito...', false);
      out.textContent = '...';

      fetch(backendBase + '/avito/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          path: apiPath,
          method: 'GET'
        })
      })
      .then(function(res) {
        return res.json().catch(function() { return { ok: false, error: 'Invalid JSON from backend' }; })
          .then(function(data) { return { status: res.status, data: data }; });
      })
      .then(function(payload) {
        if (payload.status >= 400 || payload.data.ok === false) {
          setStatus('Ошибка загрузки: ' + (payload.data.error || ('HTTP ' + payload.status)), true);
          out.textContent = JSON.stringify(payload.data, null, 2);
          return;
        }
        setStatus('Данные успешно получены.', false);
        out.textContent = JSON.stringify(payload.data, null, 2);
      })
      .catch(function(err) {
        setStatus('Сеть/сервер недоступен: ' + (err && err.message ? err.message : 'unknown error'), true);
        out.textContent = String(err && err.stack ? err.stack : err);
      });
    });
  }

  window.__showAdsPage = renderAdsPage;
})();
