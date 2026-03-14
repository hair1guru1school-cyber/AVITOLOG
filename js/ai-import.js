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
    var goalsData = getGoalsData();
    goalsData.projects = goalsData.projects || [];
    var today = getTodayStr();
    var weekIndex = Math.ceil(new Date().getDate() / 7);
    if (weekIndex > 4) weekIndex = 4;

    toImport.forEach(function(row) {
      var saleAmount = String(row.paid || '').replace(/\s/g, '');
      var goalProject = {
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
      };
      goalsData.projects.push(goalProject);
    });

    try {
      localStorage.setItem('avitolog_goals_v1', JSON.stringify(goalsData));
    } catch (e) {
      alert('Ошибка сохранения: ' + (e.message || e));
      return;
    }

    _aiImportRows = [];
    if (document.getElementById('aiImportTextarea')) document.getElementById('aiImportTextarea').value = '';
    renderPreviewTable([]);
    var wrap = document.getElementById('aiImportPreviewTableWrap');
    var empty = document.getElementById('aiImportPreviewEmpty');
    if (wrap) wrap.style.display = '';
    if (empty) {
      empty.innerHTML = '✓ Импортировано ' + toImport.length + ' записей. Перейди в ЦЕЛИ → Оплачено.';
      empty.style.display = '';
    }

    if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
      window.AVITOLOG_GOALS.render();
    }
    if (typeof assetsMode !== 'undefined' && assetsMode && typeof window.__renderAssetsPage === 'function') {
      window.__renderAssetsPage();
    }
  }

  function loadToTable() {
    confirmImport();
  }

  var ASSETS_PROJECTS = [
    { emoji: '🎄', name: 'Андрей Молл Строй' },
    { emoji: '🎄', name: 'Иван Пиломатериалы' },
    { emoji: '🪨', name: 'Камни и Пеллеты' },
    { emoji: '🛋', name: 'Mebel Fan' },
    { emoji: '🪟', name: 'Денис Ворота' },
    { emoji: '🏎', name: 'Вячеслав АвтоВыкуп' },
    { emoji: '🧱', name: 'Руслан Kuga Термо' },
    { emoji: '🏠', name: 'Модуль Воронеж' },
    { emoji: '🛌', name: 'Кирилл Кровати' },
    { emoji: '👷‍♂️', name: 'Александр Крым' },
    { emoji: '👷‍♂️', name: 'Артем Паколь' },
    { emoji: '📊', name: 'Виктория Гибсокартон' },
    { emoji: '🏠', name: 'Дмитрий Бани Каркасные' },
    { emoji: '🏗', name: 'Наталья Дома ВашДом' },
    { emoji: '🚜', name: 'СельхозТехника' },
    { emoji: '👩🏻‍🏫', name: 'Ксения Сергеевна' },
    { emoji: '⚡️', name: 'Электрик Крым Александр' },
    { emoji: '🧱', name: 'Иван Сияр Сендвич панели' },
    { emoji: '🧱', name: 'Дома Андрей' }
  ];

  var ASSETS_STORAGE_KEY = 'avitolog_assets_projects_v1';
  var ASSETS_MY_MONTH_KEY = 'avitolog_assets_my_month_v1';
  var ASSETS_SASHA_KEY = 'avitolog_assets_sasha_v1';
  var ASSETS_USD_RATE = 95;

  var MY_PAYMENTS_THIS_MONTH = [
    { emoji: '🪨', name: 'Камни и Пеллеты', amount: '30000' },
    { emoji: '🛌', name: 'Кирилл Кровати', amount: '30000' },
    { emoji: '🏠', name: 'Дмитрий Бани Каркасные', amount: '34000' },
    { emoji: '🚜', name: 'СельхозТехника', amount: '35000' },
    { emoji: '👩🏻‍🏫', name: 'Ксения Сергеевна', amount: '25000' },
    { emoji: '⚡️', name: 'Электрик Крым Александр', amount: '56000' },
    { emoji: '🧱', name: 'Иван Сияр Сендвич', amount: '44000' },
    { emoji: '🧱', name: 'Дома Андрей', amount: '50000' }
  ];

  function getAssetsData() {
    try {
      return JSON.parse(localStorage.getItem(ASSETS_STORAGE_KEY) || '{}');
    } catch (e) { return {}; }
  }

  function saveAssetsData(data) {
    try { localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function getMyMonthData() {
    try {
      var s = localStorage.getItem(ASSETS_MY_MONTH_KEY);
      return s ? JSON.parse(s) : {};
    } catch (e) { return {}; }
  }

  function saveMyMonthData(data) {
    try { localStorage.setItem(ASSETS_MY_MONTH_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function getSashaData() {
    try {
      var s = localStorage.getItem(ASSETS_SASHA_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  function saveSashaData(arr) {
    try { localStorage.setItem(ASSETS_SASHA_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function findProjectAmount(projName, soldProjects) {
    if (!soldProjects || !soldProjects.length) return null;
    var n = String(projName || '').trim().toLowerCase();
    for (var i = 0; i < soldProjects.length; i++) {
      var p = soldProjects[i];
      var pn = String(p.name || '').trim().toLowerCase();
      if (pn && (pn === n || pn.indexOf(n) >= 0 || n.indexOf(pn) >= 0)) {
        var v = p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]);
        return v ? String(v).replace(/\s/g, '') : null;
      }
    }
    return null;
  }

  function renderAssetsPage() {
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var goalsData = getGoalsData();
    var sold = (goalsData.projects || []).filter(function(p) { return p && p.stage === 'sold'; });
    var assetsData = getAssetsData();
    var totalRub = 338000;
    var totalUsd = Math.round(totalRub / ASSETS_USD_RATE);
    var summaryRows = [
      { icon: '💰', label: 'Получено за все', val: '338 000', valUsd: totalUsd, main: true },
      { icon: '✅', label: 'Оплаты клиентов', val: '304 000' },
      { icon: '🌿', label: 'Ожидается еще', val: '20 000' },
      { icon: '📊', label: 'Ожидается за мес', val: '324 000' },
      { icon: '📈', label: 'Агентство AoA %', val: '34 000' },
      { icon: '🆕', label: 'Новые клиенты', val: '' },
      { icon: '👤', label: 'Активные клиенты', val: '195 000' }
    ];
    var summaryHtml = summaryRows.map(function(r) {
      var rowCls = 'assets-summary-row' + (r.main ? ' assets-summary-main' : '');
      var valHtml = r.val ? (r.main ? '<span class="assets-summary-val">' + esc(r.val) + ' ₽<span class="assets-summary-usd">$' + fmt(r.valUsd) + '</span></span>' : '<span class="assets-summary-val">' + esc(r.val) + ' ₽</span>') : '<span class="assets-summary-val">—</span>';
      return '<div class="' + rowCls + '"><span class="assets-summary-label">' + r.icon + ' ' + esc(r.label) + '</span>' + valHtml + '</div>';
    }).join('');
    var myMonthData = getMyMonthData();
    var myPaymentsHtml = MY_PAYMENTS_THIS_MONTH.map(function(p) {
      var stored = myMonthData[p.name] || {};
      var amountVal = stored.amount !== undefined ? stored.amount : (p.amount || '');
      var amountFmt = amountVal ? fmt(String(amountVal).replace(/\s/g, '')) : '';
      return '<div class="assets-my-payment-row" data-name="' + esc(p.name) + '">' +
        '<span class="assets-project-emoji">' + p.emoji + '</span>' +
        '<span class="assets-project-name">' + esc(p.name) + '</span>' +
        '<span class="assets-project-paid"><input type="text" value="' + esc(amountFmt) + '" placeholder="0" data-field="amount" onblur="window.__assetsSaveMyMonth(this)"></span>' +
        '</div>';
    }).join('');
    var myMonthTotal = MY_PAYMENTS_THIS_MONTH.reduce(function(acc, p) {
      var d = myMonthData[p.name] || {};
      var v = d.amount || p.amount || 0;
      return acc + (parseInt(String(v).replace(/\s/g, ''), 10) || 0);
    }, 0);
    var sashaData = getSashaData();
    var sashaPaymentsHtml = '';
    if (sashaData && sashaData.length) {
      sashaPaymentsHtml = sashaData.map(function(p, idx) {
        var amountFmt = (p.amount || '') ? fmt(String(p.amount).replace(/\s/g, '')) : '';
        return '<div class="assets-sasha-payment-row" data-idx="' + idx + '">' +
          '<span class="assets-project-emoji">' + (p.emoji || '📦') + '</span>' +
          '<span class="assets-project-name"><input type="text" value="' + esc(p.name || '') + '" placeholder="Название" data-field="name" onblur="window.__assetsSaveSasha(this)"></span>' +
          '<span class="assets-project-paid"><input type="text" value="' + esc(amountFmt) + '" placeholder="0" data-field="amount" onblur="window.__assetsSaveSasha(this)"></span>' +
          '<button type="button" class="assets-row-remove" onclick="window.__assetsRemoveSasha(' + idx + ')" title="Удалить">✕</button>' +
          '</div>';
      }).join('');
    }
    var sashaTotal = (sashaData || []).reduce(function(acc, p) {
      return acc + (parseInt(String(p.amount || '').replace(/\s/g, ''), 10) || 0);
    }, 0);
    var headerRow = '<div class="assets-projects-header"><span class="ap-name">Проект</span><span class="ap-paid">Оплатил</span><span class="ap-expected">Ожидать в мес</span></div>';
    var projectRows = ASSETS_PROJECTS.map(function(p, idx) {
      var key = p.name;
      var stored = assetsData[key] || {};
      var paidFromGoals = findProjectAmount(p.name, sold);
      var paidVal = stored.paid || paidFromGoals || '';
      var expectedVal = stored.expected || '';
      var paidFmt = paidVal ? fmt(String(paidVal).replace(/\s/g, '')) : '';
      var expectedFmt = expectedVal ? fmt(String(expectedVal).replace(/\s/g, '')) : '';
      return '<div class="assets-project-row" data-name="' + esc(key) + '">' +
        '<span class="assets-project-emoji">' + p.emoji + '</span>' +
        '<span class="assets-project-name">' + esc(p.name) + '</span>' +
        '<span class="assets-project-paid"><input type="text" value="' + esc(paidFmt) + '" placeholder="0" data-field="paid" onblur="window.__assetsSaveProject(this)"></span>' +
        '<span class="assets-project-expected"><input type="text" value="' + esc(expectedFmt) + '" placeholder="0" data-field="expected" onblur="window.__assetsSaveProject(this)"></span>' +
        '</div>';
    }).join('');
    mc.innerHTML = '<div class="assets-page-wrap">' +
      '<div class="assets-summary-table">' + summaryHtml + '</div>' +
      '<div class="assets-block assets-my-payments">' +
        '<div class="assets-projects-title">💰 Мои оплаты в этом месяце <span class="assets-block-total">' + fmt(myMonthTotal) + ' ₽</span></div>' +
        '<div class="assets-payments-list">' +
          '<div class="assets-payments-header"><span class="ap-name">Проект</span><span class="ap-paid">Сумма</span></div>' +
          myPaymentsHtml +
        '</div>' +
      '</div>' +
      '<div class="assets-block assets-sasha-payments">' +
        '<div class="assets-projects-title">👤 Оплаты Саши <span class="assets-block-total">' + fmt(sashaTotal) + ' ₽</span></div>' +
        '<div class="assets-payments-list" id="assetsSashaList">' +
          (sashaData.length ? '<div class="assets-payments-header"><span class="ap-name">Проект</span><span class="ap-paid">Сумма</span></div>' + sashaPaymentsHtml : '<div class="assets-sasha-empty">Пока пусто</div>') +
        '</div>' +
        '<button type="button" class="assets-add-sasha" onclick="window.__assetsAddSasha && window.__assetsAddSasha()">+ Добавить оплату Саши</button>' +
      '</div>' +
      '<div class="assets-projects-title">Проекты — чек клиента и оплата</div>' +
      '<div class="assets-projects-list" id="assetsProjectsList">' + headerRow + projectRows + '</div>' +
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
  }

  function saveProjectField(inputEl) {
    if (!inputEl) return;
    var row = inputEl.closest('.assets-project-row');
    var name = row && row.getAttribute('data-name');
    var field = inputEl.getAttribute('data-field');
    var val = String(inputEl.value || '').replace(/\s/g, '');
    if (!name || !field) return;
    var data = getAssetsData();
    data[name] = data[name] || {};
    data[name][field] = val ? val : '';
    saveAssetsData(data);
  }

  function saveMyMonthField(inputEl) {
    if (!inputEl) return;
    var row = inputEl.closest('.assets-my-payment-row');
    var name = row && row.getAttribute('data-name');
    var field = inputEl.getAttribute('data-field');
    var val = String(inputEl.value || '').replace(/\s/g, '');
    if (!name || !field) return;
    var data = getMyMonthData();
    data[name] = data[name] || {};
    data[name][field] = val ? val : '';
    saveMyMonthData(data);
  }

  function saveSashaField(inputEl) {
    if (!inputEl) return;
    var row = inputEl.closest('.assets-sasha-payment-row');
    var idx = row ? parseInt(row.getAttribute('data-idx'), 10) : -1;
    if (idx < 0) return;
    var field = inputEl.getAttribute('data-field');
    var val = String(inputEl.value || '').replace(/\s/g, '');
    var arr = getSashaData();
    if (arr[idx]) {
      arr[idx][field] = val ? val : '';
      saveSashaData(arr);
    }
  }

  function addSashaPayment() {
    var arr = getSashaData();
    arr.push({ emoji: '📦', name: 'Новая оплата', amount: '' });
    saveSashaData(arr);
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function removeSashaPayment(idx) {
    var arr = getSashaData();
    if (idx >= 0 && idx < arr.length) {
      arr.splice(idx, 1);
      saveSashaData(arr);
      if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
    }
  }

  window.__aiImportParse = parseAndShow;
  window.__aiImportRejectRow = rejectRow;
  window.__aiImportConfirm = confirmImport;
  window.__aiImportLoadToTable = loadToTable;
  window.__aiImportRender = renderAiImportContent;
  window.__renderAssetsPage = renderAssetsPage;
  window.__assetsSaveProject = saveProjectField;
  window.__assetsSaveMyMonth = saveMyMonthField;
  window.__assetsSaveSasha = saveSashaField;
  window.__assetsAddSasha = addSashaPayment;
  window.__assetsRemoveSasha = removeSashaPayment;
})();
