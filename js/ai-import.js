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
    var summaryRows = [
      { icon: '💰', label: 'Получено за все', val: '338 000' },
      { icon: '✅', label: 'Оплаты клиентов', val: '304 000' },
      { icon: '🌿', label: 'Ожидается еще', val: '20 000' },
      { icon: '📊', label: 'Ожидается за мес', val: '324 000' },
      { icon: '📈', label: 'Агентство AoA %', val: '34 000' },
      { icon: '🆕', label: 'Новые клиенты', val: '' },
      { icon: '👤', label: 'Активные клиенты', val: '195 000' }
    ];
    var summaryHtml = summaryRows.map(function(r) {
      return '<div class="assets-summary-row"><span class="assets-summary-label">' + r.icon + ' ' + esc(r.label) + '</span><span class="assets-summary-val">' + (r.val ? esc(r.val) + ' ₽' : '—') + '</span></div>';
    }).join('');
    var projectRows = ASSETS_PROJECTS.map(function(p) {
      var amt = findProjectAmount(p.name, sold);
      var amtStr = amt ? fmt(amt) + ' ₽' : '—';
      return '<div class="assets-project-row"><span class="assets-project-emoji">' + p.emoji + '</span><span class="assets-project-name">' + esc(p.name) + '</span><span class="assets-project-amount">' + amtStr + '</span></div>';
    }).join('');
    mc.innerHTML = '<div class="assets-page-wrap">' +
      '<div class="assets-summary-table">' + summaryHtml + '</div>' +
      '<div class="assets-projects-title">Проекты (цены складываются в общую сумму за март 338 000 ₽)</div>' +
      '<div class="assets-projects-list" id="assetsProjectsList">' + projectRows + '</div>' +
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

  window.__aiImportParse = parseAndShow;
  window.__aiImportRejectRow = rejectRow;
  window.__aiImportConfirm = confirmImport;
  window.__aiImportLoadToTable = loadToTable;
  window.__aiImportRender = renderAiImportContent;
  window.__renderAssetsPage = renderAssetsPage;
})();
