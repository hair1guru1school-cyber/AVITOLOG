// ── PROJECTS SCREEN ──
var PROJECTS_DATA_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects') : 'avitolog_projects';
var PROJECT_STATUSES = ['Ожидают','В работе','Готово!','ЛИМИТ','OFF','След. мес.','Жду','ПАРКУЙ','О бюджете'];
var PROJECT_STATUS_COLORS = {'Ожидают':'#7c6af7','В работе':'#00d97e','Готово!':'#00d97e','ЛИМИТ':'#ff6b35','OFF':'#666','След. мес.':'#ffcc00','Жду':'#ffcc00','ПАРКУЙ':'#666','О бюджете':'#ff6b35'};
var PROJECT_EMOJIS = [
  '🏠','🏗️','🏢','🧱','🪵','🛋️','🚪','🪟','🔨','🪚','⚒️','🪛','🔧','📐','🧰',
  '🚚','🚛','🏭','⚙️','⛓️','🔩','📦','📋','📝','📣','📊','💼','💰','🚀','⭐️',
  '👷','🛠️','🪨','🚜','⛏️','🏗','🗑️','🪣',
  '📚','✏️','🎓','👩‍🏫','📖','🖊️','🧮','✒️',
  '🖥️','💻','📱','⌨️','📷','📡','🔌','📻','🖨️','💾','🖱️',
  '🚗','🛒','👔','🔥','🪑','🛏️','🧊','⚡','🏪','🌐'
];
var PROJECTS_ACTIVE_SHEET_NAME = 'Активные';
var _projectsDidInitialCenter = false;
var _selectedProjectId = null;
var _expandedProjectIds = {};
var _projectChildFocusKey = null;
var PROJECTS_STICKY_WIDTH_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects_sticky_width') : 'avitolog_projects_sticky_width';
var PROJECTS_ROW_HEIGHT_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects_row_height') : 'avitolog_projects_row_height';
var PROJECTS_DAY_PX_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects_day_px') : 'avitolog_projects_day_px';
var PROJECTS_ZOOM_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects_zoom') : 'avitolog_projects_zoom';
var _dragProjectId = null;
var _projectFolderBindTargetId = null;
var _calendarCtx = { projectId: null, date: null };
var _calendarPaintMode = null; // null | 'launch'
var _calendarPainting = false;
var _calendarPaintErase = false;
var _calendarPaintProjectId = null;
var _calendarPaintChildLineIndex = -1;
var _calendarPaintDates = [];
var _projectJokerDetachArmedId = null;
var _cardsActivePlacement = null; // { value: string } - ghost follows mouse, click cell to place
var _cardsActiveDragging = null;  // { projectId: string, value: string, sourceDate: string } - drag existing badge
var _mustLaunchPlacement = null;  // true when ghost follows, left-click places (multi), right-click cancels
var _projectMustLaunchDetachArmedId = null;
var _projectsSheetPullTimer = null;
var _projectsSheetPullBusy = false;
var _projectsSheetPullPauseUntil = 0;
var _projectsDayShiftTimer = null;
var _projectsDayStamp = '';
var _projectsTypeSortPriority = null; // null | 'old' | 'new' | 'returning'
var _projectsFilterLaunch = false;
var _projectsFilterAutoload = false;
var _projectsFilterMustLaunch = false;
var _projectsZoneTab = 'active'; // active | second_chance | archive
var TASKS_LAYER_ON_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_tasks_layer_on') : 'avitolog_tasks_layer_on';
var TASK_PANEL_FONT_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_task_panel_font') : 'avitolog_task_panel_font';
var TASK_PANEL_WIDTH_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_task_panel_width') : 'avitolog_task_panel_width';
var _tasksLayerOn = (function(){ try{ var v=localStorage.getItem(TASKS_LAYER_ON_KEY); return v!=='0'; }catch(e){ return true; }})();
var TASKS_SORT_ON_KEY = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_projects_tasks_sort_v1') : 'avitolog_projects_tasks_sort_v1';
var _projectsTasksSortOn = (function(){ try{ return localStorage.getItem(TASKS_SORT_ON_KEY)==='1'; }catch(e){ return false; }})();
var _taskPanelProjectId = null;
var _selectedCalCell = null;
var _projectsZoneTabOrder = (function(){ try{ var s=localStorage.getItem('av_projects_zone_order'); return s ? JSON.parse(s) : ['active','second_chance','archive']; }catch(e){ return ['active','second_chance','archive']; }})();
var DAYS_LEFT = 0; // по умолчанию показывать только с сегодня
var DAY_PX = 28; // ширина колонки дня в пикселях
var _projectsTodayIndex = DAYS_LEFT;
var _projectsZoomCenterToday = false;

