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
})();
