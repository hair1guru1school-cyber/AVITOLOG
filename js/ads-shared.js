(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AVITOLOG_ADS_SHARED = api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function amount(value) {
    var raw = String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) <= Number.MAX_SAFE_INTEGER ? Number(raw) : null;
  }
  function saleDate(value) {
    var raw = String(value || '').trim(), ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
      var stamp = new Date(raw);
      if (!isNaN(stamp.getTime())) raw = new Date(stamp.getTime() + 3 * 3600000).toISOString().slice(0, 10);
    }
    if (ru) raw = ru[3] + '-' + ru[2].padStart(2, '0') + '-' + ru[1].padStart(2, '0');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    var date = new Date(raw + 'T00:00:00Z'); return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : '';
  }
  function sales(source, range) {
    var rows = Object.create(null), removed = Object.create(null), events = Object.create(null), warnings = [], known = false;
    function warn(message) { if (warnings.indexOf(message) < 0) warnings.push(message); }
    (range.months || []).map(function (month) { return source && source.months && source.months[month]; }).concat(source && source.live).forEach(function (data) {
      if (!data || !Array.isArray(data.projects)) return;
      known = true;
      (data.deletedProjectIds || []).forEach(function (id) { removed[id] = true; });
      data.projects.forEach(function (row) { if (row && row.id) rows[row.id] = row; });
    });
    function rootId(id) {
      var seen = Object.create(null);
      while (rows[id]) {
        if (seen[id]) return '';
        seen[id] = true;
        var parent = rows[id].soldFromId || rows[id].workCopyOfWeekId || rows[id].archiveCopyOfWeekId;
        if (!parent) return id;
        if (removed[parent]) return '';
        id = parent;
      }
      return id;
    }
    Object.keys(rows).forEach(function (id) {
      var row = rows[id]; if (removed[id] || row.stage !== 'sold') return;
      var date = saleDate(row.statusDates && row.statusDates.paid || row.paidDate), root = rootId(id);
      if (!date) { warn('Есть продажи без даты оплаты; они не включены в разбивку.'); return; }
      if (date < range.dateFrom || date > range.today || !root) return;
      var value = amount(row.saleAmount == null || String(row.saleAmount).trim() === '' ? row.mainPrice : row.saleAmount);
      var key = root + '|' + date;
      if (events[key] && events[key].amount !== value) { events[key].amount = null; warn('У копий продажи различаются суммы; разбивка не подменяется оценкой.'); }
      else if (!events[key]) events[key] = { date: date, amount: value };
      if (value === null) warn('Есть продажи без подтверждённой суммы.');
    });
    function total(todayOnly) {
      var list = Object.keys(events).map(function (key) { return events[key]; }).filter(function (event) { return !todayOnly || event.date === range.today; });
      return { amount: !known || list.some(function (event) { return event.amount === null; }) ? null : list.reduce(function (sum, event) { return sum + event.amount; }, 0), count: known ? list.length : null };
    }
    return { today: total(true), month: total(false), warnings: warnings };
  }
  function install(win) {
    var data = null, context = '', running = null;
    function scope() {
      var identity = typeof win.__avitologBackendIdentity === 'function' && win.__avitologBackendIdentity();
      var org = win.AVITOLOG_SUPABASE && win.AVITOLOG_SUPABASE.profileOrganizations && win.AVITOLOG_SUPABASE.profileOrganizations.fil;
      var profile = win.AVITOLOG_KEY_SUFFIX === '_sasha' || win.AVITOLOG_USER === 'sasha' ? 'sasha' : 'fil';
      return identity && identity.id && org ? identity.id + '|' + org + '|' + profile : '';
    }
    function get() { return context === scope() ? data : null; }
    async function load() {
      var expected = scope();
      if (!expected || typeof win.__avitologReadAgencyAds !== 'function') throw new Error('shared_ads_unavailable');
      if (running && context === expected) return running;
      if (context !== expected) { context = expected; data = null; running = null; }
      var task = (async function () {
        var fresh = await win.__avitologReadAgencyAds();
        if (expected !== scope() || context !== expected) throw new Error('context_changed');
        var org = expected.split('|')[1];
        if (!fresh || fresh.version !== 1 || fresh.organizationId !== org || !Array.isArray(fresh.accounts) || !Array.isArray(fresh.statistics) || !Array.isArray(fresh.selectedAccountIds) || !fresh.goals || !fresh.cash || !fresh.sellerGoals) throw new Error('invalid_shared_ads');
        data = fresh; return data;
      })();
      running = task;
      try { return await task; } catch (error) { if (context === expected && (error.status === 401 || error.status === 403 || /forbidden|auth_required|context_changed/.test(error.message))) data = null; throw error; }
      finally { if (running === task) running = null; }
    }
    async function savePreferences(preferences) {
      var expected = scope(), current = get();
      if (!expected || expected.split('|')[2] !== 'fil' || !current || !/^(owner|admin)$/.test(current.role) || !Array.isArray(preferences.selectedAccountIds)) return false;
      if (JSON.stringify(current.selectedAccountIds) === JSON.stringify(preferences.selectedAccountIds) && JSON.stringify(current.sourceMap || {}) === JSON.stringify(preferences.sourceMap || {})) return false;
      await win.__avitologSaveAgencyAdsSettings(preferences.selectedAccountIds, preferences.sourceMap || {});
      if (expected !== scope()) throw new Error('context_changed');
      await load(); return true;
    }
    return { get: get, load: load, savePreferences: savePreferences, sales: sales };
  }
  return { sales: sales, install: install };
});
