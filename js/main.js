// ── TABS ──
function switchTab(tab) {
  if (agencyMode) return;
  currentTab = tab;
  ['analysis','presale','avito1'].forEach(function(t) {
    var el = document.getElementById('tab-'+t);
    if (el) el.classList.toggle('active', t===tab);
  });
  if (tab === 'goals') {
    var bar = document.getElementById('depthBar');
    var secBar = document.getElementById('secBar');
    if (bar) bar.style.display = 'none';
    if (secBar) secBar.style.display = 'none';
    if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') {
      window.AVITOLOG_GOALS.render();
    }
    return;
  }
  var bar = document.getElementById('depthBar');
  if (bar) bar.style.display = 'flex';
  var btns = bar ? bar.querySelectorAll('.depth-btn') : [];
  if (btns[2]) btns[2].style.display = tab === 'analysis' ? '' : 'none';
  var secBar = document.getElementById('secBar');
  if (secBar) secBar.style.display = tab === 'analysis' ? 'flex' : 'none';
  var tumbler = document.getElementById('analyticsTumbler');
  if (tumbler) tumbler.classList.toggle('hide', tab !== 'analysis');
  var depthBar = document.getElementById('depthBar');
  if (tab === 'analysis') {
    if (!analyticsMode) {
      if (depthBar) depthBar.classList.add('muted');
      if (secBar) secBar.classList.add('muted');
    } else {
      if (depthBar) depthBar.classList.remove('muted');
      if (secBar) secBar.classList.remove('muted');
    }
  }
  if (tab !== 'analysis' && currentDepth === 'max') { setDepth('mid'); }
  if (!docReady && !projectsMode && !goalsMode && !agencyMode) {
    refreshClientContents();
  }
}

// ── POSITIONS ──
function addPos() {
  var list = document.getElementById('posList');
  var row = document.createElement('div');
  row.className = 'pos-row';
  row.innerHTML = '<input type="text" placeholder="Позиция" class="pname"><button type="button" class="btn-x" onclick="removePos(this)">x</button>';
  list.appendChild(row);
  setupAC(row.querySelector('.pname'), 'positions');
}
function removePos(btn) {
  if (document.querySelectorAll('.pos-row').length > 1) btn.parentElement.remove();
}
function getPos() {
  var result = [];
  document.querySelectorAll('.pname').forEach(function(i) {
    if (i.value.trim()) result.push(i.value.trim());
  });
  return result;
}

// ── PROGRESS ──
function pgStart() {
  _secs = 0;
  var bar = document.getElementById('bar-'+currentTab);
  var txt = document.getElementById('txt-'+currentTab);
  document.getElementById('tab-'+currentTab).classList.remove('done');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  setTimeout(function() {
    bar.style.transition = 'width 22s cubic-bezier(0.05,0.4,0.2,1)';
    bar.style.width = '88%';
  }, 60);
  _timer = setInterval(function() {
    _secs++;
    var m = Math.floor(_secs/60), s = _secs%60;
    var lbl = currentTab==='analysis' ? 'АНАЛИТИКА' : currentTab==='presale' ? 'НУЖНО СЕЙЧАС' : 'AVITO №1';
    txt.textContent = lbl + ' ' + (m ? m+'м ' : '') + s + 'с';
  }, 1000);
}
function pgStop() {
  clearInterval(_timer);
  var bar = document.getElementById('bar-'+currentTab);
  var txt = document.getElementById('txt-'+currentTab);
  bar.style.transition = 'width 0.3s ease';
  bar.style.width = '100%';
  document.getElementById('tab-'+currentTab).classList.add('done');
  txt.textContent = currentTab==='analysis' ? 'АНАЛИТИКА' : currentTab==='presale' ? 'НУЖНО СЕЙЧАС' : 'AVITO №1';
}

// ── HELPERS ──
function v(id) {
  var e = document.getElementById(id);
  return e ? e.value.trim() : '';
}
function setContent(html) {
  document.getElementById('mainContent').innerHTML = html;
}

