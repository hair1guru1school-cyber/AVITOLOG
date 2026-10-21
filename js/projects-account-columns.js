(function (root) {
  'use strict';
  var UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  var ACCOUNT = new RegExp('^(personal|oauth):' + UUID + '$', 'i');
  var SCOPE = new RegExp('^' + UUID + '\\|(fil|sasha)\\|' + UUID + '$', 'i');
  var TTL = 120000, STORAGE_KEY = 'avitolog_projects_account_columns_v1:';
  var LABELS = { advance: '\u0410\u0432\u0430\u043d\u0441', contacts: '\u0417\u0430\u044f\u0432\u043a\u0438' };
  var ICONS = { advance: '\ud83d\udc5b', contacts: '\ud83d\udce8' };
  var DEFAULT_WIDTH = 86, MIN_WIDTH = 54, MAX_WIDTH = 260;
  function text(value) { return value == null ? '' : String(value); }
  function sameId(a, b) { return a != null && b != null && text(a) !== '' && text(a) === text(b); }
  function settings(value) { return { advance: !!(value && value.advance === true), contacts: !!(value && value.contacts === true) }; }
  function width(value) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value))) : DEFAULT_WIDTH; }
  function columnWidths(value) { return { advance: width(value && value.advance), contacts: width(value && value.contacts) }; }
  function preferences(value) { return Object.assign(settings(value), { widths: columnWidths(value && value.widths) }); }
  function resizeWidth(initial, delta, scale) { return width(initial + delta / (typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1)); }
  function validScope(value) { return typeof value === 'string' && SCOPE.test(value) ? value.toLowerCase() : ''; }
  function moscowDay(value) {
    var date = new Date(value == null ? Date.now() : value);
    if (!Number.isFinite(date.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var values = {}; parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }
  function linkedClient(project, clients) {
    if (!project) return null;
    var list = Array.isArray(clients) ? clients : [];
    return list.find(function (client) { return client && sameId(client.client_id, project.crmClientId); }) ||
      list.find(function (client) { return client && sameId(client.folderId, project.folderId); }) || null;
  }
  function connection(project, clients) {
    var client = linkedClient(project, clients);
    var merged = Object.assign({}, client || {}, project && project.crmData || {});
    var id = project && project.avitoConnectionId || merged.avito_connection_id || '';
    return typeof id === 'string' && ACCOUNT.test(id) ? id.toLowerCase() : '';
  }
  function catalogIds(list) {
    var ids = new Set();
    (Array.isArray(list) ? list : []).forEach(function (item) { if (item && typeof item.id === 'string' && ACCOUNT.test(item.id)) ids.add(item.id.toLowerCase()); });
    return ids;
  }
  function denied(error) { return /^(auth_required|subject_mismatch|organization_forbidden|account_forbidden|permission_denied|forbidden|account_disconnected|account_changed|reconnect_required|context_changed)$/.test(text(error && (error.code || error.message) || error)); }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function derive(result, day) {
    var data = result && (result.overview || result.snapshot || result) || {};
    var advance = data.advance || {}, today = data.today || {};
    if (denied(data.error)) return { advance: null, contacts: null, denied: true };
    function metric(section, value, isToday) {
      if (denied(section.error) || section.available !== true || !number(value) || isToday && (section.date !== day || value < 0 || !Number.isSafeInteger(value))) return null;
      var stamp = section.fetched_at || data.fetched_at || '';
      if ((section.stale === true || data.stale === true) && moscowDay(stamp) !== day) return null;
      return { value: value, stale: section.stale === true || data.stale === true, fetchedAt: stamp };
    }
    return { advance: metric(advance, advance.balance, false), contacts: metric(today, today.contacts, true), denied: false };
  }
  function format(value, key) { return number(value) ? (key === 'advance' ? Math.round(value).toLocaleString('ru-RU') + ' \u20bd' : value.toLocaleString('ru-RU')) : '\u2014'; }
  function staleMetrics(metrics) {
    var out = { advance: null, contacts: null, denied: false };
    ['advance', 'contacts'].forEach(function (key) { if (metrics && metrics[key]) out[key] = Object.assign({}, metrics[key], { stale: true }); });
    return out;
  }

  /* Only display preferences are durable. Provider responses stay in memory. */
  function preferenceStore(env) {
    var db = null, opening = null;
    function fallback(scope) {
      try {
        var value = JSON.parse(env.localStorage.getItem(STORAGE_KEY + scope) || 'null');
        return value && !Array.isArray(value) && typeof value.advance === 'boolean' && typeof value.contacts === 'boolean' ? preferences(value) : null;
      } catch (_) { return null; }
    }
    function open() {
      if (db) return Promise.resolve(db);
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        var request, done = false;
        var timer = env.setTimeout(function () { finish(new Error('storage_timeout')); }, 2500);
        function finish(error, value) { if (done) { if (value) value.close(); return; } done = true; env.clearTimeout(timer); error ? reject(error) : resolve(value); }
        try {
          if (!env.indexedDB) throw new Error('storage_unavailable');
          request = env.indexedDB.open('avitolog_projects_account_columns_v1', 1);
          request.onupgradeneeded = function () { if (done) { try { request.transaction.abort(); } catch (_) {} return; } if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings'); };
          request.onerror = request.onblocked = function () { finish(new Error('storage_unavailable')); };
          request.onsuccess = function () { var value = request.result; if (done) { value.close(); return; } db = value; value.onversionchange = function () { value.close(); if (db === value) db = null; opening = null; }; finish(null, value); };
        } catch (error) { finish(error); }
      });
      opening = opening.then(function (value) { opening = null; return value; }, function (error) { opening = null; throw error; });
      return opening;
    }
    async function transaction(scope, value, write, guard) {
      var owner = await open();
      if (guard && !guard()) throw new Error('stale_write');
      return new Promise(function (resolve, reject) {
        var tx, result, done = false;
        var timer = env.setTimeout(function () { try { if (tx) tx.abort(); } catch (_) {} finish(new Error('storage_timeout')); }, 2500);
        function finish(error) { if (done) return; done = true; env.clearTimeout(timer); error ? reject(error) : resolve(result); }
        try {
          tx = owner.transaction('settings', write ? 'readwrite' : 'readonly');
          tx.oncomplete = function () { finish(); };
          tx.onabort = tx.onerror = function () { finish(new Error('storage_unavailable')); };
          var store = tx.objectStore('settings');
          if (guard && !guard()) { tx.abort(); return; }
          var request = write ? store.put(preferences(value), scope) : store.get(scope);
          request.onsuccess = function () { result = request.result; };
        } catch (error) { try { if (tx) tx.abort(); } catch (_) {} finish(error); }
      });
    }
    return {
      read: async function (scope) {
        if (!validScope(scope)) throw new Error('invalid_scope');
        var pendingFallback = fallback(scope); if (pendingFallback) return pendingFallback;
        try { var value = await transaction(scope, null, false); var latestFallback = fallback(scope); if (latestFallback) return latestFallback; if (value) return preferences(value); }
        catch (_) { /* A small legacy fallback must not affect CRM storage. */ }
        return fallback(scope) || preferences();
      },
      write: async function (scope, value, guard) {
        if (!validScope(scope)) throw new Error('invalid_scope');
        var key = STORAGE_KEY + scope, previousFallback;
        try { previousFallback = env.localStorage.getItem(key); } catch (_) {}
        try {
          await transaction(scope, value, true, guard);
          if (!guard || guard()) {
            var currentFallback;
            try { currentFallback = env.localStorage.getItem(key); } catch (_) {}
            // Never remove a newer fallback written while this transaction was pending.
            if (typeof previousFallback === 'string' && currentFallback === previousFallback) env.localStorage.removeItem(key);
          }
          return true;
        }
        catch (error) { if (error.message === 'stale_write') throw error; }
        if (guard && !guard()) throw new Error('stale_write');
        env.localStorage.setItem(key, JSON.stringify(preferences(value)));
        return true;
      }
    };
  }

  function createController(env, options) {
    options = options || {};
    var document = env.document, store = options.store || preferenceStore(env), now = options.now || Date.now;
    var scope = '', day = '', epoch = 0, revision = 0, hydrated = false, columns = settings(), widths = columnWidths(), warning = '';
    var catalog = null, catalogTask = null, catalogNext = 0, catalogError = '', entries = new Map(), queue = [], active = 0;
    var frame = null, interval = null, observer = null, observed = null, popover = null, stopped = false;
    var writeQueue = Promise.resolve(), resizing = null;
    function bridge() { return env.AvitoWorkspaceBridge; }
    function context() { try { return validScope(bridge() && bridge().context()); } catch (_) { return ''; } }
    function records() {
      try {
        var data = typeof env.loadProjectsData === 'function' ? env.loadProjectsData() : {};
        return { projects: Array.isArray(data && data.projects) ? data.projects : [], clients: typeof env.getCrmClients === 'function' ? env.getCrmClients() || [] : [] };
      } catch (_) { return { projects: [], clients: [] }; }
    }
    function enabled() { return columns.advance || columns.contacts; }
    function visible() { return options.visible ? options.visible() : !!(document && document.visibilityState !== 'hidden' && document.body.classList.contains('projects-mode') && document.querySelector('#mainContent .projects-table')); }
    function wanted() {
      var data = records(), ids = new Map();
      var rendered = null;
      if (document && !options.render) {
        rendered = new Set();
        document.querySelectorAll('#mainContent .projects-table-row[data-child-line-index="-1"][data-id]').forEach(function (row) { if (!row.hidden && row.style.display !== 'none') rendered.add(row.getAttribute('data-id')); });
      }
      data.projects.forEach(function (project) { if (rendered && !rendered.has(text(project.id))) return; var id = connection(project, data.clients); if (id) { if (!ids.has(id)) ids.set(id, []); ids.get(id).push(text(project.id)); } });
      return ids;
    }
    function currentJob(job) {
      if (job.epoch !== epoch || job.scope !== context() || job.day !== moscowDay(now())) return false;
      var data = records();
      return data.projects.some(function (project) { return job.projects.indexOf(text(project.id)) >= 0 && connection(project, data.clients) === job.id; });
    }
    function schedule() {
      if (stopped || frame != null) return;
      frame = env.setTimeout(function () { frame = null; tick(); }, 25);
    }
    function resetMetrics() { epoch++; entries.clear(); queue = []; catalog = null; catalogTask = null; catalogNext = 0; catalogError = ''; }
    function syncContext() {
      var nextScope = context(), nextDay = moscowDay(now());
      if (nextScope !== scope) {
        endResize(true); resetMetrics(); scope = nextScope; day = nextDay; columns = settings(); widths = columnWidths(); hydrated = false; warning = ''; revision++;
        if (popover) closeMenu();
        if (scope) {
          var owner = scope, requestRevision = revision;
          Promise.resolve().then(function () { return store.read(owner); }).then(function (value) {
            if (scope !== owner || context() !== owner || revision !== requestRevision) return;
            columns = settings(value); widths = columnWidths(value && value.widths); hydrated = true; schedule();
          }).catch(function () { if (scope === owner && revision === requestRevision) { hydrated = true; warning = '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043d\u0435 \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u044b. \u0412\u044b\u0431\u043e\u0440 \u043f\u043e\u043a\u0430 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0439.'; schedule(); } });
        }
      } else if (nextDay !== day) { resetMetrics(); day = nextDay; }
    }
    function setColumns(next) {
      syncContext(); if (!scope) return;
      endResize(true); columns = settings(next); persistPreferences();
      if (!enabled()) { queue = []; entries.forEach(function (entry) { if (entry.queued) entry.pending = entry.queued = false; }); }
      schedule();
    }
    function persistPreferences() {
      hydrated = true; revision++; warning = '';
      var owner = scope, ownerRevision = revision, value = preferences(Object.assign({}, columns, { widths: widths }));
      function guard() { return owner === scope && owner === context() && ownerRevision === revision; }
      writeQueue = writeQueue.catch(function () {}).then(function () { if (guard()) return store.write(owner, value, guard); }).then(function () {
        if (guard()) { warning = ''; schedule(); }
      }).catch(function (error) { if (guard() && error.message !== 'stale_write') { warning = '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438. \u0412\u044b\u0431\u043e\u0440 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043e \u043f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.'; schedule(); } });
      schedule();
    }
    function setColumnWidth(key, value, save) {
      syncContext(); if (!scope || !Object.prototype.hasOwnProperty.call(widths, key)) return;
      widths[key] = width(value);
      if (save !== false) persistPreferences();
      else { hydrated = true; revision++; schedule(); }
    }
    function invalidateAccess() {
      resetMetrics(); catalog = new Set(); catalogNext = now() + TTL; catalogError = 'access_denied';
    }
    function loadCatalog() {
      if (catalogTask || now() < catalogNext || !bridge() || typeof bridge().listAccounts !== 'function') return;
      var owner = scope, ownerEpoch = epoch;
      catalogNext = now() + TTL;
      var task = Promise.resolve().then(function () { return bridge().listAccounts(true); }).then(function (list) {
        if (owner !== context() || ownerEpoch !== epoch) return;
        catalog = catalogIds(list); catalogError = '';
        entries.forEach(function (_, id) { if (!catalog.has(id)) entries.delete(id); });
        queue = queue.filter(function (job) { return catalog.has(job.id); });
      }).catch(function (error) {
        if (owner !== context() || ownerEpoch !== epoch) return;
        if (denied(error)) invalidateAccess();
        else { catalogError = 'unavailable'; entries.forEach(function (entry) { entry.metrics = staleMetrics(entry.metrics); }); }
      }).finally(function () { if (catalogTask === task) catalogTask = null; schedule(); });
      catalogTask = task;
    }
    function requestMetrics() {
      if (!scope || !hydrated || !enabled() || !visible()) return;
      if (!catalog || now() >= catalogNext) { loadCatalog(); return; }
      if (catalogTask || catalogError) return;
      var ids = wanted();
      ids.forEach(function (projects, id) {
        if (!catalog.has(id)) return;
        var entry = entries.get(id);
        if (entry && (entry.pending || now() < entry.nextAt)) return;
        entry = entry || { metrics: null };
        entry.pending = true; entry.queued = true; entry.nextAt = now() + TTL; entries.set(id, entry);
        queue.push({ id: id, projects: projects, scope: scope, day: day, epoch: epoch });
      });
      pump();
    }
    function pump() {
      if (!enabled() || !visible() || !scope || catalogTask || catalogError || !catalog) return;
      var rendered = wanted();
      while (active < 2 && queue.length) {
        var job = queue.shift(), entry = entries.get(job.id);
        var currentProjects = rendered.get(job.id) || [];
        if (!entry || !catalog.has(job.id) || !currentJob(job) || !job.projects.some(function (id) { return currentProjects.indexOf(id) >= 0; })) { if (entry) { entry.pending = entry.queued = false; entry.nextAt = 0; } continue; }
        entry.queued = false; active++; fetchJob(job, entry);
      }
    }
    async function fetchJob(job, entry) {
      try {
        var result = await bridge().getAccountOverview(job.id);
        if (!currentJob(job) || entries.get(job.id) !== entry || !catalog || !catalog.has(job.id)) return;
        var next = derive(result, job.day);
        if (next.denied) { invalidateAccess(); return; }
        ['advance', 'contacts'].forEach(function (key) {
          var data = result && (result.overview || result.snapshot || result) || {}, section = key === 'advance' ? data.advance : data.today;
          if (!next[key] && /^(provider_unavailable|rate_limited|try_later)$/.test(section && section.error || data.error || '') && entry.metrics && entry.metrics[key]) next[key] = Object.assign({}, entry.metrics[key], { stale: true });
        });
        entry.metrics = next; entry.error = '';
      } catch (error) {
        if (!currentJob(job) || entries.get(job.id) !== entry) return;
        if (denied(error)) { invalidateAccess(); return; }
        entry.metrics = staleMetrics(entry.metrics); entry.error = 'unavailable';
      } finally {
        if (entries.get(job.id) === entry && currentJob(job)) entry.nextAt = now() + TTL;
        entry.pending = false; active--; schedule(); pump();
      }
    }
    function element(tag, className, value) { var node = document.createElement(tag); if (className) node.className = className; if (value != null) node.textContent = value; return node; }
    function stop(event) { event.stopPropagation(); }
    function isolate(node) { ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(function (name) { node.addEventListener(name, stop); }); }
    function moveResize(event) {
      var drag = resizing;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.scope !== context() || drag.handle.isConnected === false) { endResize(true); return; }
      event.preventDefault(); event.stopPropagation();
      setColumnWidth(drag.key, resizeWidth(drag.width, event.clientX - drag.x, drag.scale), false);
    }
    function releaseResize(event) {
      if (!resizing || event.pointerId !== resizing.pointerId) return;
      event.preventDefault(); event.stopPropagation(); endResize(event.type !== 'pointerup');
    }
    function cancelResize() { endResize(true); }
    function resizeEscape(event) { if (event.key === 'Escape' && resizing) { event.preventDefault(); event.stopPropagation(); endResize(true); } }
    function endResize(cancelled, discard) {
      var drag = resizing; if (!drag) return;
      resizing = null;
      document.removeEventListener('pointermove', moveResize, true);
      document.removeEventListener('pointerup', releaseResize, true);
      document.removeEventListener('pointercancel', releaseResize, true);
      document.removeEventListener('keydown', resizeEscape, true);
      drag.handle.removeEventListener('lostpointercapture', cancelResize);
      env.removeEventListener('blur', cancelResize);
      try { if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}
      document.body.style.cursor = drag.cursor; document.body.style.userSelect = drag.userSelect;
      if (!discard && drag.scope === scope && drag.scope === context()) {
        if (cancelled) widths[drag.key] = drag.width;
        persistPreferences();
      }
      schedule();
    }
    function beginResize(event, key, handle) {
      if (event.button !== 0 || event.isPrimary === false || !scope) return;
      event.preventDefault(); event.stopPropagation(); endResize(true);
      var cell = handle.parentElement, rect = cell.getBoundingClientRect();
      resizing = { key: key, handle: handle, pointerId: event.pointerId, scope: scope, width: widths[key], x: event.clientX,
        scale: cell.offsetWidth > 0 ? rect.width / cell.offsetWidth : 1, cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', moveResize, true);
      document.addEventListener('pointerup', releaseResize, true);
      document.addEventListener('pointercancel', releaseResize, true);
      document.addEventListener('keydown', resizeEscape, true);
      handle.addEventListener('lostpointercapture', cancelResize); env.addEventListener('blur', cancelResize);
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    }
    function resizeHandle(key) {
      var owner = scope;
      function owned() { return owner && owner === scope && owner === context(); }
      var handle = element('span', 'projects-account-resize'); handle.tabIndex = 0;
      handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', '\u0428\u0438\u0440\u0438\u043d\u0430 \u0441\u0442\u043e\u043b\u0431\u0446\u0430 ' + LABELS[key]);
      handle.setAttribute('aria-valuemin', String(MIN_WIDTH)); handle.setAttribute('aria-valuemax', String(MAX_WIDTH)); handle.setAttribute('aria-valuenow', String(widths[key]));
      handle.setAttribute('data-projects-column-resize', key);
      handle.title = '\u041f\u043e\u0442\u044f\u043d\u0438\u0442\u0435 \u0433\u0440\u0430\u043d\u0438\u0446\u0443. \u0421\u0442\u0440\u0435\u043b\u043a\u0438: \u0448\u0438\u0440\u0438\u043d\u0430. \u0414\u0432\u043e\u0439\u043d\u043e\u0439 \u0449\u0435\u043b\u0447\u043e\u043a: \u0441\u0431\u0440\u043e\u0441.';
      handle.addEventListener('pointerdown', function (event) { if (owned()) beginResize(event, key, handle); else { event.preventDefault(); event.stopPropagation(); } });
      ['mousedown', 'click'].forEach(function (name) { handle.addEventListener(name, function (event) { event.preventDefault(); event.stopPropagation(); }); });
      handle.addEventListener('dblclick', function (event) { event.preventDefault(); event.stopPropagation(); if (owned()) setColumnWidth(key, DEFAULT_WIDTH); });
      handle.addEventListener('keydown', function (event) {
        if (!owned()) return;
        var next = event.key === 'ArrowLeft' ? widths[key] - (event.shiftKey ? 16 : 8) : event.key === 'ArrowRight' ? widths[key] + (event.shiftKey ? 16 : 8) : event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? MAX_WIDTH : null;
        if (next !== null) { event.preventDefault(); event.stopPropagation(); setColumnWidth(key, next); }
      });
      return handle;
    }
    function place(row, column) {
      var sticky = Array.from(row.children).find(function (node) { return node.classList.contains('projects-sticky'); });
      var scroll = Array.from(row.children).find(function (node) { return node.classList.contains('projects-scroll'); });
      if (!sticky || !scroll) return false;
      if (column.parentNode !== row || column.nextElementSibling !== scroll) row.insertBefore(column, scroll);
      return true;
    }
    function titleFor(id, metric, entry) {
      if (!id) return '\u041f\u0440\u0438\u0432\u044f\u0436\u0438\u0442\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442 Avito \u0432 \u043a\u0430\u0440\u0442\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430.';
      if (!scope) return '\u041d\u0443\u0436\u0435\u043d \u0432\u0445\u043e\u0434 \u0432 \u0410\u043a\u043a\u0430\u0443\u043d\u0442\u044b Avito.';
      if (!catalog) return '\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0443.';
      if (!catalog.has(id)) return '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0432 \u044d\u0442\u043e\u0439 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438.';
      var info = metric && metric.stale ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435; \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e.' : metric ? '\u0414\u0430\u043d\u043d\u044b\u0435 API Avito.' : entry && entry.pending ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0434\u0430\u043d\u043d\u044b\u0435 API.' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c API \u043d\u0435 \u043f\u043e\u043b\u0443\u0447\u0435\u043d.';
      if (metric && metric.fetchedAt && Number.isFinite(new Date(metric.fetchedAt).getTime())) info += ' ' + new Date(metric.fetchedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' \u041c\u0421\u041a.';
      return info;
    }
    function renderRows(main) {
      var keys = ['advance', 'contacts'].filter(function (key) { return columns[key]; });
      if (!keys.length) { main.querySelectorAll('.projects-account-columns').forEach(function (column) { column.remove(); }); return; }
      var rows = main.querySelectorAll('.projects-table-row'); if (!rows.length) return;
      var data = records(), projects = new Map(); data.projects.forEach(function (project) { projects.set(text(project.id), project); });
      rows.forEach(function (row) {
        var column = Array.from(row.children).find(function (node) { return node.classList.contains('projects-account-columns'); });
        if (!keys.length) { if (column) column.remove(); return; }
        if (!column) { column = element('div', 'projects-account-columns'); isolate(column); }
        if (!place(row, column)) return;
        column.style.width = keys.reduce(function (total, key) { return total + widths[key]; }, 0) + 'px';
        column.style.gridTemplateColumns = keys.map(function (key) { return widths[key] + 'px'; }).join(' ');
        column.querySelectorAll('[data-projects-column-resize]').forEach(function (handle) { handle.setAttribute('aria-valuenow', String(widths[handle.getAttribute('data-projects-column-resize')])); });
        var header = row.classList.contains('projects-table-header'), primary = row.getAttribute('data-child-line-index') === '-1';
        var project = primary ? projects.get(row.getAttribute('data-id')) : null;
        var id = connection(project, data.clients), entry = id && entries.get(id), metrics = entry && entry.metrics;
        var signature = header ? JSON.stringify([keys, 'header', scope]) : JSON.stringify([keys, primary, id, scope, day, catalog && catalog.has(id), catalogError, entry && entry.pending,
          keys.map(function (key) { return metrics && metrics[key]; })]);
        if (column._pacSignature === signature) return;
        column._pacSignature = signature; column.replaceChildren();
        keys.forEach(function (key) {
          var metric = catalog && catalog.has(id) && metrics && metrics[key];
          var cell = element('span', 'projects-account-value projects-account-' + key, header ? null : primary ? format(metric && metric.value, key) : '');
          if (header) {
            cell.classList.add('projects-account-label'); cell.setAttribute('aria-label', LABELS[key]);
            cell.title = key === 'contacts' ? '\u0417\u0430\u044f\u0432\u043a\u0438: \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b Avito \u0437\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f (\u041c\u0421\u041a)' : LABELS[key];
            var icon = element('span', 'projects-account-heading-icon', ICONS[key]); icon.setAttribute('aria-hidden', 'true'); cell.appendChild(icon);
            cell.appendChild(element('span', key === 'advance' ? 'projects-account-sr' : '', LABELS[key]));
            cell.appendChild(resizeHandle(key));
          }
          else if (primary) { cell.title = LABELS[key] + ': ' + titleFor(id, metric, entry); cell.dataset.stale = metric && metric.stale ? 'true' : 'false'; }
          column.appendChild(cell);
        });
      });
    }
    function closeMenu() { if (popover) popover.remove(); popover = null; var gear = document && document.getElementById('projectsAccountColumnsGear'); if (gear) gear.setAttribute('aria-expanded', 'false'); }
    function menuPosition() {
      var gear = document.getElementById('projectsAccountColumnsGear'); if (!popover || !gear) return;
      var rect = gear.getBoundingClientRect(), height = popover.getBoundingClientRect().height;
      popover.style.left = Math.max(8, Math.min(rect.right - 266, env.innerWidth - 274)) + 'px';
      popover.style.top = Math.max(8, Math.min(rect.bottom + 5, env.innerHeight - height - 8)) + 'px';
    }
    function openMenu(event) {
      event.stopPropagation(); if (popover) { closeMenu(); return; }
      var owner = scope;
      popover = element('div', 'projects-account-settings'); popover.setAttribute('role', 'group'); popover.setAttribute('aria-label', '\u0421\u0442\u043e\u043b\u0431\u0446\u044b Avito'); isolate(popover);
      popover.appendChild(element('strong', '', '\u0421\u0442\u043e\u043b\u0431\u0446\u044b Avito'));
      ['advance', 'contacts'].forEach(function (key) {
        var label = element('label'), input = element('input'); input.type = 'checkbox'; input.checked = columns[key]; input.disabled = !scope;
        input.setAttribute('data-projects-account-setting', key); input.addEventListener('change', function () { if (owner !== scope || owner !== context()) return; var next = settings(columns); next[key] = input.checked; setColumns(next); });
        label.appendChild(input); label.appendChild(element('span', '', LABELS[key])); popover.appendChild(label);
      });
      var status = element('p', 'projects-account-settings-status'); status.setAttribute('role', 'status'); popover.appendChild(status);
      document.body.appendChild(popover); updateMenu(); menuPosition();
      document.getElementById('projectsAccountColumnsGear').setAttribute('aria-expanded', 'true');
      var firstInput = popover.querySelector('input:not(:disabled)'); if (firstInput) firstInput.focus();
    }
    function updateMenu() {
      if (!popover) return;
      popover.querySelectorAll('input').forEach(function (input) { input.checked = columns[input.getAttribute('data-projects-account-setting')]; input.disabled = !scope; });
      var status = popover.querySelector('.projects-account-settings-status');
      var value = warning || (!scope ? '\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0443, \u0447\u0442\u043e\u0431\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432\u044b\u0431\u043e\u0440.' : '\u0414\u0430\u043d\u043d\u044b\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u044f\u0432\u043d\u043e \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d\u043d\u044b\u0445 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u043e\u0432. \u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u0432 \u0444\u043e\u043d\u0435.');
      if (status.textContent !== value) status.textContent = value; status.dataset.warning = warning ? 'true' : 'false'; menuPosition();
    }
    function render() {
      if (options.render) { options.render(); return; }
      if (!document) return;
      var main = document.getElementById('mainContent'); if (!main) return;
      if (observer) observer.disconnect();
      try {
        var tabs = main.querySelector('.projects-zone-tabs-top');
        if (tabs && !tabs.querySelector('#projectsAccountColumnsGear')) {
          var gear = element('button', 'projects-account-gear', '\u2699'); gear.id = 'projectsAccountColumnsGear'; gear.type = 'button'; gear.title = '\u0421\u0442\u043e\u043b\u0431\u0446\u044b Avito'; gear.setAttribute('aria-label', gear.title); gear.setAttribute('aria-expanded', 'false');
          isolate(gear); gear.addEventListener('click', openMenu); tabs.appendChild(gear);
        }
        var currentGear = document.getElementById('projectsAccountColumnsGear'); if (currentGear) currentGear.title = warning || '\u0421\u0442\u043e\u043b\u0431\u0446\u044b Avito';
        if (resizing && (!visible() || resizing.handle.isConnected === false)) endResize(true);
        renderRows(main); if (!visible()) closeMenu(); else updateMenu();
      } finally { if (observer) { observed = main; observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id', 'data-child-line-index'] }); } }
    }
    function tick() { if (stopped) return; syncContext(); requestMetrics(); render(); }
    function reset() { endResize(true); resetMetrics(); schedule(); }
    function outside(event) { if (popover && !popover.contains(event.target) && !(event.target.closest && event.target.closest('#projectsAccountColumnsGear'))) closeMenu(); }
    function escapeMenu(event) { if (event.key === 'Escape' && popover) { closeMenu(); var gear = document.getElementById('projectsAccountColumnsGear'); if (gear) gear.focus(); } }
    function start() {
      if (document) {
        addStyle(); if (env.MutationObserver) observer = new env.MutationObserver(schedule);
        document.addEventListener('avitolog:workspace-reset', reset); document.addEventListener('visibilitychange', schedule); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escapeMenu);
        env.addEventListener('resize', menuPosition); env.addEventListener('scroll', menuPosition, true);
      }
      tick(); interval = env.setInterval(tick, 1500);
    }
    function stopAll() {
      endResize(true, true); stopped = true; epoch++; env.clearTimeout(frame); env.clearInterval(interval); if (observer) observer.disconnect(); closeMenu();
      if (document) { document.removeEventListener('avitolog:workspace-reset', reset); document.removeEventListener('visibilitychange', schedule); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escapeMenu); env.removeEventListener('resize', menuPosition); env.removeEventListener('scroll', menuPosition, true); }
    }
    function addStyle() {
      if (document.getElementById('projectsAccountColumnsStyle')) return;
      var style = element('style'); style.id = 'projectsAccountColumnsStyle';
      style.textContent = '.projects-account-gear{width:32px;min-width:32px;height:32px;margin-left:auto;border:1px solid var(--border,#304156);border-radius:8px;background:var(--surface2,#142033);color:var(--text,#eaf4ff);cursor:pointer;font:inherit;font-size:18px;font-weight:700;line-height:1;align-self:center}.projects-account-gear:hover{border-color:var(--accent,#00d97e)}' +
        '.projects-account-columns{display:grid;position:sticky;left:var(--projects-sticky-width,360px);z-index:3;flex:none;align-self:stretch;background:#101823;border-right:1px solid var(--border,#29384b);box-shadow:3px 0 6px rgba(0,0,0,.08);box-sizing:border-box}.projects-table-header .projects-account-columns{background:#111d2c}.projects-account-value{display:flex;align-items:center;justify-content:center;min-width:0;padding:1px 4px;border-left:1px solid rgba(150,180,220,.1);font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c9f7e0}.projects-account-contacts{color:#c4e8ff}.projects-account-label{font-size:10px;white-space:normal;text-align:center;line-height:1.15;color:#a5bad1}.projects-account-value[data-stale="true"]{color:#e5bd78}' +
        '.projects-account-value:not(.projects-account-label){font-size:15px;line-height:1;min-height:0}.projects-account-label{position:relative;flex-direction:column;gap:4px;overflow:visible;padding:4px 9px 4px 4px}.projects-account-heading-icon{font-size:19px;line-height:1}.projects-account-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.projects-account-resize{position:absolute;right:0;top:0;bottom:0;width:8px;cursor:col-resize;touch-action:none;user-select:none}.projects-account-resize::after{content:"";position:absolute;top:22%;bottom:22%;right:2px;width:2px;border-radius:2px;background:#5b8498;opacity:.6}.projects-account-resize:hover,.projects-account-resize:focus-visible{background:#4ec0e92b;outline:1px solid var(--accent,#00d97e);outline-offset:-1px}.projects-account-resize:hover::after,.projects-account-resize:focus-visible::after{opacity:1}' +
        '.projects-account-settings{position:fixed;z-index:15000;width:266px;padding:13px;border:1px solid var(--border,#304156);border-radius:12px;background:#111b28;color:#eaf4ff;box-shadow:0 12px 36px rgba(0,0,0,.35);font:12px/1.45 "Golos Text",sans-serif}.projects-account-settings strong{display:block;margin-bottom:8px}.projects-account-settings label{display:flex;align-items:center;gap:8px;padding:7px 3px;cursor:pointer}.projects-account-settings input{width:16px;height:16px;accent-color:var(--accent,#00d97e)}.projects-account-settings-status{margin:8px 0 0;font-size:10px;color:#9bb1c9}.projects-account-settings-status[data-warning="true"]{color:#ffc2c9}' +
        'body.day-mode .projects-account-columns,body.day-mode .projects-table-header .projects-account-columns{background:#f3f7fb;border-color:#cbd5e1}body.day-mode .projects-account-value{color:#08784f;border-color:#dce5ee}body.day-mode .projects-account-contacts{color:#12689a}body.day-mode .projects-account-label{color:#526277}body.day-mode .projects-account-value[data-stale="true"]{color:#86560a}body.day-mode .projects-account-settings{background:#fff;color:#182638;border-color:#cbd5e1;box-shadow:0 12px 36px rgba(28,48,75,.16)}body.day-mode .projects-account-settings-status{color:#526277}body.day-mode .projects-account-settings-status[data-warning="true"]{color:#b12d41}';
      document.head.appendChild(style);
    }
    return { start: start, stop: stopAll, tick: tick, setColumns: setColumns, setColumnWidth: setColumnWidth, reset: reset, flush: function () { return writeQueue; },
      inspect: function () { return { scope: scope, day: day, columns: settings(columns), widths: columnWidths(widths), hydrated: hydrated, warning: warning, active: active, queued: queue.length, catalog: catalog && Array.from(catalog), entries: Array.from(entries, function (pair) { return [pair[0], { metrics: pair[1].metrics, pending: pair[1].pending, nextAt: pair[1].nextAt }]; }) }; }, place: place, renderRows: renderRows };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { settings: settings, preferences: preferences, columnWidths: columnWidths, resizeWidth: resizeWidth, validScope: validScope, moscowDay: moscowDay, linkedClient: linkedClient, connection: connection, catalogIds: catalogIds, derive: derive, denied: denied, format: format, preferenceStore: preferenceStore, createController: createController, TTL: TTL };
  else if (root.document && !root.ProjectsAccountColumns) {
    var controller = createController(root);
    root.ProjectsAccountColumns = Object.freeze({ refresh: function () { controller.reset(); controller.tick(); } });
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', controller.start, { once: true }); else controller.start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
