// ═══ GOOGLE OAUTH — жёстко задано, без переменных ═══
(function(){
  window.AVITOLOG_GOOGLE_CLIENT_ID = '98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com';
  window.AVITOLOG_GOOGLE_REDIRECT = 'https://hair1guru1school-cyber.github.io/AVITOLOG/index.html';
  window.AVITOLOG_GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';
})();
const API = 'https://api.anthropic.com/v1/messages';
const API_CORS_FALLBACKS = [
  { url: 'https://corsproxy-8uo5.onrender.com/?url=' + encodeURIComponent('https://api.anthropic.com/v1/messages'), warmup: 'https://corsproxy-8uo5.onrender.com/health', warmupDelay: 20000 },
  { url: 'https://proxy.corsfix.com/?' + encodeURIComponent('https://api.anthropic.com/v1/messages') }
];
function getApiEndpoint() {
  var custom = '';
  try {
    custom = String(localStorage.getItem('avito_api_endpoint') || '').trim();
  } catch(e) {}
  if (custom && /^https?:\/\//i.test(custom)) return custom;
  return API;
}
function promptProxy() {
  var current = '';
  try { current = String(localStorage.getItem('avito_api_endpoint') || '').trim(); } catch(e) {}
  var url = prompt('Вставь URL CORS-прокси (должен поддерживать POST с заголовками).\n\nПример (разверни свой на Render — github.com/melihbirim/corsproxy):\nhttps://ВАШ-ПРОЕКТ.onrender.com/?url=' + encodeURIComponent('https://api.anthropic.com/v1/messages') + '\n\nОставь пусто — сбросить', current || '');
  if (url === null) return;
  try {
    if (url.trim()) {
      if (!/^https?:\/\//i.test(url.trim())) { alert('URL должен начинаться с https://'); return; }
      localStorage.setItem('avito_api_endpoint', url.trim());
      alert('Прокси сохранён. Нажми «Повторить».');
    } else {
      localStorage.removeItem('avito_api_endpoint');
      alert('Прокси сброшен. Будет использован прямой API Anthropic. Нажми «Повторить».');
    }
  } catch(e) { alert('Не удалось сохранить: ' + e.message); }
}
const CRM_ROOT = '1d8oElVgTO2vzbs0HjOYPnReVmGUPltIk';
// HERO loaded from hero-asset.js

var currentTab = 'analysis';
var currentDepth = 'mid';
var analyticsMode = null; // null = не выбран, 'sasha' | 'fil'
var projectsMode = false;
var analysisSections = {demand:true, audience:true, pains:true, behavior:true, keywords:true, geo:true, summary:true};
// Восстанавливаем из localStorage (только если saved — валидный объект)
try {
  var asKey = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_analysis_sections') : 'avitolog_analysis_sections';
  var saved = JSON.parse(localStorage.getItem(asKey) || 'null');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) analysisSections = saved;
} catch(e) {}
var _timer = null, _secs = 0;
var currentHtml = '';
var currentData = null;
var lastDocId = null;  // ID последнего созданного Google Doc
var docReady = false;

// ── KP TAGS ──
function toggleKP(btn) {
  btn.classList.toggle('on');
  updateKPValue();
}
function initKP() {
  // onclick уже в HTML
}

// ── DEPTH ──
function setDepth(d) {
  currentDepth = d;
  document.querySelectorAll('.depth-btn').forEach(function(b) {
    b.classList.toggle('on', b.getAttribute('data-depth') === d);
  });
}

// ── SECTION TOGGLES ──
function toggleSec(btn) {
  var sec = btn.getAttribute('data-sec');
  analysisSections[sec] = !analysisSections[sec];
  btn.classList.toggle('on', analysisSections[sec]);
  try { localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_analysis_sections') : 'avitolog_analysis_sections'), JSON.stringify(analysisSections)); } catch(e) {}
}
function initSecBar() {
  document.querySelectorAll('.sec-btn').forEach(function(b) {
    var sec = b.getAttribute('data-sec');
    b.classList.toggle('on', !!analysisSections[sec]);
  });
}

function setAnalyticsMode(mode) {
  analyticsMode = mode;
  try { localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_analytics_mode') : 'avitolog_analytics_mode'), mode); } catch(e) {}
  var sashaBtn = document.getElementById('tumblerSasha');
  var filBtn = document.getElementById('tumblerFil');
  var reginaBtn = document.getElementById('tumblerRegina');
  if (sashaBtn) sashaBtn.classList.toggle('on', mode === 'sasha');
  if (filBtn) filBtn.classList.toggle('on', mode === 'fil');
  if (reginaBtn) reginaBtn.classList.toggle('on', mode === 'regina');
  document.getElementById('depthBar').classList.remove('muted');
  document.getElementById('secBar').classList.remove('muted');
  updateProjectsButtonVisibility();
  if (currentTab === 'analysis' && docReady && currentHtml) {
    renderDoc(currentHtml);
  }
}

var projectsMode = false;
var goalsMode = false;
var agencyMode = false;
var strategyMode = false;
var assetsMode = false;
var adsMode = false;
var _agencyTabHidden = (function(){ try{ return localStorage.getItem('av_hide_agency_tab') === '1'; } catch(e){ return false; }})();
function setAgencyTabHidden(hidden) {
  _agencyTabHidden = !!hidden;
  try { localStorage.setItem('av_hide_agency_tab', _agencyTabHidden ? '1' : '0'); } catch (e) {}
  if (_agencyTabHidden && agencyMode) openAnalyticsTab();
  updateTopRowButtons();
}
function toggleAgencyTabVisibility() {
  setAgencyTabHidden(!_agencyTabHidden);
}
function syncGoalsFunnelFromRows() {
  if (!goalsMode) return;
  var root = document.querySelector('.goals-page');
  if (!root) return;
  var rows = root.querySelectorAll('.goal-week .goal-row[data-id]');
  if (!rows || !rows.length) return;
  var sum = 0;
  var count = 0;
  rows.forEach(function(row) {
    var inp = row.querySelector('.goal-sum-inline[data-block="weekly"]');
    var txt = inp ? String(inp.value || '') : '';
    if (!txt) {
      var priceEl = row.querySelector('.goal-price,.goal-sum');
      txt = priceEl ? String(priceEl.textContent || '') : '';
    }
    var val = parseFloat(txt.replace(/\s/g, '').replace(/[^\d.]/g, '')) || 0;
    if (val <= 0) return;
    sum += val;
    count += 1;
  });
  var fmt = function(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var numEl = root.querySelector('.goal-kpi-funnel .goal-kpi-num');
  if (numEl) numEl.textContent = fmt(sum);
  var subEl = root.querySelector('.goal-kpi-funnel .goal-kpi-sub-line');
  if (subEl) subEl.textContent = String(count) + ' шт';
}
function patchGoalsRenderWithFunnelSync() {
  var api = window.AVITOLOG_GOALS;
  if (!api || typeof api.render !== 'function' || api.__funnelSyncPatched) return;
  var origRender = api.render;
  api.render = function() {
    var out = origRender.apply(api, arguments);
    try { installGoalsInlinePriceHandler(); } catch (e0) {}
    try { syncGoalsFunnelFromRows(); } catch (e) {}
    try { wireGoalsDragTargets(); } catch (e2) {}
    return out;
  };
  api.__funnelSyncPatched = true;
}
function installGoalsInlinePriceHandler() {
  window.__goalsSaveInlinePrice = function(pid, val) {
    var data;
    try { data = JSON.parse(localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1')) || '{"projects":[]}'); } catch (e) { data = { projects: [] }; }
    data.projects = Array.isArray(data.projects) ? data.projects : [];
    var p = data.projects.find(function(x) { return x && x.id === pid; });
    if (!p) return;
    var raw = String(val || '').trim();
    // Поддержка до 4 цен в одном поле: "39000, 42000 / 47000 50000"
    var nums = raw.split(/[,\n;/ ]+/).map(function(x) {
      var n = parseFloat(String(x || '').replace(/\s/g, '').replace(/[^\d.]/g, ''));
      return isFinite(n) && n > 0 ? Math.round(n) : 0;
    }).filter(function(n) { return n > 0; }).slice(0, 4);
    if (!nums.length) {
      p.mainPrice = '';
      p.priceOptions = [];
    } else {
      p.priceOptions = nums.map(function(n) { return String(n); });
      var min = Math.min.apply(null, nums);
      p.mainPrice = String(min); // в строке показываем минимальную КП
    }
    localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'), JSON.stringify(data));
    if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
      try { window.AVITOLOG_GOALS.render(); } catch (e2) {}
    }
    try { syncGoalsFunnelFromRows(); } catch (e3) {}
  };
}
function getGoalsDropClient() {
  var ac = _activeClient || getActiveClient();
  if (!ac || !ac.folderId) return null;
  var clients = getCrmClients();
  var found = clients.find(function(c) { return String(c.folderId || '') === String(ac.folderId || ''); });
  return found || ac;
}
function parseGoalsClientPrice(client) {
  if (!client) return '';
  var raw = client.kp_count || client.kp || '';
  var m = String(raw).replace(/\s/g, '').match(/(\d[\d.]*)/);
  return m && m[1] ? String(Math.round(parseFloat(m[1]) || 0)) : '';
}
function addGoalsProjectFromLeft(weekNum, beforeProjectId, targetStage) {
  var client = getGoalsDropClient();
  if (!client) return;
  var now = new Date();
  var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var name = String(client.company || client.contact_name || client.name || 'Клиент').trim();
  if (!name) return;
  var folderId = String(client.folderId || '').trim();
  var folderLink = String(client.folderLink || (folderId ? ('https://drive.google.com/drive/folders/' + folderId) : '')).trim();
  var price = parseGoalsClientPrice(client);
  var project = {
    id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
    name: name,
    emoji: '📦',
    folderLink: folderLink,
    date: dateStr,
    weekIndex: weekNum,
    mainPrice: price || '',
    priceOptions: price ? [price] : ['—'],
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
  if (folderId) project.crmClientId = folderId;
  if (targetStage === 'sold') {
    project.saleAmount = price || '';
    project.status = ['paid'];
  }
  var data;
  try { data = JSON.parse(localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1')) || '{"projects":[]}'); } catch (e) { data = { projects: [] }; }
  data.projects = Array.isArray(data.projects) ? data.projects : [];
  var keyFolder = folderId ? String(folderId) : '';
  var keyName = String(name || '').trim().toLowerCase();
  var existsIdx = data.projects.findIndex(function(x) {
    if (!x) return false;
    var isWeekly = !x.stage || x.stage === 'weekly';
    if (!isWeekly) return false;
    if (keyFolder && String(x.crmClientId || x.folderId || '') === keyFolder) return true;
    var xn = String(x.name || x.company || '').trim().toLowerCase();
    return !!(keyName && xn && xn === keyName);
  });
  if (existsIdx >= 0) {
    var ex = data.projects[existsIdx];
    ex.weekIndex = weekNum;
    ex.stage = targetStage || 'weekly';
    if (targetStage === 'sold') {
      ex.saleAmount = ex.saleAmount || ex.mainPrice || price || '';
      ex.status = ['paid'];
    }
    if (price && !ex.mainPrice) ex.mainPrice = price;
    localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'), JSON.stringify(data));
    if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
      try { window.AVITOLOG_GOALS.render(); } catch (e2) {}
    }
    try { syncGoalsFunnelFromRows(); } catch (e3) {}
    try { wireGoalsDragTargets(); } catch (e4) {}
    return;
  }
  if (beforeProjectId) {
    var idx = data.projects.findIndex(function(x) { return x && x.id === beforeProjectId; });
    if (idx >= 0) data.projects.splice(idx, 0, project);
    else data.projects.unshift(project);
  } else {
    data.projects.unshift(project);
  }
  localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'), JSON.stringify(data));
  if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
    try { window.AVITOLOG_GOALS.render(); } catch (e2) {}
  }
  try { syncGoalsFunnelFromRows(); } catch (e3) {}
  try { wireGoalsDragTargets(); } catch (e4) {}
}
function quickEditGoalPrice(projectId) {
  if (!projectId) return;
  var data;
  try { data = JSON.parse(localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1')) || '{"projects":[]}'); } catch (e) { data = { projects: [] }; }
  data.projects = Array.isArray(data.projects) ? data.projects : [];
  var p = data.projects.find(function(x) { return x && x.id === projectId; });
  if (!p) return;
  var cur = String(p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '').replace(/\s/g, '');
  var next = prompt('Введите сумму КП:', cur || '');
  if (next === null) return;
  var clean = String(next).replace(/\s/g, '').replace(/[^\d.]/g, '');
  p.mainPrice = clean || '';
  p.priceOptions = clean ? [clean] : [];
  localStorage.setItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1'), JSON.stringify(data));
  if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
    try { window.AVITOLOG_GOALS.render(); } catch (e2) {}
  }
  try { syncGoalsFunnelFromRows(); } catch (e3) {}
}
window.__goalsQuickEditPrice = quickEditGoalPrice;
function addGoalsProjectToActiveProjects(goalProject, addAtTopAndHighlight) {
  if (!goalProject || !goalProject.name) return;
  if (typeof loadProjectsData !== 'function' || typeof saveProjectsData !== 'function') return;
  var data = loadProjectsData();
  data.projects = data.projects || [];
  var projId = 'g2a_' + (goalProject.id || Date.now());
  if (data.projects.some(function(x){ return x.id === projId; })) projId = 'g2a_' + Date.now();
  var zoneItems = data.projects.filter(function(p){ return (p.zone || 'active') === 'active'; });
  var nextSort = addAtTopAndHighlight && zoneItems.length
    ? Math.min.apply(null, zoneItems.map(function(p){ return Number(p.sortOrder) || 0; })) - 1
    : (zoneItems.length ? Math.max.apply(null, zoneItems.map(function(p){ return Number(p.sortOrder) || 0; })) + 1 : 0);
  var np = {
    id: projId,
    emoji: goalProject.emoji || '📦',
    title: String(goalProject.name || '').trim() || 'Проект из целей',
    clientType: (goalProject.tags || []).indexOf('new') >= 0 ? 'new' : 'new',
    zone: 'active',
    status: 'В работе',
    sortOrder: nextSort,
    clientPath: {autoload:false,analytics:false,texts:false,packaging:false,portfolio:false},
    events: [],
    childLines: [],
    optionalField: '',
    cardsActive: '',
    mustLaunchRequired: false,
    goalsSourceId: goalProject.id
  };
  if (addAtTopAndHighlight) np._newFromGoals = true;
  if (goalProject.folderLink) np.folderLink = goalProject.folderLink;
  if (goalProject.crmClientId) np.folderId = goalProject.crmClientId;
  if (goalProject.mainPrice) np.optionalField = 'КП: ' + goalProject.mainPrice;
  data.projects.push(np);
  saveProjectsData(data);
  if (projectsMode && typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
  if (typeof syncProjectToActiveSheet === 'function') syncProjectToActiveSheet(np.id, 'goals_send_to_active');
}
window.__onGoalsProjectSentToActive = addGoalsProjectToActiveProjects;
function __goalsCreateActiveFromSold(goalProjectId) {
  var data;
  try { data = JSON.parse(localStorage.getItem((typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY('avitolog_goals_v1') : 'avitolog_goals_v1')) || '{"projects":[]}'); } catch (e) { return; }
  var p = (data.projects || []).find(function(x){ return x && x.id === goalProjectId && x.stage === 'sold'; });
  if (!p) return;
  addGoalsProjectToActiveProjects(p, true);
  if (typeof showAnalyticsReadyToast === 'function') showAnalyticsReadyToast('✓ СОЗДАН АКТИВНЫЙ проект в ПРОЕКТАХ');
  if (!projectsMode && typeof openProjectsTab === 'function') openProjectsTab();
}
function startGoalsLeftDrag(e) {
  var client = getGoalsDropClient();
  if (!client) return;
  try {
    if (e && e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', 'goals-left-client');
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
  document.body.classList.add('goals-client-dragging');
}
function endGoalsLeftDrag() {
  document.querySelectorAll('.goal-week-drop-target').forEach(function(el) { el.classList.remove('goal-week-drop-target'); });
  document.querySelectorAll('.goal-sold-drop-target').forEach(function(el) { el.classList.remove('goal-sold-drop-target'); });
  document.body.classList.remove('goals-client-dragging');
  setTimeout(function() { window.__clientDragJustHappened = false; }, 220);
}
function allowGoalsLeftDrop(e) {
  if (!getGoalsDropClient()) return;
  if (!e) return;
  e.preventDefault();
  var weekEl = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.goal-week') : null;
  if (weekEl) weekEl.classList.add('goal-week-drop-target');
  var soldEl = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.goal-block-sold') : null;
  if (soldEl) soldEl.classList.add('goal-sold-drop-target');
}
function dropGoalsLeftOnWeek(weekNum, e) {
  if (e) e.preventDefault();
  endGoalsLeftDrag();
  addGoalsProjectFromLeft(weekNum, '');
}
function dropGoalsLeftOnRow(weekNum, beforeProjectId, e) {
  if (e) e.preventDefault();
  endGoalsLeftDrag();
  addGoalsProjectFromLeft(weekNum, beforeProjectId);
}
function dropGoalsLeftToSold(e) {
  if (e) e.preventDefault();
  endGoalsLeftDrag();
  addGoalsProjectFromLeft(1, '', 'sold');
}
function wireGoalsDragTargets() {
  if (!goalsMode) return;
  document.querySelectorAll('.goal-week').forEach(function(weekEl) {
    var weekNum = parseInt(weekEl.getAttribute('data-week') || '1', 10) || 1;
    weekEl.ondragover = allowGoalsLeftDrop;
    weekEl.ondrop = function(ev) { dropGoalsLeftOnWeek(weekNum, ev); };
  });
  document.querySelectorAll('.goal-week .goal-row[data-id]').forEach(function(row) {
    var weekEl = row.closest('.goal-week');
    var weekNum = parseInt((weekEl && weekEl.getAttribute('data-week')) || '1', 10) || 1;
    var id = row.getAttribute('data-id') || '';
    row.ondragover = allowGoalsLeftDrop;
    row.ondrop = function(ev) { dropGoalsLeftOnRow(weekNum, id, ev); };
  });
  document.querySelectorAll('.goal-block-sold').forEach(function(soldEl) {
    soldEl.ondragover = allowGoalsLeftDrop;
    soldEl.ondrop = dropGoalsLeftToSold;
  });
}
if (!window.__goalsClientDragStart) window.__goalsClientDragStart = startGoalsLeftDrag;
if (!window.__goalsClientDragEnd) window.__goalsClientDragEnd = endGoalsLeftDrag;
if (!window.__goalsClientDragOver) window.__goalsClientDragOver = allowGoalsLeftDrop;
if (!window.__goalsClientDropOnWeek) window.__goalsClientDropOnWeek = dropGoalsLeftOnWeek;
if (!window.__goalsClientDropOnRow) window.__goalsClientDropOnRow = dropGoalsLeftOnRow;
if (!window.__goalsClientDropToSold) window.__goalsClientDropToSold = dropGoalsLeftToSold;
function openGoalsTab() {
  if (goalsMode) return;
  strategyMode = false;
  goalsMode = true;
  projectsMode = false;
  agencyMode = false;
  assetsMode = false;
  if (typeof closeTaskPanel === 'function') closeTaskPanel();
  document.body.classList.remove('projects-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  document.body.classList.remove('agency-mode');
  document.body.classList.remove('assets-mode');
  document.body.classList.remove('ads-mode');
  document.body.classList.add('goals-mode');
  hideChat();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  var mc = document.getElementById('mainContent');
  if (mc) {
    mc.innerHTML = '<div class="empty-st" style="padding:40px"><div style="font-size:32px;opacity:.4">&#128197;</div><p style="margin-top:12px">Загрузка CRM...</p></div>';
    mc.style.display = '';
    mc.scrollTop = 0;
    var wrap = mc.closest('.content-wrap');
    if (wrap) wrap.scrollTop = 0;
  }
  function doRender() {
    var mc = document.getElementById('mainContent');
    if (!mc) {
      console.warn('Goals: mainContent not found');
      return;
    }
    try {
      var api = window.AVITOLOG_GOALS;
      var lastErr = null;
      if (api && typeof api.render === 'function') {
        try {
          api.render();
          patchGoalsRenderWithFunnelSync();
          try { syncGoalsFunnelFromRows(); } catch (e0) {}
          return;
        } catch (e) {
          lastErr = e;
          console.error('Goals render failed', e);
        }
      }
      var legacy = window.__AVITOLOG_GOALS_LEGACY;
      if (legacy && legacy !== api && typeof legacy.render === 'function') {
        try {
          window.AVITOLOG_GOALS = legacy;
          legacy.render();
          patchGoalsRenderWithFunnelSync();
          try { syncGoalsFunnelFromRows(); } catch (e1) {}
          return;
        } catch (e2) {
          lastErr = e2;
          console.error('Goals legacy render failed', e2);
        }
      }
      var errMsg = lastErr ? (lastErr.message || String(lastErr)) : 'Модуль целей не загрузился';
      var escMsg = String(errMsg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.2">&#128197;</div><p>CRM</p><p style="font-size:12px;opacity:.6;margin-top:8px">' + escMsg + '</p><p style="font-size:11px;opacity:.5;margin-top:6px">Обнови страницу (F5) или открой консоль (F12) для деталей</p></div>';
    } catch (err) {
      console.error('Goals doRender error', err);
      if (mc) mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.2">&#128197;</div><p>CRM</p><p style="font-size:12px;opacity:.6;margin-top:8px">Ошибка: ' + String(err && err.message || err) + '</p></div>';
    }
  }
  setTimeout(doRender, 0);
  updateTopRowButtons();
}
function openProjectsTab() {
  if (projectsMode) {
    updateProjectsButtonVisibility();
    return;
  }
  goalsMode = false;
  agencyMode = false;
  strategyMode = false;
  assetsMode = false;
  projectsMode = true;
  document.body.classList.remove('goals-mode');
  document.body.classList.remove('agency-mode');
  document.body.classList.remove('strategy-mode');
  document.body.classList.remove('assets-mode');
  document.body.classList.remove('ads-mode');
  document.body.classList.add('projects-mode');
  if (typeof localStorage !== 'undefined' && localStorage.getItem('avitolog_projects_sidebar_hidden') === '1') document.body.classList.add('projects-sidebar-hidden');
  hideChat();
  updateProjectsSidebarOffset();
  _projectsZoneTab = 'active';
  _projectsDidInitialCenter = false;
  renderProjectsScreen();
  startProjectsSheetPullTimer();
  startProjectsDayShiftTimer();
  syncActiveProjectsSheetExact('calendar_snapshot_open').catch(function(){});
  updateTopRowButtons();
}
function openAnalyticsTab() {
  goalsMode = false;
  agencyMode = false;
  strategyMode = false;
  assetsMode = false;
  adsMode = false;
  projectsMode = false;
  if (typeof closeTaskPanel === 'function') closeTaskPanel();
  document.body.classList.remove('projects-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  document.body.classList.remove('goals-mode');
  document.body.classList.remove('agency-mode');
  document.body.classList.remove('strategy-mode');
  document.body.classList.remove('assets-mode');
  document.body.classList.remove('ads-mode');
  updateProjectsSidebarOffset();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  if (currentTab === 'analysis' && docReady && currentHtml) { renderDoc(currentHtml); } else { refreshClientContents(); }
  updateTopRowButtons();
}
function openAssetsTab() {
  if (assetsMode) return;
  goalsMode = false;
  projectsMode = false;
  agencyMode = false;
  strategyMode = false;
  adsMode = false;
  assetsMode = true;
  document.body.classList.remove('projects-mode', 'goals-mode', 'agency-mode', 'strategy-mode', 'ads-mode');
  document.body.classList.add('assets-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  hideChat();
  if (typeof closeTaskPanel === 'function') closeTaskPanel();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  var mc = document.getElementById('mainContent');
  if (mc) {
    mc.innerHTML = '';
    mc.style.display = '';
    mc.scrollTop = 0;
  }
  if (typeof window.__renderAssetsPage === 'function') {
    window.__renderAssetsPage();
  } else {
    if (mc) mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.2">&#128176;</div><p>КАССА</p><p style="font-size:12px;opacity:.6">Загрузка...</p></div>';
  }
  updateTopRowButtons();
}
function ensureAdsRendererLoaded(onReady, onFail) {
  if (typeof window.__showAdsPage === 'function') {
    if (typeof onReady === 'function') onReady();
    return;
  }
  var existing = document.querySelector('script[data-ads-loader="1"]');
  if (existing) {
    existing.addEventListener('load', function() {
      if (typeof window.__showAdsPage === 'function') {
        if (typeof onReady === 'function') onReady();
      } else if (typeof onFail === 'function') onFail();
    }, { once: true });
    existing.addEventListener('error', function() {
      if (typeof onFail === 'function') onFail();
    }, { once: true });
    return;
  }
  var s = document.createElement('script');
  s.src = 'js/ads.js?v=' + Date.now();
  s.async = false;
  s.setAttribute('data-ads-loader', '1');
  s.onload = function() {
    if (typeof window.__showAdsPage === 'function') {
      if (typeof onReady === 'function') onReady();
    } else if (typeof onFail === 'function') onFail();
  };
  s.onerror = function() {
    if (typeof onFail === 'function') onFail();
  };
  document.head.appendChild(s);
}
function renderAdsIntoMainContent(mc) {
  if (!mc) return;
  mc.innerHTML = '';
  mc.style.display = '';
  mc.scrollTop = 0;
  if (typeof window.__showAdsPage === 'function') {
    try {
      window.__showAdsPage(mc);
    } catch (e) {
      mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.25">&#9888;</div><p>ADS</p><p style="font-size:12px;opacity:.7">Ошибка рендера ADS: ' + esc(String((e && e.message) || e || 'unknown')) + '</p></div>';
    }
  } else {
    mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.2">&#128226;</div><p>ADS</p><p style="font-size:12px;opacity:.6">Загрузка...</p></div>';
    ensureAdsRendererLoaded(function() {
      if (!adsMode) return;
      if (typeof window.__showAdsPage === 'function') {
        try { window.__showAdsPage(mc); }
        catch (e) {
          mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.25">&#9888;</div><p>ADS</p><p style="font-size:12px;opacity:.7">Ошибка рендера ADS: ' + esc(String((e && e.message) || e || 'unknown')) + '</p></div>';
        }
      }
    }, function() {
      if (!adsMode) return;
      mc.innerHTML = '<div class="empty-st"><div style="font-size:38px;opacity:.25">&#9888;</div><p>ADS</p><p style="font-size:12px;opacity:.65">Не удалось загрузить модуль ADS</p></div>';
    });
  }
}
function openAdsTab() {
  if (adsMode) {
    renderAdsIntoMainContent(document.getElementById('mainContent'));
    updateTopRowButtons();
    return;
  }
  goalsMode = false;
  projectsMode = false;
  agencyMode = false;
  strategyMode = false;
  assetsMode = false;
  adsMode = true;
  document.body.classList.remove('projects-mode', 'goals-mode', 'agency-mode', 'strategy-mode', 'assets-mode');
  document.body.classList.add('ads-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  hideChat();
  if (typeof closeTaskPanel === 'function') closeTaskPanel();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  var mc = document.getElementById('mainContent');
  renderAdsIntoMainContent(mc);
  updateTopRowButtons();
}
function openAgencyTab() {
  if (_agencyTabHidden) return;
  if (agencyMode) return;
  goalsMode = false;
  projectsMode = false;
  strategyMode = false;
  assetsMode = false;
  adsMode = false;
  agencyMode = true;
  document.body.classList.remove('projects-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  document.body.classList.remove('goals-mode');
  document.body.classList.remove('strategy-mode');
  document.body.classList.remove('assets-mode');
  document.body.classList.remove('ads-mode');
  document.body.classList.add('agency-mode');
  hideChat();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  renderAgencyPage();
  updateTopRowButtons();
}
function openStrategyTab() {
  if (strategyMode) return;
  goalsMode = false;
  projectsMode = false;
  agencyMode = false;
  assetsMode = false;
  adsMode = false;
  strategyMode = true;
  if (typeof closeTaskPanel === 'function') closeTaskPanel();
  document.body.classList.remove('projects-mode');
  document.body.classList.remove('projects-sidebar-hidden');
  document.body.classList.remove('goals-mode');
  document.body.classList.remove('agency-mode');
  document.body.classList.remove('assets-mode');
  document.body.classList.remove('ads-mode');
  document.body.classList.add('strategy-mode');
  hideChat();
  stopProjectsSheetPullTimer();
  stopProjectsDayShiftTimer();
  if (typeof strategyGetTelegramStatus === 'function') strategyGetTelegramStatus();
  if (!_strategySelectedProjectId && typeof loadProjectsData === 'function') {
    var data = loadProjectsData();
    var projs = (data && data.projects) || [];
    var withChat = projs.find(function(p){ return p.telegramChatId; });
    _strategySelectedProjectId = (withChat && withChat.id) || (projs[0] && projs[0].id) || null;
  }
  renderStrategyPage();
  updateTopRowButtons();
}
function toggleProjectsScreen() {
  if (projectsMode) openAnalyticsTab();
  else openProjectsTab();
}
var _topTabOrder = (function(){ try{ var s=localStorage.getItem('av_top_tab_order'); return s ? JSON.parse(s) : ['goals','analytics','projects','assets','ads','strategy','agency']; }catch(e){ return ['goals','analytics','projects','assets','ads','strategy','agency']; }})();
function applyTopTabOrder() {
  var row = document.getElementById('analyticsTopRow');
  if (!row) return;
  var btns = Array.from(row.querySelectorAll('.btn-projects[data-tab]'));
  var order = _topTabOrder.slice();
  ['goals','analytics','projects','assets','ads','strategy','agency'].forEach(function(t) { if (order.indexOf(t) < 0) order.push(t); });
  var ordered = order.map(function(t){ return btns.find(function(b){ return b.getAttribute('data-tab')===t; }); }).filter(Boolean);
  ordered.forEach(function(b){ row.appendChild(b); });
}
var _topTabDragTab = null;
function topTabDragStart(e, tab) { _topTabDragTab = tab; e.dataTransfer.setData('text/plain', tab); e.dataTransfer.effectAllowed = 'move'; (e.target&&e.target.classList)&&e.target.classList.add('top-tab-dragging'); }
function topTabDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; var t = e.target && e.target.closest && e.target.closest('.btn-projects[data-tab]'); if (t && t !== document.querySelector('.top-tab-dragging')) t.classList.add('top-tab-drop-target'); }
function topTabDragLeave(e) { var t = e.target && e.target.closest && e.target.closest('.btn-projects[data-tab]'); if (t) t.classList.remove('top-tab-drop-target'); }
function topTabDrop(e, tab) { e.preventDefault(); document.querySelectorAll('.btn-projects.top-tab-drop-target').forEach(function(el){ el.classList.remove('top-tab-drop-target'); }); if (!_topTabDragTab || _topTabDragTab === tab) return; var idx = _topTabOrder.indexOf(_topTabDragTab); var targetIdx = _topTabOrder.indexOf(tab); if (idx < 0 || targetIdx < 0) return; _topTabOrder.splice(idx, 1); targetIdx = _topTabOrder.indexOf(tab); _topTabOrder.splice(targetIdx, 0, _topTabDragTab); try { localStorage.setItem('av_top_tab_order', JSON.stringify(_topTabOrder)); } catch(err) {} applyTopTabOrder(); }
function topTabDragEnd(e) { _topTabDragTab = null; document.querySelectorAll('.btn-projects.top-tab-dragging, .btn-projects.top-tab-drop-target').forEach(function(el){ el.classList.remove('top-tab-dragging','top-tab-drop-target'); }); }
function updateProjectsButtonVisibility() { updateTopRowButtons(); }
function updateTopRowButtons() {
  var btnGoals = document.getElementById('btnGoals');
  var ret = document.getElementById('btnProjectsReturn');
  var btn = document.getElementById('btnProjects');
  var btnAssets = document.getElementById('btnAssets');
  var btnStrategy = document.getElementById('btnStrategy');
  var btnAgency = document.getElementById('btnAgency');
  var btnAgencyHide = document.getElementById('btnAgencyHide');
  var row = document.getElementById('analyticsTopRow');
  if (!row) return;
  row.style.display = 'flex';
  if (btnGoals) btnGoals.classList.toggle('is-on', goalsMode);
  if (ret) ret.classList.toggle('is-on', !projectsMode && !goalsMode && !agencyMode && !strategyMode && !assetsMode && !adsMode);
  if (btn) btn.classList.toggle('is-on', projectsMode);
  if (btnAssets) btnAssets.classList.toggle('is-on', assetsMode);
  var btnAds = document.getElementById('btnAds');
  if (btnAds) btnAds.classList.toggle('is-on', adsMode);
  if (btnStrategy) btnStrategy.classList.toggle('is-on', strategyMode);
  var btnStrategyFloat = document.getElementById('btnStrategyFloat');
  if (btnStrategyFloat) btnStrategyFloat.classList.toggle('is-on', strategyMode);
  if (btnAgency) btnAgency.classList.toggle('is-on', agencyMode);
  if (btnAgency) btnAgency.style.display = _agencyTabHidden ? 'none' : '';
  if (btnAgencyHide) {
    btnAgencyHide.classList.toggle('on', _agencyTabHidden);
    btnAgencyHide.textContent = _agencyTabHidden ? '👁' : '🙈';
    btnAgencyHide.title = _agencyTabHidden ? 'Показать вкладку Агентство' : 'Скрыть вкладку Агентство';
  }
  updateProjectsSidebarOffset();
}
function updateProjectsSidebarOffset() {
  var row = document.getElementById('analyticsTopRow');
  var off = 0;
  if (projectsMode && row) {
    var cs = getComputedStyle(row);
    if (cs.display !== 'none') off = row.offsetHeight || 0;
  }
  document.documentElement.style.setProperty('--projects-sidebar-offset', off + 'px');
}

var AGENCY_AVITO_CFG_KEY = 'agency_avito_cfg_v1';
function getAgencyAvitoCfg() {
  try { return JSON.parse(localStorage.getItem(AGENCY_AVITO_CFG_KEY) || '{}') || {}; } catch(e) { return {}; }
}
function saveAgencyAvitoCfg(cfg) {
  try { localStorage.setItem(AGENCY_AVITO_CFG_KEY, JSON.stringify(cfg || {})); } catch(e) {}
}
function getAgencyAnalyticsSnapshot() {
  var cityVal = (typeof getGeoValues === 'function' ? getGeoValues().join(', ') : '') || (typeof v === 'function' ? v('city') : '');
  return {
    company: (typeof v === 'function' ? v('company') : ''),
    name: (typeof v === 'function' ? v('contact_name') : ''),
    category: (typeof v === 'function' ? v('category') : ''),
    city: cityVal || '',
    kp: (typeof v === 'function' ? v('kp_count') : ''),
    avito: (typeof v === 'function' ? v('avito_account') : ''),
    status: docReady ? 'Готово' : 'Не сгенерировано',
    tab: currentTab || 'analysis'
  };
}
function renderAgencyPage() {
  var cfg = getAgencyAvitoCfg();
  var snap = getAgencyAnalyticsSnapshot();
  var esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var mc = document.getElementById('mainContent');
  if (!mc) return;
  mc.innerHTML = '<div class="agency-wrap">' +
    '<div class="agency-title">🏢 Агентство — интеграция Avito</div>' +
    '<div class="agency-grid">' +
      '<div class="agency-card">' +
        '<h3>Подключение аккаунта</h3>' +
        '<div class="agency-row"><label>Client ID</label><input id="agencyAvitoClientId" type="text" placeholder="Введите Client ID" value="' + esc(cfg.clientId || '') + '"></div>' +
        '<div class="agency-row"><label>Client Secret</label><input id="agencyAvitoClientSecret" type="password" placeholder="Введите Client Secret" value="' + esc(cfg.clientSecret || '') + '"></div>' +
        '<div class="agency-row"><label>Access Token</label><input id="agencyAvitoAccessToken" type="password" placeholder="Bearer token" value="' + esc(cfg.accessToken || '') + '"></div>' +
        '<div class="agency-actions">' +
          '<button class="agency-btn" type="button" onclick="saveAgencyAvitoSettings()">Сохранить</button>' +
          '<button class="agency-btn secondary" type="button" onclick="testAgencyAvitoConnection()">Подключить и проверить</button>' +
        '</div>' +
        '<div class="agency-status" id="agencyAvitoStatus">Статус: не проверено</div>' +
        '<div class="agency-kpi-row">' +
          '<div class="agency-kpi"><div class="agency-kpi-label">Баланс аккаунта</div><div class="agency-kpi-value" id="agencyKpiBalance">—</div></div>' +
          '<div class="agency-kpi"><div class="agency-kpi-label">Активные объявления</div><div class="agency-kpi-value" id="agencyKpiActive">—</div></div>' +
        '</div>' +
        '<div class="agency-account-box" id="agencyAvitoAccountInfo" style="display:none"></div>' +
      '</div>' +
      '<div class="agency-card">' +
        '<h3>Что дальше</h3>' +
        '<div class="agency-status">1) Вставьте данные аккаунта Avito.\n2) Нажмите «Проверить API».\n3) После успешной проверки добавим: объявления, чаты, статистику и автообновление внутри CRM.</div>' +
      '</div>' +
      '<div class="agency-card">' +
        '<h3>Данные аналитики (текущие)</h3>' +
        '<div class="agency-account-box" style="display:block">' +
          '<div class="agency-account-line">Статус генерации: <b>' + esc(snap.status) + '</b></div>' +
          '<div class="agency-account-line">Текущая вкладка: <b>' + esc(snap.tab) + '</b></div>' +
          '<div class="agency-account-line">Компания: <b>' + esc(snap.company || '—') + '</b></div>' +
          '<div class="agency-account-line">Контакт: <b>' + esc(snap.name || '—') + '</b></div>' +
          '<div class="agency-account-line">Ниша: <b>' + esc(snap.category || '—') + '</b></div>' +
          '<div class="agency-account-line">ГЕО: <b>' + esc(snap.city || '—') + '</b></div>' +
          '<div class="agency-account-line">КП: <b>' + esc(snap.kp || '—') + '</b></div>' +
          '<div class="agency-account-line">Avito: <b>' + esc(snap.avito || '—') + '</b></div>' +
        '</div>' +
        '<div class="agency-actions" style="margin-top:8px">' +
          '<button class="agency-btn secondary" type="button" onclick="renderAgencyPage()">Обновить данные</button>' +
          '<button class="agency-btn secondary" type="button" onclick="openAnalyticsTab()">Открыть аналитику</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

var STRATEGY_TG_KEY = 'avitolog_strategy_telegram_v1';
var STRATEGY_MSGS_KEY = 'avitolog_strategy_messages_v1';
var STRATEGY_API_BASE = 'http://127.0.0.1:5050'; /* Telegram-бэкенд. Запусти: python scripts/telegram_backend.py */
/* Токен бота: НИКОГДА не хранить во фронтенде! Только на бэкенде в переменных окружения. Для виджета нужен только username бота. */
var _strategyTgState = { connected: false, username: '', autoAnalysis: false, lastSync: null, monitoredChats: 0 };

function getStrategyTelegram() {
  try { return JSON.parse(localStorage.getItem(STRATEGY_TG_KEY) || '{}'); } catch(e) { return {}; }
}
function saveStrategyTelegram(cfg) {
  try { localStorage.setItem(STRATEGY_TG_KEY, JSON.stringify(cfg || {})); } catch(e) {}
}

window.onTelegramAuth = function(user) {
  if (!user) return;
  var un = (user.username || user.first_name || '').trim();
  if (!un) un = 'user_' + (user.id || '');
  if (un && un.charAt(0) !== '@') un = '@' + un;
  var tg = getStrategyTelegram();
  tg.telegramAccountConnected = true;
  tg.telegramUsername = un;
  tg.telegramUserId = user.id;
  tg.telegramFirstName = user.first_name || '';
  tg.telegramLastName = user.last_name || '';
  tg.lastSync = Date.now();
  saveStrategyTelegram(tg);
  _strategyTgState = { connected: true, username: tg.telegramUsername, autoAnalysis: !!tg.autoAnalysis, lastSync: tg.lastSync, monitoredChats: countMonitoredChats() };
  if (strategyMode) renderStrategyPage();
};
function strategySaveBotAndShowWidget() {
  var inp = document.getElementById('strategyTgBotInput');
  var botName = (inp && inp.value || '').trim().replace(/^@/,'');
  if (!botName) { alert('Введите имя бота'); return; }
  var tg = getStrategyTelegram();
  tg.telegramBotUsername = botName;
  saveStrategyTelegram(tg);
  strategyInjectTelegramWidget(botName);
}
function strategyInjectTelegramWidget(botName) {
  var container = document.getElementById('strategyTgLoginContainer');
  if (!container) return;
  botName = (botName || (getStrategyTelegram().telegramBotUsername || '')).trim().replace(/^@/,'');
  if (!botName) return;
  container.innerHTML = '';
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', botName);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-radius', '8');
  script.setAttribute('data-onauth', 'onTelegramAuth(user)');
  script.setAttribute('data-request-access', 'write');
  container.appendChild(script);
}
var _strategyTgPendingPhone = '';
function strategyTgSendCode() {
  var phone = (document.getElementById('strategyTgPhone') || {}).value || '';
  phone = phone.replace(/\s/g,'').replace(/^8/,'+7');
  if (!phone) { strategyTgAuthMsg('Введите номер телефона'); return; }
  if (phone.length < 10) { strategyTgAuthMsg('Неверный формат'); return; }
  if (phone.charAt(0) !== '+') phone = '+' + phone;
  _strategyTgPendingPhone = phone;
  strategyTgAuthMsg('Отправляю код...');
  fetch(STRATEGY_API_BASE + '/api/strategy/telegram/send-code', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: phone }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) {
        strategyTgAuthMsg('Код отправлен в Telegram. Введите его ниже.');
        document.getElementById('strategyTgCode').style.display = 'block';
        document.getElementById('strategyTgCode').value = '';
        document.getElementById('strategyTgCode').focus();
        document.getElementById('strategyTgSignInBtn').style.display = 'inline-block';
      } else strategyTgAuthMsg(d.error || 'Ошибка');
    })
    .catch(function(e){ strategyTgAuthMsg('Ошибка: ' + (e.message||'нет связи с бэкендом')); });
}
function strategyTgSignIn() {
  var code = (document.getElementById('strategyTgCode') || {}).value || '';
  if (!code) { strategyTgAuthMsg('Введите код'); return; }
  strategyTgAuthMsg('Вход...');
  fetch(STRATEGY_API_BASE + '/api/strategy/telegram/sign-in', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: _strategyTgPendingPhone, code: code }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) {
        var tg = getStrategyTelegram();
        tg.telegramAccountConnected = true;
        tg.telegramUsername = d.username || '';
        tg.lastSync = Date.now();
        saveStrategyTelegram(tg);
        _strategyTgState = { connected: true, username: tg.telegramUsername, autoAnalysis: !!tg.autoAnalysis, lastSync: tg.lastSync, monitoredChats: countMonitoredChats() };
        if (strategyMode) renderStrategyPage();
      } else if (d.needPassword) {
        strategyTgAuthMsg('Нужен пароль 2FA');
        document.getElementById('strategyTgPassword').style.display = 'block';
        document.getElementById('strategyTgPasswordBtn').style.display = 'inline-block';
      } else strategyTgAuthMsg(d.error || 'Ошибка');
    })
    .catch(function(e){ strategyTgAuthMsg('Ошибка: ' + (e.message||'нет связи')); });
}
function strategyTgSignInPassword() {
  var pw = (document.getElementById('strategyTgPassword') || {}).value || '';
  if (!pw) { strategyTgAuthMsg('Введите пароль'); return; }
  strategyTgAuthMsg('Вход...');
  fetch(STRATEGY_API_BASE + '/api/strategy/telegram/sign-in-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: _strategyTgPendingPhone, password: pw }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) {
        var tg = getStrategyTelegram();
        tg.telegramAccountConnected = true;
        tg.telegramUsername = d.username || '';
        tg.lastSync = Date.now();
        saveStrategyTelegram(tg);
        _strategyTgState = { connected: true, username: tg.telegramUsername, autoAnalysis: !!tg.autoAnalysis, lastSync: tg.lastSync, monitoredChats: countMonitoredChats() };
        if (strategyMode) renderStrategyPage();
      } else strategyTgAuthMsg(d.error || 'Ошибка');
    })
    .catch(function(e){ strategyTgAuthMsg('Ошибка: ' + (e.message||'нет связи')); });
}
function strategyTgAuthMsg(txt) {
  var el = document.getElementById('strategyTgAuthMsg');
  if (el) el.textContent = txt || '';
}
function strategyConnectTelegram() {
  if (STRATEGY_API_BASE) {
    var ph = document.getElementById('strategyTgPhone');
    if (ph) { ph.focus(); ph.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    return;
  }
  var tg = getStrategyTelegram();
  tg.telegramAccountConnected = true;
  tg.telegramUsername = tg.telegramUsername || 'demo@user';
  tg.lastSync = Date.now();
  saveStrategyTelegram(tg);
  _strategyTgState = { connected: true, username: tg.telegramUsername, autoAnalysis: !!tg.autoAnalysis, lastSync: tg.lastSync, monitoredChats: countMonitoredChats() };
  if (strategyMode) renderStrategyPage();
}
function strategyDisconnectTelegram() {
  if (STRATEGY_API_BASE) {
    fetch(STRATEGY_API_BASE + '/api/strategy/telegram/disconnect', { method: 'POST' }).then(function(){ strategyGetTelegramStatus(); }).catch(function(){});
    return;
  }
  var tg = getStrategyTelegram();
  tg.telegramAccountConnected = false;
  tg.telegramUsername = '';
  saveStrategyTelegram(tg);
  _strategyTgState = { connected: false, username: '', autoAnalysis: false, lastSync: null, monitoredChats: 0 };
  if (strategyMode) renderStrategyPage();
}
function strategyGetTelegramStatus() {
  if (STRATEGY_API_BASE) {
    fetch(STRATEGY_API_BASE + '/api/strategy/telegram/status').then(function(r){ return r.json(); }).then(function(d){
      _strategyTgState = { connected: !!d.connected, username: d.username || '', autoAnalysis: !!d.autoAnalysis, lastSync: d.lastSync || null, monitoredChats: d.monitoredChats || 0 };
      if (strategyMode) renderStrategyPage();
    }).catch(function(){});
    return;
  }
  var tg = getStrategyTelegram();
  _strategyTgState = { connected: !!tg.telegramAccountConnected, username: tg.telegramUsername || '', autoAnalysis: !!tg.autoAnalysis, lastSync: tg.lastSync || null, monitoredChats: countMonitoredChats() };
}
function strategySyncTelegramChats() {
  if (STRATEGY_API_BASE) {
    fetch(STRATEGY_API_BASE + '/api/strategy/telegram/sync', { method: 'POST' }).then(function(r){ return r.json(); }).then(function(d){
      _strategyTgState.lastSync = d.lastSync || Date.now();
      _strategyTgState.monitoredChats = d.monitoredChats || _strategyTgState.monitoredChats;
      if (strategyMode) renderStrategyPage();
    }).catch(function(){});
    return;
  }
  var tg = getStrategyTelegram();
  tg.lastSync = Date.now();
  saveStrategyTelegram(tg);
  _strategyTgState.lastSync = tg.lastSync;
  _strategyTgState.monitoredChats = countMonitoredChats();
  if (strategyMode) renderStrategyPage();
  return tg.lastSync;
}
function countMonitoredChats() {
  var data = typeof loadProjectsData === 'function' ? loadProjectsData() : { projects: [] };
  return (data.projects || []).filter(function(p){ return !!(p.telegramChatId && (p.telegramMonitoringEnabled !== false)); }).length;
}
function strategyGetProjectChats(projectId, cb) {
  if (STRATEGY_API_BASE) {
    fetch(STRATEGY_API_BASE + '/api/strategy/chats?projectId=' + encodeURIComponent(projectId || '')).then(function(r){ return r.json(); }).then(function(d){ if (cb) cb(d.chats || []); }).catch(function(){ if (cb) cb([]); });
    return;
  }
  if (cb) cb([]);
}
var _strategyApiMessages = {};
function strategyGetProjectMessages(projectId, cb) {
  if (STRATEGY_API_BASE) {
    var p = (typeof loadProjectsData === 'function' ? loadProjectsData() : {}).projects || [];
    var proj = p.find(function(x){ return x.id === projectId; });
    var chatId = proj && proj.telegramChatId ? proj.telegramChatId : projectId;
    fetch(STRATEGY_API_BASE + '/api/strategy/messages?chatId=' + encodeURIComponent(chatId)).then(function(r){ return r.json(); }).then(function(d){ if (cb) cb(d.messages || []); }).catch(function(){ if (cb) cb([]); });
    return;
  }
  var p = (typeof loadProjectsData === 'function' ? loadProjectsData() : {}).projects || [];
  var proj = p.find(function(x){ return x.id === projectId; });
  if (!proj || !proj.telegramChatId || !cb) return;
  var messagesAll = getStrategyMessages();
  var msgs = messagesAll[(projectId||'') + '_' + (proj.telegramChatId||'')] || [];
  cb(msgs);
}
function strategyAnalyzeProjectMessages(projectId, cb) {
  if (STRATEGY_API_BASE) {
    fetch(STRATEGY_API_BASE + '/api/strategy/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ projectId: projectId }) }).then(function(r){ return r.json(); }).then(function(d){ if (cb) cb(d); }).catch(function(){ if (cb) cb(null); });
    return;
  }
  if (cb) cb(null);
}
function strategyCreateTaskFromSuggestionApi(projectId, suggestionId) {
  if (!STRATEGY_API_BASE) return;
  var suggestions = _strategySuggestionsByProject[projectId] || [];
  var s = suggestions.find(function(x){ return (x.id||'') === suggestionId; });
  fetch(STRATEGY_API_BASE + '/api/strategy/task/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ projectId: projectId, suggestionId: suggestionId }) }).then(function(r){ return r.json(); }).then(function(d){
    if (d && d.taskId && typeof addTask === 'function') addTask({ id: d.taskId, projectId: projectId, title: d.title || (s && s.title) || '', type: (s && s.type) || 'text', status: 'new' });
    if (s) { s.status = 'convertedToTask'; _strategySuggestionsByProject[projectId] = suggestions; }
    if (typeof renderTaskPanel === 'function') renderTaskPanel();
    if (strategyMode) renderStrategyPage();
  }).catch(function(){});
}
function strategyToggleAutoAnalysis() {
  var tg = getStrategyTelegram();
  tg.autoAnalysis = !tg.autoAnalysis;
  saveStrategyTelegram(tg);
  _strategyTgState.autoAnalysis = !!tg.autoAnalysis;
  if (strategyMode) renderStrategyPage();
}
function getStrategyMessages() {
  try { return JSON.parse(localStorage.getItem(STRATEGY_MSGS_KEY) || '{}'); } catch(e) { return {}; }
}
function saveStrategyMessages(byKey) {
  try { localStorage.setItem(STRATEGY_MSGS_KEY, JSON.stringify(byKey || {})); } catch(e) {}
}
function strategySeedDemoMessages(projectId, chatId) {
  var messagesAll = getStrategyMessages();
  var msgKey = (projectId||'') + '_' + (chatId||'');
  if (messagesAll[msgKey] && messagesAll[msgKey].length > 0) return;
  var now = new Date();
  var ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + 'T' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  messagesAll[msgKey] = [
    { id: 'm1', author: 'client', messageText: 'Добавь больше фото и поменяй заголовок', timestamp: ts, labels: ['правка','просьба'], analysisStatus: 'new' },
    { id: 'm2', author: 'me', messageText: 'Хорошо, сделаю сегодня', timestamp: ts, labels: [], analysisStatus: 'new' }
  ];
  saveStrategyMessages(messagesAll);
}
var _strategySelectedProjectId = null;
var _strategySuggestionsByProject = {}; // projectId -> [{title,type,confidence,messageIds,status}]
var _strategyAnalysisByProject = {}; // projectId -> {requests,edits,important,tasks,summary}

function renderStrategyPage() {
  var mc = document.getElementById('mainContent');
  if (!mc) return;
  var tg = getStrategyTelegram();
  var messagesAll = getStrategyMessages();
  var data = typeof loadProjectsData === 'function' ? loadProjectsData() : { projects: [] };
  var projects = (data.projects || []).slice(0, 50);
  var esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  var st = _strategyTgState;
  var fmtTime = function(ts){ if (!ts) return '—'; var d=new Date(ts); return isNaN(d.getTime())?'—':d.toLocaleString('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); };
  var leftHtml = '<div class="strategy-col-title">TELEGRAM — АВТОРИЗАЦИЯ</div>';
  leftHtml += '<div class="strategy-tg-settings">';
  leftHtml += '<div class="strategy-tg-row"><span class="strategy-tg-label">Подключение</span><span class="strategy-tg-value ' + (st.connected ? 'connected' : 'off') + '">' + (st.connected ? 'Подключен' : 'Не подключен') + '</span></div>';
  leftHtml += '<div class="strategy-tg-row"><span class="strategy-tg-label">Авто-анализ</span><span class="strategy-auto-toggle ' + (st.autoAnalysis ? 'on' : '') + '" onclick="strategyToggleAutoAnalysis()" title="Переключить">' + (st.autoAnalysis ? 'ВКЛ' : 'ВЫКЛ') + '</span></div>';
  leftHtml += '<div class="strategy-tg-row"><span class="strategy-tg-label">Синхронизация</span><span class="strategy-tg-value">' + esc(fmtTime(st.lastSync)) + '</span></div>';
  leftHtml += '<div class="strategy-tg-row"><span class="strategy-tg-label">Чатов под мониторингом</span><span class="strategy-tg-value">' + (st.monitoredChats || 0) + '</span></div>';
  if (st.connected) {
    leftHtml += '<div class="strategy-tg-row"><span class="strategy-tg-label">Аккаунт</span><span class="strategy-tg-value connected">' + esc(st.username || '—') + '</span></div>';
    leftHtml += '<div class="strategy-tg-btns">';
    leftHtml += '<button type="button" class="strategy-tg-btn" onclick="strategyDisconnectTelegram()">Отключить</button>';
    leftHtml += '<button type="button" class="strategy-tg-btn" onclick="strategySyncTelegramChats()">Обновить синхронизацию</button>';
    leftHtml += '</div>';
  } else if (STRATEGY_API_BASE) {
    leftHtml += '<div class="strategy-tg-widget-wrap strategy-tg-phone-wrap">';
    leftHtml += '<div class="strategy-tg-bot-hint">Вход через телефон (как Telegram Web). Код придёт в приложение Telegram.</div>';
    leftHtml += '<input type="text" class="strategy-tg-bot-input" id="strategyTgPhone" placeholder="+7 999 123-45-67" value="">';
    leftHtml += '<input type="text" class="strategy-tg-bot-input" id="strategyTgCode" placeholder="Код из Telegram" style="display:none" value="">';
    leftHtml += '<input type="password" class="strategy-tg-bot-input" id="strategyTgPassword" placeholder="Пароль 2FA" style="display:none" value="">';
    leftHtml += '<div id="strategyTgAuthMsg" class="strategy-tg-auth-msg"></div>';
    leftHtml += '<div class="strategy-tg-btns">';
    leftHtml += '<button type="button" class="strategy-tg-connect" id="strategyTgSendCodeBtn" onclick="strategyTgSendCode()">Отправить код</button>';
    leftHtml += '<button type="button" class="strategy-tg-btn" id="strategyTgSignInBtn" style="display:none" onclick="strategyTgSignIn()">Войти</button>';
    leftHtml += '<button type="button" class="strategy-tg-btn" id="strategyTgPasswordBtn" style="display:none" onclick="strategyTgSignInPassword()">Войти с паролем</button>';
    leftHtml += '</div>';
    leftHtml += '</div>';
  } else {
    var botName = (tg.telegramBotUsername || 'Av1111_bot').trim().replace(/^@/,'');
    leftHtml += '<div class="strategy-tg-widget-wrap">';
    leftHtml += '<div class="strategy-tg-bot-hint">Виджет (только профиль): <a href="https://core.telegram.org/widgets/login" target="_blank" rel="noopener">core.telegram.org/widgets/login</a></div>';
    leftHtml += '<input type="text" class="strategy-tg-bot-input" id="strategyTgBotInput" placeholder="Имя бота без @" value="' + esc(botName) + '">';
    leftHtml += '<div class="strategy-tg-btns"><button type="button" class="strategy-tg-btn" onclick="strategySaveBotAndShowWidget()">Сохранить</button></div>';
    leftHtml += '<div id="strategyTgLoginContainer" class="strategy-tg-login-container" style="margin-top:10px"></div>';
    leftHtml += '<div class="strategy-tg-btns" style="margin-top:10px">';
    leftHtml += '<button type="button" class="strategy-tg-connect" style="font-size:10px;padding:4px 8px" onclick="strategyConnectTelegram()">Демо (без чатов)</button>';
    leftHtml += '</div></div>';
  }
  leftHtml += '</div>';
  leftHtml += '<div class="strategy-col-title">ПРОЕКТЫ</div>';
  projects.forEach(function(p){
    var chatId = p.telegramChatId || '';
    var chatTitle = p.telegramChatTitle || '';
    var ind = '';
    if (chatId) ind += '🔗 ';
    var msgKey = (p.id || '') + '_' + (chatId || '');
    var msgs = messagesAll[msgKey] || [];
    var hasNew = msgs.some(function(m){ return (m.analysisStatus || 'new') === 'new'; });
    if (hasNew) ind += '⚠ ';
    var hasAi = (_strategySuggestionsByProject[p.id] || []).some(function(s){ return (s.status || 'pending') === 'pending'; });
    if (hasAi) ind += '🧠 ';
    var sel = _strategySelectedProjectId === p.id ? ' selected' : '';
    leftHtml += '<div class="strategy-project-card' + sel + '" data-id="' + esc(p.id) + '" onclick="strategySelectProject(\'' + esc(p.id) + '\')">';
    leftHtml += '<div><div>' + esc(String(p.emoji||'') + ' ' + (p.title||'Без названия')) + '</div>';
    leftHtml += '<div class="strategy-project-ind">' + (ind || '—') + '</div>';
    leftHtml += (chatId ? '<div style="font-size:10px;color:var(--muted)">' + esc(chatTitle) + (p.telegramChatUsername ? ' @' + esc(p.telegramChatUsername) : '') + '</div>' : '');
    leftHtml += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">';
    leftHtml += '<button type="button" class="strategy-link-btn" onclick="event.stopPropagation();strategyShowLinkChat(\'' + esc(p.id) + '\')">✈️ ' + (chatId ? 'Сменить чат' : 'Привязать ТГ') + '</button>';
    if (chatId) {
      var mon = p.telegramMonitoringEnabled !== false;
      leftHtml += '<span class="strategy-auto-toggle' + (mon ? ' on' : '') + '" onclick="event.stopPropagation();strategyToggleProjectMonitoring(\'' + esc(p.id) + '\')" title="Мониторинг чата">' + (mon ? '📡 вкл' : '📡 выкл') + '</span>';
    }
    leftHtml += '</div>';
    leftHtml += '</div></div>';
  });

  var centerHtml = '<div class="strategy-col-title">ЧАТ</div>';
  var selProj = _strategySelectedProjectId ? projects.find(function(p){ return p.id === _strategySelectedProjectId; }) : null;
  if (selProj && selProj.telegramChatId) {
    var msgKey = (selProj.id||'') + '_' + (selProj.telegramChatId||'');
    var msgs = STRATEGY_API_BASE && _strategyApiMessages[selProj.telegramChatId] ? _strategyApiMessages[selProj.telegramChatId] : (messagesAll[msgKey] || []);
    if (STRATEGY_API_BASE && !_strategyApiMessages[selProj.telegramChatId]) {
      strategyGetProjectMessages(selProj.id, function(apiMsgs){
        _strategyApiMessages[selProj.telegramChatId] = apiMsgs || [];
        if (strategyMode) renderStrategyPage();
      });
      msgs = [];
    } else if (!STRATEGY_API_BASE && !msgs.length) {
      strategySeedDemoMessages(selProj.id, selProj.telegramChatId);
      messagesAll = getStrategyMessages();
      msgs = messagesAll[msgKey] || [];
    }
    var chatLabel = (selProj.telegramChatUsername ? 'Чат @' + esc(selProj.telegramChatUsername) : esc(selProj.telegramChatTitle || 'Чат')) + ' · ' + esc(selProj.title || 'Проект');
    var syncCls = st.lastSync ? '' : ' pending';
    var syncLabel = st.lastSync ? ('Синхр.: ' + fmtTime(st.lastSync)) : 'Ожидаем синхр.';
    centerHtml += '<div class="strategy-chat-header"><span>' + chatLabel + '</span><span class="strategy-chat-sync' + syncCls + '">' + esc(syncLabel) + '</span></div>';
    centerHtml += '<div class="strategy-chat-messages">';
    if (!msgs.length) centerHtml += '<div class="strategy-empty">' + (STRATEGY_API_BASE ? 'Загрузка сообщений из Telegram...' : 'Нет сообщений. Данные появятся после синхронизации.') + '</div>';
    msgs.forEach(function(m){
      var cls = m.author === 'me' ? 'me' : 'client';
      var labels = (m.labels || []).map(function(l){ return '<span class="strategy-msg-label">' + esc(l) + '</span>'; }).join('');
      centerHtml += '<div class="strategy-msg ' + cls + '"><div class="strategy-msg-meta">' + esc(m.author||'') + ' · ' + esc(m.timestamp||'') + '</div><div>' + esc(m.messageText||'') + '</div>' + (labels ? '<div class="strategy-msg-labels">' + labels + '</div>' : '') + '</div>';
    });
    centerHtml += '</div>';
  } else {
    var syncHint = st.connected ? 'Привяжите чат к проекту слева (✈️ Привязать ТГ) — переписка появится здесь.' : 'Подключите Telegram (кнопка слева), затем привяжите чат к проекту.';
    centerHtml += '<div class="strategy-chat-header"><span class="strategy-chat-sync pending">' + (st.connected ? 'Нет выбранного чата' : 'Не подключен') + '</span></div>';
    centerHtml += '<div class="strategy-chat-messages"><div class="strategy-empty">' + esc(syncHint) + '</div></div>';
  }

  var rightHtml = '<div class="strategy-col-title">АНАЛИЗ ИИ</div>';
  var analysis = selProj ? (_strategyAnalysisByProject[selProj.id] || {}) : {};
  var suggestions = selProj ? (_strategySuggestionsByProject[selProj.id] || []) : [];
  var pending = suggestions.filter(function(s){ return (s.status || 'pending') === 'pending'; });
  var edits = (analysis.edits !== undefined ? analysis.edits : 0);
  var requests = (analysis.requests !== undefined ? analysis.requests : 0);
  var important = (analysis.important !== undefined ? analysis.important : 0);
  var deadlines = (analysis.deadlines !== undefined ? analysis.deadlines : 0);
  var tasks = (analysis.tasks !== undefined ? analysis.tasks : pending.length);
  rightHtml += '<div class="strategy-col-title" style="border-bottom:none">Обнаружено</div>';
  rightHtml += '<div class="strategy-detected">';
  rightHtml += '<div class="strategy-detected-item"><span class="strategy-detected-label">правки</span><span class="strategy-detected-num">' + edits + '</span></div>';
  rightHtml += '<div class="strategy-detected-item"><span class="strategy-detected-label">просьбы</span><span class="strategy-detected-num">' + requests + '</span></div>';
  rightHtml += '<div class="strategy-detected-item"><span class="strategy-detected-label">важное</span><span class="strategy-detected-num">' + important + '</span></div>';
  rightHtml += '<div class="strategy-detected-item"><span class="strategy-detected-label">дедлайны</span><span class="strategy-detected-num">' + deadlines + '</span></div>';
  rightHtml += '<div class="strategy-detected-item"><span class="strategy-detected-label">возможные задачи</span><span class="strategy-detected-num">' + tasks + '</span></div>';
  rightHtml += '</div>';
  rightHtml += '<div class="strategy-col-title" style="border-bottom:none">Что попросил клиент</div>';
  rightHtml += '<div class="strategy-requests-list">';
  var summary = analysis.summary || [];
  if (summary.length) {
    summary.forEach(function(s){
      var action = (typeof s === 'object' && s.action) ? s.action : (typeof s === 'string' ? s : '');
      var quote = (typeof s === 'object' && s.quote) ? s.quote : (typeof s === 'object' && s.messageText) ? s.messageText : '';
      rightHtml += '<div class="strategy-request-quote"><div class="rq-action">' + esc(action) + '</div>' + (quote ? '<div class="rq-cite">«' + esc(quote) + '»</div>' : '') + '</div>';
    });
  } else rightHtml += '<div class="strategy-empty">Нет данных. Нажмите «Анализировать».</div>';
  rightHtml += '</div>';
  rightHtml += '<div class="strategy-col-title" style="border-bottom:none">Предложенные задачи</div>';
  pending.forEach(function(s){
    rightHtml += '<div class="strategy-suggestion"><div class="strategy-suggestion-title">' + esc(s.title || '') + '</div><div class="strategy-suggestion-meta">' + esc(s.type || 'text') + ' · ' + esc(String(s.confidence || 0)) + '%</div><div class="strategy-suggestion-btns"><button type="button" class="strategy-sug-btn create" onclick="strategyCreateTaskFromSuggestion(\'' + esc(selProj.id) + '\',\'' + esc(s.id||'') + '\')">Создать задачу</button><button type="button" class="strategy-sug-btn ignore" onclick="strategyIgnoreSuggestion(\'' + esc(selProj.id) + '\',\'' + esc(s.id||'') + '\')">Игнорировать</button><button type="button" class="strategy-sug-btn done" onclick="strategyMarkSuggestionDone(\'' + esc(selProj.id) + '\',\'' + esc(s.id||'') + '\')">Обработан</button></div></div>';
  });
  if (!pending.length) rightHtml += '<div class="strategy-empty">Нет предложений</div>';
  rightHtml += '<div style="padding:12px"><button type="button" class="strategy-tg-connect" onclick="strategyRunAIAnalysis()">Анализировать чат</button></div>';

  mc.innerHTML = '<div class="strategy-wrap"><div class="strategy-col">' + leftHtml + '</div><div class="strategy-col">' + centerHtml + '</div><div class="strategy-col">' + rightHtml + '</div></div>';
  if (!st.connected && !STRATEGY_API_BASE && (tg.telegramBotUsername || 'Av1111_bot').trim()) {
    setTimeout(function(){ if (typeof strategyInjectTelegramWidget === 'function') strategyInjectTelegramWidget(); }, 50);
  }
}
function strategyToggleTelegram() {
  var tg = getStrategyTelegram();
  tg.telegramAccountConnected = !tg.telegramAccountConnected;
  if (tg.telegramAccountConnected) {
    tg.telegramUsername = tg.telegramUsername || 'demo@user';
    tg.telegramChatId = tg.telegramChatId || 'demo_chat';
  } else {
    tg.telegramUsername = '';
    tg.telegramChatId = '';
  }
  saveStrategyTelegram(tg);
  renderStrategyPage();
}
function strategySelectProject(id) {
  _strategySelectedProjectId = id;
  renderStrategyPage();
}
function strategyShowLinkChat(projectId) {
  var tg = getStrategyTelegram();
  if (!_strategyTgState.connected && !tg.telegramAccountConnected) {
    strategyConnectTelegram();
    return;
  }
  var data = loadProjectsData();
  var p = (data.projects || []).find(function(x){ return x.id === projectId; });
  if (!p) return;
  strategyGetProjectChats(projectId, function(chats){
    var chatId, chatTitle, chatUsername, monitoring = true;
    if (chats && chats.length > 0) {
      var sel = prompt('Введите номер чата (1-' + chats.length + ') или ID вручную', '1');
      if (sel === null) return;
      var idx = parseInt(sel, 10);
      if (idx >= 1 && idx <= chats.length) {
        var c = chats[idx - 1];
        chatId = c.id || c.chatId || '';
        chatTitle = c.title || c.name || '';
        chatUsername = c.username || c.telegramChatUsername || '';
      }
    }
    if (!chatId) {
      chatId = prompt('Введите ID чата Telegram (для демо: demo_' + projectId.slice(0,6) + ')', p.telegramChatId || 'demo_' + projectId.slice(0,8));
      if (chatId === null) return;
      chatId = (chatId || '').trim();
      chatTitle = p.telegramChatTitle || ('Чат ' + (chatId ? chatId.slice(0,12) : ''));
      chatUsername = p.telegramChatUsername || '';
    }
    if (!chatId) {
      p.telegramChatId = '';
      p.telegramChatTitle = '';
      p.telegramChatUsername = '';
      p.telegramMonitoringEnabled = false;
    } else {
      p.telegramChatId = chatId;
      p.telegramChatTitle = chatTitle || ('Чат ' + chatId.slice(0,12));
      p.telegramChatUsername = chatUsername || p.telegramChatUsername || '';
      p.telegramMonitoringEnabled = (p.telegramMonitoringEnabled !== false);
    }
    saveProjectsData(data);
    _strategyTgState.monitoredChats = countMonitoredChats();
    if (chatId) strategySeedDemoMessages(projectId, chatId);
    if (!_strategySelectedProjectId || _strategySelectedProjectId === projectId) _strategySelectedProjectId = projectId;
    renderStrategyPage();
  });
}
function strategyToggleProjectMonitoring(projectId) {
  var data = loadProjectsData();
  var p = (data.projects || []).find(function(x){ return x.id === projectId; });
  if (!p) return;
  p.telegramMonitoringEnabled = !(p.telegramMonitoringEnabled !== false);
  saveProjectsData(data);
  _strategyTgState.monitoredChats = countMonitoredChats();
  renderStrategyPage();
}
function strategyCreateTaskFromSuggestion(projectId, suggestionId) {
  var suggestions = _strategySuggestionsByProject[projectId] || [];
  var s = suggestions.find(function(x){ return (x.id||'') === suggestionId; });
  if (!s) return;
  if (STRATEGY_API_BASE) { strategyCreateTaskFromSuggestionApi(projectId, suggestionId); return; }
  if (typeof addTask !== 'function') return;
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var pad2 = function(n){ var s=String(n); return s.length>=2?s:'0'+s; };
  var dueStr = tomorrow.getFullYear() + '-' + pad2(tomorrow.getMonth()+1) + '-' + pad2(tomorrow.getDate());
  addTask({ projectId: projectId, title: s.title || 'Задача', type: s.type || 'text', status: 'new', priority: 'normal', dueDate: dueStr });
  s.status = 'convertedToTask';
  _strategySuggestionsByProject[projectId] = suggestions;
  if (typeof renderTaskPanel === 'function') renderTaskPanel();
  if (typeof rerenderProjectsPreserveScroll === 'function') rerenderProjectsPreserveScroll();
  renderStrategyPage();
}
function strategyIgnoreSuggestion(projectId, suggestionId) {
  var suggestions = _strategySuggestionsByProject[projectId] || [];
  var s = suggestions.find(function(x){ return (x.id||'') === suggestionId; });
  if (s) { s.status = 'ignored'; _strategySuggestionsByProject[projectId] = suggestions; renderStrategyPage(); }
}
function strategyMarkSuggestionDone(projectId, suggestionId) {
  var suggestions = _strategySuggestionsByProject[projectId] || [];
  var s = suggestions.find(function(x){ return (x.id||'') === suggestionId; });
  if (s) { s.status = 'processed'; _strategySuggestionsByProject[projectId] = suggestions; renderStrategyPage(); }
}
function strategyRunAIAnalysis() {
  var pid = _strategySelectedProjectId;
  if (!pid) return;
  var data = loadProjectsData();
  var p = (data.projects || []).find(function(x){ return x.id === pid; });
  if (!p || !p.telegramChatId) return;
  var messagesAll = getStrategyMessages();
  var msgKey = pid + '_' + p.telegramChatId;
  var msgs = messagesAll[msgKey] || [];
  if (!msgs.length) {
    msgs = [{ id: 'm1', author: 'client', messageText: 'Добавь больше фото и поменяй заголовок', timestamp: new Date().toISOString().slice(0,16), labels: [], analysisStatus: 'new' }];
    messagesAll[msgKey] = msgs;
    saveStrategyMessages(messagesAll);
  }
  var text = msgs.map(function(m){ return (m.author||'') + ': ' + (m.messageText||''); }).join('\n');
  var fullMsg = (msgs[0] && msgs[0].messageText) || 'Добавь больше фото и поменяй заголовок';
  _strategyAnalysisByProject[pid] = { requests: 2, edits: 1, important: 1, deadlines: 0, tasks: 2, summary: [
    { action: 'добавить фото', quote: fullMsg },
    { action: 'изменить заголовок', quote: fullMsg }
  ] };
  _strategySuggestionsByProject[pid] = (_strategySuggestionsByProject[pid] || []).concat([
    { id: 's1', title: 'Добавить фото объектов', type: 'text', confidence: 85, status: 'pending', messageIds: ['m1'] },
    { id: 's2', title: 'Переписать первый заголовок', type: 'text', confidence: 90, status: 'pending', messageIds: ['m1'] }
  ]);
  msgs.forEach(function(m){ m.analysisStatus = 'analyzed'; });
  saveStrategyMessages(messagesAll);
  renderStrategyPage();
}

function saveAgencyAvitoSettings() {
  var cfg = {
    clientId: (document.getElementById('agencyAvitoClientId') || {}).value || '',
    clientSecret: (document.getElementById('agencyAvitoClientSecret') || {}).value || '',
    accessToken: (document.getElementById('agencyAvitoAccessToken') || {}).value || ''
  };
  saveAgencyAvitoCfg(cfg);
  var st = document.getElementById('agencyAvitoStatus');
  if (st) st.textContent = 'Статус: настройки сохранены локально';
}
async function testAgencyAvitoConnection() {
  var st = document.getElementById('agencyAvitoStatus');
  var info = document.getElementById('agencyAvitoAccountInfo');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  if (st) st.textContent = 'Статус: проверяю API...';
  var cfg = getAgencyAvitoCfg();
  var token = String(cfg.accessToken || '').trim();
  if (!token) {
    var clientId = String(cfg.clientId || '').trim();
    var clientSecret = String(cfg.clientSecret || '').trim();
    if (!clientId || !clientSecret) {
      if (st) st.textContent = 'Статус: заполните Client ID + Client Secret или вставьте Access Token';
      return;
    }
    try {
      var body = new URLSearchParams();
      body.set('grant_type', 'client_credentials');
      body.set('client_id', clientId);
      body.set('client_secret', clientSecret);
      var tokResp = await fetch('https://api.avito.ru/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!tokResp.ok) {
        var tokErr = await tokResp.text().catch(function(){ return ''; });
        if (st) st.textContent = 'Статус: не удалось получить токен (' + tokResp.status + ')' + (tokErr ? ' — ' + tokErr.slice(0, 180) : '');
        return;
      }
      var tokJson = await tokResp.json().catch(function(){ return {}; });
      token = String(tokJson.access_token || '').trim();
      if (!token) { if (st) st.textContent = 'Статус: API не вернул access_token'; return; }
      cfg.accessToken = token;
      saveAgencyAvitoCfg(cfg);
      var tokenInput = document.getElementById('agencyAvitoAccessToken');
      if (tokenInput) tokenInput.value = token;
    } catch (eTok) {
      if (st) st.textContent = 'Статус: ошибка получения токена — ' + (eTok && eTok.message ? eTok.message : eTok);
      return;
    }
  }
  try {
    var resp = await fetch('https://api.avito.ru/core/v1/accounts/self', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!resp.ok) {
      var txt = await resp.text().catch(function(){ return ''; });
      if (st) st.textContent = 'Статус: ошибка API ' + resp.status + (txt ? ' — ' + txt.slice(0, 160) : '');
      return;
    }
    var json = await resp.json().catch(function(){ return {}; });
    var acc = (json && (json.id || json.user_id || json.account_id)) ? (' ID: ' + (json.id || json.user_id || json.account_id)) : '';
    if (st) st.textContent = 'Статус: подключено успешно.' + acc;
    if (typeof loadAgencyAvitoKpis === 'function') loadAgencyAvitoKpis(token, json);
    if (info) {
      var esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var accId = json.id || json.user_id || json.account_id || '';
      var accName = json.name || json.title || json.full_name || '';
      var accEmail = json.email || '';
      var accPhone = json.phone || json.phone_number || '';
      var accStatus = json.status || '';
      info.innerHTML =
        '<div class="agency-account-title"><span class="agency-avatar">A</span>Данные личного аккаунта Avito</div>' +
        '<div class="agency-account-line">ID: <b>' + esc(accId) + '</b></div>' +
        '<div class="agency-account-line">Имя: <b>' + esc(accName || '—') + '</b></div>' +
        '<div class="agency-account-line">Email: <b>' + esc(accEmail || '—') + '</b></div>' +
        '<div class="agency-account-line">Телефон: <b>' + esc(accPhone || '—') + '</b></div>' +
        '<div class="agency-account-line">Статус: <b>' + esc(accStatus || '—') + '</b></div>';
      info.style.display = 'block';
    }
  } catch (e) {
    if (st) st.textContent = 'Статус: сеть/доступ недоступны — ' + (e && e.message ? e.message : e);
  }
}
async function agencyFetchJson(url, token) {
  try {
    var r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    var t = await r.text().catch(function(){ return ''; });
    var j = {};
    try { j = t ? JSON.parse(t) : {}; } catch(e) { j = {}; }
    return { ok: r.ok, status: r.status, json: j };
  } catch(e) {
    return { ok: false, status: 0, json: {} };
  }
}
function agencyFindFirstNumber(obj, keyParts) {
  if (!obj || typeof obj !== 'object') return null;
  var queue = [obj];
  while (queue.length) {
    var cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    Object.keys(cur).forEach(function(k) {
      var v = cur[k];
      var lk = String(k).toLowerCase();
      if (typeof v === 'number') {
        for (var i = 0; i < keyParts.length; i++) {
          if (lk.indexOf(keyParts[i]) >= 0) {
            queue.length = 0;
            queue.push({ __found: v });
            return;
          }
        }
      }
      if (v && typeof v === 'object') queue.push(v);
    });
    if (cur.__found !== undefined) return cur.__found;
  }
  return null;
}
async function loadAgencyAvitoKpis(token, accountJson) {
  var balanceEl = document.getElementById('agencyKpiBalance');
  var activeEl = document.getElementById('agencyKpiActive');
  if (balanceEl) balanceEl.textContent = '...';
  if (activeEl) activeEl.textContent = '...';
  var accountId = (accountJson && (accountJson.id || accountJson.user_id || accountJson.account_id)) || '';
  var bal = null;
  var balUrls = [
    'https://api.avito.ru/core/v1/accounts/self/balance',
    accountId ? ('https://api.avito.ru/core/v1/accounts/' + encodeURIComponent(accountId) + '/balance') : ''
  ].filter(Boolean);
  for (var i = 0; i < balUrls.length; i++) {
    var br = await agencyFetchJson(balUrls[i], token);
    if (!br.ok) continue;
    bal = agencyFindFirstNumber(br.json, ['balance', 'amount', 'money', 'fund']);
    if (bal !== null) break;
  }
  var active = null;
  var activeUrls = [
    'https://api.avito.ru/core/v1/items?status=active&limit=1',
    accountId ? ('https://api.avito.ru/core/v1/accounts/' + encodeURIComponent(accountId) + '/items?status=active&limit=1') : ''
  ].filter(Boolean);
  for (var j = 0; j < activeUrls.length; j++) {
    var ar = await agencyFetchJson(activeUrls[j], token);
    if (!ar.ok) continue;
    active = agencyFindFirstNumber(ar.json, ['count', 'total', 'active']);
    if (active === null && ar.json && Array.isArray(ar.json.items)) active = ar.json.items.length;
    if (active !== null) break;
  }
  if (balanceEl) balanceEl.textContent = (bal !== null ? (String(Math.round(bal)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽') : '—');
  if (activeEl) activeEl.textContent = (active !== null ? String(active) : '—');
}

function applyAnalyticsModeDefault() {
  var amKey = (typeof window.AVITOLOG_KEY === 'function') ? window.AVITOLOG_KEY('avitolog_analytics_mode') : 'avitolog_analytics_mode';
  var override = localStorage.getItem(amKey);
  if (override === 'sasha' || override === 'fil' || override === 'regina') {
    analyticsMode = override;
  } else if (window.AVITOLOG_IS_SASHA || (typeof _driveUserEmail !== 'undefined' && _driveUserEmail === (typeof SASHA_EMAIL !== 'undefined' ? SASHA_EMAIL : ''))) {
    analyticsMode = 'sasha';
  } else {
    analyticsMode = 'fil';
  }
  var sashaBtn = document.getElementById('tumblerSasha');
  var filBtn = document.getElementById('tumblerFil');
  var reginaBtn = document.getElementById('tumblerRegina');
  if (sashaBtn) sashaBtn.classList.toggle('on', analyticsMode === 'sasha');
  if (filBtn) filBtn.classList.toggle('on', analyticsMode === 'fil');
  if (reginaBtn) reginaBtn.classList.toggle('on', analyticsMode === 'regina');
  var depthBar = document.getElementById('depthBar');
  var secBar = document.getElementById('secBar');
  if (depthBar) depthBar.classList.remove('muted');
  if (secBar) secBar.classList.remove('muted');
  updateProjectsButtonVisibility();
}