var CLIENT_DOC_TYPES = [
  { prefix: '📊 Аналитика', key: 'analysis', title: 'Аналитика', desc: 'Статистика, охваты, CTR, лиды', ico: '📊' },
  { prefix: '⏰ Нужно сейчас', key: 'presale', title: 'Почему сейчас', desc: 'Почему сейчас — лучшее время для запуска', ico: '⏰' },
  { prefix: '🏆 Avito №1', key: 'avito1', title: 'Почему Авито №1', desc: 'Преимущества, факты, кейсы', ico: '🏆' }
];
var _analyticsRecentLimit = 10;
var _analyticsRecentSelectedProjectId = '';
var _analyticsOpenedFolderByProject = {};
var _refreshClientContentsInFlight = false;
var _markAnalyticsFolderDebounceTimer = null;
var ANALYTICS_RECENT_GEN_KEY = 'avitolog_recent_generations';
function getAnalyticsRecentProjects() {
  try {
    var arr = JSON.parse(localStorage.getItem(ANALYTICS_RECENT_GEN_KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    var now = new Date();
    var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    arr = arr.filter(function(x) {
      var ts = x && (typeof x.ts === 'number' ? x.ts : (x.ts ? new Date(x.ts).getTime() : 0));
      return !ts || ts >= threeMonthsAgo;
    }).sort(function(a, b) {
      var ta = a && (typeof a.ts === 'number' ? a.ts : (a.ts ? new Date(a.ts).getTime() : 0));
      var tb = b && (typeof b.ts === 'number' ? b.ts : (b.ts ? new Date(b.ts).getTime() : 0));
      return (tb || 0) - (ta || 0);
    });
    var ac = _activeClient || getActiveClient();
    var currentEntry = null;
    if (ac && ac.folderId) {
      currentEntry = {
        projectId: 'active:' + String(ac.folderId),
        folderId: String(ac.folderId),
        company: ac.company || ac.contact_name || ac.name || 'Клиент',
        title: ac.company || ac.contact_name || ac.name || 'Клиент',
        projectTitle: ac.company || ac.contact_name || ac.name || 'Клиент',
        phone: ac.phone || '',
        telegram: ac.telegram || ac.tg || '',
        avito_account: ac.avito_account || '',
        category: ac.category || '',
        city: ac.city || '',
        kp_count: ac.kp_count || ac.kp || '',
        avatar: (typeof getClientAvatar === 'function' ? (getClientAvatar(ac) || '') : ''),
        emoji: '📁',
        folderLink: ac.folderLink || ('https://drive.google.com/drive/folders/' + ac.folderId),
        status: ac.client_type || '',
        tags: (typeof getClientTags === 'function' ? getClientTags(ac) : []) || [],
        isCurrentLeft: true,
        ts: Date.now()
      };
    }
    var seen = {};
    var uniq = [];
    if (currentEntry) {
      var currentKey = String(currentEntry.projectId || currentEntry.folderId || '');
      seen[currentKey] = true;
      uniq.push(currentEntry);
    }
    arr.forEach(function(x) {
      var key = String((x && x.projectId) || '') + '_' + (x && (typeof x.ts === 'number' ? x.ts : (x.ts ? new Date(x.ts).getTime() : 0)) || 0);
      if (!key || key === '_0' || seen[key]) return;
      seen[key] = true;
      uniq.push(x);
    });
    var crm = typeof getCrmClients === 'function' ? getCrmClients() : [];
    (crm || []).forEach(function(c) {
      if (!c || !c.folderId) return;
      var fid = String(c.folderId);
      if (seen[fid]) return;
      seen[fid] = true;
      uniq.push({
        projectId: fid,
        folderId: fid,
        company: c.company || c.contact_name || c.name || 'Клиент',
        title: c.company || c.contact_name || c.name || 'Клиент',
        projectTitle: c.company || c.contact_name || c.name || 'Клиент',
        phone: c.phone || '',
        telegram: c.telegram || c.tg || '',
        avito_account: c.avito_account || '',
        category: c.category || '',
        city: c.city || '',
        kp_count: c.kp_count || c.kp || '',
        avatar: (typeof getClientAvatar === 'function' ? (getClientAvatar(c) || '') : ''),
        emoji: '📁',
        folderLink: c.folderLink || ('https://drive.google.com/drive/folders/' + fid),
        ts: Date.now()
      });
    });
    /* По умолчанию: проекты из календаря (открытые в этом месяце) */
    if (typeof loadProjectsData === 'function') {
      try {
        var pd = loadProjectsData();
        var boardProjects = (pd.projects || []).filter(function(p){ return (p.zone || 'active') === 'active'; });
        var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        boardProjects.forEach(function(p) {
          if (!p || !p.id) return;
          var pid = String(p.id);
          if (seen[pid]) return;
          var ts = 0;
          var m = pid.match(/^p(\d+)$/);
          if (m) ts = parseInt(m[1], 10);
          if (!ts || ts < thisMonthStart) return;
          seen[pid] = true;
          uniq.push({
            projectId: pid,
            folderId: p.folderId || pid,
            company: p.title || 'Проект',
            title: p.title || 'Проект',
            projectTitle: p.title || 'Проект',
            emoji: p.emoji || '📁',
            avatar: p.avatar || '',
            ts: ts
          });
        });
        uniq.sort(function(a,b){ return (b.ts || 0) - (a.ts || 0); });
      } catch(e) {}
    }
    var byName = {};
    return uniq.filter(function(p) {
      var name = String(p.company || p.title || p.projectTitle || '').trim().toLowerCase();
      if (!name) return true;
      if (byName[name]) return false;
      byName[name] = true;
      return true;
    });
  } catch (e) {
    return [];
  }
}
function saveAnalyticsRecentGeneration(entry) {
  if (!entry) return;
  try {
    var arr = JSON.parse(localStorage.getItem(ANALYTICS_RECENT_GEN_KEY) || '[]');
    if (!Array.isArray(arr)) arr = [];
    arr.unshift(entry);
    arr = arr.slice(0, 30);
    localStorage.setItem(ANALYTICS_RECENT_GEN_KEY, JSON.stringify(arr));
  } catch (e) {}
}
function updateAnalyticsRecentProject(projectId, updates) {
  if (!projectId || !updates) return;
  try {
    var arr = JSON.parse(localStorage.getItem(ANALYTICS_RECENT_GEN_KEY) || '[]');
    if (!Array.isArray(arr)) return;
    var p = arr.find(function(x){ return x && x.projectId === projectId; });
    if (p) {
      Object.keys(updates).forEach(function(k){ p[k] = updates[k]; });
      localStorage.setItem(ANALYTICS_RECENT_GEN_KEY, JSON.stringify(arr));
    }
  } catch (e) {}
}
function buildAnalyticsRecentProjectsBlock() {
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var all = getAnalyticsRecentProjects();
  if (!all.length) return '<div class="recent-projects-list"><div class="empty-st" style="padding:14px 0"><p style="font-size:12px;opacity:.6">Ещё нет недавних генераций</p></div></div>';
  var limit = _analyticsRecentLimit < 0 ? all.length : (_analyticsRecentLimit === 2 ? 2 : (_analyticsRecentLimit === 3 ? 3 : (_analyticsRecentLimit === 5 ? 5 : (_analyticsRecentLimit === 8 ? 8 : (_analyticsRecentLimit === 10 ? 10 : (_analyticsRecentLimit === 15 ? 15 : (_analyticsRecentLimit === 20 ? 20 : 10)))))));
  var shown = all.slice(0, limit);
  var cols = _analyticsRecentLimit < 0 ? Math.min(5, Math.max(1, shown.length)) : Math.max(1, Math.min(5, limit >= 10 ? 5 : (limit >= 5 ? 5 : limit)));
  var isModeFive = cols === 5;
  var isModeTwo = cols === 2;
  var isModeThree = cols === 3;
  var modeCls = cols === 2 ? ' mode-2' : (cols === 3 ? ' mode-3' : (cols === 5 ? ' mode-5' : ''));
  var gridCols = isModeTwo ? 1 : cols;
  var useMedia = isModeFive || isModeTwo || isModeThree;
  var html = '<div class="recent-projects-list' + modeCls + '" style="grid-template-columns:repeat(' + gridCols + ', minmax(0,1fr))">';
  function shortenLink(url, txt, max) { if (!url) return ''; var s = String(txt || url); if (s.length <= (max || 28)) return s; return s.slice(0, (max || 20)) + '…'; }
  shown.forEach(function(p) {
    var title = p.company || p.title || p.projectTitle || 'Проект';
    var thumb = p.avatar ? '<span class="recent-project-thumb"><img src="' + esc(p.avatar) + '" alt=""></span>' : '<span class="recent-project-thumb">' + esc(p.emoji || '📦') + '</span>';
    var titleOverlay = '<div class="recent-project-title-overlay">' + esc(title) + '</div>';
    var mode5Media = p.avatar
      ? '<div class="recent-project-media"><img src="' + esc(p.avatar) + '" alt="">' + titleOverlay + '</div>'
      : '<div class="recent-project-media"><div class="recent-project-media-fallback">' + esc(p.emoji || '📦') + '</div>' + titleOverlay + '</div>';
    var metaParts = [];
    if (p.category) metaParts.push(esc(p.category));
    if (p.city) metaParts.push(esc(p.city));
    var meta = metaParts.length ? metaParts.join(' • ') : '';
    var chips = '';
    if (p.phone) chips += '<span class="recent-project-chip">📞 ' + esc(String(p.phone).replace(/\s/g, ' ').slice(0, 18)) + (String(p.phone).length > 18 ? '…' : '') + '</span>';
    if (p.telegram) { var tg = String(p.telegram).replace(/^https?:\/\/t\.me\/?/i, '@').replace(/^@?/, '@'); chips += '<span class="recent-project-chip">💬 ' + esc(tg.slice(0, 16)) + (tg.length > 16 ? '…' : '') + '</span>'; }
    if (p.avito_account) chips += '<span class="recent-project-chip folder"><a href="' + esc(p.avito_account) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="' + esc(p.avito_account) + '">📦 Авито</a></span>';
    var bodyInner = '<div class="recent-project-title">' + esc(title) + '</div>' +
      (meta ? '<div class="recent-project-meta">' + meta + '</div>' : '') +
      (chips ? '<div class="recent-project-chips">' + chips + '</div>' : '');
    var onCls = (_analyticsRecentSelectedProjectId === p.projectId) ? ' on' : '';
    if (p.isCurrentLeft) onCls += ' current-left';
    html += '<div class="recent-project-item' + onCls + '" data-project-id="' + esc(p.projectId || '') + '">' +
      (useMedia ? mode5Media : thumb) +
      '<div class="recent-project-body">' + bodyInner + '</div>' +
      '</div>';
  });
  html += '</div>';
  return html;
}
function getAnalyticsRecentTitle() {
  if (!_analyticsRecentSelectedProjectId) return 'Недавние';
  var p = getAnalyticsRecentProjects().find(function(x) { return x.projectId === _analyticsRecentSelectedProjectId; });
  if (!p) return 'Недавние';
  return String(p.company || p.title || p.projectTitle || 'Недавние');
}
function getSelectedAnalyticsRecentProject() {
  if (!_analyticsRecentSelectedProjectId) return null;
  var arr = getAnalyticsRecentProjects();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].projectId === _analyticsRecentSelectedProjectId) return arr[i];
  }
  return null;
}
function markAnalyticsFolderOpened(projectId) {
  var key = String(projectId || '').trim();
  if (!key) return;
  if (_markAnalyticsFolderDebounceTimer) clearTimeout(_markAnalyticsFolderDebounceTimer);
  _markAnalyticsFolderDebounceTimer = setTimeout(function() {
    _markAnalyticsFolderDebounceTimer = null;
    _analyticsOpenedFolderByProject[key] = true;
    refreshClientContents(true);
  }, 120);
}
function buildAnalyticsProjectDetail(project, byKey) {
  if (!project) return '';
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var title = project.company || project.title || project.projectTitle || 'Проект';
  var hero = project.avatar
    ? '<img src="' + esc(project.avatar) + '" alt="">'
    : '<div class="analytics-project-hero-fallback">' + esc(project.emoji || '📦') + '</div>';
  hero += '<div class="analytics-project-hero-add" id="analyticsProjectAvatarAdd" data-project-id="' + esc(project.projectId || '') + '" title="Добавить аватар в папку клиента">+</div>';
  var contactChips = '';
  if (project.phone) contactChips += '<span class="analytics-project-chip analytics-chip-large">📞 ' + esc(String(project.phone)) + '</span>';
  if (project.email) contactChips += '<span class="analytics-project-chip analytics-chip-large">✉ ' + esc(String(project.email)) + '</span>';
  if (project.telegram) {
    var tg = String(project.telegram).replace(/^https?:\/\/t\.me\/?/i,'@').replace(/^@?/, '@');
    contactChips += '<span class="analytics-project-chip analytics-chip-large">💬 ' + esc(tg) + '</span>';
  }
  if (project.avito_account) contactChips += '<span class="analytics-project-chip analytics-chip-large">📦 ' + esc(shortenLink(project.avito_account, project.avito_account, 30)) + '</span>';
  var infoTags = '';
  if (project.city) infoTags += '<span class="analytics-project-chip analytics-chip-info">' + esc(project.city) + '</span>';
  if (project.kp_count || project.kp) infoTags += '<span class="analytics-project-chip analytics-chip-info">КП: ' + esc(String(project.kp_count || project.kp || '')) + '</span>';
  var kpFolderHtml = '<span class="analytics-project-kp-folder-bar">';
  if (project.kpFolderLink) {
    kpFolderHtml += '<a href="' + esc(project.kpFolderLink) + '" target="_blank" rel="noopener" class="analytics-project-kp-folder-link">&#128194; Папка КП</a>';
  }
  kpFolderHtml += '<span class="analytics-project-kp-folder-btn" id="analyticsProjectKpFolderBtn" data-project-id="' + esc(project.projectId || '') + '" title="Выбрать папку или документ КП из папки клиента">' + (project.kpFolderLink ? '&#128260; Изменить' : '&#128194; + Папка КП') + '</span></span>';
  infoTags += kpFolderHtml;
  if (project.kp_sum) infoTags += '<span class="analytics-project-chip analytics-chip-info">от ' + esc(String(project.kp_sum)) + ' ₽</span>';
  if (project.sold_sum || project.revenue) infoTags += '<span class="analytics-project-chip analytics-chip-info">куплено за ' + esc(String(project.sold_sum || project.revenue || '')) + ' ₽</span>';
  var statusArr = Array.isArray(project.status) ? project.status : (project.status ? [project.status] : []);
  statusArr.forEach(function(st) { infoTags += '<span class="analytics-project-chip analytics-chip-status">' + esc(String(st)) + '</span>'; });
  var tags = (project.tags && project.tags.length) ? project.tags : (typeof getClientTags === 'function' ? getClientTags(project) : []) || [];
  var tagChips = '';
  tags.forEach(function(t, i) { tagChips += '<span class="analytics-project-tag" data-index="' + i + '">' + esc(String(t)) + ' <span class="analytics-project-tag-rm" title="Удалить">×</span></span>'; });
  var hasAny = contactChips || infoTags || tagChips;
  var fl = project.folderLink || (project.folderId ? 'https://drive.google.com/drive/folders/' + project.folderId : '') || (project.projectId && project.projectId.indexOf('gen_') !== 0 && project.projectId.indexOf('active:') !== 0 ? 'https://drive.google.com/drive/folders/' + project.projectId : '');
  var folderBtn = fl ? '<a href="' + esc(fl) + '" target="_blank" rel="noopener" class="analytics-project-folder-btn" onclick="event.stopPropagation();markAnalyticsFolderOpened(\'' + esc(project.projectId || '') + '\')">&#128194; Открыть папку</a>' : '';
  var titleLine = '<div class="analytics-project-title-line">' + esc(title) + (project.category ? ' <span class="analytics-project-title-cat">• ' + esc(project.category) + '</span>' : '') + '</div>';
  var contactsBlock = contactChips ? '<div class="analytics-project-block"><div class="analytics-project-block-title">КОНТАКТЫ</div><div class="analytics-project-chips analytics-chips-large">' + contactChips + '</div></div>' : '';
  var infoBlock = infoTags ? '<div class="analytics-project-block"><div class="analytics-project-info-tags">' + infoTags + '</div></div>' : '';
  var tagsBlock = '<div class="analytics-project-block analytics-project-tags-block" id="analyticsProjectTagBar" data-project-id="' + esc(project.projectId || '') + '" data-folder-id="' + esc(project.folderId || '') + '"><div class="analytics-project-block-title">ТЕГИ</div><div class="analytics-project-tags-wrap">' + tagChips + '<span class="analytics-project-tag-add analytics-project-tag-cell-empty"><input type="text" placeholder="+ добавить / удалить" id="analyticsProjectTagInput"></span></div></div>';
  var emptyMsg = !hasAny && !tagChips ? '<div class="analytics-project-empty-msg">✨ Данные добавятся после генерации</div>' : '';
  return '<div class="analytics-project-page">' +
    '<div class="analytics-project-hero-col"><div class="analytics-project-hero-wrap">' + hero + '</div></div>' +
    '<div class="analytics-project-side">' +
      titleLine + (folderBtn ? '<div class="analytics-project-folder-row">' + folderBtn + '</div>' : '') +
      contactsBlock + infoBlock + tagsBlock + emptyMsg +
    '</div></div>';
}
async function showKpFolderPicker(project, btnEl) {
  var folderId = project.folderId || '';
  if (!folderId && project.folderLink) {
    var m = String(project.folderLink).match(/\/folders\/([a-zA-Z0-9_-]+)/);
    folderId = m ? m[1] : '';
  }
  if (!folderId) {
    alert('Сначала откройте папку клиента (кнопка «Открыть папку»), чтобы выбрать документ КП.');
    return;
  }
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var prevPicker = document.getElementById('kpFolderPicker');
  if (prevPicker) prevPicker.remove();
  var wrap = document.createElement('div');
  wrap.id = 'kpFolderPicker';
  wrap.className = 'kp-folder-picker';
  var breadcrumb = []; var currentFolderId = folderId; var breadcrumbNames = [];
  function renderList(fid) {
    var title = breadcrumbNames.length ? breadcrumbNames[breadcrumbNames.length - 1] : 'Содержимое папки клиента';
    var selectFolderBtn = breadcrumb.length ? '<div class="kp-picker-select-folder" data-action="select-folder" data-folder-id="' + esc(fid) + '">Выбрать эту папку</div>' : '';
    wrap.innerHTML = '<div class="kp-picker-title">' + esc(title) + '</div><div class="kp-picker-list"><div class="kp-picker-loading">Загрузка...</div></div>' + selectFolderBtn + (breadcrumb.length ? '<div class="kp-picker-back" data-action="back">← Назад</div>' : '') + '<div class="kp-picker-clear" data-action="clear">Сбросить привязку</div>';
    var listEl = wrap.querySelector('.kp-picker-list');
    driveListFolderItems(fid).then(function(items) {
      listEl.innerHTML = '';
      if (!items || items.length === 0) {
        listEl.innerHTML = '<div class="kp-picker-empty">Папка пуста</div>';
        return;
      }
      items.forEach(function(it) {
        var div = document.createElement('div');
        div.className = 'kp-picker-item' + (it.isFolder ? ' is-folder' : '');
        div.setAttribute('data-id', it.id);
        div.setAttribute('data-is-folder', it.isFolder ? '1' : '0');
        div.setAttribute('data-link', it.link || '');
        div.setAttribute('data-name', it.name || '');
        div.innerHTML = '<span class="kp-item-ico">' + (it.isFolder ? '📁' : '📄') + '</span><span class="kp-item-name">' + esc(it.name) + '</span>' + (it.isFolder ? ' <span style="opacity:.6">→</span>' : '');
        div.onclick = function() {
          if (it.isFolder) {
            breadcrumb.push(currentFolderId);
            breadcrumbNames.push(it.name);
            currentFolderId = it.id;
            renderList(it.id);
          } else {
            updateAnalyticsRecentProject(project.projectId, { kpFolderLink: it.link });
            refreshClientContents(true);
            wrap.remove();
          }
        };
        listEl.appendChild(div);
      });
    }).catch(function(err) {
      listEl.innerHTML = '<div class="kp-picker-empty">Ошибка: ' + esc(String(err && err.message || err)) + '</div>';
    });
  }
  wrap.addEventListener('click', function(e) {
    var back = e.target.closest('[data-action="back"]');
    var clear = e.target.closest('[data-action="clear"]');
    var selectFolder = e.target.closest('[data-action="select-folder"]');
    if (back) {
      currentFolderId = breadcrumb.pop() || folderId;
      breadcrumbNames.pop();
      renderList(currentFolderId);
    } else if (clear) {
      updateAnalyticsRecentProject(project.projectId, { kpFolderLink: '' });
      refreshClientContents(true);
      wrap.remove();
    } else if (selectFolder) {
      var fid = selectFolder.getAttribute('data-folder-id');
      var link = fid ? 'https://drive.google.com/drive/folders/' + fid : '';
      if (link) {
        updateAnalyticsRecentProject(project.projectId, { kpFolderLink: link });
        refreshClientContents(true);
      }
      wrap.remove();
    }
  });
  document.body.appendChild(wrap);
  var rect = btnEl.getBoundingClientRect();
  var pickerRect = wrap.getBoundingClientRect();
  var x = rect.left;
  var y = rect.bottom + 6;
  if (y + pickerRect.height > window.innerHeight) y = rect.top - pickerRect.height - 6;
  if (x + pickerRect.width > window.innerWidth) x = window.innerWidth - pickerRect.width - 8;
  if (x < 8) x = 8;
  wrap.style.left = x + 'px';
  wrap.style.top = y + 'px';
  renderList(folderId);
  var closeOnClickOutside = function(ev) {
    if (!wrap.parentNode) { document.removeEventListener('click', closeOnClickOutside); return; }
    if (!wrap.contains(ev.target) && !btnEl.contains(ev.target)) {
      wrap.remove();
      document.removeEventListener('click', closeOnClickOutside);
    }
  };
  setTimeout(function() { document.addEventListener('click', closeOnClickOutside); }, 50);
}
function wireAnalyticsProjectTags(project) {
  if (!project) return;
  var avatarAdd = document.getElementById('analyticsProjectAvatarAdd');
  if (avatarAdd) {
    avatarAdd.onclick = function(e) {
      e.stopPropagation();
      var folderId = project.folderId || '';
      if (!folderId && project.folderLink) {
        var m = String(project.folderLink).match(/\/folders\/([a-zA-Z0-9_-]+)/);
        folderId = m ? m[1] : '';
      }
      if (!folderId) {
        alert('Сначала откройте папку клиента (кнопка «Открыть папку»), чтобы добавить аватар в папку.');
        return;
      }
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function() {
        var f = input.files && input.files[0];
        if (!f) return;
        if (typeof driveUploadAvatarToClientFolder === 'function' && typeof getDriveToken === 'function') {
          getDriveToken().then(function() {
            return driveUploadAvatarToClientFolder(f, folderId);
          }).then(function(url) {
            if (url) {
              updateAnalyticsRecentProject(project.projectId, { avatar: url });
              refreshClientContents(true);
            }
          }).catch(function(err) {
            console.warn('Drive upload failed, using local:', err);
            var reader = new FileReader();
            reader.onload = function() {
              updateAnalyticsRecentProject(project.projectId, { avatar: String(reader.result || '') });
              refreshClientContents(true);
            };
            reader.readAsDataURL(f);
          });
        } else {
          var reader = new FileReader();
          reader.onload = function() {
            updateAnalyticsRecentProject(project.projectId, { avatar: String(reader.result || '') });
            refreshClientContents(true);
          };
          reader.readAsDataURL(f);
        }
      };
      input.click();
    };
  }
  var kpFolderBtn = document.getElementById('analyticsProjectKpFolderBtn');
  if (kpFolderBtn) {
    kpFolderBtn.onclick = function(e) {
      e.stopPropagation();
      showKpFolderPicker(project, kpFolderBtn);
    };
  }
  var bar = document.getElementById('analyticsProjectTagBar');
  var inp = document.getElementById('analyticsProjectTagInput');
  if (!bar) return;
  bar.addEventListener('click', function(e) {
    var rm = e.target.closest('.analytics-project-tag-rm');
    if (rm) {
      e.stopPropagation();
      var tagEl = rm.closest('.analytics-project-tag');
      var idx = tagEl ? parseInt(tagEl.getAttribute('data-index'), 10) : -1;
      if (idx >= 0 && typeof getClientTags === 'function' && typeof setClientTags === 'function') {
        var tags = getClientTags(project);
        tags.splice(idx, 1);
        setClientTags(project, tags);
        refreshClientContents(true);
      }
    }
  });
  if (inp) {
    inp.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = (inp.value || '').trim();
        if (val && typeof getClientTags === 'function' && typeof setClientTags === 'function') {
          var tags = getClientTags(project);
          tags.push(val);
          setClientTags(project, tags);
          inp.value = '';
          refreshClientContents(true);
        }
      }
    };
    inp.onblur = function() {
      var val = (inp.value || '').trim();
      if (val && typeof getClientTags === 'function' && typeof setClientTags === 'function') {
        var tags = getClientTags(project);
        tags.push(val);
        setClientTags(project, tags);
        inp.value = '';
        refreshClientContents(true);
      }
    };
  }
}
function wireAnalyticsRecentControls() {
  var wrap = document.getElementById('analyticsRecentSwitch');
  if (wrap) {
    wrap.querySelectorAll('.client-view-btn').forEach(function(btn) {
      btn.onclick = function() {
        var raw = String(btn.getAttribute('data-limit') || '').trim();
        if (raw === 'all') _analyticsRecentLimit = -1;
        else {
          var lim = parseInt(raw, 10);
          _analyticsRecentLimit = (lim === 2 || lim === 3 || lim === 5 || lim === 8 || lim === 10 || lim === 15 || lim === 20) ? lim : 10;
        }
        refreshClientContents(true);
      };
    });
  }
  document.querySelectorAll('.recent-project-item').forEach(function(row) {
    row.onclick = function() {
      _analyticsRecentSelectedProjectId = row.getAttribute('data-project-id') || '';
      if (_analyticsRecentSelectedProjectId) _analyticsOpenedFolderByProject[_analyticsRecentSelectedProjectId] = true;
      refreshClientContents(true);
    };
  });
}
function classifyFileToDocType(name) {
  var n = String(name || '').trim();
  for (var i = 0; i < CLIENT_DOC_TYPES.length; i++) {
    if (n.indexOf(CLIENT_DOC_TYPES[i].prefix) === 0) return CLIENT_DOC_TYPES[i];
  }
  return null;
}
function showClientContentsBack() {
  var bb = document.getElementById('backBtn');
  if (bb) bb.style.display = 'none';
  var selected = getSelectedAnalyticsRecentProject();
  if (selected && selected.projectId) _analyticsOpenedFolderByProject[String(selected.projectId)] = false;
  _analyticsRecentSelectedProjectId = '';
  refreshClientContents(true);
}
async function refreshClientContents(forceFolder) {
  if (projectsMode || goalsMode || agencyMode) return;
  var tab = currentTab;
  if (tab !== 'analysis' && tab !== 'presale' && tab !== 'avito1') return;
  var mc = document.getElementById('mainContent');
  if (!mc) return;
  if (!forceFolder && docReady && currentHtml) {
    renderDoc(currentHtml);
    return;
  }
  var ac = _activeClient || getActiveClient();
  var selectedRecent = getSelectedAnalyticsRecentProject();
  var targetFolderId = (selectedRecent && selectedRecent.folderId) ? selectedRecent.folderId : (ac && ac.folderId ? ac.folderId : '');
  if (!targetFolderId && selectedRecent && selectedRecent.projectId) {
    var pid = String(selectedRecent.projectId);
    if (pid.indexOf('active:') === 0) targetFolderId = pid.slice(7);
    else if (pid.indexOf('gen_') === 0) {
      var parts = pid.split('_');
      if (parts.length >= 3) targetFolderId = parts.slice(2).join('_');
    } else targetFolderId = pid;
  }
  if (!targetFolderId) {
    if (projectsMode || goalsMode || agencyMode) return;
    var headCtrlOnly = '<div class="client-view-switch" id="analyticsRecentSwitch">' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 2 ? ' on' : '') + '" title="2 последние" data-limit="2">2</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 3 ? ' on' : '') + '" title="3 последние" data-limit="3">3</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 5 ? ' on' : '') + '" title="5 последних" data-limit="5">5</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 8 ? ' on' : '') + '" title="8 последних" data-limit="8">8</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 10 ? ' on' : '') + '" title="10 последних" data-limit="10">10</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 15 ? ' on' : '') + '" title="15 последних" data-limit="15">15</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 20 ? ' on' : '') + '" title="20 последних" data-limit="20">20</button>' +
      '<button type="button" class="client-view-btn' + (_analyticsRecentLimit < 0 ? ' on' : '') + '" title="Все" data-limit="all">&#8734;</button>' +
      '</div>';
    var headHtmlOnly = '<div class="client-contents-head"><div class="client-contents-title">Содержимое клиента — Недавние</div>' + headCtrlOnly + '</div>';
    var recentOnly = buildAnalyticsRecentProjectsBlock();
    mc.innerHTML = '<div class="client-contents">' + headHtmlOnly + recentOnly +
      '<div class="empty-st" style="padding:18px 0"><div style="font-size:30px;opacity:.25">&#128194;</div><p style="font-size:13px">Выберите проект из «Недавние» или клиента слева</p></div></div>';
    wireAnalyticsRecentControls();
    return;
  }
  var canShowDocs = !!targetFolderId;
  var selectedKey = selectedRecent && selectedRecent.projectId ? String(selectedRecent.projectId) : '';
  var showFolderGenerations = !selectedKey || !!_analyticsOpenedFolderByProject[selectedKey];
  if (_refreshClientContentsInFlight && forceFolder) return;
  _refreshClientContentsInFlight = true;
  restoreDriveTokenFromStorage();
  if (!_driveToken && !getStoredDriveAuth()) {
    _refreshClientContentsInFlight = false;
    if (projectsMode || goalsMode || agencyMode) return;
    var headNeedAuth = '<div class="client-contents-head"><div class="client-contents-title">' + (getAnalyticsRecentTitle() || 'Недавние') + '</div></div>';
    mc.innerHTML = '<div class="client-contents">' + headNeedAuth + buildAnalyticsRecentProjectsBlock() +
      '<div class="empty-st" style="padding:24px 0"><div style="font-size:36px;opacity:.2">&#128194;</div><p style="font-size:14px">Войдите в Google Drive</p><p style="font-size:12px;opacity:.7;margin-top:6px">Нажмите кнопку 🔑 Drive в шапке страницы, чтобы загрузить папку</p><button type="button" class="btn-back-inline" onclick="refreshClientContents(true)" style="margin-top:12px">Повторить</button></div></div>';
    wireAnalyticsRecentControls();
    return;
  }
  if (projectsMode || goalsMode || agencyMode) return;
  mc.innerHTML = '<div class="empty-st"><div class="spinner" style="margin:0 auto"></div><p style="font-size:13px">Загружаю содержимое папки...</p></div>';
  var safetyTmr = setTimeout(function() {
    if (_refreshClientContentsInFlight && !projectsMode && !goalsMode && !agencyMode && mc) {
      _refreshClientContentsInFlight = false;
      var headCtrlSt = '<div class="client-view-switch" id="analyticsRecentSwitch"><button type="button" class="client-view-btn" data-limit="2">2</button><button type="button" class="client-view-btn" data-limit="3">3</button><button type="button" class="client-view-btn" data-limit="5">5</button><button type="button" class="client-view-btn" data-limit="8">8</button><button type="button" class="client-view-btn" data-limit="10">10</button><button type="button" class="client-view-btn" data-limit="15">15</button><button type="button" class="client-view-btn" data-limit="20">20</button><button type="button" class="client-view-btn" data-limit="all">&#8734;</button></div>';
      var headSt = '<div class="client-contents-head"><div class="client-contents-title">' + (getAnalyticsRecentTitle() || 'Недавние') + '</div>' + headCtrlSt + '</div>';
      mc.innerHTML = '<div class="client-contents">' + headSt + buildAnalyticsRecentProjectsBlock() +
        '<div class="empty-st" style="padding:24px 0"><div style="font-size:36px;opacity:.2">&#9888;</div><p style="font-size:14px">Таймаут загрузки</p><p style="font-size:12px;opacity:.7">Попробуйте снова</p><button type="button" class="btn-back-inline" onclick="refreshClientContents(true)" style="margin-top:12px">Повторить</button></div></div>';
      wireAnalyticsRecentControls();
    }
  }, 13000);
  var files = [];
  var loadErr = null;
  try {
    files = await driveListClientFolderFiles(targetFolderId);
  } catch (e) {
    loadErr = e;
    console.warn('refreshClientContents: driveListClientFolderFiles', e);
  } finally {
    clearTimeout(safetyTmr);
    _refreshClientContentsInFlight = false;
    if (loadErr) {
      var mc2 = document.getElementById('mainContent');
      if (mc2 && !projectsMode && !goalsMode && !agencyMode) {
        var headCtrlErr = '<div class="client-view-switch" id="analyticsRecentSwitch">' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 2 ? ' on' : '') + '" data-limit="2">2</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 3 ? ' on' : '') + '" data-limit="3">3</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 5 ? ' on' : '') + '" data-limit="5">5</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 8 ? ' on' : '') + '" data-limit="8">8</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 10 ? ' on' : '') + '" data-limit="10">10</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 15 ? ' on' : '') + '" data-limit="15">15</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 20 ? ' on' : '') + '" data-limit="20">20</button>' +
          '<button type="button" class="client-view-btn' + (_analyticsRecentLimit < 0 ? ' on' : '') + '" data-limit="all">&#8734;</button></div>';
        var errMsg = (loadErr && loadErr.name === 'AbortError') ? 'Таймаут загрузки. Проверь интернет.' : (loadErr && loadErr.message === 'Нажмите 🔑 Drive' ? 'Войдите в Google Drive (кнопка 🔑 в шапке)' : String(loadErr && loadErr.message || loadErr));
        var headHtmlErr = '<div class="client-contents-head"><div class="client-contents-title">' + (getAnalyticsRecentTitle() || 'Недавние') + '</div>' + headCtrlErr + '</div>';
        var recentErr = buildAnalyticsRecentProjectsBlock();
        var sel = getSelectedAnalyticsRecentProject();
        if (sel) recentErr = '<div class="recent-projects-mini-wrap">' + recentErr + '</div>';
        mc2.innerHTML = '<div class="client-contents">' + headHtmlErr + recentErr +
          '<div class="empty-st" style="padding:24px 0"><div style="font-size:36px;opacity:.2">&#9888;</div><p style="font-size:14px">Ошибка загрузки папки</p><p style="font-size:12px;opacity:.7;margin-top:6px">' + String(errMsg).substring(0,140) + '</p><p style="font-size:11px;opacity:.5;margin-top:8px">Проверь Drive и попробуй снова</p><button type="button" class="btn-back-inline" onclick="refreshClientContents(true)" style="margin-top:12px">Повторить</button></div></div>';
        wireAnalyticsRecentControls();
      }
      return;
    }
  }
  if (projectsMode || goalsMode || agencyMode) return;
  mc = document.getElementById('mainContent');
  if (!mc) return;
  try {
  var byKey = {};
  files = Array.isArray(files) ? files : [];
  files.forEach(function(f) {
    var t = classifyFileToDocType(f.name);
    if (t && !byKey[t.key]) {
      var link = f.webViewLink || (f.mimeType === 'application/vnd.google-apps.document' && f.id ? 'https://docs.google.com/document/d/' + f.id + '/edit' : f.id ? 'https://drive.google.com/file/d/' + f.id + '/view' : null);
      if (link && f.id) byKey[t.key] = { type: t, id: f.id, link: link, mimeType: f.mimeType };
    }
  });
  var clientName = (ac && (ac.company || ac.contact_name)) || (selectedRecent && (selectedRecent.company || selectedRecent.title || selectedRecent.projectTitle)) || 'Клиент';
  var recentTitle = getAnalyticsRecentTitle();
  var headTitle = 'Содержимое клиента — ' + (recentTitle || 'Недавние');
  var headCtrl = '<div class="client-view-switch" id="analyticsRecentSwitch">' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 2 ? ' on' : '') + '" title="2 последние" data-limit="2">2</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 3 ? ' on' : '') + '" title="3 последние" data-limit="3">3</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 5 ? ' on' : '') + '" title="5 последних" data-limit="5">5</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 8 ? ' on' : '') + '" title="8 последних" data-limit="8">8</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 10 ? ' on' : '') + '" title="10 последних" data-limit="10">10</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 15 ? ' on' : '') + '" title="15 последних" data-limit="15">15</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit === 20 ? ' on' : '') + '" title="20 последних" data-limit="20">20</button>' +
    '<button type="button" class="client-view-btn' + (_analyticsRecentLimit < 0 ? ' on' : '') + '" title="Все" data-limit="all">&#8734;</button>' +
    '</div>';
  var backBtnInline = selectedKey ? '<div class="client-contents-back-wrap"><button type="button" class="btn-back-inline" onclick="showClientContentsBack()">← К другим папкам</button></div>' : '';
  var headHtml = '<div class="client-contents-head"><div class="client-contents-title">' + headTitle + '</div>' + headCtrl + '</div>';
  var recentProjectsHtml = buildAnalyticsRecentProjectsBlock();
  if (selectedRecent) recentProjectsHtml = '<div class="recent-projects-mini-wrap">' + recentProjectsHtml + '</div>';
  var projectDetailHtml = selectedRecent ? buildAnalyticsProjectDetail(selectedRecent, byKey) : '';
  var folderLink = (selectedRecent && selectedRecent.folderLink) ? selectedRecent.folderLink : (targetFolderId ? 'https://drive.google.com/drive/folders/' + targetFolderId : '');
  var cardsHtml = '';
  CLIENT_DOC_TYPES.forEach(function(t) {
    var doc = byKey[t.key];
    if (doc) {
      var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var docTag = '<span class="client-content-card-tag">' + esc(t.title) + '</span>';
      var folderBtn = folderLink ? '<a href="' + esc(folderLink) + '" target="_blank" rel="noopener" class="client-content-card-folder-btn" onclick="event.stopPropagation()">&#128194; Папка Google</a>' : '';
      cardsHtml += '<div class="client-content-card" data-doc-id="' + esc(doc.id) + '" data-doc-key="' + esc(t.key) + '" data-doc-link="' + esc(doc.link) + '" data-doc-mime="' + esc(doc.mimeType||'') + '">' +
        '<div class="client-content-card-main">' +
        '<div class="client-content-card-body"><div class="client-content-card-ico">' + t.ico + '</div><div class="client-content-card-title">' + t.title + '</div><div class="client-content-card-desc">' + t.desc + '</div>' +
        '<div class="client-content-card-tags">' + docTag + '</div>' + (folderBtn ? '<div class="client-content-card-folder-wrap">' + folderBtn + '</div>' : '') + '</div>' +
        '<span class="client-content-card-arr">&#8594;</span></div>' +
        '<a href="' + esc(doc.link) + '" target="_blank" rel="noopener" class="client-content-card-drive" title="Открыть документ" onclick="event.stopPropagation()">&#128196;</a></div>';
    }
  });
  var tagBar = selectedRecent ? '' : buildClientTagBar(ac);
  var backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.style.display = selectedKey ? 'inline-flex' : 'none';
  if (!canShowDocs) {
    mc.innerHTML = '<div class="client-contents">' + headHtml + backBtnInline + projectDetailHtml +
      tagBar +
      '<div class="empty-st" style="padding:18px 0"><div style="font-size:30px;opacity:.25">&#128194;</div><p style="font-size:13px">Документы появятся здесь после выбора проекта из «Недавние»</p></div>' +
      recentProjectsHtml + '</div>';
    wireClientTagBar(selectedRecent || ac);
    if (selectedRecent) wireAnalyticsProjectTags(selectedRecent);
    wireAnalyticsRecentControls();
    return;
  }
  if (selectedKey && !showFolderGenerations) {
    mc.innerHTML = '<div class="client-contents">' + headHtml + backBtnInline + projectDetailHtml +
      tagBar +
      '<div class="empty-st" style="padding:18px 0"><div style="font-size:30px;opacity:.25">&#128194;</div><p style="font-size:13px">Какие генерации есть в папке — покажем после открытия папки клиента</p></div>' +
      recentProjectsHtml + '</div>';
    wireClientTagBar(selectedRecent || ac);
    if (selectedRecent) wireAnalyticsProjectTags(selectedRecent);
    wireAnalyticsRecentControls();
    return;
  }
  if (!cardsHtml) {
    mc.innerHTML = '<div class="client-contents">' + headHtml + backBtnInline + projectDetailHtml +
      tagBar +
      '<div class="empty-st" style="padding:24px 0"><div style="font-size:36px;opacity:.2">&#128194;</div><p style="font-size:14px">Папка пуста</p><p style="font-size:12px;opacity:.5">Сгенерируй документы и они появятся здесь</p></div>' +
      recentProjectsHtml + '</div>';
    wireClientTagBar(selectedRecent || ac);
    if (selectedRecent) wireAnalyticsProjectTags(selectedRecent);
    wireAnalyticsRecentControls();
    return;
  }
  mc.innerHTML = '<div class="client-contents">' + headHtml + backBtnInline + projectDetailHtml +
    tagBar +
    '<div class="client-contents-cards">' + cardsHtml + '</div>' +
    recentProjectsHtml + '</div>';
  wireClientTagBar(selectedRecent || ac);
  if (selectedRecent) wireAnalyticsProjectTags(selectedRecent);
  wireAnalyticsRecentControls();
  mc.querySelectorAll('.client-content-card-main').forEach(function(el) {
    var card = el.closest('.client-content-card');
    if (!card) return;
    el.onclick = function() {
      var id = card.getAttribute('data-doc-id');
      var key = card.getAttribute('data-doc-key');
      var link = card.getAttribute('data-doc-link');
      var mime = card.getAttribute('data-doc-mime');
      if (id) openClientDocInWindow(id, key, link, mime);
    };
  });
  mc.querySelectorAll('.project-page-doc').forEach(function(btn) {
    btn.onclick = function() {
      var id = btn.getAttribute('data-doc-id');
      var key = btn.getAttribute('data-doc-key');
      var link = btn.getAttribute('data-doc-link');
      var mime = btn.getAttribute('data-doc-mime');
      if (id) openClientDocInWindow(id, key, link, mime);
    };
  });
  } catch (e) {
    console.warn('refreshClientContents render', e);
    var mcx = document.getElementById('mainContent');
    if (mcx && !projectsMode && !goalsMode && !agencyMode) {
      var headCatch = '<div class="client-contents-head"><div class="client-contents-title">' + (getAnalyticsRecentTitle() || 'Недавние') + '</div></div>';
      mcx.innerHTML = '<div class="client-contents">' + headCatch + (typeof buildAnalyticsRecentProjectsBlock === 'function' ? buildAnalyticsRecentProjectsBlock() : '') +
        '<div class="empty-st" style="padding:24px 0"><div style="font-size:36px;opacity:.2">&#9888;</div><p style="font-size:14px">Ошибка отображения</p><p style="font-size:12px;opacity:.7">' + String(e && e.message || e) + '</p><button type="button" class="btn-back-inline" onclick="refreshClientContents(true)" style="margin-top:12px">Повторить</button></div></div>';
      if (typeof wireAnalyticsRecentControls === 'function') wireAnalyticsRecentControls();
    }
  }
}
var AVITO_IMG_CACHE_PREFIX = 'avito_img_';
var CLIENT_AVATAR_PREFIX = 'client_avatar_';
var CLIENT_TAGS_PREFIX = 'client_tags_';
function getAvitoImageCacheKey(url) { return AVITO_IMG_CACHE_PREFIX + (url||'').replace(/\s/g,'').toLowerCase(); }
function getClientAvatarKey(ac) { return CLIENT_AVATAR_PREFIX + (ac && ac.folderId ? ac.folderId : (ac && ac.company ? String(ac.company).slice(0,30) : 'default')); }
function getClientTagsKey(ac) { return CLIENT_TAGS_PREFIX + (ac && ac.folderId ? ac.folderId : (ac && ac.company ? String(ac.company).slice(0,50).replace(/\s/g,'_') : 'default')); }
function getClientTags(ac) { try { var s = localStorage.getItem(getClientTagsKey(ac)); return s ? JSON.parse(s) : []; } catch(e) { return []; } }
function setClientTags(ac, tags) { try { localStorage.setItem(getClientTagsKey(ac), JSON.stringify(tags)); } catch(e) {} }
function buildClientTagBar(ac) {
  if (!ac) return '';
  var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var tags = getClientTags(ac);
  var html = '<div class="client-tag-bar" id="clientTagBar" data-ac-key="' + esc(getClientTagsKey(ac)) + '">';
  tags.forEach(function(t, i) { html += '<span class="client-tag" data-index="' + i + '">' + esc(t) + ' <span class="client-tag-remove" title="Удалить">&#10038;</span></span>'; });
  html += '<span class="client-tag-add"><input type="text" placeholder="+ Добавить тег" id="clientTagInput"></span></div>';
  return html;
}
function wireClientTagBar(ac) {
  if (!ac) return;
  var bar = document.getElementById('clientTagBar');
  var inp = document.getElementById('clientTagInput');
  if (!bar) return;
  bar.addEventListener('click', function(e) {
    var rm = e.target.closest('.client-tag-remove');
    if (rm) {
      e.stopPropagation();
      var tagEl = rm.closest('.client-tag');
      var idx = tagEl ? parseInt(tagEl.getAttribute('data-index'), 10) : -1;
      if (idx >= 0) {
        var tags = getClientTags(ac);
        tags.splice(idx, 1);
        setClientTags(ac, tags);
        refreshClientContents(true);
      }
    }
  });
  if (inp) {
    var addEl = bar.querySelector('.client-tag-add');
    if (addEl) addEl.addEventListener('click', function() { inp.focus(); });
    inp.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = (inp.value || '').trim();
        if (val) {
          var tags = getClientTags(ac);
          tags.push(val);
          setClientTags(ac, tags);
          inp.value = '';
          refreshClientContents(true);
        }
      }
    };
    inp.onblur = function() {
      var val = (inp.value || '').trim();
      if (val) {
        var tags = getClientTags(ac);
        tags.push(val);
        setClientTags(ac, tags);
        inp.value = '';
        refreshClientContents(true);
      }
    };
  }
}
function getClientAvatar(ac) { try { return localStorage.getItem(getClientAvatarKey(ac)) || ''; } catch(e) { return ''; } }
function setClientAvatar(ac, dataUrl) { try { if (dataUrl) localStorage.setItem(getClientAvatarKey(ac), dataUrl); if (typeof refreshClientContents === 'function') refreshClientContents(true); if (typeof updateClientBadge === 'function') updateClientBadge(); if (document.getElementById('clientMenu') && document.getElementById('clientMenu').classList.contains('show') && _browseCurrentId) browseFolder(_browseCurrentId, _browseCurrentName); } catch(e) {} }
function shortenLink(url, text, maxLen) {
  if (!url) return text || '';
  maxLen = maxLen || 28;
  var t = String(text || url);
  if (t.length <= maxLen) return t;
  try {
    var u = new URL(t.indexOf('http')===0 ? t : 'https://'+t);
    var host = u.hostname.replace(/^www\./,'');
    if (host === 'avito.ru' || host === 'www.avito.ru') return 'avito.ru →';
    var path = (u.pathname || '').replace(/^\/+/,'');
    if (path.length > 14) path = path.slice(0,10)+'…';
    return host + (path ? '/'+path : '');
  } catch(e) {}
  return t.slice(0,maxLen-1)+'…';
}
function getNicheThumbDataUri(niche) {
  if (!niche) return '';
  var s = String(niche).trim().slice(0,2).toUpperCase().replace(/&/g,'&amp;').replace(/</g,'&lt;');
  var h = 0; for (var i=0;i<niche.length;i++) h=((h<<5)-h)+niche.charCodeAt(i)|0;
  var hue = Math.abs(h%360); var sat=65; var lig=35;
  var c1='hsl('+hue+','+sat+'%,'+lig+'%)'; var c2='hsl('+((hue+40)%360)+','+(sat-15)+'%,'+(lig+15)+'%)';
  return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="88" height="60" viewBox="0 0 88 60"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:'+c1+'" /><stop offset="100%" style="stop-color:'+c2+'" /></linearGradient></defs><rect width="88" height="60" fill="url(#g)" rx="8"/><text x="44" y="38" font-family="system-ui,Arial" font-size="16" font-weight="700" fill="rgba(255,255,255,0.92)" text-anchor="middle">'+s+'</text></svg>');
}
function getCachedAvitoImage(url) {
  try { return localStorage.getItem(getAvitoImageCacheKey(url)) || ''; } catch(e) { return ''; }
}
function setCachedAvitoImage(url, imgUrl) {
  try { if (imgUrl) localStorage.setItem(getAvitoImageCacheKey(url), imgUrl); } catch(e) {}
}
async function fetchAvitoListingImage(avitoUrl) {
  var cached = getCachedAvitoImage(avitoUrl);
  if (cached) return cached;
  try {
    var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(avitoUrl);
    var resp = await fetch(proxyUrl);
    if (!resp.ok) return '';
    var html = await resp.text();
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var ogImg = doc.querySelector('meta[property="og:image"]');
    var imgUrl = ogImg ? (ogImg.getAttribute('content') || '').trim() : '';
    if (!imgUrl) {
      var secure = doc.querySelector('meta[property="og:image:secure_url"]');
      if (secure) imgUrl = (secure.getAttribute('content') || '').trim();
    }
    if (imgUrl) { setCachedAvitoImage(avitoUrl, imgUrl); return imgUrl; }
  } catch(e) { /* CORS/сеть — превью Avito не критично */ }
  return '';
}
function triggerAvitoThumbFetch(avitoUrl, imgElId) {
  fetchAvitoListingImage(avitoUrl).then(function(imgUrl) {
    if (!imgUrl) return;
    var el = document.getElementById(imgElId);
    if (!el) return;
    el.src = imgUrl;
    el.classList.remove('loading', 'err');
    var wrap = el.closest ? el.closest('.ci-avito-wrap') : el.parentNode && el.parentNode.parentNode;
    if (wrap) {
      var first = wrap.firstElementChild;
      if (first && (first.classList.contains('ci-niche-thumb') || first.classList.contains('ci-avito-placeholder'))) first.style.display = 'none';
    }
  });
}
function buildClientInfoBlock(ac) {
  if (!ac) return '';
  var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var items = [];
  var phone = ac.phone || (typeof v === 'function' ? v('phone') : '');
  var tg = ac.telegram || ac.tg || (typeof v === 'function' ? v('tg') : '');
  var avito = ac.avito_account || (typeof v === 'function' ? v('avito_account') : '');
  var cat = ac.category || (typeof v === 'function' ? v('category') : '');
  var city = ac.city || (typeof getGeoValues === 'function' ? getGeoValues().join(', ') : '') || (typeof v === 'function' ? v('city') : '');
  var ctype = ac.client_type || (typeof v === 'function' ? v('client_type') : '');
  var kp = ac.kp_count || (typeof v === 'function' ? v('kp_count') : '');
  var notes = ac.notes || (typeof v === 'function' ? v('notes') : '');
  var poses = typeof getPos === 'function' ? getPos() : [];
  if (phone) items.push('<span class="ci-item">📞 <span class="ci-val">' + esc(phone) + '</span></span>');
  if (tg) {
    var tgUser = String(tg).replace(/^@/,'').replace(/^https?:\/\/t\.me\/?/i,'');
    var tgHref = 'https://t.me/' + tgUser;
    var tgDisplay = tgUser.length > 18 ? 't.me/' + tgUser.slice(0,12) + '…' : (tgUser.indexOf('/')>=0 ? 't.me/'+tgUser : tgUser);
    items.push('<span class="ci-item">💬 <a class="ci-link" href="' + esc(tgHref) + '" target="_blank" title="' + esc(tg) + '">' + esc(tgDisplay) + '</a></span>');
  }
  if (avito) {
    var avitoUrl = avito.indexOf('http')===0 ? avito : 'https://www.avito.ru/' + avito.replace(/^\/+/,'');
    items.push('<span class="ci-item">📦 <a class="ci-link" href="' + esc(avitoUrl) + '" target="_blank" title="' + esc(avito) + '">Магазин на Авито</a></span>');
  }
  if (cat) items.push('<span class="ci-item">🏷 <span class="ci-val">' + esc(cat) + '</span></span>');
  if (city) items.push('<span class="ci-item">📍 <span class="ci-val">' + esc(city) + '</span></span>');
  if (ctype) items.push('<span class="ci-item">👤 <span class="ci-val">' + esc(ctype) + '</span></span>');
  if (kp) items.push('<span class="ci-item">📊 <span class="ci-val">' + esc(kp) + '</span></span>');
  if (notes) items.push('<span class="ci-item" title="' + esc(notes) + '">💡 <span class="ci-val" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(notes) + '</span></span>');
  if (poses.length) items.push('<span class="ci-item">📌 <span class="ci-val">' + esc(poses.slice(0,2).join(', ') + (poses.length>2?'…':'') ) + '</span></span>');
  var avitoThumb = '';
  var customAvatar = getClientAvatar(ac);
  var nicheSvg = cat ? getNicheThumbDataUri(cat) : '';
  var triggerUpload = 'var w=this.closest(\'.ci-avito-wrap\');var i=w&&w.querySelector(\'input.ci-avatar-file-input\');if(i){i.click()}';
  var fileInput = '<input type="file" class="ci-avatar-file-input" accept="image/*" onchange="window.__ciAvatarUpload&&window.__ciAvatarUpload(this)">';
  var plusBtn = '<button type="button" class="ci-avatar-plus" title="Загрузить фото" onclick="' + esc(triggerUpload) + '">+</button>';
  var inner = '';
  if (customAvatar) {
    inner = '<img src="' + esc(customAvatar) + '" class="ci-avito-thumb ci-custom-avatar" alt="">';
  } else if (avito) {
    var avitoUrl = avito.indexOf('http')===0 ? avito : 'https://www.avito.ru/' + avito.replace(/^\/+/,'');
    var cachedImg = getCachedAvitoImage(avitoUrl);
    var imgId = 'avito-thumb-' + (avitoUrl.replace(/\W/g,'').slice(-12));
    var placeSrc = nicheSvg || '';
    if (cachedImg) {
      inner = (placeSrc ? '<img src="' + esc(placeSrc) + '" class="ci-niche-thumb" alt="" style="display:none">' : '') + '<a href="' + esc(avitoUrl) + '" target="_blank" title="Avito"><img id="' + imgId + '" class="ci-avito-thumb" src="' + esc(cachedImg) + '" alt="Avito" onerror="this.classList.add(\'err\');var w=this.closest(\'.ci-avito-wrap\');var n=w&&w.querySelector(\'.ci-niche-thumb\');if(n)n.style.display=\'block\';this.style.display=\'none\'"></a>';
    } else {
      inner = (placeSrc ? '<img src="' + esc(placeSrc) + '" class="ci-niche-thumb" alt="">' : '<div class="ci-avito-placeholder">📦</div>') + '<a href="' + esc(avitoUrl) + '" target="_blank" title="Avito"><img id="' + imgId + '" class="ci-avito-thumb loading" alt="Avito" onerror="this.classList.add(\'err\');var w=this.closest(\'.ci-avito-wrap\');var n=w&&w.querySelector(\'.ci-niche-thumb\');if(n){n.style.display=\'block\'};this.style.display=\'none\'"></a>';
    }
  } else if (nicheSvg) {
    inner = '<img src="' + esc(nicheSvg) + '" class="ci-niche-thumb" alt="Ниша">';
  } else {
    inner = '<div class="ci-avito-placeholder">📦</div>';
  }
  var thumbClick = 'if(!event.target.closest(\'a\')){var w=this.closest(\'.ci-avito-wrap\');var i=w&&w.querySelector(\'input.ci-avatar-file-input\');if(i)i.click()}';
  avitoThumb = '<div class="ci-avito-wrap" data-ac-key="' + esc(getClientAvatarKey(ac)) + '">' + fileInput + '<div class="ci-thumb-inner ci-upload-zone" onclick="' + thumbClick + '" title="Нажмите для загрузки фото">' + inner + '</div>' + plusBtn + '</div>';
  var folderLink = '';
  var fl = ac.folderLink || (ac.folderId ? 'https://drive.google.com/drive/folders/' + ac.folderId : '');
  if (fl) folderLink = '<a href="' + esc(fl) + '" target="_blank" class="ci-open-folder">&#128194; Папка</a>';
  if (items.length === 0 && !folderLink && !avitoThumb) return '';
  window.__ciAvatarUpload = function(fileInput) {
    var f = fileInput && fileInput.files && fileInput.files[0];
    if (!f) return;
    var wrap = fileInput && fileInput.closest ? fileInput.closest('.ci-avito-wrap') : null;
    var inner = wrap ? wrap.querySelector('.ci-thumb-inner') : null;
    if (inner) { inner.innerHTML = '<div class="spinner" style="width:32px;height:32px;margin:auto;border-width:2px"></div>'; inner.classList.add('ci-uploading'); }
    var r = new FileReader();
    r.onload = function() {
      var rawDataUrl = r.result;
      var esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      if (inner) { inner.innerHTML = '<img src="' + esc(rawDataUrl) + '" class="ci-avito-thumb ci-custom-avatar" alt="">'; inner.classList.remove('ci-uploading'); }
      var img = new Image();
      img.onload = function() {
        var MAX = 400;
        var w = img.width, h = img.height;
        if (w <= MAX && h <= MAX) { doSave(rawDataUrl); return; }
        var scale = Math.min(MAX / w, MAX / h);
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        var thumbUrl = c.toDataURL('image/jpeg', 0.88);
        doSave(thumbUrl);
      };
      img.onerror = function() { doSave(rawDataUrl); };
      img.src = rawDataUrl;
      function doSave(dataUrl) {
        var ac = _activeClient || (typeof getActiveClient === 'function' && getActiveClient());
        setClientAvatar(ac, dataUrl);
      }
    };
    r.readAsDataURL(f);
    fileInput.value = '';
  };
  var html = '<div class="client-info-block">' + avitoThumb + '<div class="ci-data-col"><div class="ci-items">' + items.join('') + '</div>' + folderLink + '</div></div>';
  if (avito && !customAvatar && !getCachedAvitoImage(avito.indexOf('http')===0 ? avito : 'https://www.avito.ru/' + avito.replace(/^\/+/,''))) {
    var aUrl = avito.indexOf('http')===0 ? avito : 'https://www.avito.ru/' + avito.replace(/^\/+/,'');
    var bid = 'avito-thumb-' + (aUrl.replace(/\W/g,'').slice(-12));
    setTimeout(function(){ triggerAvitoThumbFetch(aUrl, bid); }, 100);
  }
  return html;
}
function dismissGenerationError() {
  if (currentTab === 'analysis' && docReady && currentHtml) {
    renderDoc(currentHtml);
  } else {
    var ico = currentTab==='analysis' ? '&#128202;' : currentTab==='presale' ? '&#9200;' : '&#127942;';
    setContent('<div class="empty-st"><div style="font-size:38px;opacity:.2">' + ico + '</div><p style="font-size:14px">Заполни данные и нажми Сгенерировать</p></div>');
  }
}
var _analyticsToastTimer = null;
function showAnalyticsReadyToast(text) {
  if (!text) return;
  var n = document.getElementById('analyticsReadyToast');
  if (!n) {
    n = document.createElement('div');
    n.id = 'analyticsReadyToast';
    n.className = 'analytics-ready-toast';
    document.body.appendChild(n);
  }
  n.textContent = text;
  n.classList.add('show');
  if (_analyticsToastTimer) clearTimeout(_analyticsToastTimer);
  _analyticsToastTimer = setTimeout(function() {
    var nn = document.getElementById('analyticsReadyToast');
    if (nn) nn.classList.remove('show');
  }, 4200);
}

// ── GENERATE ──
function generate() {
  try {
  var ac = _activeClient || getActiveClient();
  if (!ac || !ac.folderId) {
    var st = document.getElementById('crmSt');
    if (st) { st.className = 'crm-st err'; st.textContent = 'Выберите папку клиента в левом меню'; }
    return;
  }
  acSaveAll();
  var btns = document.querySelectorAll('.btn-gen');
  (btns ? [].slice.call(btns) : []).forEach(function(b) {
    b.disabled = true;
    b.innerHTML = '<span>⚡</span><span>Генерирую...</span>';
  });
  pgStart();
  if (!projectsMode) {
    setContent('<div class="loading"><div class="spinner"></div><p>AI анализирует нишу...</p></div>');
    hideChat();
  }

  var cityVal = (typeof getGeoValues === 'function' ? getGeoValues().join(', ') : '') || v('city');
  currentData = {
    company:   v('company'),
    name:      v('contact_name'),
    tg:        v('tg'),
    phone:     v('phone'),
    category:  v('category'),
    city:      cityVal,
    notes:     v('notes'),
    avito_account: v('avito_account'),
    client_type: v('client_type'),
    kp:        v('kp_count'),
    positions: getPos()
  };

  var prompt = currentTab === 'analysis' ? buildAnalysisPrompt() :
               currentTab === 'presale' ? buildPresalePrompt() :
               buildAvito1Prompt();

  var maxTok = currentTab === 'analysis' 
    ? (currentDepth === 'light' ? 4000 : currentDepth === 'max' ? 8000 : 6000) 
    : (currentDepth === 'light' ? 3000 : 4500);
  callAPI(prompt, maxTok).then(function(raw) {
    try {
      if (!raw || typeof raw !== 'string') throw new Error('API вернул пустой ответ');
      var cleaned = (raw.replace(/```json|```/g, '') || '').trim();
      var json;
      try { json = JSON.parse(fixJSON(cleaned)); } catch(parseErr) {
        throw new Error('Не удалось распарсить ответ AI. Попробуй ещё раз.');
      }
      if (!json) throw new Error('Неверный формат ответа');
      if (json.normalized) saveNorm(json.normalized);
      var html = json.html || '';
      try {
        var sp = (typeof getSelectedProject === 'function') ? getSelectedProject() : null;
        var ts = Date.now();
        var recentEntry = {
          projectId: 'gen_' + ts + '_' + (ac.folderId || (sp && sp.id) || ''),
          folderId: ac.folderId || '',
          folderLink: ac.folderLink || (ac.folderId ? 'https://drive.google.com/drive/folders/' + ac.folderId : ''),
          company: currentData.company || ac.company || '',
          title: (sp && (sp.company || sp.title)) || currentData.company || '',
          projectTitle: (sp && (sp.company || sp.title)) || currentData.company || '',
          phone: currentData.phone || ac.phone || '',
          telegram: currentData.tg || ac.telegram || ac.tg || '',
          avito_account: currentData.avito_account || ac.avito_account || '',
          category: currentData.category || ac.category || '',
          city: currentData.city || ac.city || '',
          emoji: (sp && sp.emoji) || '📦',
          avatar: (typeof getClientAvatar === 'function' ? (getClientAvatar(ac) || '') : ''),
          ts: Date.now()
        };
        saveAnalyticsRecentGeneration(recentEntry);
      } catch (histErr) {}
      if (!projectsMode) {
        renderDoc(html);
      } else {
        currentHtml = html;
        docReady = true;
        showAnalyticsReadyToast('Аналитика готова: ' + (currentData && currentData.company ? currentData.company : 'клиент'));
      }
      if (document.getElementById('crmToggle').checked) {
        if (_driveToken && html) {
          setTimeout(function() { triggerCRM(html); }, 500);
        } else {
          var st = document.getElementById('crmSt');
          if (st) { st.className = 'crm-st err'; st.textContent = '✗ Нажмите 🔑 Drive для авторизации'; }
        }
      }
    } catch (innerErr) {
      throw innerErr;
    }
  }).catch(function(e) {
    if (!projectsMode) {
      setContent('<div class="error-box">Ошибка: ' + (e.message || e).replace(/</g,'&lt;') + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" onclick="generate()" style="padding:8px 16px;background:var(--accent);color:#0c0c0e;border:none;border-radius:8px;cursor:pointer;font-weight:700">Повторить</button><button type="button" onclick="promptProxy()" style="padding:8px 16px;background:rgba(0,217,126,0.3);color:var(--accent);border:1px solid var(--accent);border-radius:8px;cursor:pointer;font-weight:700">Настроить прокси</button><button type="button" onclick="dismissGenerationError()" style="padding:8px 16px;background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-weight:700">Закрыть</button></div><p style="font-size:11px;opacity:.8;margin-top:8px">Нажми «Настроить прокси» → вставь URL или оставь пусто для прямого API.</p></div>');
    } else {
      showAnalyticsReadyToast('Ошибка анализа: ' + e.message);
    }
  }).finally(function() {
    var btns = document.querySelectorAll('.btn-gen');
    (btns ? [].slice.call(btns) : []).forEach(function(b) {
      b.innerHTML = '<span>⚡</span><span>СГЕНЕРИРОВАТЬ</span>';
    });
    updateGenButtonState();
    pgStop();
  });
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    if (!projectsMode) setContent('<div class="error-box">Ошибка: ' + msg.replace(/</g,'&lt;') + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" onclick="generate()" style="padding:8px 16px;background:var(--accent);color:#0c0c0e;border:none;border-radius:8px;cursor:pointer;font-weight:700">Повторить</button><button type="button" onclick="promptProxy()" style="padding:8px 16px;background:rgba(0,217,126,0.3);color:var(--accent);border:1px solid var(--accent);border-radius:8px;cursor:pointer;font-weight:700">Настроить прокси</button><button type="button" onclick="dismissGenerationError()" style="padding:8px 16px;background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-weight:700">Закрыть</button></div><p style="font-size:11px;opacity:.8;margin-top:8px">Нажми «Настроить прокси» → вставь URL или оставь пусто для прямого API.</p></div>');
    else showAnalyticsReadyToast('Ошибка: ' + msg);
    var btns = document.querySelectorAll('.btn-gen');
    (btns ? [].slice.call(btns) : []).forEach(function(b) {
      b.innerHTML = '<span>⚡</span><span>СГЕНЕРИРОВАТЬ</span>';
    });
    updateGenButtonState();
    pgStop();
  }
}

// ── CLIENT INFO ──
function clientInfo() {
  var d = currentData;
  var client = [d.company, d.name].filter(Boolean).join(' / ');
  return '- Клиент: ' + (client||'не указан') +
    '\n- Ниша: ' + (d.category||'не указана') +
    '\n- ГЕО: ' + (d.city||'не указан') +
    '\n- УТП/инфо: ' + (d.notes||'не указано') +
    '\n- Объявлений по КП: ' + (d.kp||'не указано') +
    '\n- Позиции: ' + ((d.positions && Array.isArray(d.positions) ? d.positions : []).join(', ')||'не указаны');
}

// ── PROMPTS ──
function buildAnalysisPrompt() {
  var d = currentData;
  var kp = d.kp || '100';
  var S = analysisSections && typeof analysisSections === 'object' ? analysisSections : {demand:true, audience:true, pains:true, behavior:true, keywords:true, geo:true, summary:true};
  
  var header = 'Ты опытный авитолог-аналитик. Создай предварительный анализ ниши.\n\n' +
    clientInfo() +
    '\n\nФОРМАТ HTML:\n' +
    'ШАПКА (text-align:center):\n' +
    '<div style="text-align:center">\n' +
    '<h1>🔎 Анализ Ниши + Целевой Аудитории + Спроса в городах</h1>\n' +
    '<h2>🔎 АНАЛИЗ НИШИ И РЫНКА</h2>\n' +
    '<h3>🏗 [описание ниши: что делает/продаёт клиент]</h3>\n' +
    '<p>[товары/услуги через •]</p>\n' +
    '<p>📍 ' + (d.city || '') + '</p>\n' +
    '</div>\n' +
    '\n\n';

  var rules = '\n\nПРАВИЛА:\n' +
    '- СТРУКТУРА ОБЯЗАТЕЛЬНА: каждый раздел — свой <h2>, подпункты — <h3>, текст — в <p> или <ul>/<li>. Никогда не выводи текст одной простынёй без заголовков.\n' +
    '- Эмоджи в каждом h2 и ключевых местах\n' +
    '- ❌ для болей, ✔ для важного, 🔥 для акцентов\n' +
    '- h3 для подсегментов внутри разделов\n' +
    '- НЕ используй <hr> — между разделами достаточно отступов h2\n' +
    '- Конкретика под нишу: ' + (d.category || '') + '\n' +
    '- Реальные поисковые запросы, примеры формулировок объявлений\n' +
    '- СТРОГО: генерируй ТОЛЬКО перечисленные ниже разделы. Если раздела нет в списке — НЕ выводи его вообще, даже заголовок.\n\n';

  var jsonFmt = 'Верни JSON без markdown:\n{"html":"<div style=\\"text-align:center\\">...</div>...","normalized":{"company":"...","category":"...","city":"...","usp":"..."}}';

  // Собираем только включённые разделы
  function buildSections(detail) {
    var secs = [];
    var n = 1;
    if (S.demand) {
      if (detail === 'light') secs.push('<h2>📊 ' + n + '. Картина спроса и сезонность</h2> — пик, спад, что ищут');
      else if (detail === 'max') secs.push('<h2>📊 ' + n + '. Картина спроса и сезонность</h2> — подробно по месяцам, что именно ищут в каждый период');
      else secs.push('<h2>📊 ' + n + '. Картина спроса и сезонность</h2> — пик/спад, что ищут по сезонам');
      n++;
    }
    if (S.audience) {
      if (detail === 'light') secs.push('<h2>👥 ' + n + '. Целевая аудитория</h2> — 3 сегмента коротко');
      else if (detail === 'max') secs.push('<h2>👥 ' + n + '. Целевая аудитория (сегментация)</h2> — 4+ сегмента, каждый через h3: возраст, ситуации, боли ❌, что важно ✔');
      else secs.push('<h2>👥 ' + n + '. Целевая аудитория</h2> — 3-4 сегмента через h3: кто, боли ❌, что важно ✔');
      n++;
    }
    if (S.pains) {
      if (detail === 'light') secs.push('<h2>🔥 ' + n + '. Основные боли клиентов</h2> — по продуктам');
      else if (detail === 'max') secs.push('<h2>🔥 ' + n + '. Основные боли по продуктам</h2> — по каждому продукту отдельно с ❌');
      else secs.push('<h2>🔥 ' + n + '. Основные боли по продуктам</h2> — ключевые боли с ❌');
      n++;
    }
    if (S.behavior) {
      if (detail === 'light') secs.push('<h2>🧭 ' + n + '. Поведение клиента на Avito</h2> — как выбирает');
      else if (detail === 'max') secs.push('<h2>🧭 ' + n + '. Поведение клиента на Avito</h2> — триггеры выбора 📸📐🛠💬, сколько сравнивает');
      else secs.push('<h2>🧭 ' + n + '. Поведение клиента на Avito</h2> — как выбирает, триггеры');
      n++;
    }
    // Ключи, Гео — теперь отключаемые
    if (S.keywords) {
      if (detail !== 'light') {
        secs.push('<h2>🔎 ' + n + '. Как ищут (семантика)</h2> — ' + (detail === 'max' ? 'группы запросов по категориям' : 'реальные запросы'));
      } else {
        secs.push('<h2>🔎 ' + n + '. Как ищут (семантика)</h2> — запросы по категориям');
      }
      n++;
    }
    if (S.geo) {
      if (detail !== 'light') {
        secs.push('<h2>📍 ' + n + '. География спроса</h2> — ' + (detail === 'max' ? 'основные и доп. города, районы, примеры формулировок' : 'города'));
      } else {
        secs.push('<h2>📍 ' + n + '. География спроса</h2> — города и районы');
      }
      n++;
    }
    if (detail === 'mid' || detail === 'max') {
      secs.push('<h2>💰 ' + n + '. Средний чек</h2> — ' + (detail === 'max' ? 'по каждой категории с диапазонами' : 'диапазоны по категориям'));
      n++;
      if (detail === 'max') {
        secs.push('<h2>🚀 ' + n + '. Стратегия объёма объявлений</h2>\n' +
          'Клиент планирует ' + kp + ' объявлений. Объясни:\n' +
          '- Почему это оптимальный объём для данной ниши и гео\n' +
          '- Как распределить по категориям и городам\n' +
          '- Какой охват и результат даст такой объём\n' +
          '- Минимальный порог входа и почему меньше не имеет смысла');
      } else {
        secs.push('<h2>🚀 ' + n + '. Обоснование объёма</h2>\n' +
          'Клиент планирует ' + kp + ' объявлений. Кратко обоснуй почему это хороший объём.');
      }
      n++;
    }
    if (S.summary) {
      secs.push('<h2>🎯 Итог' + (detail === 'max' ? ' по рынку' : '') + '</h2> — ' +
        (detail === 'light' ? '3-4 тезиса' : detail === 'max' ? 'что покупает клиент, 5 тезисов с 🔥' : '4 тезиса с 🔥'));
    }
    return secs.join('\n');
  }

  var detail = currentDepth;
  var wordRange = detail === 'light' ? '800-1200' : detail === 'max' ? '2000-3000' : '1200-1800';
  var label = detail === 'light' ? 'коротко, макс 5 страниц' : detail === 'max' ? 'развёрнуто, 2000+ слов' : 'средняя детализация, 1200-1800 слов';
  var extra = getExtraPrompt();
  var extraBlock = extra ? '\n\nДОПОЛНИТЕЛЬНЫЙ ЗАПРОС:\n' + extra + '\n' : '';

  return header +
    'РАЗДЕЛЫ (' + label + '):\n' +
    buildSections(detail) + '\n' +
    rules + 'Объём: ' + wordRange + ' слов.\n\n' + extraBlock + jsonFmt;
}

function buildPresalePrompt() {
  var d = currentData;
  var kp = d.kp || '100';
  var jsonFmt = 'Верни JSON без markdown:\n{"html":"<div style=\\"text-align:center\\"><h1>...</h1>...</div>...","normalized":{"company":"...","category":"...","city":"...","usp":"..."}}';
  
  var header = 'Ты опытный авитолог. Создай документ — почему СЕЙЧАС лучшее время запускаться на Авито.\n\n' +
    clientInfo() +
    '\n\nФОРМАТ HTML:\n' +
    'ШАПКА (text-align:center):\n' +
    '<div style="text-align:center">\n' +
    '<h1>⏰ Почему сейчас — лучшее время для запуска на Avito</h1>\n' +
    '<h3>' + (d.category || 'ниша') + ' • ' + (d.city || 'город') + '</h3>\n' +
    '</div>\n\n' +
    'ПРАВИЛА: СТРУКТУРА ОБЯЗАТЕЛЬНА — каждый раздел <h2>, подпункты <h3>, текст в <p>. Никогда не выводи одной простынёй. Эмоджи в h2, НЕ <hr>, используй ✔🔥📈💡⚡\n\n';
  var extra = getExtraPrompt();
  var extraBlock = extra ? '\nДОПОЛНИТЕЛЬНЫЙ ЗАПРОС:\n' + extra + '\n\n' : '';

  if (currentDepth === 'light') {
    return header +
      'РАЗДЕЛЫ (компактно, 600-900 слов):\n' +
      '<h2>📈 Рынок Avito растёт</h2> — цифры и тренды\n' +
      '<h2>⚡ Конкуренция ещё не максимальная</h2> — окно возможностей\n' +
      '<h2>🎯 Avito идеально для ' + (d.category || 'вашей ниши') + '</h2> — почему именно эта площадка\n' +
      '<h2>💰 ' + kp + ' объявлений — оптимальный старт</h2> — обоснование объёма\n' +
      '<h2>🔥 Итог</h2> — 3-4 тезиса почему стартовать сейчас\n\n' + extraBlock + jsonFmt;
  }

  return header +
    'РАЗДЕЛЫ (средне, 900-1400 слов):\n' +
    '<h2>📈 Рынок Avito: цифры и тренды</h2> — рост площадки, аудитория\n' +
    '<h2>⚡ Окно возможностей в нише</h2> — конкуренция, когда лучше зайти\n' +
    '<h2>🎯 Почему Avito идеально для ' + (d.category || 'ниши') + '</h2> — специфика площадки под нишу\n' +
    '<h2>👥 Ваша аудитория уже на Avito</h2> — кто ищет, как выбирает\n' +
    '<h2>📊 Сезонность: почему именно сейчас</h2> — привязка к текущему периоду\n' +
    '<h2>💰 ' + kp + ' объявлений — обоснование объёма</h2> — почему это оптимально, распределение\n' +
    '<h2>🔥 Итог — почему стартовать сейчас</h2> — 4-5 тезисов\n\n' + extraBlock + jsonFmt;
}

function buildAvito1Prompt() {
  var d = currentData;
  var jsonFmt = 'Верни JSON без markdown:\n{"html":"<div style=\\"text-align:center\\"><h1>...</h1>...</div>...","normalized":{"company":"...","category":"...","city":"...","usp":"..."}}';

  var header = 'Ты топовый авитолог и маркетолог. Напиши документ почему Avito — площадка №1.\n\n' +
    clientInfo() +
    '\n\nФОРМАТ HTML:\n' +
    'ШАПКА (text-align:center):\n' +
    '<div style="text-align:center">\n' +
    '<h1>🏆 Почему Avito — площадка №1 для ' + (d.category || 'вашей ниши') + '</h1>\n' +
    '<h3>📍 ' + (d.city || 'город') + '</h3>\n' +
    '</div>\n\n' +
    'ПРАВИЛА: СТРУКТУРА ОБЯЗАТЕЛЬНА — каждый раздел <h2>, подпункты <h3>, текст в <p>. Никогда не выводи одной простынёй. Эмоджи в h2, НЕ <hr>, используй ✔🔥💡📊⚡\n\n';
  var extra = getExtraPrompt();
  var extraBlock = extra ? '\nДОПОЛНИТЕЛЬНЫЙ ЗАПРОС:\n' + extra + '\n\n' : '';

  if (currentDepth === 'light') {
    return header +
      'РАЗДЕЛЫ (компактно, 600-900 слов):\n' +
      '<h2>🧠 Как думает ваш клиент</h2> — путь от потребности до Avito\n' +
      '<h2>⚔️ Avito vs другие каналы</h2> — сравнение с Яндекс, соцсети\n' +
      '<h2>💎 Сила Avito для ' + (d.category || 'ниши') + '</h2> — конкретные преимущества\n' +
      '<h2>🔥 Итог</h2> — 3-4 ключевых тезиса\n\n' + extraBlock + jsonFmt;
  }

  return header +
    'РАЗДЕЛЫ (средне, 900-1400 слов):\n' +
    '<h2>🧠 Как думает ваш клиент</h2> — путь от потребности до покупки через Avito\n' +
    '<h2>⚔️ Avito vs Яндекс vs Соцсети</h2> — честное сравнение каналов с ✔ и ❌\n' +
    '<h2>💎 Почему Avito особенно силён для ' + (d.category || 'ниши') + '</h2> — специфика\n' +
    '<h2>📍 География как инструмент продаж</h2> — ' + (d.city || 'город') + ' и окрестности\n' +
    '<h2>👥 Почему клиент выбирает через Avito</h2> — триггеры доверия\n' +
    '<h2>🔥 Итог — 5 причин почему Avito №1</h2>\n\n' + extraBlock + jsonFmt;
}

// ── RENDER ──
function renderDoc(html) {
  currentHtml = html;
  docReady = true;
  var content = currentTab === 'analysis' ? withImg(html) : currentTab === 'presale' ? insertHeaderImg(html, PRESALE_HEADER_IMG) : currentTab === 'avito1' ? insertHeaderImg(html, AVITO1_HEADER_IMG) : html;
  setContent(
    '<div class="doc-wrap">' +
      '<div class="doc-block" id="docBlock">' + content + '</div>' +
    '</div>'
  );
  if (!projectsMode && !goalsMode && !agencyMode) {
    showChat();
    var ac = _activeClient || getActiveClient();
    if (ac && ac.folderId) { var bb = document.getElementById('backBtn'); if (bb) bb.style.display = 'inline-flex'; }
  }
}

// Картинка в шапке документа аналитики (Google Drive)
var ANALYTICS_HEADER_IMG = 'https://drive.google.com/uc?export=view&id=1tiqcQF4dtAPmFvBExDgdgFElfwxiazww';
var ANALYTICS_HEADER_IMG_THUMB = 'https://drive.google.com/thumbnail?id=1tiqcQF4dtAPmFvBExDgdgFElfwxiazww&sz=w1000';
var ANALYTICS_HEADER_IMG_SASHA = 'https://drive.google.com/uc?export=view&id=124TzG8HSARZj4xD4tlN8UwmHVi-GqGOC';
var ANALYTICS_HEADER_IMG_SASHA_THUMB = 'https://drive.google.com/thumbnail?id=124TzG8HSARZj4xD4tlN8UwmHVi-GqGOC&sz=w1000';
var ANALYTICS_HEADER_IMG_REGINA = 'https://drive.google.com/uc?export=view&id=15E2TiMv9LS-LNqlk5bBG1l0OMnZmCIIa';
var ANALYTICS_HEADER_IMG_REGINA_THUMB = 'https://drive.google.com/thumbnail?id=15E2TiMv9LS-LNqlk5bBG1l0OMnZmCIIa&sz=w1000';
// Картинка для документа «НУЖНО СЕЙЧАС» — одна для Фил, Саша, Регина
var PRESALE_HEADER_IMG = 'assets/presale_header.png';
// Картинка для документа «AVITO №1»
var AVITO1_HEADER_IMG = 'assets/avito1_header.png';
// URL для экспорта в Drive/Docs (относительный путь не работает в Google Docs). Оставьте пустым — тогда используется абсолютный URL от текущего хоста (GitHub Pages). Или укажите ссылку Drive: 'https://drive.google.com/uc?export=view&id=XXX'
var PRESALE_HEADER_IMG_DRIVE = '';
var AVITO1_HEADER_IMG_DRIVE = '';
// Резерв для экспорта в Drive. У каждого документа своя картинка — не из аналитики.
function getPresaleHeaderImgForExport() {
  if (PRESALE_HEADER_IMG_DRIVE) return PRESALE_HEADER_IMG_DRIVE;
  try { return new URL('assets/presale_header.png', (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : 'https://example.com/').href; } catch(e) { return 'assets/presale_header.png'; }
}
function getAvito1HeaderImgForExport() {
  if (AVITO1_HEADER_IMG_DRIVE) return AVITO1_HEADER_IMG_DRIVE;
  try { return new URL('assets/avito1_header.png', (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : 'https://example.com/').href; } catch(e) { return 'assets/avito1_header.png'; }
}

function getAnalyticsHeaderImg() {
  if (analyticsMode === 'sasha') return ANALYTICS_HEADER_IMG_SASHA;
  if (analyticsMode === 'regina') return ANALYTICS_HEADER_IMG_REGINA;
  return ANALYTICS_HEADER_IMG;
}
function getAnalyticsHeaderImgThumb() {
  if (analyticsMode === 'sasha') return ANALYTICS_HEADER_IMG_SASHA_THUMB;
  if (analyticsMode === 'regina') return ANALYTICS_HEADER_IMG_REGINA_THUMB;
  return ANALYTICS_HEADER_IMG_THUMB;
}

function insertHeaderImg(html, imgSrc) {
  if (!html || typeof html !== 'string' || !imgSrc) return html;
  var img = '<div class="doc-header-img" style="text-align:center;margin:0 0 20px"><img src="' + imgSrc + '" alt="" style="max-width:100%;width:600px;height:auto;border-radius:9px;display:block;margin:0 auto"></div>';
  var h1End = html.indexOf('</h1>');
  if (h1End === -1) h1End = html.indexOf('</H1>');
  if (h1End >= 0) return html.slice(0, h1End + 5) + img + html.slice(h1End + 5);
  var centerIdx = html.indexOf('text-align:center');
  var divEnd = -1;
  if (centerIdx >= 0 && centerIdx < 800) divEnd = html.indexOf('</div>', centerIdx);
  if (divEnd === -1) divEnd = html.indexOf('</div>');
  if (divEnd >= 0 && divEnd < 2000) return html.slice(0, divEnd + 6) + img + html.slice(divEnd + 6);
  return img + html;
}
function withImg(html) {
  if (!html || typeof html !== 'string') return html;
  var thumb = getAnalyticsHeaderImgThumb();
  var img = '<div class="doc-header-img" style="text-align:center;margin:0 0 20px"><img src="' + thumb + '" alt="" style="max-width:100%;width:600px;height:auto;border-radius:9px;display:block;margin:0 auto"></div>';
  var h1End = html.indexOf('</h1>');
  if (h1End === -1) h1End = html.indexOf('</H1>');
  if (h1End >= 0) {
    return html.slice(0, h1End + 5) + img + html.slice(h1End + 5);
  }
  var centerIdx = html.indexOf('text-align:center');
  var divEnd = -1;
  if (centerIdx >= 0 && centerIdx < 800) {
    divEnd = html.indexOf('</div>', centerIdx);
  }
  if (divEnd === -1) divEnd = html.indexOf('</div>');
  if (divEnd >= 0 && divEnd < 2000) {
    return html.slice(0, divEnd + 6) + img + html.slice(divEnd + 6);
  }
  return img + html;
}

// Версия с URL картинкой для экспорта в Drive / Word (полная ширина в Документах)
function withImgUrl(html) {
  if (!html || typeof html !== 'string') return html;
  var src = getAnalyticsHeaderImg();
  var imgBlock = '<div style="width:100%;margin:0 0 24px;clear:both"><img src="' + src + '" alt="" style="width:17.22cm;height:11.55cm;max-width:100%;height:auto;display:block;margin:0 auto 30px;border-radius:8px"></div>';
  var h1End = html.indexOf('</h1>');
  if (h1End === -1) h1End = html.indexOf('</H1>');
  if (h1End >= 0) {
    return html.slice(0, h1End + 5) + imgBlock + html.slice(h1End + 5);
  }
  var centerIdx = html.indexOf('text-align:center');
  var divEnd = -1;
  if (centerIdx >= 0 && centerIdx < 800) divEnd = html.indexOf('</div>', centerIdx);
  if (divEnd === -1) divEnd = html.indexOf('</div>');
  if (divEnd >= 0 && divEnd < 2000) {
    return html.slice(0, divEnd + 6) + imgBlock + html.slice(divEnd + 6);
  }
  return imgBlock + html;
}

// ── CHAT ──
function showChat() { document.getElementById('chatFloat').style.display = 'block'; }
function hideChat() { document.getElementById('chatFloat').style.display = 'none'; document.getElementById('refreshBtn').style.display = 'none'; var bb=document.getElementById('backBtn'); if(bb)bb.style.display='none'; docReady = false; }

function sendChat() {
  var inp = document.getElementById('chatInp');
  var btn = document.getElementById('btnSend');
  var comment = inp.value.trim();
  if (!comment || !currentHtml) return;
  inp.disabled = true;
  btn.disabled = true;
  btn.textContent = '...';

  var prompt = 'HTML документа:\n' + currentHtml + '\n\nПравка: "' + comment + '"\n\nСохрани структуру: h2 для разделов, h3 для подпунктов, p для абзацев. Не сливай текст в одну простыню. Верни JSON: {"html":"..."}';
  callAPI(prompt, 2000).then(function(raw) {
    var json = JSON.parse(fixJSON(raw.replace(/```json|```/g,'').trim()));
    if (json.html) { 
      currentHtml = json.html; 
      renderDoc(json.html);
      // Показываем кнопку обновления если есть Doc в Drive
      if (lastDocId && _driveToken) {
        document.getElementById('refreshBtn').style.display = 'inline-flex';
        var bb = document.getElementById('backBtn'); if (bb) bb.style.display = 'inline-flex';
      }
    }
  }).catch(function(e) {
    alert('Ошибка: ' + e.message);
  }).finally(function() {
    inp.value = '';
    inp.disabled = false;
    btn.disabled = false;
    btn.textContent = 'Применить';
  });
}

// ── COPY ──
function copyDoc() {
  var btn = document.querySelector('.btn-copy');
  var tmp = document.createElement('div');
  tmp.contentEditable = 'true';
  tmp.style.cssText = 'position:fixed;left:-9999px;top:0;width:700px;background:#fff;color:#000;font-family:Arial,sans-serif;font-size:11pt';
  tmp.innerHTML = currentTab === 'analysis' ? withImg(currentHtml) : currentTab === 'presale' ? insertHeaderImg(currentHtml, PRESALE_HEADER_IMG) : currentTab === 'avito1' ? insertHeaderImg(currentHtml, AVITO1_HEADER_IMG) : currentHtml;
  document.body.appendChild(tmp);
  tmp.focus();
  var r = document.createRange();
  r.selectNodeContents(tmp);
  var s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  var ok = document.execCommand('copy');
  s.removeAllRanges();
  document.body.removeChild(tmp);
  if (ok && btn) {
    var o = btn.innerHTML;
    btn.textContent = 'Скопировано!';
    btn.style.background = '#fff';
    btn.style.color = '#00a060';
    setTimeout(function() { btn.innerHTML = o; btn.style.background = ''; btn.style.color = ''; }, 2000);
  }
}

// ── DOWNLOAD ──
function buildWordHtml(body) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.8;color:#222;max-width:700px;margin:40px auto;padding:0 20px}' +
    'h1{font-size:22pt;font-weight:bold;margin:0 0 6pt;color:#1a1a2e}' +
    'h2{font-size:16pt;font-weight:bold;margin:28pt 0 10pt;padding-top:14pt;border-top:1px solid #ccc;color:#1a1a2e}' +
    'h3{font-size:13pt;font-weight:bold;margin:18pt 0 6pt;color:#333}' +
    'p{margin:0 0 8pt}' +
    'ul{margin:6pt 0 12pt;padding-left:20pt}li{margin:4pt 0}' +
    'strong{color:#111}' +
    'img{width:17.22cm;height:auto;max-width:100%;display:block;margin:20px auto 30px;border-radius:8px}' +
    '.doc-header-img img,.doc-header-img{width:100%;max-width:100%;box-sizing:border-box}' +
    '.doc-header-img img{width:17.22cm;max-width:100%;height:auto}' +
    '</style></head><body>' + body + '</body></html>';
}

function dlDoc() {
  var name = (currentData && currentData.company ? currentData.company : 'avitolog').replace(/\s+/g,'_');
  var a = document.createElement('a');
  var docBody = currentTab === 'analysis' ? withImg(currentHtml) : currentTab === 'presale' ? insertHeaderImg(currentHtml, PRESALE_HEADER_IMG) : currentTab === 'avito1' ? insertHeaderImg(currentHtml, AVITO1_HEADER_IMG) : currentHtml;
  a.href = URL.createObjectURL(new Blob([buildWordHtml(docBody)], {type:'application/msword'}));
  a.download = name + '_analysis.doc';
  a.click();
}

// ── CRM ──
// ═══════════════════════════════════════════
// GOOGLE DRIVE — OAuth (client_id задан в начале скрипта)
// ═══════════════════════════════════════════
var SA_EMAIL = "avitolog-crm@avito-489218.iam.gserviceaccount.com";
var OAUTH_CLIENT_ID = window.AVITOLOG_GOOGLE_CLIENT_ID || '98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com';
var OAUTH_REDIRECT_URI = window.AVITOLOG_GOOGLE_REDIRECT || 'https://hair1guru1school-cyber.github.io/AVITOLOG/index.html';
var OAUTH_SCOPE = window.AVITOLOG_GOOGLE_SCOPE || 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
var _driveToken = null;
var _driveUserEmail = null;
var SASHA_EMAIL = 'cyplakovaleksandr153@gmail.com';
var DRIVE_AUTH_KEY = 'avitolog_drive_auth_v1';

function getStoredDriveAuth() {
  try { return JSON.parse(localStorage.getItem(DRIVE_AUTH_KEY) || 'null'); } catch(e) { return null; }
}
function clearStoredDriveAuth() {
  try { localStorage.removeItem(DRIVE_AUTH_KEY); } catch(e) {}
}
function restoreDriveTokenFromStorage() {
  var s = getStoredDriveAuth();
  if (!s || !s.token) return false;
  if (s.exp && Date.now() >= Number(s.exp)) {
    clearStoredDriveAuth();
    return false;
  }
  _driveToken = s.token;
  return true;
}
function persistDriveToken(token, expiresInSec) {
  if (!token) return;
  var exp = Date.now() + (Math.max(60, Number(expiresInSec) || 3600) - 60) * 1000;
  try { localStorage.setItem(DRIVE_AUTH_KEY, JSON.stringify({token: token, exp: exp})); } catch(e) {}
}
function setDriveConnectedUiState() {
  updateDriveUI();
  var btn = document.getElementById('authBtn');
  if (btn) { btn.textContent = '✓ Drive'; btn.style.borderColor = '#00d97e'; btn.style.color = '#00d97e'; }
  if (typeof restoreApiKey === 'function') restoreApiKey();
  var st = document.getElementById('crmSt');
  if (st) { st.className = 'crm-st'; st.textContent = ''; }
  // При появлении приложения — открыть ПРОЕКТЫ, если это стартовая вкладка
  if (projectsMode && typeof renderProjectsScreen === 'function') {
    renderProjectsScreen();
  } else if (!goalsMode && !agencyMode && typeof openProjectsTab === 'function') {
    openProjectsTab();
  }
}
function applyOAuthHash(hash) {
  if (!hash || hash.indexOf('access_token=') < 0) return false;
  var m = hash.match(/access_token=([^&]+)/);
  if (!m) return false;
  _driveToken = m[1];
  var ex = hash.match(/expires_in=([^&]+)/);
  persistDriveToken(_driveToken, ex ? parseInt(ex[1], 10) : 3600);
  return true;
}
function buildAuthUrl() {
  var cid = OAUTH_CLIENT_ID || '98192715547-1a7jrfa6a53e1u7k5lojss8ji12q4432.apps.googleusercontent.com';
  var redirect = OAUTH_REDIRECT_URI;
  var scope = OAUTH_SCOPE || 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
  var state = 'av' + Math.random().toString(36).slice(2);
  return 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(cid)
    + '&redirect_uri=' + encodeURIComponent(redirect)
    + '&response_type=token'
    + '&scope=' + encodeURIComponent(scope)
    + '&state=' + encodeURIComponent(state);
}

// При загрузке — ловим токен из hash (редирект от Google)
(function() {
  restoreDriveTokenFromStorage();
  var hash = window.location.hash;
  if (applyOAuthHash(hash)) {
    history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
  }
  function showApp() {
    if (_driveToken) setDriveConnectedUiState();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showApp);
  } else {
    showApp();
  }
})();
window.addEventListener('storage', function(ev) {
  if (!ev || ev.key !== DRIVE_AUTH_KEY) return;
  if (restoreDriveTokenFromStorage()) { setDriveConnectedUiState(); } else { updateDriveUI(); }
});

function updateDriveUI() {
  // Если токен протух — сбрасываем, чтобы не было "ложного подключено".
  if (!_driveToken) restoreDriveTokenFromStorage();
  if (_driveToken) {
    var s = getStoredDriveAuth();
    if (s && s.exp && Date.now() >= Number(s.exp)) {
      _driveToken = null;
      clearStoredDriveAuth();
    }
  }
  var splash = document.getElementById('driveSplash');
  var mainApp = document.getElementById('mainApp');
  if (_driveToken) {
    if (splash) splash.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
  } else {
    if (splash) splash.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
  }
}

function startAuth() {
  if (!_driveToken) restoreDriveTokenFromStorage();
  if (_driveToken) { setDriveConnectedUiState(); return; }
  var onGitHub = window.location.origin === 'https://hair1guru1school-cyber.github.io';
  if (onGitHub && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    startAuthGIS();
  } else {
    startAuthRedirect();
  }
}
function startAuthRedirect() {
  var u = buildAuthUrl();
  if (window.location.origin !== 'https://hair1guru1school-cyber.github.io') {
    if (!confirm('Для входа приложение откроется на GitHub. После входа вы останетесь там.\n\nПродолжить?')) return;
  }
  window.location.href = u;
}
var _tokenClient = null;
var _authPromptForce = false;
function startAuthGIS() {
  if (!_driveToken) restoreDriveTokenFromStorage();
  if (_driveToken) { setDriveConnectedUiState(); return; }
  var cid = OAUTH_CLIENT_ID;
  var scp = OAUTH_SCOPE;
  // Пользователь нажал кнопку — сразу показываем выбор аккаунта. 'none' даёт interaction_required.
  var promptMode = _authPromptForce ? 'select_account' : 'select_account';
  function run() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      try {
        if (!_tokenClient) {
          _tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cid,
            scope: scp,
            callback: function(r) {
              if (r && r.access_token) {
                _driveToken = r.access_token;
                persistDriveToken(_driveToken, r.expires_in ? parseInt(r.expires_in, 10) : 3600);
                setDriveConnectedUiState();
              } else { alert('Ошибка: ' + (r && r.error ? r.error : 'нет токена')); }
            },
            error_callback: function(e) {
              if (e && e.type === 'popup_closed') return;
              _authPromptForce = true;
              if (promptMode === 'none') {
                var btn = document.querySelector('#driveSplash .splash-btn');
                if (btn) { btn.textContent = '🔑 Нажми для входа'; btn.onclick = function(){ _authPromptForce = true; startAuth(); }; }
              } else {
                alert('Ошибка GIS: ' + (e.message || e.type));
              }
            }
          });
        }
        _tokenClient.requestAccessToken({ prompt: promptMode });
      } catch (err) { alert('GIS ошибка: ' + err.message); }
    } else {
      alert('Google Sign-In не загрузился. Подожди пару секунд и нажми снова.');
    }
  }
  if (typeof google !== 'undefined') run(); else setTimeout(run, 1200);
}
function testAuthUrl() { window.open(buildAuthUrl(), '_blank', 'noopener'); }
function copyAuthUrl() {
  var url = buildAuthUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() { alert('URL скопирован. Вставь в инкогнито или другой браузер.'); }).catch(function() { prompt('Скопируй URL:', url); });
  } else { prompt('Скопируй URL (Ctrl+C):', url); }
}
function showRedirectDiagnostic() {
  var base = 'https://hair1guru1school-cyber.github.io/AVITOLOG';
  var msg = 'Текущий redirect_uri: ' + OAUTH_REDIRECT_URI + '\n\n' +
    'Для входа в Google этот URL должен быть в Google Cloud Console:\n' +
    'APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs\n\n' +
    'Добавь нужные URI (по одному на строку):\n' +
    '• ' + OAUTH_REDIRECT_URI + '\n' +
    (OAUTH_REDIRECT_URI.indexOf(base) < 0 ? '• ' + base + '\n• ' + base + '/index.html\n' : '');
  alert(msg);
}

