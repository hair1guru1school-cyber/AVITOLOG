/**
 * Ads page — рекламные расходы и быстрые ссылки
 * localStorage: crm_ads_expenses_v1, crm_ads_links_v1
 */
(function() {
  'use strict';

  var EXPENSES_KEY = 'crm_ads_expenses_v1';
  var LINKS_KEY = 'crm_ads_links_v1';
  var ROW_KEYS = ['main', 'new', 'both'];
  var ROW_LABELS = { main: 'Основной', new: 'Новый', both: 'Оба' };

  var DEFAULT_LINKS = [
    { id: 'channel_clients', icon: '📣', label: 'Канал для клиентов', url: '', snippet: '', avatar: '' },
    { id: 'bot_clients', icon: '🤖', label: 'Бот для клиентов', url: '', snippet: '', avatar: '' },
    { id: 'channel_learn', icon: '🎓', label: 'Канал обучения', url: '', snippet: '', avatar: '' },
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
    var html = '<div class="ads-expenses-wrap"><table class="ads-expenses-table"><thead><tr><th class="ads-th-label">Ряд</th>';
    for (var d = 1; d <= days; d++) {
      html += '<th class="ads-th-day">' + d + '</th>';
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
        if (isBoth) {
          html += '<td class="ads-td-cell ads-td-cell-auto" title="Авто: Основной + Новый">' + (displayVal ? String(displayVal) : '') + '</td>';
        } else {
          html += '<td class="ads-td-cell"><input type="text" inputmode="numeric" class="ads-cell-inp" data-row="' + rowKey + '" data-day="' + d + '" value="' + (displayVal ? String(displayVal) : '') + '"></td>';
        }
      }
      html += '<td class="ads-td-row-total" data-row="' + rowKey + '">' + (rowTotal ? rowTotal.toLocaleString('ru') : '0') + '</td></tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.ads-cell-inp').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var row = inp.getAttribute('data-row');
        if (row === 'both') return;
        var day = parseInt(inp.getAttribute('data-day'), 10);
        var key = getCellKey(row, day);
        state.data[key] = inp.value.trim() || null;
        recomputeBothRow(state);
        saveExpenses(state);
        updateRowTotal(container, state, row);
        updateRowTotal(container, state, 'both');
        var bothTd = container.querySelector('tr[data-row="both"] .ads-td-cell:nth-child(' + (day + 1) + ')');
        if (bothTd) bothTd.textContent = formatNum(parseNum(state.data[getCellKey('both', day)]));
        if (typeof onChange === 'function') onChange();
      });
      inp.addEventListener('blur', function() {
        var v = parseNum(inp.value);
        if (v !== 0) inp.value = formatNum(v);
      });
    });
  }

  function updateRowTotal(container, state, rowKey) {
    var row = container.querySelector('tr[data-row="' + rowKey + '"]');
    if (!row) return;
    var total = 0;
    row.querySelectorAll('.ads-cell-inp').forEach(function(inp) {
      total += parseNum(inp.value);
    });
    var td = row.querySelector('.ads-td-row-total');
    if (td) td.textContent = total ? total.toLocaleString('ru') : '0';
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

  function renderLinksPanel(container, links) {
    var html = '<div class="ads-links-title">🔗 Быстрые ссылки</div><div class="ads-links-grid">';
    links.forEach(function(item, i) {
      var hasUrl = item.url && String(item.url).trim().length;
      var cls = hasUrl ? 'ads-link-btn' : 'ads-link-btn ads-link-btn-empty';
      var safeUrl = hasUrl ? escapeHtml(item.url) : '#';
      html += '<div class="ads-link-wrap">';
      html += '<a href="' + safeUrl + '" target="_blank" rel="noopener" class="' + cls + '" data-idx="' + i + '">';
      html += '<span class="ads-link-icon">' + escapeHtml(item.icon) + '</span>';
      html += '<span class="ads-link-label">' + escapeHtml(item.label || '') + '</span>';
      html += '</a>';
      html += '<button type="button" class="ads-link-edit" data-idx="' + i + '" title="Изменить ссылку">✎</button>';
      html += '</div>';
    });
    html += '</div>';

    var channels = links.filter(function(item) {
      var id = String(item.id || '').toLowerCase();
      var label = String(item.label || '').toLowerCase();
      return id.indexOf('channel') >= 0 || label.indexOf('канал') >= 0;
    });
    if (channels.length) {
      html += '<div class="ads-channels-title">📚 Каналы</div><div class="ads-channels-grid">';
      channels.forEach(function(item) {
        var idx = links.indexOf(item);
        var hasUrl = item.url && String(item.url).trim().length;
        html += '<div class="ads-channel-wrap">';
        html += '<button type="button" class="ads-channel-card" data-idx="' + idx + '"' + (hasUrl ? '' : ' title="Добавьте ссылку"') + '>';
        if (item.avatar && String(item.avatar).trim()) {
          html += '<span class="ads-channel-avatar"><img src="' + escapeHtml(item.avatar) + '" alt=""></span>';
        } else {
          html += '<span class="ads-channel-avatar ads-channel-avatar-fallback">' + escapeHtml(item.icon || '📣') + '</span>';
        }
        html += '<span class="ads-channel-meta"><span class="ads-channel-name">' + escapeHtml(item.label || '') + '</span><span class="ads-channel-snippet">' + escapeHtml(item.snippet || 'Добавьте сниппет') + '</span></span>';
        html += '</button>';
        html += '<button type="button" class="ads-link-edit" data-idx="' + idx + '" title="Изменить ссылку">✎</button>';
        html += '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('.ads-link-edit').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        openLinkEdit(links, idx, container);
      });
    });

    container.querySelectorAll('.ads-link-btn').forEach(function(a) {
      a.addEventListener('click', function(e) {
        var idx = parseInt(a.getAttribute('data-idx'), 10);
        var url = (links[idx] && links[idx].url) ? String(links[idx].url).trim() : '';
        if (!url) {
          e.preventDefault();
          openLinkEdit(links, idx, container);
        }
      });
    });

    container.querySelectorAll('.ads-channel-card').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var url = (links[idx] && links[idx].url) ? String(links[idx].url).trim() : '';
        if (url) {
          window.open(url, '_blank', 'noopener');
        } else {
          openLinkEdit(links, idx, container);
        }
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
  }

  window.__showAdsPage = renderAdsPage;
})();
