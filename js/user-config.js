/**
 * Конфиг профиля данных.
 * В аварийном режиме восстановления приоритет отдаем старым ключам,
 * чтобы поднять все ранее сохраненные значения без миграций.
 */
(function() {
  function sanitizeEmailForKey(email) {
    return String(email || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 72);
  }
  /** Ссылка «войти как Саша»: index.html?u=sasha (или ?profile=sasha). Фил: ?u=fil — сбрасывает закладку профиля.
   *  Добавь &sync=1 — страница автоматически запустит полный синк после загрузки:
   *  index.html?u=sasha&sync=1 */
  var PROFILE_BOOKMARK_KEY = 'avitolog_profile_bookmark';
  var profileFromUrl = '';
  try {
    var sp = new URLSearchParams(window.location.search);
    var uq = (sp.get('u') || sp.get('profile') || '').trim().toLowerCase();
    if (uq === 'sasha' || uq === 's') profileFromUrl = 'sasha';
    else if (uq === 'fil' || uq === 'f') profileFromUrl = 'fil';
    var syncParam = sp.get('sync') || sp.get('autosync') || '';
    if (syncParam === '1' || syncParam === 'true' || syncParam === '') {
      if (sp.has('sync') || sp.has('autosync')) window.AVITOLOG_AUTOSYNC_ON_LOAD = true;
    }
    var needClean = !!(profileFromUrl || window.AVITOLOG_AUTOSYNC_ON_LOAD);
    if (needClean && typeof history !== 'undefined' && history.replaceState) {
      sp.delete('u');
      sp.delete('profile');
      sp.delete('sync');
      sp.delete('autosync');
      var qs = sp.toString();
      var cleanPath = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
      history.replaceState(null, '', cleanPath);
    }
  } catch (eUrl) {}

  var legacyUser = '';
  try {
    legacyUser = String(localStorage.getItem('avitolog_current_user') || '').trim().toLowerCase();
  } catch(e2) {}
  if (profileFromUrl === 'sasha') {
    legacyUser = 'sasha';
    try {
      localStorage.setItem('avitolog_current_user', 'sasha');
      localStorage.setItem(PROFILE_BOOKMARK_KEY, 'sasha');
    } catch (ePb) {}
  } else if (profileFromUrl === 'fil') {
    legacyUser = 'fil';
    try {
      localStorage.setItem('avitolog_current_user', 'fil');
      localStorage.removeItem(PROFILE_BOOKMARK_KEY);
    } catch (ePf) {}
  }
  if (legacyUser !== 'sasha' && legacyUser !== 'fil') {
    legacyUser = 'fil';
    try { localStorage.setItem('avitolog_current_user', legacyUser); } catch(e4) {}
  }
  var email = '';
  try { email = String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase(); } catch(e3) {}

  // Режим «сотрудник» отключён: только переключатель Фил/Саша + ключи *_sasha (см. запрос).
  try {
    if (localStorage.getItem('avitolog_employee_mode_v1') === '1') {
      localStorage.removeItem('avitolog_employee_mode_v1');
      localStorage.removeItem('avitolog_employee_email_override');
    }
  } catch (eClrEmp) {}

  // Автодетект Саши по email — работает на любом устройстве
  var SASHA_KNOWN_EMAIL = 'cyplakovaleksandr153@gmail.com';
  var sashaEmail = SASHA_KNOWN_EMAIL;
  try {
    var storedSasha = String(localStorage.getItem('avitolog_sasha_email') || '').trim().toLowerCase();
    if (storedSasha) sashaEmail = storedSasha;
  } catch (eSasha) {}
  if (sashaEmail && email) {
    if (email === sashaEmail && legacyUser !== 'sasha') {
      legacyUser = 'sasha';
      try { localStorage.setItem('avitolog_current_user', 'sasha'); } catch (eSet) {}
    } else if (email !== sashaEmail && legacyUser === 'sasha') {
      var bookmarkSasha = false;
      try { bookmarkSasha = localStorage.getItem(PROFILE_BOOKMARK_KEY) === 'sasha'; } catch (eBm) {}
      if (!bookmarkSasha) {
        legacyUser = 'fil';
        try { localStorage.setItem('avitolog_current_user', 'fil'); } catch (eReset) {}
      }
    }
  }
  var suffix = '';
  if (legacyUser === 'sasha') {
    suffix = '_sasha';
  }
  window.AVITOLOG_USER = legacyUser || (email ? 'email_user' : 'default');
  /** Данные в пространстве *_sasha (профиль «Саша» в шапке). */
  window.AVITOLOG_IS_SASHA = (suffix === '_sasha');
  /** В шапке «👤 Саша», если выбран профиль Саши. */
  window.AVITOLOG_PROFILE_SASHA = (legacyUser === 'sasha');
  window.AVITOLOG_KEY_EMAIL = email || '';
  window.AVITOLOG_EMPLOYEE_MODE = false;
  window.AVITOLOG_EMPLOYEE_EMAIL = '';
  window.AVITOLOG_EMPLOYEE_KEY_PART = '';
  window.AVITOLOG_KEY_SUFFIX = suffix;
  window.AVITOLOG_KEY = function(baseKey, shared) {
    if (shared) return baseKey;
    return baseKey + (window.AVITOLOG_KEY_SUFFIX || '');
  };

  /** Разово: на устройстве, где в Drive залогинен email Саши, копируем live-данные из ключей без суффикса в *_sasha,
   *  если *_sasha пусты. Иначе у него всё жило в avitolog_goals_v1 / avitolog_clients, а профиль «Саша» и ☁️ читали только *_sasha — «пусто». У Фила (другой email) не выполняется. */
  (function migrateSashaNamespaceFromLegacyIfOwnAccount() {
    try {
      var em = String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase();
      if (!em || em !== sashaEmail) return;
      if (suffix !== '_sasha') return;
      var flag = 'avitolog_migrate_legacy_into_sasha_v2_done';
      if (localStorage.getItem(flag) === '1') return;
      function projectLikeEmpty(sr) {
        if (!sr) return true;
        try {
          var o = JSON.parse(sr);
          return !o || !Array.isArray(o.projects) || o.projects.length === 0;
        } catch (e) { return true; }
      }
      function arrEmpty(sr) {
        if (!sr) return true;
        try {
          var o = JSON.parse(sr);
          return !Array.isArray(o) || o.length === 0;
        } catch (e) { return true; }
      }
      function mergeKey(item) {
        item = item || {};
        var id = String(item.client_id || item.id || item.projectId || item.task_id || '').trim();
        if (id) return 'id:' + id;
        var folder = String(item.folderId || item.folder_id || item.drive_folder_id || item.folderLink || '').trim();
        if (folder) return 'folder:' + folder;
        var parts = [item.company || item.company_name || item.title || item.name || '', item.contact_name || '', item.phone || '', item.telegram || item.tg || '']
          .map(function(x) { return String(x || '').trim().toLowerCase(); })
          .filter(Boolean);
        return parts.length ? ('fields:' + parts.join('|')) : '';
      }
      function mergeArrays(a, b) {
        var out = [];
        var seen = {};
        function add(x) {
          var key = mergeKey(x) || ('anon:' + JSON.stringify(x || {}));
          if (seen[key]) return;
          seen[key] = true;
          out.push(x);
        }
        (Array.isArray(a) ? a : []).forEach(add);
        (Array.isArray(b) ? b : []).forEach(add);
        return out;
      }
      function mergeProjectLike(baseObj, sashaObj) {
        var merged = Object.assign({}, sashaObj || {});
        ['projects', 'hiddenProjects', 'tasks', 'taskLog'].forEach(function(k) {
          merged[k] = mergeArrays((sashaObj && sashaObj[k]) || [], (baseObj && baseObj[k]) || []);
        });
        return merged;
      }
      function mergeLegacyIntoSasha(baseKey, baseRaw, sashaRaw) {
        var baseParsed = safeParse(baseRaw);
        var sashaParsed = safeParse(sashaRaw);
        if (!baseParsed) return sashaRaw;
        if (Array.isArray(baseParsed)) return JSON.stringify(mergeArrays(Array.isArray(sashaParsed) ? sashaParsed : [], baseParsed));
        if (baseKey === 'avitolog_projects' || baseKey === 'avitolog_goals_v1') {
          return JSON.stringify(mergeProjectLike(baseParsed, sashaParsed && typeof sashaParsed === 'object' ? sashaParsed : {}));
        }
        return sashaRaw || baseRaw;
      }
      var pairs = [
        { base: 'avitolog_goals_v1', empty: projectLikeEmpty },
        { base: 'avitolog_projects', empty: projectLikeEmpty },
        { base: 'avitolog_clients', empty: arrEmpty },
        { base: 'crm_tasks_v1', empty: arrEmpty },
        { base: 'avitolog_goal_achievements_v1', empty: arrEmpty },
        { base: 'avitolog_assets_my_v2', empty: arrEmpty },
        { base: 'avitolog_assets_sasha_v2', empty: arrEmpty },
        { base: 'avitolog_assets_base_v2', empty: arrEmpty }
      ];
      pairs.forEach(function(p) {
        try {
          var sk = p.base + '_sasha';
          var br = localStorage.getItem(p.base);
          var sr = localStorage.getItem(sk);
          if (!br) return;
          if (p.empty(br)) return;
          localStorage.setItem(sk, mergeLegacyIntoSasha(p.base, br, sr));
        } catch (eP) {}
      });
      try {
        var acB = localStorage.getItem('avitolog_active_client');
        var acS = localStorage.getItem('avitolog_active_client_sasha');
        if (acB && (!acS || acS === 'null' || acS === '{}')) {
          localStorage.setItem('avitolog_active_client_sasha', acB);
        }
      } catch (eAc) {}
      try { localStorage.setItem(flag, '1'); } catch (eF) {}
    } catch (e) {}
  })();

  // Аварийное восстановление: выбираем самый полный набор из всех вариантов ключа
  function safeParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function getAllCandidateKeys(baseKey) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        // Исключаем месячные снимки (_month_YYYY-MM) — они не должны
        // участвовать в восстановлении live-данных
        if (k.indexOf('_month_') >= 0) continue;
        if (k === baseKey || k.indexOf(baseKey + '_') === 0 || k.indexOf(baseKey + '__') === 0) out.push(k);
      }
    } catch (e) {}
    if (out.indexOf(baseKey) < 0) out.push(baseKey);
    return out;
  }
  /** Кандидаты для recover только внутри текущего профиля — иначе avitolog_projects_sasha перезаписывал Фила. */
  function getRecoverCandidateKeys(baseKey) {
    var targetKey = window.AVITOLOG_KEY(baseKey);
    var suffix = window.AVITOLOG_KEY_SUFFIX || '';
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf('_month_') >= 0) continue;
        if (k.indexOf(baseKey) !== 0) continue;
        var ok = false;
        if (suffix === '') {
          if (k === baseKey + '_sasha' || k.indexOf(baseKey + '_sasha_') === 0) continue;
          if (k.indexOf(baseKey + '__') === 0) continue;
          ok = (k === baseKey || k.indexOf(baseKey + '_') === 0);
        } else if (suffix === '_sasha') {
          ok = (k === baseKey + '_sasha' || k.indexOf(baseKey + '_sasha_') === 0);
        } else {
          ok = (k === targetKey || k.indexOf(targetKey + '_') === 0 || k.indexOf(targetKey + '__') === 0);
        }
        if (ok) out.push(k);
      }
    } catch (e) {}
    if (out.indexOf(targetKey) < 0) out.push(targetKey);
    return out;
  }
  function scoreByBase(baseKey, parsed) {
    if (!parsed) return -1;
    if (baseKey === 'avitolog_projects') {
      var p = Array.isArray(parsed.projects) ? parsed.projects.length : 0;
      var t = Array.isArray(parsed.tasks) ? parsed.tasks.length : 0;
      // Бонус за заполненные cardsActive (количество объявлений)
      var cardsBonus = 0;
      if (Array.isArray(parsed.projects)) {
        parsed.projects.forEach(function(proj) {
          if (proj && proj.cardsActive && String(proj.cardsActive).trim()) cardsBonus += 500;
        });
      }
      return p * 1000 + t + cardsBonus;
    }
    if (baseKey === 'avitolog_goals_v1') {
      return Array.isArray(parsed.projects) ? parsed.projects.length : -1;
    }
    if (baseKey === 'avitolog_clients') {
      return Array.isArray(parsed) ? parsed.length : -1;
    }
    if (baseKey === 'crm_tasks_v1') {
      return Array.isArray(parsed) ? parsed.length : -1;
    }
    if (baseKey === 'avitolog_assets_my_v2' || baseKey === 'avitolog_assets_sasha_v2') {
      if (!Array.isArray(parsed)) return -1;
      var sum = 0;
      parsed.forEach(function(x) {
        var v = parseInt(String((x && (x.paid || x.soldFor || 0)) || 0).replace(/\s/g, ''), 10) || 0;
        sum += Math.max(0, v);
      });
      return sum > 0 ? sum : parsed.length;
    }
    return 0;
  }
  function recoverBaseKey(baseKey) {
    var targetKey = window.AVITOLOG_KEY(baseKey);
    var targetParsed = safeParse(localStorage.getItem(targetKey) || 'null');
    var targetScore = scoreByBase(baseKey, targetParsed);
    if (window.AVITOLOG_BACKEND_MODE && targetScore > 0) return;
    var bestKey = targetKey;
    var bestParsed = targetParsed;
    var bestScore = targetScore;
    getRecoverCandidateKeys(baseKey).forEach(function(k) {
      var parsed = safeParse(localStorage.getItem(k) || 'null');
      var s = scoreByBase(baseKey, parsed);
      if (s > bestScore) {
        bestScore = s;
        bestParsed = parsed;
        bestKey = k;
      }
    });
    if (bestParsed && bestKey !== targetKey && bestScore > 0) {
      try { localStorage.setItem(targetKey, JSON.stringify(bestParsed)); } catch (e2) {}
    }
  }

  function floatMarkerScore(str) {
    var s = String(str || '').trim();
    if (!s) return -1;
    var digits = (s.match(/\d/g) || []).length;
    return s.length * 100 + digits;
  }
  /** Ключи localStorage с JSON { projects: [...] } для текущего профиля (не смешиваем Фила и Сашу). Включает _month_ — только для подтягивания меток. */
  function getProjectsMergeSourceKeys(targetKey) {
    var out = [];
    var seen = {};
    function add(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    }
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('avitolog_projects') !== 0) continue;
        if (targetKey === 'avitolog_projects') {
          if (k === 'avitolog_projects_sasha' || k.indexOf('avitolog_projects_sasha_') === 0) continue;
        } else if (targetKey === 'avitolog_projects_sasha') {
          if (k !== 'avitolog_projects_sasha' && k.indexOf('avitolog_projects_sasha_') !== 0) continue;
        } else if (targetKey && targetKey.indexOf('avitolog_projects') === 0) {
          if (k !== targetKey && k.indexOf(targetKey + '_') !== 0 && k.indexOf(targetKey + '__') !== 0) continue;
        }
        if (/^avitolog_projects_(zoom|day_px|row_height|sticky_width|tasks_sort_v1|sidebar_hidden)$/.test(k)) continue;
        if (k === 'avitolog_projects_path_defaults_off_v1') continue;
        var raw = localStorage.getItem(k);
        if (!raw || raw.charAt(0) !== '{') continue;
        var parsed = safeParse(raw);
        if (!parsed || !Array.isArray(parsed.projects)) continue;
        add(k);
      }
    } catch (e) {}
    add(targetKey);
    return out;
  }
  /** По каждому project.id подтягиваем лучший cardsActive из любого ключа (в т.ч. старые копии и _month_). */
  function mergeProjectsFloatMarkersFromAllCandidates() {
    var baseKey = 'avitolog_projects';
    var targetKey = window.AVITOLOG_KEY(baseKey);
    var base = safeParse(localStorage.getItem(targetKey) || 'null');
    if (!base || !Array.isArray(base.projects)) return;
    var idToBest = {};
    getProjectsMergeSourceKeys(targetKey).forEach(function(k) {
      var parsed = safeParse(localStorage.getItem(k) || 'null');
      if (!parsed || !Array.isArray(parsed.projects)) return;
      parsed.projects.forEach(function(p) {
        if (!p || !p.id) return;
        var ca = String(p.cardsActive || '').trim();
        if (!ca) return;
        var sc = floatMarkerScore(ca);
        var prev = idToBest[p.id];
        if (!prev || sc > prev.caScore) {
          idToBest[p.id] = {
            caScore: sc,
            cardsActive: p.cardsActive,
            cardsActiveDate: String(p.cardsActiveDate || '').trim()
          };
        }
      });
    });
    var changed = false;
    base.projects.forEach(function(p) {
      var best = idToBest[p.id];
      if (!best) return;
      var curSc = floatMarkerScore(p.cardsActive);
      var curCa = String(p.cardsActive || '').trim();
      var curCd = String(p.cardsActiveDate || '').trim();
      if (best.caScore > curSc) {
        p.cardsActive = best.cardsActive;
        if (best.cardsActiveDate) p.cardsActiveDate = best.cardsActiveDate;
        changed = true;
      } else if (curSc >= 0 && best.caScore === curSc && curCa && !curCd && best.cardsActiveDate) {
        p.cardsActiveDate = best.cardsActiveDate;
        changed = true;
      }
    });
    if (changed) {
      try { localStorage.setItem(targetKey, JSON.stringify(base)); } catch (e3) {}
    }
  }

  // Восстановление включено только для безопасных ключей.
  // avitolog_assets_* исключены — там были баги с перезаписью живых данных снимками.
  // Месячные снимки (_month_) уже исключены в getAllCandidateKeys выше.
  try {
    ['avitolog_projects', 'avitolog_goals_v1', 'avitolog_clients', 'crm_tasks_v1'].forEach(recoverBaseKey);
    if (!window.AVITOLOG_BACKEND_MODE) mergeProjectsFloatMarkersFromAllCandidates();
  } catch (e5) {}
  try {
    window.__projectsMergeCardsFromStorageBackups = mergeProjectsFloatMarkersFromAllCandidates;
    /** Ручной разовый перенос «актив карточек» с другого ключа (например если старая копия осталась только там). Только пустые у целевого. */
    window.__projectsSalvageCardsFromStorageKey = function(donorKey) {
      if (!donorKey) return false;
      var targetKey = window.AVITOLOG_KEY('avitolog_projects');
      var base = safeParse(localStorage.getItem(targetKey) || 'null');
      var donor = safeParse(localStorage.getItem(donorKey) || 'null');
      if (!base || !donor || !Array.isArray(base.projects) || !Array.isArray(donor.projects)) return false;
      var byId = {};
      donor.projects.forEach(function(p) { if (p && p.id) byId[p.id] = p; });
      var changed = false;
      base.projects.forEach(function(p) {
        if (!p || !p.id) return;
        if (String(p.cardsActive || '').trim()) return;
        var d = byId[p.id];
        if (d && String(d.cardsActive || '').trim()) {
          p.cardsActive = d.cardsActive;
          if (String(d.cardsActiveDate || '').trim()) p.cardsActiveDate = d.cardsActiveDate;
          changed = true;
        }
      });
      if (changed) try { localStorage.setItem(targetKey, JSON.stringify(base)); } catch (e) {}
      return changed;
    };
  } catch (e6) {}
})();