function getTodayISO() {
  var d = new Date();
  d.setHours(0,0,0,0);
  return toIsoDateLocal(d);
}
function getTodayISOmsk() {
  try {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
    var p = f.formatToParts(new Date());
    var y = (p.find(function(x){ return x.type==='year'; })||{}).value || '';
    var m = (p.find(function(x){ return x.type==='month'; })||{}).value || '';
    var d = (p.find(function(x){ return x.type==='day'; })||{}).value || '';
    return y + '-' + m + '-' + d;
  } catch(e) { return getTodayISO(); }
}
function toIsoDateLocal(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function stopProjectsSheetPullTimer() {
  if (_projectsSheetPullTimer) {
    clearInterval(_projectsSheetPullTimer);
    _projectsSheetPullTimer = null;
  }
}

function runProjectsSheetPull(forceMerge) {
  if (document.hidden) return;
  if (!_driveToken) return;
  if (Date.now() < _projectsSheetPullPauseUntil) return;
  if (_projectsSheetPullBusy) return;
  _projectsSheetPullBusy = true;
  hydrateProjectsFromActiveSheet(!!forceMerge).then(function(changed){
    if (!projectsMode) return;
    if (changed) rerenderProjectsPreserveScroll();
  }).catch(function(){}).finally(function(){
    _projectsSheetPullBusy = false;
  });
}

function startProjectsSheetPullTimer() {
  if (!_driveToken) return;
  stopProjectsSheetPullTimer();
  setTimeout(function() { runProjectsSheetPull(true); }, 2500);
  _projectsSheetPullTimer = setInterval(function(){
    runProjectsSheetPull(true);
  }, 35000);
}
function stopProjectsDayShiftTimer() {
  if (_projectsDayShiftTimer) {
    clearInterval(_projectsDayShiftTimer);
    _projectsDayShiftTimer = null;
  }
}
function startProjectsDayShiftTimer() {
  stopProjectsDayShiftTimer();
  _projectsDayStamp = getTodayISOmsk();
  _projectsDayShiftTimer = setInterval(function() {
    if (!projectsMode || document.hidden) return;
    var nowDay = getTodayISOmsk();
    if (nowDay !== _projectsDayStamp) {
      _projectsDayStamp = nowDay;
      _projectsDidInitialCenter = false;
      var data = loadProjectsData();
      saveProjectsData(data);
      renderProjectsScreen();
    }
  }, 60000);
}

function loadProjectsData() {
  try {
    var s = localStorage.getItem(PROJECTS_DATA_KEY);
    var data = s ? JSON.parse(s) : null;
    if (!data || !data.projects || data.projects.length < 10) {
      return getDefaultProjectsData();
    }
    // Migration: once switch default path buttons to OFF for existing local data.
    if (!localStorage.getItem('avitolog_projects_path_defaults_off_v1')) {
      data.projects.forEach(function(p) {
        p.clientPath = {autoload:false,analytics:false,texts:false,packaging:false,portfolio:false};
      });
      localStorage.setItem('avitolog_projects_path_defaults_off_v1', '1');
      saveProjectsData(data);
    } else {
      data.projects.forEach(function(p) {
        if (!p.clientPath || typeof p.clientPath !== 'object') {
          p.clientPath = {autoload:false,analytics:false,texts:false,packaging:false,portfolio:false};
        }
      });
    }
    // Always sanitize old date-bound markers:
    // they should not live on historical dates anymore.
    var sanitized = false;
    data.projects.forEach(function(p) {
      var events = Array.isArray(p.events) ? p.events : [];
      var hasLegacyMarkers = events.some(function(e){
        return e && (e.type === 'cards_count_without_active_upload' || e.type === 'deadline');
      });
      if (!hasLegacyMarkers) return;
      p.events = events.filter(function(e){
        return e && e.type !== 'cards_count_without_active_upload' && e.type !== 'deadline';
      });
      // If legacy markers existed, reset floating markers too.
      p.cardsActive = '';
      p.mustLaunchRequired = false;
      sanitized = true;
    });
    if (sanitized) saveProjectsData(data);
    // Правило: Актив карточек и !! каждый день в 00:00 МСК переносятся на следующий день.
    // При загрузке: все карточки с прошлой даты (< сегодня МСК), пустой даты или ошибочной будущей даты — переносим на сегодня МСК.
    var todayStr = getTodayISOmsk();
    var cardsMoved = false;
    data.projects.forEach(function(p) {
      var cd = (p.cardsActiveDate || '').trim();
      var md = (p.mustLaunchDate || '').trim();
      var fix15to11 = function(d){ if (!d || d.length < 10) return d; if (d.slice(-2) === '15') return d.slice(0,-2) + '11'; return d; };
      if (p.cardsActive && cd) { var fixed = fix15to11(cd); if (fixed !== cd) { p.cardsActiveDate = fixed; cardsMoved = true; } }
      if (p.mustLaunchRequired && md) { var fixed = fix15to11(md); if (fixed !== md) { p.mustLaunchDate = fixed; cardsMoved = true; } }
      var needCardsToday = p.cardsActive && (cd === '' || cd < todayStr || cd > todayStr);
      var needMustToday = p.mustLaunchRequired && (md === '' || md < todayStr || md > todayStr);
      if (needCardsToday) { p.cardsActiveDate = todayStr; cardsMoved = true; }
      if (needMustToday) { p.mustLaunchDate = todayStr; cardsMoved = true; }
    });
    if (cardsMoved) saveProjectsData(data);
    persistProjectTypeNormalization(data);
    if (!Array.isArray(data.hiddenProjects)) data.hiddenProjects = [];
    if (!Array.isArray(data.tasks)) data.tasks = [];
    if (!Array.isArray(data.taskLog)) data.taskLog = [];
    return data;
  } catch(e) { return getDefaultProjectsData(); }
}
function saveProjectsData(data) {
  try { localStorage.setItem(PROJECTS_DATA_KEY, JSON.stringify(data)); } catch(e) {}
}
async function hydrateProjectsFromActiveSheet(forceMerge) {
  if (!_driveToken) return false;
  if (typeof forceMerge === 'undefined') forceMerge = false;
  try {
    var localRaw = localStorage.getItem(PROJECTS_DATA_KEY);
    if (!forceMerge && localRaw) {
      var localData = JSON.parse(localRaw);
      if (localData && localData.projects && localData.projects.length >= 10) return false;
    }
  } catch(e) {}
  try {
    var range = PROJECTS_ACTIVE_SHEET_NAME + '!A2:Q';
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(range);
    var resp = await fetch(url, { headers: {'Authorization': 'Bearer ' + _driveToken} });
    if (!resp.ok) return false;
    var json = await resp.json();
    var rows = json.values || [];
    if (!rows.length) return false;
    var latestById = {};
    rows.forEach(function(r) {
      if (!r || !Array.isArray(r)) return;
      var pid = String(r[1] || '').trim();
      if (!pid) return;
      var ts = r[0] || '';
      if (!latestById[pid] || String(latestById[pid][0] || '') <= String(ts)) latestById[pid] = r;
    });
    var data = loadProjectsData();
    if (!data || !data.projects || !data.projects.length) data = getDefaultProjectsData();
    var changed = false;
    data.projects.forEach(function(p) {
      var r = latestById[p.id];
      if (!r) return;
      var title = r[2] || p.title;
      var status = r[3] || p.status;
      var folderLink = r[7] || p.folderLink || '';
      var folderId = r[8] || p.folderId || '';
      var clientType = r[9] || p.clientType;
      var optionalField = r[10] || p.optionalField || '';
      var pathText = r[4] || '';
      var nextPath = {
        autoload: pathText.indexOf('Автозагрузка') >= 0,
        analytics: pathText.indexOf('Аналитика') >= 0,
        texts: pathText.indexOf('Тексты') >= 0,
        packaging: pathText.indexOf('Упаковка') >= 0,
        portfolio: pathText.indexOf('Портфолио') >= 0
      };
      var start = r[5] || '';
      var end = r[6] || '';
      var hasLaunchCols = r.length > 14;
      var hasCardsCol = r.length > 15;
      var hasMustLaunchCol = r.length > 16;
      var launchStart = hasLaunchCols ? (r[13] || '') : '';
      var launchEnd = hasLaunchCols ? (r[14] || '') : '';
      var cardsActive = hasCardsCol ? String(r[15] || '').trim() : null;
      var mustLaunchRaw = hasMustLaunchCol ? String(r[16] || '').trim().toLowerCase() : '';
      var mustLaunchRequired = hasMustLaunchCol ? (mustLaunchRaw === '1' || mustLaunchRaw === 'true' || mustLaunchRaw === 'yes' || mustLaunchRaw === 'да' || mustLaunchRaw === '‼️') : null;
      if (p.title !== title) { p.title = title; changed = true; }
      if (p.status !== status) { p.status = status; changed = true; }
      if ((p.folderLink || '') !== folderLink) { p.folderLink = folderLink; changed = true; }
      if ((p.folderId || '') !== folderId) { p.folderId = folderId; changed = true; }
      if (p.crmData && typeof p.crmData === 'object') {
        if ((p.crmData.folderLink || '') !== (p.folderLink || '')) {
          p.crmData.folderLink = p.folderLink || '';
          changed = true;
        }
        if ((p.crmData.folderId || '') !== (p.folderId || '')) {
          p.crmData.folderId = p.folderId || '';
          changed = true;
        }
      }
      if ((p.clientType || '') !== clientType) { p.clientType = clientType; changed = true; }
      if ((p.optionalField || '') !== optionalField) { p.optionalField = optionalField; changed = true; }
      var prevPath = p.clientPath || {};
      if (!!prevPath.autoload !== !!nextPath.autoload || !!prevPath.analytics !== !!nextPath.analytics || !!prevPath.texts !== !!nextPath.texts || !!prevPath.packaging !== !!nextPath.packaging || !!prevPath.portfolio !== !!nextPath.portfolio) {
        p.clientPath = nextPath;
        changed = true;
      }
      var prevRange = (p.events || []).find(function(e){ return e.type === 'active_range'; });
      if (start && end) {
        if (!prevRange || prevRange.startDate !== start || prevRange.endDate !== end) {
          p.events = (p.events || []).filter(function(e){ return e.type !== 'active_range'; });
          p.events.push({type:'active_range', startDate:start, endDate:end});
          changed = true;
        }
      } else if (prevRange) {
        p.events = (p.events || []).filter(function(e){ return e.type !== 'active_range'; });
        changed = true;
      }
      if (hasLaunchCols) {
        if (launchStart && launchEnd) {
          var prevLaunch = (p.events || []).find(function(e){ return e.type === 'launch_range'; });
          var prevRocket = (p.events || []).find(function(e){ return e.type === 'not_launched_project_marker'; });
          if (!prevLaunch || prevLaunch.startDate !== launchStart || prevLaunch.endDate !== launchEnd || !prevRocket || prevRocket.date !== launchEnd) {
            p.events = (p.events || []).filter(function(e){ return e.type !== 'launch_range' && e.type !== 'not_launched_project_marker'; });
            p.events.push({type:'launch_range', startDate:launchStart, endDate:launchEnd});
            p.events.push({type:'not_launched_project_marker', date:launchEnd});
            changed = true;
          }
        } else {
          var hadLaunch = (p.events || []).some(function(e){ return e.type === 'launch_range' || e.type === 'not_launched_project_marker'; });
          if (hadLaunch) {
            p.events = (p.events || []).filter(function(e){ return e.type !== 'launch_range' && e.type !== 'not_launched_project_marker'; });
            changed = true;
          }
        }
      }
      if (hasCardsCol && (p.cardsActive || '') !== cardsActive) {
        p.cardsActive = cardsActive;
        changed = true;
      }
      var hadLegacyCardsEvent = (p.events || []).some(function(e){ return e && e.type === 'cards_count_without_active_upload'; });
      if (hadLegacyCardsEvent) {
        p.events = (p.events || []).filter(function(e){ return e && e.type !== 'cards_count_without_active_upload'; });
        changed = true;
      }
      var hadLegacyDeadlineEvent = (p.events || []).some(function(e){ return e && e.type === 'deadline'; });
      if (hadLegacyDeadlineEvent) {
        p.events = (p.events || []).filter(function(e){ return e && e.type !== 'deadline'; });
        changed = true;
      }
      if (hasMustLaunchCol && !!p.mustLaunchRequired !== !!mustLaunchRequired) {
        p.mustLaunchRequired = !!mustLaunchRequired;
        changed = true;
      }
    });
    if (changed) saveProjectsData(data);
    return changed;
  } catch(e) {
    console.warn('hydrateProjectsFromActiveSheet failed:', e);
    return false;
  }
}
function getProjectsWrapScroll() {
  var wrap = document.querySelector('.projects-table-wrap');
  var content = document.querySelector('.content');
  return {
    wrapLeft: wrap ? wrap.scrollLeft : 0,
    wrapTop: wrap ? wrap.scrollTop : 0,
    contentTop: content ? content.scrollTop : 0
  };
}
function scrollProjectsCalendarToToday() {
  var wrap = document.querySelector('.projects-table-wrap');
  if (!wrap) return;
  var px = typeof DAY_PX === 'number' ? DAY_PX : 28;
  var todayStartX = Math.max(0, (_projectsTodayIndex >= 0 ? _projectsTodayIndex : DAYS_LEFT) * px);
  wrap.scrollLeft = todayStartX;
}
var _rerenderProjectsDebounceTimer = null;
var _rerenderProjectsDebounceMs = 100;
function rerenderProjectsPreserveScroll() {
  if (_rerenderProjectsDebounceTimer) clearTimeout(_rerenderProjectsDebounceTimer);
  _rerenderProjectsDebounceTimer = setTimeout(function() {
    _rerenderProjectsDebounceTimer = null;
    renderProjectsScreen({ preserveScroll: getProjectsWrapScroll() });
  }, _rerenderProjectsDebounceMs);
}
function rerenderProjectsImmediate() {
  if (_rerenderProjectsDebounceTimer) { clearTimeout(_rerenderProjectsDebounceTimer); _rerenderProjectsDebounceTimer = null; }
  renderProjectsScreen({ preserveScroll: getProjectsWrapScroll() });
}
function spawnProjectsElectricSpark(el, clientX) {
  if (!el) return;
  var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  var x = r ? (isFinite(clientX) ? (clientX - r.left) : (r.width / 2)) : 10;
  if (!isFinite(x)) x = 10;
  if (r) x = Math.max(8, Math.min(r.width - 8, x));
  var spark = document.createElement('span');
  spark.className = 'projects-electric-spark';
  spark.style.left = Math.round(x) + 'px';
  el.appendChild(spark);
  setTimeout(function() {
    if (spark && spark.parentNode) spark.parentNode.removeChild(spark);
  }, 300);
}
function bindProjectsClickSparks() {
  var nodes = document.querySelectorAll('.projects-zone-tab, .projects-add-btn, .projects-tasks-tab, .projects-head-chip');
  nodes.forEach(function(el) {
    if (el.dataset.sparkBound === '1') return;
    el.dataset.sparkBound = '1';
    el.classList.add('projects-pressable');
    el.addEventListener('pointerdown', function(e) {
      if (e && typeof e.button === 'number' && e.button !== 0) return;
      spawnProjectsElectricSpark(el, e ? e.clientX : NaN);
    });
  });
}
function getProjectEmojiButtonHtml(p) {
  var custom = String((p && p.customIcon) || '').trim();
  if (custom) return '<img src="' + escAttr(custom) + '" alt="">';
  return escAttr((p && p.emoji) || '😀');
}
function setProjectsTypeSortPriority(kind) {
  var k = (kind === 'old' || kind === 'new' || kind === 'returning') ? kind : null;
  if (_projectsTypeSortPriority === k) _projectsTypeSortPriority = null;
  else _projectsTypeSortPriority = k;
  rerenderProjectsPreserveScroll();
}
function toggleProjectsFilterLaunch() { _projectsFilterLaunch = !_projectsFilterLaunch; rerenderProjectsPreserveScroll(); }
function toggleProjectsFilterAutoload() { _projectsFilterAutoload = !_projectsFilterAutoload; rerenderProjectsPreserveScroll(); }
function toggleProjectsFilterMustLaunch() { _projectsFilterMustLaunch = !_projectsFilterMustLaunch; rerenderProjectsPreserveScroll(); }
function projectHasLaunch(p) {
  var ev = (p.events || []).some(function(e){ return e && (e.type === 'launch_range' || e.type === 'not_launched_project_marker'); });
  if (ev) return true;
  var cl = p.childLineEvents || {};
  for (var k in cl) { if ((cl[k] || []).some(function(e){ return e && (e.type === 'launch_range' || e.type === 'not_launched_project_marker'); })) return true; }
  return false;
}
function projectHasAutoload(p) {
  var ev = (p.events || []).some(function(e){ return e && e.type === 'active_range'; });
  if (ev) return true;
  var cl = p.childLineEvents || {};
  for (var k in cl) { if ((cl[k] || []).some(function(e){ return e && e.type === 'active_range'; })) return true; }
  return false;
}
function projectHasMustLaunch(p) { return !!(p && p.mustLaunchRequired); }
function setProjectsZoneTab(zone) {
  var z = (zone === 'active' || zone === 'second_chance' || zone === 'archive') ? zone : 'active';
  _projectsZoneTab = z;
  var sel = getSelectedProject();
  if (sel && (sel.zone || 'active') !== z) _selectedProjectId = null;
  renderProjectsScreen();
}
var _zoneTabDragZone = null;
function zoneTabDragStart(e, zone) {
  _zoneTabDragZone = zone;
  e.dataTransfer.setData('text/plain', zone);
  e.dataTransfer.effectAllowed = 'move';
  if (e.target && e.target.classList) e.target.classList.add('zone-tab-dragging');
}
function zoneTabDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var t = e.target && e.target.closest && e.target.closest('.projects-zone-tab');
  if (t && t !== document.querySelector('.zone-tab-dragging')) t.classList.add('zone-tab-drop-target');
}
function zoneTabDragLeave(e) {
  var t = e.target && e.target.closest && e.target.closest('.projects-zone-tab');
  if (t) t.classList.remove('zone-tab-drop-target');
}
function zoneTabDrop(e, zone) {
  e.preventDefault();
  (e.target && e.target.closest && e.target.closest('.projects-zone-tab') || {}).classList && (e.target.closest('.projects-zone-tab') || {}).classList.remove('zone-tab-drop-target');
  if (!_zoneTabDragZone || _zoneTabDragZone === zone) return;
  var idx = _projectsZoneTabOrder.indexOf(_zoneTabDragZone);
  var targetIdx = _projectsZoneTabOrder.indexOf(zone);
  if (idx < 0 || targetIdx < 0) return;
  _projectsZoneTabOrder.splice(idx, 1);
  targetIdx = _projectsZoneTabOrder.indexOf(zone);
  _projectsZoneTabOrder.splice(targetIdx, 0, _zoneTabDragZone);
  try { localStorage.setItem('av_projects_zone_order', JSON.stringify(_projectsZoneTabOrder)); } catch(err) {}
  renderProjectsScreen();
}
function zoneTabDragEnd(e) {
  _zoneTabDragZone = null;
  document.querySelectorAll('.projects-zone-tab.zone-tab-dragging, .projects-zone-tab.zone-tab-drop-target').forEach(function(el){ el.classList.remove('zone-tab-dragging','zone-tab-drop-target'); });
}
function moveProjectToZone(projectId, zone) {
  var z = (zone === 'active' || zone === 'second_chance' || zone === 'archive') ? zone : 'active';
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  var oldZone = p.zone || 'active';
  if (oldZone === z) return;
  var zoneList = (data.projects || []).filter(function(x){ return (x.zone || 'active') === z; });
  var nextSort = zoneList.length ? Math.max.apply(null, zoneList.map(function(x){ return Number(x.sortOrder) || 0; })) + 1 : 0;
  p.zone = z;
  p.sortOrder = nextSort;
  saveProjectsData(data);
  syncProjectToActiveSheet(projectId, 'zone_move_' + z);
  if (_projectsZoneTab !== z) _projectsZoneTab = z;
  renderProjectsScreen();
}
function deleteProject(projectId) {
  var data = loadProjectsData();
  var idx = (data.projects || []).findIndex(function(x){ return x.id === projectId; });
  if (idx < 0) return;
  if (!confirm('Удалить проект «' + (data.projects[idx].title || 'Без названия') + '»? Он попадёт в скрытый календарный лист справа.')) return;
  var p = data.projects.splice(idx, 1)[0];
  data.hiddenProjects = data.hiddenProjects || [];
  p.deletedAt = new Date().toISOString().slice(0, 10);
  p._hiddenZone = p.zone || 'active';
  data.hiddenProjects.unshift(p);
  saveProjectsData(data);
  if (_selectedProjectId === projectId) _selectedProjectId = null;
  renderProjectsScreen();
}
function restoreProjectFromHidden(projectId) {
  var data = loadProjectsData();
  var idx = (data.hiddenProjects || []).findIndex(function(x){ return x.id === projectId; });
  if (idx < 0) return;
  var p = data.hiddenProjects.splice(idx, 1)[0];
  delete p.deletedAt;
  var prevZone = p._hiddenZone || 'archive';
  delete p._hiddenZone;
  p.zone = prevZone;
  var zoneList = (data.projects || []).filter(function(x){ return (x.zone || 'active') === prevZone; });
  p.sortOrder = zoneList.length ? Math.max.apply(null, zoneList.map(function(x){ return Number(x.sortOrder) || 0; })) + 1 : 0;
  data.projects.push(p);
  saveProjectsData(data);
  if (prevZone !== _projectsZoneTab) setProjectsZoneTab(prevZone);
  renderProjectsScreen();
}
function showProjectZoneMenu(btn, projectId) {
  var old = document.getElementById('projZonePicker');
  if (old) old.remove();
  var p = loadProjectsData().projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  var cur = p.zone || 'active';
  var picker = document.createElement('div');
  picker.id = 'projZonePicker';
  picker.className = 'proj-zone-picker';
  var items = [
    {k:'active', t:'Актив'},
    {k:'second_chance', t:'Zzz'},
    {k:'archive', t:'Архив'},
    {k:'delete', t:'Удалить', del: true}
  ];
  picker.innerHTML = items.map(function(it){
    var on = !it.del && it.k === cur ? ' on' : '';
    var delCls = it.del ? ' zone-item-delete' : '';
    return '<button type="button" class="zone-item' + on + delCls + '" data-zone="' + it.k + '">' + it.t + '</button>';
  }).join('');
  picker.onclick = function(e) {
    var b = e.target.closest('button[data-zone]');
    if (!b) return;
    var z = b.getAttribute('data-zone');
    picker.remove();
    if (z === 'delete') {
      deleteProject(projectId);
    } else {
      moveProjectToZone(projectId, z);
    }
  };
  document.body.appendChild(picker);
  var r = btn.getBoundingClientRect();
  picker.style.left = Math.max(8, r.left - 6) + 'px';
  picker.style.top = (r.bottom + 4) + 'px';
  setTimeout(function(){
    document.addEventListener('click', function close(ev){
      if (!picker.parentNode) { document.removeEventListener('click', close); return; }
      if (!picker.contains(ev.target) && ev.target !== btn) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}
function createNewProjectInActive() {
  var data = loadProjectsData();
  var maxN = 0;
  (data.projects || []).forEach(function(p) {
    var id = String((p && p.id) || '');
    var m = id.match(/^p(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10) || 0);
  });
  var newId = 'p' + (maxN + 1);
  if ((data.projects || []).some(function(p){ return p.id === newId; })) {
    newId = 'p' + Date.now();
  }
  var zoneItems = (data.projects || []).filter(function(p){ return (p.zone || 'active') === 'active'; });
  var nextSort = zoneItems.length ? Math.max.apply(null, zoneItems.map(function(p){ return Number(p.sortOrder) || 0; })) + 1 : 0;
  var np = {
    id: newId,
    emoji: '🆕',
    title: 'Новый проект',
    clientType: 'new',
    zone: 'active',
    status: 'В работе',
    sortOrder: nextSort,
    clientPath: {autoload:false,analytics:false,texts:false,packaging:false,portfolio:false},
    events: [],
    childLines: [],
    optionalField: '',
    cardsActive: '',
    mustLaunchRequired: false
  };
  data.projects.push(np);
  saveProjectsData(data);
  _selectedProjectId = np.id;
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(np.id, 'project_add');
}
function getProjectPathSummary(p) {
  if (!p || !p.clientPath) return '';
  var labels = [];
  if (p.clientPath.autoload) labels.push('Автозагрузка');
  if (p.clientPath.analytics) labels.push('Аналитика');
  if (p.clientPath.texts) labels.push('Тексты');
  if (p.clientPath.packaging) labels.push('Упаковка');
  if (p.clientPath.portfolio) labels.push('Портфолио');
  return labels.join(', ');
}
function getProjectAutoloadRange(p) {
  var ranges = (p && p.events ? p.events : []).filter(function(e) { return e && e.type === 'active_range'; });
  if (!ranges.length) return {start:'', end:''};
  ranges.sort(function(a,b){ return String(a.startDate||'').localeCompare(String(b.startDate||'')); });
  return {start: ranges[0].startDate || '', end: ranges[ranges.length - 1].endDate || ''};
}
function getProjectLaunchRange(p) {
  var ranges = (p && p.events ? p.events : []).filter(function(e) { return e && e.type === 'launch_range'; });
  if (!ranges.length) return {start:'', end:''};
  ranges.sort(function(a,b){ return String(a.startDate||'').localeCompare(String(b.startDate||'')); });
  return {start: ranges[0].startDate || '', end: ranges[ranges.length - 1].endDate || ''};
}
function getAggregatedAutoloadEventsForCollapsed(p) {
  var all = [];
  (p.events || []).forEach(function(ev){ if (ev && ev.type === 'active_range') all.push(ev); });
  (p.childLineEvents || []).forEach(function(arr){
    if (!Array.isArray(arr)) return;
    arr.forEach(function(ev){ if (ev && ev.type === 'active_range') all.push(ev); });
  });
  all.sort(function(a,b){
    var sa = String(a.startDate||''), ea = String(a.endDate||'');
    var sb = String(b.startDate||''), eb = String(b.endDate||'');
    var lenA = sa && ea ? (ea.localeCompare(sa) || 1) : 0;
    var lenB = sb && eb ? (eb.localeCompare(sb) || 1) : 0;
    return lenB - lenA;
  });
  return all.length ? all : (p.events || []);
}
function escAttr(v) {
  return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function normalizeProjectClientType(t) {
  var v = String(t || '').trim().toLowerCase();
  if (!v) return 'new';
  if (v === 'old' || v === '💎' || v.indexOf('diamond') >= 0 || v.indexOf('стар') >= 0) return 'old';
  if (v === 'returning' || v === '2' || v === '2️⃣' || v.indexOf('return') >= 0 || v.indexOf('repeat') >= 0) return 'returning';
  if (v === 'new' || v.indexOf('нов') >= 0) return 'new';
  return 'new';
}
function getSavedProjectsStickyWidth() {
  var n = parseInt(localStorage.getItem(PROJECTS_STICKY_WIDTH_KEY) || '', 10);
  return Number.isFinite(n) ? n : 0;
}
function persistProjectTypeNormalization(data) {
  if (!data || !data.projects) return;
  var changed = false;
  data.projects.forEach(function(p) {
    var n = normalizeProjectClientType(p.clientType);
    if (p.clientType !== n) {
      p.clientType = n;
      changed = true;
    }
  });
  if (changed) saveProjectsData(data);
}
function setProjectsStickyWidthPx(width) {
  var w = Math.max(320, Math.min(600, Math.round(width || 0)));
  localStorage.setItem(PROJECTS_STICKY_WIDTH_KEY, String(w));
  var table = document.querySelector('.projects-table');
  if (table) table.style.setProperty('--projects-sticky-width', w + 'px');
}
function getSavedProjectsRowHeight() {
  var n = parseInt(localStorage.getItem(PROJECTS_ROW_HEIGHT_KEY) || '', 10);
  return Number.isFinite(n) && n >= 14 ? n : 0;
}
function getSavedProjectsDayPx() {
  var n = parseInt(localStorage.getItem(PROJECTS_DAY_PX_KEY) || '', 10);
  return Number.isFinite(n) && n >= 14 && n <= 64 ? n : 0;
}
function saveProjectsDayPx(px) {
  px = Math.max(14, Math.min(64, Math.round(px)));
  localStorage.setItem(PROJECTS_DAY_PX_KEY, String(px));
  rerenderProjectsPreserveScroll();
}
function startCalCellWidthResize(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  var startX = e.clientX;
  var startPx = getSavedProjectsDayPx() || 28;
  var lastApplied = startPx;
  function applyDayPx(px) {
    px = Math.max(14, Math.min(64, Math.round(px)));
    if (px === lastApplied) return;
    lastApplied = px;
    document.querySelectorAll('.projects-cal-day').forEach(function(el) {
      el.style.width = px + 'px';
      el.style.minWidth = px + 'px';
      if (el.style.maxWidth) el.style.maxWidth = px + 'px';
    });
  }
  function onMove(ev) {
    var dx = ev.clientX - startX;
    var sens = 0.6;
    applyDayPx(startPx + dx * sens);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    saveProjectsDayPx(lastApplied);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
function resetCalCellWidth(e) {
  e.preventDefault();
  e.stopPropagation();
  saveProjectsDayPx(28);
}
function getSavedProjectsZoom() {
  var z = parseFloat(localStorage.getItem(PROJECTS_ZOOM_KEY) || '1');
  return (isNaN(z) || z < 0.25 || z > 2) ? 1 : z;
}
function saveProjectsZoom(z) {
  z = Math.max(0.25, Math.min(2, z));
  localStorage.setItem(PROJECTS_ZOOM_KEY, String(z));
  var board = document.querySelector('.projects-board');
  if (board) {
    board.style.transform = 'scale(' + z + ')';
    board.classList.toggle('projects-fit-rows', z < 1);
  }
  var table = document.querySelector('.projects-table');
  if (table) {
    var rowH = getSavedProjectsRowHeight() || 14;
    var effectiveRowH = z < 1 ? Math.max(6, Math.round(rowH * z)) : rowH;
    table.style.setProperty('--projects-row-height', effectiveRowH + 'px');
  }
}
function toggleProjectsSidebar() {
  var hidden = document.body.classList.toggle('projects-sidebar-hidden');
  try { localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_projects_sidebar_hidden') : 'avitolog_projects_sidebar_hidden'), hidden ? '1' : '0'); } catch(e) {}
  var btn = document.querySelector('.projects-expand-btn');
  if (btn) btn.classList.toggle('on', hidden);
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function setProjectsRowHeightPx(h) {
  var px = Math.max(14, Math.min(120, Math.round(h || 0)));
  localStorage.setItem(PROJECTS_ROW_HEIGHT_KEY, String(px));
  var table = document.querySelector('.projects-table');
  if (table) table.style.setProperty('--projects-row-height', px + 'px');
}
function startProjectsRowResize(e) {
  e.preventDefault();
  e.stopPropagation();
  var table = document.querySelector('.projects-table');
  if (!table) return;
  var current = getSavedProjectsRowHeight() || 14;
  var startY = e.clientY;
  document.body.classList.add('projects-row-resizing');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
  function onMove(ev) {
    ev.preventDefault();
    var newH = current + (ev.clientY - startY);
    setProjectsRowHeightPx(newH);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('projects-row-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
function resetProjectsRowHeight(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  localStorage.removeItem(PROJECTS_ROW_HEIGHT_KEY);
  var table = document.querySelector('.projects-table');
  if (table) table.style.removeProperty('--projects-row-height');
  rerenderProjectsPreserveScroll();
}
function resetProjectsStickyWidthAuto(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  localStorage.removeItem(PROJECTS_STICKY_WIDTH_KEY);
  rerenderProjectsPreserveScroll();
}
function getProjectChildLines(p) {
  var arr = Array.isArray(p && p.childLines) ? p.childLines.slice() : [];
  if (!arr.length) arr = [''];
  return arr;
}
function ensureChildLineEvents(p) {
  var lines = getProjectChildLines(p);
  if (!p.childLineEvents || !Array.isArray(p.childLineEvents)) p.childLineEvents = [];
  while (p.childLineEvents.length < lines.length) p.childLineEvents.push([]);
  if (p.childLineEvents.length > lines.length) p.childLineEvents.length = lines.length;
}
function getEventsForProjectRow(p, childLineIdx) {
  if (childLineIdx >= 0 && p && p.childLineEvents && Array.isArray(p.childLineEvents) && p.childLineEvents[childLineIdx]) {
    return p.childLineEvents[childLineIdx];
  }
  return (p && p.events) || [];
}
function renderProjectChildLinesHtml(p) {
  var lines = getProjectChildLines(p);
  return '<div class="proj-extra-lines">' + lines.map(function(line, idx) {
    return renderProjectChildLineHtml(p, idx);
  }).join('') + '</div>';
}
function renderProjectChildLineHtml(p, idx) {
  var line = (p.childLines || [])[idx];
  var focusKey = p.id + ':' + idx;
  return '<div class="proj-extra-line">' +
    '<button type="button" class="proj-extra-del" title="Удалить строку" onclick="event.stopPropagation();removeProjectChildLine(\'' + p.id + '\',' + idx + ')">×</button>' +
    '<input type="text" class="proj-extra-input" data-child-focus="' + focusKey + '" value="' + escAttr(line || '') + '" placeholder="Доп. позиция" onclick="event.stopPropagation();" oninput="updateProjectChildLine(\'' + p.id + '\',' + idx + ',this.value)" onkeydown="handleProjectChildLineKey(event,\'' + p.id + '\',' + idx + ')">' +
    '<button type="button" class="proj-extra-add" title="Добавить строку" onclick="event.stopPropagation();addProjectChildLine(\'' + p.id + '\',' + idx + ')">+</button>' +
    '</div>';
}
function getProjectsStickyWidthPx(projects) {
  var longest = 'Проект';
  (projects || []).forEach(function(p) {
    var t = (p && p.title ? String(p.title) : '').trim();
    if (t.length > longest.length) longest = t;
  });
  var titlePx = 0;
  try {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '600 15px "Golos Text", sans-serif';
      titlePx = Math.ceil(ctx.measureText(longest).width);
    }
  } catch(e) {}
  if (!titlePx) titlePx = longest.length * 9;
  // Base controls width: expand/type/drive + emoji + path buttons + status + paddings/gaps.
  var fixedControlsPx = 320;
  var w = fixedControlsPx + titlePx;
  return Math.max(360, Math.min(600, w));
}
async function ensureActiveProjectsSheet() {
  var readUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(PROJECTS_ACTIVE_SHEET_NAME + '!A1:A1');
  var readResp = await fetch(readUrl, { headers: {'Authorization': 'Bearer ' + _driveToken} });
  if (readResp.ok) return;
  var createUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + ':batchUpdate';
  await fetch(createUrl, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + _driveToken, 'Content-Type': 'application/json'},
    body: JSON.stringify({requests:[{addSheet:{properties:{title:PROJECTS_ACTIVE_SHEET_NAME}}}]})
  }).catch(function(){});
}
function buildActiveProjectRow(p, reason) {
  var rng = getProjectAutoloadRange(p);
  var launch = getProjectLaunchRange(p);
  return [
    new Date().toISOString(),
    p.id || '',
    p.title || '',
    p.status || '',
    getProjectPathSummary(p),
    rng.start || '',
    rng.end || '',
    p.folderLink || '',
    p.folderId || '',
    p.clientType || '',
    p.optionalField || '',
    reason || '',
    _driveUserEmail || '',
    launch.start || '',
    launch.end || '',
    p.cardsActive || '',
    p.mustLaunchRequired ? '1' : '0'
  ];
}
async function syncActiveProjectsSheetExact(reason) {
  if (!_driveToken) return;
  await ensureActiveProjectsSheet();
  var data = loadProjectsData();
  var active = (data.projects || [])
    .filter(function(p){ return (p.zone || 'active') === 'active'; })
    .sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });
  var rows = active.map(function(p){ return buildActiveProjectRow(p, reason || 'sync'); });
  var clearUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(PROJECTS_ACTIVE_SHEET_NAME + '!A2:Q') + ':clear';
  await fetch(clearUrl, {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + _driveToken, 'Content-Type': 'application/json'},
    body: '{}'
  });
  if (!rows.length) return;
  var setUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(PROJECTS_ACTIVE_SHEET_NAME + '!A2:Q' + (rows.length + 1)) + '?valueInputOption=USER_ENTERED';
  var resp = await fetch(setUrl, {
    method: 'PUT',
    headers: {'Authorization': 'Bearer ' + _driveToken, 'Content-Type': 'application/json'},
    body: JSON.stringify({values: rows})
  });
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return {}; });
    throw new Error('Активные: ' + (err.error && err.error.message ? err.error.message : resp.status + ' ' + resp.statusText));
  }
}
function syncProjectToActiveSheet(projectId, reason) {
  // Prevent immediate pull from overwriting just-edited local state
  // while sheet write is still in flight.
  _projectsSheetPullPauseUntil = Date.now() + 10000;
  syncActiveProjectsSheetExact(reason || 'sync').catch(function(e){ console.warn('Active sheet sync failed:', e); });
}
function getSelectedProject() {
  if (!_selectedProjectId) return null;
  var data = loadProjectsData();
  return data.projects.find(function(x){ return x.id === _selectedProjectId; }) || null;
}
function fillClientForm(c) {
  if (c.categoryFolderId && typeof setCrmCategorySelectValue === 'function') setCrmCategorySelectValue(c.categoryFolderId);
  document.getElementById('company').value = c.company || '';
  document.getElementById('contact_name').value = c.contact_name || '';
  document.getElementById('phone').value = c.phone || '';
  document.getElementById('tg').value = c.telegram || '';
  document.getElementById('avito_account').value = c.avito_account || '';
  document.getElementById('category').value = c.category || '';
  document.getElementById('city').value = c.city || '';
  if (typeof syncGeoFromValue === 'function') syncGeoFromValue();
  document.getElementById('notes').value = c.notes || '';
  document.getElementById('kp_count').value = c.kp_count || '';
  if (typeof syncKpFromValue === 'function') syncKpFromValue();
  document.getElementById('client_type').value = c.client_type || '';
  document.querySelectorAll('.ctype-btn').forEach(function(b) {
    b.classList.toggle('on', b.textContent.trim() === (c.client_type || ''));
  });
  var list = document.getElementById('posList');
  if (list) {
    list.innerHTML = '';
    var pos = c.positions;
    var arr = Array.isArray(pos) ? pos : (typeof pos === 'string' && pos ? pos.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : []);
    (arr || []).forEach(function(p) {
      var row = document.createElement('div');
      row.className = 'pos-row';
      row.innerHTML = '<input type="text" value="' + (p || '').replace(/"/g, '&quot;') + '" class="pname"><button type="button" class="btn-x" onclick="removePos(this)">×</button>';
      list.appendChild(row);
    });
    if (arr.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'pos-row';
      empty.innerHTML = '<input type="text" placeholder="Доска обрезная 50х100" class="pname"><button type="button" class="btn-x" onclick="removePos(this)">×</button>';
      list.appendChild(empty);
    }
  }
}
window.fillClientFormFromGoal = function(goalData) {
  if (!goalData) return;
  var folderId = '';
  if (goalData.folderLink) {
    var m = String(goalData.folderLink).match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) folderId = m[1];
  }
  var c = {
    company: goalData.company || goalData.name || '',
    contact_name: goalData.name || goalData.company || '',
    phone: goalData.phone || '',
    category: goalData.category || '',
    city: goalData.city || '',
    notes: goalData.notes || '',
    kp_count: goalData.kp_count || '',
    positions: goalData.positions || '',
    categoryFolderId: goalData.categoryFolderId || '',
    folderId: folderId,
    folderLink: goalData.folderLink || ''
  };
  fillClientForm(c);
  if (folderId || goalData.folderLink) {
    setActiveClient({ folderId: folderId, folderLink: goalData.folderLink || '', company: c.company || 'Цель' });
  }
  if (folderId && typeof setCrmCategoryByFolderId === 'function') setCrmCategoryByFolderId(folderId);
};

function clearClientForm() {
  ['company','contact_name','phone','tg','avito_account','category','city','notes','kp_count'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof syncGeoFromValue === 'function') syncGeoFromValue();
  document.getElementById('client_type').value = '';
  document.querySelectorAll('.ctype-btn').forEach(function(b) { b.classList.remove('on'); });
}
function findClientForProject(project) {
  var clients = getCrmClients();
  if (!project || !clients.length) return null;
  // Только строгое совпадение по crmClientId или folderId (явная привязка через дискету)
  if (project.crmClientId) {
    var byId = clients.find(function(c){ return c.client_id === project.crmClientId; });
    if (byId) return byId;
  }
  if (project.folderId) {
    var byFolder = clients.find(function(c){ return String(c.folderId || '') === String(project.folderId || ''); });
    if (byFolder) return byFolder;
  }
  return null;
}
function hasProjectCrmData(project) {
  if (!project || !project.crmData) return false;
  var d = project.crmData;
  return !!(d.company || d.contact_name || d.phone || d.telegram || d.avito_account || d.category || d.city || d.notes || d.kp_count || d.client_type);
}
function getProjectPreferredFolder(project) {
  var p = project || {};
  var d = p.crmData || {};
  return {
    folderId: p.folderId || d.folderId || '',
    folderLink: p.folderLink || d.folderLink || ''
  };
}
function makeProjectCrmSnapshot(d) {
  return {
    client_id: d.client_id || '',
    company: d.company || '',
    contact_name: d.contact_name || '',
    phone: d.phone || '',
    telegram: d.telegram || '',
    avito_account: d.avito_account || '',
    client_type: d.client_type || '',
    category: d.category || '',
    city: d.city || '',
    notes: d.notes || '',
    kp_count: d.kp_count || '',
    positions: d.positions || '',
    categoryFolderId: d.categoryFolderId || '',
    folderId: d.folderId || '',
    folderLink: d.folderLink || '',
    folder_name: d.folder_name || ''
  };
}
function markProjectRowSelection(projectId) {
  document.querySelectorAll('.projects-table-row[data-id]').forEach(function(row) {
    row.classList.toggle('selected', row.getAttribute('data-id') === projectId);
  });
}
function showClientQuestionState(project) {
  var badge = document.getElementById('clientBadge');
  var nameEl = document.getElementById('clientBadgeName');
  var st = document.getElementById('crmSt');
  if (badge && nameEl) {
    badge.style.display = 'inline-flex';
    badge.className = 'badge err';
    nameEl.textContent = '?';
  }
  if (st) {
    st.style.display = 'block';
    st.className = 'crm-st err';
    st.textContent = 'Нет данных по проекту: ' + (project && project.title ? project.title : '');
  }
}
function selectProjectRow(projectId) {
  if (typeof loadProjectsData === 'function') {
    var data = loadProjectsData();
    var p = (data.projects || []).find(function(x){ return x.id === projectId; });
    if (p && p._newFromGoals) {
      delete p._newFromGoals;
      saveProjectsData(data);
      if (projectsMode && typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
    }
  }
  _selectedProjectId = projectId;
  markProjectRowSelection(projectId);
  if (projectsMode && typeof openTaskPanel === 'function') openTaskPanel(projectId);
  var p = getSelectedProject();
  if (!p) return;
  var folderIdForCat = (p.folderId || (p.crmData && p.crmData.folderId) || '');
  if (p.categoryFolderId) setCrmCategorySelectValue(p.categoryFolderId);
  else if (folderIdForCat) setCrmCategoryByFolderId(folderIdForCat, function(parentId) {
    var pd = loadProjectsData();
    var sp = pd.projects.find(function(x){ return x.id === p.id; });
    if (sp && !sp.categoryFolderId) { sp.categoryFolderId = parentId; saveProjectsData(pd); rerenderProjectsPreserveScroll(); }
  });
  if (hasProjectCrmData(p)) {
    var prefFolder = getProjectPreferredFolder(p);
    var mergedCrm = Object.assign({}, p.crmData || {});
    mergedCrm.folderId = prefFolder.folderId;
    mergedCrm.folderLink = prefFolder.folderLink;
    mergedCrm.categoryFolderId = mergedCrm.categoryFolderId || p.categoryFolderId;
    fillClientForm(mergedCrm);
    setActiveClient({
      client_id: mergedCrm.client_id || p.crmClientId || '',
      folderId: prefFolder.folderId,
      folderLink: prefFolder.folderLink,
      company: mergedCrm.company || p.title || 'Клиент'
    });
    return;
  }
  var found = findClientForProject(p);
  if (found) {
    var fFolderId = (found.folderId || getProjectPreferredFolder(p).folderId || '');
    if (fFolderId && !folderIdForCat && !p.categoryFolderId) setCrmCategoryByFolderId(fFolderId);
    fillClientForm(found);
    var foundWithProjectFolder = Object.assign({}, found);
    var prefFolderFound = getProjectPreferredFolder(p);
    foundWithProjectFolder.folderId = prefFolderFound.folderId || '';
    foundWithProjectFolder.folderLink = prefFolderFound.folderLink || '';
    setActiveClient(foundWithProjectFolder);
  } else {
    clearClientForm();
    if (p.folderId || p.folderLink) {
      // Keep folder binding visible even if CRM card is not yet saved locally.
      setActiveClient({
        client_id: p.crmClientId || '',
        folderId: p.folderId || '',
        folderLink: p.folderLink || '',
        company: p.title || 'Клиент'
      });
      var st = document.getElementById('crmSt');
      if (st) {
        st.style.display = 'block';
        st.className = 'crm-st err';
        st.textContent = 'Папка привязана, но карточка клиента не найдена локально. Нажмите "Сохранить".';
      }
    } else {
      _activeClient = null;
      localStorage.removeItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_active_client') : 'avitolog_active_client'));
      showClientQuestionState(p);
    }
  }
}
function startProjectFolderBind(projectId, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  _projectFolderBindTargetId = projectId;
  var st = document.getElementById('crmSt');
  if (st) {
    st.style.display = 'block';
    st.className = 'crm-st';
    st.textContent = 'Выберите папку CRM для привязки к проекту...';
  }
  toggleClientMenu();
}
function addDaysISO(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toIsoDateLocal(d);
}
function normalizeIsoDateInput(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    m = s.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
    if (m) s = m[3] + '-' + m[2] + '-' + m[1];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  var parts = s.split('-');
  var y = parseInt(parts[0], 10);
  var mo = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return '';
  var dt = new Date(y, mo - 1, d);
  if (isNaN(dt.getTime())) return '';
  if (dt.getFullYear() !== y || (dt.getMonth() + 1) !== mo || dt.getDate() !== d) return '';
  return s;
}
function showProjectsMiniPrompt(opts) {
  opts = opts || {};
  var existing = document.getElementById('projectsMiniPrompt');
  if (existing) existing.remove();
  var wrap = document.createElement('div');
  wrap.id = 'projectsMiniPrompt';
  wrap.className = 'projects-mini-prompt';
  wrap.innerHTML =
    '<div class="mini-title">' + (opts.title || 'Введите значение') + '</div>' +
    '<input type="text" class="mini-input" id="projectsMiniInput" value="' + escAttr(opts.value || '') + '">' +
    '<div class="mini-row">' +
      '<button type="button" class="mini-btn" id="projectsMiniCancel">Отмена</button>' +
      '<button type="button" class="mini-btn ok" id="projectsMiniOk">OK</button>' +
    '</div>';
  document.body.appendChild(wrap);
  var vw = window.innerWidth, vh = window.innerHeight;
  var x = typeof opts.x === 'number' ? opts.x : 20;
  var y = typeof opts.y === 'number' ? opts.y : 20;
  var r = wrap.getBoundingClientRect();
  wrap.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
  wrap.style.top = Math.max(8, Math.min(y, vh - r.height - 8)) + 'px';
  var inp = document.getElementById('projectsMiniInput');
  if (inp) {
    inp.focus();
    inp.select();
    inp.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        var ok = document.getElementById('projectsMiniOk');
        if (ok) ok.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        wrap.remove();
      }
    });
  }
  var cancel = document.getElementById('projectsMiniCancel');
  if (cancel) cancel.onclick = function(){ wrap.remove(); };
  var okBtn = document.getElementById('projectsMiniOk');
  if (okBtn) okBtn.onclick = function(){
    var val = inp ? inp.value : '';
    if (typeof opts.onSubmit === 'function') opts.onSubmit(val, wrap);
  };
}
function hideProjectsCalMenu() {
  var m = document.getElementById('projectsCalMenu');
  if (m) m.remove();
  if (window._projectsCalMenuOutsideHandler) {
    document.removeEventListener('pointerdown', window._projectsCalMenuOutsideHandler, true);
    window._projectsCalMenuOutsideHandler = null;
  }
}
function showProjectsCalMenu(x, y, projectId, dateStr, childLineIndex) {
  hideProjectsCalMenu();
  _calendarCtx.projectId = projectId;
  _calendarCtx.date = dateStr;
  _calendarCtx.childLineIndex = childLineIndex != null ? parseInt(childLineIndex, 10) : -1;
  var menu = document.createElement('div');
  menu.id = 'projectsCalMenu';
  menu.className = 'projects-cal-menu';
  menu.innerHTML =
    '<div class="menu-item has-sub" data-action="launch-mode">🚀 Запуск <span>▶</span>' +
      '<div class="menu-sub">' +
        [3,4,5,7,10,12,14].map(function(n){
          return '<div class="menu-item" data-action="launch-days" data-days="' + n + '">через ' + n + ' дн.</div>';
        }).join('') +
        '<div class="menu-item" data-action="launch-days-custom">✏️ Свой срок…</div>' +
      '</div>' +
    '</div>' +
    '<div class="menu-item has-sub" data-action="autoload-menu">🅰️ Автозагрузка <span>▶</span>' +
      '<div class="menu-sub">' +
        '<div class="menu-item" data-action="autoload-until-cell">✓ До этой даты</div>' +
        [3,4,5,7,10,12,14].map(function(n){
          return '<div class="menu-item" data-action="autoload-days" data-days="' + n + '">до + ' + n + ' дн.</div>';
        }).join('') +
        '<div class="menu-item" data-action="autoload-date">📅 Указать дату…</div>' +
        '<div class="menu-item" data-action="autoload-clear">🗑 Очистить автозагрузку</div>' +
      '</div>' +
    '</div>' +
    '<div class="menu-item" data-action="must-launch">‼️ Должен быть запущен</div>' +
    '<div class="menu-item" data-action="cards-active">🃏 Актив карточек</div>' +
    '<div class="menu-item" data-action="launch-paint">✍️ Режим закраски запуска</div>' +
    '<div class="menu-item" data-action="launch-clear">🗑 Очистить запуск</div>';
  document.body.appendChild(menu);
  var vw = window.innerWidth, vh = window.innerHeight;
  var r = menu.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(x, vw - r.width - 6)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, vh - r.height - 6)) + 'px';
  window._projectsCalMenuOutsideHandler = function(ev) {
    var mm = document.getElementById('projectsCalMenu');
    if (!mm) return;
    var isLeftMouse = ev && ev.pointerType === 'mouse' ? ev.button === 0 : true;
    if (!isLeftMouse) return;
    if (mm.contains(ev.target)) return;
    hideProjectsCalMenu();
  };
  document.addEventListener('pointerdown', window._projectsCalMenuOutsideHandler, true);
  menu.onclick = function(e) {
    var item = e.target.closest('.menu-item[data-action]');
    if (!item) return;
    var action = item.getAttribute('data-action');
    var pid = _calendarCtx.projectId;
    var dt = _calendarCtx.date;
    var clIdx = (_calendarCtx.childLineIndex != null ? _calendarCtx.childLineIndex : -1);
    if (!pid || !dt) return;
    if (action === 'launch-mode' || action === 'autoload-menu') {
      var host = item.classList.contains('has-sub') ? item : item.closest('.has-sub');
      if (host) {
        menu.querySelectorAll('.has-sub').forEach(function(h){
          if (h !== host) h.classList.remove('open');
        });
        host.classList.toggle('open');
      }
      return;
    } else if (action === 'launch-days') {
      var n = parseInt(item.getAttribute('data-days') || '0', 10);
      applyProjectLaunchRange(pid, dt, addDaysISO(dt, Math.max(0, n)), clIdx);
      hideProjectsCalMenu();
    } else if (action === 'launch-days-custom') {
      var menuRectCustom = menu.getBoundingClientRect();
      showProjectsMiniPrompt({
        title: 'Через сколько дней запуск?',
        value: '',
        x: menuRectCustom.right + 6,
        y: menuRectCustom.top + 2,
        onSubmit: function(val, promptEl) {
          var raw = String(val || '').trim();
          var nCustom = parseInt(raw.replace(/[^\d]/g, ''), 10);
          if (!isFinite(nCustom) || nCustom < 0) {
            alert('Введите число дней. Например: 9');
            return;
          }
          applyProjectLaunchRange(pid, dt, addDaysISO(dt, nCustom), clIdx);
          if (promptEl) promptEl.remove();
          hideProjectsCalMenu();
        }
      });
    } else if (action === 'autoload-until-cell') {
      var todayIso = typeof getTodayISO === 'function' ? getTodayISO() : new Date().toISOString().slice(0, 10);
      applyProjectAutoloadRangeForRow(pid, clIdx >= 0 ? clIdx : -1, todayIso, dt);
      hideProjectsCalMenu();
    } else if (action === 'autoload-days') {
      var na = parseInt(item.getAttribute('data-days') || '0', 10);
      var todayIso = typeof getTodayISO === 'function' ? getTodayISO() : new Date().toISOString().slice(0, 10);
      applyProjectAutoloadRangeForRow(pid, clIdx >= 0 ? clIdx : -1, todayIso, addDaysISO(todayIso, Math.max(0, na)));
      hideProjectsCalMenu();
    } else if (action === 'autoload-date') {
      var menuRect = menu.getBoundingClientRect();
      showProjectsMiniPrompt({
        title: 'Дата до (ГГГГ-ММ-ДД)',
        value: dt,
        x: menuRect.right + 6,
        y: menuRect.top + 2,
        onSubmit: function(val, promptEl) {
          var v = normalizeIsoDateInput(val);
          if (!v) {
            alert('Неверный формат даты. Пример: 2026-03-15 или 15.03.2026');
            return;
          }
          var todayIso = typeof getTodayISO === 'function' ? getTodayISO() : new Date().toISOString().slice(0, 10);
          applyProjectAutoloadRangeForRow(pid, clIdx >= 0 ? clIdx : -1, todayIso, v);
          if (promptEl) promptEl.remove();
          hideProjectsCalMenu();
        }
      });
    } else if (action === 'autoload-clear') {
      clearProjectAutoloadForRow(pid, clIdx >= 0 ? clIdx : -1);
      hideProjectsCalMenu();
    } else if (action === 'cards-active') {
      var existingCards = '';
      try {
        var pdCards = loadProjectsData();
        var ppCards = (pdCards.projects || []).find(function(x){ return x.id === pid; });
        existingCards = ppCards && ppCards.cardsActive ? String(ppCards.cardsActive) : '';
      } catch(ex) {}
      var menuRect = menu.getBoundingClientRect();
      showProjectsMiniPrompt({
        title: 'Актив карточек (число)',
        value: existingCards || '1',
        x: menuRect.right + 6,
        y: menuRect.top,
        onSubmit: function(val, promptEl) {
          var v = String(val || '').trim();
          if (v) startCardsActivePlacement(v);
          if (promptEl) promptEl.remove();
        }
      });
      hideProjectsCalMenu();
    } else if (action === 'must-launch') {
      startMustLaunchPlacement();
      hideProjectsCalMenu();
    } else if (action === 'launch-paint') {
      _calendarPaintMode = 'launch';
      document.body.classList.add('calendar-launch-mode');
      document.body.classList.remove('calendar-erase-mode');
      hideProjectsCalMenu();
    } else if (action === 'launch-clear') {
      clearProjectLaunch(pid, clIdx);
      hideProjectsCalMenu();
    }
  };
}
function applyProjectLaunchRange(projectId, startDate, endDate, childLineIndex) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  var s = startDate <= endDate ? startDate : endDate;
  var e = startDate <= endDate ? endDate : startDate;
  var clIdx = (childLineIndex != null && childLineIndex >= 0) ? childLineIndex : -1;
  var targetEvents = (clIdx >= 0) ? (ensureChildLineEvents(p), (p.childLineEvents || [])[clIdx] || (p.childLineEvents[clIdx] = [])) : (p.events || []);
  targetEvents = targetEvents.filter(function(ev) {
    return ev.type !== 'launch_range' && ev.type !== 'not_launched_project_marker';
  });
  targetEvents.push({type:'launch_range', startDate:s, endDate:e});
  targetEvents.push({type:'not_launched_project_marker', date:e});
  if (clIdx >= 0) {
    ensureChildLineEvents(p);
    p.childLineEvents[clIdx] = targetEvents;
  } else {
    p.events = targetEvents;
  }
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'launch_range_set');
}
function clearProjectLaunch(projectId, childLineIndex) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  var clIdx = (childLineIndex != null && childLineIndex >= 0) ? childLineIndex : -1;
  if (clIdx >= 0) {
    ensureChildLineEvents(p);
    var arr = (p.childLineEvents || [])[clIdx];
    if (Array.isArray(arr)) {
      p.childLineEvents[clIdx] = arr.filter(function(ev) {
        return ev.type !== 'launch_range' && ev.type !== 'not_launched_project_marker';
      });
    }
  } else {
    p.events = (p.events || []).filter(function(ev) {
      return ev.type !== 'launch_range' && ev.type !== 'not_launched_project_marker';
    });
  }
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'launch_range_clear');
}
function clearProjectLaunchRange(projectId, startDate, endDate, childLineIndex) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  var s = startDate <= endDate ? startDate : endDate;
  var e = startDate <= endDate ? endDate : startDate;
  var clIdx = (childLineIndex != null && childLineIndex >= 0) ? childLineIndex : -1;
  var targetEvents = (clIdx >= 0) ? ((ensureChildLineEvents(p), p.childLineEvents || [])[clIdx] || []) : (p.events || []);
  var launchRanges = targetEvents.filter(function(ev){ return ev && ev.type === 'launch_range'; });
  if (!launchRanges.length) return;
  var nextRanges = [];
  launchRanges.forEach(function(rg){
    var rs = String(rg.startDate || '');
    var re = String(rg.endDate || '');
    if (!rs || !re) return;
    if (re < s || rs > e) {
      nextRanges.push({type:'launch_range', startDate:rs, endDate:re});
      return;
    }
    if (rs < s) {
      nextRanges.push({type:'launch_range', startDate:rs, endDate:addDaysISO(s, -1)});
    }
    if (re > e) {
      nextRanges.push({type:'launch_range', startDate:addDaysISO(e, 1), endDate:re});
    }
  });
  targetEvents = targetEvents.filter(function(ev){
    return ev.type !== 'launch_range' && ev.type !== 'not_launched_project_marker';
  });
  nextRanges.forEach(function(rg){
    targetEvents.push(rg);
    targetEvents.push({type:'not_launched_project_marker', date:rg.endDate});
  });
  if (clIdx >= 0) {
    ensureChildLineEvents(p);
    p.childLineEvents[clIdx] = targetEvents;
  } else {
    p.events = targetEvents;
  }
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'launch_range_partial_clear');
}
function applyProjectAutoloadRange(projectId, startDate, endDate) {
  applyProjectAutoloadRangeForRow(projectId, -1, startDate, endDate);
}
function applyProjectAutoloadRangeForRow(projectId, childLineIdx, startDate, endDate) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  var s = startDate <= endDate ? startDate : endDate;
  var e = startDate <= endDate ? endDate : startDate;
  var todayIso = getTodayISO();
  if (childLineIdx >= 0) {
    ensureChildLineEvents(p);
    var evts = p.childLineEvents[childLineIdx] || [];
    evts = evts.filter(function(ev){ return ev.type !== 'active_range'; });
    evts.push({type:'active_range', startDate:s, endDate:e});
    p.childLineEvents[childLineIdx] = evts;
  } else {
    p.events = (p.events || []).filter(function(ev) { return ev.type !== 'active_range'; });
    p.events.push({type:'active_range', startDate:s, endDate:e});
    if (p.mustLaunchRequired && e > todayIso) {
      p.mustLaunchRequired = false;
      _projectMustLaunchDetachArmedId = null;
    }
  }
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'autoload_range_set');
}
function clearProjectAutoload(projectId) {
  clearProjectAutoloadForRow(projectId, -1);
}
function clearProjectAutoloadForRow(projectId, childLineIdx) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  if (childLineIdx >= 0) {
    ensureChildLineEvents(p);
    var evts = (p.childLineEvents[childLineIdx] || []).filter(function(ev){ return ev.type !== 'active_range'; });
    p.childLineEvents[childLineIdx] = evts;
  } else {
    p.events = (p.events || []).filter(function(ev) { return ev.type !== 'active_range'; });
  }
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'autoload_range_clear');
}
function clearProjectAutoloadRangeForRow(projectId, childLineIdx, startDate, endDate) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p) return;
  var s = startDate <= endDate ? startDate : endDate;
  var e = startDate <= endDate ? endDate : startDate;
  var clIdx = (childLineIdx != null && childLineIdx >= 0) ? childLineIdx : -1;
  var targetEvents = (clIdx >= 0) ? ((ensureChildLineEvents(p), p.childLineEvents || [])[clIdx] || []) : (p.events || []);
  var activeRanges = targetEvents.filter(function(ev){ return ev && ev.type === 'active_range'; });
  if (!activeRanges.length) return;
  var nextRanges = [];
  activeRanges.forEach(function(rg){
    var rs = String(rg.startDate || '');
    var re = String(rg.endDate || '');
    if (!rs || !re) return;
    if (re < s || rs > e) { nextRanges.push({type:'active_range', startDate:rs, endDate:re}); return; }
    if (rs < s) nextRanges.push({type:'active_range', startDate:rs, endDate:addDaysISO(s, -1)});
    if (re > e) nextRanges.push({type:'active_range', startDate:addDaysISO(e, 1), endDate:re});
  });
  targetEvents = targetEvents.filter(function(ev){ return ev.type !== 'active_range'; });
  nextRanges.forEach(function(rg){ targetEvents.push(rg); });
  if (clIdx >= 0) { ensureChildLineEvents(p); p.childLineEvents[clIdx] = targetEvents; }
  else p.events = targetEvents;
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'autoload_range_partial_clear');
}
function getCalendarCellFromEventTarget(t) {
  return t && t.closest ? t.closest('.projects-cal-day[data-project-id][data-date]') : null;
}
function getCalendarCellAtPoint(clientX, clientY) {
  var ghost = document.getElementById('cardsActiveGhost') || document.getElementById('mustLaunchGhost');
  var wasHidden = false;
  if (ghost && ghost.style) { ghost.style.visibility = 'hidden'; wasHidden = true; }
  var el = document.elementFromPoint(clientX, clientY);
  if (wasHidden && ghost) ghost.style.visibility = '';
  return el && el.closest ? el.closest('.projects-cal-day[data-project-id][data-date]') : null;
}
function previewLaunchDates(dates) {
  document.querySelectorAll('.projects-cal-day.cal-launch-preview, .projects-cal-day.cal-launch-preview-last').forEach(function(el) {
    el.classList.remove('cal-launch-preview', 'cal-launch-preview-last');
  });
  var clIdx = (_calendarPaintChildLineIndex != null && _calendarPaintChildLineIndex >= 0) ? String(_calendarPaintChildLineIndex) : '-1';
  dates.forEach(function(d, idx) {
    var sel = '.projects-cal-day[data-project-id="' + _calendarPaintProjectId + '"][data-child-line-index="' + clIdx + '"][data-date="' + d + '"]';
    var cell = document.querySelector(sel);
    if (!cell) return;
    cell.classList.add('cal-launch-preview');
    if (idx === dates.length - 1) cell.classList.add('cal-launch-preview-last');
  });
}
function dateRangeFromPaint(dates) {
  if (!dates || !dates.length) return null;
  var uniq = Array.from(new Set(dates)).sort();
  return {start: uniq[0], end: uniq[uniq.length - 1], ordered: uniq};
}
function bindProjectsCalendarInteractions() {
  var wrap = document.querySelector('.projects-table-wrap');
  var board = document.querySelector('.projects-board');
  if (!wrap) return;
  function onProjectsZoomWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    var cur = getSavedProjectsZoom();
    var delta = e.deltaY > 0 ? -0.05 : 0.05;
    var next = Math.max(0.25, Math.min(2, cur + delta));
    if (Math.abs(next - cur) > 0.01) saveProjectsZoom(next);
  }
  if (board) board.addEventListener('wheel', onProjectsZoomWheel, { passive: false });
  wrap.onmousedown = function(e) {
    if (e.button !== 0) return;
    var cell = getCalendarCellFromEventTarget(e.target);
    if (!cell) return;
    var pid = cell.getAttribute('data-project-id');
    if (_mustLaunchPlacement) {
      e.preventDefault();
      e.stopPropagation();
      var dt = cell.getAttribute('data-date');
      if (pid && dt) { setProjectMustLaunchWithDate(pid, true, dt); cancelMustLaunchPlacement(); }
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.cal-cards') && !e.target.closest('.cal-cards-del')) {
      e.preventDefault();
      e.stopPropagation();
      startCardsActiveDrag(pid, cell.getAttribute('data-date'));
      return;
    }
    if (_calendarPaintMode === 'launch') {
      e.preventDefault();
      _calendarPainting = true;
      _calendarPaintErase = false;
      _calendarPaintProjectId = pid;
      var clAttr = cell.getAttribute('data-child-line-index');
      _calendarPaintChildLineIndex = (clAttr != null && clAttr !== '') ? parseInt(clAttr, 10) : -1;
      _calendarPaintDates = [cell.getAttribute('data-date')];
      document.body.classList.remove('calendar-erase-mode');
      previewLaunchDates(_calendarPaintDates);
    }
  };
  wrap.onclick = function(e) {
    var cell = getCalendarCellFromEventTarget(e.target);
    if (!cell) return;
    var pid = cell.getAttribute('data-project-id');
    if (!e.target.closest('.cal-cards-del') && !e.target.closest('.cal-deadline-del') && !e.target.closest('.cal-task-item') && pid && typeof openTaskPanel === 'function' && typeof selectProjectRow === 'function') {
      var dt = cell.getAttribute('data-date');
      var clAttr = cell.getAttribute('data-child-line-index');
      var childLineIdx = (clAttr != null && clAttr !== '') ? parseInt(clAttr, 10) : null;
      _selectedCalCell = dt ? { projectId: pid, dateStr: dt, childLineIdx: childLineIdx } : null;
      _selectedProjectId = pid;
      markProjectRowSelection(pid);
      openTaskPanel(pid);
      if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
    }
    if (e.target && e.target.closest && e.target.closest('.cal-cards-del')) {
      e.preventDefault();
      e.stopPropagation();
      removeProjectCardsActive(pid);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.cal-cards-num')) {
      e.preventDefault();
      e.stopPropagation();
      var cell = e.target.closest('.projects-cal-day');
      var numSpan = e.target.closest('.cal-cards-num');
      var cpid = cell && cell.getAttribute('data-project-id');
      var cdt = cell && cell.getAttribute('data-date');
      if (cpid && cdt && numSpan) startCardsNumInlineEdit(cpid, cdt, numSpan);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.cal-cards')) {
      e.preventDefault();
      e.stopPropagation();
      toggleProjectCardsBadge(pid);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.cal-deadline-del')) {
      e.preventDefault();
      e.stopPropagation();
      removeProjectMustLaunchRequired(pid);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('.cal-deadline')) {
      e.preventDefault();
      e.stopPropagation();
      toggleProjectMustLaunchBadge(pid);
      return;
    }
    if (_projectJokerDetachArmedId || _projectMustLaunchDetachArmedId) {
      _projectJokerDetachArmedId = null;
      _projectMustLaunchDetachArmedId = null;
      rerenderProjectsPreserveScroll();
    }
  };
  wrap.oncontextmenu = function(e) {
    var cell = getCalendarCellAtPoint(e.clientX, e.clientY) || getCalendarCellFromEventTarget(e.target);
    if (!cell) return;
    if (_calendarPaintMode === 'launch') {
      e.preventDefault();
      _calendarPainting = true;
      _calendarPaintErase = true;
      _calendarPaintProjectId = cell.getAttribute('data-project-id');
      var clAttr = cell.getAttribute('data-child-line-index');
      _calendarPaintChildLineIndex = (clAttr != null && clAttr !== '') ? parseInt(clAttr, 10) : -1;
      _calendarPaintDates = [cell.getAttribute('data-date')];
      document.body.classList.add('calendar-erase-mode');
      previewLaunchDates(_calendarPaintDates);
      return;
    }
    e.preventDefault();
    showProjectsCalMenu(e.clientX, e.clientY, cell.getAttribute('data-project-id'), cell.getAttribute('data-date'), cell.getAttribute('data-child-line-index'));
  };
  wrap.onmouseout = function(e) {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cal-task-item')) return;
    hideCalTaskHoverPreview();
  };
  wrap.onmouseover = function(e) {
    var taskItem = e.target && e.target.closest ? e.target.closest('.cal-task-item') : null;
    if (taskItem) {
      var pid = (taskItem.closest('.projects-cal-day') || {}).getAttribute ? (taskItem.closest('.projects-cal-day') || {}).getAttribute('data-project-id') : null;
      var tid = taskItem.getAttribute('data-task-id');
      var title = taskItem.getAttribute('data-task-title') || 'Задача';
      showCalTaskHoverPreview(tid, title, pid);
      return;
    }
    hideCalTaskHoverPreview();
    if (!_calendarPainting || _calendarPaintMode !== 'launch') return;
    var cell = getCalendarCellFromEventTarget(e.target);
    if (!cell) return;
    var pid = cell.getAttribute('data-project-id');
    if (pid !== _calendarPaintProjectId) return;
    var clAttr = cell.getAttribute('data-child-line-index');
    var cellClIdx = (clAttr != null && clAttr !== '') ? parseInt(clAttr, 10) : -1;
    if (cellClIdx !== _calendarPaintChildLineIndex) return;
    var d = cell.getAttribute('data-date');
    _calendarPaintDates.push(d);
    var range = dateRangeFromPaint(_calendarPaintDates);
    if (range) previewLaunchDates(range.ordered);
  };

  var scrollBackBtn = document.getElementById('projectsScrollBackBtn');
  if (scrollBackBtn) {
    var scrollBackTid = null;
    var scrollBackStep = 24;
    var scrollBackInterval = 50;
    var sliderMousedownAt = 0;
    function startScrollBack() {
      if (scrollBackTid) return;
      scrollBackBtn.classList.add('scrolling');
      scrollBackTid = setInterval(function() {
        if (!wrap || !wrap.parentNode) { stopScrollBack(); return; }
        wrap.scrollLeft = Math.max(0, wrap.scrollLeft - scrollBackStep);
      }, scrollBackInterval);
    }
    function stopScrollBack() {
      if (scrollBackTid) { clearInterval(scrollBackTid); scrollBackTid = null; }
      scrollBackBtn.classList.remove('scrolling');
    }
    scrollBackBtn.onmousedown = function(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      sliderMousedownAt = Date.now();
      startScrollBack();
    };
    scrollBackBtn.onmouseup = function(e) {
      var wasQuick = (Date.now() - sliderMousedownAt) < 180;
      stopScrollBack();
      if (wasQuick) scrollProjectsCalendarToToday();
    };
    scrollBackBtn.onmouseleave = stopScrollBack;
    scrollBackBtn.ondblclick = function(e) { e.preventDefault(); scrollProjectsCalendarToToday(); };
    document.addEventListener('mouseup', function up(e) {
      if (scrollBackTid) stopScrollBack();
      document.removeEventListener('mouseup', up);
    });
  }
  if (wrap) wrap.ondblclick = function() { scrollProjectsCalendarToToday(); };
}
function finishCalendarPaint() {
  if (!_calendarPainting || _calendarPaintMode !== 'launch') return;
  var projectId = _calendarPaintProjectId;
  var range = dateRangeFromPaint(_calendarPaintDates);
  var eraseMode = !!_calendarPaintErase;
  _calendarPainting = false;
  _calendarPaintErase = false;
  _calendarPaintProjectId = null;
  _calendarPaintDates = [];
  document.body.classList.remove('calendar-erase-mode');
  document.querySelectorAll('.projects-cal-day.cal-launch-preview, .projects-cal-day.cal-launch-preview-last').forEach(function(el) {
    el.classList.remove('cal-launch-preview', 'cal-launch-preview-last');
  });
  if (range && projectId) {
    var clIdx = (_calendarPaintChildLineIndex != null && _calendarPaintChildLineIndex >= 0) ? _calendarPaintChildLineIndex : -1;
    if (eraseMode) clearProjectLaunchRange(projectId, range.start, range.end, clIdx);
    else applyProjectLaunchRange(projectId, range.start, range.end, clIdx);
  }
  _calendarPaintChildLineIndex = -1;
}
function clearProjectDropMarks() {
  document.querySelectorAll('.projects-table-row.drop-before, .projects-table-row.drop-after').forEach(function(r) {
    r.classList.remove('drop-before', 'drop-after');
  });
}
function createProjectRowDragGhost(row) {
  if (!row) return null;
  var ghost = row.cloneNode(true);
  ghost.classList.remove('selected', 'dragging', 'drop-before', 'drop-after');
  ghost.classList.add('projects-drag-ghost');
  ghost.style.width = row.offsetWidth + 'px';
  ghost.style.height = row.offsetHeight + 'px';
  document.body.appendChild(ghost);
  return ghost;
}
function startProjectRowDrag(e, projectId) {
  if (_calendarPaintMode === 'launch') { e.preventDefault(); return; }
  if (e.target && e.target.closest && e.target.closest('.projects-cal-day[data-project-id]')) { e.preventDefault(); return; }
  // Allow dragging by the entire project row (except calendar cells).
  _dragProjectId = projectId;
  var row = e.currentTarget;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', projectId); } catch(err) {}
    var ghost = createProjectRowDragGhost(row);
    if (ghost && typeof e.dataTransfer.setDragImage === 'function') {
      var sticky = row ? row.querySelector('.projects-sticky') : null;
      var offsetX = sticky ? Math.min(20, Math.max(8, Math.floor(sticky.getBoundingClientRect().width * 0.08))) : 12;
      var offsetY = Math.max(8, Math.floor((row ? row.offsetHeight : 28) * 0.5));
      e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
      setTimeout(function(){ try { ghost.remove(); } catch(_e) {} }, 0);
    }
  }
  if (row) row.classList.add('dragging');
}
function handleProjectRowDragOver(e, row, targetProjectId) {
  if (!_dragProjectId || _dragProjectId === targetProjectId) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  clearProjectDropMarks();
  var rect = row.getBoundingClientRect();
  var placeAfter = (e.clientY - rect.top) > rect.height / 2;
  row.classList.add(placeAfter ? 'drop-after' : 'drop-before');
}
function handleProjectRowDragLeave(e, row) {
  if (!row) return;
  row.classList.remove('drop-before', 'drop-after');
}
function reorderProjectsWithinZone(sourceId, targetId, placeAfter) {
  var data = loadProjectsData();
  var src = data.projects.find(function(p){ return p.id === sourceId; });
  var tgt = data.projects.find(function(p){ return p.id === targetId; });
  if (!src || !tgt) return false;
  if ((src.zone || 'active') !== (tgt.zone || 'active')) return false;
  var zone = src.zone || 'active';
  var zoneList = data.projects
    .filter(function(p){ return (p.zone || 'active') === zone; })
    .sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });
  var ids = zoneList.map(function(p){ return p.id; });
  var fromIdx = ids.indexOf(sourceId);
  var targetIdx = ids.indexOf(targetId);
  if (fromIdx < 0 || targetIdx < 0) return false;
  var moving = ids.splice(fromIdx, 1)[0];
  var insertIdx = ids.indexOf(targetId) + (placeAfter ? 1 : 0);
  ids.splice(insertIdx, 0, moving);
  ids.forEach(function(id, idx) {
    var p = data.projects.find(function(x){ return x.id === id; });
    if (p) p.sortOrder = idx;
  });
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(sourceId, 'row_reorder');
  return true;
}
function handleProjectRowDrop(e, targetProjectId) {
  e.preventDefault();
  var row = e.currentTarget;
  var placeAfter = row && row.classList.contains('drop-after');
  clearProjectDropMarks();
  if (!_dragProjectId || _dragProjectId === targetProjectId) return;
  reorderProjectsWithinZone(_dragProjectId, targetProjectId, !!placeAfter);
}
function endProjectRowDrag(e) {
  if (e.currentTarget) e.currentTarget.classList.remove('dragging');
  _dragProjectId = null;
  clearProjectDropMarks();
}