function getDriveToken() {
  if (!_driveToken) restoreDriveTokenFromStorage();
  if (_driveToken) return Promise.resolve(_driveToken);
  return Promise.reject(new Error('Нажмите 🔑 Drive'));
}

async function driveCreateClientFolder(name, parentId) {
  // Создаём папку клиента внутри уже существующей папки категории
  var token = await getDriveToken();
  // Проверяем нет ли уже такой папки
  var q = "name='" + name.replace(/'/g,"\'") + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  var sr = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  var sd = await sr.json();
  if (!sr.ok && (sr.status === 401 || (sd.error && sd.error.code === 401))) {
    _driveToken = null;
    clearStoredDriveAuth();
    updateDriveUI();
    throw new Error('Сессия истекла. Нажмите 🔑 Drive для повторного входа, затем сохраните снова.');
  }
  if (sd.files && sd.files.length > 0) return sd.files[0].id;
  // Создаём новую папку клиента
  var cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify({name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId]})
  });
  var cd = await cr.json();
  if (!cd.id) {
    if (cr.status === 401 || (cd.error && cd.error.code === 401)) {
      _driveToken = null;
      clearStoredDriveAuth();
      updateDriveUI();
      throw new Error('Сессия истекла. Нажмите 🔑 Drive для повторного входа, затем сохраните снова.');
    }
    var errMsg = (cd.error && cd.error.message) ? cd.error.message : JSON.stringify(cd);
    throw new Error('Не удалось создать папку: ' + errMsg);
  }
  return cd.id;
}

