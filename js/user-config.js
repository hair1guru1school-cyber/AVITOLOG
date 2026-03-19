/**
 * Конфиг профиля данных. Разделение данных идет по Google email.
 * Для совместимости: если email еще неизвестен, используем старый флаг user.
 */
(function() {
  var email = '';
  try {
    email = String(localStorage.getItem('avitolog_drive_email') || '').trim().toLowerCase();
  } catch(e) {}
  var legacyUser = '';
  try {
    legacyUser = String(localStorage.getItem('avitolog_current_user') || '').trim().toLowerCase();
  } catch(e2) {}
  function sanitizeEmailForKey(v) {
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72);
  }
  var suffix = '';
  if (email) {
    suffix = '__acc_' + sanitizeEmailForKey(email);
  } else if (legacyUser === 'sasha') {
    suffix = '_sasha';
  } else if (legacyUser === 'fil') {
    suffix = '';
  }
  window.AVITOLOG_USER = email || legacyUser || 'default';
  window.AVITOLOG_IS_SASHA = (legacyUser === 'sasha');
  window.AVITOLOG_KEY_EMAIL = email || '';
  window.AVITOLOG_KEY_SUFFIX = suffix;
  window.AVITOLOG_KEY = function(baseKey, shared) {
    if (shared) return baseKey;
    return baseKey + (window.AVITOLOG_KEY_SUFFIX || '');
  };
})();