function getDefaultProjectsData() {
  var today = new Date();
  var d = function(offset) { var x=new Date(today); x.setDate(x.getDate()+offset); return toIsoDateLocal(x); };
  var clients = [
    { emoji:'🌲', title:'Андрей Молл-Строй' }, { emoji:'🗄', title:'Дамир Казань MebelFan' }, { emoji:'🧱', title:'KuGa Термопанели' },
    { emoji:'🌲', title:'Иван ЦФО | НДС' }, { emoji:'🌲', title:'Иван Lumber Market 2' }, { emoji:'🛋', title:'Кирилл Кровати МСК' },
    { emoji:'🏠', title:'Воронеж Модуль Дом' }, { emoji:'⚙️', title:'Выкуп Авто' }, { emoji:'🛋', title:'Артем Лофт Мебель' },
    { emoji:'🛠', title:'Борис Кровля Рязань' }, { emoji:'🏠', title:'Дмитрий Каркасные / Бани' }, { emoji:'🏠', title:'Дмитрий Пермь Строй-услуги' },
    { emoji:'💨', title:'Вентиляция b2b Ильяс' }, { emoji:'📊', title:'Grind Trio Гибсокартон' }, { emoji:'🔥', title:'Маргарита Утеплители' },
    { emoji:'🏠', title:'Наталья Ваш-Дом газобетон' }, { emoji:'🏠', title:'Александры Крым Стройка' }, { emoji:'🪟', title:'Артем Окна' },
    { emoji:'🛠', title:'Владимир Полы' }, { emoji:'🏠', title:'Владислав Севастополь Дома' }, { emoji:'👷', title:'Строим Всё - Крым | Саша' },
    { emoji:'🌲', title:'Денис Анапа Ворота' }, { emoji:'💧', title:'Паколь МО и МСК' }, { emoji:'👷', title:'Роман Павильоны' },
    { emoji:'👷', title:'Сергей Ангары и Емкости' }, { emoji:'👷', title:'Артем Воронеж Стройка' }, { emoji:'👷', title:'Максим Воронеж Стройка' },
    { emoji:'¥', title:'Роман Китай' }, { emoji:'📐', title:'Евгений Стяжка' }, { emoji:'🐲', title:'Александр Сельхоз' },
    { emoji:'👩', title:'Ксения Сергеевна' }, { emoji:'⚡', title:'Электрик Крым Александр' }, { emoji:'🪨', title:'Денис Пеллеты и Камни' }
  ];
  var projects = clients.map(function(c,i){ return { id:'p'+(i+1), emoji:c.emoji, title:c.title, clientType:['old','new','returning'][i%3], zone:'active', status:'В работе', sortOrder:i, clientPath:{autoload:false,analytics:false,texts:false,packaging:false,portfolio:false}, events:[], childLines:[] }; });
  return { projects: projects, hiddenProjects: [], tasks: [] };
}