async function driveGetFolderParent(folderId) {
  if (!folderId || !_driveToken) return null;
  try {
    var resp = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folderId) + '?fields=parents', {
      headers: {'Authorization': 'Bearer ' + _driveToken}
    });
    if (!resp.ok) return null;
    var data = await resp.json().catch(function(){ return {}; });
    var parents = data.parents;
    return (parents && parents[0]) ? parents[0] : null;
  } catch(e) { return null; }
}

function setCrmCategorySelectValue(catId) {
  if (!catId) return;
  var sel = document.getElementById('crmCategorySelect');
  if (!sel) return;
  for (var i = 0; i < sel.options.length; i++) {
    if (String(sel.options[i].value || '') === String(catId)) {
      sel.selectedIndex = i;
      return;
    }
  }
}
var _backfillCategoryQueue = [];
function backfillProjectCategoryFromDrive(projects) {
  if (!_driveToken || !projects || !projects.length) return;
  var need = (projects || []).filter(function(p){ return (p.folderId || p.folderLink) && !p.categoryFolderId; });
  if (!need.length) return;
  var one = need[0];
  if (_backfillCategoryQueue.indexOf(one.id) >= 0) return;
  _backfillCategoryQueue.push(one.id);
  var fid = one.folderId || '';
  if (!fid && one.folderLink) { var m = String(one.folderLink).match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) fid = m[1]; }
  if (!fid) { _backfillCategoryQueue = _backfillCategoryQueue.filter(function(x){ return x !== one.id; }); return; }
  driveGetFolderParent(fid).then(function(parentId) {
    _backfillCategoryQueue = _backfillCategoryQueue.filter(function(x){ return x !== one.id; });
    if (!parentId) return;
    var pd = loadProjectsData();
    var sp = pd.projects.find(function(x){ return x.id === one.id; });
    if (sp && !sp.categoryFolderId) { sp.categoryFolderId = parentId; saveProjectsData(pd); rerenderProjectsPreserveScroll(); }
  }).catch(function(){ _backfillCategoryQueue = _backfillCategoryQueue.filter(function(x){ return x !== one.id; }); });
}
function setCrmCategoryByFolderId(folderId, onParent) {
  if (!folderId) return;
  driveGetFolderParent(folderId).then(function(parentId) {
    if (parentId) {
      setCrmCategorySelectValue(parentId);
      if (typeof onParent === 'function') onParent(parentId);
    }
  }).catch(function(){});
}
var CRM_CATEGORY_OPTIONS = [
  {v:'1-nKHmmLp-vY81EK3APxQSg7v8GSO5TJy',n:'🙇 БАЗА без оплаты'},
  {v:'12QkZZOOmrTqtVEgS89H45eeAJzm5tiI2',n:'🪚 ТОВАРЫ СТРОИТЕЛЬСТВО'},
  {v:'174UazB2ErOG0wD9KplArQWO0JxfhDhfc',n:'👷 УСЛУГИ | СТРОИТЕЛИ'},
  {v:'1j3bqO2-9O9OeENLS7uDxVCu4imgsF1tb',n:'⚙️ ОБОРУДОВАНИЕ'},
  {v:'1ODPfNieEXqs9HmL96udmw-qLwiXL3EAS',n:'🛋 ТОВАРЫ - мебель'},
  {v:'12ajIWwl0fLs4jWB8NATNdvr6F2SmEeUU',n:'🏠 ДОМА | БЫТОВКИ | БАНИ'},
  {v:'1RwiDeVxf3HiCySEMC1fI_5hMDm-5Er9T',n:'🚙 Запчасти АВТО | ТОВАРЫ'},
  {v:'1rh2Fq8wGsGVDCediTr9zN4tnzvth1CWK',n:'🛻 АВТО и МОТО'},
  {v:'1tevmc_P3MxW4xFLhcuAUMtp7PKNQ8678',n:'🏎 ТОВАРЫ Авто аксессуары'},
  {v:'1p8-ETlYZ4X88X87sMuqNSMF_f4w-td_C',n:'👕 ОДЕЖДА / Кроссовки'},
  {v:'1aA1wATzVmPRavUrAh8oGsuEa6-xeIOdP',n:'🏭 ГОТОВЫЙ БИЗНЕС'},
  {v:'1ci9RhkZPtvyuBSK4jOh7x02ooBqmpGxw',n:'👤 УСЛУГИ - Юр, Репетиторы, IT'},
  {v:'1UgnWOC7tBupL_FSYV0T9RU4Lg6GOEqNa',n:'✈️ ЛОГИСТИКА услуги'},
  {v:'1Os8bLpRKDAeLlaUi_P5HFyE3zEL8AebL',n:'👤 ВАКАНСИИ'}
];
function getCategoryNameById(catId) {
  if (!catId) return '';
  var opt = CRM_CATEGORY_OPTIONS.find(function(o){ return String(o.v||'')===String(catId); });
  if (opt) return (opt.n||'').trim();
  var sel = document.getElementById('crmCategorySelect');
  if (!sel) return '';
  for (var i = 0; i < sel.options.length; i++) {
    if (String(sel.options[i].value || '') === String(catId)) return (sel.options[i].text || '').trim();
  }
  return '';
}

