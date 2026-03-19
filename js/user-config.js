/**
 * Конфиг профиля данных.
 * В аварийном режиме восстановления приоритет отдаем старым ключам,
 * чтобы поднять все ранее сохраненные значения без миграций.
 */
(function() {
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
  var suffix = '';
  if (legacyUser === 'sasha') {
    suffix = '_sasha';
  } else {
    suffix = '';
  }
  window.AVITOLOG_USER = legacyUser || (email ? 'email_user' : 'default');
  window.AVITOLOG_IS_SASHA = (legacyUser === 'sasha');
  window.AVITOLOG_KEY_EMAIL = email || '';
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

  try {
    ['avitolog_projects', 'avitolog_goals_v1', 'avitolog_clients', 'crm_tasks_v1', 'avitolog_assets_my_v2', 'avitolog_assets_sasha_v2'].forEach(recoverBaseKey);
  } catch (e5) {}
})();
