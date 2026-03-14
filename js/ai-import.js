/**
 * 🤖 AI Import — парсинг текста оплат/клиентов и импорт в АКТИВЫ (goals sold)
 * AI только парсит и предлагает. Пользователь подтверждает импорт вручную.
 */
(function() {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pad2(n) {
    var s = String(n);
    return s.length >= 2 ? s : '0' + s;
  }

  function getTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function generateId() {
    return 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function getGoalsData() {
    try {
      var s = localStorage.getItem('avitolog_goals_v1');
      return s ? JSON.parse(s) : { projects: [] };
    } catch (e) { return { projects: [] }; }
  }

  function getCrmClients() {
    try {
      return JSON.parse(localStorage.getItem('avitolog_clients') || '[]');
    } catch (e) { return []; }
  }

  function getProjectsData() {
    try {
      if (typeof loadProjectsData === 'function') {
        var d = loadProjectsData();
        return (d && d.projects) ? d.projects : [];
      }
    } catch (e) {}
    return [];
  }

  function fuzzyScore(a, b) {
    if (!a || !b) return 0;
    var sa = String(a).trim().toLowerCase();
    var sb = String(b).trim().toLowerCase();
    if (sa === sb) return 100;
    if (sa.indexOf(sb) >= 0 || sb.indexOf(sa) >= 0) return 85;
    var wordsA = sa.split(/\s+/).filter(Boolean);
    var wordsB = sb.split(/\s+/).filter(Boolean);
    var match = 0;
    wordsA.forEach(function(wa) {
      wordsB.forEach(function(wb) {
        if (wa === wb || (wa.length > 2 && wb.indexOf(wa) >= 0)) match++;
      });
    });
    if (wordsA.length && wordsB.length) {
      var ratio = match / Math.max(wordsA.length, wordsB.length);
      return Math.round(ratio * 70);
    }
    return 0;
  }

  function findBestMatch(name, candidates, getLabel) {
    if (!name || !candidates || !candidates.length) return null;
    getLabel = getLabel || function(c) { return c.name || c.company || c.title || ''; };
    var best = null;
    var bestScore = 0;
    candidates.forEach(function(c) {
      var label = getLabel(c);
      if (!label) return;
      var score = fuzzyScore(name, label);
      if (score > bestScore && score >= 50) {
        bestScore = score;
        best = c;
      }
    });
    return best ? { item: best, score: bestScore } : null;
  }

  function findMatchesForRow(row) {
    var clients = getCrmClients();
    var goalsData = getGoalsData();
    var goalsProjects = (goalsData.projects || []).filter(function(p) { return p && (p.name || p.folderLink); });
    var projData = getProjectsData();

    var clientName = (row.client || row.project || row.name || '').trim();
    if (!clientName) return { client: null, project: null, folder: null, folderLink: '' };

    var result = { client: null, project: null, folder: null, folderLink: '' };

    var clientMatch = findBestMatch(clientName, clients, function(c) {
      return [c.company, c.contact_name, c.name].filter(Boolean).join(' ');
    });
    if (clientMatch) {
      result.client = clientMatch.item;
      result.folderId = clientMatch.item.folderId || '';
      result.folderLink = clientMatch.item.folderLink || (result.folderId ? 'https://drive.google.com/drive/folders/' + result.folderId : '');
    }

    var goalMatch = findBestMatch(clientName, goalsProjects, function(p) { return p.name || ''; });
    if (goalMatch && goalMatch.score >= (clientMatch ? clientMatch.score : 0)) {
      result.project = goalMatch.item;
      if (goalMatch.item.folderLink) {
        result.folderLink = goalMatch.item.folderLink;
        result.folderId = (goalMatch.item.folderLink.match(/\/folders\/([a-zA-Z0-9_-]+)/) || [])[1] || '';
      }
    }

    var projMatch = findBestMatch(clientName, projData, function(p) { return p.title || ''; });
    if (projMatch && projMatch.score >= 60) {
      var p = projMatch.item;
      if (p.folderLink || p.folderId) {
        result.project = result.project || p;
        result.folderLink = result.folderLink || p.folderLink || (p.folderId ? 'https://drive.google.com/drive/folders/' + p.folderId : '');
        result.folderId = result.folderId || p.folderId || '';
      }
    }

    return result;
  }

  var AI_IMPORT_PROMPT = 'Ты парсер текста оплат и клиентов. Пользователь вставляет сырой текст (комменты, заметки об оплатах). \
Извлеки ВСЕ записи и верни JSON массив objects. Каждый объект: { "client": "имя клиента", "project": "название проекта или пусто", "paid": число или строка, "expected": число или пусто, "currency": "₽" или "руб" и т.п., "date": "YYYY-MM-DD" или пусто, "isSasha": true/false если клиент Саши, "isNew": true/false новый/старый, "comments": "произвольный комментарий" }. \
Числа: paid и expected — суммы в рублях, извлекай числа из текста. date — если есть дата. isSasha — ищи упоминания Саша/Саши. isNew — новый клиент или нет. \
Ответь ТОЛЬКО валидным JSON массивом, без markdown и пояснений. Пример: [{"client":"ООО Ромашка","paid":50000,"currency":"₽","comments":"предоплата"}]';

  function parseWithAI(rawText) {
    if (typeof callAPI !== 'function') {
      return Promise.reject(new Error('callAPI не найден. Убедитесь, что core.js и main.js загружены.'));
    }
    var prompt = AI_IMPORT_PROMPT + '\n\n--- ТЕКСТ ПОЛЬЗОВАТЕЛЯ ---\n' + String(rawText || '').trim();
    return callAPI(prompt, 2000).then(function(raw) {
      var s = (raw || '').replace(/```json|```/g, '').trim();
      var start = s.indexOf('[');
      var end = s.lastIndexOf(']') + 1;
      if (start >= 0 && end > start) s = s.slice(start, end);
      try {
        var arr = JSON.parse(s);
        if (!Array.isArray(arr)) return [];
        return arr.map(function(o) {
          return {
            client: o.client || o.name || '',
            project: o.project || '',
            paid: o.paid != null ? String(o.paid) : '',
            expected: o.expected != null ? String(o.expected) : '',
            currency: o.currency || '₽',
            date: o.date || getTodayStr(),
            isSasha: !!o.isSasha,
            isNew: !!o.isNew,
            comments: o.comments || ''
          };
        });
      } catch (e) {
        throw new Error('Не удалось распарсить ответ AI: ' + (e.message || e));
      }
    });
  }

  function buildPreviewRows(parsed) {
    return (parsed || []).map(function(p) {
      var match = findMatchesForRow(p);
      return {
        id: generateId(),
        raw: p,
        client: p.client || '',
        project: p.project || '',
        paid: p.paid || '',
        expected: p.expected || '',
        currency: p.currency || '₽',
        date: p.date || getTodayStr(),
        matchedProject: match.project ? (match.project.name || match.project.title) : '',
        matchedFolder: match.folderLink ? (match.project && match.project.name ? match.project.name : 'Папка') : '',
        folderId: match.folderId || '',
        folderLink: match.folderLink || '',
        notes: p.comments || '',
        rejected: false
      };
    });
  }

  function renderAiImportContent() {
    var rawText = (document.getElementById('aiImportTextarea') || {}).value || '';
    var container = document.getElementById('aiImportPreview');
    if (!container) return;

    container.innerHTML = '<div class="ai-import-wrap">' +
      '<div class="ai-import-title">🤖 ИИ-импорт данных</div>' +
      '<p style="font-size:12px;color:var(--muted);margin:-8px 0 0 0">Вставь текст с оплатами/клиентами — ИИ распарсит и предложит совпадения. Подтверди импорт вручную.</p>' +
      '<textarea class="ai-import-textarea" id="aiImportTextarea" placeholder="Пример:&#10;ООО СтройДом — 50 000 руб, предоплата 50%&#10;ИП Петров — оплатил 30к, ожидаем ещё 20к&#10;Мебель Мария — 150 000 ₽, новый клиент">' + esc(rawText) + '</textarea>' +
      '<div class="ai-import-btns">' +
        '<button type="button" class="ai-import-btn primary" onclick="window.__aiImportParse && window.__aiImportParse()">Разобрать</button>' +
        '<button type="button" class="ai-import-btn" id="aiImportLoadBtn" onclick="window.__aiImportLoadToTable && window.__aiImportLoadToTable()" disabled>Загрузить в таблицу</button>' +
      '</div>' +
      '<div class="ai-import-preview" id="aiImportPreviewTableWrap">' +
        '<div class="ai-import-preview-empty" id="aiImportPreviewEmpty">Нажми «Разобрать» после вставки текста</div>' +
        '<div id="aiImportPreviewTable" style="display:none"></div>' +
      '</div>' +
      '</div>';
  }

  function renderPreviewTable(rows) {
    var wrap = document.getElementById('aiImportPreviewTableWrap');
    var empty = document.getElementById('aiImportPreviewEmpty');
    var table = document.getElementById('aiImportPreviewTable');
    var loadBtn = document.getElementById('aiImportLoadBtn');
    if (!wrap) return;

    if (!rows || !rows.length) {
      wrap.style.display = 'none';
      if (empty) empty.style.display = '';
      if (table) { table.style.display = 'none'; table.innerHTML = ''; }
      if (loadBtn) loadBtn.disabled = true;
      return;
    }
    wrap.style.display = '';

    var toShow = rows.filter(function(r) { return !r.rejected; });
    if (loadBtn) loadBtn.disabled = toShow.length === 0;

    if (empty) empty.style.display = 'none';
    if (!table) return;
    table.style.display = '';

    table.innerHTML = '<table class="ai-import-table">' +
      '<thead><tr>' +
        '<th>Клиент</th><th>Проект</th><th>Оплачено</th><th>Ожидаем</th><th>Валюта</th><th>Совпадение</th><th>Коммент</th><th></th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r) {
        var rowCls = r.rejected ? 'rejected' : '';
        var matchText = r.matchedProject || r.matchedFolder || '';
        var matchCls = matchText ? 'ai-import-match' : 'ai-import-match ai-import-match-none';
        return '<tr class="' + rowCls + '" data-row-id="' + esc(r.id) + '">' +
          '<td>' + esc(r.client) + '</td>' +
          '<td>' + esc(r.project) + '</td>' +
          '<td>' + esc(r.paid) + '</td>' +
          '<td>' + esc(r.expected) + '</td>' +
          '<td>' + esc(r.currency) + '</td>' +
          '<td><span class="' + matchCls + '" title="' + esc(matchText || 'Не найдено') + '">' + esc(matchText || '—') + '</span></td>' +
          '<td>' + esc(r.notes) + '</td>' +
          '<td><div class="ai-import-row-actions">' +
            (r.rejected ? '' : '<button type="button" class="ai-import-row-btn reject" onclick="window.__aiImportRejectRow(\'' + esc(r.id) + '\')" title="Отклонить">✕</button>') +
          '</div></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';

    if (toShow.length > 0) {
      var confirmBar = document.createElement('div');
      confirmBar.className = 'ai-import-confirm-bar';
      confirmBar.innerHTML = '<span>Готово к импорту: ' + toShow.length + ' записей</span>' +
        '<button type="button" class="ai-import-btn primary" onclick="window.__aiImportConfirm && window.__aiImportConfirm()">Подтвердить импорт</button>';
      if (table.nextElementSibling && table.nextElementSibling.className === 'ai-import-confirm-bar') {
        table.nextElementSibling.remove();
      }
      table.after(confirmBar);
    }
  }

  var _aiImportRows = [];

  function parseAndShow() {
    var ta = document.getElementById('aiImportTextarea');
    var raw = (ta && ta.value || '').trim();
    if (!raw) {
      alert('Вставь текст с оплатами/клиентами в поле выше.');
      return;
    }
    var wrap = document.getElementById('aiImportPreviewTableWrap');
    var empty = document.getElementById('aiImportPreviewEmpty');
    if (wrap) wrap.style.display = '';
    if (empty) {
      empty.innerHTML = '<div class="ai-import-loading">⏳ Разбор текста...</div>';
      empty.style.display = '';
    }
    var table = document.getElementById('aiImportPreviewTable');
    if (table) { table.style.display = 'none'; table.innerHTML = ''; }

    parseWithAI(raw).then(function(parsed) {
      _aiImportRows = buildPreviewRows(parsed);
      renderPreviewTable(_aiImportRows);
    }).catch(function(e) {
      if (empty) {
        empty.innerHTML = '<span style="color:#ff8080">Ошибка: ' + esc(e.message || e) + '</span>';
        empty.style.display = '';
      }
    });
  }

  function rejectRow(rowId) {
    var r = _aiImportRows.find(function(x) { return x.id === rowId; });
    if (r) {
      r.rejected = true;
      renderPreviewTable(_aiImportRows);
    }
  }

  function confirmImport() {
    var toImport = _aiImportRows.filter(function(r) { return !r.rejected; });
    if (!toImport.length) {
      alert('Нет записей для импорта. Убери отметки отклонения или разбери текст заново.');
      return;
    }
    var inAssets = typeof assetsMode !== 'undefined' && assetsMode;
    if (inAssets && typeof getAssetsMy === 'function' && typeof getAssetsSasha === 'function') {
      toImport.forEach(function(row) {
        var owner = (row.raw && row.raw.isSasha) ? 'sasha' : 'me';
        var name = row.client || 'Без названия';
        var paid = String(row.paid || '').replace(/\s/g, '');
        var item = { emoji: '💰', name: name, paid: paid, expected: row.expected || '', paymentDate: row.date || (row.raw && row.raw.date) || '', folderLink: row.folderLink || '' };
        if (owner === 'me') {
          var arr = getAssetsMy();
          arr.push(item);
          saveAssetsMy(arr);
        } else {
          var arr2 = getAssetsSasha();
          arr2.push(item);
          saveAssetsSasha(arr2);
        }
      });
    } else {
      var goalsData = getGoalsData();
      goalsData.projects = goalsData.projects || [];
      var today = getTodayStr();
      var weekIndex = Math.ceil(new Date().getDate() / 7);
      if (weekIndex > 4) weekIndex = 4;
      toImport.forEach(function(row) {
        var saleAmount = String(row.paid || '').replace(/\s/g, '');
        goalsData.projects.push({
          id: generateId(),
          name: row.client || 'Без названия',
          emoji: '💰',
          folderLink: row.folderLink || '',
          date: row.date || today,
          weekIndex: weekIndex,
          mainPrice: saleAmount,
          priceOptions: [saleAmount || '—'],
          status: ['paid'],
          stage: 'sold',
          saleAmount: saleAmount,
          sourceNote: '🤖 AI Import: ' + (row.raw && row.raw.comments ? row.raw.comments : '')
        });
      });
      try { localStorage.setItem('avitolog_goals_v1', JSON.stringify(goalsData)); } catch (e) {}
      if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') window.AVITOLOG_GOALS.render();
    }

    _aiImportRows = [];
    if (document.getElementById('aiImportTextarea')) document.getElementById('aiImportTextarea').value = '';
    renderPreviewTable([]);
    var wrap = document.getElementById('aiImportPreviewTableWrap');
    var empty = document.getElementById('aiImportPreviewEmpty');
    if (wrap) wrap.style.display = '';
    if (empty) {
      empty.innerHTML = inAssets ? '✓ Импортировано в колонки' : '✓ Импортировано. Перейди в ЦЕЛИ → Оплачено.';
      empty.style.display = '';
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function loadToTable() {
    confirmImport();
  }

  var ASSETS_MY_KEY = 'avitolog_assets_my_v2';
  var ASSETS_SASHA_KEY = 'avitolog_assets_sasha_v2';
  var ASSETS_LEGACY_KEY = 'avitolog_assets_projects_v1';
  var ASSETS_USD_RATE = 95;

  var DEFAULT_MY = [
    { emoji: '🪨', name: 'Камни и Пеллеты', paid: '30000', expected: '', paymentDate: '' },
    { emoji: '🛌', name: 'Кирилл Кровати', paid: '30000', expected: '', paymentDate: '' },
    { emoji: '🏠', name: 'Дмитрий Бани Каркасные', paid: '34000', expected: '', paymentDate: '' },
    { emoji: '🚜', name: 'СельхозТехника', paid: '35000', expected: '', paymentDate: '' },
    { emoji: '👩🏻‍🏫', name: 'Ксения Сергеевна', paid: '25000', expected: '', paymentDate: '' },
    { emoji: '⚡️', name: 'Электрик Крым Александр', paid: '56000', expected: '', paymentDate: '' },
    { emoji: '🧱', name: 'Иван Сияр Сендвич панели', paid: '44000', expected: '', paymentDate: '' },
    { emoji: '🧱', name: 'Дома Андрей', paid: '50000', expected: '', paymentDate: '' }
  ];

  function getPaymentBarFill(paymentDateStr) {
    if (!paymentDateStr || !String(paymentDateStr).trim()) return 0;
    var parts = String(paymentDateStr).trim().split(/[-/]/);
    if (parts.length < 3) return 0;
    var year = parseInt(parts[0], 10) || new Date().getFullYear();
    var month = (parseInt(parts[1], 10) || 1) - 1;
    var day = parseInt(parts[2], 10) || 1;
    var payDate = new Date(year, month, day);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    payDate.setHours(0, 0, 0, 0);
    var daysUntil = Math.ceil((payDate - today) / (24 * 60 * 60 * 1000));
    if (daysUntil <= 0) return 0;
    var maxDays = 60;
    return Math.min(1, daysUntil / maxDays);
  }

  function getAssetsMy() {
    try {
      var s = localStorage.getItem(ASSETS_MY_KEY);
      if (s) return JSON.parse(s);
      var legacy = JSON.parse(localStorage.getItem(ASSETS_LEGACY_KEY) || '{}');
      var arr = [];
      Object.keys(legacy).forEach(function(k) {
        var d = legacy[k];
        if (d && d.owner === 'me') arr.push({ emoji: '📦', name: k, paid: d.paid || '', expected: d.expected || '', paymentDate: d.paymentDate || '' });
      });
      if (arr.length) { saveAssetsMy(arr); return arr; }
      return DEFAULT_MY.slice();
    } catch (e) { return DEFAULT_MY.slice(); }
  }

  function saveAssetsMy(arr) {
    try { localStorage.setItem(ASSETS_MY_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function getAssetsSasha() {
    try {
      var s = localStorage.getItem(ASSETS_SASHA_KEY);
      if (s) return JSON.parse(s);
      var legacy = JSON.parse(localStorage.getItem(ASSETS_LEGACY_KEY) || '{}');
      var arr = [];
      Object.keys(legacy).forEach(function(k) {
        var d = legacy[k];
        if (d && d.owner === 'sasha') arr.push({ emoji: '📦', name: k, paid: d.paid || '', expected: d.expected || '', paymentDate: d.paymentDate || '' });
      });
      if (arr.length) { saveAssetsSasha(arr); return arr; }
      return [];
    } catch (e) { return []; }
  }

  function saveAssetsSasha(arr) {
    try { localStorage.setItem(ASSETS_SASHA_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function addAssetsProject(owner, project) {
    var name = (project && (project.name || project.company || project.contact_name)) || 'Новый проект';
    name = String(name).trim() || 'Новый проект';
    var emoji = (project && project.emoji) || '📦';
    var paid = (project && (project.mainPrice || project.saleAmount || project.kp_count || '')) ? String(project.mainPrice || project.saleAmount || project.kp_count).replace(/\s/g, '') : '';
    var folderLink = project && (project.folderLink || (project.folderId ? 'https://drive.google.com/drive/folders/' + project.folderId : ''));
    var item = { emoji: emoji, name: name, paid: paid, expected: '', paymentDate: '', folderLink: folderLink || '', crmClientId: (project && project.crmClientId) || (project && project.folderId) || '' };
    if (owner === 'me') {
      var arr = getAssetsMy();
      arr.push(item);
      saveAssetsMy(arr);
    } else {
      var arr2 = getAssetsSasha();
      arr2.push(item);
      saveAssetsSasha(arr2);
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
    if (typeof window.__wireAssetsDragTargets === 'function') window.__wireAssetsDragTargets();
  }

  function removeAssetsProject(owner, idx) {
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (idx >= 0 && idx < arr.length) { arr.splice(idx, 1); saveAssetsMy(arr); }
    } else {
      var arr2 = getAssetsSasha();
      if (idx >= 0 && idx < arr2.length) { arr2.splice(idx, 1); saveAssetsSasha(arr2); }
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function renderAssetsPage() {
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var myList = getAssetsMy();
    var sashaList = getAssetsSasha();
    var myTotal = myList.reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var sashaTotal = sashaList.reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var totalRub = myTotal + sashaTotal || 338000;
    var totalUsd = Math.round(totalRub / ASSETS_USD_RATE);
    var summaryRows = [
      { icon: '💰', label: 'Получено за все', val: fmt(totalRub), valUsd: totalUsd, main: true },
      { icon: '✅', label: 'Мои оплаты', val: fmt(myTotal) },
      { icon: '👤', label: 'Оплаты Саши', val: fmt(sashaTotal) }
    ];
    var summaryHtml = summaryRows.map(function(r) {
      var rowCls = 'assets-summary-row' + (r.main ? ' assets-summary-main' : '');
      var valHtml = r.val ? (r.main ? '<span class="assets-summary-val">' + esc(r.val) + ' ₽<span class="assets-summary-usd">$' + fmt(r.valUsd) + '</span></span>' : '<span class="assets-summary-val">' + esc(r.val) + ' ₽</span>') : '<span class="assets-summary-val">—</span>';
      return '<div class="' + rowCls + '"><span class="assets-summary-label">' + r.icon + ' ' + esc(r.label) + '</span>' + valHtml + '</div>';
    }).join('');
    var paidFirst = myList.filter(function(p) { return !!(p.paid && String(p.paid).replace(/\s/g, '')); });
    var notPaid = myList.filter(function(p) { return !(p.paid && String(p.paid).replace(/\s/g, '')); });
    var mySorted = paidFirst.concat(notPaid);
    function renderColRow(p, idx, owner) {
      var paidFmt = (p.paid || '') ? fmt(String(p.paid).replace(/\s/g, '')) : '';
      var expectedFmt = (p.expected || '') ? fmt(String(p.expected).replace(/\s/g, '')) : '';
      var payDate = (p.paymentDate || '').trim();
      var barFill = getPaymentBarFill(payDate);
      var isPaid = !!(p.paid && String(p.paid).replace(/\s/g, ''));
      var rowCls = 'assets-col-row' + (owner === 'me' && isPaid ? ' assets-row-paid' : '');
      var barPct = Math.round(barFill * 100);
      return '<div class="' + rowCls + '" data-owner="' + owner + '" data-idx="' + idx + '">' +
        '<span class="assets-col-emoji">' + (p.emoji || '📦') + '</span>' +
        '<span class="assets-col-name">' +
          '<span class="assets-col-name-inner">' +
            '<input type="text" value="' + esc(p.name || '') + '" placeholder="Проект" data-field="name" onblur="window.__assetsSaveColRow(this)">' +
            '<span class="assets-progress-bar" title="Чем больше ждать до платежа — тем полнее"><span class="assets-progress-fill" style="width:' + barPct + '%"></span></span>' +
          '</span>' +
        '</span>' +
        '<span class="assets-col-date"><input type="date" value="' + esc(payDate) + '" data-field="paymentDate" onchange="window.__assetsSaveColRow(this)"></span>' +
        '<span class="assets-col-paid"><input type="text" value="' + esc(paidFmt) + '" placeholder="0" data-field="paid" onblur="window.__assetsSaveColRow(this)"></span>' +
        '<span class="assets-col-expected"><input type="text" value="' + esc(expectedFmt) + '" placeholder="0" data-field="expected" onblur="window.__assetsSaveColRow(this)"></span>' +
        '<button type="button" class="assets-col-remove" onclick="window.__assetsRemoveProject(\'' + owner + '\',' + idx + ')" title="Удалить">✕</button>' +
        '</div>';
    }
    var myRows = mySorted.map(function(p, i) {
      var idx = myList.indexOf(p);
      return renderColRow(p, idx, 'me');
    }).join('');
    var sashaRows = sashaList.map(function(p, idx) { return renderColRow(p, idx, 'sasha'); }).join('');
    var colHeader = '<div class="assets-col-header"><span class="ac-name">Проект</span><span class="ac-date">Дата платежа</span><span class="ac-paid">Оплатил</span><span class="ac-expected">Ожидать</span><span class="ac-actions"></span></div>';
    mc.innerHTML = '<div class="assets-page-wrap">' +
      '<div class="assets-summary-table">' + summaryHtml + '</div>' +
      '<div class="assets-two-cols">' +
        '<div class="assets-col assets-col-me" id="assetsColMe" data-owner="me">' +
          '<div class="assets-col-title">💰 Мои клиенты <span class="assets-col-total">' + fmt(myTotal) + ' ₽</span></div>' +
          '<div class="assets-col-filter" title="Те кто оплатил — показываются первыми и подсвечены">💰 оплатили — сверху</div>' +
          '<div class="assets-col-list">' + colHeader + myRows + '</div>' +
          '<button type="button" class="assets-col-add" onclick="window.__assetsAddProject(\'me\')">+ Добавить</button>' +
        '</div>' +
        '<div class="assets-col assets-col-sasha" id="assetsColSasha" data-owner="sasha">' +
          '<div class="assets-col-title">👤 Клиенты Саши <span class="assets-col-total">' + fmt(sashaTotal) + ' ₽</span></div>' +
          '<div class="assets-col-list">' + colHeader + sashaRows + '</div>' +
          '<button type="button" class="assets-col-add" onclick="window.__assetsAddProject(\'sasha\')">+ Добавить</button>' +
        '</div>' +
      '</div>' +
      '<div class="assets-ai-row" id="assetsAiRow">' +
        '<span class="ai-label">🤖 ИИ-импорт</span>' +
        '<textarea class="ai-input" id="aiImportTextarea" rows="1" placeholder="Вставь текст оплат/клиентов — ИИ разберёт..."></textarea>' +
        '<div class="ai-btns">' +
          '<button type="button" class="ai-import-btn primary" onclick="window.__aiImportParse && window.__aiImportParse()">Разобрать</button>' +
          '<button type="button" class="ai-import-btn" id="aiImportLoadBtn" onclick="window.__aiImportLoadToTable && window.__aiImportLoadToTable()" disabled>Загрузить</button>' +
        '</div>' +
      '</div>' +
      '<div class="ai-import-preview" id="aiImportPreviewTableWrap" style="display:none">' +
        '<div class="ai-import-preview-empty" id="aiImportPreviewEmpty"></div>' +
        '<div id="aiImportPreviewTable" style="display:none"></div>' +
      '</div>' +
      '</div>';
    setTimeout(function() { if (typeof window.__wireAssetsDragTargets === 'function') window.__wireAssetsDragTargets(); }, 50);
  }

  function saveColRow(el) {
    if (!el) return;
    var row = el.closest('.assets-col-row');
    var owner = row && row.getAttribute('data-owner');
    var idx = row ? parseInt(row.getAttribute('data-idx'), 10) : -1;
    var field = el.getAttribute('data-field');
    var val = (field === 'name' || field === 'paymentDate') ? String(el.value || '').trim() : String(el.value || '').replace(/\s/g, '');
    if (!owner || idx < 0 || !field) return;
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (arr[idx]) { arr[idx][field] = val; saveAssetsMy(arr); }
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[idx]) { arr2[idx][field] = val; saveAssetsSasha(arr2); }
    }
    updateColTotals();
    if (field === 'paymentDate') {
      var fill = getPaymentBarFill(val);
      var fillEl = row && row.querySelector('.assets-progress-fill');
      if (fillEl) fillEl.style.width = Math.round(fill * 100) + '%';
    }
  }

  function updateColTotals() {
    var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var myTotal = getAssetsMy().reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var sashaTotal = getAssetsSasha().reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var meEl = document.querySelector('.assets-col-me .assets-col-total');
    var sashaEl = document.querySelector('.assets-col-sasha .assets-col-total');
    if (meEl) meEl.textContent = fmt(myTotal) + ' ₽';
    if (sashaEl) sashaEl.textContent = fmt(sashaTotal) + ' ₽';
  }

  function wireAssetsDragTargets() {
    var meCol = document.getElementById('assetsColMe');
    var sashaCol = document.getElementById('assetsColSasha');
    function allowDrop(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (e.currentTarget) e.currentTarget.classList.add('assets-col-drop-over'); }
    function leaveDrop(e) { if (e.currentTarget) e.currentTarget.classList.remove('assets-col-drop-over'); }
    function doDrop(owner, e) {
      e.preventDefault();
      if (e.currentTarget) e.currentTarget.classList.remove('assets-col-drop-over');
      if (typeof document.body !== 'undefined') document.body.classList.remove('goals-client-dragging');
      if (typeof window.__goalsClientDragEnd === 'function') window.__goalsClientDragEnd();
      var client = (typeof getGoalsDropClient === 'function') ? getGoalsDropClient() : null;
      if (client) addAssetsProject(owner, client);
    }
    if (meCol) { meCol.ondragover = allowDrop; meCol.ondragleave = leaveDrop; meCol.ondrop = function(e) { doDrop('me', e); }; }
    if (sashaCol) { sashaCol.ondragover = allowDrop; sashaCol.ondragleave = leaveDrop; sashaCol.ondrop = function(e) { doDrop('sasha', e); }; }
  }

  function addProjectBlank(owner) {
    addAssetsProject(owner, { name: 'Новый проект', emoji: '📦' });
  }

  window.__aiImportParse = parseAndShow;
  window.__aiImportRejectRow = rejectRow;
  window.__aiImportConfirm = confirmImport;
  window.__aiImportLoadToTable = loadToTable;
  window.__aiImportRender = renderAiImportContent;
  window.__renderAssetsPage = renderAssetsPage;
  window.__assetsSaveColRow = saveColRow;
  window.__assetsAddProject = addProjectBlank;
  window.__assetsRemoveProject = removeAssetsProject;
  window.__wireAssetsDragTargets = wireAssetsDragTargets;
})();