// ── TASK LAYER (first layer, overlay on projects) ──
var TASK_TYPES = { text:'Текст', image:'Картинки', send:'Отправка', approval:'Согласование', analytics:'Аналитика', other:'Другое' };
var TASK_STATUSES = { new:'Новая', working:'В работе', done:'Готово', waiting:'Ожидает', overdue:'Просрочено' };
var TASK_PRIORITIES = { normal:'Обычная', important:'Важная', urgent:'Срочная' };

var TASK_TYPE_EMOJIS = { text:'&#128221;', image:'&#128444;', send:'&#128230;', approval:'&#9989;', analytics:'&#128202;', other:'&#128204;' };
var TASK_TEMPLATES = {
  brief: { name:'Бриф', emoji:'&#128203;', tasks:['Получить бриф от клиента','Проверить заполнение брифа','Зафиксировать данные проекта','Подготовить ОС по брифу'] },
  os_brief: { name:'ОС по брифу', emoji:'&#128196;', tasks:['Анализ ответов клиента','Подготовить рекомендации','Подготовить стратегию запуска','Отправить ОС клиенту'] },
  texts: { name:'Тексты', emoji:'&#128221;', pickCount:[3,4,5] },
  infographic: { name:'Инфографика', emoji:'&#128202;', tasks:['Подготовить ТЗ инфографики','Создать инфографику','Проверить визуал','Согласовать инфографику'] },
  autoload: { name:'Автозагрузка', emoji:'&#128230;', tasks:['Подготовить Excel автозагрузки','Проверить структуру объявлений','Загрузить объявления','Проверить публикацию'] },
  design_ext: { name:'Дизайн аккаунта · Расширенный', emoji:'&#128396;', tasks:['Подготовить дизайн аккаунта','Добавить информацию в аккаунт','Добавить логотип аккаунта','Проверить оформление'] },
  design_max: { name:'Дизайн аккаунта · Максимальный', emoji:'&#128396;', tasks:['Подготовить дизайн аккаунта','Добавить информацию в аккаунт','Добавить логотип аккаунта','Проверить оформление'] },
  portfolio: { name:'Портфолио', emoji:'&#11088;', tasks:['Подготовить кейс','Подготовить скриншоты','Оформить портфолио','Добавить портфолио в аккаунт'] }
};

