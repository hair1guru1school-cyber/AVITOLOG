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
  var legacyUser = '';
  try {
    legacyUser = String(localStorage.getItem('avitolog_current_user') || '').trim().toLowerCase();
  } catch(e2) {}
  if (legacyUser !== 'sasha' && legacyUser !== 'fil') {
    legacyUser = 'fil';
    try { localStorage.setItem('avitolog_current_user', legacyUser); } catch(e4) {}
  }
  var email = '';
  try { email = String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase(); } catch(e3) {}

  var employeeMode = false;
  var employeeEmailOverride = '';
  try { employeeMode = localStorage.getItem('avitolog_employee_mode_v1') === '1'; } catch(e6) {}
  try { employeeEmailOverride = String(localStorage.getItem('avitolog_employee_email_override') || '').trim().toLowerCase(); } catch(e7) {}
  if (employeeMode && !employeeEmailOverride && email) employeeEmailOverride = email;

  // Автодетект Саши по email: если залогиненный email совпадает с сохранённым
  // email'ом Саши — автоматически переключаемся на его пространство данных
  if (!employeeMode) {
    var sashaEmail = '';
    try { sashaEmail = String(localStorage.getItem('avitolog_sasha_email') || '').trim().toLowerCase(); } catch(eSasha) {}
    if (sashaEmail && email) {
      if (email === sashaEmail && legacyUser !== 'sasha') {
        legacyUser = 'sasha';
        try { localStorage.setItem('avitolog_current_user', 'sasha'); } catch(eSet) {}
      } else if (email !== sashaEmail && legacyUser === 'sasha') {
        // Фил зашёл со своего аккаунта — возвращаем его namespace
        legacyUser = 'fil';
        try { localStorage.setItem('avitolog_current_user', 'fil'); } catch(eReset) {}
      }
    }
  }
  var employeeKeyPart = sanitizeEmailForKey(employeeEmailOverride || email);
  var suffix = '';
  if (employeeMode) {
    suffix = employeeKeyPart ? ('__emp_' + employeeKeyPart) : '__emp_default';
  } else if (legacyUser === 'sasha') {
    suffix = '_sasha';
  } else {
    suffix = '';
  }
  window.AVITOLOG_USER = employeeMode ? 'employee' : (legacyUser || (email ? 'email_user' : 'default'));
  window.AVITOLOG_IS_SASHA = (!employeeMode && legacyUser === 'sasha');
  window.AVITOLOG_KEY_EMAIL = email || '';
  window.AVITOLOG_EMPLOYEE_MODE = !!employeeMode;
  window.AVITOLOG_EMPLOYEE_EMAIL = employeeEmailOverride || '';
  window.AVITOLOG_EMPLOYEE_KEY_PART = employeeKeyPart || '';
  window.AVITOLOG_KEY_SUFFIX = suffix;
  window.AVITOLOG_KEY = function(baseKey, shared) {
    if (shared) return baseKey;
    return baseKey + (window.AVITOLOG_KEY_SUFFIX || '');
  };

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
  function scoreByBase(baseKey, parsed) {
    if (!parsed) return -1;
    if (baseKey === 'avitolog_projects') {
      var p = Array.isArray(parsed.projects) ? parsed.projects.length : 0;
      var t = Array.isArray(parsed.tasks) ? parsed.tasks.length : 0;
      return p * 1000 + t;
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
    var bestKey = targetKey;
    var bestParsed = targetParsed;
    var bestScore = targetScore;
    getAllCandidateKeys(baseKey).forEach(function(k) {
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

  // Аварийное восстановление отключено — оно перезаписывало живые данные снимками
  // try {
  //   ['avitolog_projects', 'avitolog_goals_v1', 'avitolog_clients', 'crm_tasks_v1', 'avitolog_assets_my_v2', 'avitolog_assets_sasha_v2'].forEach(recoverBaseKey);
  // } catch (e5) {}
})();
