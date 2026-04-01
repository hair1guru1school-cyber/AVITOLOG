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
      var s = localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'));
      return s ? JSON.parse(s) : { projects: [] };
    } catch (e) { return { projects: [] }; }
  }

  function getCrmClients() {
    try {
      var k = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_clients') : 'avitolog_clients';
      return JSON.parse(localStorage.getItem(k) || '[]');
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

  var AI_IMPORT_PROMPT = 'Ты парсер текста оплат и клиентов. Пользователь вставляет сырой текст: таблицы, заметки, комменты об оплатах. \
Часто формат: эмодзи + название проекта + сумма оплаты/чека (например: 🏠 Дмитрий Бани 34 000 или 📦 Камни 30 000 р). \
Извлеки ВСЕ записи и верни JSON массив. Каждый объект: { "client": "имя/название клиента или проекта", "project": "название проекта или пусто", "emoji": "один эмодзи если есть в строке (🏠📦💰⚡ и т.д.)", "paid": число рублей, "expected": число или пусто, "currency": "₽", "date": "YYYY-MM-DD" если есть дата, "isSasha": true/false, "isNew": true/false, "comments": "комментарий" }. \
Числа: paid и expected — суммы в рублях из текста. Эмодзи — первый подходящий (🏠🪨📦⚡🚚💰 и т.д.). client = основное название. \
Ответь ТОЛЬКО валидным JSON массивом. Пример: [{"client":"Дмитрий Бани","emoji":"🏠","paid":34000,"currency":"₽"}]';

  /** Сумма в конце строки: «Название 28 000» / «🏠 Клиент 1 500 000» — без backend и без API */
  function parseTrailingRubles(line) {
    var s = String(line || '')
      .replace(/\s*(₽|руб\.?|RUB)\s*$/i, '')
      .trim();
    var m = s.match(/^(.+)[\s\u00A0]+(\d[\d\s\u00A0]*)\s*$/);
    if (!m) return null;
    var paid = parseInt(String(m[2]).replace(/\s/g, '').replace(/\u00A0/g, ''), 10);
    if (!isFinite(paid) || paid < 1) return null;
    return { name: m[1].trim(), paid: paid };
  }

  function splitLeadingEmoji(name) {
    if (!name) return { emoji: '📦', rest: '' };
    var s = name.trim();
    if (!s) return { emoji: '📦', rest: '' };
    try {
      var um = s.match(/^(\p{Extended_Pictographic})\s*/u);
      if (um) return { emoji: um[1], rest: s.slice(um[0].length).trim() };
    } catch (e1) {}
    var cp = s.codePointAt(0);
    if (cp >= 0x1f300 && cp <= 0x1f9ff) {
      var ch = String.fromCodePoint(cp);
      return { emoji: ch, rest: s.slice(ch.length).trim() };
    }
    if (cp >= 0x2600 && cp <= 0x27bf) {
      return { emoji: s[0], rest: s.slice(1).trim() };
    }
    if (s.length >= 2 && s.charCodeAt(0) >= 0xd800 && s.charCodeAt(0) <= 0xdbff) {
      var pair = s.slice(0, 2);
      return { emoji: pair, rest: s.slice(2).trim() };
    }
    return { emoji: '📦', rest: s };
  }

  function parsePaymentLinesHeuristic(rawText) {
    var lines = String(rawText || '')
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    if (!lines.length) return [];
    var out = [];
    for (var li = 0; li < lines.length; li++) {
      var tail = parseTrailingRubles(lines[li]);
      if (!tail) return [];
      var sp = splitLeadingEmoji(tail.name);
      var client = sp.rest;
      if (!String(client || '').trim()) return [];
      out.push({
        client: String(client).trim(),
        project: '',
        emoji: sp.emoji || '📦',
        paid: tail.paid,
        expected: '',
        currency: '₽',
        date: getTodayStr(),
        isSasha: false,
        isNew: false,
        comments: ''
      });
    }
    return out;
  }

  function parseWithAI(rawText) {
    window.__aiImportHeuristicHint = '';
    var text = String(rawText || '').trim();
    if (!text) {
      return Promise.reject(new Error('Пустой текст.'));
    }
    var heur = parsePaymentLinesHeuristic(text);
    if (heur.length > 0) {
      window.__aiImportHeuristicHint =
        '✓ Разбор без сервера и без ИИ: каждая строка — «название … сумма» (например 28 000 в конце). Сложный текст — только с API-ключом в шапке.';
      return Promise.resolve(
        heur.map(function (o) {
          return {
            client: o.client || '',
            project: o.project || '',
            emoji: o.emoji || '📦',
            paid: o.paid != null ? String(o.paid) : '',
            expected: o.expected != null ? String(o.expected) : '',
            currency: o.currency || '₽',
            date: o.date || getTodayStr(),
            isSasha: !!o.isSasha,
            isNew: !!o.isNew,
            comments: o.comments || ''
          };
        })
      );
    }
    if (typeof callAPI !== 'function') {
      return Promise.reject(new Error('callAPI не найден. Убедитесь, что core.js и main.js загружены.'));
    }
    var prompt = AI_IMPORT_PROMPT + '\n\n--- ТЕКСТ ПОЛЬЗОВАТЕЛЯ ---\n' + text;
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
            emoji: o.emoji || '📦',
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
        var ct = (row.raw && row.raw.isNew === false) ? 'old' : 'new';
        var item = { emoji: (row.raw && row.raw.emoji) || '💰', name: name, paid: paid, expected: row.expected || '', paymentDate: row.date || (row.raw && row.raw.date) || '', startDate: '', clientType: ct, folderLink: row.folderLink || '', crmClientId: row.folderId || '' };
        if (owner === 'sasha') { item.soldFor = paid; item.toAgent = ''; item.aoaPercent = ''; }
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
      try { localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'), JSON.stringify(goalsData)); } catch (e) {}
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

  var ASSETS_MY_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_assets_my_v2') : 'avitolog_assets_my_v2';
  var ASSETS_SASHA_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_assets_sasha_v2') : 'avitolog_assets_sasha_v2';
  var ASSETS_BASE_KEY = (typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_assets_base_v2', true) : 'avitolog_assets_base_v2');
  var ASSETS_FILTER_PAID_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_assets_filter_paid') : 'avitolog_assets_filter_paid';

  var ASSETS_EMOJIS = ['📦','🪨','🏠','🏗️','🧱','🛋️','🚚','📊','💰','🚀','👷','🛠️','🚜','📚','👩🏻‍🏫','💻','📱','⚡️','🛌','🪟','🎄','🪵','🏎','🪨','🛌','🏠','🚜','👩🏻‍🏫','⚡️','🧱','🪑','🛏️','🏢','🏭','🔧','📐','⭐️','🔥','💎','🎯','✅','📋','📝','🖊️','📷','📡','🔌'];
  var ASSETS_MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var _assetsViewMonth = null;

  function assetsCurrentMonthKey() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
  }
  function assetsMonthStorageKey(ym) { return ASSETS_MY_KEY + '_month_' + ym; }
  function assetsSashaMonthStorageKey(ym) { return ASSETS_SASHA_KEY + '_month_' + ym; }
  function assetsSnapshotCurrentMonth() {
    try {
      var ym = assetsCurrentMonthKey();
      localStorage.setItem(assetsMonthStorageKey(ym), JSON.stringify(getAssetsMy()));
      localStorage.setItem(assetsSashaMonthStorageKey(ym), JSON.stringify(getAssetsSasha()));
    } catch(e) {}
  }
  function assetsLoadMonthSnapshot(ym) {
    try {
      var myRaw = localStorage.getItem(assetsMonthStorageKey(ym));
      var saRaw = localStorage.getItem(assetsSashaMonthStorageKey(ym));
      return {
        my: myRaw ? JSON.parse(myRaw) : [],
        sasha: saRaw ? JSON.parse(saRaw) : []
      };
    } catch(e) { return { my: [], sasha: [] }; }
  }
  function assetsFillMonthRange(monthsObj) {
    var keys = Object.keys(monthsObj).sort();
    if (keys.length < 1) return;
    var first = keys[0].split('-');
    var last = keys[keys.length - 1].split('-');
    var y = parseInt(first[0], 10), m = parseInt(first[1], 10);
    var ly = parseInt(last[0], 10), lm = parseInt(last[1], 10);
    while (y < ly || (y === ly && m <= lm)) {
      monthsObj[y + '-' + String(m).padStart(2, '0')] = true;
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  function assetsGetAvailableMonths() {
    var months = {};
    var prefix1 = ASSETS_MY_KEY + '_month_';
    var prefix2 = ASSETS_SASHA_KEY + '_month_';
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k) {
        var ym = '';
        if (k.indexOf(prefix1) === 0) ym = k.substring(prefix1.length);
        else if (k.indexOf(prefix2) === 0) ym = k.substring(prefix2.length);
        if (/^\d{4}-\d{2}$/.test(ym)) months[ym] = true;
      }
    }
    var cur = assetsCurrentMonthKey();
    months[cur] = true;
    var cp = cur.split('-');
    var py = parseInt(cp[0], 10), pm = parseInt(cp[1], 10) - 1;
    if (pm < 1) { pm = 12; py--; }
    months[py + '-' + String(pm).padStart(2, '0')] = true;
    assetsFillMonthRange(months);
    return Object.keys(months).sort();
  }
  function assetsShiftMonth(dir) {
    var months = assetsGetAvailableMonths();
    var cur = _assetsViewMonth || assetsCurrentMonthKey();
    var idx = months.indexOf(cur);
    if (idx < 0) idx = months.length - 1;
    var next = idx + dir;
    if (next < 0) next = 0;
    if (next >= months.length) next = months.length - 1;
    _assetsViewMonth = months[next] === assetsCurrentMonthKey() ? null : months[next];
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }
  function assetsFormatMonthLabel(ym) {
    var parts = ym.split('-');
    var mi = parseInt(parts[1], 10) - 1;
    return (ASSETS_MONTH_NAMES[mi] || '') + ' ' + parts[0];
  }
  window.__assetsMonthPrev = function() { assetsShiftMonth(-1); };
  window.__assetsMonthNext = function() { assetsShiftMonth(1); };

  var ASSETS_LAST_MONTH_MARKER = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_assets_last_month') : 'avitolog_assets_last_month';
  function assetsCheckMonthTransition() {
    var currentYM = assetsCurrentMonthKey();
    var lastYM = '';
    try { lastYM = localStorage.getItem(ASSETS_LAST_MONTH_MARKER) || ''; } catch(e) {}
    if (!lastYM) {
      try { localStorage.setItem(ASSETS_LAST_MONTH_MARKER, currentYM); } catch(e) {}
      return;
    }
    if (lastYM === currentYM) return;
    assetsSnapshotCurrentMonth();
    var oldMy = getAssetsMy();
    var newMy = oldMy.map(function(p) {
      var copy = JSON.parse(JSON.stringify(p));
      copy.paid = '';
      return copy;
    });
    saveAssetsMy(newMy);
    saveAssetsSasha([]);
    try { localStorage.setItem(ASSETS_LAST_MONTH_MARKER, currentYM); } catch(e) {}
    assetsSnapshotCurrentMonth();
  }

  var ASSETS_LEGACY_KEY = 'avitolog_assets_projects_v1';
  var ASSETS_USD_RATE = 95;
  function readAssetsArrayByKey(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }
  function bootstrapAssetsArray(targetKey, fallbackKeys) {
    var own = readAssetsArrayByKey(targetKey);
    if (own !== null) return own;
    var picked = null;
    (fallbackKeys || []).some(function(k) {
      if (!k || k === targetKey) return false;
      var arr = readAssetsArrayByKey(k);
      if (arr !== null) { picked = arr; return true; }
      return false;
    });
    if (picked !== null) {
      try { localStorage.setItem(targetKey, JSON.stringify(picked)); } catch (e2) {}
      return picked;
    }
    return null;
  }

  var DEFAULT_MY = [
    { emoji: '🪨', name: 'Камни и Пеллеты', paid: '30000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '🛌', name: 'Кирилл Кровати', paid: '30000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '🏠', name: 'Дмитрий Бани Каркасные', paid: '34000', expected: '0', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '🚜', name: 'СельхозТехника', paid: '35000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '👩🏻‍🏫', name: 'Ксения Сергеевна', paid: '25000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '⚡️', name: 'Электрик Крым Александр', paid: '56000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '🧱', name: 'Иван Сияр Сендвич', paid: '44000', expected: '', paymentDate: '', startDate: '', clientType: 'new' },
    { emoji: '🧱', name: 'Дома Андрей', paid: '50000', expected: '', paymentDate: '', startDate: '', clientType: 'new' }
  ];

  function resolveAssetsClientType(p) {
    if (p.clientType && p.clientType !== 'new') return p.clientType;
    var fromProjects = (typeof loadProjectsData === 'function') ? (loadProjectsData().projects || []) : [];
    var folderId = '';
    if (p.folderLink) {
      var m = String(p.folderLink).match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (m) folderId = m[1];
    }
    folderId = folderId || p.crmClientId || '';
    var nameLow = String(p.name || '').trim().toLowerCase();
    for (var i = 0; i < fromProjects.length; i++) {
      var pr = fromProjects[i];
      if (folderId && (String(pr.folderId || '') === folderId || String(pr.crmClientId || '') === folderId)) return (pr.clientType === 'old' || pr.clientType === 'returning') ? pr.clientType : 'new';
      var prLow = String(pr.title || '').trim().toLowerCase();
      if (nameLow && prLow && (nameLow === prLow || prLow.indexOf(nameLow) >= 0 || nameLow.indexOf(prLow) >= 0)) return (pr.clientType === 'old' || pr.clientType === 'returning') ? pr.clientType : 'new';
    }
    return p.clientType || 'new';
  }

  function getStatusBadge(clientType) {
    var t = (clientType || 'new').toLowerCase();
    if (t === 'old' || t === '💎') return '💎';
    if (t === 'returning' || t === '2') return '2';
    return 'NEW';
  }

  function cycleClientType(clientType) {
    if (clientType === 'new') return 'old';
    if (clientType === 'old') return 'returning';
    return 'new';
  }

  function isDateInThisMonth(dateStr) {
    if (!dateStr || !String(dateStr).trim()) return false;
    var parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length < 2) return false;
    var now = new Date();
    var year = parseInt(parts[0], 10) || now.getFullYear();
    var month = (parseInt(parts[1], 10) || 1) - 1;
    return year === now.getFullYear() && month === now.getMonth();
  }

  function calcNewClientsThisMonth() {
    var myList = getAssetsMy();
    var sashaList = getAssetsSasha();
    var sum = 0;
    function addIfNewThisMonth(p, amountField) {
      if (resolveAssetsClientType(p) !== 'new') return;
      var dateStr = (p.paymentDate || p.startDate || '').trim();
      if (!dateStr || !isDateInThisMonth(dateStr)) return;
      var amt = parseInt(String(p[amountField] || '').replace(/\s/g, ''), 10) || 0;
      sum += amt;
    }
    myList.forEach(function(p) { addIfNewThisMonth(p, 'paid'); });
    sashaList.forEach(function(p) { addIfNewThisMonth(p, 'soldFor'); });
    return sum;
  }

  function calcActiveClientsThisMonth() {
    var myList = getAssetsMy();
    var sashaList = getAssetsSasha();
    var sum = 0;
    function addIfActiveThisMonth(p, amountField) {
      if (resolveAssetsClientType(p) === 'new') return;
      var dateStr = (p.paymentDate || p.startDate || '').trim();
      if (!dateStr || !isDateInThisMonth(dateStr)) return;
      var amt = parseInt(String(p[amountField] || '').replace(/\s/g, ''), 10) || 0;
      sum += amt;
    }
    myList.forEach(function(p) { addIfActiveThisMonth(p, 'paid'); });
    sashaList.forEach(function(p) { addIfActiveThisMonth(p, 'soldFor'); });
    return sum;
  }

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

  function formatDateDDMM(dateStr) {
    if (!dateStr || !String(dateStr).trim()) return '—';
    var parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length < 3) return '—';
    var d = parts[2].length >= 2 ? parts[2] : '0' + parts[2];
    var m = parts[1].length >= 2 ? parts[1] : '0' + parts[1];
    return d + '.' + m;
  }

  function formatDaysUntilPayment(dateStr) {
    if (!dateStr || !String(dateStr).trim()) return '—';
    var parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length < 3) return '—';
    var year = parseInt(parts[0], 10) || new Date().getFullYear();
    var month = (parseInt(parts[1], 10) || 1) - 1;
    var day = parseInt(parts[2], 10) || 1;
    var payDate = new Date(year, month, day);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    payDate.setHours(0, 0, 0, 0);
    var days = Math.ceil((payDate - today) / (24 * 60 * 60 * 1000));
    if (days === 0) return 'сегодня';
    if (days === 1) return 'завтра';
    if (days === -1) return 'вчера';
    if (days > 1 && days <= 60) return days + ' д';
    if (days < -1) return Math.abs(days) + ' д назад';
    return formatDateDDMM(dateStr);
  }

  function getAssetsMy() {
    try {
      var isSasha = !!(typeof window !== 'undefined' && window.AVITOLOG_IS_SASHA);
      var fallbackMyKeys = isSasha
        ? ['avitolog_assets_my_v2_sasha', 'avitolog_assets_my_v2']
        : ['avitolog_assets_my_v2', 'avitolog_assets_my_v2_sasha'];
      var arr = bootstrapAssetsArray(ASSETS_MY_KEY, fallbackMyKeys);
      if (arr !== null) {
        if (arr.length === 0) {
          if (isSasha) { return []; }
          saveAssetsMy(DEFAULT_MY.slice());
          return DEFAULT_MY.slice();
        }
        return arr;
      }
      var legacy = JSON.parse(localStorage.getItem(ASSETS_LEGACY_KEY) || '{}');
      var arr = [];
      var ownerFilter = isSasha ? 'sasha' : 'me';
      Object.keys(legacy).forEach(function(k) {
        var d = legacy[k];
        if (d && d.owner === ownerFilter) {
          var paid = d.paid || (isSasha ? d.soldFor : '') || '';
          arr.push({ emoji: '📦', name: k, paid: paid, expected: d.expected || '', paymentDate: d.paymentDate || '', startDate: d.startDate || '', clientType: d.clientType || 'new' });
        }
      });
      if (arr.length) { saveAssetsMy(arr); return arr; }
      if (isSasha) return [];
      saveAssetsMy(DEFAULT_MY.slice());
      return DEFAULT_MY.slice();
    } catch (e) {
      if (typeof window !== 'undefined' && window.AVITOLOG_IS_SASHA) return [];
      saveAssetsMy(DEFAULT_MY.slice());
      return DEFAULT_MY.slice();
    }
  }

  function saveAssetsMy(arr) {
    try { localStorage.setItem(ASSETS_MY_KEY, JSON.stringify(arr)); } catch (e) {}
    try { localStorage.setItem(assetsMonthStorageKey(assetsCurrentMonthKey()), JSON.stringify(arr)); } catch(e) {}
  }

  function getAssetsSasha() {
    if (typeof window !== 'undefined' && window.AVITOLOG_IS_SASHA) return [];
    try {
      var arrExisting = bootstrapAssetsArray(ASSETS_SASHA_KEY, ['avitolog_assets_sasha_v2', 'avitolog_assets_sasha_v2_sasha']);
      if (arrExisting !== null) return arrExisting;
      var legacy = JSON.parse(localStorage.getItem(ASSETS_LEGACY_KEY) || '{}');
      var arr = [];
      Object.keys(legacy).forEach(function(k) {
        var d = legacy[k];
        if (d && d.owner === 'sasha') arr.push({ emoji: '📦', name: k, paid: d.paid || '', expected: d.expected || '', paymentDate: d.paymentDate || '', startDate: d.startDate || '', clientType: d.clientType || 'new', soldFor: d.soldFor || '', toAgent: d.toAgent || '', aoaPercent: d.aoaPercent || '' });
      });
      if (arr.length) { saveAssetsSasha(arr); return arr; }
      return [];
    } catch (e) { return []; }
  }

  function saveAssetsSasha(arr) {
    try { localStorage.setItem(ASSETS_SASHA_KEY, JSON.stringify(arr)); } catch (e) {}
    try { localStorage.setItem(assetsSashaMonthStorageKey(assetsCurrentMonthKey()), JSON.stringify(arr)); } catch(e) {}
  }

  function getAssetsBase() {
    try {
      var s = localStorage.getItem(ASSETS_BASE_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  function saveAssetsBase(arr) {
    try { localStorage.setItem(ASSETS_BASE_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function addAssetsProject(owner, project) {
    var name = (project && (project.name || project.company || project.contact_name)) || 'Новый проект';
    name = String(name).trim() || 'Новый проект';
    var emoji = (project && project.emoji) || '📦';
    var paid = (project && (project.mainPrice || project.saleAmount || project.kp_count || '')) ? String(project.mainPrice || project.saleAmount || project.kp_count).replace(/\s/g, '') : '';
    var folderLink = project && (project.folderLink || (project.folderId ? 'https://drive.google.com/drive/folders/' + project.folderId : ''));
    var item = { emoji: emoji, name: name, paid: paid, expected: '', paymentDate: '', startDate: '', clientType: 'new', folderLink: folderLink || '', crmClientId: (project && project.crmClientId) || (project && project.folderId) || '' };
    if (owner === 'sasha') {
      item.soldFor = '';
      item.toAgent = '';
      item.aoaPercent = '';
    }
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
      if (idx >= 0 && idx < arr.length) {
        var p = arr[idx];
        addToBaseFromPicker(p);
        arr.splice(idx, 1);
        saveAssetsMy(arr);
      }
    } else {
      var arr2 = getAssetsSasha();
      if (idx >= 0 && idx < arr2.length) { arr2.splice(idx, 1); saveAssetsSasha(arr2); }
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function renderAssetsPage() {
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    assetsCheckMonthTransition();
    var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    function calcNameColWidth(list) {
      var longest = 'Проект';
      (list || []).forEach(function(p) {
        var nm = String((p && p.name) || '').trim();
        if (nm.length > longest.length) longest = nm;
      });
      var px = 0;
      try {
        var c = document.createElement('canvas');
        var ctx = c.getContext('2d');
        if (ctx) {
          ctx.font = '700 12px "Golos Text", sans-serif';
          px = Math.ceil(ctx.measureText(longest).width);
        }
      } catch (e) {}
      if (!px) px = longest.length * 8;
      return Math.max(130, Math.min(360, px + 36));
    }
    var isAssetsArchive = !!_assetsViewMonth;
    var assetsViewYM = _assetsViewMonth || assetsCurrentMonthKey();
    var myList, sashaList;
    if (isAssetsArchive) {
      var snap = assetsLoadMonthSnapshot(assetsViewYM);
      myList = snap.my || [];
      sashaList = snap.sasha || [];
    } else {
      myList = getAssetsMy();
      sashaList = getAssetsSasha();
      assetsSnapshotCurrentMonth();
    }
    var myNameColW = calcNameColWidth(myList);
    var sashaNameColW = calcNameColWidth(sashaList);
    var myTotal = myList.reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var sashaSoldTotal = sashaList.reduce(function(a, p) { return a + (parseInt(String(p.soldFor || p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var sashaAoaTotal = sashaList.reduce(function(a, p) { return a + (parseInt(String(p.aoaPercent || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var isSashaView = !!(typeof window !== 'undefined' && window.AVITOLOG_IS_SASHA);
    var totalRub = myTotal + (isSashaView ? 0 : sashaAoaTotal);
    var totalUsd = Math.round(totalRub / ASSETS_USD_RATE);
    var newClientsSum = calcNewClientsThisMonth();
    var newClientsVal = newClientsSum > 0 ? fmt(newClientsSum) : '';
    var activeClientsSum = calcActiveClientsThisMonth();
    var activeClientsVal = activeClientsSum > 0 ? fmt(activeClientsSum) : '';
    var expectedSum = myList.reduce(function(a, p) { return a + (parseInt(String(p.expected || '').replace(/\s/g, ''), 10) || 0); }, 0) + (isSashaView ? 0 : sashaList.reduce(function(a, p) { return a + (parseInt(String(p.expected || '').replace(/\s/g, ''), 10) || 0); }, 0));
    var expectedVal = expectedSum > 0 ? fmt(expectedSum) : '';
    var aoaSum = isSashaView ? 0 : sashaList.reduce(function(a, p) { return a + (parseInt(String(p.aoaPercent || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var summaryRows = [
      { icon: '💰', label: 'Получено за все', val: totalRub > 0 ? fmt(totalRub) : '', valUsd: totalUsd, main: true },
      { icon: '✅', label: 'Оплаты клиентов', val: totalRub > 0 ? fmt(totalRub) : '', valUsd: null },
      { icon: '🌿', label: 'Ожидается еще', val: expectedVal },
      { icon: '📊', label: 'Ожидается за мес', val: expectedVal },
      { icon: '📈', label: 'Агентство AoA %', val: aoaSum > 0 ? fmt(aoaSum) : '' },
      { icon: '🆕', label: 'Новые клиенты', val: newClientsVal },
      { icon: '👤', label: 'Активные клиенты', val: activeClientsVal }
    ];
    var summaryHtml = summaryRows.map(function(r) {
      var rowCls = 'assets-summary-row' + (r.main ? ' assets-summary-main' : '');
      var valHtml = r.val ? (r.main ? '<span class="assets-summary-val">' + esc(r.val) + ' ₽<span class="assets-summary-usd">$' + fmt(r.valUsd) + '</span></span>' : '<span class="assets-summary-val">' + esc(r.val) + ' ₽</span>') : '<span class="assets-summary-val">—</span>';
      return '<div class="' + rowCls + '"><span class="assets-summary-label">' + r.icon + ' ' + esc(r.label) + '</span>' + valHtml + '</div>';
    }).join('');
    var now = new Date();
    var monthTitle = assetsFormatMonthLabel(assetsViewYM);
    var filterPaid = !!localStorage.getItem(ASSETS_FILTER_PAID_KEY);
    var paidFirst = myList.filter(function(p) { return !!(p.paid && String(p.paid).replace(/\s/g, '')); });
    var notPaid = myList.filter(function(p) { return !(p.paid && String(p.paid).replace(/\s/g, '')); });
    var mySorted = filterPaid ? paidFirst : (paidFirst.concat(notPaid));
    function renderColRow(p, idx, owner) {
      var paidFmt = (p.paid || '') ? fmt(String(p.paid).replace(/\s/g, '')) : '';
      var expectedFmt = (p.expected || '') ? fmt(String(p.expected).replace(/\s/g, '')) : '';
      var soldForFmt = (p.soldFor || '') ? fmt(String(p.soldFor).replace(/\s/g, '')) : '';
      var toAgentFmt = (p.toAgent || '') ? fmt(String(p.toAgent).replace(/\s/g, '')) : '';
      var aoaFmt = (p.aoaPercent || '') ? fmt(String(p.aoaPercent).replace(/\s/g, '')) : '';
      var payDate = (p.paymentDate || '').trim();
      var startDate = (p.startDate || '').trim();
      var barFill = getPaymentBarFill(payDate);
      var isPaid = !!(p.paid && String(p.paid).replace(/\s/g, ''));
      var rowCls = 'assets-col-row' + (owner === 'me' && isPaid ? ' assets-row-paid' : '');
      var barPct = Math.round(barFill * 100);
      var resolvedType = resolveAssetsClientType(p);
      var statusBadge = getStatusBadge(resolvedType);
      var statusCls = resolvedType === 'old' ? 'assets-status-diamond' : (resolvedType === 'returning' ? 'assets-status-2' : 'assets-status-new');
      var hasFolder = !!(p.folderLink || p.crmClientId);
      var folderLink = p.folderLink || (p.crmClientId ? 'https://drive.google.com/drive/folders/' + p.crmClientId : '');
      var folderHtml = hasFolder && folderLink
        ? '<span class="assets-row-folder-inline"><a href="' + esc(folderLink) + '" target="_blank" rel="noopener" class="assets-row-folder-link" onclick="event.stopPropagation()" title="Открыть папку">📁</a></span>'
        : '';
      var payDays = formatDaysUntilPayment(payDate);
      var base = '<div class="' + rowCls + '" data-owner="' + owner + '" data-idx="' + idx + '" data-has-folder="' + (hasFolder ? '1' : '0') + '" onclick="window.__assetsRowClicked(event,\'' + owner + '\',' + idx + ')" title="Клик — выбрать для привязки папки из меню слева">' +
        '<button type="button" class="assets-col-emoji" onclick="window.__assetsShowEmojiPicker(this,\'' + owner + '\',' + idx + ')" title="Выбрать эмодзи">' + (p.emoji || '📦') + '</button>' +
        '<span class="assets-col-name">' +
          '<span class="assets-col-name-row">' +
            '<input type="text" value="' + esc(p.name || '') + '" placeholder="Проект" data-field="name" onblur="window.__assetsSaveColRow(this)">' +
            folderHtml +
            '<button type="button" class="assets-status-badge ' + statusCls + '" onclick="window.__assetsCycleClientType(\'' + owner + '\',' + idx + ')" title="Старый/новичок/2-й раз">' + esc(statusBadge) + '</button>' +
          '</span>' +
        '</span>' +
        '<span class="assets-col-payment" title="Дата платежа — клик для выбора"><span class="assets-payment-cell"><span class="assets-progress-bar" title="След. платёж"><span class="assets-progress-fill" style="width:' + barPct + '%"></span></span><span class="assets-payment-wrap"><input type="date" value="' + esc(payDate) + '" data-field="paymentDate" onchange="window.__assetsSaveColRow(this);if(window.__renderAssetsPage)window.__renderAssetsPage()" class="assets-date-inp"><span class="assets-payment-display">' + esc(payDays) + '</span></span></span></span>';
      if (owner === 'sasha') {
        base += '<span class="assets-col-extra"><input type="text" value="' + esc(soldForFmt) + '" placeholder="0" data-field="soldFor" onblur="window.__assetsSaveColRow(this)" title="Продано за"></span>' +
          '<span class="assets-col-extra"><input type="text" value="' + esc(toAgentFmt) + '" placeholder="0" data-field="toAgent" onblur="window.__assetsSaveColRow(this)" title="Агенту"></span>' +
          '<span class="assets-col-extra"><input type="text" value="' + esc(aoaFmt) + '" placeholder="0" data-field="aoaPercent" onblur="window.__assetsSaveColRow(this)" title="AoA %"></span>';
      } else {
        base += '<span class="assets-col-paid"><input type="text" value="' + esc(paidFmt) + '" placeholder="0" data-field="paid" onblur="window.__assetsSaveColRow(this)"></span>' +
          '<span class="assets-col-expected"><input type="text" value="' + esc(expectedFmt) + '" placeholder="0" data-field="expected" onblur="window.__assetsSaveColRow(this)"></span>';
      }
      base += '<button type="button" class="assets-col-remove" onclick="window.__assetsRemoveProject(\'' + owner + '\',' + idx + ')" title="Удалить">✕</button>' +
        '</div>';
      return base;
    }
    var myRows = mySorted.map(function(p, i) {
      var idx = myList.indexOf(p);
      return renderColRow(p, idx, 'me');
    }).join('');
    var sashaRows = sashaList.map(function(p, idx) { return renderColRow(p, idx, 'sasha'); }).join('');
    var colHeaderMe = '<div class="assets-col-header"><span class="ac-emoji"></span><span class="ac-name">Проект</span><span class="ac-payment">Платёж</span><span class="ac-paid">Оплатил</span><span class="ac-expected">Ожидать</span><span class="ac-actions"></span></div>';
    var colHeaderSasha = '<div class="assets-col-header"><span class="ac-emoji"></span><span class="ac-name">Проект</span><span class="ac-payment">Платёж</span><span class="ac-extra">Продано за</span><span class="ac-extra">Агенту</span><span class="ac-extra">AoA %</span><span class="ac-actions"></span></div>';
    var sashaColHtml = isSashaView ? '' : (
        '<div class="assets-col assets-col-sasha" id="assetsColSasha" data-owner="sasha" style="--assets-name-col-width:' + sashaNameColW + 'px">' +
          '<div class="assets-col-title">👤 Клиенты Саши <span class="assets-col-total">' + fmt(sashaSoldTotal) + ' ₽</span><span class="assets-col-breakdown">· Саше <span class="assets-col-sasha-agent">' + fmt(sashaList.reduce(function(a,p){return a+(parseInt(String(p.toAgent||'').replace(/\s/g,''),10)||0);},0)) + '</span> ₽ · Агентству <span class="assets-col-sasha-agency">' + fmt(sashaList.reduce(function(a,p){return a+(parseInt(String(p.aoaPercent||'').replace(/\s/g,''),10)||0);},0)) + '</span> ₽</span></div>' +
          '<div class="assets-col-list">' + colHeaderSasha + sashaRows + '</div>' +
          '<div class="assets-col-add-row"><button type="button" class="assets-col-add" onclick="window.__assetsAddProject(\'sasha\')">+ Добавить</button><button type="button" class="assets-col-add assets-col-add-base" onclick="window.__assetsShowBasePicker(this)" title="Выбрать из базы">+ из базы</button></div>' +
        '</div>'
      );
    var monthNavHtml = '<div class="assets-month-nav-wrap">' +
      '<button type="button" class="assets-month-nav-btn" onclick="window.__assetsMonthPrev()" title="Предыдущий месяц">◀</button>' +
      '<span class="assets-month-nav-label">' + esc(monthTitle) + '</span>' +
      '<button type="button" class="assets-month-nav-btn" onclick="window.__assetsMonthNext()" title="Следующий месяц">▶</button>' +
      '</div>';
    var archiveBanner = isAssetsArchive ? '<div class="assets-archive-banner">📁 Архив: ' + esc(monthTitle) + '</div>' : '';
    mc.innerHTML = '<div class="assets-page-wrap">' +
      archiveBanner +
      '<div class="assets-summary-top"><div class="assets-month-title">' + monthNavHtml + '</div><div class="assets-summary-table">' + summaryHtml + '</div></div>' +
      '<div class="assets-two-cols' + (isSashaView ? ' assets-single-col' : '') + '">' +
        '<div class="assets-col assets-col-me" id="assetsColMe" data-owner="me" style="--assets-name-col-width:' + myNameColW + 'px">' +
          '<div class="assets-col-title">💰 Мои клиенты <span class="assets-col-total">' + fmt(myTotal) + ' ₽</span><span class="assets-col-breakdown">· новые <span class="assets-col-me-new">' + fmt(myList.reduce(function(a,p){var v=parseInt(String(p.paid||'').replace(/\s/g,''),10)||0;return resolveAssetsClientType(p)==='new'?a+v:a;},0)) + '</span> ₽ · старые <span class="assets-col-me-old">' + fmt(myList.reduce(function(a,p){var v=parseInt(String(p.paid||'').replace(/\s/g,''),10)||0;return resolveAssetsClientType(p)!=='new'?a+v:a;},0)) + '</span> ₽</span></div>' +
          '<button type="button" class="assets-filter-btn' + (filterPaid ? ' on' : '') + '" onclick="window.__assetsToggleFilterPaid && window.__assetsToggleFilterPaid()">💰 оплатили</button>' +
          '<div class="assets-col-list">' + colHeaderMe + myRows + '</div>' +
          '<div class="assets-col-add-row"><button type="button" class="assets-col-add assets-col-add-new" onclick="window.__assetsAddProject(\'me\')">Добавить NEW</button><button type="button" class="assets-col-add assets-col-add-base" onclick="window.__assetsShowBasePicker(this)" title="Выбрать из базы">+ из базы</button></div>' +
        '</div>' +
        sashaColHtml +
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
    setTimeout(function() {
      if (typeof window.__wireAssetsDragTargets === 'function') window.__wireAssetsDragTargets();
      var sel = window._assetsSelectedProject;
      if (sel && typeof updateAssetsDetailPanel === 'function') {
        var row = document.querySelector('.assets-col-row[data-owner="' + (sel.owner || '') + '"][data-idx="' + sel.idx + '"]');
        if (row) {
          row.classList.add('assets-row-bind-selected');
          row.classList.add(row.getAttribute('data-has-folder') === '1' ? 'assets-row-has-folder' : 'assets-row-no-folder');
        }
        updateAssetsDetailPanel(sel.owner, sel.idx);
      } else if (typeof updateAssetsDetailPanel === 'function') {
        updateAssetsDetailPanel(null, null);
      }
      if (typeof window.__assetsPagePostRender === 'function') window.__assetsPagePostRender();
    }, 50);
  }

  function saveColRow(el) {
    if (!el) return;
    var row = el.closest('.assets-col-row');
    var owner = row && row.getAttribute('data-owner');
    var idx = row ? parseInt(row.getAttribute('data-idx'), 10) : -1;
    var field = el.getAttribute('data-field');
    var val = (field === 'name' || field === 'paymentDate' || field === 'startDate') ? String(el.value || '').trim() : String(el.value || '').replace(/\s/g, '');
    if (!owner || idx < 0 || !field) return;
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (arr[idx]) {
        arr[idx][field] = val;
        if (field === 'paid') { var amt = parseInt(val.replace(/\s/g, ''), 10) || 0; var d = new Date(); arr[idx].paymentHistory = amt > 0 ? [{ date: (arr[idx].paymentDate || '').trim() || (d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())), amount: amt }] : []; }
        saveAssetsMy(arr);
      }
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[idx]) {
        arr2[idx][field] = val;
        if (field === 'soldFor') { var amt = parseInt(val.replace(/\s/g, ''), 10) || 0; var d = new Date(); arr2[idx].paymentHistory = amt > 0 ? [{ date: (arr2[idx].paymentDate || '').trim() || (d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())), amount: amt }] : []; }
        saveAssetsSasha(arr2);
      }
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
    var myList = getAssetsMy();
    var sashaList = getAssetsSasha();
    var myTotal = myList.reduce(function(a, p) { return a + (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var myNew = 0, myOld = 0;
    myList.forEach(function(p) {
      var v = parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0;
      var t = resolveAssetsClientType(p);
      if (t === 'new') myNew += v; else myOld += v;
    });
    var sashaTotal = sashaList.reduce(function(a, p) {
      var v = parseInt(String(p.soldFor || p.paid || '').replace(/\s/g, ''), 10) || 0;
      return a + v;
    }, 0);
    var sashaToAgent = sashaList.reduce(function(a, p) { return a + (parseInt(String(p.toAgent || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var sashaToAgency = sashaList.reduce(function(a, p) { return a + (parseInt(String(p.aoaPercent || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var meEl = document.querySelector('.assets-col-me .assets-col-total');
    var meNewEl = document.querySelector('.assets-col-me .assets-col-me-new');
    var meOldEl = document.querySelector('.assets-col-me .assets-col-me-old');
    var sashaEl = document.querySelector('.assets-col-sasha .assets-col-total');
    var sashaAgentEl = document.querySelector('.assets-col-sasha .assets-col-sasha-agent');
    var sashaAgencyEl = document.querySelector('.assets-col-sasha .assets-col-sasha-agency');
    if (meEl) meEl.textContent = fmt(myTotal) + ' ₽';
    if (meNewEl) meNewEl.textContent = fmt(myNew);
    if (meOldEl) meOldEl.textContent = fmt(myOld);
    if (sashaEl) sashaEl.textContent = fmt(sashaTotal) + ' ₽';
    if (sashaAgentEl) sashaAgentEl.textContent = fmt(sashaToAgent);
    if (sashaAgencyEl) sashaAgencyEl.textContent = fmt(sashaToAgency);
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

  function addToBaseFromPicker(p) {
    var arr = getAssetsBase();
    arr.push({ emoji: p.emoji || '📦', name: p.name || '', paid: p.paid || '', expected: p.expected || '', paymentDate: p.paymentDate || '', startDate: p.startDate || '', clientType: p.clientType || 'new', folderLink: p.folderLink || '', crmClientId: p.crmClientId || '' });
    saveAssetsBase(arr);
    if (typeof window.__renderAssetsBasePicker === 'function') window.__renderAssetsBasePicker();
  }

  function confirmImportToBase(rows) {
    if (!rows || !rows.length) return;
    rows.forEach(function(row) {
      var name = row.client || row.project || 'Без названия';
      var match = findMatchesForRow(row.raw || row);
      var item = {
        emoji: (row.raw && row.raw.emoji) || '📦',
        name: name,
        paid: String(row.paid || '').replace(/\s/g, ''),
        expected: row.expected || '',
        paymentDate: row.date || getTodayStr(),
        startDate: '',
        clientType: (row.raw && row.raw.isNew === false) ? 'old' : 'new',
        folderLink: (match && match.folderLink) || row.folderLink || '',
        crmClientId: (match && match.folderId) || row.folderId || ''
      };
      addToBaseFromPicker(item);
    });
  }

  function addFromBaseToActive(idx) {
    var base = getAssetsBase();
    if (idx < 0 || idx >= base.length) return;
    var p = base[idx];
    addAssetsProject('me', p);
  }

  function removeFromBase(idx) {
    var base = getAssetsBase();
    if (idx < 0 || idx >= base.length) return;
    base.splice(idx, 1);
    saveAssetsBase(base);
  }

  function showAssetsBasePicker(btn) {
    var existing = document.getElementById('assetsBasePicker');
    if (existing) { existing.remove(); return; }
    var wrap = document.createElement('div');
    wrap.id = 'assetsBasePicker';
    wrap.className = 'assets-base-picker';
    var w = Math.min(480, Math.max(420, Math.floor(window.innerWidth * 0.32)));
    var h = Math.min(520, Math.max(400, Math.floor(window.innerHeight * 0.7)));
    var rightPos = 24;
    var topPos = Math.max(24, (window.innerHeight - h) / 2);
    wrap.style.cssText = 'right:' + rightPos + 'px;top:' + topPos + 'px;width:' + w + 'px;height:' + h + 'px;left:auto';
    var searchVal = '';
    var _basePickerAiRows = [];
    function updateBasePickerLayoutMode() {
      if (!wrap) return;
      var wNow = wrap.offsetWidth || parseInt(wrap.style.width || '0', 10) || 0;
      wrap.classList.toggle('wide-grid', wNow >= 860);
    }

    function renderList() {
      var base = getAssetsBase();
      var q = String(searchVal || '').trim().toLowerCase();
      var filtered = q ? base.filter(function(p) { var n = String(p.name || '').toLowerCase(); return n.indexOf(q) >= 0; }) : base;
      var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
      var rows = filtered.map(function(p) {
        var realIdx = base.indexOf(p);
        var paidFmt = (p.paid || '') ? fmt(String(p.paid).replace(/\s/g, '')) : '';
        var dt = [p.startDate||'', p.paymentDate||''].filter(Boolean).join(' / ') || '—';
        return '<div class="assets-base-row" data-idx="' + realIdx + '"><span class="ab-col-name">' + (p.emoji || '') + ' ' + esc(p.name || '—') + '</span><span class="ab-col-date">' + esc(dt) + '</span><span class="ab-col-paid">' + esc(paidFmt || '—') + ' ₽</span><button type="button" class="ab-add-btn" title="В Мои клиенты">+</button><button type="button" class="ab-del-btn" title="Удалить из базы">✕</button></div>';
      }).join('');
      var listEl = wrap.querySelector('.assets-base-list');
      if (listEl) listEl.innerHTML = rows || '<div class="assets-base-empty">База пуста. Вставь данные в ИИ-импорт или «+ в базу»</div>';
      updateBasePickerLayoutMode();
    }

    function renderBasePickerAiPreview(rows) {
      var pre = wrap.querySelector('.base-picker-ai-preview');
      var btnAdd = wrap.querySelector('#basePickerAddBtn');
      if (!pre || !btnAdd) return;
      var toAdd = rows && rows.length ? rows.filter(function(r) { return !r.rejected; }) : [];
      if (!toAdd.length) {
        pre.innerHTML = '<span style="color:var(--muted);font-size:11px">Нажми «Разобрать» после вставки текста из таблицы</span>';
        pre.style.display = '';
        btnAdd.disabled = true;
        return;
      }
      pre.style.display = '';
      var hint = window.__aiImportHeuristicHint ? '<div style="font-size:10px;color:var(--accent);margin-bottom:6px;line-height:1.35">' + esc(window.__aiImportHeuristicHint) + '</div>' : '';
      pre.innerHTML = hint +
        '<div style="font-size:11px;color:var(--accent);margin-bottom:4px">Найдено ' + toAdd.length + ' записей. Папки Drive подставляются по названию.</div>' +
        toAdd.slice(0, 5).map(function(r) {
          var n = r.client || r.project || '—';
          var f = r.folderLink || r.matchedFolder ? '✓ папка' : '';
          return '<div style="font-size:11px;margin:2px 0">' + esc((r.raw && r.raw.emoji) || '') + ' ' + esc(n) + ' — ' + esc(r.paid || '') + ' ₽ ' + f + '</div>';
        }).join('') +
        (toAdd.length > 5 ? '<div style="font-size:10px;color:var(--muted)">...и ещё ' + (toAdd.length - 5) + '</div>' : '');
      btnAdd.disabled = false;
    }

    wrap.innerHTML = '<div class="assets-base-picker-header"><span class="base-picker-title">📋 База проектов</span><button type="button" class="base-picker-close" title="Закрыть">✕</button></div>' +
      '<div class="assets-base-picker-inner">' +
      '<div class="assets-base-picker-toolbar"><input type="search" class="assets-base-search" placeholder="Поиск по названию..."><button type="button" class="assets-base-add-row" title="Добавить строку в базу">+ в базу</button></div>' +
      '<div class="assets-base-table"><div class="assets-base-header"><span class="ab-col-name">Проект</span><span class="ab-col-date">Старт / Платёж</span><span class="ab-col-paid">Оплатил</span><span class="ab-col-act"></span></div>' +
      '<div class="assets-base-list"></div></div>' +
      '<div class="assets-base-picker-ai" style="padding:10px 12px;border-top:1px solid var(--border);background:rgba(0,0,0,0.2)">' +
      '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">🤖 ИИ-импорт — вставь из таблицы (название + эмодзи + сумма)</div>' +
      '<textarea class="assets-base-ai-inp" rows="2" placeholder="Пример: 🏠 Дмитрий Бани 34 000&#10;📦 Камни 30 000&#10;⚡ Электрик 25 000 — ИИ найдёт папку на Drive"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:6px;align-items:center">' +
      '<button type="button" class="ai-import-btn primary" onclick="window.__basePickerParse && window.__basePickerParse()">Разобрать</button>' +
      '<button type="button" class="ai-import-btn" id="basePickerAddBtn" onclick="window.__basePickerAddToBase && window.__basePickerAddToBase()" disabled>Добавить в базу</button>' +
      '</div>' +
      '<div class="base-picker-ai-preview" style="margin-top:8px;font-size:11px"></div>' +
      '</div>' +
      '</div>' +
      '<div class="assets-base-picker-resize" title="Потяни — изменить размер"></div>';
    document.body.appendChild(wrap);
    updateBasePickerLayoutMode();

    window.__renderAssetsBasePicker = renderList;
    window.__basePickerParse = function() {
      var ta = wrap.querySelector('.assets-base-ai-inp');
      var raw = (ta && ta.value || '').trim();
      if (!raw) { alert('Вставь текст из таблицы в поле ИИ-импорт.'); return; }
      var pre = wrap.querySelector('.base-picker-ai-preview');
      if (pre) pre.innerHTML = '<span style="color:var(--muted)">⏳ Разбор...</span>';
      parseWithAI(raw).then(function(parsed) {
        _basePickerAiRows = buildPreviewRows(parsed);
        renderBasePickerAiPreview(_basePickerAiRows);
      }).catch(function(e) {
        if (pre) pre.innerHTML = '<span style="color:#ff8080">Ошибка: ' + esc(e.message || e) + '</span>';
      });
    };
    window.__basePickerAddToBase = function() {
      var toAdd = _basePickerAiRows.filter(function(r) { return !r.rejected; });
      if (!toAdd.length) return;
      confirmImportToBase(toAdd);
      renderList();
      _basePickerAiRows = [];
      var ta = wrap.querySelector('.assets-base-ai-inp');
      if (ta) ta.value = '';
      renderBasePickerAiPreview([]);
    };

    var searchInp = wrap.querySelector('.assets-base-search');
    searchInp.oninput = function() { searchVal = searchInp.value; renderList(); };
    searchInp.onkeydown = function(e) { if (e.key === 'Escape') { e.preventDefault(); wrap.querySelector('.base-picker-close').click(); } };
    wrap.querySelector('.assets-base-add-row').onclick = function() {
      addToBaseFromPicker({ emoji: '📦', name: 'Новый в базе', paid: '', expected: '', paymentDate: '', startDate: '', clientType: 'new', folderLink: '', crmClientId: '' });
      renderList();
    };
    wrap.querySelector('.base-picker-close').onclick = function() { wrap.remove(); };
    wrap.onclick = function(e) {
      var delBtn = e.target.closest('.ab-del-btn');
      if (delBtn) {
        e.stopPropagation();
        var row = delBtn.closest('.assets-base-row');
        if (row) { removeFromBase(parseInt(row.getAttribute('data-idx'), 10)); renderList(); }
        return;
      }
      var row = e.target.closest('.assets-base-row');
      if (row && !e.target.closest('.ab-del-btn')) {
        e.stopPropagation();
        addFromBaseToActive(parseInt(row.getAttribute('data-idx'), 10));
        wrap.remove();
      }
    };

    var dragEl = wrap.querySelector('.assets-base-picker-header');
    var resizeEl = wrap.querySelector('.assets-base-picker-resize');
    dragEl.onmousedown = function(e) {
      if (e.target.closest('.base-picker-close')) return;
      e.preventDefault();
      var startRight = parseInt(wrap.style.right, 10) || 24;
      var startTop = parseInt(wrap.style.top, 10) || topPos;
      var startX = e.clientX, startY = e.clientY;
      function move(ev) {
        wrap.style.right = Math.max(0, startRight - (ev.clientX - startX)) + 'px';
        wrap.style.left = 'auto';
        wrap.style.top = Math.max(0, startTop + (ev.clientY - startY)) + 'px';
      }
      function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    resizeEl.onmousedown = function(e) {
      e.preventDefault();
      var startW = wrap.offsetWidth, startH = wrap.offsetHeight, startX = e.clientX, startY = e.clientY;
      function move(ev) {
        var w = Math.max(420, startW + ev.clientX - startX);
        var h = Math.max(300, startH + ev.clientY - startY);
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        updateBasePickerLayoutMode();
      }
      function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };

    renderList();
  }

  function toggleFilterPaid() {
    if (localStorage.getItem(ASSETS_FILTER_PAID_KEY)) localStorage.removeItem(ASSETS_FILTER_PAID_KEY);
    else localStorage.setItem(ASSETS_FILTER_PAID_KEY, '1');
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function setAssetsEmoji(owner, idx, em) {
    if (!em) return;
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (arr[idx]) { arr[idx].emoji = em; saveAssetsMy(arr); }
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[idx]) { arr2[idx].emoji = em; saveAssetsSasha(arr2); }
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function showAssetsEmojiPicker(btn, owner, idx) {
    var existing = document.getElementById('assetsEmojiPicker');
    if (existing) existing.remove();
    var picker = document.createElement('div');
    picker.id = 'assetsEmojiPicker';
    picker.className = 'assets-emoji-picker';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Вставь эмодзи';
    inp.className = 'assets-emoji-custom';
    inp.onkeydown = function(e) {
      if (e.key === 'Enter') {
        var v = inp.value.trim();
        if (v) { setAssetsEmoji(owner, idx, v); picker.remove(); }
      }
    };
    picker.appendChild(inp);
    ASSETS_EMOJIS.forEach(function(em) {
      var s = document.createElement('span');
      s.textContent = em;
      s.onclick = function() {
        setAssetsEmoji(owner, idx, em);
        picker.remove();
      };
      picker.appendChild(s);
    });
    document.body.appendChild(picker);
    var r = btn.getBoundingClientRect();
    picker.style.left = r.left + 'px';
    picker.style.top = (r.bottom + 4) + 'px';
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); }
      });
    }, 0);
  }

  function rowClicked(evt, owner, idx) {
    if (evt.target.closest('input, button, a')) return;
    var row = evt.currentTarget;
    if (!row || !row.classList) return;
    document.querySelectorAll('.assets-col-row.assets-row-bind-selected').forEach(function(r) {
      r.classList.remove('assets-row-bind-selected', 'assets-row-has-folder', 'assets-row-no-folder');
    });
    row.classList.add('assets-row-bind-selected');
    row.classList.add(row.getAttribute('data-has-folder') === '1' ? 'assets-row-has-folder' : 'assets-row-no-folder');
    window._assetsSelectedProject = { owner: owner, idx: idx };
    updateAssetsDetailPanel(owner, idx);
    startFolderBind(owner, idx);
  }

  function getPaymentHistoryEntries(p, owner) {
    var hist = p.paymentHistory;
    if (Array.isArray(hist) && hist.length > 0) return hist;
    var amount = owner === 'me' ? (parseInt(String(p.paid || '').replace(/\s/g, ''), 10) || 0) : (parseInt(String(p.soldFor || '').replace(/\s/g, ''), 10) || 0);
    if (amount > 0 && (p.paymentDate || p.startDate)) return [{ date: (p.paymentDate || p.startDate || '').trim(), amount: amount }];
    return [];
  }

  function recalcPaidFromHistory(p, owner) {
    var hist = p.paymentHistory;
    if (!Array.isArray(hist) || hist.length === 0) return;
    var sum = hist.reduce(function(a, e) { return a + (parseInt(String(e.amount || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var lastDate = '';
    hist.forEach(function(e) {
      var d = (e.date || '').trim();
      if (d && (!lastDate || d > lastDate)) lastDate = d;
    });
    if (owner === 'me') {
      p.paid = String(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      if (lastDate) p.paymentDate = lastDate;
    } else {
      p.soldFor = String(sum).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      if (lastDate) p.paymentDate = lastDate;
    }
  }

  function addPaymentToHistory(owner, idx) {
    var sel = window._assetsSelectedProject;
    if (!sel || sel.owner !== owner || sel.idx !== idx) return;
    var p = null;
    if (owner === 'me') {
      var arr = getAssetsMy();
      p = arr && arr[idx] ? arr[idx] : null;
    } else {
      var arr2 = getAssetsSasha();
      p = arr2 && arr2[idx] ? arr2[idx] : null;
    }
    if (!p) return;
    var d = new Date();
    var inp = prompt('Добавить оплату. Введите дату (ГГГГ-ММ-ДД) и сумму через пробел:\nНапример: 2026-01-15 17000', '2026-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ');
    if (!inp || !inp.trim()) return;
    var parts = inp.trim().split(/\s+/);
    var dateStr = '';
    var amount = 0;
    if (parts.length >= 2) {
      dateStr = parts[0];
      amount = parseInt(String(parts[1]).replace(/\s/g, ''), 10) || 0;
    } else if (parts.length === 1) {
      var num = parseInt(String(parts[0]).replace(/\s/g, ''), 10);
      if (!isNaN(num)) { var dd = new Date(); amount = num; dateStr = dd.getFullYear() + '-' + pad2(dd.getMonth() + 1) + '-' + pad2(dd.getDate()); }
    }
    if (amount <= 0) return;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { var dd = new Date(); dateStr = dd.getFullYear() + '-' + pad2(dd.getMonth() + 1) + '-' + pad2(dd.getDate()); }
    if (!Array.isArray(p.paymentHistory)) p.paymentHistory = [];
    if (p.paymentHistory.length === 0) {
      var prev = getPaymentHistoryEntries(p, owner);
      prev.forEach(function(e) { p.paymentHistory.push({ date: e.date, amount: e.amount }); });
    }
    p.paymentHistory.push({ date: dateStr, amount: amount });
    recalcPaidFromHistory(p, owner);
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (arr[idx]) arr[idx] = p;
      saveAssetsMy(arr);
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[idx]) arr2[idx] = p;
      saveAssetsSasha(arr2);
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
    updateAssetsDetailPanel(owner, idx);
  }

  function updateAssetsDetailPanel(owner, idx) {
    window._assetsSelectedProject = owner != null && idx != null && idx >= 0 ? { owner: owner, idx: idx } : null;
    var panel = document.getElementById('assetsDetailPanel');
    var content = document.getElementById('assetsDetailContent');
    if (!panel || !content) return;
    if (owner == null || idx == null || idx < 0) {
      content.innerHTML = '<div class="ad-placeholder" style="color:var(--muted);font-size:11px">Выберите проект слева</div>';
      return;
    }
    var fmt = function(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var p = null;
    if (owner === 'me') {
      var arr = getAssetsMy();
      p = arr && arr[idx] ? arr[idx] : null;
    } else {
      var arr2 = getAssetsSasha();
      p = arr2 && arr2[idx] ? arr2[idx] : null;
    }
    if (!p) {
      content.innerHTML = '<div class="ad-placeholder" style="color:var(--muted)">Проект не найден</div>';
      return;
    }
    var entries = getPaymentHistoryEntries(p, owner);
    var total = entries.reduce(function(a, e) { return a + (parseInt(String(e.amount || '').replace(/\s/g, ''), 10) || 0); }, 0);
    var expected = parseInt(String(p.expected || '').replace(/\s/g, ''), 10) || 0;
    var payDate = (p.paymentDate || '').trim();
    var payDateFmt = payDate ? (function() {
      var parts = payDate.split(/[-/]/);
      if (parts.length >= 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
      return payDate;
    }()) : '—';
    var html = '<div class="ad-project">' + esc(p.emoji || '') + ' ' + esc(p.name || 'Проект') + '</div>';
    html += '<div class="ad-row"><span class="ad-label">Общая сумма оплат</span><span class="ad-val">' + fmt(total) + ' ₽</span></div>';
    html += '<div class="ad-row"><span class="ad-label">На какой день оплата</span><span class="ad-val">' + esc(payDateFmt) + '</span></div>';
    html += '<div class="ad-section" style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border)"><div class="ad-label" style="margin-bottom:6px">История оплат</div>';
    if (entries.length > 0) {
      entries.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
      entries.forEach(function(e) {
        var df = (e.date || '').trim();
        if (df) {
          var pt = df.split(/[-/]/);
          if (pt.length >= 3) df = pt[2] + '.' + pt[1] + '.' + pt[0];
        } else df = '—';
        html += '<div class="ad-row"><span>' + esc(df) + '</span><span class="ad-val">' + fmt(e.amount || 0) + ' ₽</span></div>';
      });
    } else {
      html += '<div style="color:var(--muted);font-size:11px">Нет записей. Нажмите + выше, чтобы добавить.</div>';
    }
    if (owner === 'me' && expected > 0) {
      html += '<div class="ad-row" style="margin-top:4px"><span class="ad-label">Ожидать</span><span class="ad-val" style="color:#35d0ff">' + fmt(expected) + ' ₽</span></div>';
    }
    html += '</div>';
    content.innerHTML = html;
  }

  function startFolderBind(owner, idx) {
    window._assetsFolderBindTarget = { owner: owner, idx: idx };
    var st = document.getElementById('crmSt');
    if (st) {
      st.style.display = 'block';
      st.className = 'crm-st';
      st.textContent = '📁 Выбери клиента/папку в меню слева';
    }
    var menu = document.getElementById('clientMenu');
    if (menu && !menu.classList.contains('show')) {
      if (typeof toggleClientMenu === 'function') toggleClientMenu();
    }
  }

  function applyFolderBind(folderId, folderLink, client) {
    var t = window._assetsFolderBindTarget;
    if (!t) return;
    window._assetsFolderBindTarget = null;
    if (t.owner === 'me') {
      var arr = getAssetsMy();
      if (arr[t.idx]) {
        arr[t.idx].folderLink = folderLink || '';
        arr[t.idx].crmClientId = (client && client.client_id) || (client && client.folderId) || '';
        saveAssetsMy(arr);
      }
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[t.idx]) {
        arr2[t.idx].folderLink = folderLink || '';
        arr2[t.idx].crmClientId = (client && client.client_id) || (client && client.folderId) || '';
        saveAssetsSasha(arr2);
      }
    }
    var st = document.getElementById('crmSt');
    if (st) { st.style.display = 'block'; st.className = 'crm-st ok'; st.textContent = '✓ Папка привязана'; }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
  }

  function cycleAssetsClientType(owner, idx) {
    if (owner === 'me') {
      var arr = getAssetsMy();
      if (arr[idx]) {
        arr[idx].clientType = cycleClientType(arr[idx].clientType || 'new');
        saveAssetsMy(arr);
      }
    } else {
      var arr2 = getAssetsSasha();
      if (arr2[idx]) {
        arr2[idx].clientType = cycleClientType(arr2[idx].clientType || 'new');
        saveAssetsSasha(arr2);
      }
    }
    if (typeof window.__renderAssetsPage === 'function') window.__renderAssetsPage();
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
  window.__assetsCycleClientType = cycleAssetsClientType;
  window.__assetsToggleFilterPaid = toggleFilterPaid;
  window.__assetsShowEmojiPicker = showAssetsEmojiPicker;
  window.__assetsRowClicked = rowClicked;
  window.__assetsStartFolderBind = startFolderBind;
  window.__assetsApplyFolderBind = applyFolderBind;
  window.__assetsAddPayment = function() {
    var sel = window._assetsSelectedProject;
    if (sel) addPaymentToHistory(sel.owner, sel.idx);
    else alert('Сначала выберите проект слева');
  };
  window.__assetsShowBasePicker = showAssetsBasePicker;
  window.__wireAssetsDragTargets = wireAssetsDragTargets;

  function initRightPanelAssets() {
    var wrap = document.getElementById('rightPanelWrap');
    var grip = document.getElementById('rightResizeGrip');
    if (wrap && grip) {
      var w = parseInt(localStorage.getItem('av_right_panel_w') || '155', 10);
      wrap.style.width = Math.min(380, Math.max(120, w)) + 'px';
      grip.onmousedown = function(e) {
        e.preventDefault();
        grip.classList.add('active');
        var startX = e.clientX, startW = wrap.offsetWidth;
        function move(ev) {
          var dx = startX - ev.clientX;
          var nw = Math.min(380, Math.max(120, startW + dx));
          wrap.style.width = nw + 'px';
          try { localStorage.setItem('av_right_panel_w', String(nw)); } catch(ex) {}
        }
        function up() {
          grip.classList.remove('active');
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      };
    }
    var content = document.getElementById('assetsDetailContent');
    var fs = localStorage.getItem('av_assets_font_size') || 'm';
    if (content) content.className = 'assets-detail-content font-' + fs;
    document.querySelectorAll('.assets-font-btn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-size') === fs);
      btn.onclick = function() {
        var s = btn.getAttribute('data-size');
        document.querySelectorAll('.assets-font-btn').forEach(function(b) { b.classList.remove('on'); if (b.getAttribute('data-size') === s) b.classList.add('on'); });
        if (content) content.className = 'assets-detail-content font-' + s;
        try { localStorage.setItem('av_assets_font_size', s); } catch(ex) {}
      };
    });
  }

  function assetsPagePostRender() {
    if (!window._assetsRightPanelInited) {
      window._assetsRightPanelInited = true;
      initRightPanelAssets();
    }
  }

  window.__assetsPagePostRender = assetsPagePostRender;
})();