async function driveGetOrCreateFolder(name, parentId) {
  var token = await getDriveToken();
  var q = "name='" + name.replace(/'/g,"\\'") + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  var sr = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  var sd = await sr.json();
  if (sd.files && sd.files.length > 0) return sd.files[0].id;
  var cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify({name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId]})
  });
  var cd = await cr.json();
  return cd.id;
}

function extractHtmlBody(html) {
  if (!html || typeof html !== 'string') return html;
  var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();
  var bodyMatch2 = html.match(/<body[^>]*>([\s\S]*)$/i);
  if (bodyMatch2) return bodyMatch2[1].trim();
  return html;
}

async function driveGetFileContent(fileId, mimeType) {
  if (!fileId) return null;
  var token = await getDriveToken();
  if (!token) return null;
  var lastErr = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      if (mimeType === 'application/vnd.google-apps.document') {
        var resp = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/export?mimeType=text/html', {
          headers: {'Authorization': 'Bearer ' + token}
        });
        if (!resp.ok) {
          if (resp.status === 401) { _driveToken = null; clearStoredDriveAuth(); updateDriveUI(); return null; }
          lastErr = 'HTTP ' + resp.status;
          if (attempt < 2) { await new Promise(function(r){ setTimeout(r, 800 + attempt * 400); }); continue; }
          console.warn('Drive export error:', resp.status, await resp.text());
          return null;
        }
        var raw = await resp.text();
        return extractHtmlBody(raw) || raw;
      }
      var r2 = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
        headers: {'Authorization': 'Bearer ' + token}
      });
      if (!r2.ok) {
        if (r2.status === 401) { _driveToken = null; clearStoredDriveAuth(); updateDriveUI(); return null; }
        lastErr = 'HTTP ' + r2.status;
        if (attempt < 2) { await new Promise(function(r){ setTimeout(r, 800 + attempt * 400); }); continue; }
        return null;
      }
      return await r2.text();
    } catch(e) {
      lastErr = e;
      if (attempt < 2) await new Promise(function(r){ setTimeout(r, 800 + attempt * 400); });
      else { console.warn('driveGetFileContent:', e); return null; }
    }
  }
  return null;
}

async function openClientDocInWindow(docId, docKey, driveLink, mimeType) {
  var mc = document.getElementById('mainContent');
  if (!mc) return;
  mc.innerHTML = '<div class="empty-st"><div class="spinner" style="margin:0 auto"></div><p style="font-size:13px">Загружаю документ...</p></div>';
  lastDocId = docId;
  var mt = mimeType || 'application/vnd.google-apps.document';
  var html = await driveGetFileContent(docId, mt);
  if (!html) {
    var docLink = driveLink || 'https://docs.google.com/document/d/' + docId + '/edit';
    mc.innerHTML = '<div class="empty-st doc-fallback-wrap" style="align-items:stretch;justify-content:flex-start"><p style="font-size:14px;margin-bottom:4px">Не удалось загрузить документ</p><p style="font-size:12px;opacity:.6;margin-bottom:12px">Просмотр встроен ниже или открой по ссылке</p><div class="doc-iframe-wrap"><iframe src="https://docs.google.com/document/d/' + docId + '/preview" class="doc-preview-iframe" allowfullscreen></iframe></div><a href="' + docLink + '" target="_blank" style="color:var(--accent);margin-top:12px;display:inline-block;font-size:13px;font-weight:600">Открыть в Drive →</a></div>';
    if (docKey) { currentTab = docKey; ['analysis','presale','avito1'].forEach(function(t){ var e=document.getElementById('tab-'+t); if(e)e.classList.toggle('active',t===docKey); }); }
    var bb = document.getElementById('backBtn');
    if (bb) bb.style.display = 'inline-flex';
    return;
  }
  if (docKey) {
    currentTab = docKey;
    ['analysis','presale','avito1'].forEach(function(t) {
      var el = document.getElementById('tab-'+t);
      if (el) el.classList.toggle('active', t===docKey);
    });
    var bar = document.getElementById('depthBar');
    if (bar) bar.style.display = 'flex';
    var btns = bar ? bar.querySelectorAll('.depth-btn') : [];
    if (btns[2]) btns[2].style.display = docKey === 'analysis' ? '' : 'none';
    var secBar = document.getElementById('secBar');
    if (secBar) secBar.style.display = docKey === 'analysis' ? 'flex' : 'none';
    var tumbler = document.getElementById('analyticsTumbler');
    if (tumbler) tumbler.classList.toggle('hide', docKey !== 'analysis');
  }
  currentHtml = html;
  docReady = true;
  renderDoc(html);
  var rb = document.getElementById('refreshBtn');
  if (rb) rb.style.display = 'inline-flex';
  var bb = document.getElementById('backBtn');
  if (bb) bb.style.display = 'inline-flex';
}

