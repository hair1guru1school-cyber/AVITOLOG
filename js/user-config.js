/**
 * Конфиг пользователей. Определяет, чьи данные загружать.
 * ?user=sasha в URL, avitolog_current_user в localStorage, или авто по почте Google при входе.
 * Для Саши: свои projects, CRM, goals, kassa; база общая; tumbler по умолчанию Саша.
 */
(function() {
  var m = (typeof location !== 'undefined' && location.search || '').match(/[?&]user=(sasha|fil)/i);
  var urlUser = m ? m[1].toLowerCase() : null;
  var stored = typeof localStorage !== 'undefined' ? localStorage.getItem('avitolog_current_user') : null;
  var user = urlUser || stored || 'fil';
  if (typeof localStorage !== 'undefined' && user && user !== stored) {
    try { localStorage.setItem('avitolog_current_user', user); } catch(e) {}
  }
  window.AVITOLOG_USER = user;
  window.AVITOLOG_IS_SASHA = (user === 'sasha');
  window.AVITOLOG_KEY_SUFFIX = (user === 'sasha') ? '_sasha' : '';
  window.AVITOLOG_KEY = function(baseKey, shared) {
    if (shared) return baseKey;
    return baseKey + (window.AVITOLOG_KEY_SUFFIX || '');
  };
})();