function addDaysToIso(isoStr, days) {
  if (!isoStr || isoStr.length < 10) return isoStr;
  var d = new Date(isoStr.slice(0,4) + '-' + isoStr.slice(5,7) + '-' + isoStr.slice(8,10));
  d.setDate(d.getDate() + (days || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function applyTaskTemplate(projectId, templateKey) {
  var tpl = TASK_TEMPLATES[templateKey];
  if (!tpl || !projectId) return;
  if (tpl.pickCount) {
    showTextsCountPicker(projectId, templateKey);
    return;
  }
  applyTaskTemplateInner(projectId, templateKey, tpl.tasks || [], tpl.emoji || '&#128221;');
}
function showTextsCountPicker(projectId, templateKey) {
  var existing = document.getElementById('taskTextsPickerModal');
  if (existing) existing.remove();
  var tpl = TASK_TEMPLATES[templateKey];
  var counts = tpl.pickCount || [3, 4, 5];
  var btns = counts.map(function(n){
    return '<button type="button" class="task-texts-count-btn" onclick="applyTextsTemplate(\'' + projectId + '\',' + n + ');closeTextsCountPicker();">' + n + '</button>';
  }).join('');
  var modal = document.createElement('div');
  modal.id = 'taskTextsPickerModal';
  modal.className = 'task-add-modal-overlay';
  modal.innerHTML = '<div class="task-add-modal" style="max-width:260px"><div class="task-add-modal-title">Тексты: сколько?</div><div class="task-texts-count-btns">' + btns + '</div><button type="button" class="btn-secondary" style="margin-top:12px;width:100%" onclick="closeTextsCountPicker()">Отмена</button></div>';
  modal.onclick = function(e){ if (e.target === modal) closeTextsCountPicker(); };
  document.body.appendChild(modal);
}
function applyTextsTemplate(projectId, count) {
  var tasks = [];
  for (var i = 1; i <= count; i++) tasks.push('Текст ' + i);
  applyTaskTemplateInner(projectId, 'texts', tasks, '&#128221;');
}
function closeTextsCountPicker() {
  var m = document.getElementById('taskTextsPickerModal');
  if (m) m.remove();
}
function showTaskTemplateContextMenu(e, projectId) {
  var existing = document.getElementById('taskContextMenu');
  if (existing) existing.remove();
  var menu = document.createElement('div');
  menu.id = 'taskContextMenu';
  menu.className = 'task-ctx-menu';
  var parts = [];
  var keys = Object.keys(TASK_TEMPLATES || {});
  keys.forEach(function(k){
    var t = TASK_TEMPLATES[k];
    if (!t) return;
    if (k === 'texts' && t.pickCount) return;
    var name = (t.name || k);
    parts.push('<div class="task-ctx-menu-item" data-action="full" data-key="' + escAttr(k) + '">&#128308; Вся ветка: ' + escAttr(name) + '</div>');
  });
  parts.push('<div class="task-ctx-menu-sep"></div>');
  parts.push('<div class="task-ctx-menu-item" data-action="partial">Выбрать конкретные задачи…</div>');
  menu.innerHTML = parts.join('');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  document.body.appendChild(menu);
  var close = function(){ var m = document.getElementById('taskContextMenu'); if (m) m.remove(); };
  menu.querySelectorAll('.task-ctx-menu-item').forEach(function(el){
    el.onclick = function(ev){
      ev.stopPropagation();
      var act = el.getAttribute('data-action');
      var key = el.getAttribute('data-key');
      close();
      if (act === 'full' && key) applyTaskTemplate(projectId, key);
      else if (act === 'partial') showTaskTemplatePartialModal(projectId);
    };
  });
  document.addEventListener('click', close, { once: true });
  document.addEventListener('contextmenu', close, { once: true });
}
function showTaskTemplatePartialModal(projectId) {
  var existing = document.getElementById('taskPartialModal');
  if (existing) existing.remove();
  var keys = Object.keys(TASK_TEMPLATES || {}).filter(function(k){
    var t = TASK_TEMPLATES[k];
    if (!t || !t.tasks) return false;
    return k !== 'texts' || !t.pickCount;
  });
  if (!keys.length) return;
  var sel = '<select id="taskPartialSelect" class="task-add-form" style="width:100%;margin-bottom:8px">';
  keys.forEach(function(k){ var t = TASK_TEMPLATES[k]; sel += '<option value="' + escAttr(k) + '">' + escAttr(t.name || k) + '</option>'; });
  sel += '</select>';
  var tpl = TASK_TEMPLATES[keys[0]];
  var taskList = (tpl.tasks || []).map(function(t, i){
    var title = typeof t === 'string' ? t : (t.title || t.name || 'Задача ' + (i+1));
    return '<label class="task-partial-row"><input type="checkbox" class="task-partial-cb" data-index="' + i + '" checked> ' + escAttr(title) + '</label>';
  }).join('');
  var modal = document.createElement('div');
  modal.id = 'taskPartialModal';
  modal.className = 'task-add-modal-overlay task-ctx-partial-modal';
  modal.innerHTML = '<div class="task-add-modal" style="max-width:380px"><div class="task-add-modal-title">Добавить выбранные задачи</div>' + sel + '<div class="task-partial-list">' + taskList + '</div><div class="task-add-actions"><button type="button" class="btn-secondary" onclick="closeTaskPartialModal()">Отмена</button><button type="button" class="btn-primary" onclick="applyTaskPartialSelection()">Добавить</button></div></div>';
  modal.onclick = function(e){ if (e.target === modal) closeTaskPartialModal(); };
  document.body.appendChild(modal);
  var selEl = document.getElementById('taskPartialSelect');
  if (selEl) {
    selEl.onchange = function(){
      var k = selEl.value;
      var t = TASK_TEMPLATES[k];
      var list = modal.querySelector('.task-partial-list');
      if (!list || !t || !t.tasks) return;
      list.innerHTML = (t.tasks || []).map(function(task, i){
        var title = typeof task === 'string' ? task : (task.title || task.name || 'Задача ' + (i+1));
        return '<label class="task-partial-row"><input type="checkbox" class="task-partial-cb" data-index="' + i + '" checked> ' + escAttr(title) + '</label>';
      }).join('');
    };
  }
  window._taskPartialProjectId = projectId;
}
function closeTaskPartialModal() {
  var m = document.getElementById('taskPartialModal');
  if (m) m.remove();
  window._taskPartialProjectId = null;
}
function applyTaskPartialSelection() {
  var projectId = window._taskPartialProjectId;
  var sel = document.getElementById('taskPartialSelect');
  var modal = document.getElementById('taskPartialModal');
  if (!projectId || !sel || !modal) { closeTaskPartialModal(); return; }
  var key = sel.value;
  var tpl = TASK_TEMPLATES[key];
  if (!tpl || !tpl.tasks) { closeTaskPartialModal(); return; }
  var checked = modal.querySelectorAll('.task-partial-cb:checked');
  var tasks = [];
  checked.forEach(function(cb){ var i = parseInt(cb.getAttribute('data-index'), 10); if (!isNaN(i) && tpl.tasks[i]) tasks.push(typeof tpl.tasks[i] === 'string' ? tpl.tasks[i] : (tpl.tasks[i].title || tpl.tasks[i].name || 'Задача ' + (i+1))); });
  if (tasks.length) applyTaskTemplateInner(projectId, key, tasks, tpl.emoji);
  closeTaskPartialModal();
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
}
function applyTaskTemplateInner(projectId, templateKey, taskTitles, emoji) {
  var tpl = TASK_TEMPLATES[templateKey];
  var tplName = (tpl && tpl.name) ? tpl.name : 'Тексты';
  var todayStr = getTodayISOmsk();
  (taskTitles || []).forEach(function(title, idx){
    var task = {
      projectId: projectId,
      title: title,
      type: 'text',
      status: 'new',
      priority: 'normal',
      dueDate: addDaysToIso(todayStr, idx),
      comment: '',
      templateName: tplName,
      emoji: emoji || (tpl && tpl.emoji) || '&#128221;'
    };
    addTask(task);
  });
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function toggleTasksLayer() {
  _tasksLayerOn = !_tasksLayerOn;
  try { localStorage.setItem(TASKS_LAYER_ON_KEY, _tasksLayerOn ? '1' : '0'); } catch(e) {}
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function toggleTasksSortFilter() {
  _projectsTasksSortOn = !_projectsTasksSortOn;
  try { localStorage.setItem(TASKS_SORT_ON_KEY, _projectsTasksSortOn ? '1' : '0'); } catch(e) {}
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function getTasksForProject(projectId) {
  var data = loadProjectsData();
  var tasks = (data.tasks || []).filter(function(t){ return t.projectId === projectId; });
  return tasks.sort(function(a,b){ return (a.sortOrder||0)-(b.sortOrder||0) || ((a.createdAt||0)-(b.createdAt||0)); });
}
function getTasksForProjectAndDate(projectId, dateStr) {
  var tasks = getTasksForProject(projectId);
  var d = (dateStr || '').slice(0, 10);
  return tasks.filter(function(t){ return ((t.dueDate || '').trim().slice(0, 10)) === d; });
}

function getTaskIndicatorsForProject(projectId) {
  var tasks = getTasksForProject(projectId);
  var todayStr = getTodayISOmsk();
  var urgent = 0, hasText = false, hasImage = false, hasSend = false;
  var nearestDate = null;
  tasks.forEach(function(t){
    if ((t.status || 'new') !== 'done') {
      if ((t.priority || 'normal') === 'urgent') urgent++;
      if ((t.type || 'text') === 'text') hasText = true;
      if ((t.type || '') === 'image') hasImage = true;
      if ((t.type || '') === 'send') hasSend = true;
      var d = (t.dueDate || '').trim();
      if (d && d >= todayStr) {
        if (!nearestDate || d < nearestDate) nearestDate = d;
      }
    }
  });
  return { urgent: urgent, hasText: hasText, hasImage: hasImage, hasSend: hasSend, nearestDate: nearestDate };
}

function getTaskIndicatorsHtml(projectId) {
  var ind = getTaskIndicatorsForProject(projectId);
  var parts = [];
  if (ind.urgent > 0) parts.push('<span class="task-ind-urgent" title="Срочных задач">&#128293; ' + ind.urgent + '</span>');
  if (ind.hasText) parts.push('<span class="task-ind-type" title="Текстовые">&#128221;</span>');
  if (ind.hasImage) parts.push('<span class="task-ind-type" title="Картинки">&#128444;</span>');
  if (ind.hasSend) parts.push('<span class="task-ind-type" title="Отправка">&#128230;</span>');
  if (ind.nearestDate) {
    var d = ind.nearestDate;
    var dd = d.length >= 10 ? d.slice(8, 10) + '.' + d.slice(5, 7) : d;
    parts.push('<span class="task-ind-date" title="Ближайший срок">' + escAttr(dd) + '</span>');
  }
  return parts.length ? parts.join(' ') : '<span class="task-ind-empty">—</span>';
}

function logTaskEvent(projectId, taskId, taskTitle, action, extra) {
  var data = loadProjectsData();
  if (!data.taskLog) data.taskLog = [];
  var entry = { projectId: projectId, taskId: taskId, taskTitle: taskTitle || '', action: action, at: Date.now() };
  if (extra && typeof extra === 'object') { Object.keys(extra).forEach(function(k){ entry[k] = extra[k]; }); }
  data.taskLog.push(entry);
  saveProjectsData(data);
}

function extendTaskDeadline(taskId, newDueDate) {
  var data = loadProjectsData();
  var t = (data.tasks || []).find(function(x){ return x.id === taskId; });
  if (!t) return;
  var oldDue = (t.dueDate || '').trim();
  var newDue = (newDueDate || '').trim();
  if (!newDue || newDue === oldDue) return;
  if (!t.deadlineTransfers) t.deadlineTransfers = [];
  t.deadlineTransfers.push({ from: oldDue || '—', to: newDue, at: Date.now() });
  t.dueDate = newDue;
  saveProjectsData(data);
  logTaskEvent(t.projectId, taskId, t.title, 'transferred', { from: oldDue, to: newDue });
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function showExtendDeadlineModal(taskId) {
  var existing = document.getElementById('taskExtendDeadlineModal');
  if (existing) existing.remove();
  var data = loadProjectsData();
  var t = (data.tasks || []).find(function(x){ return x.id === taskId; });
  if (!t) return;
  var curDue = (t.dueDate || '').trim() || getTodayISOmsk();
  var modal = document.createElement('div');
  modal.id = 'taskExtendDeadlineModal';
  modal.className = 'task-add-modal-overlay';
  modal.innerHTML = '<div class="task-add-modal" style="max-width:300px"><div class="task-add-modal-title">Перенести дедлайн</div><p class="task-extend-hint">' + escAttr(t.title || 'Задача') + '</p><div class="fg"><label>Новый срок</label><input type="text" id="taskExtendNewDate" placeholder="ГГГГ-ММ-ДД" value="' + escAttr(getTodayISOmsk()) + '"></div><div class="task-add-actions"><button type="button" class="btn-secondary" onclick="closeExtendDeadlineModal()">Отмена</button><button type="button" class="btn-primary" onclick="var d=document.getElementById(\'taskExtendNewDate\');if(d&&d.value)extendTaskDeadline(\'' + escAttr(taskId) + '\', d.value.trim());closeExtendDeadlineModal();">Перенести</button></div></div>';
  modal.onclick = function(e){ if (e.target === modal) closeExtendDeadlineModal(); };
  document.body.appendChild(modal);
}
function closeExtendDeadlineModal() {
  var m = document.getElementById('taskExtendDeadlineModal');
  if (m) m.remove();
}

function addTask(task) {
  var data = loadProjectsData();
  if (!data.tasks) data.tasks = [];
  task.id = 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  task.createdAt = Date.now();
  task.sortOrder = data.tasks.length;
  data.tasks.push(task);
  saveProjectsData(data);
  logTaskEvent(task.projectId, task.id, task.title, 'created');
}

function updateTask(taskId, updates) {
  var data = loadProjectsData();
  var t = (data.tasks || []).find(function(x){ return x.id === taskId; });
  if (!t) return;
  Object.keys(updates).forEach(function(k){ t[k] = updates[k]; });
  saveProjectsData(data);
}

function deleteTask(taskId) {
  var data = loadProjectsData();
  if (!data.tasks) return;
  data.tasks = data.tasks.filter(function(t){ return t.id !== taskId; });
  saveProjectsData(data);
}

function markTaskDone(taskId, btnEl) {
  if (btnEl) {
    btnEl.classList.add('glass-gone');
    var tid = btnEl.getAttribute('data-task-id');
    setTimeout(function(){
      if (tid) doMarkTaskDone(tid);
      if (typeof renderTaskPanel === 'function') renderTaskPanel();
      if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
    }, 200);
  } else {
    doMarkTaskDone(taskId);
    if (typeof renderTaskPanel === 'function') renderTaskPanel();
    if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
  }
}
function doMarkTaskDone(taskId) {
  var data = loadProjectsData();
  var t = (data.tasks || []).find(function(x){ return x.id === taskId; });
  if (t) {
    updateTask(taskId, { status: 'done' });
    logTaskEvent(t.projectId, taskId, t.title, 'done');
  }
}

function openTaskPanel(projectId) {
  _taskPanelProjectId = projectId;
  renderTaskPanel();
  var el = document.getElementById('taskPanelDrawer');
  if (el) el.classList.add('open');
}

function showCalTaskHoverPreview(taskId, title, projectId) {
  var el = document.getElementById('taskPanelHoverPreview');
  if (el) { el.textContent = (title || 'Задача'); el.style.display = ''; }
}
function hideCalTaskHoverPreview() {
  var el = document.getElementById('taskPanelHoverPreview');
  if (el) el.style.display = 'none';
}
function closeTaskPanel() {
  _taskPanelProjectId = null;
  _selectedCalCell = null;
  hideCalTaskHoverPreview();
  var el = document.getElementById('taskPanelDrawer');
  if (el) el.classList.remove('open');
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function getTaskPanelFontSize() {
  try { var v = localStorage.getItem(TASK_PANEL_FONT_KEY); return (v === 's' || v === 'l') ? v : 'm'; } catch(e){ return 'm'; }
}
function setTaskPanelFontSize(v) {
  try { localStorage.setItem(TASK_PANEL_FONT_KEY, v); } catch(e){}
  document.body.classList.remove('task-panel-font-s', 'task-panel-font-m', 'task-panel-font-l');
  document.body.classList.add('task-panel-font-' + v);
}
function cycleTaskPanelFontSize() {
  var cur = getTaskPanelFontSize();
  var next = cur === 's' ? 'm' : cur === 'm' ? 'l' : 's';
  setTaskPanelFontSize(next);
  return next;
}

function getTaskPanelWidth() {
  try { var w = parseInt(localStorage.getItem(TASK_PANEL_WIDTH_KEY), 10); return (w >= 220 && w <= 480) ? w : 280; } catch(e){ return 280; }
}
function setTaskPanelWidth(w) {
  w = Math.max(220, Math.min(480, w));
  try { localStorage.setItem(TASK_PANEL_WIDTH_KEY, String(w)); } catch(e){}
  var el = document.getElementById('taskPanelDrawer');
  if (el) el.style.width = w + 'px';
}

function getSelectedCellInfo(projectId, dateStr, childLineIdx) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id === projectId; });
  if (!p || !dateStr) return null;
  var clIdx = (childLineIdx != null && childLineIdx >= 0) ? childLineIdx : -1;
  var events = (clIdx >= 0) ? ((p.childLineEvents || [])[clIdx] || []) : (p.events || []);
  var dStr = String(dateStr);
  if (clIdx < 0 && p.cardsActive && (p.cardsActiveDate || '') === dStr)
    return { type: 'cards', label: 'АКТИВ карточек', value: p.cardsActive, icon: '🃏' };
  if (clIdx < 0 && p.mustLaunchRequired && (p.mustLaunchDate || getTodayISOmsk()) === dStr)
    return { type: 'mustlaunch', label: 'Должен быть запущен', icon: '!!' };
  var launchEvt = (events || []).find(function(e){ return e.type === 'launch_range' && dStr >= e.startDate && dStr <= e.endDate; });
  if (launchEvt) return { type: 'launch', label: 'Запуск', icon: '🚀' };
  var activeEvt = (events || []).find(function(e){ return e.type === 'active_range' && dStr >= e.startDate && dStr <= e.endDate; });
  if (activeEvt) return { type: 'autoload', label: 'Автозагрузка', icon: 'A' };
  return null;
}
function deleteSelectedCalCell() {
  if (!_selectedCalCell) return;
  var pid = _selectedCalCell.projectId, d = _selectedCalCell.dateStr, clIdx = _selectedCalCell.childLineIdx;
  var info = getSelectedCellInfo(pid, d, clIdx);
  if (!info) return;
  if (info.type === 'cards') removeProjectCardsActive(pid);
  else if (info.type === 'mustlaunch') removeProjectMustLaunchRequired(pid);
  else if (info.type === 'launch') clearProjectLaunchRange(pid, d, d, clIdx);
  else if (info.type === 'autoload') clearProjectAutoloadRangeForRow(pid, clIdx != null ? clIdx : -1, d, d);
  _selectedCalCell = null;
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function renderTaskPanel() {
  var wrap = document.getElementById('taskPanelWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'taskPanelWrap';
    wrap.className = 'task-panel-wrap';
    document.body.appendChild(wrap);
  }
  var pid = _taskPanelProjectId;
  var project = pid ? (loadProjectsData().projects || []).find(function(p){ return p.id === pid; }) : null;
  var tasks = pid ? getTasksForProject(pid) : [];
  var typeOpts = Object.keys(TASK_TYPES).map(function(k){ return '<option value="' + escAttr(k) + '">' + escAttr(TASK_TYPES[k]) + '</option>'; }).join('');
  var statusOpts = Object.keys(TASK_STATUSES).map(function(k){ return '<option value="' + escAttr(k) + '">' + escAttr(TASK_STATUSES[k]) + '</option>'; }).join('');
  var priorOpts = Object.keys(TASK_PRIORITIES).map(function(k){ return '<option value="' + escAttr(k) + '">' + escAttr(TASK_PRIORITIES[k]) + '</option>'; }).join('');

  var templatesHtml = '';
  if (pid) {
    var tplBtns = [];
    Object.keys(TASK_TEMPLATES).forEach(function(k){
      var t = TASK_TEMPLATES[k];
      var lbl = (t.emoji ? (t.emoji + ' ') : '') + escAttr(t.name);
      tplBtns.push('<button type="button" class="task-template-btn" onclick="applyTaskTemplate(\'' + escAttr(pid) + '\',\'' + escAttr(k) + '\')" title="' + escAttr(t.name) + '">' + lbl + '</button>');
    });
    templatesHtml = '<div class="task-panel-templates"><div class="task-panel-section-title">ШАБЛОНЫ ЗАДАЧ</div><div class="task-template-btns">' + tplBtns.join('') + '</div></div>';
  }

  var activeTasks = tasks.filter(function(t){ return (t.status || 'new') !== 'done'; });
  var doneTasks = tasks.filter(function(t){ return (t.status || 'new') === 'done'; });
  var byGroup = {};
  activeTasks.forEach(function(t){
    var g = (t.templateName || '').trim() || '_single';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(t);
  });
  var groupOrder = Object.keys(byGroup).sort(function(a,b){
    if (a === '_single') return 1;
    if (b === '_single') return -1;
    return a.localeCompare(b);
  });
  var todayStr = getTodayISOmsk();
  var renderTaskRow = function(t){
    var typeRu = TASK_TYPES[t.type] || t.type || '—';
    var statusVal = t.status || 'new';
    var isDone = statusVal === 'done';
    var dueVal = (t.dueDate || '').trim();
    var isOverdue = !isDone && dueVal && dueVal < todayStr;
    var statusRu = isOverdue ? 'Просрочено' : (TASK_STATUSES[statusVal] || statusVal || '—');
    var priorRu = TASK_PRIORITIES[t.priority] || t.priority || '—';
    var dueStr = dueVal ? dueVal : '—';
    var transfers = t.deadlineTransfers || [];
    var transferCnt = transfers.length;
    var transferHint = transferCnt ? (transferCnt + ' перенос' + (transferCnt === 1 ? '' : transferCnt < 5 ? 'а' : 'ов') + ': ' + transfers.map(function(tr){ var f = (tr.from || '—').length >= 10 ? (tr.from.slice(8,10) + '.' + tr.from.slice(5,7)) : tr.from; var to = (tr.to || '').length >= 10 ? (tr.to.slice(8,10) + '.' + tr.to.slice(5,7)) : tr.to; return f + '→' + to; }).join(', ')) : '';
    var comm = (t.comment || '').trim().slice(0, 40);
    var em = (t.emoji || TASK_TYPE_EMOJIS[t.type] || '&#128221;');
    var rowCls = 'task-panel-row' + (isDone ? ' task-panel-row-done' : '') + (isOverdue ? ' task-panel-row-overdue' : '');
    var doneBtn = isDone ? '' : '<button type="button" class="task-panel-row-done-btn" data-task-id="' + escAttr(t.id) + '" onclick="event.stopPropagation();markTaskDone(\'' + escAttr(t.id) + '\', this)" title="Выполнить">&#10003;</button>';
    var extendBtn = isOverdue ? '<button type="button" class="task-panel-row-extend-btn" onclick="event.stopPropagation();showExtendDeadlineModal(\'' + escAttr(t.id) + '\')" title="Перенести дедлайн">&#128197;</button>' : '';
    var actionsHtml = '<div class="task-panel-row-actions">' + doneBtn + extendBtn + '<button type="button" class="task-panel-row-del" onclick="event.stopPropagation();deleteTask(\'' + escAttr(t.id) + '\');renderTaskPanel();if(typeof rerenderProjectsPreserveScroll===\'function\')rerenderProjectsPreserveScroll();" title="Удалить">×</button></div>';
    var transferBadge = transferCnt ? '<span class="task-panel-transfer-badge" title="' + escAttr(transferHint) + '">+' + transferCnt + '</span>' : '';
    return '<div class="' + rowCls + '" data-id="' + escAttr(t.id) + '"><span class="task-panel-row-emoji">' + em + '</span><div class="task-panel-row-main"><span class="task-panel-title">' + escAttr(t.title || 'Без названия') + transferBadge + '</span><span class="task-panel-meta">' + escAttr(typeRu) + ' · ' + escAttr(statusRu) + ' · ' + escAttr(priorRu) + ' · ' + escAttr(dueStr) + '</span>' + (comm ? '<div class="task-panel-comment">' + escAttr(comm) + '</div>' : '') + '</div>' + actionsHtml + '</div>';
  };
  var listHtml = '';
  groupOrder.forEach(function(gkey){
    var groupTasks = byGroup[gkey];
    var groupTitle = gkey === '_single' ? '' : gkey;
    if (groupTitle) listHtml += '<div class="task-group-title">' + escAttr(groupTitle) + '</div>';
    groupTasks.forEach(function(t){ listHtml += renderTaskRow(t); });
  });
  if (doneTasks.length) {
    listHtml += '<div class="task-group-title task-group-done">Выполненные</div>';
    doneTasks.forEach(function(t){ listHtml += renderTaskRow(t); });
  }

  var cellSectionHtml = '';
  if (pid && _selectedCalCell && _selectedCalCell.projectId === pid && _selectedCalCell.dateStr) {
    var info = getSelectedCellInfo(pid, _selectedCalCell.dateStr, _selectedCalCell.childLineIdx);
    if (info) {
      var cellLabel = info.icon + ' ' + info.label + (info.value ? ': ' + info.value : '');
      cellSectionHtml = '<div class="task-panel-selected-cell"><div class="task-panel-section-title">КЛЕТКА КАЛЕНДАРЯ</div><div class="task-panel-cell-row"><span class="task-panel-cell-info">' + escAttr(cellLabel) + '</span><button type="button" class="task-panel-cell-del" onclick="deleteSelectedCalCell()" title="Удалить из календаря">×</button></div></div>';
    }
  }
  var linkDayHtml = '';
  if (pid && _selectedCalCell && _selectedCalCell.projectId === pid && _selectedCalCell.dateStr) {
    var selDateStr = _selectedCalCell.dateStr;
    var dd = selDateStr.length >= 10 ? selDateStr.slice(8, 10) + '.' + selDateStr.slice(5, 7) : selDateStr;
    var tasksOnDay = getTasksForProjectAndDate(pid, selDateStr);
    var otherTasks = tasks.filter(function(t){ return ((t.dueDate || '').trim().slice(0, 10)) !== selDateStr && (t.status || 'new') !== 'done'; });
    linkDayHtml = '<div class="task-panel-link-day"><div class="task-panel-section-title">📅 ' + escAttr(dd) + ' — привязать задачу</div>';
    linkDayHtml += '<div class="task-panel-hover-preview" id="taskPanelHoverPreview" style="display:none"></div>';
    linkDayHtml += '<button type="button" class="task-panel-add-btn task-panel-link-day-btn" onclick="showAddTaskFormForDate(\'' + escAttr(pid) + '\',\'' + escAttr(selDateStr) + '\')">+ Задача на этот день</button>';
    if (otherTasks.length > 0) {
      linkDayHtml += '<div class="task-panel-link-day-list">';
      otherTasks.slice(0, 5).forEach(function(t){
        var tit = escAttr((t.title || 'Задача').slice(0, 25));
        linkDayHtml += '<button type="button" class="task-panel-link-day-item" onclick="linkTaskToDate(\'' + escAttr(t.id) + '\',\'' + escAttr(selDateStr) + '\')" title="' + tit + '">' + (t.emoji || '&#128221;') + ' ' + tit + '</button>';
      });
      if (otherTasks.length > 5) linkDayHtml += '<span class="task-panel-link-day-more">+ ещё ' + (otherTasks.length - 5) + '</span>';
      linkDayHtml += '</div>';
    }
    linkDayHtml += '</div>';
  } else {
    linkDayHtml = '<div class="task-panel-hover-preview" id="taskPanelHoverPreview" style="display:none"></div>';
  }
  var listSectionHtml = '<div class="task-panel-list-section" id="taskPanelListSection"><div class="task-panel-section-title">СПИСОК ЗАДАЧ ПРОЕКТА</div><div class="task-panel-list">' + listHtml + '</div></div>';

  var fontSize = getTaskPanelFontSize();
  var fontBtns = '<span class="task-panel-font-btns"><button type="button" class="task-panel-font-btn' + (fontSize==='s'?' active':'') + '" onclick="setTaskPanelFontSize(\'s\')" title="Мелкий шрифт">A−</button><button type="button" class="task-panel-font-btn' + (fontSize==='m'?' active':'') + '" onclick="setTaskPanelFontSize(\'m\')" title="Обычный">A</button><button type="button" class="task-panel-font-btn' + (fontSize==='l'?' active':'') + '" onclick="setTaskPanelFontSize(\'l\')" title="Крупный">A+</button></span>';

  var aiRowHtml = pid ? '<div class="task-panel-ai-row" title="ИИ записывает задачи, дедлайны и фиксирует историю в проекте">&#129302; ИИ — задачи, дедлайны, история</div>' : '';
wrap.innerHTML = '<div id="taskPanelDrawer" class="task-panel-drawer' + (pid ? ' open' : '') + '" style="width:' + getTaskPanelWidth() + 'px"><div class="task-panel-resizer" onmousedown="startTaskPanelResize(event)" title="Тяните — ширину и шрифт"></div><div class="task-panel-header"><span class="task-panel-title">' + (project ? escAttr(String(project.emoji || '') + ' ' + (project.title || 'Без названия')) : 'Задачи') + '</span><div style="display:flex;align-items:center;gap:8px">' + fontBtns + '<button type="button" class="task-panel-close" onclick="closeTaskPanel()" title="Закрыть">×</button></div></div>' + aiRowHtml + '<div class="task-panel-content">' + (cellSectionHtml || '') + (linkDayHtml || '') + templatesHtml + listSectionHtml + '<button type="button" class="task-panel-add-btn" onclick="showAddTaskForm(\'' + (pid || '') + '\')">+ ЗАДАЧА</button></div></div>';

  setTaskPanelFontSize(fontSize);
  var addModal = document.getElementById('taskAddModal');
  if (addModal) addModal.remove();
  bindTaskPanelResize();
  var listSection = document.getElementById('taskPanelListSection');
  if (listSection && pid) {
    listSection.oncontextmenu = function(e) { e.preventDefault(); showTaskTemplateContextMenu(e, pid); };
  }
}

var _taskPanelResizeStart = null;
function startTaskPanelResize(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  var el = document.getElementById('taskPanelDrawer');
  if (!el) return;
  _taskPanelResizeStart = { x: e.clientX, w: el.offsetWidth };
  el.classList.add('resize-mode');
  document.addEventListener('mousemove', onTaskPanelResizeMove);
  document.addEventListener('mouseup', onTaskPanelResizeUp);
}
function onTaskPanelResizeMove(e) {
  if (!_taskPanelResizeStart) return;
  var el = document.getElementById('taskPanelDrawer');
  if (!el) return;
  var delta = _taskPanelResizeStart.x - e.clientX;
  var newW = Math.max(220, Math.min(480, _taskPanelResizeStart.w + delta));
  el.style.width = newW + 'px';
  if (newW >= 380) setTaskPanelFontSize('l');
  else if (newW >= 300) setTaskPanelFontSize('m');
  else setTaskPanelFontSize('s');
}
function onTaskPanelResizeUp(e) {
  document.removeEventListener('mousemove', onTaskPanelResizeMove);
  document.removeEventListener('mouseup', onTaskPanelResizeUp);
  var el = document.getElementById('taskPanelDrawer');
  if (el) el.classList.remove('resize-mode');
  if (_taskPanelResizeStart) {
    var w = (el && el.offsetWidth) || 280;
    setTaskPanelWidth(w);
  }
  _taskPanelResizeStart = null;
}
function bindTaskPanelResize() {
  document.removeEventListener('mousemove', onTaskPanelResizeMove);
  document.removeEventListener('mouseup', onTaskPanelResizeUp);
}

function showAddTaskForm(projectId) {
  showAddTaskFormForDate(projectId, getTodayISOmsk());
}
function showAddTaskFormForDate(projectId, dateStr) {
  var existing = document.getElementById('taskAddModal');
  if (existing) existing.remove();
  var typeOpts = Object.keys(TASK_TYPES).map(function(k){ return '<option value="' + k + '">' + TASK_TYPES[k] + '</option>'; }).join('');
  var statusOpts = Object.keys(TASK_STATUSES).map(function(k){ return '<option value="' + k + '">' + TASK_STATUSES[k] + '</option>'; }).join('');
  var priorOpts = Object.keys(TASK_PRIORITIES).map(function(k){ return '<option value="' + k + '">' + TASK_PRIORITIES[k] + '</option>'; }).join('');
  var dueVal = (dateStr || getTodayISOmsk()).slice(0, 10);
  var modal = document.createElement('div');
  modal.id = 'taskAddModal';
  modal.className = 'task-add-modal-overlay';
  modal.innerHTML = '<div class="task-add-modal"><div class="task-add-modal-title">+ ЗАДАЧА</div><form class="task-add-form" onsubmit="event.preventDefault();submitAddTask(\'' + escAttr(projectId) + '\', this);return false"><div class="fg"><label>Название</label><input type="text" name="title" required placeholder="Название задачи"></div><div class="row2"><div class="fg"><label>Тип</label><select name="type">' + typeOpts + '</select></div><div class="fg"><label>Статус</label><select name="status">' + statusOpts + '</select></div></div><div class="row2"><div class="fg"><label>Приоритет</label><select name="priority">' + priorOpts + '</select></div><div class="fg"><label>Срок</label><input type="text" name="dueDate" placeholder="ГГГГ-ММ-ДД" value="' + escAttr(dueVal) + '"></div></div><div class="fg"><label>Комментарий</label><textarea name="comment" rows="2" placeholder="Комментарий"></textarea></div><div class="task-add-actions"><button type="button" class="btn-secondary" onclick="closeAddTaskForm()">Отмена</button><button type="submit" class="btn-primary">Сохранить</button></div></form></div>';
  modal.onclick = function(e){ if (e.target === modal) closeAddTaskForm(); };
  document.body.appendChild(modal);
}
function linkTaskToDate(taskId, dateStr) {
  if (!taskId || !dateStr) return;
  updateTask(taskId, { dueDate: dateStr.slice(0, 10) });
  var data = loadProjectsData();
  var t = (data.tasks || []).find(function(x){ return x.id === taskId; });
  if (t) logTaskEvent(t.projectId, taskId, t.title, 'transferred', { to: dateStr });
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function closeAddTaskForm() {
  var m = document.getElementById('taskAddModal');
  if (m) m.remove();
}

function submitAddTask(projectId, form) {
  var title = (form.title && form.title.value || '').trim();
  if (!title) return;
  var typeVal = (form.type && form.type.value) || 'text';
  var task = {
    projectId: projectId,
    title: title,
    type: typeVal,
    status: (form.status && form.status.value) || 'new',
    priority: (form.priority && form.priority.value) || 'normal',
    dueDate: (form.dueDate && form.dueDate.value || '').trim(),
    comment: (form.comment && form.comment.value || '').trim(),
    emoji: TASK_TYPE_EMOJIS[typeVal] || '&#128221;'
  };
  addTask(task);
  closeAddTaskForm();
  renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}

function ensureTasksInData(data) {
  if (!Array.isArray(data.tasks)) data.tasks = [];
  return data;
}

var _renderProjectsInProgress = false;
function renderProjectsScreen(opts) {
  opts = opts || {};
  if (!projectsMode) return;
  if (_renderProjectsInProgress) return;
  _renderProjectsInProgress = true;
  try {
    var data = loadProjectsData();
  // Повторная миграция !! и Актив на сегодня МСК (правило 00:00 МСК)
  (function migrateCardsToToday() {
    var todayStr = getTodayISOmsk();
    var moved = false;
    (data.projects || []).forEach(function(p) {
      var cd = (p.cardsActiveDate || '').trim();
      var md = (p.mustLaunchDate || '').trim();
      var fix15to11 = function(d){ if (!d || d.length < 10) return d; if (d.slice(-2) === '15') return d.slice(0,-2) + '11'; return d; };
      if (p.cardsActive && cd && fix15to11(cd) !== cd) { p.cardsActiveDate = fix15to11(cd); moved = true; cd = p.cardsActiveDate; }
      if (p.mustLaunchRequired && md && fix15to11(md) !== md) { p.mustLaunchDate = fix15to11(md); moved = true; md = p.mustLaunchDate; }
      if (p.cardsActive && (cd === '' || cd < todayStr || cd > todayStr)) { p.cardsActiveDate = todayStr; moved = true; }
      if (p.mustLaunchRequired && (md === '' || md < todayStr || md > todayStr)) { p.mustLaunchDate = todayStr; moved = true; }
    });
    if (moved) saveProjectsData(data);
  })();
  var DAY_PX = getSavedProjectsDayPx() || 28;
  var DAYS_LEFT = 0;
  var DAYS_RIGHT = 60;
  var today = new Date();
  today.setHours(0,0,0,0);
  var startDate = new Date(today);
  var endDate = new Date(today);
  endDate.setDate(endDate.getDate() + DAYS_RIGHT);
  var dates = [];
  for (var i = 0; i <= DAYS_RIGHT; i++) {
    var d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  // Индекс сегодня: клетка = день, ищем по дате (MSK, fallback local)
  var todayStr = getTodayISOmsk();
  var todayIndex = dates.findIndex(function(dd){ return toIsoDateLocal(dd) === todayStr; });
  if (todayIndex < 0) todayIndex = dates.findIndex(function(dd){ return toIsoDateLocal(dd) === getTodayISO(); });
  if (todayIndex < 0) todayIndex = DAYS_LEFT;
  if (todayIndex < 0) todayIndex = DAYS_LEFT;
  _projectsTodayIndex = todayIndex;
  var pathLabels = [{k:'autoload',e:'🅰️',l:'Автозагрузка'},{k:'analytics',e:'🔍',l:'Аналитика'},{k:'texts',e:'📜',l:'Тексты'},{k:'packaging',e:'🎨',l:'Упаковка'},{k:'portfolio',e:'⭐️',l:'Портфолио'}];

  var zoneTitle = function(z) { return z==='active'?'Активные':z==='second_chance'?'Подвисшие / второй круг':'Архив'; };
  var zoneClass = function(z) { return z==='active'?'projects-zone-active':z==='second_chance'?'projects-zone-second':'projects-zone-archive'; };

  var allProjects = [];
  var visibleProjects = data.projects
    .filter(function(p){ return (p.zone || 'active') === _projectsZoneTab; })
    .sort(function(a,b){ return (a.sortOrder||0)-(b.sortOrder||0); });
  if (_projectsTasksSortOn) {
    visibleProjects.sort(function(a,b){
      var ca = (typeof getTasksForProject === 'function' ? getTasksForProject(a.id) : []).length;
      var cb = (typeof getTasksForProject === 'function' ? getTasksForProject(b.id) : []).length;
      return cb - ca;
    });
  }
  if (_projectsTypeSortPriority) {
    var first = visibleProjects.filter(function(p){ return normalizeProjectClientType(p.clientType) === _projectsTypeSortPriority; });
    var rest = visibleProjects.filter(function(p){ return normalizeProjectClientType(p.clientType) !== _projectsTypeSortPriority; });
    visibleProjects = first.concat(rest);
  }
  if (_projectsFilterLaunch || _projectsFilterAutoload || _projectsFilterMustLaunch) {
    var matchFilter = function(p) {
      if (_projectsFilterLaunch && projectHasLaunch(p)) return true;
      if (_projectsFilterAutoload && projectHasAutoload(p)) return true;
      if (_projectsFilterMustLaunch && projectHasMustLaunch(p)) return true;
      return false;
    };
    var first = visibleProjects.filter(matchFilter);
    var rest = visibleProjects.filter(function(p){ return !matchFilter(p); });
    visibleProjects = first.concat(rest);
  }
  allProjects = visibleProjects.slice();
  var activeProjects = (data.projects || []).filter(function(p){ return (p.zone || 'active') === 'active'; });
  var activeCount = activeProjects.length;
  var launchCount = activeProjects.filter(projectHasLaunch).length;
  var autoloadCount = activeProjects.filter(projectHasAutoload).length;
  var mustLaunchCount = activeProjects.filter(projectHasMustLaunch).length;
  var diamondCount = activeProjects.filter(function(p){ return normalizeProjectClientType(p.clientType) === 'old'; }).length;
  var newCount = activeProjects.filter(function(p){ return normalizeProjectClientType(p.clientType) === 'new'; }).length;
  var returningCount = activeProjects.filter(function(p){ return normalizeProjectClientType(p.clientType) === 'returning'; }).length;
  var stickyW = getSavedProjectsStickyWidth() || getProjectsStickyWidthPx(allProjects);
  if (_projectsZoneTab === 'second_chance' || _projectsZoneTab === 'archive') stickyW = Math.min(stickyW, 420);
  var rowH = getSavedProjectsRowHeight() || 14;
  var projectsZoom = getSavedProjectsZoom();
  var effectiveRowH = projectsZoom < 1 ? Math.max(6, Math.round(rowH * projectsZoom)) : rowH;
  var tableStyle = '--projects-sticky-width:' + stickyW + 'px;--projects-row-height:' + effectiveRowH + 'px';
  var fitRowsCls = projectsZoom < 1 ? ' projects-fit-rows' : '';
  var zoneCls = _projectsZoneTab === 'second_chance' ? ' projects-zone-zzz' : _projectsZoneTab === 'archive' ? ' projects-zone-archive' : '';
  var html = '<div class="projects-board' + fitRowsCls + zoneCls + '" style="transform:scale(' + projectsZoom + ');transform-origin:0 0"><div class="projects-table-wrap"><div class="projects-table" style="' + tableStyle + '">';
  var tasksCount = visibleProjects.reduce(function(sum,p){ return sum + (typeof getTasksForProject === 'function' ? getTasksForProject(p.id) : []).length; }, 0);
  var tasksLabel = '<button type="button" class="projects-zone-tab projects-tasks-tab' + (_projectsTasksSortOn ? ' on' : '') + '" data-zone="tasks" onclick="event.stopPropagation();toggleTasksSortFilter()" title="' + (_projectsTasksSortOn ? 'Сбросить сортировку по задачам' : 'Сортировать: больше задач — выше') + '"><span class="proj-tasks-count-badge">' + tasksCount + '</span></button>';
  var zoneLabels = { active:'&#9889; Актив', second_chance:'&#128164; Zzz', archive:'&#128230; Архив' };
  var tabsBtns = _projectsZoneTabOrder.map(function(z){
    return '<button type="button" class="projects-zone-tab projects-zone-tab-zone' + (_projectsZoneTab===z ? ' on' : '') + '" data-zone="' + z + '" draggable="true" onclick="event.stopPropagation();setProjectsZoneTab(\'' + z + '\')" ondragstart="zoneTabDragStart(event,\'' + z + '\')" ondragover="zoneTabDragOver(event)" ondragleave="zoneTabDragLeave(event)" ondrop="zoneTabDrop(event,\'' + z + '\')" ondragend="zoneTabDragEnd(event)">' + (zoneLabels[z]||z) + '</button>';
  }).join('');
  var zoneTabsRow = '<div class="projects-zone-tabs projects-zone-tabs-top">' + tabsBtns + '</div>';
  var addBtnHtml = '<span class="projects-head-chip projects-add-chip" title="Добавить проект" onclick="event.stopPropagation();createNewProjectInActive()">+</span>';
  var chipsRow1 = '<span class="projects-head-stats">' +
          addBtnHtml +
          '<span class="projects-head-chip active" title="Все проекты" onclick="event.stopPropagation();setProjectsTypeSortPriority(null)">🃏 <b>' + activeCount + '</b></span>' +
          '<span class="projects-head-chip diamond' + (_projectsTypeSortPriority === 'old' ? ' is-on' : '') + '" title="Алмазы" onclick="event.stopPropagation();setProjectsTypeSortPriority(\'old\')">💎 <b>' + diamondCount + '</b></span>' +
          '<span class="projects-head-chip ret' + (_projectsTypeSortPriority === 'returning' ? ' is-on' : '') + '" title="Второй раз" onclick="event.stopPropagation();setProjectsTypeSortPriority(\'returning\')">2️⃣ <b>' + returningCount + '</b></span>' +
          '<span class="projects-head-chip new' + (_projectsTypeSortPriority === 'new' ? ' is-on' : '') + '" onclick="event.stopPropagation();setProjectsTypeSortPriority(\'new\')">NEW <b>' + newCount + '</b></span>' +
        '</span>';
  var chipsRow2 = '<span class="projects-head-stats projects-head-stats-row2">' +
          tasksLabel +
          '<span class="projects-head-chip launch' + (_projectsFilterLaunch ? ' is-on' : '') + '" title="Показать проекты с запуском первыми" onclick="event.stopPropagation();toggleProjectsFilterLaunch()">🚀 <b>' + launchCount + '</b></span>' +
          '<span class="projects-head-chip autoload' + (_projectsFilterAutoload ? ' is-on' : '') + '" title="Показать проекты с автозагрузкой первыми" onclick="event.stopPropagation();toggleProjectsFilterAutoload()">🅰 <b>' + autoloadCount + '</b></span>' +
          '<span class="projects-head-chip mustlaunch' + (_projectsFilterMustLaunch ? ' is-on' : '') + '" title="Показать проекты с !! первыми" onclick="event.stopPropagation();toggleProjectsFilterMustLaunch()">!! <b>' + mustLaunchCount + '</b></span>' +
        '</span>';
  var expandCls = (typeof localStorage !== 'undefined' && localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_projects_sidebar_hidden') : 'avitolog_projects_sidebar_hidden')) === '1') ? ' on' : '';
  var toolsRow = '<div class="projects-zone-tabs-wrap"><div class="projects-zone-tabs projects-zone-tabs-bottom projects-zone-tabs-row1">' + chipsRow1 + '</div><div class="projects-zone-tabs projects-zone-tabs-bottom projects-zone-tabs-row2">' + chipsRow2 + '</div></div>';
  var headerSticky =
    '<div class="projects-sticky-head">' +
      zoneTabsRow +
      toolsRow +
    '</div>';
  var dayNames = ['вс','пн','вт','ср','чт','пт','сб'];
  var sliderRow = '<div class="projects-table-row projects-cal-slider-row"><div class="projects-sticky"></div><div class="projects-scroll"><div class="cal-width-slider-wrap"><div class="cal-cell-width-slider" id="calCellWidthSlider" title="Тяните вправо — шире, влево — уже. Двойной клик — сброс" onmousedown="startCalCellWidthResize(event)" ondblclick="resetCalCellWidth(event)">⇄</div></div></div></div>';
  var headerScroll = '';
  dates.forEach(function(d, idx) {
    var isToday = (idx === todayIndex) && (toIsoDateLocal(d) === todayStr);
    var mon = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][d.getMonth()];
    var wd = dayNames[d.getDay()];
    var todayLabel = isToday ? '<span class="cal-today-badge">СЕГОДНЯ</span>' : '';
    headerScroll += '<div class="projects-cal-day' + (isToday?' today':'') + '" style="width:' + DAY_PX + 'px;min-width:' + DAY_PX + 'px">' + todayLabel + '<span class="cal-mon">' + mon + '</span><span class="cal-num-wd"><span class="cal-num">' + d.getDate() + '</span><span class="cal-wd">' + wd + '</span></span></div>';
  });
  html += sliderRow + '<div class="projects-table-row projects-table-header projects-cal-header"><div class="projects-sticky">' + headerSticky + '</div><div class="projects-scroll">' + headerScroll + '</div></div>';

  visibleProjects.forEach(function(p) {
    ensureChildLineEvents(p);
    var emHtml = getProjectEmojiButtonHtml(p);
    var pathHtml = pathLabels.map(function(pl){ return '<button type="button" class="proj-path-btn' + (p.clientPath&&p.clientPath[pl.k]?' on':'') + '" title="' + pl.l + '" onclick="event.stopPropagation();toggleProjectPath(\'' + p.id + '\',\'' + pl.k + '\')">' + (pl.e||pl.l.slice(0,1)) + '</button>'; }).join('');
    var normType = normalizeProjectClientType(p.clientType);
    var typeHtml = (normType==='old') ? '<span class="proj-type-diamond">💎</span>' : (normType==='returning') ? '<span class="proj-type-2">2</span>' : '<span class="proj-type-new">NEW</span>';
    var hasChildLines = (p.childLines || []).some(function(v){ return String(v || '').trim() !== ''; });
    var expandContent = hasChildLines ? (showPositionRows ? '&#9660;' : '&#9654;') : '';
    var expandArrowOnclick = hasChildLines ? ' onclick="event.stopPropagation();toggleProjectPositions(\'' + p.id + '\')" title="Свернуть/развернуть позиции"' : '';
    var expandBtnName = '<button type="button" class="field-expand-btn" title="Раскрыть доп. поле" onclick="event.stopPropagation();toggleProjectOptional(this,\'' + p.id + '\')">&#9662;</button>';
    var driveClass = 'proj-drive-btn' + (p.folderLink ? ' on' : '');
    var catName = getCategoryNameById(p.categoryFolderId);
    var driveTitle = (p.folderLink && catName) ? ('Папка: ' + escAttr(catName)) : 'Папка клиента в Google Drive';
    var expandedClass = _expandedProjectIds[p.id] ? ' expanded' : '';
    var hoverPop = '<div class="proj-hover-pop"><button type="button" class="crm-bind-btn" onclick="startProjectFolderBind(\'' + p.id + '\', event)">CRM</button></div>';
    var moveBtn = '<button type="button" class="proj-move-btn" title="Переместить проект" onclick="event.stopPropagation();showProjectZoneMenu(this,\'' + p.id + '\')">&#8594;</button>';
    var taskCount = (typeof getTasksForProject === 'function' ? getTasksForProject(p.id) : []).length;
    var taskIndicatorsHtml = '<div class="proj-task-badge"><span class="proj-task-count">' + taskCount + '</span></div>';
    var dragHandle = '<span class="proj-row-drag-handle" title="Тяните для перетаскивания строки">&#9776;</span>';
    if (hasChildLines && _expandedProjectIds[p.id] === undefined) _expandedProjectIds[p.id] = false;
    var showPositionRows = hasChildLines && _expandedProjectIds[p.id];
    var extraLinesHtml = typeof renderProjectChildLinesHtml === 'function' ? renderProjectChildLinesHtml(p) : '';
    var stickyHtml = '<div class="proj-col-expand">' + dragHandle + '<span class="proj-col-expand-arrow"' + (expandArrowOnclick || '') + '>' + expandContent + '</span></div><div class="proj-col-type" onclick="event.stopPropagation();cycleProjectClientType(\'' + p.id + '\')" title="Старые/новички/2-й раз">' + typeHtml + '</div><button type="button" class="' + driveClass + '" title="' + driveTitle + '" onclick="event.stopPropagation();openProjectDriveFolder(\'' + p.id + '\')">💿</button><div class="proj-cell-editable' + expandedClass + '" data-id="' + p.id + '" onclick="editProjectCell(this)">' + hoverPop + '<div class="proj-main-line"><button type="button" class="proj-emoji-btn" onclick="event.stopPropagation();showProjEmojiPicker(this,\'' + p.id + '\')">' + emHtml + '</button><input type="text" value="' + (p.title||'').replace(/"/g,'&quot;') + '" readonly style="pointer-events:none">' + expandBtnName + '<span class="project-path">' + pathHtml + '</span><button type="button" class="proj-status-btn project-status" onclick="event.stopPropagation();showProjectStatusPicker(this,\'' + p.id + '\')" style="background:' + (PROJECT_STATUS_COLORS[p.status]||'#666') + '22;color:' + (PROJECT_STATUS_COLORS[p.status]||'#999') + '">' + (p.status||'В работе') + '</button>' + moveBtn + '</div>' + (hasChildLines ? '' : '<div class="proj-optional-row">' + (typeof renderProjectChildLinesHtml === 'function' ? renderProjectChildLinesHtml(p) : '') + '</div>') + taskIndicatorsHtml + '</div>';
    var selectedClass = (_selectedProjectId === p.id) ? ' selected' : '';
    var groupedClass = (_projectsTypeSortPriority && normalizeProjectClientType(p.clientType) === _projectsTypeSortPriority) || (_projectsFilterLaunch && projectHasLaunch(p)) || (_projectsFilterAutoload && projectHasAutoload(p)) || (_projectsFilterMustLaunch && projectHasMustLaunch(p)) ? ' group-match' : '';
    var newFromGoalsClass = p._newFromGoals ? ' project-row-new-from-goals' : '';
    function renderRowCells(events, childLineIdx, isCollapsedLayers) {
      var out = '';
      dates.forEach(function(d) {
        var dStr = toIsoDateLocal(d);
        var cellHtml = '';
        var launchEvt = (events||[]).find(function(e){ return e.type==='launch_range' && dStr>=e.startDate && dStr<=e.endDate; });
        var evts = (events||[]).filter(function(e){ return e.type==='active_range' && dStr>=e.startDate && dStr<=e.endDate; });
        var evt = evts[0] || null;
        var rocket = (events||[]).find(function(e){ return e.type==='not_launched_project_marker' && e.date===dStr; });
        var isTodayCell = (dStr === todayStr);
        var cardsActiveDate = (p.cardsActiveDate || '') && String(p.cardsActive || '').trim();
        var cardsActiveShown = (childLineIdx < 0) && cardsActiveDate && (dStr === p.cardsActiveDate);
        var mustLaunchShown = (childLineIdx < 0) && !!p.mustLaunchRequired && (dStr === (p.mustLaunchDate || todayStr));
        var dayTasks = typeof getTasksForProjectAndDate === 'function' ? getTasksForProjectAndDate(p.id, dStr) : [];
        var isCalSelected = _selectedCalCell && _selectedCalCell.projectId === p.id && _selectedCalCell.dateStr === dStr && ((childLineIdx < 0 && (_selectedCalCell.childLineIdx == null || _selectedCalCell.childLineIdx < 0)) || (childLineIdx >= 0 && _selectedCalCell.childLineIdx === childLineIdx));
        var dayCls = 'projects-cal-day' + (isTodayCell ? ' today' : '') + (isCalSelected ? ' cal-day-selected' : '');
        if (cardsActiveShown) cellHtml = '<div class="cal-cards"><span class="cal-cards-del">×</span><span class="cal-cards-num">' + escAttr(p.cardsActive || '') + '</span></div>';
        else if (mustLaunchShown) cellHtml = '<div class="cal-deadline"><span class="cal-deadline-del">×</span><span class="cal-deadline-icon">!!</span></div>';
        else if (rocket) { cellHtml = '<div class="cal-launch-tip cal-launch-rocket">🚀</div>'; dayCls += ' day-launch-end'; }
        else if (launchEvt) {
          var isLaunchLast = (dStr === launchEvt.endDate);
          cellHtml = isLaunchLast ? '<div class="cal-launch-tip cal-launch-rocket">🚀</div>' : '<div class="cal-launch-bar"></div>';
          if (isLaunchLast) dayCls += ' day-launch-end'; else dayCls += ' day-launch';
        }
        else if (evt) {
          var isAutoloadLast = (dStr === evt.endDate);
          if (isAutoloadLast) {
            cellHtml = '<div class="cal-autoload-a">A</div>';
            dayCls += ' day-active day-active-end';
          } else if (isCollapsedLayers && evts.length > 1) {
            cellHtml = evts.slice(1).map(function(){ return '<div class="cal-bar cal-bar-layer"></div>'; }).join('') + '<div class="cal-bar"></div>';
            dayCls += ' day-active';
          } else {
            cellHtml = '<div class="cal-bar"></div>';
            dayCls += ' day-active';
          }
        }
        if (dayTasks.length > 0) {
          var taskBadges = dayTasks.map(function(t){
            var em = (t.emoji || '&#128221;');
            var tit = escAttr(t.title || 'Задача');
            return '<span class="cal-task-item" data-task-id="' + escAttr(t.id) + '" data-task-title="' + tit + '" title="' + tit + '" onclick="event.stopPropagation()">' + em + '</span>';
          }).join('');
          cellHtml = (cellHtml || '') + '<div class="cal-tasks-badges">' + taskBadges + '</div>';
        }
        var clIdx = childLineIdx >= 0 ? String(childLineIdx) : '-1';
        var dayNum = '<span class="cal-cell-num" title="' + escAttr(dStr) + '">' + d.getDate() + '</span>';
        out += '<div class="' + dayCls + '" data-project-id="' + p.id + '" data-child-line-index="' + clIdx + '" data-date="' + dStr + '" style="width:' + DAY_PX + 'px;min-width:' + DAY_PX + 'px;max-width:' + DAY_PX + 'px">' + dayNum + cellHtml + '</div>';
      });
      return out;
    }
    var mainEvents = getEventsForProjectRow(p, -1);
    var eventsForMainRow = (hasChildLines && !showPositionRows) ? getAggregatedAutoloadEventsForCollapsed(p) : mainEvents;
    var rowHtml = '<div class="projects-table-row' + selectedClass + groupedClass + newFromGoalsClass + '" data-id="' + p.id + '" data-child-line-index="-1" draggable="true" onclick="selectProjectRow(\'' + p.id + '\')" ondragstart="startProjectRowDrag(event,\'' + p.id + '\')" ondragover="handleProjectRowDragOver(event,this,\'' + p.id + '\')" ondragleave="handleProjectRowDragLeave(event,this)" ondrop="handleProjectRowDrop(event,\'' + p.id + '\')" ondragend="endProjectRowDrag(event)"><div class="projects-sticky">' + stickyHtml + '</div><div class="projects-scroll">' + renderRowCells(eventsForMainRow, -1, hasChildLines && !showPositionRows) + '</div></div>';
    html += rowHtml;
    var childLines = getProjectChildLines(p);
    if (hasChildLines) {
      childLines.forEach(function(_, origIdx) {
        var childEvents = getEventsForProjectRow(p, origIdx);
        var childLineHtml = renderProjectChildLineHtml(p, origIdx);
        var hiddenCls = showPositionRows ? '' : ' proj-position-hidden';
        var childStickySimple = '<div class="proj-col-expand"></div><div class="proj-col-type"></div><span class="proj-drive-btn" style="pointer-events:none;opacity:0"></span><div class="proj-cell-editable proj-child-line-cell" data-id="' + p.id + '" data-child-line-index="' + origIdx + '">' + childLineHtml + '</div>';
        var childRowHtml = '<div class="projects-table-row projects-table-row-child proj-position-row' + hiddenCls + selectedClass + '" data-id="' + p.id + '" data-child-line-index="' + origIdx + '" onclick="selectProjectRow(\'' + p.id + '\')"><div class="projects-sticky">' + childStickySimple + '</div><div class="projects-scroll">' + renderRowCells(childEvents, origIdx) + '</div></div>';
        html += childRowHtml;
      });
    }
  });
  var hiddenList = (data.hiddenProjects || []).slice(0, 50);
  var hiddenByMonth = {};
  hiddenList.forEach(function(h){
    var m = (h.deletedAt || '').slice(0, 7) || '—';
    if (!hiddenByMonth[m]) hiddenByMonth[m] = [];
    hiddenByMonth[m].push(h);
  });
  var monthNames = {'01':'янв','02':'фев','03':'мар','04':'апр','05':'май','06':'июн','07':'июл','08':'авг','09':'сен','10':'окт','11':'ноя','12':'дек'};
  var hiddenHtml = '';
  Object.keys(hiddenByMonth).sort().reverse().forEach(function(ym){
    var parts = ym.split('-');
    var label = parts.length >= 2 ? (monthNames[parts[1]] || parts[1]) + ' ' + (parts[0] || '') : ym;
    hiddenHtml += '<div class="projects-hidden-group"><div class="projects-hidden-group-title">' + escAttr(label) + '</div>';
    (hiddenByMonth[ym] || []).forEach(function(h){
      hiddenHtml += '<div class="projects-hidden-item" title="Вернуть в ' + (h._hiddenZone === 'active' ? 'Актив' : h._hiddenZone === 'second_chance' ? 'Zzz' : 'Архив') + '" onclick="restoreProjectFromHidden(\'' + escAttr(h.id) + '\')">' + escAttr(String(h.emoji || '📁')) + ' ' + escAttr(String(h.title || 'Без названия').slice(0, 18)) + '</div>';
    });
    hiddenHtml += '</div>';
  });
  html += '</div><button type="button" class="projects-expand-btn projects-expand-btn-cal' + expandCls + '" onclick="event.stopPropagation();toggleProjectsSidebar()" title="Растянуть таблицу на весь экран / вернуть панель">⛶</button></div>';
  html += '<div class="projects-hidden-strip" title="Календарные (удалённые)">' + (hiddenHtml ? ('<div class="projects-hidden-head">📅</div><div class="projects-hidden-list">' + hiddenHtml + '</div>') : '<div class="projects-hidden-empty">—</div>') + '</div>';
  html += '</div>';
  document.getElementById('mainContent').innerHTML = html;

  backfillProjectCategoryFromDrive(visibleProjects);

  var calWrap = document.querySelector('.projects-table-wrap');
  if (calWrap) {
    var todayIdx = Number(_projectsTodayIndex) || DAYS_LEFT;
    var todayStartX = Math.max(0, todayIdx * DAY_PX);
    if (_projectsZoomCenterToday) {
      calWrap.scrollLeft = todayStartX;
      calWrap.scrollTop = opts.preserveScroll ? (opts.preserveScroll.wrapTop || 0) : calWrap.scrollTop;
      _projectsZoomCenterToday = false;
    } else if (opts.preserveScroll) {
      calWrap.scrollLeft = Math.max(todayStartX, opts.preserveScroll.wrapLeft || 0);
      calWrap.scrollTop = opts.preserveScroll.wrapTop || 0;
    } else if (!_projectsDidInitialCenter) {
      calWrap.scrollLeft = todayStartX;
      _projectsDidInitialCenter = true;
    } else {
      calWrap.scrollLeft = todayStartX;
    }
  }
  if (opts.preserveScroll) {
    var content = document.querySelector('.content');
    if (content) content.scrollTop = opts.preserveScroll.contentTop || 0;
  }
  if (_projectChildFocusKey) {
    var focusEl = document.querySelector('input[data-child-focus="' + _projectChildFocusKey + '"]');
    if (focusEl) {
      focusEl.focus();
      focusEl.selectionStart = focusEl.value.length;
      focusEl.selectionEnd = focusEl.value.length;
    }
    _projectChildFocusKey = null;
  }
  bindProjectsCalendarInteractions();
  bindProjectsClickSparks();
  if (_taskPanelProjectId && typeof renderTaskPanel === 'function') renderTaskPanel();
  } finally {
    _renderProjectsInProgress = false;
  }
}
function editProjectCell(el) {
  var cell = el.closest('.proj-cell-editable');
  if (!cell || cell.classList.contains('editing')) return;
  cell.classList.add('editing');
  var inp = cell.querySelector('input');
  inp.removeAttribute('readonly');
  inp.style.pointerEvents = '';
  inp.focus();
  inp.select();
  function done() {
    cell.classList.remove('editing');
    inp.setAttribute('readonly','');
    inp.style.pointerEvents = 'none';
    var id = cell.getAttribute('data-id');
    var data = loadProjectsData();
    var p = data.projects.find(function(x){ return x.id===id; });
    if (p) {
      p.title = inp.value.trim() || p.title;
      saveProjectsData(data);
      syncProjectToActiveSheet(id, 'title_edit');
    }
  }
  inp.onblur = done;
  inp.onkeydown = function(e) { if (e.key==='Enter') { e.preventDefault(); inp.blur(); } };
}
function showProjEmojiPicker(btn, projectId) {
  var existing = document.getElementById('projEmojiPicker');
  if (existing) existing.remove();
  var picker = document.createElement('div');
  picker.id = 'projEmojiPicker';
  picker.className = 'proj-emoji-picker';
  var up = document.createElement('span');
  up.className = 'emoji-upload';
  up.textContent = '+ Своя';
  up.onclick = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function() {
        var data = loadProjectsData();
        var p = data.projects.find(function(x){ return x.id===projectId; });
        if (p) {
          p.customIcon = String(reader.result || '');
          saveProjectsData(data);
          rerenderProjectsPreserveScroll();
          syncProjectToActiveSheet(projectId, 'emoji_custom_icon');
        }
        picker.remove();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };
  picker.appendChild(up);
  PROJECT_EMOJIS.forEach(function(em) {
    var s = document.createElement('span');
    s.textContent = em;
    s.onclick = function() {
      var data = loadProjectsData();
      var p = data.projects.find(function(x){ return x.id===projectId; });
      if (p) {
        p.emoji = em;
        p.customIcon = '';
        saveProjectsData(data);
        rerenderProjectsPreserveScroll();
        syncProjectToActiveSheet(projectId, 'emoji_change');
      }
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
function showProjectStatusPicker(btn, projectId) {
  var existing = document.getElementById('projStatusPicker');
  if (existing) existing.remove();
  var picker = document.createElement('div');
  picker.id = 'projStatusPicker';
  picker.className = 'proj-status-picker';
  picker.style.position = 'fixed';
  PROJECT_STATUSES.forEach(function(st) {
    var s = document.createElement('span');
    s.textContent = st;
    s.style.background = (PROJECT_STATUS_COLORS[st]||'#666') + '22';
    s.style.color = PROJECT_STATUS_COLORS[st] || '#999';
    s.onclick = function() {
      var data = loadProjectsData();
      var p = data.projects.find(function(x){ return x.id===projectId; });
      if (p) {
        p.status = st;
        saveProjectsData(data);
        rerenderProjectsPreserveScroll();
        syncProjectToActiveSheet(projectId, 'status_change');
      }
      picker.remove();
    };
    picker.appendChild(s);
  });
  document.body.appendChild(picker);
  var r = btn.getBoundingClientRect();
  picker.style.left = Math.max(6, r.left) + 'px';
  picker.style.top = (r.bottom + 4) + 'px';
  setTimeout(function() {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener('click', close); }
    });
  }, 0);
}
function setProjectCardsActive(projectId, value) {
  setProjectCardsActiveWithDate(projectId, value, null);
}
function setProjectCardsActiveWithDate(projectId, value, date) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  p.events = (p.events || []).filter(function(e){ return e && e.type !== 'cards_count_without_active_upload'; });
  var n = parseInt(String(value || '').trim(), 10);
  if (!isFinite(n) || n <= 0) {
    p.cardsActive = '';
    p.cardsActiveDate = '';
  } else {
    p.cardsActive = String(n);
    p.cardsActiveDate = date || '';
  }
  _projectJokerDetachArmedId = null;
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'cards_active_set');
}
function toggleProjectCardsBadge(projectId) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p || !p.cardsActive) return;
  if (_projectJokerDetachArmedId !== projectId) {
    _projectJokerDetachArmedId = projectId;
  } else {
    _projectJokerDetachArmedId = null;
  }
  rerenderProjectsPreserveScroll();
}
function startCardsNumInlineEdit(projectId, dateStr, numSpan) {
  if (!numSpan || numSpan.classList.contains('cal-cards-num-editing')) return;
  var curVal = (numSpan.textContent || '').trim();
  numSpan.classList.add('cal-cards-num-editing');
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'cal-cards-num-input';
  inp.value = curVal;
  inp.style.cssText = 'width:100%;max-width:80px;font:inherit;font-weight:600;background:rgba(0,0,0,0.3);border:1px solid rgba(100,180,255,0.5);border-radius:4px;padding:2px 4px;color:inherit;text-align:center';
  function done() {
    numSpan.classList.remove('cal-cards-num-editing');
    var v = (inp.value || '').trim();
    if (inp.parentNode) inp.parentNode.replaceChild(numSpan, inp);
    setProjectCardsActiveWithDate(projectId, v, dateStr);
  }
  inp.onblur = done;
  inp.onkeydown = function(e) {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = curVal; inp.blur(); }
  };
  numSpan.parentNode.replaceChild(inp, numSpan);
  inp.focus();
  inp.select();
}
function removeProjectCardsActive(projectId) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  p.cardsActive = '';
  p.cardsActiveDate = '';
  _projectJokerDetachArmedId = null;
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'cards_active_clear');
}
function cancelCardsActiveMode() {
  _cardsActivePlacement = null;
  _cardsActiveDragging = null;
  _cardsActiveGhostEl = null;
  var g = document.getElementById('cardsActiveGhost');
  if (g) g.remove();
  document.removeEventListener('mousemove', _cardsActiveGhostOnMove);
  document.removeEventListener('click', _cardsActiveGhostOnClick, true);
  document.removeEventListener('keydown', _cardsActiveGhostOnEscape);
  if (_mustLaunchPlacement) cancelMustLaunchPlacement();
}
var _cardsActiveGhostEl = null;
var _cardsActiveGhostOnMove = function(e) {
  if (_cardsActiveGhostEl) {
    _cardsActiveGhostEl.style.left = (e.clientX + 12) + 'px';
    _cardsActiveGhostEl.style.top = (e.clientY + 12) + 'px';
  }
};
var _cardsActiveGhostOnClick = function(e) {
  var ox = 12, oy = 12;
  var cell = getCalendarCellAtPoint(e.clientX, e.clientY) || getCalendarCellAtPoint(e.clientX + ox, e.clientY + oy) || getCalendarCellFromEventTarget(e.target);
  if (!cell) { cancelCardsActiveMode(); return; }
  var pid = cell.getAttribute('data-project-id');
  var dt = cell.getAttribute('data-date');
  if (!pid || !dt) { cancelCardsActiveMode(); return; }
  if (_cardsActivePlacement) {
    setProjectCardsActiveWithDate(pid, _cardsActivePlacement.value, dt);
  } else if (_cardsActiveDragging) {
    var src = _cardsActiveDragging;
    if (pid !== src.projectId || dt !== src.sourceDate) {
      removeProjectCardsActive(src.projectId);
      setProjectCardsActiveWithDate(pid, src.value, dt);
    }
  }
  cancelCardsActiveMode();
};
var _cardsActiveGhostOnEscape = function(e) {
  if (e.key === 'Escape') cancelCardsActiveMode();
};
function startCardsActivePlacement(value) {
  if (!value) return;
  cancelCardsActiveMode();
  _cardsActivePlacement = { value: value };
  var ghost = document.createElement('div');
  ghost.id = 'cardsActiveGhost';
  ghost.className = 'cards-active-ghost';
  ghost.textContent = (value.length > 10 ? value.slice(0,10)+'…' : value);
  ghost.style.cssText = 'position:fixed;left:' + (window.innerWidth/2 - 20) + 'px;top:' + (window.innerHeight/2 - 15) + 'px;pointer-events:none;z-index:9999;';
  document.body.appendChild(ghost);
  _cardsActiveGhostEl = ghost;
  document.addEventListener('mousemove', _cardsActiveGhostOnMove);
  document.addEventListener('click', _cardsActiveGhostOnClick, true);
  document.addEventListener('keydown', _cardsActiveGhostOnEscape);
}
function startCardsActiveDrag(projectId, sourceDate) {
  var data = loadProjectsData();
  var p = (data.projects || []).find(function(x){ return x.id===projectId; });
  if (!p || !String(p.cardsActive || '').trim()) return;
  cancelCardsActiveMode();
  _cardsActiveDragging = { projectId: projectId, value: String(p.cardsActive), sourceDate: sourceDate || '' };
  var ghost = document.createElement('div');
  ghost.id = 'cardsActiveGhost';
  ghost.className = 'cards-active-ghost';
  ghost.textContent = (p.cardsActive.length > 10 ? p.cardsActive.slice(0,10)+'…' : p.cardsActive);
  ghost.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(ghost);
  _cardsActiveGhostEl = ghost;
  document.addEventListener('mousemove', _cardsActiveGhostOnMove);
  document.addEventListener('click', _cardsActiveGhostOnClick, true);
  document.addEventListener('keydown', _cardsActiveGhostOnEscape);
}
function cancelMustLaunchPlacement() {
  _mustLaunchPlacement = false;
  _mustLaunchGhostEl = null;
  var g = document.getElementById('mustLaunchGhost');
  if (g) g.remove();
  document.removeEventListener('mousemove', _mustLaunchGhostOnMove);
  document.removeEventListener('click', _mustLaunchGhostOnClick, true);
  document.removeEventListener('contextmenu', _mustLaunchGhostOnRightClick, true);
  document.removeEventListener('keydown', _mustLaunchGhostOnEscape);
}
var _mustLaunchGhostEl = null;
var _mustLaunchGhostOnMove = function(e) {
  if (_mustLaunchGhostEl) {
    _mustLaunchGhostEl.style.left = (e.clientX + 12) + 'px';
    _mustLaunchGhostEl.style.top = (e.clientY + 12) + 'px';
  }
};
var _mustLaunchGhostOnClick = function(e) {
  if (e.button !== 0) return;
  var ox = 12, oy = 12;
  var cell = getCalendarCellAtPoint(e.clientX, e.clientY) || getCalendarCellAtPoint(e.clientX + ox, e.clientY + oy) || getCalendarCellFromEventTarget(e.target);
  if (!cell) return;
  var pid = cell.getAttribute('data-project-id');
  var dt = cell.getAttribute('data-date');
  if (!pid || !dt) return;
  e.preventDefault();
  e.stopPropagation();
  setProjectMustLaunchWithDate(pid, true, dt);
};
var _mustLaunchGhostOnRightClick = function(e) {
  e.preventDefault();
  e.stopPropagation();
  cancelMustLaunchPlacement();
};
var _mustLaunchGhostOnEscape = function(e) {
  if (e.key === 'Escape') cancelMustLaunchPlacement();
};
function startMustLaunchPlacement() {
  cancelCardsActiveMode();
  cancelMustLaunchPlacement();
  _mustLaunchPlacement = true;
  var ghost = document.createElement('div');
  ghost.id = 'mustLaunchGhost';
  ghost.className = 'must-launch-ghost';
  ghost.textContent = '‼️';
  ghost.style.cssText = 'position:fixed;left:' + (window.innerWidth/2 - 15) + 'px;top:' + (window.innerHeight/2 - 15) + 'px;pointer-events:none;z-index:9999;';
  document.body.appendChild(ghost);
  _mustLaunchGhostEl = ghost;
  document.addEventListener('mousemove', _mustLaunchGhostOnMove);
  document.addEventListener('click', _mustLaunchGhostOnClick, true);
  document.addEventListener('contextmenu', _mustLaunchGhostOnRightClick, true);
  document.addEventListener('keydown', _mustLaunchGhostOnEscape);
}
function setProjectMustLaunchRequired(projectId, enabled) {
  setProjectMustLaunchWithDate(projectId, enabled, null);
}
function setProjectMustLaunchWithDate(projectId, enabled, date) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  p.events = (p.events || []).filter(function(e){ return e && e.type !== 'deadline'; });
  p.mustLaunchRequired = !!enabled;
  p.mustLaunchDate = (enabled && date) ? date : '';
  _projectMustLaunchDetachArmedId = null;
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, enabled ? 'must_launch_set' : 'must_launch_clear');
}
function toggleProjectMustLaunchBadge(projectId) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p || !p.mustLaunchRequired) return;
  if (_projectMustLaunchDetachArmedId !== projectId) {
    _projectMustLaunchDetachArmedId = projectId;
  } else {
    _projectMustLaunchDetachArmedId = null;
  }
  rerenderProjectsPreserveScroll();
}
function removeProjectMustLaunchRequired(projectId) {
  setProjectMustLaunchWithDate(projectId, false, null);
}
function toggleProjectPositions(projectId) {
  if (!projectId) return;
  _expandedProjectIds[projectId] = !_expandedProjectIds[projectId];
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function toggleProjectOptional(btn, projectId) {
  var cell = btn.closest('.proj-cell-editable');
  if (!cell) return;
  var next = !cell.classList.contains('expanded');
  cell.classList.toggle('expanded', next);
  _expandedProjectIds[projectId] = next;
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function saveProjectOptional(projectId, value) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  p.optionalField = (value || '').trim();
  saveProjectsData(data);
  syncProjectToActiveSheet(projectId, 'optional_field_update');
}
function handleProjectChildLineKey(e, projectId, idx) {
  if (e.key === 'Enter') {
    e.preventDefault();
    addProjectChildLine(projectId, idx);
  }
}
function updateProjectChildLine(projectId, idx, value) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  var lines = getProjectChildLines(p);
  lines[idx] = value;
  p.childLines = lines;
  saveProjectsData(data);
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
}
function addProjectChildLine(projectId, idx) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  ensureChildLineEvents(p);
  var lines = getProjectChildLines(p);
  var insertAt = Math.max(0, Math.min(lines.length, idx + 1));
  lines.splice(insertAt, 0, '');
  p.childLineEvents.splice(insertAt, 0, []);
  p.childLines = lines;
  _expandedProjectIds[projectId] = true;
  _projectChildFocusKey = projectId + ':' + insertAt;
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'child_line_add');
}
function removeProjectChildLine(projectId, idx) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  ensureChildLineEvents(p);
  var lines = getProjectChildLines(p);
  if (lines.length <= 1) {
    lines[0] = '';
    if (p.childLineEvents.length) p.childLineEvents[0] = [];
  } else {
    lines.splice(idx, 1);
    p.childLineEvents.splice(idx, 1);
  }
  p.childLines = lines;
  _expandedProjectIds[projectId] = true;
  _projectChildFocusKey = projectId + ':' + Math.max(0, idx - 1);
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'child_line_remove');
}
function toggleProjectPath(projectId, key) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  if (!p.clientPath || typeof p.clientPath !== 'object') {
    p.clientPath = {autoload:false,analytics:false,texts:false,packaging:false,portfolio:false};
  }
  p.clientPath[key] = !p.clientPath[key];
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'path_toggle_' + key);
}
function cycleProjectClientType(projectId) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  var order = ['old','new','returning'];
  var idx = order.indexOf(p.clientType);
  p.clientType = order[(idx + 1 + order.length) % order.length];
  saveProjectsData(data);
  rerenderProjectsPreserveScroll();
  syncProjectToActiveSheet(projectId, 'client_type_cycle');
}
function openProjectDriveFolder(projectId) {
  var data = loadProjectsData();
  var p = data.projects.find(function(x){ return x.id===projectId; });
  if (!p) return;
  var prefFolder = getProjectPreferredFolder(p);
  if (prefFolder.folderLink) {
    window.open(prefFolder.folderLink, '_blank');
  } else {
    alert('Для этого проекта еще не привязана папка в Google Drive. Выберите клиента в CRM и повторите.');
  }
}