async function driveListFolderItems(folderId) {
  if (!folderId) return [];
  var token = await getDriveToken();
  if (!token) throw new Error('Нажмите 🔑 Drive');
  var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var abortMs = 12000;
  var tmr = ctrl ? setTimeout(function() { ctrl.abort(); }, abortMs) : null;
  var opts = { headers: {'Authorization': 'Bearer ' + token} };
  if (ctrl) opts.signal = ctrl.signal;
  try {
    var resp = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,mimeType,webViewLink)&orderBy=folder,name&pageSize=100', opts);
    if (tmr) clearTimeout(tmr);
    var data = await resp.json();
    if (!resp.ok || data.error) {
      if (resp.status === 401) { _driveToken = null; clearStoredDriveAuth(); updateDriveUI(); }
      var errMsg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + resp.status);
      throw new Error(errMsg);
    }
    var items = (data.files || []).map(function(f) {
      var isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      var link = isFolder ? ('https://drive.google.com/drive/folders/' + f.id) : (f.webViewLink || (f.mimeType === 'application/vnd.google-apps.document' && f.id ? 'https://docs.google.com/document/d/' + f.id + '/edit' : f.id ? 'https://drive.google.com/file/d/' + f.id + '/view' : null));
      return { id: f.id, name: f.name || 'Без имени', mimeType: f.mimeType, isFolder: isFolder, link: link };
    });
    return items;
  } catch (e) {
    if (tmr) clearTimeout(tmr);
    console.warn('driveListFolderItems:', e);
    if (e && e.name === 'AbortError') throw new Error('Таймаут загрузки. Проверь интернет и попробуй снова.');
    throw e;
  }
}

async function driveListClientFolderFiles(folderId) {
  if (!folderId) return [];
  var token = await getDriveToken();
  if (!token) throw new Error('Нажмите 🔑 Drive');
  var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var abortMs = 12000;
  var tmr = ctrl ? setTimeout(function() { ctrl.abort(); }, abortMs) : null;
  var opts = { headers: {'Authorization': 'Bearer ' + token} };
  if (ctrl) opts.signal = ctrl.signal;
  try {
    var resp = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,mimeType,webViewLink)&orderBy=modifiedTime desc&pageSize=50', opts);
    if (tmr) clearTimeout(tmr);
    var data = await resp.json();
    if (!resp.ok || data.error) {
      if (resp.status === 401) { _driveToken = null; clearStoredDriveAuth(); updateDriveUI(); }
      var errMsg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + resp.status);
      throw new Error(errMsg);
    }
    var files = (data.files || []).filter(function(f) {
      return f.mimeType === 'application/vnd.google-apps.document' || (f.name || '').endsWith('.html');
    });
    return files;
  } catch (e) {
    if (tmr) clearTimeout(tmr);
    console.warn('driveListClientFolderFiles:', e);
    if (e && e.name === 'AbortError') throw new Error('Таймаут загрузки. Проверь интернет и попробуй снова.');
    throw e;
  }
}

async function driveCreateGoogleDoc(name, htmlContent, parentId) {
  var token = await getDriveToken();
  var enc = new TextEncoder();
  var boundary = 'avitolog_' + Date.now();
  var nl = '\r\n';
  var meta = JSON.stringify({
    name: name,
    mimeType: 'application/vnd.google-apps.document',
    parents: [parentId]
  });
  // Строим multipart тело
  var part1 = '--' + boundary + nl +
    'Content-Type: application/json; charset=UTF-8' + nl + nl +
    meta + nl;
  var part2 = '--' + boundary + nl +
    'Content-Type: text/html; charset=UTF-8' + nl + nl;
  var part3 = nl + '--' + boundary + '--';
  var b1 = enc.encode(part1);
  var b2 = enc.encode(part2);
  var b3 = enc.encode(htmlContent);
  var b4 = enc.encode(part3);
  var total = new Uint8Array(b1.length + b2.length + b3.length + b4.length);
  total.set(b1, 0);
  total.set(b2, b1.length);
  total.set(b3, b1.length + b2.length);
  total.set(b4, b1.length + b2.length + b3.length);
  var resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body: total
    }
  );
  var result = await resp.json();
  console.log('Drive API response:', resp.status, result);
  if (!result.id) throw new Error('Google Doc не создан: ' + JSON.stringify(result));
  return result;
}

async function generatePDF(htmlContent, name) {
  // Создаём временный контейнер
  var container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#000;font-family:Arial,sans-serif;padding:40px;box-sizing:border-box;';
  container.innerHTML = htmlContent;
  document.body.appendChild(container);
  var opt = {
    margin: [10, 10, 10, 10],
    filename: 'Анализ — ' + name + '.pdf',
    image: {type: 'jpeg', quality: 0.92},
    html2canvas: {scale: 1.5, useCORS: true, allowTaint: true},
    jsPDF: {unit: 'mm', format: 'a4', orientation: 'portrait'},
    pagebreak: {mode: ['avoid-all']}
  };
  var blob = await html2pdf().set(opt).from(container).outputPdf('blob');
  document.body.removeChild(container);
  return blob;
}

async function driveUploadBlob(name, blob, mimeType, parentId) {
  var token = await getDriveToken();
  var boundary = 'avitolog_' + Date.now();
  var nl = '\r\n';
  var meta = JSON.stringify({name: name, parents: [parentId]});
  var enc = new TextEncoder();
  var pre = '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl + meta + nl +
    '--' + boundary + nl + 'Content-Type: ' + mimeType + nl + nl;
  var post = nl + '--' + boundary + '--';
  var preB = enc.encode(pre);
  var postB = enc.encode(post);
  var blobArr = await blob.arrayBuffer();
  var blobB = new Uint8Array(blobArr);
  var body = new Uint8Array(preB.length + blobB.length + postB.length);
  body.set(preB, 0); body.set(blobB, preB.length); body.set(postB, preB.length + blobB.length);
  var resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,thumbnailLink,webViewLink', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary},
    body: body
  });
  var result = await resp.json();
  if (!result.id) throw new Error('PDF не загружен: ' + JSON.stringify(result));
  return result;
}
async function driveUploadAvatarToClientFolder(file, parentFolderId) {
  var ext = (file.name || '').split('.').pop() || 'jpg';
  var name = 'avatar.' + (ext.toLowerCase() === 'png' || ext.toLowerCase() === 'jpeg' || ext.toLowerCase() === 'jpg' ? ext.toLowerCase() : 'jpg');
  var mime = file.type || 'image/jpeg';
  var result = await driveUploadBlob(name, file, mime, parentFolderId);
  var url = result.thumbnailLink || (result.id ? 'https://drive.google.com/uc?export=view&id=' + result.id : null);
  return url || (result.webViewLink || '');
}

async function driveUploadText(name, text, mimeType, parentId) {
  var token = await getDriveToken();
  var boundary = 'avitolog_' + Date.now();
  var enc = new TextEncoder();
  var meta = JSON.stringify({name: name, parents: [parentId]});
  var nl = '\r\n';
  var pre = '--' + boundary + nl + 'Content-Type: application/json; charset=UTF-8' + nl + nl + meta + nl + '--' + boundary + nl + 'Content-Type: ' + mimeType + nl + nl;
  var post = nl + '--' + boundary + '--';
  var preB = enc.encode(pre), textB = enc.encode(text), postB = enc.encode(post);
  var body = new Uint8Array(preB.length + textB.length + postB.length);
  body.set(preB, 0); body.set(textB, preB.length); body.set(postB, preB.length + textB.length);
  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary},
    body: body
  });
}

function detectCRMCategory(category) {
  var c = (category || '').toLowerCase();
  var cats = [
    {name: '🪚 ТОВАРЫ СТРОИТЕЛЬСТВО', id: '12QkZZOOmrTqtVEgS89H45eeAJzm5tiI2', kw: ['строи','пиломат','доска','брус','кирпич','бетон','цемент','металл','кровл','черепиц','профил','труб','арматур','пиломат']},
    {name: '👷 УСЛУГИ | СТРОИТЕЛИ',   id: '174UazB2ErOG0wD9KplArQWO0JxfhDhfc', kw: ['монтаж','ремонт','отделк','сантех','сварк','бурен','фундам','строит','укладк','кладк','каркасник']},
    {name: '⚙️ ОБОРУДОВАНИЕ',         id: '1j3bqO2-9O9OeENLS7uDxVCu4imgsF1tb', kw: ['оборуд','станок','компрес','генерат','насос','инстр','электр','печ','котл','спецтехник']},
    {name: '🛋 ТОВАРЫ - мебель',       id: '1ODPfNieEXqs9HmL96udmw-qLwiXL3EAS', kw: ['мебел','диван','шкаф','кухн','кресл','стол','матрас','корпус']},
    {name: '🏠 ДОМА | БЫТОВКИ | БАНИ', id: '12ajIWwl0fLs4jWB8NATNdvr6F2SmEeUU', kw: ['дом','бытовк','бан','блок-контейн','каркас','сруб','модул']},
    {name: '🚙 ТОВАРЫ | АВТОзапчасти', id: '1RwiDeVxf3HiCySEMC1fI_5hMDm-5Er9T', kw: ['запчаст','шин','колес','масл','фильтр','автозапч']},
    {name: '🛻 АВТОМОБИЛИ и МОТО',     id: '1rh2Fq8wGsGVDCediTr9zN4tnzvth1CWK', kw: ['автомобил','мото','байк','скутер','авто прод']},
    {name: '🏎 ТОВАРЫ Авто аксессуары',id: '1tevmc_P3MxW4xFLhcuAUMtp7PKNQ8678', kw: ['аксессуар','чехол','коврик','магнитол','видеорегистр']},
    {name: '👕 ОДЕЖДА / Кроссовки',   id: '1p8-ETlYZ4X88X87sMuqNSMF_f4w-td_C', kw: ['одежд','обувь','кроссовк','пошив','текстил','футболк','куртк']},
    {name: '🏭 ГОТОВЫЙ БИЗНЕС',        id: '1aA1wATzVmPRavUrAh8oGsuEa6-xeIOdP', kw: ['бизнес','готов','франш']},
    {name: '👤 УСЛУГИ - Юр, IT',       id: '1ci9RhkZPtvyuBSK4jOh7x02ooBqmpGxw', kw: ['юрид','адвокат','репетитор','бухгал','налог','it','программ','сайт','дизайн']},
    {name: '✈️ ЛОГИСТИКА услуги',      id: '1UgnWOC7tBupL_FSYV0T9RU4Lg6GOEqNa', kw: ['логист','доставк','перевозк','транспорт']},
    {name: '👤 ВАКАНСИИ',              id: '1Os8bLpRKDAeLlaUi_P5HFyE3zEL8AebL', kw: ['вакансия','работа','сотрудник','найм','персонал']},
  ];
  for (var i = 0; i < cats.length; i++) {
    for (var j = 0; j < cats[i].kw.length; j++) {
      if (c.indexOf(cats[i].kw[j]) >= 0) return cats[i];
    }
  }
  return {name: '🙇 БАЗА без оплаты', id: '1-nKHmmLp-vY81EK3APxQSg7v8GSO5TJy'};
}

async function saveToDrive(html, contactsTxt, docHtml) {
  var st = document.getElementById('crmSt');
  st.className = 'crm-st';
  st.textContent = 'Сохраняю в CRM...';
  try {
    var d = currentData;
    var clientName = [d.company, d.name].filter(Boolean).join(' - ') || 'Клиент';
    var dateStr = new Date().toLocaleDateString('ru');
    var folderName = clientName + ' (' + dateStr + ')';
    var cat = detectCRMCategory(d.category);
    console.log('CRM категория:', cat.name, 'ID:', cat.id);

    // Используем папку активного клиента если есть
    var ac = _activeClient || getActiveClient();
    var clientId;
    if (ac && ac.folderId) {
      clientId = ac.folderId;
      console.log('Используем папку активного клиента:', clientId);
    } else {
      clientId = await driveCreateClientFolder(folderName, cat.id);
      console.log('Создана новая папка:', clientId);
    }

    // contacts.txt — только при первой генерации (проверяем есть ли уже)
    var hasContacts = d.company || d.name || d.tg || d.phone;
    if (hasContacts && contactsTxt) {
      try {
        var token = await getDriveToken();
        var chk = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27contacts.txt%27+and+%27' + clientId + '%27+in+parents+and+trashed%3Dfalse&fields=files(id)', {
          headers: {'Authorization': 'Bearer ' + token}
        });
        var chkD = await chk.json();
        if (!chkD.files || chkD.files.length === 0) {
          await driveUploadText('contacts.txt', contactsTxt, 'text/plain', clientId);
          console.log('contacts.txt создан');
        } else {
          console.log('contacts.txt уже есть — пропускаю');
        }
      } catch(e) { console.warn('contacts check error:', e); }
    }

    // Название документа по табу
    var tabNames = { analysis: '📊 Аналитика', presale: '⏰ Нужно сейчас', avito1: '🏆 Avito №1' };
    var docName = (tabNames[currentTab] || 'Документ') + ' — ' + clientName;
    
    // HTML для Drive: картинка для аналитики, presale и avito1. Для Drive используем полные URL (относительный путь не загружается в Docs)
    var driveHtml = currentTab === 'analysis' 
      ? buildWordHtml(withImgUrl(currentHtml)) 
      : currentTab === 'presale'
      ? buildWordHtml(insertHeaderImg(currentHtml, getPresaleHeaderImgForExport()))
      : currentTab === 'avito1'
      ? buildWordHtml(insertHeaderImg(currentHtml, getAvito1HeaderImgForExport()))
      : buildWordHtml(currentHtml);
    
    console.log('Создаю Google Doc:', docName, 'размер:', driveHtml.length);
    try {
      var docResult = await driveCreateGoogleDoc(docName, driveHtml, clientId);
      console.log('Google Doc OK:', docResult);
      lastDocId = docResult.id;
      var folderUrl = 'https://drive.google.com/drive/folders/' + clientId;
      var docLink = docResult && docResult.webViewLink 
        ? ' · <a href="' + docResult.webViewLink + '" target="_blank" style="color:#7c6af7;text-decoration:underline">Док →</a>' 
        : '';
      st.className = 'crm-st ok';
      st.innerHTML = '✓ ' + cat.name + ' · <a href="' + folderUrl + '" target="_blank" style="color:#4fc;text-decoration:underline">Папка →</a>' + docLink;
      refreshClientContents();
      var rb = document.getElementById('refreshBtn');
      if (rb) rb.style.display = 'inline-flex';
      var bb = document.getElementById('backBtn'); if (bb) bb.style.display = 'inline-flex';
    } catch(docErr) {
      console.error('Google Doc fallback → HTML:', docErr);
      await driveUploadText(docName + '.html', driveHtml, 'text/html', clientId);
      var folderUrl = 'https://drive.google.com/drive/folders/' + clientId;
      st.className = 'crm-st ok';
      st.innerHTML = '✓ ' + cat.name + ' · <a href="' + folderUrl + '" target="_blank" style="color:#4fc;text-decoration:underline">Папка →</a>';
      refreshClientContents();
    }
  } catch(e) {
    st.className = 'crm-st err';
    st.textContent = '✗ ' + (e.message || String(e));
    console.error('Drive error:', e);
  }
}

function triggerCRM(html) {
  var d = currentData;
  var dateStr = new Date().toLocaleDateString('ru');
  var lines = [];
  lines.push('===============================');
  lines.push('  КОНТАКТЫ КЛИЕНТА');
  lines.push('===============================');
  lines.push('');
  if (d.company)  lines.push('Компания:  ' + d.company);
  if (d.name)     lines.push('Имя:       ' + d.name);
  if (d.tg)       lines.push('Телеграм:  ' + d.tg);
  if (d.phone)    lines.push('Телефон:   ' + d.phone);
  lines.push('');
  lines.push('-------------------------------');
  if (d.category) lines.push('Ниша:      ' + d.category);
  if (d.city)     lines.push('ГЕО:       ' + d.city);
  if (d.kp)       lines.push('КП:        ' + d.kp + ' объявлений');
  if (d.notes)    lines.push('УТП/инфо:  ' + d.notes);
  if (d.avito_account) lines.push('Avito:     ' + d.avito_account);
  if (d.client_type)   lines.push('Тип:       ' + d.client_type);
  lines.push('');
  lines.push('Дата:      ' + dateStr);
  lines.push('===============================');
  var docBody = currentTab === 'analysis' ? withImg(html) : currentTab === 'presale' ? insertHeaderImg(html, PRESALE_HEADER_IMG) : currentTab === 'avito1' ? insertHeaderImg(html, AVITO1_HEADER_IMG) : html;
  saveToDrive(html, lines.join('\n'), buildWordHtml(docBody));
}

// ── REFRESH DRIVE DOC ──
async function refreshDriveDoc() {
  if (!lastDocId || !_driveToken) return;
  var btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.textContent = '🔄 Обновляю...';
  var st = document.getElementById('crmSt');
  st.className = 'crm-st';
  st.textContent = 'Обновляю документ...';
  try {
    var driveHtml = currentTab === 'analysis' 
      ? buildWordHtml(withImgUrl(currentHtml)) 
      : currentTab === 'presale'
      ? buildWordHtml(insertHeaderImg(currentHtml, getPresaleHeaderImgForExport()))
      : currentTab === 'avito1'
      ? buildWordHtml(insertHeaderImg(currentHtml, getAvito1HeaderImgForExport()))
      : buildWordHtml(currentHtml);
    
    // Удаляем старый док и создаём новый в той же папке
    var token = _driveToken;
    // Получаем parents старого дока
    var infoResp = await fetch('https://www.googleapis.com/drive/v3/files/' + lastDocId + '?fields=parents,name', {
      headers: {'Authorization': 'Bearer ' + token}
    });
    var info = await infoResp.json();
    var parentId = info.parents ? info.parents[0] : null;
    var docName = info.name || 'Документ';
    
    if (!parentId) throw new Error('Не найдена папка документа');
    
    // Удаляем старый
    await fetch('https://www.googleapis.com/drive/v3/files/' + lastDocId, {
      method: 'DELETE',
      headers: {'Authorization': 'Bearer ' + token}
    });
    
    // Создаём новый
    var docResult = await driveCreateGoogleDoc(docName, driveHtml, parentId);
    lastDocId = docResult.id;
    console.log('Doc обновлён:', docResult);
    
    st.className = 'crm-st ok';
    var docLink = docResult.webViewLink 
      ? ' · <a href="' + docResult.webViewLink + '" target="_blank" style="color:#7c6af7;text-decoration:underline">Док →</a>'
      : '';
    st.innerHTML = '✓ Документ обновлён' + docLink;
    btn.style.display = 'none';
  } catch(e) {
    console.error('Refresh error:', e);
    st.className = 'crm-st err';
    st.textContent = '✗ ' + (e.message || String(e));
    btn.disabled = false;
    btn.textContent = '🔄 Обновить в Drive';
  }
}

// ── SAVE NORM ──
function saveNorm(n) {
  if (!n) return;
  function set(id, val) {
    if (!val) return;
    acSave(id, val);
    var e = document.getElementById(id);
    if (e && e.value) e.value = val;
  }
  set('company', n.company);
  set('category', n.category);
  set('city', n.city);
  set('notes', n.usp || n.notes);
}

