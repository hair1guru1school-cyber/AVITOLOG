(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) root.ProjectsSharedView = api.install(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var fields = { zoom: ['zoom', .25, 2, 1], rowHeight: ['row_height', 14, 120, 14], dayPx: ['day_px', 14, 64, 28], stickyWidth: ['sticky_width', 0, 2200, 0] };
  function normalize(value) {
    if (!value || value.version !== 1 || value.profile !== 'sasha' || !value.values) return null;
    var values = {};
    for (var name in fields) {
      var n = value.values[name], rule = fields[name];
      if (typeof n !== 'number' || !isFinite(n) || n < rule[1] || n > rule[2]) return null;
      values[name] = n;
    }
    return values;
  }
  function install(win) {
    var timer = null, generation = 0, applied = '', owner = '';
    function key(base) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(base) : base; }
    function scope() {
      if (!win.AVITOLOG_BACKEND_MODE || !win.AVITOLOG_BACKEND_INITIAL_SYNC_READY || key('avitolog_projects') !== 'avitolog_projects_sasha') return '';
      var identity = typeof win.__avitologBackendIdentity === 'function' && win.__avitologBackendIdentity();
      return identity && identity.id ? identity.id + '|sasha' : '';
    }
    function writable() { return !!scope() && win.AVITOLOG_PROFILE_LOCKED === true && !(win.__avitologBackendReadOnly && win.__avitologBackendReadOnly()); }
    function capture() {
      var values = {};
      Object.keys(fields).forEach(function (name) {
        var rule = fields[name], raw = win.localStorage.getItem(key('avitolog_projects_' + rule[0]));
        var n = raw === null || raw === '' ? rule[3] : Number(raw);
        values[name] = isFinite(n) && n >= rule[1] && n <= rule[2] ? n : rule[3];
      });
      return values;
    }
    function reset() {
      generation++; if (timer !== null) win.clearTimeout(timer); timer = null; applied = ''; owner = '';
    }
    function publish() {
      timer = null;
      if (!writable() || typeof win.loadProjectsData !== 'function' || typeof win.saveProjectsData !== 'function') return;
      var expected = scope(), values = capture(), data = win.loadProjectsData();
      if (!data || !Array.isArray(data.projects) || expected !== scope()) return;
      if (JSON.stringify(normalize(data.projectsViewV1)) === JSON.stringify(values)) return;
      var next = Object.assign({}, data, { projectsViewV1: { version: 1, profile: 'sasha', values: values, updatedAt: new Date().toISOString(), updatedBy: expected.split('|')[0] } });
      win.saveProjectsData(next);
      applied = JSON.stringify(values);
    }
    function schedule() {
      if (!writable()) return;
      if (timer !== null) win.clearTimeout(timer);
      var stamp = generation, expected = scope();
      timer = win.setTimeout(function () { if (stamp === generation && expected === scope()) publish(); }, 350);
    }
    function sync() {
      var current = scope();
      if (!current) return;
      if (owner !== current) { reset(); owner = current; }
      if (typeof win.loadProjectsData !== 'function') return;
      var data = win.loadProjectsData(), values = normalize(data && data.projectsViewV1);
      if (!values) { if (writable()) schedule(); return; }
      var signature = JSON.stringify(values);
      if (signature === applied) return;
      var changed = JSON.stringify(capture()) !== signature;
      try {
        Object.keys(fields).forEach(function (name) {
          var storageKey = key('avitolog_projects_' + fields[name][0]);
          if (name === 'stickyWidth' && values[name] === 0) win.localStorage.removeItem(storageKey);
          else win.localStorage.setItem(storageKey, String(values[name]));
        });
      } catch (_) { return; }
      applied = signature;
      if (changed && win.projectsMode && typeof win.rerenderProjectsPreserveScroll === 'function') win.rerenderProjectsPreserveScroll();
    }
    ['saveProjectsZoom', 'setProjectsRowHeightPx', 'saveProjectsDayPx', 'setProjectsStickyWidthPx', 'resetProjectsRowHeight', 'resetProjectsStickyWidthAuto'].forEach(function (name) {
      var original = win[name];
      if (typeof original !== 'function') return;
      win[name] = function () { var result = original.apply(this, arguments); schedule(); return result; };
    });
    win.document.addEventListener('avitolog:workspace-reset', reset);
    win.document.addEventListener('avitolog:backend-initial-ready', sync);
    win.document.addEventListener('avitolog:backend-remote-applied', function (event) { if (event.detail && (event.detail.keys || []).indexOf(key('avitolog_projects')) >= 0) sync(); });
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', sync); else sync();
    return { sync: sync, publish: publish, reset: reset };
  }
  return { normalize: normalize, install: install };
});
