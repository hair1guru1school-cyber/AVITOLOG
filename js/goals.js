/**
 * Goals module — pre-project pipeline (ЦЕЛИ)
 * Tracks activity BEFORE a deal becomes a real project
 */
(function() {
  'use strict';

  const STORAGE_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1';
  var STATUS_LEGACY = { kp_sent:'kp', invoice_sent:'invoice', contract_sent:'contract', instruction_sent:'instruction', deal_discussion:'negotiations' };
  const STATUS_OPTIONS = [
    { id: 'kp', label: 'КП', color: '#35d0ff' },
    { id: 'negotiations', label: 'Переговоры', color: '#7c6af7' },
    { id: 'invoice', label: 'Счет', color: '#00d97e' },
    { id: 'contract', label: 'Договор', color: '#00d97e' },
    { id: 'instruction', label: 'Инструкция', color: '#00d97e' },
    { id: 'paid', label: 'Оплачено', color: '#00ff88' },
    { id: 'reading', label: 'Читает', color: '#35d0ff' },
    { id: 'not_reading', label: 'Не читает', color: '#ff6b35' },
    { id: 'drain', label: 'Слив', color: '#ff4444' }
  ];
  const PROJECT_EMOJIS = [
    '📦','🏠','🏢','🏗️','🧱','🪵','🪟','🚗','🛻','🏍️','🚕','🔧','⚡','🛠️','🧰','🔩',
    '🛋️','🛏️','🚪','🪑','🧴','💄','💇','💅','🏋️','⚽','🎓','📚','👨‍🏫','💻','🖥️','📱',
    '📸','🎥','🎨','🖌️','🧾','💰','💼','🏦','🛒','🍔','☕','🧁','🛍️','👕','👟','💎',
    '🐶','🐱','🌿','🌸','🌳','🏥','🦷','💊','🚚','📦','🧳','⭐','🔥','📋','📈','🎯'
  ];
  const PROJECT_EMOJI_RULES = [
    { emoji: '🏠', re: /(недвиж|риелт|квартир|ипотек|новострой|дом|коттедж|жк|аренд)/i },
    { emoji: '🏗️', re: /(строй|ремонт|отделк|монтаж|фасад|проектир|дизайн интерьер)/i },
    { emoji: '🧱', re: /(кирпич|блок|газоблок|пеноблок|цемент|бетон|стяжк)/i },
    { emoji: '🪵', re: /(пиломат|доска|брус|бревно|фанер|osb|мдф)/i },
    { emoji: '🪟', re: /(окн|остеклен|пвх|балкон|двер)/i },
    { emoji: '⚡', re: /(электрик|электромонтаж|электро)/i },
    { emoji: '🚗', re: /(авто|машин|сто|шиномонтаж|детейлинг|запчаст)/i },
    { emoji: '🛻', re: /(грузоперевоз|доставк|логист|курьер)/i },
    { emoji: '🛋️', re: /(мебел|диван|кроват|шкаф|кухн|прихож|матрас)/i },
    { emoji: '💇', re: /(парикмах|барбер|салон красот|стрижк)/i },
    { emoji: '💄', re: /(космет|бров|ресниц|визаж|макияж)/i },
    { emoji: '🏋️', re: /(фитнес|тренер|зал|йога|пилатес)/i },
    { emoji: '🎓', re: /(репетитор|обучен|курс|школ|универс|подготовк|егэ|огэ)/i },
    { emoji: '💻', re: /(сайт|лендинг|разработк|програм|it|seo|таргет|маркетинг|дизайн)/i },
    { emoji: '📱', re: /(смм|instagram|телеграм|vk|вконтакте|контент|мессенджер)/i },
    { emoji: '📸', re: /(фото|фотограф|съемк|видеограф|видео|рилс)/i },
    { emoji: '🧾', re: /(бухгалтер|налог|отчет|документ|юрист|договор)/i },
    { emoji: '💰', re: /(финанс|кредит|инвест|займ|страхов)/i },
    { emoji: '🏦', re: /(банк|ип|ооо|бизнес|франшиз)/i },
    { emoji: '🛒', re: /(магазин|товар|маркетплейс|wildberries|ozon|продаж)/i },
    { emoji: '🍔', re: /(еда|доставк еды|ресторан|кафе|пицц|суши|бургер)/i },
    { emoji: '☕', re: /(кофе|кофейн|чай|кондитер|пекарн)/i },
    { emoji: '👕', re: /(одежд|обув|бренд|fashion|шоурум)/i },
    { emoji: '💎', re: /(ювелир|украшен|золот|серебр|бриллиант)/i },
    { emoji: '🐶', re: /(зоомаг|ветеринар|груминг|животн|собак|кошк)/i },
    { emoji: '🌿', re: /(сад|ландшафт|растен|цвет|теплиц|газон)/i },
    { emoji: '🏥', re: /(медицин|клиник|врач|массаж|стомат|психолог)/i },
    { emoji: '🦷', re: /(стомат|брекет|имплант|зуб)/i },
    { emoji: '💊', re: /(аптек|лекарств|бады)/i }
  ];
  const TOUCH_OPTIONS = [
    { id: 'sms_sent', label: 'SMS отправлено' },
    { id: 'sms_no_reply', label: 'SMS без ответа' },
    { id: 'reply_received', label: 'Ответ получен' },
    { id: 'call_scheduled', label: 'Созвон назначен' },
    { id: 'contract_sent_touch', label: 'Отправлен договор' },
    { id: 'invoice_sent_touch', label: 'Отправлен счет' },
    { id: 'touch', label: 'Касание' }
  ];

  function getWeekIndex(day) {
    if (day >= 1 && day <= 7) return 1;
    if (day >= 8 && day <= 14) return 2;
    if (day >= 15 && day <= 21) return 3;
    return 4;
  }
  function hasWeekStarted(weekNum, todayDay) {
    if (weekNum === 1) return true;
    if (weekNum === 2) return todayDay >= 8;
    if (weekNum === 3) return todayDay >= 15;
    return todayDay >= 22;
  }
  function getWeekDateRange(weekNum, year, month) {
    var monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    var m = month >= 0 && month < 12 ? month : 0;
    var lastDay = new Date(year, m + 1, 0).getDate();
    var from = 1, to = 7;
    if (weekNum === 1) { from = 1; to = 7; }
    else if (weekNum === 2) { from = 8; to = 14; }
    else if (weekNum === 3) { from = 15; to = 21; }
    else { from = 22; to = lastDay; }
    var mn = monthNames[m] || '';
    return 'с ' + from + ' по ' + to + ' ' + mn;
  }

  function generateId() {
    return 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function loadData() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      var d = s ? JSON.parse(s) : { projects: [] };
      if (!d.customMetrics) d.customMetrics = [];
      if (!d.pinnedMetrics) d.pinnedMetrics = [];
      if (!d.pinnedMetricsMain) d.pinnedMetricsMain = [];
      if (d.totalKpFullOverride === undefined) d.totalKpFullOverride = 342000;
      if (!Array.isArray(d.workOrderWork)) d.workOrderWork = [];
      if (d.workTargetFilter === undefined) d.workTargetFilter = false;
      return d;
    } catch (e) { return { projects: [], customMetrics: [], pinnedMetrics: [], pinnedMetricsMain: [], totalKpFullOverride: 342000 }; }
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.warn('Goals save failed', e); }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    var parts = String(dateStr).split('-');
    if (parts.length >= 3) {
      var d = parts[2], m = parts[1];
      return (d.length === 1 ? '0' + d : d) + '.' + (m.length === 1 ? '0' + m : m);
    }
    return dateStr;
  }
  function getTodayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function formatBadgeDateShort(dateStr) {
    if (!dateStr) return '';
    var s = String(dateStr).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + '.' + m[2];
    var dt = new Date(s);
    if (!isFinite(dt.getTime())) return '';
    return pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1);
  }
  function normalizeStatusId(id) {
    var sid = String(id || '').trim();
    return STATUS_LEGACY[sid] || sid;
  }
  function getStatusDateMap(project) {
    if (!project.statusDates || typeof project.statusDates !== 'object') project.statusDates = {};
    return project.statusDates;
  }
  function getTouchDateMap(project) {
    if (!project.touchDates || typeof project.touchDates !== 'object') project.touchDates = {};
    return project.touchDates;
  }
  function getStatusSetDate(project, statusId) {
    var map = getStatusDateMap(project);
    return map[statusId] || '';
  }
  function getTouchSetDate(project, touchId) {
    var map = getTouchDateMap(project);
    return map[touchId] || '';
  }
  function ensureStatusDates(project, ids) {
    var list = Array.isArray(ids) ? ids : [];
    var map = getStatusDateMap(project);
    var today = getTodayISO();
    list.forEach(function(id) {
      var sid = normalizeStatusId(id);
      if (!map[sid]) map[sid] = today;
    });
    Object.keys(map).forEach(function(k) {
      if (list.indexOf(k) < 0) delete map[k];
    });
  }
  function ensureTouchDates(project, ids) {
    var list = Array.isArray(ids) ? ids : [];
    var map = getTouchDateMap(project);
    var today = getTodayISO();
    list.forEach(function(id) {
      var tid = String(id || '').trim();
      if (!tid) return;
      if (!map[tid]) map[tid] = today;
    });
    Object.keys(map).forEach(function(k) {
      if (list.indexOf(k) < 0) delete map[k];
    });
  }

  function formatSumForDisplay(val) {
    var s = String(val || '').replace(/\s/g, '').replace(/[^\d.]/g, '');
    var n = parseFloat(s);
    if (isNaN(n)) return String(val || '').replace(/\s/g, '') || '0';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function renderPricePopup(project) {
    var opts = project.priceOptions || [];
    if (opts.length <= 1) return null;
    return opts.map(function(p) { return esc(String(p)); }).join('<br>');
  }

  function getMinPrice(p) {
    var opts = p.priceOptions || [];
    if (!opts.length) return p.mainPrice || '';
    var nums = opts.map(function(x) { return parseFloat(String(x).replace(/\s/g,'')); }).filter(function(n) { return !isNaN(n) && n > 0; });
    return nums.length ? String(Math.min.apply(null, nums)) : (p.mainPrice || opts[0] || '');
  }

  function pad2(n) { var s = String(n); return s.length >= 2 ? s : '0' + s; }
  function normalizeStage(stage) {
    var s = String(stage || '').trim().toLowerCase();
    if (s === 'work') s = 'working';
    if (s === 'inwork') s = 'working';
    if (s === 'in_work') s = 'working';
    if (s === 'in-progress') s = 'working';
    if (s === 'in_progress') s = 'working';
    if (s === 'week') s = 'weekly';
    if (s === 'weeks') s = 'weekly';
    if (s === 'sale') s = 'sold';
    return (s === 'weekly' || s === 'working' || s === 'sold' || s === 'archive') ? s : 'weekly';
  }
  function detectStageHint(text) {
    var s = String(text || '').toLowerCase();
    if (!s) return '';
    if (/(в\s*работе|в\s*работу|in\s*work|in\s*progress)/i.test(s)) return 'working';
    if (/(продан|продано|в\s*продано|sold)/i.test(s)) return 'sold';
    if (/(архив|archive)/i.test(s)) return 'archive';
    return '';
  }
  function stripStageHint(text) {
    var s = String(text || '').trim();
    s = s.replace(/^\s*(в\s*работе|в\s*работу|in\s*work|in\s*progress)\s*[:\-–—]?\s*/i, '');
    s = s.replace(/^\s*(продан[оы]?|sold)\s*[:\-–—]?\s*/i, '');
    s = s.replace(/^\s*(архив|archive)\s*[:\-–—]?\s*/i, '');
    return s.trim();
  }
  function pickProjectEmojiByMeaning(name, category, company, note) {
    var src = [name, category, company, note].map(function(x) { return String(x || '').toLowerCase().replace(/ё/g, 'е'); }).join(' ');
    src = src.replace(/\s+/g, ' ').trim();
    if (!src) return '📦';
    for (var i = 0; i < PROJECT_EMOJI_RULES.length; i++) {
      if (PROJECT_EMOJI_RULES[i].re.test(src)) return PROJECT_EMOJI_RULES[i].emoji;
    }
    return '📦';
  }
  function autoTuneProjectEmojis(projects) {
    var changed = false;
    (projects || []).forEach(function(p) {
      if (!p || typeof p !== 'object') return;
      var current = String(p.emoji || '').trim();
      if (current && current !== '📦') return;
      var guessed = pickProjectEmojiByMeaning(p.name || '', p.category || '', p.company || '', p.note || '');
      if (guessed && guessed !== current) {
        p.emoji = guessed;
        changed = true;
      }
    });
    return changed;
  }
  function parseSmartInput(inputEl) {
    if (!inputEl) return;
    var raw = (inputEl.value || '').trim();
    if (!raw) return;
    var lines = raw.split(/[\r\n]+/).map(function(s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) return;
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
    var day = today.getDate();
    var weekIndex = getWeekIndex(day);
    var data = loadData();
    data.projects = data.projects || [];
    var added = 0;
    var forcedStage = normalizeStage(detectStageHint(raw) || 'weekly');
    lines.forEach(function(line) {
      var lineStage = normalizeStage(detectStageHint(line) || forcedStage || 'weekly');
      var name = stripStageHint(line);
      var priceStr = '';
      var m = name.match(/(.+?)\s*[-–—:,]\s*(\d[\d\s]*)$/);
      if (m) {
        name = m[1].trim();
        priceStr = String(m[2]).replace(/\s/g, '');
      } else {
        var tail = name.match(/\s+(\d[\d\s]*)$/);
        if (tail) {
          name = name.slice(0, name.length - tail[0].length).trim();
          priceStr = String(tail[1]).replace(/\s/g, '');
        }
      }
      if (!name) return;
      var prices = priceStr ? [priceStr] : ['—'];
      var nums = priceStr ? [parseFloat(priceStr)] : [];
      var mainPrice = nums.length && !isNaN(nums[0]) ? priceStr : '';
      var project = {
        id: generateId(),
        name: name,
        emoji: pickProjectEmojiByMeaning(name, '', '', ''),
        folderLink: '',
        date: todayStr,
        weekIndex: weekIndex,
        mainPrice: mainPrice,
        priceOptions: prices,
        status: [],
        touchMarkers: [],
        tags: [],
        note: '',
        stage: lineStage
      };
      data.projects.unshift(project);
      added++;
    });
    if (added > 0) {
      saveData(data);
      inputEl.value = '';
      render();
    }
  }

  function processMiniPrompt(inputEl) {
    if (!inputEl) return;
    var raw = String((inputEl.value !== undefined ? inputEl.value : '') || '').trim();
    if (!raw) return;
    var data = loadData();
    data.customMetrics = data.customMetrics || [];
    if (data.customMetrics.length >= 5) {
      var msg = 'Максимум 5 метрик. Меняйте через ИИ строку.';
      if (typeof window.__showToast === 'function') window.__showToast(msg); else alert(msg);
      return;
    }
    var label = '', value = '', unit = '';
    if (raw.indexOf(':') >= 0) {
      var parts = raw.split(':');
      label = (parts[0] || '').trim();
      value = (parts.slice(1).join(':') || '').trim();
    } else {
      var m = raw.match(/^(.+?)\s+(.+)$/);
      if (m) {
        label = (m[1] || '').trim();
        value = (m[2] || '').trim();
      } else {
        label = raw;
        value = '';
      }
    }
    if (!label) return;
    data.customMetrics.push({
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      label: label,
      value: value,
      unit: ''
    });
    try {
      var recentKey = 'avitolog_goals_mini_prompts';
      var recent = JSON.parse(localStorage.getItem(recentKey) || '[]');
      if (!Array.isArray(recent)) recent = [];
      recent = [raw].concat(recent.filter(function(s) { return s !== raw; })).slice(0, 20);
      localStorage.setItem(recentKey, JSON.stringify(recent));
    } catch (e) {}
    saveData(data);
    inputEl.value = '';
    render();
  }

  function processSmartInputWithAI(inputEl) {
    if (!inputEl) return;
    var raw = (inputEl.value || '').trim();
    if (!raw) return;
    var callAPI = typeof window.callAPI === 'function' ? window.callAPI : null;
    var hasKey = (localStorage.getItem('avito_api_key') || '').trim();
    if (!callAPI || !hasKey) {
      parseSmartInput(inputEl);
      return;
    }
    var btn = document.getElementById('goalsSmartInputBtn');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    var data = loadData();
    var today = new Date();
    var day = today.getDate();
    var weekIndex = getWeekIndex(day);
    var todayStr = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
    var currentMetrics = (data.customMetrics || []).slice(0, 5).map(function(m) { return { label: m.label, value: m.value, unit: m.unit }; });
    var prompt = 'Ты помощник по воронке продаж (ЦЕЛИ). Текущие данные:\n' +
      'projects: ' + JSON.stringify((data.projects || []).slice(0, 15).map(function(p) {
        return { name: p.name, mainPrice: p.mainPrice, stage: p.stage, weekIndex: p.weekIndex, status: p.status };
      })) + '\n' +
      'Метрики (макс 5): ' + JSON.stringify(currentMetrics) + '\n' +
      'Неделя сегодня: ' + weekIndex + ', дата: ' + todayStr + '\n\n' +
      'Команда пользователя: ' + JSON.stringify(raw) + '\n\n' +
      'Распредели данные по смыслу. Верни ТОЛЬКО JSON без markdown:\n' +
      '{\n' +
      '  "projectsToAdd": [{"name":"Название","mainPrice":"35000","weekIndex":1,"stage":"weekly","status":["kp"]}],\n' +
      '  "metricsToAdd": [{"label":"Конверсия","value":"12%"}],\n' +
      '  "metricsToUpdate": [{"label":"Конверсия","value":"15%"}],\n' +
      '  "totalKpFullOverride": 342000\n' +
      '}\n\n' +
      'Правила: weekIndex 1-4, stage: weekly|working|sold|archive. metricsToAdd — новая метрика (макс 5 всего). metricsToUpdate — изменить значение по label. totalKpFullOverride — число (общая сумма КП за месяц в руб), если пользователь говорит "общая сумма кп 342000" или подобное. Пустые — []. null — авто.';
    callAPI(prompt, 1500).then(function(rawResp) {
      try {
        var cleaned = (rawResp || '').replace(/```json|```/g, '').trim();
        var fix = typeof window.fixJSON === 'function' ? window.fixJSON : function(x) { return x; };
        var j = JSON.parse(fix(cleaned));
        var changed = false;
        var forcedStage = normalizeStage(detectStageHint(raw) || '');
        if (Array.isArray(j.projectsToAdd) && j.projectsToAdd.length) {
          j.projectsToAdd.forEach(function(it) {
            var itemStage = normalizeStage(it.stage || '');
            var finalStage = forcedStage || itemStage || 'weekly';
            var pr = {
              id: generateId(),
              name: String(it.name || '').trim() || 'Проект',
              emoji: pickProjectEmojiByMeaning(it.name || '', '', '', ''),
              folderLink: '',
              date: todayStr,
              weekIndex: it.weekIndex || weekIndex,
              mainPrice: String(it.mainPrice || '').trim(),
              priceOptions: it.mainPrice ? [String(it.mainPrice)] : [],
              status: Array.isArray(it.status) ? it.status : (it.mainPrice ? ['kp'] : []),
              touchMarkers: [],
              tags: [],
              note: '',
              stage: finalStage
            };
            data.projects.unshift(pr);
            changed = true;
          });
        }
        if (Array.isArray(j.metricsToUpdate) && j.metricsToUpdate.length) {
          data.customMetrics = data.customMetrics || [];
          j.metricsToUpdate.forEach(function(it) {
            var lbl = String(it.label || '').trim().toLowerCase();
            if (!lbl) return;
            var m = data.customMetrics.find(function(x) { return String(x.label || '').trim().toLowerCase() === lbl; });
            if (m) {
              m.value = String(it.value || '').trim();
              if (it.unit !== undefined) m.unit = String(it.unit || '').trim();
              changed = true;
            }
          });
        }
        if (j.totalKpFullOverride !== undefined && j.totalKpFullOverride !== null) {
          var v = parseFloat(String(j.totalKpFullOverride).replace(/\s/g, '')) || 0;
          data.totalKpFullOverride = v > 0 ? v : null;
          changed = true;
        } else if (j.totalKpFullOverride === null) {
          data.totalKpFullOverride = null;
          changed = true;
        }
        if (Array.isArray(j.metricsToAdd) && j.metricsToAdd.length) {
          data.customMetrics = data.customMetrics || [];
          var maxMetrics = 5;
          j.metricsToAdd.forEach(function(it) {
            if (data.customMetrics.length >= maxMetrics) return;
            data.customMetrics.push({
              id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
              label: String(it.label || 'Метрика').trim(),
              value: String(it.value || '').trim(),
              unit: String(it.unit || '').trim()
            });
            changed = true;
          });
        }
        if (changed) {
          saveData(data);
          inputEl.value = '';
          render();
        } else {
          parseSmartInput(inputEl);
        }
      } catch (e) {
        parseSmartInput(inputEl);
      }
    }).catch(function() {
      parseSmartInput(inputEl);
    }).finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Добавить'; }
    });
  }

  function renderWeekSection(weekNum, projects, soldAll, activeClient, currentWeekNum, year, month) {
    var selectedProjectNameNorm = '';
    if (typeof window.__goalsGetSelectedProjectName === 'function') {
      selectedProjectNameNorm = String(window.__goalsGetSelectedProjectName() || '').trim().toLowerCase();
    }
    var rows = projects.map(function(p) {
      var rawMain = getMinPrice(p);
      var mainPrice = rawMain ? formatSumForDisplay(rawMain) : '—';
      var statusBadges = (p.status || []).map(function(sId) {
        var id = normalizeStatusId(sId);
        var s = STATUS_OPTIONS.find(function(o) { return o.id === id; });
        var dt = formatBadgeDateShort(getStatusSetDate(p, id));
        var dtHtml = dt ? '<span class="goal-badge-date">' + esc(dt) + '</span>' : '';
        return s ? '<span class="goal-status-badge goal-status-toggle" style="background:' + s.color + '22;border-color:' + s.color + ';color:' + s.color + '">' + esc(s.label) + dtHtml + ' <span class="goal-badge-rm" onclick="event.stopPropagation();window.__goalsRemoveStatus&&window.__goalsRemoveStatus(\'' + esc(p.id) + '\',\'' + esc(s.id) + '\')" title="Удалить">×</span></span>' : '';
      }).filter(Boolean).join('');
      var touchBadges = (p.touchMarkers || []).map(function(tId) {
        var t = TOUCH_OPTIONS.find(function(o) { return o.id === tId; });
        var dt = formatBadgeDateShort(getTouchSetDate(p, tId));
        var dtHtml = dt ? '<span class="goal-badge-date">' + esc(dt) + '</span>' : '';
        return t ? '<span class="goal-touch-badge goal-status-toggle">' + esc(t.label) + dtHtml + ' <span class="goal-badge-rm" onclick="event.stopPropagation();window.__goalsRemoveTouch&&window.__goalsRemoveTouch(\'' + esc(p.id) + '\',\'' + esc(t.id) + '\')" title="Удалить">×</span></span>' : '';
      }).filter(Boolean).join('');
      var customTags = (p.tags || []).map(function(t, i) {
        return '<span class="goal-custom-tag">' + esc(t) + ' <span class="goal-custom-tag-rm" onclick="event.stopPropagation();window.__goalsRemoveTag&&window.__goalsRemoveTag(\'' + esc(p.id) + '\',' + i + ')" title="Удалить">×</span></span>';
      }).join('');
      var addBtn = '<button type="button" class="goal-add-status-btn" onclick="event.stopPropagation();window.__goalsShowStatusPicker&&window.__goalsShowStatusPicker(\'' + esc(p.id) + '\',this)" title="Добавить тег">+</button>';
      var revealOnClick = 'event.stopPropagation();var r=this.closest(\'.goal-row\');if(r)r.classList.add(\'goal-add-revealed\');';
      var priceHtml = '<span class="goal-sum goal-sum-edit goal-kp-trigger" onclick="' + revealOnClick + '"><input type="text" class="goal-sum-inline" data-id="' + esc(p.id) + '" data-block="weekly" value="' + esc(mainPrice) + '" onclick="' + revealOnClick + '" placeholder="0" title="Нажмите для изменения"><span class="goal-sum-ruble">₽</span></span>';
      var emoji = p.emoji || '📦';
      var folderIcon = (p.folderLink) ? '<a href="' + esc(p.folderLink) + '" target="_blank" rel="noopener" class="goal-folder-link" title="Открыть папку" onclick="event.stopPropagation()">💿</a>' : '';
      var designations = '<span class="goal-designations">' + (statusBadges ? '<span class="goal-badges">' + statusBadges + '</span>' : '') + (touchBadges ? '<span class="goal-touches">' + touchBadges + '</span>' : '') + customTags + addBtn + '</span>';
      var actionsBtns = '<span class="goal-actions goal-actions-inline">' +
        '<button type="button" class="goal-more-btn" onclick="event.stopPropagation();window.__goalsSelectRow&&window.__goalsSelectRow(\'' + esc(p.id) + '\')" title="Полное редактирование">⋯</button>' +
        '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'sold\')" title="В Продано">✓</button>' +
        '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'working\')" title="В работу">🔥</button>' +
        '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'archive\')" title="В архив">🗂</button>' +
        '<button type="button" class="goal-del-btn" onclick="event.stopPropagation();window.__goalsDelete&&window.__goalsDelete(\'' + esc(p.id) + '\',' + weekNum + ')" title="Удалить из недели">×</button>' +
        '</span>';
      var dispName = String(p.name || '').replace(/\s+/g, ' ').trim();
      var nameCell = '<span class="goal-name-cell" onclick="event.stopPropagation();window.__goalsEditNameCell&&window.__goalsEditNameCell(this)">' +
        '<button type="button" class="goal-emoji-btn" onclick="event.stopPropagation();window.__goalsShowEmojiPicker&&window.__goalsShowEmojiPicker(this,\'' + esc(p.id) + '\')" title="Изменить иконку">' + emoji + '</button>' +
        (folderIcon ? folderIcon + ' ' : '') +
        '<span class="goal-name-inline goal-name-display" data-id="' + esc(p.id) + '" title="' + esc(p.name || '') + '">' + esc(dispName) + '</span>' +
        actionsBtns +
        '</span>';
      var activeClientId = activeClient && activeClient.folderId ? String(activeClient.folderId) : '';
      var activeClientName = activeClient && (activeClient.company || activeClient.contact_name || activeClient.name) ? String(activeClient.company || activeClient.contact_name || activeClient.name).trim().toLowerCase() : '';
      var projectNameNorm = String(p.name || '').trim().toLowerCase();
      var projectCompanyNorm = String(p.company || '').trim().toLowerCase();
      var isActiveClientRow = !!(activeClient && ((activeClientId && String(p.crmClientId || '') === activeClientId) || (activeClientName && (projectNameNorm === activeClientName || projectCompanyNorm === activeClientName))));
      if (!isActiveClientRow && selectedProjectNameNorm) {
        isActiveClientRow = (projectNameNorm === selectedProjectNameNorm || projectCompanyNorm === selectedProjectNameNorm);
      }
      var rowClass = 'goal-row' + (isActiveClientRow ? ' goal-row-client-active' : '');
      return '<div class="' + rowClass + '" data-id="' + esc(p.id) + '" data-week="' + weekNum + '" onclick="window.__goalsQuickAddClientToRow && window.__goalsQuickAddClientToRow(' + weekNum + ',\'' + esc(p.id) + '\',event)" ondragover="window.__goalsClientDragOver && window.__goalsClientDragOver(event)" ondrop="window.__goalsClientDropOnRow && window.__goalsClientDropOnRow(' + weekNum + ',\'' + esc(p.id) + '\',event)">' +
        '<span class="goal-date">' + esc(formatDateShort(p.date)) + '</span>' +
        '<span class="goal-name">' + nameCell + '</span>' +
        '<span class="goal-price-wrap">' + priceHtml + '</span>' +
        designations + '</div>';
    });
    var header = '<div class="goal-row goal-row-header">' +
      '<span class="goal-date">ДАТА</span>' +
      '<span class="goal-name">ПРОЕКТ</span>' +
      '<span class="goal-price-wrap">КП ОТ</span>' +
      '<span class="goal-designations"></span>' +
      '</div>';
    function hasKpStatus(p) {
      var st = p && p.status ? p.status : [];
      return st.indexOf('kp') >= 0 || st.indexOf('kp_sent') >= 0;
    }
    var weekFunnel = (projects || []).reduce(function(s, p) {
      if (!hasKpStatus(p)) return s;
      var v = parseFloat(String(p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0;
      return s + v;
    }, 0);
    var soldFromWeek = (soldAll || []).filter(function(p) {
      var d = p.date ? parseInt(String(p.date).split('-')[2], 10) : 0;
      return getWeekIndex(d || 1) === weekNum;
    });
    var weekSoldSum = soldFromWeek.reduce(function(s, p) {
      var v = parseFloat(String(p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0;
      return s + v;
    }, 0);
    soldFromWeek.filter(hasKpStatus).forEach(function(p) {
      var v = parseFloat(String(p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0;
      weekFunnel += v;
    });
    function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
    var soldCnt = soldFromWeek.length;
    var soldLine = soldCnt > 0 ? '<span class="goal-week-sold">' + soldCnt + ' продано · ' + fmtNum(weekSoldSum) + ' ₽</span>' : '';
    var kpLine = '<span class="goal-week-funnel">КП: ' + fmtNum(weekFunnel) + ' ₽</span>';
    var weekIndicators = '<div class="goal-week-indicators">' + (soldLine ? soldLine + '<span class="goal-week-sep">·</span>' : '') + kpLine + '</div>';
    var clientName = (activeClient && (activeClient.company || activeClient.contact_name || activeClient.name)) ? String(activeClient.company || activeClient.contact_name || activeClient.name).trim() : '';
    if (!clientName && typeof window.__goalsGetSelectedProjectName === 'function') {
      clientName = String(window.__goalsGetSelectedProjectName() || '').trim();
    }
    var clientAvatar = typeof window.__goalsGetActiveClientAvatar === 'function' ? String(window.__goalsGetActiveClientAvatar() || '').trim() : '';
    var avatarHtml = clientAvatar
      ? '<span class="goal-week-add-client-thumb"><img src="' + esc(clientAvatar) + '" alt=""></span>'
      : '<span class="goal-week-add-client-thumb"><span class="goal-week-add-client-fallback">🖼</span></span>';
    var addClientBtn = clientName ? '<button type="button" class="goal-week-add-client" draggable="true" ondragstart="window.__goalsClientDragStart && window.__goalsClientDragStart(event)" ondragend="window.__goalsClientDragEnd && window.__goalsClientDragEnd(event)" onclick="window.__goalsAddClientToWeek && window.__goalsAddClientToWeek(' + weekNum + ')" title="Добавить прикреплённый проект в неделю">' + avatarHtml + '<span class="goal-week-add-client-text"><span class="goal-week-add-client-plus">+</span><span>Добавить</span><span class="goal-week-add-client-name">' + esc(clientName) + '</span></span></button>' : '';
    var dateRange = (typeof year === 'number' && typeof month === 'number') ? getWeekDateRange(weekNum, year, month) : '';
    var titleText = weekNum + ' НЕДЕЛЯ' + (dateRange ? ' · ' + dateRange : '');
    var activeCls = (currentWeekNum === weekNum) ? ' goal-week-active' : '';
    return '<div class="goal-week' + activeCls + '" data-week="' + weekNum + '">' +
      '<div class="goal-week-title">' + titleText + '</div>' +
      '<div class="goal-week-rows" onclick="window.__goalsQuickAddClientToWeek && window.__goalsQuickAddClientToWeek(' + weekNum + ',event)" ondragover="window.__goalsClientDragOver && window.__goalsClientDragOver(event)" ondrop="window.__goalsClientDropOnWeek && window.__goalsClientDropOnWeek(' + weekNum + ',event)">' + header + (rows.length ? rows.join('') : '<div class="goal-empty">Нет проектов</div>') + '</div>' +
      weekIndicators +
      '<div class="goal-week-add-row">' +
      '<button type="button" class="goal-week-add" onclick="window.__goalsOpenModalForWeek && window.__goalsOpenModalForWeek(event,' + weekNum + ')">+ Добавить проект</button>' +
      (addClientBtn ? addClientBtn : '') +
      '</div>' +
      '</div>';
  }

  function renderSection(title, icon, projects, footerHtml, showBadges, showSum, blockType, blockOpts) {
    if (showSum === undefined) showSum = true;
    blockType = blockType || '';
    blockOpts = blockOpts || {};
    var rows = (projects || []).map(function(p) {
      var kpPrice = getMinPrice(p) || p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '';
      var salePrice = (blockType === 'sold' && p.saleAmount) ? String(p.saleAmount) : '';
      var rawSum = (blockType === 'sold' && salePrice) ? salePrice : kpPrice;
      var sum = rawSum ? formatSumForDisplay(rawSum) : rawSum;
      var badges = (showBadges && (p.status || []).length) ? (p.status || []).map(function(sId) {
        var id = normalizeStatusId(sId);
        var s = STATUS_OPTIONS.find(function(o) { return o.id === id; });
        var dt = formatBadgeDateShort(getStatusSetDate(p, id));
        return s ? '<button type="button" class="goal-status-badge goal-status-toggle" style="background:' + s.color + '22;border-color:' + s.color + ';color:' + s.color + '" title="Убрать: ' + esc(s.label) + '" onclick="event.stopPropagation();window.__goalsRemoveStatus&&window.__goalsRemoveStatus(\'' + esc(p.id) + '\',\'' + esc(s.id) + '\')">' + esc(s.label) + (dt ? '<span class="goal-badge-date">' + esc(dt) + '</span>' : '') + '</button>' : '';
      }).filter(Boolean).join('') : '';
      var touchBadges = (showBadges && (p.touchMarkers || []).length) ? (p.touchMarkers || []).map(function(tId) {
        var t = TOUCH_OPTIONS.find(function(o) { return o.id === tId; });
        var dt = formatBadgeDateShort(getTouchSetDate(p, tId));
        return t ? '<button type="button" class="goal-touch-badge goal-status-toggle" title="Убрать: ' + esc(t.label) + '" onclick="event.stopPropagation();window.__goalsRemoveTouch&&window.__goalsRemoveTouch(\'' + esc(p.id) + '\',\'' + esc(t.id) + '\')">' + esc(t.label) + (dt ? '<span class="goal-badge-date">' + esc(dt) + '</span>' : '') + '</button>' : '';
      }).filter(Boolean).join('') : '';
      var customTags = (p.tags || []).map(function(t, i) {
        return '<span class="goal-custom-tag">' + esc(t) + ' <span class="goal-custom-tag-rm" onclick="event.stopPropagation();window.__goalsRemoveTag&&window.__goalsRemoveTag(\'' + esc(p.id) + '\',' + i + ')" title="Удалить">×</span></span>';
      }).join('');
      var addBtn = showBadges ? '<button type="button" class="goal-add-status-btn" onclick="event.stopPropagation();window.__goalsShowStatusPicker&&window.__goalsShowStatusPicker(\'' + esc(p.id) + '\',this)" title="Добавить тег">+</button>' : '';
      var designations = (badges || touchBadges || customTags || addBtn) ? '<span class="goal-designations">' + (badges ? '<span class="goal-badges">' + badges + '</span>' : '') + (touchBadges ? '<span class="goal-touches">' + touchBadges + '</span>' : '') + customTags + addBtn + '</span>' : (addBtn ? '<span class="goal-designations">' + addBtn + '</span>' : '');
      var sumCell;
      var revealOnClick = 'var r=this.closest(\'.goal-row\');if(r)r.classList.add(\'goal-add-revealed\');';
      var hasOpts = (p.priceOptions || []).length > 1;
      var sumCls = 'goal-sum goal-sum-edit goal-kp-trigger' + (hasOpts ? ' goal-price-dd' : '');
      if (blockType === 'sold' && showSum) {
        sumCell = '<span class="' + sumCls + '" onclick="event.stopPropagation();' + revealOnClick + '"><input type="text" class="goal-sum-inline" data-id="' + esc(p.id) + '" data-block="sold" value="' + esc(String(sum)) + '" onclick="event.stopPropagation();' + revealOnClick + '" placeholder="0" title="Нажмите для изменения"><span class="goal-sum-ruble">₽</span></span>';
      } else if (showSum) {
        sumCell = '<span class="' + sumCls + '" onclick="event.stopPropagation();' + revealOnClick + '"><input type="text" class="goal-sum-inline" data-id="' + esc(p.id) + '" data-block="work" value="' + esc(String(sum)) + '" onclick="event.stopPropagation();' + revealOnClick + '" placeholder="0" title="Нажмите для изменения"><span class="goal-sum-ruble">₽</span></span>';
      } else {
        sumCell = '';
      }
      var rowClass = 'goal-row goal-row-alt' + (showSum ? '' : ' goal-row-alt-no-sum');
      if (blockType === 'work' && p.workTarget) rowClass += ' goal-work-marked';
      var dragAttrs = (blockType === 'work')
        ? ' draggable="true" ondragstart="window.__goalsWorkDragStart&&window.__goalsWorkDragStart(event)" ondragover="window.__goalsWorkDragOver&&window.__goalsWorkDragOver(event)" ondragleave="window.__goalsWorkDragLeave&&window.__goalsWorkDragLeave(event)" ondrop="window.__goalsWorkDrop&&window.__goalsWorkDrop(event)" ondragend="window.__goalsWorkDragEnd&&window.__goalsWorkDragEnd(event)"'
        : '';
      var targetBtn = (blockType === 'work')
        ? '<button type="button" class="goal-work-target-btn' + (p.workTarget ? ' on' : '') + '" onclick="event.stopPropagation();window.__goalsToggleWorkTarget&&window.__goalsToggleWorkTarget(\'' + esc(p.id) + '\')" title="В фокусе (мишень)">🎯</button>'
        : '';
      var emoji = p.emoji || '📦';
      var folderIcon = (p.folderLink) ? '<a href="' + esc(p.folderLink) + '" target="_blank" rel="noopener" class="goal-folder-link" title="Открыть папку" onclick="event.stopPropagation()">💿</a>' : '';
      var archBtn = (blockType === 'archive') ? '<button type="button" class="goal-restore-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'weekly\')" title="Вернуть в неделю">&#8634;</button>' : '';
      var toActiveBtn = (blockType === 'sold') ? '<button type="button" class="goal-to-work-btn goal-to-active-btn" onclick="event.stopPropagation();window.__goalsCreateActiveFromSold&&window.__goalsCreateActiveFromSold(\'' + esc(p.id) + '\')" title="Создать активный проект в ПРОЕКТАХ">🅰️</button>' : '';
      var workEditBtn = (blockType === 'work') ? '<button type="button" class="goal-more-btn" onclick="event.stopPropagation();window.__goalsSelectRow&&window.__goalsSelectRow(\'' + esc(p.id) + '\')" title="Редактировать">⋯</button>' : '';
      var workToSoldBtn = (blockType === 'work') ? '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'sold\')" title="В продано">✓</button>' : '';
      var workToArchiveBtn = (blockType === 'work') ? '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'archive\')" title="В архив">🗂</button>' : '';
      var delBtn = (blockType === 'sold' || blockType === 'work') ? '<button type="button" class="goal-del-btn" onclick="event.stopPropagation();window.__goalsDeletePermanent&&window.__goalsDeletePermanent(\'' + esc(p.id) + '\')" title="Удалить">×</button>' : '';
      var dispName = String(p.name || '').replace(/\s+/g, ' ').trim();
      var actionsHtml = (archBtn || '') + (toActiveBtn || '') + (workEditBtn || '') + (workToSoldBtn || '') + (workToArchiveBtn || '') + (delBtn || '');
      var actionsInName = (blockType === 'sold' || blockType === 'work') ? actionsHtml : '';
      var nameCell = '<span class="goal-name-cell" onclick="event.stopPropagation();window.__goalsEditNameCell&&window.__goalsEditNameCell(this)">' +
        targetBtn +
        '<button type="button" class="goal-emoji-btn" onclick="event.stopPropagation();window.__goalsShowEmojiPicker&&window.__goalsShowEmojiPicker(this,\'' + esc(p.id) + '\')" title="Изменить иконку">' + emoji + '</button>' +
        (folderIcon ? folderIcon + ' ' : '') +
        '<span class="goal-name-inline goal-name-display" data-id="' + esc(p.id) + '" title="' + esc(p.name || '') + '">' + esc(dispName) + '</span>' +
        (actionsInName ? '<span class="goal-actions-inline">' + actionsInName + '</span>' : '') +
        '</span>';
      if (blockType === 'sold') {
        return '<div class="' + rowClass + ' goal-row-sold" data-id="' + esc(p.id) + '">' +
          '<span class="goal-date">' + esc(formatDateShort(p.date)) + '</span>' +
          '<span class="goal-name">' + nameCell + '</span>' +
          '<span class="goal-price-wrap">' + (sumCell || '') + '</span>' +
          designations +
          '</div>';
      }
      var sideActions = (blockType === 'work') ? '' : ('<span class="goal-row-actions">' + actionsHtml + '</span>');
      return '<div class="' + rowClass + '" data-id="' + esc(p.id) + '"' + dragAttrs + '>' +
        '<span class="goal-date">' + esc(formatDateShort(p.date)) + '</span>' +
        '<span class="goal-name">' + nameCell + '</span>' +
        '<span class="goal-price-wrap">' + (sumCell || '') + '</span>' +
        designations +
        sideActions +
        '</div>';
    });
    var dropAttrs = (blockType === 'sold')
      ? ' ondragover="window.__goalsClientDragOver && window.__goalsClientDragOver(event)" ondrop="window.__goalsClientDropToSold && window.__goalsClientDropToSold(event)"'
      : '';
    var titleHtml = (blockType === 'work')
      ? '<div class="goal-block-title goal-block-title-work">' +
        '<span class="goal-block-title-txt">' + icon + ' ' + title + '</span>' +
        '<button type="button" class="goal-work-header-filter' + (blockOpts.workTargetFilter ? ' on' : '') + '" onclick="event.stopPropagation();window.__goalsToggleWorkTargetFilter&&window.__goalsToggleWorkTargetFilter()" title="Только строки с мишенью">🎯</button>' +
        '</div>'
      : '<div class="goal-block-title">' + icon + ' ' + title + '</div>';
    return '<div class="goal-block goal-block-' + (blockType || '') + '"' + dropAttrs + '>' +
      titleHtml +
      '<div class="goal-block-rows">' + (rows.length ? rows.join('') : '<div class="goal-empty">Пусто</div>') + '</div>' +
      (footerHtml || '') +
      '<button type="button" class="goal-block-add" onclick="window.__goalsOpenModalForBtn && window.__goalsOpenModalForBtn(event)">+ Добавить проект</button>' +
      '</div>';
  }
  function getGoalRecencyTs(p) {
    if (!p) return 0;
    if (p.id) {
      var m = String(p.id).match(/(\d{10,})/);
      if (m && m[1]) {
        var n = parseInt(m[1], 10);
        if (isFinite(n) && n > 0) return n;
      }
    }
    var ds = String(p.date || '').trim();
    if (ds) {
      var t = new Date(ds).getTime();
      if (isFinite(t) && t > 0) return t;
    }
    return 0;
  }

  /** Сохранённый порядок id для «В РАБОТЕ» + новые в конце по дате */
  function sortWorkingBySavedOrder(workingArr, savedIds) {
    var working = (workingArr || []).slice();
    if (!savedIds || !savedIds.length) {
      return working.sort(function(a, b) { return getGoalRecencyTs(b) - getGoalRecencyTs(a); });
    }
    var byId = {};
    working.forEach(function(p) { if (p && p.id) byId[p.id] = p; });
    var seen = {};
    var out = [];
    savedIds.forEach(function(id) {
      if (byId[id] && !seen[id]) {
        out.push(byId[id]);
        seen[id] = true;
      }
    });
    var rest = working.filter(function(p) { return p && p.id && !seen[p.id]; });
    rest.sort(function(a, b) { return getGoalRecencyTs(b) - getGoalRecencyTs(a); });
    return out.concat(rest);
  }

  function mergeWorkingOrderIds(savedIds, workingProjects) {
    var ids = (workingProjects || []).map(function(p) { return p && p.id; }).filter(Boolean);
    var seen = {};
    var out = [];
    (savedIds || []).forEach(function(id) {
      if (ids.indexOf(id) >= 0 && !seen[id]) {
        out.push(id);
        seen[id] = true;
      }
    });
    ids.forEach(function(id) {
      if (!seen[id]) {
        out.push(id);
        seen[id] = true;
      }
    });
    return out;
  }
  function render() {
    var data = loadData();
    var projects = (data.projects || []).filter(function(p){ return p && typeof p === 'object'; });
    if (autoTuneProjectEmojis(projects)) saveData(data);
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var week1 = [], week2 = [], week3 = [], week4 = [];
    var sold = [], working = [], archive = [];

    projects.forEach(function(p) {
      if (p.stage === 'sold') {
        sold.push(p);
        return;
      }
      if (p.stage === 'working') {
        working.push(p);
        return;
      }
      if (p.stage === 'archive') {
        archive.push(p);
        return;
      }
      var d = p.date ? (function() {
        var parts = String(p.date).split('-');
        if (parts.length >= 3) return parseInt(parts[2], 10);
        return now.getDate();
      }()) : now.getDate();
      var wi = p.weekIndex || getWeekIndex(d);
      if (wi === 1) week1.push(p);
      else if (wi === 2) week2.push(p);
      else if (wi === 3) week3.push(p);
      else week4.push(p);
    });

    working = sortWorkingBySavedOrder(working, data.workOrderWork || []);
    var workingForList = data.workTargetFilter ? working.filter(function(p) { return p && p.workTarget; }) : working;
    var workExpanded = !!data.workExpanded;
    var WORK_LIMIT = 20;
    var workingVisible = workExpanded ? workingForList.slice() : workingForList.slice(0, WORK_LIMIT);
    var hasMoreWorking = workingForList.length > WORK_LIMIT;

    var totalRevenue = sold.reduce(function(sum, p) {
      var val = p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]);
      var v = parseFloat(String(val || '0').replace(/\s/g, '')) || 0;
      return sum + v;
    }, 0);
    var totalPotentialAll = working.reduce(function(sum, p) {
      var v = parseFloat(String(p.mainPrice || p.priceOptions && p.priceOptions[0]).replace(/\s/g, '')) || 0;
      return sum + v;
    }, 0);
    var totalPotential = workingForList.reduce(function(sum, p) {
      var v = parseFloat(String(p.mainPrice || p.priceOptions && p.priceOptions[0]).replace(/\s/g, '')) || 0;
      return sum + v;
    }, 0);
    function sumWeeklyPrices(arr) {
      return (arr || []).reduce(function(s, p) {
        var v = parseFloat(String(p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0;
        return s + (v > 0 ? v : 0);
      }, 0);
    }
    function sumSold(arr) {
      return (arr || []).reduce(function(s, p) {
        var v = parseFloat(String(p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0;
        return s + v;
      }, 0);
    }
    function hasKpTag(p) {
      var st = (p && p.status) ? p.status : [];
      return st.indexOf('kp') >= 0 || st.indexOf('kp_sent') >= 0;
    }
    function getProjectSum(p) {
      var val = p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]);
      return parseFloat(String(val || '0').replace(/\s/g, '')) || 0;
    }
    var allWithKp = week1.concat(week2, week3, week4).filter(hasKpTag);
    var totalKpSum = allWithKp.reduce(function(s, p) { return s + getProjectSum(p); }, 0);
    var totalKpFull = totalKpSum + totalRevenue;
    var funnelTotal = totalRevenue + totalPotentialAll;
    var kpCount = allWithKp.length;
    var totalCount = projects.length;
    var workingCount = working.length;
    var soldCount = sold.length;
    var newCount = week1.length + week2.length + week3.length + week4.length;
    window.__goalsDebugFunnel = function() {
      var included = allWithKp.map(function(p) {
        var val = getProjectSum(p);
        return {
          id: p.id,
          name: p.name || '',
          stage: p.stage || 'weekly',
          status: p.status || [],
          value: val
        };
      });
      return {
        totalKpSum: totalKpSum,
        kpCount: kpCount,
        included: included
      };
    };

    function fmtNum(n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    var monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    var monthName = monthNames[m] || '';
    var currentWeekNum = getWeekIndex(now.getDate());
    var soldFromCurrentWeek = sold.filter(function(p) {
      var d = p.date ? parseInt(String(p.date).split('-')[2], 10) : 0;
      var wi = (typeof p.weekIndex === 'number' && p.weekIndex >= 1 && p.weekIndex <= 4) ? p.weekIndex : getWeekIndex(d || 1);
      return wi === currentWeekNum;
    });
    var revenueThisWeek = sumSold(soldFromCurrentWeek);
    var weekArr = currentWeekNum === 1 ? week1 : (currentWeekNum === 2 ? week2 : (currentWeekNum === 3 ? week3 : week4));
    var kpWeekFunnel = weekArr.filter(hasKpTag).reduce(function(s, p) { return s + getProjectSum(p); }, 0);
    soldFromCurrentWeek.forEach(function(p) {
      if (hasKpTag(p)) kpWeekFunnel += getProjectSum(p);
    });
    var totalKpFullWeek = kpWeekFunnel;

    var kpCountSh = kpCount;
    var convPct = (kpCountSh > 0 && soldCount > 0) ? Math.round((soldCount / kpCountSh) * 100) : 0;
    var activeClient = (typeof window.__goalsGetActiveClient === 'function' && window.__goalsGetActiveClient()) || null;
    var html = '<div class="goals-page">' +
      '<div class="goals-kpi-tablo">' +
        '<div class="goal-kpi-card goal-kpi-sold goal-kpi-tablo-big"><span class="goal-kpi-num-wrap"><span class="goal-kpi-num">' + fmtNum(totalRevenue) + '</span><span class="goal-kpi-ruble">₽</span></span><span class="goal-kpi-sub-line">' + soldCount + ' шт · ' + monthName + ' · нед.' + currentWeekNum + ': ' + fmtNum(revenueThisWeek) + ' ₽</span><span class="goal-kpi-label">ПРОДАНО СУММА</span></div>' +
        '<div class="goal-kpi-card goal-kpi-funnel goal-kpi-tablo-big"><span class="goal-kpi-num-wrap"><span class="goal-kpi-num">' + fmtNum(totalKpSum) + '</span><span class="goal-kpi-ruble">₽</span></span><span class="goal-kpi-sub-line">' + kpCountSh + ' шт · ' + monthName + '</span><span class="goal-kpi-label">ВОРОНКА (месяц)</span></div>' +
        '<div class="goal-kpi-card goal-kpi-kp goal-kpi-tablo-big" title="Клик — редактировать. ИИ: общая сумма кп 342000"><span class="goal-kpi-num-wrap"><span class="goal-kpi-num">' + fmtNum((data.totalKpFullOverride !== undefined && data.totalKpFullOverride !== null && data.totalKpFullOverride > 0) ? data.totalKpFullOverride : totalKpFull) + '</span><span class="goal-kpi-ruble">₽</span></span><span class="goal-kpi-sub-line">месяц · нед.' + currentWeekNum + ': ' + fmtNum(totalKpFullWeek) + ' ₽</span><span class="goal-kpi-label">ОБЩАЯ СУММА КП</span></div>' +
        '<div class="goal-kpi-card goal-kpi-small-card"><span class="goal-kpi-num">' + kpCountSh + '</span><span class="goal-kpi-label">КП УШЛО</span></div>' +
        '<div class="goal-kpi-card goal-kpi-small-card"><span class="goal-kpi-num">' + newCount + '</span><span class="goal-kpi-label">НОВЫХ</span></div>' +
        '<div class="goal-kpi-card goal-kpi-small-card goal-kpi-conv"><span class="goal-kpi-num">' + convPct + '%</span><span class="goal-kpi-label">Конверсия КП в продажу</span></div>' +
        '<div class="goal-kpi-card goal-kpi-small-card"><span class="goal-kpi-num">' + workingCount + '</span><span class="goal-kpi-label">В РАБОТЕ</span></div>' +
      '</div>' +
      '<div class="goals-smart-input-wrap">' +
        '<label class="goals-smart-input-label">🤖 Умная строка ИИ — введи команду или данные, ИИ распределит</label>' +
        '<div class="goals-smart-input-row"><textarea class="goals-smart-input" id="goalsSmartInput" rows="1" placeholder="Проект 1, Проект 2 35000 | добавь метрику: конверсия 12% | Иван 45000 в неделю 2" title="Enter — выполнить"></textarea>' +
        '<button type="button" class="goals-smart-input-btn" id="goalsSmartInputBtn">Добавить</button></div>' +
      '</div>' +
      '<div class="goals-metrics-row">' +
        '<div class="goals-metrics-board" id="goalsMetricsBoard"></div>' +
        '<button type="button" class="goal-metrics-add-btn" id="goalsMetricsAddBtn" onclick="window.__goalsShowMetricsMenu&&window.__goalsShowMetricsMenu(event)" title="Добавить метрику">+</button>' +
      '</div>' +
      '<div class="goals-header">' +
        '<span class="goals-header-path">' +
          '<button type="button" class="goal-work-eq-btn" onclick="window.__goalsScrollToWork && window.__goalsScrollToWork()" title="Перейти к блоку В РАБОТЕ">🎯 В РАБОТЕ</button>' +
          '<button type="button" class="goal-add-btn" onclick="window.__goalsOpenModalForBtn && window.__goalsOpenModalForBtn(event)">+ ПРОЕКТ</button>' +
          '<span class="goals-path-sep">/</span>' +
          '<span class="goal-counter goal-counter-total" title="Всего проектов">ВСЕГО ПРОЕКТОВ <b>' + totalCount + '</b></span>' +
          '<span class="goals-path-sep">/</span>' +
          '<span class="goal-counter goal-counter-kp" title="Всего КП в строчках">ВСЕГО КП <b>' + kpCount + '</b></span>' +
          '<span class="goals-path-sep">/</span>' +
          '<span class="goal-counter goal-counter-sold">&#9650; ПРОДАНО <b>' + soldCount + '</b> <span class="goal-counter-sum">(' + fmtNum(totalRevenue) + ' ₽)</span></span>' +
        '</span>' +
        '<span class="goals-header-pinned" id="goalsHeaderPinned" ondragover="window.__goalsMetricDragOver&&window.__goalsMetricDragOver(event)" ondragleave="window.__goalsMetricDragLeave&&window.__goalsMetricDragLeave(event)" ondrop="window.__goalsMetricDrop&&window.__goalsMetricDrop(event)">' +
          (data.pinnedMetrics || []).map(function(pm) {
            return '<span class="goal-pinned-metric" data-id="' + esc(pm.id || '') + '">' + esc(pm.label || '') + ' <b>' + esc(pm.value || '') + (pm.unit ? ' ' + esc(pm.unit) : '') + '</b><span class="goal-pinned-rm" onclick="window.__goalsUnpinMetric&&window.__goalsUnpinMetric(\'' + esc(pm.id || '') + '\')" title="Убрать">×</span></span>';
          }).join('') +
          (data.pinnedMetrics && data.pinnedMetrics.length ? '' : '<span class="goal-pinned-placeholder" title="Перетащите сюда метрику">← перетащите метрику</span>') +
        '</span>' +
      '</div>' +
      '<div class="goals-sold-wrap">' +
          renderSection('ПРОДАНО <span class="goal-sold-total">' + fmtNum(totalRevenue) + ' ₽</span> ' + monthName, '☑', sold, '', true, true, 'sold') +
      '</div>' +
      '<div class="goals-weeks-wrap">' +
        '<div class="goals-weeks">' +
          (hasWeekStarted(4, now.getDate()) ? renderWeekSection(4, week4, sold, activeClient, currentWeekNum, y, m) : '') +
          (hasWeekStarted(3, now.getDate()) ? renderWeekSection(3, week3, sold, activeClient, currentWeekNum, y, m) : '') +
          (hasWeekStarted(2, now.getDate()) ? renderWeekSection(2, week2, sold, activeClient, currentWeekNum, y, m) : '') +
          (hasWeekStarted(1, now.getDate()) ? renderWeekSection(1, week1, sold, activeClient, currentWeekNum, y, m) : '') +
        '</div>' +
      '</div>' +
      '<div class="goals-work-wrap">' +
          '<div id="goalsWorkBlockAnchor"></div>' +
          renderSection(
            'В РАБОТЕ',
            '🔥',
            workingVisible,
            '<div class="goal-total">' + (data.workTargetFilter ? 'ПОТЕНЦИАЛ (видимые): ' : 'ОБЩИЙ ПОТЕНЦИАЛ: ') + esc(String(fmtNum(totalPotential))) + ' ₽</div>' +
            (hasMoreWorking ? '<button type="button" class="goal-work-more-btn" onclick="window.__goalsToggleWorkRows&&window.__goalsToggleWorkRows()">' + (workExpanded ? 'Свернуть до 20' : ('Показать еще (' + Math.max(0, workingForList.length - WORK_LIMIT) + ')')) + '</button>' : ''),
            true,
            true,
            'work',
            { workTargetFilter: !!data.workTargetFilter }
          ) +
      '</div>' +
      '<div class="goals-archive-wrap">' +
        renderSection('АРХИВ', '📁', archive, '', true, false, 'archive') +
      '</div></div>';

    var main = document.getElementById('mainContent');
    if (main) {
      main.innerHTML = html;
      var smartInp = main.querySelector('#goalsSmartInput');
      var smartBtn = main.querySelector('#goalsSmartInputBtn');
      var metricsBoard = main.querySelector('#goalsMetricsBoard');
      if (metricsBoard && Array.isArray(data.customMetrics) && data.customMetrics.length) {
        var shown = data.customMetrics.slice(0, 5);
        metricsBoard.innerHTML = shown.map(function(m) {
          return '<div class="goals-metric-card" draggable="true" data-id="' + esc(m.id) + '" data-label="' + esc(m.label || '') + '" data-value="' + esc(m.value || '') + '" data-unit="' + esc(m.unit || '') + '" ondragstart="window.__goalsMetricDragStart&&window.__goalsMetricDragStart(event)" ondragover="window.__goalsMetricBoardDragOver&&window.__goalsMetricBoardDragOver(event)" ondragleave="this.classList.remove(\'goals-metric-drop-target\')" ondrop="window.__goalsMetricBoardDrop&&window.__goalsMetricBoardDrop(event)" ondragend="this.classList.remove(\'goals-metric-dragging\');document.querySelectorAll(\'.goals-metric-card\').forEach(function(c){c.classList.remove(\'goals-metric-drop-target\')})">' +
            '<span class="goal-metric-rm" onclick="event.stopPropagation();window.__goalsRemoveMetric&&window.__goalsRemoveMetric(\'' + esc(m.id) + '\')" title="Удалить">×</span>' +
            '<div class="metric-label">' + esc(m.label) + '</div>' +
            '<div class="metric-value">' + esc(m.value) + (m.unit ? ' ' + esc(m.unit) : '') + '</div>' +
            '</div>';
        }).join('');
      }
      if (smartInp) {
        smartInp.onkeydown = function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            processSmartInputWithAI(smartInp);
          }
        };
      }
      if (smartBtn && smartInp) {
        smartBtn.onclick = function() { processSmartInputWithAI(smartInp); };
      }
      var addBtn = main.querySelector('#goalsMetricsAddBtn');
      if (addBtn) {
        window.__goalsAddMetric = function(lbl, val) {
          var d = loadData();
          d.customMetrics = d.customMetrics || [];
          if (d.customMetrics.length >= 5) return;
          d.customMetrics.push({ id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), label: lbl || '', value: val || '', unit: '' });
          saveData(d);
          render();
        };
        window.__goalsShowMetricsMenu = function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var btn = ev.currentTarget || ev.target;
          var pop = document.getElementById('goalsMetricsMenuPop');
          if (pop) { pop.remove(); return; }
          var d = loadData();
          if ((d.customMetrics || []).length >= 5) {
            var msg = 'Максимум 5 метрик. Меняйте значения через ИИ строку.';
            if (typeof window.__showToast === 'function') window.__showToast(msg); else alert(msg);
            return;
          }
          pop = document.createElement('div');
          pop.id = 'goalsMetricsMenuPop';
          pop.className = 'goals-metrics-menu-pop';
          pop.innerHTML = '<div class="goals-metrics-menu-inner">' +
            '<input type="text" class="goals-metrics-menu-inp" placeholder="название: значение" title="Enter — добавить">' +
            '<button type="button" class="goals-metrics-menu-item" data-p="conv">Конверсия</button>' +
            '<button type="button" class="goals-metrics-menu-item" data-p="kp">КП ушло</button>' +
            '<button type="button" class="goals-metrics-menu-item" data-p="avg">Средний чек</button>' +
            '</div>';
          document.body.appendChild(pop);
          var rect = btn.getBoundingClientRect();
          pop.style.left = Math.max(8, rect.left) + 'px';
          pop.style.top = (rect.bottom + 4) + 'px';
          var inp = pop.querySelector('.goals-metrics-menu-inp');
          pop.querySelectorAll('.goals-metrics-menu-item').forEach(function(b) {
            b.onclick = function() {
              var d = loadData();
              var proj = (d.projects || []).filter(function(p) { return p && typeof p === 'object'; });
              var sold = proj.filter(function(p) { return p.stage === 'sold'; });
              var rev = sold.reduce(function(s, p) { var v = parseFloat(String(p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '0').replace(/\s/g, '')) || 0; return s + v; }, 0);
              var allKp = proj.filter(function(p) { return (p.stage || '') !== 'sold' && (p.stage || '') !== 'archive' && (p.status || []).some(function(st) { return st === 'kp' || st === 'kp_sent'; }); });
              var kc = allKp.length;
              var cv = (kc > 0 && sold.length > 0) ? Math.round((sold.length / kc) * 100) : 0;
              if (b.getAttribute('data-p') === 'conv') { window.__goalsAddMetric('Конверсия КП в продажу', cv + '%'); }
              else if (b.getAttribute('data-p') === 'kp') { window.__goalsAddMetric('КП ушло', String(kc)); }
              else if (b.getAttribute('data-p') === 'avg') { window.__goalsAddMetric('Средний чек', sold.length > 0 ? String(Math.round(rev / sold.length)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽' : '—'); }
              pop.remove();
            };
          });
          if (inp) {
            inp.focus();
            inp.onkeydown = function(e) {
              if (e.key === 'Enter') { e.preventDefault(); var raw = inp.value.trim(); if (raw) { processMiniPrompt({ value: raw }); pop.remove(); } }
              if (e.key === 'Escape') pop.remove();
            };
          }
          document.addEventListener('click', function h(ev) {
            if (pop.contains(ev.target)) return;
            document.removeEventListener('click', h);
            if (pop.parentNode) pop.remove();
          });
        };
      }
      main.querySelectorAll('.goal-sum-inline').forEach(function(inp) {
        inp.onblur = function() { saveSumFromInput(inp); };
        inp.onkeydown = function(e) { if (e.key === 'Enter') inp.blur(); };
        var wrap = inp.closest('.goal-sum-edit');
        if (wrap) wrap.addEventListener('click', function() { inp.focus(); });
      });
    }

    window.__goalsDelete = deleteFromWeek;
    window.__goalsSendToWorking = sendToWorkingFromSold;
    window.__goalsDeletePermanent = deletePermanent;
    window.__goalsSelectRow = selectGoalRow;
    window.__goalsShowPricePopup = showPricePopup;
    window.__goalsOpenModal = openModal;
    window.__goalsOpenModalForWeek = function(ev, wn) {
      var btn = ev && (ev.currentTarget || ev.target);
      openModal(btn, wn, 'weekly');
    };
    window.__goalsOpenModalForBtn = function(ev) {
      var btn = ev && (ev.currentTarget || ev.target);
      var stage = 'working';
      var block = btn && btn.closest ? btn.closest('.goal-block') : null;
      if (block) {
        if (block.classList.contains('goal-block-sold')) stage = 'sold';
        else if (block.classList.contains('goal-block-archive')) stage = 'archive';
        else if (block.classList.contains('goal-block-work')) stage = 'working';
      }
      openModal(btn, null, stage);
    };
    window.__goalsSetStage = setStage;
    window.__goalsRemoveTag = removeTag;
    window.__goalsRemoveStatus = removeStatus;
    window.__goalsRemoveTouch = removeTouch;
    window.__goalsShowStatusPicker = showStatusPickerPopup;
    window.__goalsShowEmojiPicker = showGoalEmojiPicker;
    window.__goalsEditNameCell = editGoalNameCell;
    window.__goalsParseSmartInput = parseSmartInput;
    window.__goalsProcessSmartInputWithAI = processSmartInputWithAI;
    window.__goalsProcessMiniPrompt = processMiniPrompt;
    window.__goalsToggleWorkRows = function() {
      var d = loadData();
      d.workExpanded = !d.workExpanded;
      saveData(d);
      render();
    };
    window.__goalsToggleWorkTarget = function(projectId) {
      var d = loadData();
      var p = (d.projects || []).find(function(x) { return x.id === projectId; });
      if (!p) return;
      p.workTarget = !p.workTarget;
      saveData(d);
      render();
    };
    window.__goalsToggleWorkTargetFilter = function() {
      var d = loadData();
      d.workTargetFilter = !d.workTargetFilter;
      saveData(d);
      render();
    };
    window.__goalsWorkDragStart = function(e) {
      var el = e.target;
      if (el && el.closest && el.closest('button, a, input, textarea, .goal-sum, .goal-designations')) {
        e.preventDefault();
        return false;
      }
      var row = e.currentTarget;
      if (!row || !row.getAttribute('data-id')) return;
      e.dataTransfer.setData('text/plain', row.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('goal-row-work-dragging');
    };
    window.__goalsWorkDragOver = function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var row = e.currentTarget;
      if (row && row.classList && row.classList.contains('goal-row-alt')) row.classList.add('goal-row-work-drag-over');
    };
    window.__goalsWorkDragLeave = function(e) {
      var row = e.currentTarget;
      if (row) row.classList.remove('goal-row-work-drag-over');
    };
    window.__goalsWorkDrop = function(e) {
      e.preventDefault();
      e.stopPropagation();
      var row = e.currentTarget;
      if (row) row.classList.remove('goal-row-work-drag-over');
      var dragId = e.dataTransfer.getData('text/plain');
      var dropId = row.getAttribute('data-id');
      if (!dragId || !dropId || dragId === dropId) return;
      var d = loadData();
      var working = (d.projects || []).filter(function(p) { return p && p.stage === 'working'; });
      var order = mergeWorkingOrderIds(d.workOrderWork || [], working);
      var from = order.indexOf(dragId);
      var to = order.indexOf(dropId);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, dragId);
      d.workOrderWork = order;
      saveData(d);
      render();
    };
    window.__goalsWorkDragEnd = function(e) {
      var row = e.currentTarget;
      if (row) row.classList.remove('goal-row-work-dragging');
      document.querySelectorAll('.goal-row-alt.goal-row-work-drag-over').forEach(function(r) { r.classList.remove('goal-row-work-drag-over'); });
    };
    window.__goalsScrollToWork = function() {
      var el = document.getElementById('goalsWorkBlockAnchor');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.__goalsRemoveMetric = function(metricId) {
      var d = loadData();
      d.customMetrics = (d.customMetrics || []).filter(function(m) { return m.id !== metricId; });
      saveData(d);
      render();
    };
    window.__goalsMetricBoardDragOver = function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      var t = e.target.closest('.goals-metric-card');
      if (t) t.classList.add('goals-metric-drop-target');
    };
    window.__goalsMetricBoardDrop = function(e) {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.goals-metric-card').forEach(function(c) { c.classList.remove('goals-metric-drop-target'); });
      var targetCard = e.target.closest('.goals-metric-card');
      var json = e.dataTransfer.getData('application/json');
      if (!targetCard || !json) return;
      try {
        var m = JSON.parse(json);
        if (!m || !m.id) return;
        var d = loadData();
        var list = d.customMetrics || [];
        var srcIdx = list.findIndex(function(x) { return x.id === m.id; });
        var tgtIdx = list.findIndex(function(x) { return x.id === targetCard.getAttribute('data-id'); });
        if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return;
        var item = list.splice(srcIdx, 1)[0];
        list.splice(tgtIdx, 0, item);
        d.customMetrics = list;
        saveData(d);
        render();
      } catch (err) {}
      document.querySelectorAll('.goals-metric-card').forEach(function(c) { c.classList.remove('goals-metric-dragging'); });
    };
    window.__goalsMetricDragStart = function(e) {
      var card = e.target.closest('.goals-metric-card, .goal-kpi-card[data-id]');
      if (!card) return;
      var id = card.getAttribute('data-id');
      var label = card.getAttribute('data-label') || '';
      var value = card.getAttribute('data-value') || '';
      var unit = card.getAttribute('data-unit') || '';
      e.dataTransfer.setData('application/json', JSON.stringify({ id: id, label: label, value: value, unit: unit }));
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('goals-metric-dragging');
    };
    window.__goalsMetricDragOver = function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      var z = document.getElementById('goalsHeaderPinned');
      if (z) z.classList.add('goals-pinned-drag-over');
    };
    window.__goalsMetricDragLeave = function(e) {
      var z = document.getElementById('goalsHeaderPinned');
      if (z && !z.contains(e.relatedTarget)) z.classList.remove('goals-pinned-drag-over');
    };
    window.__goalsMetricDrop = function(e) {
      e.preventDefault();
      var z = document.getElementById('goalsHeaderPinned');
      if (z) z.classList.remove('goals-pinned-drag-over');
      var json = e.dataTransfer.getData('application/json');
      if (!json) return;
      try {
        var m = JSON.parse(json);
        if (!m || !m.id) return;
        var d = loadData();
        d.pinnedMetrics = d.pinnedMetrics || [];
        var exists = d.pinnedMetrics.some(function(p) { return p.id === m.id; });
        if (!exists) {
          d.pinnedMetrics.push({ id: m.id, label: m.label || '', value: m.value || '', unit: m.unit || '' });
          saveData(d);
          render();
        }
      } catch (err) {}
      document.querySelectorAll('.goals-metric-card, .goal-kpi-card[data-id]').forEach(function(c) { c.classList.remove('goals-metric-dragging'); });
    };
    window.__goalsUnpinMetric = function(metricId) {
      var d = loadData();
      d.pinnedMetrics = (d.pinnedMetrics || []).filter(function(m) { return m.id !== metricId; });
      saveData(d);
      render();
    };
    window.__goalsMetricDragOverMain = function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      var z = document.getElementById('goalsKpiMainDrop');
      if (z) z.classList.add('goals-pinned-drag-over');
    };
    window.__goalsMetricDragLeaveMain = function(e) {
      var z = document.getElementById('goalsKpiMainDrop');
      if (z && !z.contains(e.relatedTarget)) z.classList.remove('goals-pinned-drag-over');
    };
    window.__goalsMetricDropMain = function(e) {
      e.preventDefault();
      var z = document.getElementById('goalsKpiMainDrop');
      if (z) z.classList.remove('goals-pinned-drag-over');
      var json = e.dataTransfer.getData('application/json');
      if (!json) return;
      try {
        var m = JSON.parse(json);
        if (!m || !m.id) return;
        var d = loadData();
        d.pinnedMetricsMain = d.pinnedMetricsMain || [];
        var exists = d.pinnedMetricsMain.some(function(p) { return p.id === m.id; });
        if (!exists) {
          d.pinnedMetricsMain.push({ id: m.id, label: m.label || '', value: m.value || '', unit: m.unit || '' });
          saveData(d);
          render();
        }
      } catch (err) {}
      document.querySelectorAll('.goals-metric-card, .goal-kpi-card[data-id]').forEach(function(c) { c.classList.remove('goals-metric-dragging'); });
    };
    window.__goalsUnpinMetricMain = function(metricId) {
      var d = loadData();
      d.pinnedMetricsMain = (d.pinnedMetricsMain || []).filter(function(m) { return m.id !== metricId; });
      saveData(d);
      render();
    };
  }

  function removeTag(projectId, tagIndex) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (!p.tags) p.tags = [];
    p.tags.splice(tagIndex, 1);
    saveData(data);
    render();
  }

  function removeStatus(projectId, statusId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (!p.status) p.status = [];
    var sid = normalizeStatusId(statusId);
    p.status = p.status.filter(function(id) { return normalizeStatusId(id) !== sid; });
    var statusDates = getStatusDateMap(p);
    delete statusDates[sid];
    saveData(data);
    render();
  }

  function removeTouch(projectId, touchId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (!p.touchMarkers) p.touchMarkers = [];
    p.touchMarkers = p.touchMarkers.filter(function(id) { return id !== touchId; });
    var touchDates = getTouchDateMap(p);
    delete touchDates[touchId];
    saveData(data);
    render();
  }

  function addStatus(projectId, statusId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (!p.status) p.status = [];
    var sid = normalizeStatusId(statusId);
    var has = (p.status || []).some(function(id) { return normalizeStatusId(id) === sid; });
    if (!has) p.status.push(sid);
    var statusDates = getStatusDateMap(p);
    statusDates[sid] = getTodayISO();
    saveData(data);
    render();
  }

  function addTouch(projectId, touchId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (!p.touchMarkers) p.touchMarkers = [];
    if (p.touchMarkers.indexOf(touchId) < 0) p.touchMarkers.push(touchId);
    var touchDates = getTouchDateMap(p);
    touchDates[touchId] = getTodayISO();
    saveData(data);
    render();
  }

  function showStatusPickerPopup(projectId, anchorEl) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var existing = document.getElementById('goalStatusPicker');
    if (existing) existing.remove();
    var statusHtml = STATUS_OPTIONS.map(function(s) {
      var has = (p.status || []).some(function(id) { return normalizeStatusId(id) === s.id; });
      return has ? '' : '<button type="button" class="goal-picker-opt" data-type="status" data-id="' + esc(s.id) + '" style="background:' + s.color + '22;border-color:' + s.color + ';color:' + s.color + '">' + esc(s.label) + '</button>';
    }).filter(Boolean).join('');
    var touchHtml = TOUCH_OPTIONS.map(function(t) {
      var has = (p.touchMarkers || []).indexOf(t.id) >= 0;
      return has ? '' : '<button type="button" class="goal-picker-opt" data-type="touch" data-id="' + esc(t.id) + '">' + esc(t.label) + '</button>';
    }).filter(Boolean).join('');
    var body = '<div class="goal-picker-cols">' +
      (statusHtml ? '<div class="goal-picker-group"><div class="goal-picker-label">Статусы</div>' + statusHtml + '</div>' : '') +
      (touchHtml ? '<div class="goal-picker-group"><div class="goal-picker-label">Касания</div>' + touchHtml + '</div>' : '') +
      '</div>';
    if (!body) body = '';
    body += '<div class="goal-picker-group"><div class="goal-picker-label">Свой тег</div><div class="goal-picker-tag-row"><input type="text" class="goal-picker-tag-inp" placeholder="Название тега" maxlength="24"><button type="button" class="goal-picker-tag-add">+</button></div></div>';
    var popup = document.createElement('div');
    popup.id = 'goalStatusPicker';
    popup.className = 'goal-status-picker';
    popup.innerHTML = '<div class="goal-picker-inner">' + (body || '<div class="goal-picker-empty">Добавьте тег</div>') + '</div>';
    document.body.appendChild(popup);
    popup.querySelectorAll('.goal-picker-opt').forEach(function(btn) {
      btn.onclick = function() {
        var t = btn.getAttribute('data-type');
        var id = btn.getAttribute('data-id');
        if (t === 'status') addStatus(projectId, id);
        else if (t === 'touch') addTouch(projectId, id);
        popup.remove();
      };
    });
    var tagInp = popup.querySelector('.goal-picker-tag-inp');
    var tagAddBtn = popup.querySelector('.goal-picker-tag-add');
    function addCustomTag() {
      var val = (tagInp && tagInp.value || '').trim();
      if (!val) return;
      var data = loadData();
      var proj = (data.projects || []).find(function(x) { return x.id === projectId; });
      if (!proj) return;
      if (!proj.tags) proj.tags = [];
      if (proj.tags.indexOf(val) >= 0) return;
      proj.tags.push(val);
      saveData(data);
      tagInp.value = '';
      render();
      popup.remove();
    }
    if (tagAddBtn) tagAddBtn.onclick = addCustomTag;
    if (tagInp) tagInp.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } };
    popup.onclick = function(e) { if (e.target === popup) popup.remove(); };
    var anchor = anchorEl || document.querySelector('.goal-add-status-btn');
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      var w = popup.offsetWidth || 360;
      var h = popup.offsetHeight || 260;
      var left = r.right + 8;
      if (left + w > window.innerWidth - 8) left = r.left - w - 8;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      var top = r.top;
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      popup.style.left = Math.round(left) + 'px';
      popup.style.top = Math.round(top) + 'px';
    }
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (popup && !popup.contains(e.target) && e.target !== anchor) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 10);
  }

  function setStage(projectId, stage) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (stage === 'sold') {
      showSaleAmountPicker(projectId, p, function(saleAmount) {
        var copy = {};
        for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copy[k] = p[k];
        copy.id = generateId();
        copy.stage = 'sold';
        copy.saleAmount = saleAmount || '';
        copy.soldFromId = projectId;
        data.projects.push(copy);
        saveData(data);
        render();
      });
      return;
    }
    p.stage = stage;
    saveData(data);
    render();
  }

  function showSaleAmountPicker(projectId, p, onConfirm) {
    var existing = document.getElementById('goalSaleAmountModal');
    if (existing) existing.remove();
    var opts = (p.priceOptions || []).filter(Boolean);
    var modal = document.createElement('div');
    modal.id = 'goalSaleAmountModal';
    modal.className = 'goal-modal-overlay';
    var optsHtml = opts.length ? '<div class="fg"><label>Выберите из ранее указанных цен</label><div class="goal-sale-opts">' +
      opts.map(function(pr, i) { return '<button type="button" class="goal-sale-opt-btn" data-val="' + esc(String(pr)) + '">' + formatSumForDisplay(pr) + ' ₽</button>'; }).join('') +
      '</div></div>' : '';
    modal.innerHTML = '<div class="goal-modal">' +
      '<div class="goal-modal-head">Сумма продажи — ' + esc(p.name || '') + '</div>' +
      '<div class="goal-modal-body">' +
        optsHtml +
        '<div class="fg"><label>Или введите свою сумму</label><input type="number" id="goalSaleCustomInp" placeholder="Например 42000"></div>' +
      '</div>' +
      '<div class="goal-modal-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalSaleAmountModal\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalSaleConfirm">Сохранить</button>' +
      '</div></div></div>';
    document.body.appendChild(modal);
    modal.onclick = function(e) { if (e.target === modal) { modal.remove(); } };
    function done(val) {
      var finalVal = '';
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        finalVal = String(val).trim();
      } else {
        var custom = (document.getElementById('goalSaleCustomInp') || {}).value || '';
        finalVal = custom.trim() ? String(custom).trim() : (opts.length ? String(opts[0]) : '');
      }
      onConfirm(finalVal);
      modal.remove();
    }
    modal.querySelectorAll('.goal-sale-opt-btn').forEach(function(btn) {
      btn.onclick = function() { done(btn.getAttribute('data-val')); };
    });
    document.getElementById('goalSaleConfirm').onclick = function() {
      var custom = (document.getElementById('goalSaleCustomInp') || {}).value || '';
      done(custom.trim() || (opts.length ? opts[0] : ''));
    };
  }

  function deletePermanent(projectId) {
    var data = loadData();
    data.projects = (data.projects || []).filter(function(x) { return x.id !== projectId; });
    saveData(data);
    render();
  }

  function showGoalEmojiPicker(btn, projectId) {
    var existing = document.getElementById('goalEmojiPicker');
    if (existing) existing.remove();
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var picker = document.createElement('div');
    picker.id = 'goalEmojiPicker';
    picker.className = 'goal-emoji-picker-popup';
    picker.innerHTML = PROJECT_EMOJIS.map(function(e) {
      return '<span class="goal-emoji-pick-btn" data-emoji="' + esc(e) + '">' + e + '</span>';
    }).join('');
    document.body.appendChild(picker);
    var r = btn.getBoundingClientRect();
    picker.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + 'px';
    picker.style.top = (r.bottom + 4) + 'px';
    picker.querySelectorAll('.goal-emoji-pick-btn').forEach(function(span) {
      span.onclick = function() {
        var emoji = span.getAttribute('data-emoji');
        p.emoji = emoji;
        saveData(data);
        picker.remove();
        render();
      };
    });
    function close(e) {
      if (picker && !picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    }
    setTimeout(function() { document.addEventListener('click', close); }, 10);
  }

  function editGoalNameCell(cellEl) {
    if (!cellEl || cellEl.classList.contains('goal-name-editing')) return;
    var disp = cellEl.querySelector('.goal-name-display');
    if (!disp) return;
    cellEl.classList.add('goal-name-editing');
    var projId = disp.getAttribute('data-id');
    var curName = (disp.textContent || '').trim();
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'goal-name-inline goal-name-edit';
    inp.setAttribute('data-id', projId);
    inp.value = curName;
    inp.style.pointerEvents = '';
    disp.parentNode.replaceChild(inp, disp);
    inp.focus();
    inp.select();
    function done() {
      cellEl.classList.remove('goal-name-editing');
      var val = String(inp.value || '').replace(/\s+/g, ' ').trim();
      var data = loadData();
      var p = (data.projects || []).find(function(x) { return x.id === projId; });
      if (p) { p.name = val || p.name || ''; saveData(data); }
      var span = document.createElement('span');
      span.className = 'goal-name-inline goal-name-display';
      span.setAttribute('data-id', projId);
      span.textContent = val || '';
      inp.parentNode.replaceChild(span, inp);
      render();
    }
    inp.onblur = done;
    inp.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
  }

  function selectGoalRow(projectId) {
    var row = document.querySelector('.goal-row[data-id="' + projectId + '"], .goal-row-alt[data-id="' + projectId + '"]');
    if (!row) return;
    var nameCell = row.querySelector('.goal-name-cell');
    if (nameCell) editGoalNameCell(nameCell);
  }

  function openEditModal(p) {
    var existing = document.getElementById('goalEditModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'goalEditModal';
    modal.className = 'goal-modal-overlay';
    var statusChecks = STATUS_OPTIONS.map(function(s) {
      var checked = (p.status || []).some(function(id) { return normalizeStatusId(id) === s.id; }) ? ' checked' : '';
      return '<label class="goal-check"><input type="checkbox" data-status="' + s.id + '"' + checked + '><span>' + esc(s.label) + '</span></label>';
    }).join('');
    var touchChecks = TOUCH_OPTIONS.map(function(t) {
      var checked = (p.touchMarkers || []).indexOf(t.id) >= 0 ? ' checked' : '';
      return '<label class="goal-check"><input type="checkbox" data-touch="' + t.id + '"' + checked + '><span>' + esc(t.label) + '</span></label>';
    }).join('');
    var emojiBtns = PROJECT_EMOJIS.map(function(e) {
      var sel = (p.emoji || '📦') === e ? ' goal-emoji-sel' : '';
      return '<span class="goal-emoji-btn' + sel + '" data-emoji="' + esc(e) + '">' + e + '</span>';
    }).join('');
    modal.innerHTML = '<div class="goal-modal">' +
      '<div class="goal-modal-head">Редактировать проект</div>' +
      '<div class="goal-modal-body">' +
        '<div class="fg"><label>Эмодзи</label><div class="goal-emoji-picker">' + emojiBtns + '</div></div>' +
        '<div class="fg"><label>Название</label><input type="text" id="goalEditName" value="' + esc(p.name || '') + '"></div>' +
        '<div class="fg"><label>Компания / контакт</label><input type="text" id="goalEditCompany" placeholder="Компания" value="' + esc(p.company || '') + '"></div>' +
        '<div class="fg"><label>Телефон</label><input type="text" id="goalEditPhone" placeholder="+7..." value="' + esc(p.phone || '') + '"></div>' +
        '<div class="fg"><label>Ссылка на папку Google</label><input type="text" id="goalEditFolder" placeholder="https://drive.google.com/..." value="' + esc(p.folderLink || '') + '"></div>' +
        '<div class="fg"><label>Дата</label><input type="text" id="goalEditDate" value="' + esc(p.date || '') + '"></div>' +
        '<div class="fg"><label>4 цены КП</label><div class="goal-price-bars"><input type="number" id="goalEditPrice1" class="goal-price-bar" value="' + esc(String((p.priceOptions||[])[0]||'')) + '"><input type="number" id="goalEditPrice2" class="goal-price-bar" value="' + esc(String((p.priceOptions||[])[1]||'')) + '"><input type="number" id="goalEditPrice3" class="goal-price-bar" value="' + esc(String((p.priceOptions||[])[2]||'')) + '"><input type="number" id="goalEditPrice4" class="goal-price-bar" value="' + esc(String((p.priceOptions||[])[3]||'')) + '"></div></div>' +
        '<div class="fg"><label>Сумма продажи итоговая</label><input type="number" id="goalEditSale" placeholder="Для проданных" value="' + esc(String(p.saleAmount || '')) + '"></div>' +
        '<div class="fg"><label>Статусы</label><div class="goal-checks">' + statusChecks + '</div></div>' +
        '<div class="fg"><label>Касания</label><div class="goal-checks">' + touchChecks + '</div></div>' +
        '<div class="fg"><label>Свои теги</label><div class="goal-tags-wrap"><div class="goal-tags-list" id="goalEditTagsList"></div><div class="goal-tag-add-row"><input type="text" id="goalEditTagInp" placeholder="+ Добавить тег" class="goal-tag-inp"><button type="button" class="goal-tag-add-btn" id="goalEditTagAdd">+</button></div></div></div>' +
      '</div>' +
      '<div class="goal-modal-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalEditModal\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalEditSave">Сохранить</button>' +
      '</div></div></div>';
    document.body.appendChild(modal);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.querySelectorAll('.goal-emoji-btn').forEach(function(btn) {
      btn.onclick = function() {
        modal.querySelectorAll('.goal-emoji-btn').forEach(function(b) { b.classList.remove('goal-emoji-sel'); });
        btn.classList.add('goal-emoji-sel');
      };
    });
    var editTags = (p.tags || []).slice();
    function refreshEditTagsList() {
      var list = document.getElementById('goalEditTagsList');
      if (!list) return;
      list.innerHTML = editTags.map(function(t, i) {
        return '<span class="goal-tag-pill"><span>' + esc(t) + '</span><button type="button" class="goal-tag-rm" data-i="' + i + '">×</button></span>';
      }).join('');
      list.querySelectorAll('.goal-tag-rm').forEach(function(btn) {
        btn.onclick = function() { editTags.splice(parseInt(btn.getAttribute('data-i'), 10), 1); refreshEditTagsList(); };
      });
    }
    refreshEditTagsList();
    document.getElementById('goalEditTagAdd').onclick = function() {
      var inp = document.getElementById('goalEditTagInp');
      var v = (inp && inp.value || '').trim();
      if (v && editTags.indexOf(v) < 0) { editTags.push(v); inp.value = ''; refreshEditTagsList(); }
    };
    document.getElementById('goalEditSave').onclick = function() {
      var name = String((document.getElementById('goalEditName') || {}).value || '').replace(/\s+/g, ' ').trim();
      if (!name) { alert('Введите название'); return; }
      var selEmoji = modal.querySelector('.goal-emoji-btn.goal-emoji-sel');
      var emoji = selEmoji ? selEmoji.getAttribute('data-emoji') : (p.emoji || '📦');
      p.name = name;
      p.emoji = emoji;
      p.company = ((document.getElementById('goalEditCompany') || {}).value || '').trim();
      p.phone = ((document.getElementById('goalEditPhone') || {}).value || '').trim();
      p.folderLink = ((document.getElementById('goalEditFolder') || {}).value || '').trim();
      p.date = ((document.getElementById('goalEditDate') || {}).value || '').trim() || p.date;
      var editPrices = [1,2,3,4].map(function(i) { return ((document.getElementById('goalEditPrice' + i) || {}).value || '').trim(); }).filter(Boolean);
      var editNums = editPrices.map(function(x) { return parseFloat(String(x).replace(/\s/g,'')); }).filter(function(n) { return !isNaN(n); });
      p.priceOptions = editPrices.slice(0, 4);
      p.mainPrice = editNums.length ? String(Math.min.apply(null, editNums)) : '';
      var saleVal = ((document.getElementById('goalEditSale') || {}).value || '').trim();
      if (p.stage === 'sold') p.saleAmount = saleVal || '';
      var status = [];
      modal.querySelectorAll('input[data-status]:checked').forEach(function(cb) { status.push(cb.getAttribute('data-status')); });
      p.status = status;
      var touchMarkers = [];
      modal.querySelectorAll('input[data-touch]:checked').forEach(function(cb) { touchMarkers.push(cb.getAttribute('data-touch')); });
      p.touchMarkers = touchMarkers;
      ensureStatusDates(p, p.status);
      ensureTouchDates(p, p.touchMarkers);
      p.tags = editTags;
      var data = loadData();
      saveData(data);
      modal.remove();
      render();
    };
  }

  function deleteFromWeek(projectId, weekNum) {
    var data = loadData();
    var projects = data.projects || [];
    var p = projects.find(function(x) { return x.id === projectId; });
    if (!p) return;
    var day = p.date ? parseInt(String(p.date).split('-')[2], 10) : new Date().getDate();
    var wi = (typeof p.weekIndex === 'number' && p.weekIndex >= 1 && p.weekIndex <= 4) ? p.weekIndex : getWeekIndex(day);
    if (wi !== weekNum) return;
    data.projects = projects.filter(function(x) { return x.id !== projectId; });
    saveData(data);
    render();
  }

  function sendToWorkingFromSold(projectId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId && x.stage === 'sold'; });
    if (!p) return;
    var copy = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copy[k] = p[k];
    copy.id = generateId();
    copy.stage = 'working';
    copy.saleAmount = '';
    copy.soldFromId = undefined;
    copy.status = copy.status ? copy.status.slice() : [];
    if (copy.status.indexOf('kp') < 0) copy.status.unshift('kp');
    copy.statusDates = Object.assign({}, copy.statusDates || {});
    if (!copy.statusDates.kp) copy.statusDates.kp = getTodayISO();
    copy.touchDates = Object.assign({}, copy.touchDates || {});
    copy.tags = (copy.tags || []).slice();
    if (copy.tags.indexOf('new') < 0) copy.tags.unshift('new');
    data.projects = data.projects.filter(function(x) { return x.id !== projectId; });
    data.projects.push(copy);
    saveData(data);
    if (typeof window.__onGoalsProjectSentToActive === 'function') {
      try { window.__onGoalsProjectSentToActive(copy); } catch (e) { console.warn('Goals→Active callback failed', e); }
    }
    render();
  }

  function saveSumFromInput(inputEl) {
    if (!inputEl) return;
    var projectId = inputEl.getAttribute('data-id');
    var blockType = inputEl.getAttribute('data-block');
    var val = (inputEl.value || '').trim();
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (blockType === 'sold') {
      p.saleAmount = val || '';
    } else {
      if (val) {
        p.mainPrice = val;
        if (!p.priceOptions || p.priceOptions.length === 0) p.priceOptions = [val];
        else p.priceOptions[0] = val;
      } else {
        p.mainPrice = '';
        p.priceOptions = [];
      }
    }
    saveData(data);
    render();
  }

  function showPricePopup(projectId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p || !p.priceOptions || p.priceOptions.length <= 1) return;
    var existing = document.getElementById('goalPricePopup');
    if (existing) existing.remove();
    var popup = document.createElement('div');
    popup.id = 'goalPricePopup';
    popup.className = 'goal-price-popup';
    popup.innerHTML = '<div class="goal-price-popup-title">Варианты КП</div><div class="goal-price-popup-list">' +
      (p.priceOptions || []).map(function(pr) { return '<div>' + esc(String(pr)) + '</div>'; }).join('') +
      '</div>';
    document.body.appendChild(popup);
    var btn = document.querySelector('.goal-row[data-id="' + projectId + '"] .goal-price');
    if (btn) {
      var r = btn.getBoundingClientRect();
      popup.style.left = r.left + 'px';
      popup.style.top = (r.bottom + 4) + 'px';
    }
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (!popup.contains(e.target) && e.target !== btn) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 10);
  }

  function openModal(anchorEl, weekNum, forcedStage) {
    var existing = document.getElementById('goalModal');
    if (existing) existing.remove();
    var isPopover = !!(anchorEl && anchorEl.getBoundingClientRect);
    var modal = document.createElement('div');
    modal.id = 'goalModal';
    modal.className = 'goal-modal-overlay' + (isPopover ? ' goal-modal-popover' : '');
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
    var modalStage = normalizeStage(forcedStage || 'weekly');
    var statusChecks = STATUS_OPTIONS.map(function(s) {
      return '<label class="goal-check"><input type="checkbox" data-status="' + s.id + '"><span>' + esc(s.label) + '</span></label>';
    }).join('');
    var touchChecks = TOUCH_OPTIONS.map(function(t) {
      return '<label class="goal-check"><input type="checkbox" data-touch="' + t.id + '"><span>' + esc(t.label) + '</span></label>';
    }).join('');
    var emojiBtns = PROJECT_EMOJIS.map(function(e) {
      return '<span class="goal-emoji-btn' + (e === '📦' ? ' goal-emoji-sel' : '') + '" data-emoji="' + esc(e) + '">' + e + '</span>';
    }).join('');
    modal.innerHTML = '<div class="goal-modal">' +
      '<div class="goal-modal-head">Новый проект</div>' +
      '<div class="goal-modal-body">' +
        '<div class="fg"><label>Эмодзи</label><div class="goal-emoji-picker">' + emojiBtns + '</div></div>' +
        '<div class="fg"><label>Название проекта</label><input type="text" id="goalInpName" placeholder="Проект"></div>' +
        '<div class="fg"><label>Ссылка на папку Google</label><input type="text" id="goalInpFolder" placeholder="https://drive.google.com/..."></div>' +
        '<div class="fg"><label>Дата</label><input type="text" id="goalInpDate" placeholder="YYYY-MM-DD" value="' + todayStr + '"></div>' +
        '<div class="fg"><label>4 цены КП (от меньшей к большей)</label><div class="goal-price-bars"><input type="number" id="goalInpPrice1" placeholder="35000" class="goal-price-bar"><input type="number" id="goalInpPrice2" placeholder="42000" class="goal-price-bar"><input type="number" id="goalInpPrice3" placeholder="48000" class="goal-price-bar"><input type="number" id="goalInpPrice4" placeholder="55000" class="goal-price-bar"></div></div>' +
        '<div class="fg"><label>Заметка</label><textarea id="goalInpNote" placeholder="Заметки"></textarea></div>' +
        '<div class="fg"><label>Статусы</label><div class="goal-checks">' + statusChecks + '</div></div>' +
        '<div class="fg"><label>Касания</label><div class="goal-checks">' + touchChecks + '</div></div>' +
        '<div class="fg"><label>Свои теги</label><div class="goal-tags-wrap"><div class="goal-tags-list" id="goalNewTagsList"></div><div class="goal-tag-add-row"><input type="text" id="goalNewTagInp" placeholder="+ Добавить тег" class="goal-tag-inp"><button type="button" class="goal-tag-add-btn" id="goalNewTagAdd">+</button></div></div></div>' +
      '</div>' +
      '<div class="goal-modal-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalModal\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalModalSave">Сохранить</button>' +
      '</div>' +
      '</div></div>';
    document.body.appendChild(modal);
    if (isPopover) {
      var box = modal.querySelector('.goal-modal');
      box.classList.add('goal-modal-mini');
      var r = anchorEl.getBoundingClientRect();
      var pad = 8;
      var left = r.left;
      var top = r.bottom + pad;
      if (left + 320 > window.innerWidth - pad) left = window.innerWidth - 320 - pad;
      if (left < pad) left = pad;
      if (top + 400 > window.innerHeight - pad) top = r.top - 400 - pad;
      if (top < pad) top = pad;
      box.style.position = 'fixed';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.maxHeight = Math.min(400, window.innerHeight - top - 20) + 'px';
      modal.classList.add('goal-overlay-transparent');
    }
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    var nameInput = document.getElementById('goalInpName');
    var emojiManualPick = false;
    function syncAutoEmojiFromName() {
      if (emojiManualPick) return;
      var nm = (nameInput && nameInput.value ? nameInput.value : '').trim();
      var autoEmoji = pickProjectEmojiByMeaning(nm, '', '', '');
      var hit = modal.querySelector('.goal-emoji-btn[data-emoji="' + autoEmoji.replace(/"/g, '&quot;') + '"]');
      if (!hit) return;
      modal.querySelectorAll('.goal-emoji-btn').forEach(function(b) { b.classList.remove('goal-emoji-sel'); });
      hit.classList.add('goal-emoji-sel');
    }
    modal.querySelectorAll('.goal-emoji-btn').forEach(function(btn) {
      btn.onclick = function() {
        emojiManualPick = true;
        modal.querySelectorAll('.goal-emoji-btn').forEach(function(b) { b.classList.remove('goal-emoji-sel'); });
        btn.classList.add('goal-emoji-sel');
      };
    });
    if (nameInput) nameInput.addEventListener('input', syncAutoEmojiFromName);
    syncAutoEmojiFromName();
    var newTags = [];
    function refreshNewTagsList() {
      var list = document.getElementById('goalNewTagsList');
      if (!list) return;
      list.innerHTML = newTags.map(function(t, i) {
        return '<span class="goal-tag-pill"><span>' + esc(t) + '</span><button type="button" class="goal-tag-rm" data-i="' + i + '">×</button></span>';
      }).join('');
      list.querySelectorAll('.goal-tag-rm').forEach(function(btn) {
        btn.onclick = function() { newTags.splice(parseInt(btn.getAttribute('data-i'), 10), 1); refreshNewTagsList(); };
      });
    }
    refreshNewTagsList();
    document.getElementById('goalNewTagAdd').onclick = function() {
      var inp = document.getElementById('goalNewTagInp');
      var v = (inp && inp.value || '').trim();
      if (v && newTags.indexOf(v) < 0) { newTags.push(v); inp.value = ''; refreshNewTagsList(); }
    };
    document.getElementById('goalModalSave').onclick = function() {
      var name = ((document.getElementById('goalInpName') || {}).value || '').trim();
      if (!name) { alert('Введите название'); return; }
      var selEmoji = modal.querySelector('.goal-emoji-btn.goal-emoji-sel');
      var emoji = selEmoji ? selEmoji.getAttribute('data-emoji') : pickProjectEmojiByMeaning(name, '', '', '');
      var folderLink = ((document.getElementById('goalInpFolder') || {}).value || '').trim();
      var dateVal = ((document.getElementById('goalInpDate') || {}).value || '').trim() || todayStr;
      var prices = [1,2,3,4].map(function(i) { return ((document.getElementById('goalInpPrice' + i) || {}).value || '').trim(); }).filter(Boolean);
      var nums = prices.map(function(x) { return parseFloat(String(x).replace(/\s/g,'')); }).filter(function(n) { return !isNaN(n); });
      var mainPrice = nums.length ? String(Math.min.apply(null, nums)) : '';
      if (!prices.length) prices = ['—'];
      var day = parseInt(dateVal.split('-')[2], 10) || 1;
      var weekIndex = (typeof weekNum === 'number' && weekNum >= 1 && weekNum <= 4) ? weekNum : getWeekIndex(day);
      var status = [];
      modal.querySelectorAll('input[data-status]:checked').forEach(function(cb) { status.push(cb.getAttribute('data-status')); });
      var touchMarkers = [];
      modal.querySelectorAll('input[data-touch]:checked').forEach(function(cb) { touchMarkers.push(cb.getAttribute('data-touch')); });
      var statusDates = {};
      var touchDates = {};
      var todayTagDate = getTodayISO();
      status.forEach(function(id) { statusDates[normalizeStatusId(id)] = todayTagDate; });
      touchMarkers.forEach(function(id) { touchDates[id] = todayTagDate; });
      var project = {
        id: generateId(),
        name: name,
        emoji: emoji,
        folderLink: folderLink || '',
        date: dateVal,
        weekIndex: weekIndex,
        mainPrice: mainPrice,
        priceOptions: prices.slice(0, 4),
        status: status,
        statusDates: statusDates,
        touchMarkers: touchMarkers,
        touchDates: touchDates,
        tags: newTags.slice(),
        note: (document.getElementById('goalInpNote') || {}).value || '',
        stage: modalStage
      };
      var data = loadData();
      data.projects = data.projects || [];
      data.projects.unshift(project);
      saveData(data);
      modal.remove();
      render();
    };
  }

  function getSelectedLeftPayload() {
    var active = (typeof window.__goalsGetActiveClient === 'function' && window.__goalsGetActiveClient()) || null;
    var byName = (typeof window.__goalsGetSelectedProjectName === 'function' ? String(window.__goalsGetSelectedProjectName() || '').trim() : '');
    var byCompany = '';
    var byPhone = '';
    var byCategory = '';
    var byCity = '';
    var byKp = '';
    try {
      var cEl = document.getElementById('company');
      var pEl = document.getElementById('phone');
      var catEl = document.getElementById('category');
      var cityEl = document.getElementById('city');
      var kpEl = document.getElementById('kp_count');
      byCompany = cEl ? String(cEl.value || '').trim() : '';
      byPhone = pEl ? String(pEl.value || '').trim() : '';
      byCategory = catEl ? String(catEl.value || '').trim() : '';
      byCity = cityEl ? String(cityEl.value || '').trim() : '';
      byKp = kpEl ? String(kpEl.value || '').trim() : '';
    } catch (e) {}
    var payload = active || {};
    payload.company = payload.company || byCompany || byName || 'Проект';
    payload.contact_name = payload.contact_name || '';
    payload.name = payload.name || byName || payload.company;
    payload.phone = payload.phone || byPhone || '';
    payload.category = payload.category || byCategory || '';
    payload.city = payload.city || byCity || '';
    payload.kp_count = payload.kp_count || byKp || '';
    return payload;
  }

  function addClientToWeek(weekNum) {
    var client = getSelectedLeftPayload();
    var project = createGoalProjectFromClient(client, weekNum, 'weekly');
    if (!project) return;
    var data = loadData();
    data.projects = data.projects || [];
    data.projects.unshift(project);
    saveData(data);
    render();
  }

  function extractClientPrice(client) {
    var raw = String((client && (client.kp_count || client.kp)) || '').replace(/\s/g, '');
    if (!raw) return '';
    var m = raw.match(/\d+(?:[.,]\d+)?/);
    if (!m) return '';
    var n = parseFloat(String(m[0]).replace(',', '.'));
    return isFinite(n) ? String(Math.round(n)) : '';
  }

  function createGoalProjectFromClient(client, weekNum, targetStage) {
    var name = String(client.company || client.contact_name || client.name || 'Клиент').trim();
    if (!name) return null;
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var day = now.getDate();
    var dateStr = y + '-' + pad2(m + 1) + '-' + pad2(day);
    var folderLink = (client.folderLink || (client.folderId ? 'https://drive.google.com/drive/folders/' + client.folderId : '')) || '';
    var detectedPrice = extractClientPrice(client);
    var project = {
      id: generateId(),
      name: name,
      emoji: pickProjectEmojiByMeaning(name, client.category || '', client.company || '', ''),
      folderLink: folderLink,
      date: dateStr,
      weekIndex: weekNum,
      mainPrice: detectedPrice || '',
      priceOptions: detectedPrice ? [detectedPrice] : ['—'],
      status: [],
      touchMarkers: [],
      tags: [],
      note: '',
      stage: targetStage || 'weekly',
      company: client.company || '',
      phone: client.phone || '',
      category: client.category || '',
      city: client.city || '',
      kp_count: client.kp_count || ''
    };
    if (targetStage === 'sold') {
      project.saleAmount = detectedPrice || '';
      project.status = ['paid'];
      project.statusDates = { paid: getTodayISO() };
    }
    if (client.folderId) project.crmClientId = client.folderId;
    return project;
  }

  function insertClientToWeekAt(weekNum, beforeProjectId, targetStage) {
    var client = getSelectedLeftPayload();
    var project = createGoalProjectFromClient(client, weekNum, targetStage || 'weekly');
    if (!project) return;
    var data = loadData();
    data.projects = data.projects || [];
    var keyFolder = String(project.crmClientId || '').trim();
    var keyName = String(project.name || '').trim().toLowerCase();
    var existing = data.projects.find(function(x) {
      if (!x) return false;
      var isWeekly = !x.stage || x.stage === 'weekly';
      if (!isWeekly) return false;
      if (keyFolder && String(x.crmClientId || x.folderId || '') === keyFolder) return true;
      var xn = String(x.name || x.company || '').trim().toLowerCase();
      return !!(keyName && xn && xn === keyName);
    });
    if (existing) {
      existing.weekIndex = weekNum;
      existing.stage = targetStage || 'weekly';
      if (targetStage === 'sold') {
        existing.saleAmount = existing.saleAmount || existing.mainPrice || '';
        existing.status = ['paid'];
        existing.statusDates = Object.assign({}, existing.statusDates || {});
        existing.statusDates.paid = getTodayISO();
      }
      saveData(data);
      render();
      return;
    }
    if (beforeProjectId) {
      var targetIdx = data.projects.findIndex(function(x) { return x.id === beforeProjectId; });
      if (targetIdx >= 0) data.projects.splice(targetIdx, 0, project);
      else data.projects.unshift(project);
    } else {
      data.projects.unshift(project);
    }
    saveData(data);
    render();
  }

  function startClientDrag(e) {
    var client = typeof window.__goalsGetActiveClient === 'function' ? window.__goalsGetActiveClient() : null;
    if (!client) return;
    try {
      if (e && e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', 'goals-active-client');
        var name = String(client.company || client.contact_name || client.name || 'Проект').trim();
        var ghost = document.createElement('div');
        ghost.className = 'goals-client-drag-ghost';
        ghost.textContent = '✋ ' + name;
        document.body.appendChild(ghost);
        try { e.dataTransfer.setDragImage(ghost, 18, 18); } catch (imgErr) {}
        setTimeout(function() { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 0);
      }
    } catch (err) {}
    window.__clientDragJustHappened = true;
    if (document.body) document.body.classList.add('goals-client-dragging');
  }

  function endClientDrag() {
    document.querySelectorAll('.goal-week-drop-target').forEach(function(el) { el.classList.remove('goal-week-drop-target'); });
    document.querySelectorAll('.goal-sold-drop-target').forEach(function(el) { el.classList.remove('goal-sold-drop-target'); });
    if (document.body) document.body.classList.remove('goals-client-dragging');
    setTimeout(function() { window.__clientDragJustHappened = false; }, 220);
  }

  function allowClientDrop(e) {
    var client = typeof window.__goalsGetActiveClient === 'function' ? window.__goalsGetActiveClient() : null;
    if (!client) return;
    if (!e) return;
    e.preventDefault();
    var weekEl = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.goal-week') : null;
    if (weekEl) weekEl.classList.add('goal-week-drop-target');
    var soldEl = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.goal-block-sold') : null;
    if (soldEl) soldEl.classList.add('goal-sold-drop-target');
  }

  function dropClientOnWeek(weekNum, e) {
    if (e) e.preventDefault();
    endClientDrag();
    insertClientToWeekAt(weekNum, '');
  }

  function dropClientOnRow(weekNum, beforeProjectId, e) {
    if (e) e.preventDefault();
    endClientDrag();
    insertClientToWeekAt(weekNum, beforeProjectId);
  }

  function dropClientToSold(e) {
    if (e) e.preventDefault();
    endClientDrag();
    insertClientToWeekAt(1, '', 'sold');
  }

  function isInteractiveTarget(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('button,input,textarea,a,.goal-name-cell,.goal-status-badge,.goal-touch-badge,.goal-custom-tag,.goal-badge-rm,.goal-custom-tag-rm');
  }

  function quickAddClientToRow(weekNum, beforeProjectId, e) {
    if (!e) return;
    if (isInteractiveTarget(e.target)) return;
    insertClientToWeekAt(weekNum, beforeProjectId);
  }

  function quickAddClientToWeek(weekNum, e) {
    if (!e) return;
    if (isInteractiveTarget(e.target)) return;
    if (e.target && e.target.closest && e.target.closest('.goal-row')) return;
    insertClientToWeekAt(weekNum, '');
  }

  window.AVITOLOG_GOALS = { render: render, __externalVersion: 'goals-js-v2' };
  window.__AVITOLOG_GOALS_LEGACY = window.AVITOLOG_GOALS;
  window.__goalsAddClientToWeek = addClientToWeek;
  window.__goalsClientDragStart = startClientDrag;
  window.__goalsClientDragEnd = endClientDrag;
  window.__goalsClientDragOver = allowClientDrop;
  window.__goalsClientDropOnWeek = dropClientOnWeek;
  window.__goalsClientDropOnRow = dropClientOnRow;
  window.__goalsClientDropToSold = dropClientToSold;
  window.__goalsQuickAddClientToRow = quickAddClientToRow;
  window.__goalsQuickAddClientToWeek = quickAddClientToWeek;
})();