// ── API ──
var API_MODELS = ['claude-sonnet-4-20250514', 'claude-sonnet-4-6', 'claude-3-5-sonnet-20241022'];
function callAPI(prompt, maxTokens) {
  var inp = document.getElementById('apiKeyInput');
  var userKey = (inp && inp.value ? inp.value : localStorage.getItem('avito_api_key') || '').trim();
  if (inp && userKey) { try { localStorage.setItem('avito_api_key', userKey); } catch(e) {} }
  if (!userKey) {
    if (inp) { inp.focus(); inp.placeholder = 'Вставь sk-ant-... с console.anthropic.com'; }
    throw new Error('Введи API ключ Anthropic в поле в шапке. Получить: console.anthropic.com');
  }
  var endpoint = getApiEndpoint();
  var headers = {
    'Content-Type': 'application/json',
    'x-api-key': userKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  function doRequest(url, model) {
    var payload = JSON.stringify({ model: model || API_MODELS[0], max_tokens: maxTokens, messages: [{role:'user', content: prompt}] });
    var opts = { method: 'POST', headers: headers, body: payload };
    if (typeof AbortController !== 'undefined') {
      var ctl = new AbortController();
      opts.signal = ctl.signal;
      setTimeout(function(){ ctl.abort(); }, 60000);
    }
    return fetch(url, opts).then(function(r) {
      if (!r.ok) {
        return r.text().then(function(t){
          var msg = 'HTTP ' + r.status;
          if (r.status === 401) msg = 'Неверный API ключ. Введи новый sk-ant-... в шапке (console.anthropic.com → API Keys).';
          else if (r.status === 405) msg = 'Прокси отклонил запрос (405). Нажми «Повторить» — попробуем другой прокси.';
          else if (t && t.indexOf('"message"') >= 0) {
            try { var j = JSON.parse(t); if (j.error && j.error.message) msg = j.error.message; } catch(_) { msg += ' · ' + (t||'').slice(0, 180); }
          } else if (t && t.indexOf('<html') < 0) msg += ' · ' + t.slice(0, 180);
          throw new Error(msg);
        });
      }
      return r.json();
    }).then(function(data) {
      if (!data) throw new Error('API вернул пустой ответ');
      if (data.error) throw new Error(data.error.message || 'API error');
      var content = data.content;
      if (!content || !Array.isArray(content)) return '';
      return content.map(function(i) { return (i && i.text) ? String(i.text) : ''; }).join('');
    });
  }
  function tryModels(url, idx) {
    idx = idx || 0;
    return doRequest(url, API_MODELS[idx]).catch(function(e) {
      var m = String(e.message || e);
      if ((m.indexOf('model') >= 0 || m.indexOf('404') >= 0) && idx < API_MODELS.length - 1) {
        return tryModels(url, idx + 1);
      }
      throw e;
    });
  }
  function doWithRetry(url, retries) {
    retries = retries || 0;
    return tryModels(url).catch(function(e) {
      if (retries < 1) return doWithRetry(url, retries + 1);
      throw e;
    });
  }
  return doWithRetry(endpoint).catch(function(e) {
    var m = String(e && e.message ? e.message : e);
    var isCors = m.indexOf('Failed to fetch') >= 0 || m.indexOf('CORS') >= 0 || m.indexOf('NetworkError') >= 0 || m.indexOf('Load failed') >= 0 || m.indexOf('ERR_FAILED') >= 0 || m.indexOf('blocked') >= 0 || m.indexOf('net::') >= 0 || m.indexOf('Network request failed') >= 0;
    var isProxyError = m.indexOf('HTTP 405') >= 0 || m.indexOf('HTTP 403') >= 0 || m.indexOf('HTTP 502') >= 0 || m.indexOf('HTTP 503') >= 0 || m.indexOf('abor') >= 0;
    var directAnthropic = endpoint.indexOf('api.anthropic.com') >= 0;
    var useFallbacks = (isCors && directAnthropic) || isProxyError;
    if (useFallbacks) {
      function tryFallbacks(idx) {
        if (idx >= API_CORS_FALLBACKS.length) {
          throw new Error('Сеть/CORS: не удаётся связаться с API.\n\n• GitHub Pages блокирует CORS — запусти локально: открой index.html через Live Server (VS Code) или python -m http.server\n• Нажми «Повторить» 2–3 раза — бесплатный прокси может просыпаться до 30 сек\n• «Настроить прокси» → разверни свой на Render: github.com/melihbirim/corsproxy');
        }
        var fallback = API_CORS_FALLBACKS[idx];
        var url = typeof fallback === 'object' ? fallback.url : (fallback.indexOf('?url=') >= 0 || fallback.indexOf('api.anthropic.com') >= 0 || fallback.indexOf('%2F%2F') >= 0 ? fallback : fallback + API);
        var warmup = typeof fallback === 'object' ? fallback.warmup : null;
        var warmupDelay = (typeof fallback === 'object' && fallback.warmupDelay) ? fallback.warmupDelay : 5000;
        function doTry() {
          return tryModels(url).catch(function() { return tryFallbacks(idx + 1); });
        }
        if (warmup) {
          return fetch(warmup, { method: 'GET' }).catch(function(){}).then(function() {
            return new Promise(function(res) { setTimeout(function() { res(doTry()); }, warmupDelay); });
          });
        }
        return doTry();
      }
      return tryFallbacks(0);
    }
    throw e;
  });
}

// ── FIX JSON ──
function fixJSON(s) {
  if (s == null || typeof s !== 'string') return '{}';
  try { JSON.parse(s); return s; } catch(e) {}
  var lc = s.lastIndexOf(','), lb = s.lastIndexOf('}'), la = s.lastIndexOf(']');
  if (lc > Math.max(lb,la)) s = s.substring(0,lc);
  var op = 0, ar = 0;
  for (var ci = 0; ci < s.length; ci++) {
    var c = s[ci];
    if (c==='{') op++; else if (c==='}') op--;
    if (c==='[') ar++; else if (c===']') ar--;
  }
  var quotes = (s.match(/"/g)||[]).length;
  if (quotes % 2 !== 0) s += '"';
  while (ar-- > 0) s += ']';
  while (op-- > 0) s += '}';
  return s;
}

// ── AUTOCOMPLETE ──
var ACF = ['category','notes'];
var ACP = 'avitolog_ac_';

var NICHE_PRESETS = [
  '🏠 Дома под ключ (услуги)',
  '🏘 Готовые Дома',
  '🪵 Пиломатериалы',
  '🧱 Термопанели',
  '👩🏻‍🏫 Репетитор',
  '👷‍♂️ Строители Услуги',
  '💦 Гидроизоляция подвалов',
  '🔥 Утеплители',
  '🛋 Мебель корпусная (лофт)',
  '🛋 Кровати и диваны',
  '🗄 Шкафы, кухни, прихожие',
  '🧱 Сэндвич-Панели',
  '⚡️ Электрик услуги',
  '📐 Стяжка пола',
  '🪟 Окна и остекление',
  '🪨 Пеллеты'
];

var GEO_CITIES = ['Москва','Московская область','Санкт-Петербург','Ленинградская область','Краснодар','Краснодарский край','Крым','Симферополь','Севастополь','Ростов-на-Дону','Ростовская область','Казань','Татарстан','Екатеринбург','Свердловская область','Новосибирск','Новосибирская область','Нижний Новгород','Нижегородская область','Самара','Самарская область','Воронеж','Воронежская область','Уфа','Башкортостан','Волгоград','Волгоградская область','Пермь','Пермский край','Красноярск','Красноярский край','Саратов','Саратовская область','Вологда','Вологодская область','Тюмень','Тюменская область','Тольятти','Ижевск','Удмуртия','Барнаул','Алтайский край','Иркутск','Иркутская область','Хабаровск','Хабаровский край','Ярославль','Ярославская область','Владивосток','Приморский край','Махачкала','Дагестан','Томск','Томская область','Оренбург','Оренбургская область','Кемерово','Кемеровская область','Новокузнецк','Липецк','Липецкая область','Тула','Тульская область','Киров','Кировская область','Чебоксары','Чувашия','Калининград','Калининградская область','Брянск','Брянская область','Курск','Курская область','Иваново','Ивановская область','Магнитогорск','Сочи','Владикавказ','Северная Осетия','Грозный','Чечня','Ставрополь','Ставропольский край','Чита','Забайкальский край','Подольск','Люберцы','Балашиха','Мытищи','Королёв','Химки','Коломна','Обнинск','Тверь','Тверская область','Рязань','Рязанская область','Пенза','Пензенская область','Астрахань','Астраханская область','Челябинск','Челябинская область','Ульяновск','Ульяновская область','Омск','Омская область','Курган','Курганская область','Нальчик','Кабардино-Балкария','Элиста','Калмыкия','Владимир','Владимирская область','Смоленск','Смоленская область','Мурманск','Мурманская область','Архангельск','Архангельская область','Сыктывкар','Коми','Йошкар-Ола','Марий Эл','Саранск','Мордовия','Улан-Удэ','Бурятия','Петропавловск-Камчатский','Камчатский край','Южно-Сахалинск','Сахалинская область','Благовещенск','Амурская область'];

function acLoad(f) {
  try { return JSON.parse(localStorage.getItem(ACP+f) || '[]'); } catch(e) { return []; }
}

function acSim(a, b) {
  var x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (x===y) return true;
  if (x.indexOf(y)>=0 || y.indexOf(x)>=0) return true;
  if (Math.abs(x.length-y.length) > 3) return false;
  var d = 0;
  var lo = x.length>y.length ? x : y;
  var sh = x.length>y.length ? y : x;
  for (var i=0; i<sh.length; i++) {
    if (lo[i] !== sh[i]) d++;
    if (d > 2) return false;
  }
  return d + (lo.length - sh.length) <= 2;
}

function acSave(f, v) {
  if (!v || v.trim().length < 2) return;
  var val = v.trim();
  var l = acLoad(f).filter(function(x) { return !acSim(x,val); });
  l.push(val);
  l.sort(function(a,b) { return a.localeCompare(b,'ru'); });
  localStorage.setItem(ACP+f, JSON.stringify(l.slice(-50)));
}

function acSaveAll() {
  (ACF || []).forEach(function(f) {
    var e = document.getElementById(f);
    if (e && e.value.trim()) acSave(f, e.value.trim());
  });
  var pnames = document.querySelectorAll('.pname');
  (pnames ? [].slice.call(pnames) : []).forEach(function(e) {
    if (e.value.trim()) acSave('positions', e.value.trim());
  });
}

function acFlt(f, q) {
  var l = acLoad(f);
  if (f === 'category') {
    var presets = NICHE_PRESETS || [];
    var saved = l.filter(function(v) { return presets.indexOf(v) < 0; });
    l = presets.concat(saved).sort(function(a,b){ return a.localeCompare(b, 'ru'); });
  }
  if (!q) return l;
  var lq = q.toLowerCase();
  return l.filter(function(v) { return v.toLowerCase().indexOf(lq) >= 0; });
}

function acHL(t, q) {
  if (!q) return t;
  var i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t;
  return t.slice(0,i) + '<mark>' + t.slice(i,i+q.length) + '</mark>' + t.slice(i+q.length);
}

function setupAC(el, fn) {
  var w = document.createElement('div');
  w.className = 'ac-wrap' + (fn === 'category' ? ' category-ac' : '');
  el.parentNode.insertBefore(w, el);
  w.appendChild(el);
  var lst = document.createElement('div');
  lst.className = 'ac-list';
  w.appendChild(lst);
  var si = -1;

  function show(q) {
    var items = acFlt(fn, q);
    if (!items.length) { lst.classList.remove('open'); return; }
    lst.innerHTML = items.map(function(v, i) {
      var safe = v.replace(/"/g, '&quot;');
      return '<div class="ac-item" data-val="' + safe + '" data-idx="' + i + '">' +
        '<span class="ac-t">' + acHL(v, q) + '</span>' +
        '<span class="ac-del" data-val="' + safe + '">x</span></div>';
    }).join('');
    lst.classList.add('open');
    si = -1;
    lst.querySelectorAll('.ac-item').forEach(function(item) {
      item.querySelector('.ac-del').addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        var val = e.target.getAttribute('data-val');
        var saved = acLoad(fn).filter(function(v) { return v !== val; });
        localStorage.setItem(ACP+fn, JSON.stringify(saved));
        show(el.value);
      });
      item.querySelector('.ac-t').addEventListener('mousedown', function(e) {
        e.preventDefault();
        el.value = item.getAttribute('data-val');
        lst.classList.remove('open');
      });
    });
  }

  el.addEventListener('input', function() { show(el.value); });
  el.addEventListener('focus', function() { show(el.value); });
  el.addEventListener('keydown', function(e) {
    var its = lst.querySelectorAll('.ac-item');
    if (!lst.classList.contains('open') || !its.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); si = Math.min(si+1, its.length-1);
      its.forEach(function(t,i) { t.classList.toggle('sel', i===si); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); si = Math.max(si-1, 0);
      its.forEach(function(t,i) { t.classList.toggle('sel', i===si); });
    } else if (e.key === 'Enter' && si >= 0) {
      e.preventDefault(); el.value = its[si].getAttribute('data-val'); lst.classList.remove('open');
    } else if (e.key === 'Escape') {
      lst.classList.remove('open');
    }
  });
  document.addEventListener('click', function(e) {
    if (!w.contains(e.target)) lst.classList.remove('open');
  });
}

function initAC() {
  ACF.forEach(function(f) {
    var e = document.getElementById(f);
    if (e) setupAC(e, f);
  });
  var fp = document.querySelector('.pname');
  if (fp) setupAC(fp, 'positions');
  setupGeoField();
}

function getGeoValues() {
  var inp = document.getElementById('city');
  if (!inp) return [];
  var s = (inp.value || '').trim();
  if (!s) return [];
  return s.split(',').map(function(x){ return x.trim(); }).filter(Boolean);
}

function setGeoValues(arr) {
  var inp = document.getElementById('city');
  if (inp) inp.value = (arr || []).filter(Boolean).join(', ');
}

function syncGeoFromValue() {
  var tags = getGeoValues();
  var cont = document.getElementById('geoTags');
  if (!cont) return;
  cont.innerHTML = tags.map(function(t) {
    var safe = (t || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<span class="geo-tag" data-val="' + safe + '">' + safe + '<button type="button" class="geo-tag-x" title="Удалить">×</button></span>';
  }).join('');
  cont.querySelectorAll('.geo-tag-x').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tag = btn.closest('.geo-tag');
      var val = tag.getAttribute('data-val');
      var arr = getGeoValues().filter(function(x){ return x !== val; });
      setGeoValues(arr);
      syncGeoFromValue();
    });
  });
}

function setupGeoField() {
  var wrap = document.getElementById('geoWrap');
  var inp = document.getElementById('geoInput');
  var list = document.getElementById('geoList');
  if (!wrap || !inp || !list) return;
  syncGeoFromValue();
  var si = -1;

  function geoFlt(q) {
    if (!q || q.length < 2) return GEO_CITIES.filter(function(c){ return !getGeoValues().includes(c); }).slice(0, 30);
    var lq = q.toLowerCase();
    return GEO_CITIES.filter(function(c) {
      if (getGeoValues().includes(c)) return false;
      return c.toLowerCase().indexOf(lq) >= 0;
    }).slice(0, 50);
  }

  function showList() {
    var q = inp.value.trim();
    var items = geoFlt(q);
    if (!q && items.length === 0) items = GEO_CITIES.slice(0, 50);
    list.innerHTML = items.map(function(v) {
      var safe = v.replace(/"/g, '&quot;');
      return '<div class="ac-item geo-item" data-val="' + safe + '">' + v + '</div>';
    }).join('');
    list.classList.toggle('open', items.length > 0);
    si = -1;
    list.querySelectorAll('.geo-item').forEach(function(item) {
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var val = item.getAttribute('data-val');
        var arr = getGeoValues();
        if (arr.indexOf(val) < 0) arr.push(val);
        setGeoValues(arr);
        syncGeoFromValue();
        inp.value = '';
        list.classList.remove('open');
      });
    });
  }

  inp.addEventListener('input', showList);
  inp.addEventListener('focus', showList);
  inp.addEventListener('keydown', function(e) {
    var its = list.querySelectorAll('.geo-item');
    if (e.key === 'Enter') {
      e.preventDefault();
      if (its.length && si >= 0) {
        var val = its[si].getAttribute('data-val');
        var arr = getGeoValues();
        if (arr.indexOf(val) < 0) arr.push(val);
        setGeoValues(arr);
        syncGeoFromValue();
        inp.value = '';
        list.classList.remove('open');
      } else if (inp.value.trim()) {
        var val = inp.value.trim();
        var arr = getGeoValues();
        if (arr.indexOf(val) < 0) arr.push(val);
        setGeoValues(arr);
        syncGeoFromValue();
        inp.value = '';
        list.classList.remove('open');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      si = Math.min(si + 1, its.length - 1);
      its.forEach(function(t, i) { t.classList.toggle('sel', i === si); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      si = Math.max(si - 1, 0);
      its.forEach(function(t, i) { t.classList.toggle('sel', i === si); });
    } else if (e.key === 'Escape') {
      list.classList.remove('open');
    }
  });
  document.addEventListener('click', function(e) {
    if (!wrap.contains(e.target)) list.classList.remove('open');
  });
}

// ── CUSTOM KP ──
function addCustomKP() {
  var inp = document.getElementById('kpCustom');
  var val = inp.value.trim().replace(/[^0-9∞]/g, '');
  if (!val) return;
  // Сохраняем в localStorage
  var saved = JSON.parse(localStorage.getItem('avito_kp_custom') || '[]');
  if (saved.indexOf(val) < 0) {
    saved.push(val);
    localStorage.setItem('avito_kp_custom', JSON.stringify(saved));
  }
  addKPTag(val);
  inp.value = '';
}

function addKPTag(val) {
  var wrap = document.querySelector('.kp-wrap');
  // Проверяем нет ли уже такого
  var exists = false;
  wrap.querySelectorAll('.kp-tag').forEach(function(b) {
    if (b.getAttribute('data-kp') === val) exists = true;
  });
  if (exists) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kp-tag kp-custom';
  btn.setAttribute('data-kp', val);
  btn.innerHTML = val + ' <span style="opacity:.5;font-size:10px" onclick="removeKPTag(this.parentElement,event)">x</span>';
  btn.addEventListener('click', function(e) {
    if (e.target.tagName === 'SPAN') return;
    this.classList.toggle('on');
    updateKPValue();
  });
  wrap.appendChild(btn);
}

function removeKPTag(btn, e) {
  e.stopPropagation();
  var val = btn.getAttribute('data-kp');
  btn.remove();
  var saved = JSON.parse(localStorage.getItem('avito_kp_custom') || '[]');
  saved = saved.filter(function(v) { return v !== val; });
  localStorage.setItem('avito_kp_custom', JSON.stringify(saved));
  updateKPValue();
}

function updateKPValue() {
  var vals = [];
  document.querySelectorAll('.kp-tag.on').forEach(function(b) {
    vals.push(b.getAttribute('data-kp'));
  });
  document.getElementById('kp_count').value = vals.join(', ');
}

function syncKpFromValue() {
  var inp = document.getElementById('kp_count');
  if (!inp) return;
  var s = (inp.value || '').trim();
  document.querySelectorAll('.kp-tag').forEach(function(b) { b.classList.remove('on'); });
  if (!s) return;
  var vals = s.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  vals.forEach(function(val) {
    var btns = document.querySelectorAll('.kp-tag');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-kp') === val) { btns[i].classList.add('on'); return; }
    }
    addKPTag(val);
    document.querySelectorAll('.kp-tag').forEach(function(b) { if (b.getAttribute('data-kp') === val) b.classList.add('on'); });
  });
}

// ── CLIENT TYPE ──
function toggleClientType(btn, val) {
  var input = document.getElementById('client_type');
  if (btn.classList.contains('on')) {
    btn.classList.remove('on');
    input.value = '';
  } else {
    document.querySelectorAll('.ctype-btn').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
    input.value = val;
  }
}

// ── CRM CLIENT STORAGE ──
var SHEETS_ID = '1gUV4mWX4ob0NkjJTpP15N9dBKfIOO2NdJQDKXCooVA8';
var SHEETS_NAME = 'Лист1';
var _activeClient = null;
function normClientField(v) {
  return String(v || '').trim().toLowerCase();
}
function generateClientId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  } catch(e) {}
  return 'cid_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
}
function findClientIndexByData(list, d) {
  var id = String(d.client_id || '');
  if (id) {
    var byId = list.findIndex(function(c) { return String(c.client_id || '') === id; });
    if (byId >= 0) return byId;
  }
  if (d.folderId) {
    var byFolder = list.findIndex(function(c) { return String(c.folderId || '') === String(d.folderId); });
    if (byFolder >= 0) return byFolder;
  }
  var company = normClientField(d.company);
  var contact = normClientField(d.contact_name);
  var phone = normClientField(d.phone);
  return list.findIndex(function(c) {
    var cCompany = normClientField(c.company);
    var cContact = normClientField(c.contact_name);
    var cPhone = normClientField(c.phone);
    if (company && contact && cCompany === company && cContact === contact) return true;
    if (company && phone && cCompany === company && cPhone === phone) return true;
    return false;
  });
}

function getCrmClients() {
  try { return JSON.parse(localStorage.getItem('avitolog_clients') || '[]'); } catch(e) { return []; }
}
function saveCrmClients(list) {
  localStorage.setItem('avitolog_clients', JSON.stringify(list));
}
function getActiveClient() {
  try { return JSON.parse(localStorage.getItem('avitolog_active_client')); } catch(e) { return null; }
}
function setActiveClient(client) {
  _activeClient = client;
  localStorage.setItem('avitolog_active_client', JSON.stringify(client));
  updateClientBadge();
  if (!projectsMode && !goalsMode && !agencyMode && ['analysis','presale','avito1'].indexOf(currentTab) >= 0 && !docReady) refreshClientContents();
  if (goalsMode && window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') window.AVITOLOG_GOALS.render();
}

function updateGenButtonState() {
  var ac = _activeClient || getActiveClient();
  var hasFolder = !!(ac && ac.folderId);
  var btns = document.querySelectorAll('#genBtn');
  (btns || []).forEach(function(b) {
    if (!b) return;
    b.disabled = !hasFolder;
    b.title = hasFolder ? '' : 'Выберите папку клиента в левом меню';
  });
}

function getExtraPrompt() {
  var el = document.getElementById('extraPromptInp');
  return (el && el.value) ? String(el.value).trim() : '';
}
function resizeExtraPromptInp() {
  var el = document.getElementById('extraPromptInp');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(80, Math.max(26, el.scrollHeight)) + 'px';
}

function updateClientBadge() {
  var badge = document.getElementById('clientBadge');
  var avatarEl = document.getElementById('clientBadgeAvatar');
  var nameEl = document.getElementById('clientBadgeName');
  var ac = _activeClient || getActiveClient();
  if (ac && ac.folderId) {
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    nameEl.textContent = ac.company || 'Клиент';
    badge.className = 'badge ok';
    var avatar = typeof getClientAvatar === 'function' ? getClientAvatar(ac) : '';
    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = '<img class="client-badge-avatar" src="' + String(avatar).replace(/"/g,'&quot;') + '" alt="">';
        avatarEl.style.display = '';
      } else {
        avatarEl.innerHTML = '<span class="client-badge-avatar-wrap">👤</span>';
        avatarEl.style.display = '';
      }
    }
  } else {
    badge.style.display = 'none';
    if (avatarEl) avatarEl.innerHTML = '';
  }
  updateGenButtonState();
}

function openClientFolder() {
  if (window.__clientDragJustHappened) return;
  var ac = _activeClient || getActiveClient();
  if (ac && ac.folderLink) window.open(ac.folderLink, '_blank');
}

function startClientMenuDrag(e, el) {
  if (!el) return;
  var folderId = String(el.getAttribute('data-folder-id') || '').trim();
  var folderName = String(el.getAttribute('data-folder-name') || '').trim();
  if (!folderId) return;
  var folderLink = 'https://drive.google.com/drive/folders/' + folderId;
  var clients = getCrmClients();
  var found = clients.find(function(c) { return String(c.folderId || '') === folderId; });
  var payload = found || { folderId: folderId, folderLink: folderLink, company: folderName };
  setActiveClient(payload);
  try {
    if (e && e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', 'goals-client-menu-item');
    }
  } catch (err) {}
  if (window.__goalsClientDragStart) window.__goalsClientDragStart(e);
}

function endClientMenuDrag(e) {
  if (window.__goalsClientDragEnd) window.__goalsClientDragEnd(e);
}

window.__goalsGetActiveClient = function() { return _activeClient || getActiveClient(); };
window.__goalsGetSelectedProjectName = function() {
  try {
    var p = getSelectedProject();
    if (!p) return '';
    return String(p.company || p.title || '').trim();
  } catch (e) {
    return '';
  }
};
window.__goalsGetActiveClientAvatar = function() {
  var ac = _activeClient || getActiveClient();
  if (!ac) return '';
  try {
    return typeof getClientAvatar === 'function' ? (getClientAvatar(ac) || '') : '';
  } catch (e) {
    return '';
  }
};
function clearActiveClient() {
  _activeClient = null;
  localStorage.removeItem('avitolog_active_client');
  updateClientBadge();
  if (goalsMode && window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function') window.AVITOLOG_GOALS.render();
  if (!projectsMode && !goalsMode && !agencyMode && ['analysis','presale','avito1'].indexOf(currentTab) >= 0 && !docReady) refreshClientContents();
  // Очищаем форму
  ['company','contact_name','phone','tg','avito_account','category','city','notes','kp_count'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('client_type').value = '';
  document.querySelectorAll('.ctype-btn').forEach(function(b) { b.classList.remove('on'); });
  document.querySelectorAll('.kp-tag').forEach(function(b) { b.classList.remove('on'); });
}

var _browseStack = []; // [{id, name}]
var _browseCurrentId = null;
var _browseLevel = 0; // 0=root, 1=category, 2+=client
var _browseCurrentName = 'CRM';

function toggleClientMenu() {
  var menu = document.getElementById('clientMenu');
  // Всегда сбрасываем и открываем заново
  _browseStack = [];
  _browseLevel = 0;
  _browseCurrentId = CRM_ROOT;
  menu.classList.add('show');
  browseFolder(CRM_ROOT, 'CRM');
}

function closeClientMenu() {
  document.getElementById('clientMenu').classList.remove('show');
  _projectFolderBindTargetId = null;
}
function toggleMobileSidebar() {
  document.body.classList.toggle('sidebar-open-mobile');
}
function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open-mobile');
}

async function browseFolder(folderId, folderName) {
  _browseCurrentId = folderId;
  _browseCurrentName = folderName || 'CRM';
  var menu = document.getElementById('clientMenu');
  var pathStr = _browseStack.map(function(s) { return s.name; }).join(' › ');
  if (pathStr && folderName !== 'CRM') pathStr += ' › ' + folderName;
  if (!pathStr) pathStr = '📁 CRM';
  
  var backBtn = _browseStack.length > 0 ? '<button type="button" onclick="browseBack()">← Назад</button>' : '';
  // Кнопка выбора только на уровне 2+ (внутри категории)
  var selectBtn = _browseLevel >= 2 ? '<button type="button" class="primary" onclick="selectBrowseFolder()">✓ Выбрать</button>' : '';

  menu.innerHTML = '<div class="cm-head"><span>📁 ' + folderName + '</span><span class="cm-close" onclick="closeClientMenu()">✕</span></div>' +
    '<div class="cm-path">' + pathStr + '</div>' +
    '<div class="cm-tools"><input type="search" id="cmSearch" placeholder="Поиск папки..." oninput="filterBrowseFolders(this.value)"><button type="button" onclick="createBrowseFolder()">+ Папка</button></div>' +
    '<div class="cm-list"><div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">⏳</div></div>' +
    (backBtn || selectBtn ? '<div class="cm-foot">' + backBtn + selectBtn + '</div>' : '');

  try {
    var token = _driveToken;
    if (!token) throw new Error('Drive не подключён. Нажмите 🔑 Drive для входа.');
    var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
    var resp = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,mimeType)&orderBy=name&pageSize=50', {
      headers: {'Authorization': 'Bearer ' + token}
    });
    var data = await resp.json();
    if (!resp.ok || data.error) {
      var errMsg = (data.error && data.error.message) ? data.error.message : ('Ошибка ' + (resp.status || ''));
      if (resp.status === 401) {
        _driveToken = null;
        clearStoredDriveAuth();
        updateDriveUI();
        errMsg = 'Сессия истекла. Нажмите 🔑 Drive для повторного входа.';
      }
      throw new Error(errMsg);
    }
    var folders = (data.files || []).filter(function(f) { return f.mimeType === 'application/vnd.google-apps.folder'; });
    // Не показывать служебные папки OLD и Brains
    var hideNames = ['old', 'brains', 'brain'];
    folders = folders.filter(function(f) {
      var n = (f.name || '').trim().toLowerCase();
      return !hideNames.some(function(h) { return n === h; });
    });
    var listEl = menu.querySelector('.cm-list');
    if (folders.length === 0) {
      listEl.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:11px;text-align:center">Пустая папка</div>';
    } else {
      listEl.innerHTML = folders.map(function(f) {
        var esc = function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        var ac = { folderId: f.id, company: f.name };
        var avatar = typeof getClientAvatar === 'function' ? getClientAvatar(ac) : '';
        var avatarHtml = avatar ? '<img class="client-item-avatar" src="' + esc(avatar) + '" alt="">' : '<div class="client-item-avatar-wrap">📁</div>';
        return '<div class="client-item" data-folder-id="' + esc(f.id) + '" data-folder-name="' + esc(f.name) + '" draggable="true" ondragstart="startClientMenuDrag(event,this)" ondragend="endClientMenuDrag(event)">' +
          avatarHtml + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span>' +
          '<span class="chevron">›</span>' +
        '</div>';
      }).join('');
    }
    var searchEl = document.getElementById('cmSearch');
    if (searchEl && searchEl.value) filterBrowseFolders(searchEl.value);
  } catch(e) {
    menu.querySelector('.cm-list').innerHTML = '<div style="padding:12px;color:#ff8080;font-size:11px">' + e.message + '</div>';
  }
}
function filterBrowseFolders(query) {
  var q = String(query || '').trim().toLowerCase();
  var any = false;
  document.querySelectorAll('#clientMenu .client-item[data-folder-id]').forEach(function(item) {
    var name = (item.getAttribute('data-folder-name') || '').toLowerCase();
    var show = !q || name.indexOf(q) >= 0;
    item.style.display = show ? '' : 'none';
    if (show) any = true;
  });
  var list = document.querySelector('#clientMenu .cm-list');
  if (!list) return;
  var empty = document.getElementById('cmNoSearchRes');
  if (!any && q) {
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'cmNoSearchRes';
      empty.style.cssText = 'padding:12px;color:var(--muted);font-size:11px;text-align:center';
      empty.textContent = 'Ничего не найдено';
      list.appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}
async function createBrowseFolder() {
  if (!_browseCurrentId) return;
  var name = prompt('Название новой папки:');
  if (!name) return;
  var clean = String(name).trim();
  if (!clean) return;
  try {
    await driveCreateClientFolder(clean, _browseCurrentId);
    await browseFolder(_browseCurrentId, _browseCurrentName);
    var st = document.getElementById('crmSt');
    if (st) { st.style.display = 'block'; st.className = 'crm-st ok'; st.textContent = 'Папка создана: ' + clean; }
  } catch(e) {
    var st = document.getElementById('crmSt');
    if (st) { st.style.display = 'block'; st.className = 'crm-st err'; st.textContent = '✗ ' + (e.message || String(e)); }
  }
}

function enterFolder(id, name) {
  _browseStack.push({id: _browseCurrentId, name: document.querySelector('.cm-head span:first-child').textContent.replace('📁 ', ''), level: _browseLevel});
  _browseLevel++;
  browseFolder(id, name);
}

function browseBack() {
  if (_browseStack.length === 0) return;
  var prev = _browseStack.pop();
  _browseLevel = prev.level;
  browseFolder(prev.id, prev.name);
}

function selectBrowseFolder() {
  var folderId = _browseCurrentId;
  var folderName = document.querySelector('.cm-head span:first-child').textContent.replace('📁 ', '');
  var folderLink = 'https://drive.google.com/drive/folders/' + folderId;
  
  // Проверяем localStorage на этого клиента
  var clients = getCrmClients();
  var found = clients.find(function(c) { return c.folderId === folderId; });
  if (found) {
    if (found.categoryFolderId && typeof setCrmCategorySelectValue === 'function') setCrmCategorySelectValue(found.categoryFolderId);
    else if (typeof setCrmCategoryByFolderId === 'function') setCrmCategoryByFolderId(folderId);
    document.getElementById('company').value = found.company || '';
    document.getElementById('contact_name').value = found.contact_name || '';
    document.getElementById('phone').value = found.phone || '';
    document.getElementById('tg').value = found.telegram || '';
    document.getElementById('avito_account').value = found.avito_account || '';
    document.getElementById('category').value = found.category || '';
    document.getElementById('city').value = found.city || '';
    if (typeof syncGeoFromValue === 'function') syncGeoFromValue();
    document.getElementById('notes').value = found.notes || '';
    document.getElementById('kp_count').value = found.kp_count || '';
    document.getElementById('client_type').value = found.client_type || '';
    document.querySelectorAll('.ctype-btn').forEach(function(b) {
      b.classList.toggle('on', b.textContent.trim() === (found.client_type || ''));
    });
    setActiveClient(found);
  } else {
    if (typeof setCrmCategoryByFolderId === 'function') setCrmCategoryByFolderId(folderId);
    setActiveClient({folderId: folderId, folderLink: folderLink, company: folderName});
  }
  if (_projectFolderBindTargetId) {
    var pd = loadProjectsData();
    var p = pd.projects.find(function(x){ return x.id === _projectFolderBindTargetId; });
    if (p) {
      p.folderId = folderId;
      p.folderLink = folderLink;
      if (found && found.client_id) p.crmClientId = found.client_id;
      p.crmData = p.crmData || {};
      p.crmData.folderId = folderId;
      p.crmData.folderLink = folderLink;
      setCrmCategoryByFolderId(folderId);
      driveGetFolderParent(folderId).then(function(parentId) { if (parentId) { p.categoryFolderId = parentId; saveProjectsData(pd); } }).catch(function(){});
      if (found) {
        p.crmData.client_id = found.client_id || p.crmData.client_id || '';
        if (found.company) p.crmData.company = found.company;
      }
      saveProjectsData(pd);
      syncProjectToActiveSheet(p.id, 'folder_bind_from_crm_popup');
      if (projectsMode) rerenderProjectsPreserveScroll();
      var st = document.getElementById('crmSt');
      if (st) {
        st.style.display = 'block';
        st.className = 'crm-st ok';
        st.textContent = '✓ ' + (p.title || p.id);
      }
    }
    _projectFolderBindTargetId = null;
  }
  closeClientMenu();
}

function loadClient(idx) {
  var c;
  if (idx === -1) {
    c = _activeClient;
  } else {
    var clients = getCrmClients();
    c = clients[idx];
  }
  if (!c) return;
  fillClientForm(c);
  if (idx !== -1) setActiveClient(c);
  document.getElementById('clientMenu').classList.remove('show');
}

async function saveClient() {
  var btn = document.getElementById('saveClientBtn');
  var btnDisc = document.getElementById('crmSaveDriveBtn');
  if (btn) { btn.disabled = true; btn.textContent = '💾 Сохраняю...'; }
  if (btnDisc) btnDisc.disabled = true;
  try {
    if (!_driveToken) throw new Error('Нажмите 🔑 Drive');
    var cityVal = (typeof getGeoValues === 'function' ? getGeoValues().join(', ') : '') || v('city');
    var d = {
      company: v('company'), contact_name: v('contact_name'), phone: v('phone'),
      telegram: v('tg'), avito_account: v('avito_account'), client_type: v('client_type'),
      category: v('category'), city: cityVal, notes: v('notes'),
      positions: getPos().join(', '), kp_count: v('kp_count'),
      createdAt: new Date().toLocaleDateString('ru')
    };
    var clientName = [d.company, d.contact_name].filter(Boolean).join(' - ') || 'Клиент';
    var folderName = clientName + ' (' + d.createdAt + ')';
    var catId = (document.getElementById('crmCategorySelect') || {}).value || '1-nKHmmLp-vY81EK3APxQSg7v8GSO5TJy';
    var catName = (document.getElementById('crmCategorySelect') || {}).options[(document.getElementById('crmCategorySelect') || {}).selectedIndex];
    var cat = { id: catId, name: catName ? catName.text : 'БАЗА' };
    d.categoryFolderId = catId;
    
    var ac = _activeClient || getActiveClient();
    var selectedProject = getSelectedProject();
    var folderId;
    if (ac && ac.folderId) {
      folderId = ac.folderId;
      folderName = ac.folder_name || folderName;
    } else if (selectedProject) {
      folderName = (selectedProject.title || 'Проект') + ' (' + d.createdAt + ')';
      folderId = await driveCreateClientFolder(folderName, catId);
    } else {
      folderId = await driveCreateClientFolder(folderName, catId);
    }
    var folderLink = 'https://drive.google.com/drive/folders/' + folderId;
    
    // contacts.txt
    var lines = ['=== ' + clientName + ' ==='];
    if (d.company) lines.push('Компания: ' + d.company);
    if (d.contact_name) lines.push('Имя: ' + d.contact_name);
    if (d.phone) lines.push('Телефон: ' + d.phone);
    if (d.telegram) lines.push('Телеграм: ' + d.telegram);
    if (d.avito_account) lines.push('Avito: ' + d.avito_account);
    if (d.client_type) lines.push('Тип: ' + d.client_type);
    if (d.category) lines.push('Ниша: ' + d.category);
    if (d.city) lines.push('Гео: ' + d.city);
    if (d.notes) lines.push('УТП/инфо: ' + d.notes);
    if (d.kp_count) lines.push('КП: ' + d.kp_count);
    if (d.positions) lines.push('Позиции: ' + d.positions);
    lines.push('Дата: ' + d.createdAt);
    await driveUploadText('contacts.txt', lines.join('\n'), 'text/plain', folderId);
    
    // Сохраняем в localStorage
    d.folderId = folderId;
    d.folderLink = folderLink;
    d.folder_name = folderName;
    var clients = getCrmClients();
    if (selectedProject) {
      // Строгая привязка: только у выбранного проекта — всегда свой уникальный клиент
      d.client_id = generateClientId();
      clients.unshift(d);
    } else {
      d.client_id = d.client_id || '';
      if (!d.client_id) {
        var active = _activeClient || getActiveClient();
        if (active && active.client_id) d.client_id = active.client_id;
      }
      var existing = findClientIndexByData(clients, d);
      if (!d.client_id && existing >= 0 && clients[existing].client_id) d.client_id = clients[existing].client_id;
      if (!d.client_id) d.client_id = generateClientId();
      if (existing >= 0) {
        if (clients[existing].client_id) d.client_id = clients[existing].client_id;
        clients[existing] = d;
      } else {
        clients.unshift(d);
      }
    }
    saveCrmClients(clients);
    if (selectedProject) {
      setActiveClient(null);
    } else {
      setActiveClient(d);
    }
    var st = document.getElementById('crmSt');
    if (selectedProject) {
      var pd = loadProjectsData();
      var sp = pd.projects.find(function(x){ return x.id === selectedProject.id; });
      if (sp) {
        sp.crmClientId = d.client_id;
        sp.folderId = d.folderId || sp.folderId || '';
        sp.folderLink = d.folderLink || sp.folderLink || '';
        sp.categoryFolderId = catId;
        sp.crmData = makeProjectCrmSnapshot(d);
        saveProjectsData(pd);
        syncProjectToActiveSheet(sp.id, 'crm_save');
        rerenderProjectsPreserveScroll();
        if (st) { var cn = (catName && catName.text ? String(catName.text) : '').replace(/^[^\s]+\s*/, '').trim(); st.style.display = 'block'; st.className = 'crm-st ok'; st.textContent = (cn ? cn + ' ++ ' : '') + (sp.title || sp.id); }
      } else if (st) {
        st.style.display = 'block'; st.className = 'crm-st err'; st.textContent = 'Проект не найден в списке.';
      }
    } else if (st) {
      st.style.display = 'block'; st.className = 'crm-st'; st.textContent = 'Сохранено. Для привязки папки к проекту — выберите проект в списке справа и нажмите 💾';
    }
    try {
      await writeToSheets(d);
      if (st && !selectedProject) { st.style.display = 'none'; st.textContent = ''; }
    } catch (sheetErr) {
      if (st) {
        st.style.display = 'block';
        st.className = 'crm-st err';
        st.textContent = '✗ Таблица: ' + (sheetErr.message || String(sheetErr));
      }
    }
  } catch(e) {
    var st = document.getElementById('crmSt');
    if (st) {
      st.style.display = 'block';
      st.className = 'crm-st err';
      st.textContent = '✗ ' + (e.message || String(e));
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Сохранить'; }
    if (btnDisc) btnDisc.disabled = false;
  }
}

async function writeToSheets(d) {
  var token = _driveToken;
  if (!token) return;
  var row = [
    d.client_id || String(Date.now()),
    d.company || '',
    d.contact_name || '',
    d.telegram || '',
    d.avito_account || '',
    d.phone || '',
    d.client_type || '',
    d.folder_name || '',
    d.folderLink || ''
  ];
  var sheetName = (typeof SHEETS_NAME !== 'undefined' ? SHEETS_NAME : 'Лист1');
  var lookupRange = sheetName + '!A2:F';
  var lookupUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(lookupRange);
  var colAResp = await fetch(lookupUrl, { headers: {'Authorization': 'Bearer ' + token} });
  var targetRow = 0;
  if (colAResp.ok) {
    var colAData = await colAResp.json().catch(function(){ return {}; });
    var vals = colAData.values || [];
    var dCompany = normClientField(d.company);
    var dContact = normClientField(d.contact_name);
    var dPhone = normClientField(d.phone);
    for (var i = 0; i < vals.length; i++) {
      var rid = vals[i] ? String(vals[i][0] || '') : '';
      if (rid && rid === String(d.client_id || '')) { targetRow = i + 2; break; }
      var rCompany = normClientField(vals[i] && vals[i][1]);
      var rContact = normClientField(vals[i] && vals[i][2]);
      var rPhone = normClientField(vals[i] && vals[i][5]);
      if (!targetRow && dCompany && ((dContact && dCompany === rCompany && dContact === rContact) || (dPhone && dCompany === rCompany && dPhone === rPhone))) {
        targetRow = i + 2;
      }
    }
  }
  var resp;
  if (targetRow > 0) {
    var updRange = sheetName + '!A' + targetRow + ':I' + targetRow;
    var updUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(updRange) + '?valueInputOption=USER_ENTERED';
    resp = await fetch(updUrl, {
      method: 'PUT',
      headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify({values: [row]})
    });
  } else {
    var appRange = sheetName + '!A:I';
    var appUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEETS_ID + '/values/' + encodeURIComponent(appRange) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    resp = await fetch(appUrl, {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify({values: [row]})
    });
  }
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return {}; });
    throw new Error('Таблица: ' + (err.error && err.error.message ? err.error.message : resp.status + ' ' + resp.statusText));
  }
}

// ── TEST FILL ──
function fillTest() {
  var tests = [
    {company:'ТестСтрой',name:'Иван',tg:'@teststroy',phone:'+7 999 111 22 33',category:'Пиломатериалы',city:'Москва, Подольск',usp:'Собственное производство, ГОСТ',extra:'',kp:'100',pos:['Доска обрезная 50х100','Брус 150х150']},
    {company:'МебельПро',name:'Алексей',tg:'@mebelpro',phone:'+7 900 222 33 44',category:'Кухни на заказ',city:'Санкт-Петербург',usp:'Замер бесплатно, рассрочка 0%, работаем с 2015',extra:'',kp:'250',pos:['Кухня модульная','Шкаф-купе']},
    {company:'АвтоДеталь',name:'Сергей',tg:'@avtodet',phone:'+7 911 333 44 55',category:'Автозапчасти',city:'Краснодар, Сочи',usp:'Оригинал + аналоги, доставка 1 день',extra:'',kp:'500',pos:['Тормозные колодки','Масляный фильтр','Свечи зажигания']},
  ];
  var t = tests[Math.floor(Math.random() * tests.length)];
  document.getElementById('company').value = t.company;
  document.getElementById('contact_name').value = t.name;
  document.getElementById('tg').value = t.tg;
  document.getElementById('phone').value = t.phone;
  document.getElementById('category').value = t.category;
  document.getElementById('city').value = t.city;
  if (typeof syncGeoFromValue === 'function') syncGeoFromValue();
  document.getElementById('notes').value = t.usp + (t.extra ? ', ' + t.extra : '');
  document.querySelectorAll('.kp-tag').forEach(function(b) { b.classList.remove('on'); });
  var kpBtn = document.querySelector('.kp-tag[data-kp="'+t.kp+'"]');
  if (kpBtn) kpBtn.classList.add('on');
  document.getElementById('kp_count').value = t.kp;
  var list = document.getElementById('posList');
  if (!list) return;
  list.innerHTML = '';
  (t.pos || []).forEach(function(p) {
    var row = document.createElement('div');
    row.className = 'pos-row';
    row.innerHTML = '<input type="text" value="'+p+'" class="pname"><button type="button" class="btn-x" onclick="removePos(this)">×</button>';
    list.appendChild(row);
  });
}

// ── INIT ──
function toggleDayMode() {
  var on = document.body.classList.toggle('day-mode');
  try { localStorage.setItem('avitolog_day_mode', on ? '1' : ''); } catch(e) {}
  var btn = document.getElementById('dayModeToggle');
  if (btn) { btn.textContent = on ? '🌙' : '☀️'; btn.setAttribute('title', on ? 'Ночной режим — тёмный интерфейс' : 'Дневной режим — светлый интерфейс'); }
}
function initDayMode() {
  try {
    var on = localStorage.getItem('avitolog_day_mode') === '1';
    document.body.classList.toggle('day-mode', on);
    var btn = document.getElementById('dayModeToggle');
    if (btn) { btn.textContent = on ? '🌙' : '☀️'; btn.setAttribute('title', on ? 'Ночной режим — тёмный интерфейс' : 'Дневной режим — светлый интерфейс'); }
  } catch(e) {}
}
document.addEventListener('DOMContentLoaded', function() {
  initDayMode();
  updateDriveUI();
  var banner = document.getElementById('githubPagesBanner');
  if (banner && /github\.io$/i.test(window.location.hostname) && !localStorage.getItem('avito_hide_gh_banner')) {
    banner.style.display = 'flex';
  }
  ['company','contact_name','tg','phone'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('name', 'f_' + Math.random().toString(36).slice(2));
  });
  function restoreApiKey() {
    try {
      var saved = localStorage.getItem('avito_api_key');
      if (saved) {
        var ki = document.getElementById('apiKeyInput');
        if (ki && !ki.value) ki.value = saved;
      }
    } catch(e) {}
  }
  window.restoreApiKey = restoreApiKey;
  restoreApiKey();
  setTimeout(restoreApiKey, 500);
  var customKP = [];
  try { customKP = JSON.parse(localStorage.getItem('avito_kp_custom') || '[]') || []; } catch(_) {}
  if (Array.isArray(customKP)) customKP.forEach(function(val) { addKPTag(val); });
  initKP();
  initAC();
  initSecBar();
  var ep = document.getElementById('extraPromptInp');
  if (ep) {
    ep.addEventListener('input', resizeExtraPromptInp);
    ep.addEventListener('keydown', function(e) { if (e.key === 'Backspace' || e.key === 'Delete') setTimeout(resizeExtraPromptInp, 0); });
  }
  applyAnalyticsModeDefault();
  applyTopTabOrder();
  openProjectsTab();
  switchTab('analysis');
  _activeClient = getActiveClient();
  updateClientBadge();
  updateGenButtonState();
  if (_activeClient) loadClient(-1);
  updateProjectsSidebarOffset();
  window.addEventListener('resize', updateProjectsSidebarOffset);
  document.addEventListener('visibilitychange', function() {
    if (!projectsMode) return;
    if (document.hidden) {
      stopProjectsSheetPullTimer();
      stopProjectsDayShiftTimer();
    } else {
      startProjectsSheetPullTimer();
      startProjectsDayShiftTimer();
    }
  });
  document.addEventListener('mouseup', finishCalendarPaint);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      _calendarPaintMode = null;
      _calendarPainting = false;
      _calendarPaintErase = false;
      document.body.classList.remove('calendar-launch-mode');
      document.body.classList.remove('calendar-erase-mode');
      hideProjectsCalMenu();
      document.querySelectorAll('.projects-cal-day.cal-launch-preview, .projects-cal-day.cal-launch-preview-last').forEach(function(el) {
        el.classList.remove('cal-launch-preview', 'cal-launch-preview-last');
      });
    }
  });
  document.addEventListener('click', function(e) {
    var menu = document.getElementById('clientMenu');
    if (menu && menu.classList.contains('show') && !e.target.closest('.client-menu') && !e.target.closest('.crm-row')) {
      menu.classList.remove('show');
    }
  });
  var crmMenu = document.getElementById('clientMenu');
  if (crmMenu) {
    crmMenu.addEventListener('click', function(e) {
      var item = e.target.closest('.client-item[data-folder-id]');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      var id = item.getAttribute('data-folder-id');
      var name = item.getAttribute('data-folder-name') || '';
      if (id) enterFolder(id, name);
    }, true);
  }
});
document.addEventListener('DOMContentLoaded', function() {
  var ci = document.getElementById('chatInp');
  if (ci) ci.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });
});