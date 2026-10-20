(function (root, factory) {
  'use strict';
  var library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  else if (root && root.document) root.ProjectPaymentJournal = library.install(root);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var FORMAT = 'avitolog-project-payments-v1';
  var FILE_NAME = 'AVITOBOSS-payments.json';
  var OWNER_ID = 'aa63f3cd-73bc-40c0-9b5f-ce62f3d28e49';
  var PREPARED = {};
  function text(value) { return String(value == null ? '' : value).trim(); }
  function firstValue(values) { for (var i = 0; i < values.length; i++) if (text(values[i])) return values[i]; return ''; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function date(value) {
    var raw = text(value), match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (!match) {
      var local = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (local) match = [local[0], local[3], local[2], local[1]];
    }
    if (!match) return '';
    var day = match[1] + '-' + match[2] + '-' + match[3];
    var parsed = new Date(day + 'T00:00:00Z');
    return isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
  }
  function money(value) {
    var raw = text(value).replace(/[\s\u00a0\u202f]/g, '').replace(/(?:руб\.?|₽)$/i, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    var amount = Number(raw);
    return isFinite(amount) && amount > 0 && Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) / 100 : null;
  }
  function folderId(value) {
    var raw = text(value);
    if (!raw) return '';
    if (/^[a-zA-Z0-9_-]{1,200}$/.test(raw)) return raw;
    if (!/^https:\/\/drive\.google\.com(?::443)?\//i.test(raw)) return '';
    try {
      var url = new URL(raw);
      if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return '';
      var match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{1,200})\/?$/);
      return match ? match[1] : '';
    } catch (error) { return ''; }
  }
  function references(item, kind) {
    item = item || {};
    var result = [];
    function add(type, value) {
      var id = text(value).slice(0, 200);
      if (id && result.indexOf(type + ':' + id) < 0) result.push(type + ':' + id);
    }
    add('folder', folderId(item.folderId) || folderId(item.folderLink) || folderId(item.folderUrl));
    add('project', item.projectId);
    add('goal', firstValue([item.goalsSourceId, item.goalProjectId]));
    add('client', firstValue([item.client_id, item.clientId, item.crmClientRecordId]));
    if (text(item.crmClientId)) { add('client', item.crmClientId); add('folder', folderId(item.crmClientId)); }
    if (kind === 'goal') add('goal', item.id);
    if (kind === 'project') add('project', item.id);
    if (item.crmData && typeof item.crmData === 'object') {
      references(item.crmData, 'client').forEach(function (ref) { if (result.indexOf(ref) < 0) result.push(ref); });
    }
    return result;
  }
  function intersects(a, b) { return a.some(function (item) { return b.indexOf(item) >= 0; }); }
  function referenceIdentity(refs) {
    var folder = '', client = '', other = '';
    refs.forEach(function (ref) {
      if (!other || ref < other) other = ref;
      if (ref.indexOf('folder:') === 0 && (!folder || ref < folder)) folder = ref;
      if (ref.indexOf('client:') === 0 && (!client || ref < client)) client = ref;
    });
    return folder || client || other;
  }
  function prepareSources(sources) {
    if (sources && sources.prepared === PREPARED) return sources;
    sources = sources || {};
    var graph = new Map(), components = new Map(), order = 0;
    function relative(item, kind, key) {
      if (!item || typeof item !== 'object') return;
      var node = { item: item, kind: kind, refs: references(item, kind), key: text(key), order: order++ };
      node.refs.forEach(function (ref) {
        var nodes = graph.get(ref);
        if (!nodes) graph.set(ref, nodes = []);
        nodes.push(node);
      });
    }
    list(sources.clients).forEach(function (item) { relative(item, 'client'); });
    list(sources.projects).forEach(function (item) { relative(item, 'project'); });
    list(sources.goals).forEach(function (pack) {
      list(pack.projects).forEach(function (item) { relative(item, 'goal', pack.key); });
    });
    // Build explicit-link components once for this immutable read snapshot.
    // Cash rows attach to components but do not join otherwise unrelated clients.
    graph.forEach(function (nodes, seed) {
      if (components.has(seed)) return;
      var component = { refs: [], cash: [], goals: [], identity: '' }, queue = [seed], seenNodes = new Set();
      components.set(seed, component);
      for (var cursor = 0; cursor < queue.length; cursor++) {
        var ref = queue[cursor]; component.refs.push(ref);
        list(graph.get(ref)).forEach(function (node) {
          if (seenNodes.has(node)) return;
          seenNodes.add(node);
          if (node.kind === 'goal') component.goals.push(node);
          node.refs.forEach(function (next) { if (!components.has(next)) { components.set(next, component); queue.push(next); } });
        });
      }
      component.identity = referenceIdentity(component.refs);
      component.goals.sort(function (a, b) { return a.order - b.order; });
    });
    list(sources.cash).forEach(function (pack) {
      list(pack.rows).forEach(function (item, index) {
        if (!item || typeof item !== 'object') return;
        var node = { item: item, key: text(pack.key), column: pack.column, index: index, order: order++ }, attached = new Set();
        references(item, 'cash').forEach(function (ref) {
          var component = components.get(ref);
          if (!component) { component = { refs: [ref], cash: [], goals: [], identity: ref }; components.set(ref, component); }
          if (!attached.has(component)) { attached.add(component); component.cash.push(node); }
        });
      });
    });
    return { prepared: PREPARED, components: components };
  }
  function targetSources(target, index) {
    var refs = references(target, target && (Array.isArray(target.status) || target.stage) ? 'goal' : 'project');
    var components = new Set(), unknown = [];
    refs.forEach(function (ref) { var component = index.components.get(ref); if (component) components.add(component); else unknown.push(ref); });
    if (components.size === 1 && !unknown.length) return components.values().next().value;
    var joinedRefs = new Set(unknown), cash = new Set(), goals = new Set();
    components.forEach(function (component) {
      component.refs.forEach(function (ref) { joinedRefs.add(ref); });
      component.cash.forEach(function (node) { cash.add(node); });
      component.goals.forEach(function (node) { goals.add(node); });
    });
    return { identity: referenceIdentity(Array.from(joinedRefs)), cash: Array.from(cash).sort(function (a, b) { return a.order - b.order; }), goals: Array.from(goals).sort(function (a, b) { return a.order - b.order; }) };
  }
  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var paidDate = date(entry.date), amount = money(entry.amount), id = text(entry.id);
    if (!paidDate || !amount || !id || id.length > 1400) return null;
    return {
      id: id, date: paidDate, amount: amount, currency: 'RUB',
      source: entry.source === 'crm' ? 'crm' : entry.source === 'cash' ? 'cash' : 'journal',
      sources: list(entry.sources).filter(function (source) { return source === 'cash' || source === 'crm'; }).filter(function (source, i, arr) { return arr.indexOf(source) === i; }),
      evidence: list(entry.evidence).filter(function (ref) { return typeof ref === 'string' && ref.length <= 1000; }).slice(0, 50)
    };
  }
  function derive(target, sources) {
    var matched = targetSources(target, prepareSources(sources)), entries = {}, observed = [], cashGoals = {};
    var identity = matched.identity;
    if (!identity) return { entries: [], observed: [] };
    function add(source, paidDate, amount, occurrence, evidence, paymentId) {
      paidDate = date(paidDate); amount = money(amount);
      if (!paidDate || !amount) return;
      var id = 'pj1:' + encodeURIComponent(identity) + '|' + (text(paymentId)
        ? 'id:' + encodeURIComponent(text(paymentId).slice(0, 200))
        : paidDate + '|' + Math.round(amount * 100) + '|' + occurrence);
      var entry = entries[id];
      if (!entry) entry = entries[id] = { id: id, date: paidDate, amount: amount, currency: 'RUB', source: source, sources: [], evidence: [] };
      if (source === 'cash') entry.source = source;
      if (entry.sources.indexOf(source) < 0) entry.sources.push(source);
      if (entry.evidence.indexOf(evidence) < 0) entry.evidence.push(evidence);
    }
    matched.cash.forEach(function (node) {
        var row = node.item;
        var sourceRef = 'cash:' + node.key + '#' + encodeURIComponent(text(firstValue([row.id, row.paymentId, row.goalProjectId, row.crmClientId, row.folderId])) || String(node.index));
        observed.push(sourceRef);
        var payments = Array.isArray(row.paymentHistory) && row.paymentHistory.length
          ? row.paymentHistory : [{ date: row.paymentDate, amount: node.column === 'agency' ? row.soldFor : row.paid }];
        var occurrences = {}, valid = false;
        payments.forEach(function (payment) {
          var paidDate = date(payment && payment.date), amount = money(payment && payment.amount);
          if (!paidDate || !amount) return;
          var occurrenceKey = paidDate + '|' + amount;
          occurrences[occurrenceKey] = (occurrences[occurrenceKey] || 0) + 1;
          add('cash', paidDate, amount, occurrences[occurrenceKey], sourceRef, payment && firstValue([payment.id, payment.paymentId, payment.transactionId]));
          valid = true;
        });
        if (valid && text(row.goalProjectId)) cashGoals[text(row.goalProjectId)] = true;
    });
    matched.goals.forEach(function (node) {
        var goal = node.item;
        var sourceRef = 'crm:' + node.key + '#' + encodeURIComponent(text(goal.id));
        observed.push(sourceRef);
        var paid = list(goal.status).some(function (status) { return status === 'paid' || status === 'oplacheno'; });
        var paidDate = date(goal.statusDates && (goal.statusDates.paid || goal.statusDates.oplacheno)) || date(goal.paymentDate) || date(goal.paidAt);
        // Cash is authoritative when CRM already generated that cash row.
        if (cashGoals[text(goal.id)] || (!paid && goal.stage !== 'sold')) return;
        add('crm', paidDate, firstValue([goal.saleAmount, goal.mainPrice]), 1, sourceRef, firstValue([goal.paymentId, goal.transactionId]));
    });
    return { entries: Object.keys(entries).map(function (id) { return entries[id]; }), observed: observed };
  }
  function mergeEntries(current, saved, observed) {
    var result = {}, live = list(current).map(normalizeEntry).filter(Boolean);
    list(saved).map(normalizeEntry).filter(Boolean).forEach(function (entry) {
      // An edited source replaces its previous projection; disappearing sources
      // remain recorded instead of silently erasing the payment history.
      if (!intersects(entry.evidence, list(observed))) {
        entry.evidence = entry.evidence.map(function (ref) { return ref.indexOf('retired:') === 0 ? ref : 'retired:' + ref; });
        result[entry.id] = entry;
      }
    });
    live.forEach(function (entry) {
      var existing = result[entry.id];
      if (existing) {
        entry.sources = existing.sources.concat(entry.sources).filter(function (value, i, arr) { return arr.indexOf(value) === i; });
        entry.evidence = existing.evidence.concat(entry.evidence).filter(function (value, i, arr) { return arr.indexOf(value) === i; });
      }
      result[entry.id] = entry;
    });
    return Object.keys(result).map(function (id) { return result[id]; }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.id.localeCompare(b.id); });
  }
  function install(win) {
    var doc = win.document, timer = null, timerContext = '', scheduledSyncFiles = false, busy = false, again = false;
    var pendingFiles = {}, fileJobs = {}, fileRetries = {}, fileDrainRunning = false, knownSourceKeys = {};
    function profile() { return win.AVITOLOG_KEY_SUFFIX === '_sasha' ? 'sasha' : 'fil'; }
    function scoped(base) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(base) : base + (profile() === 'sasha' ? '_sasha' : ''); }
    function identity() {
      try { return typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() : null; }
      catch (error) { return null; }
    }
    function context() {
      var user = identity();
      return profile() + '|' + (win.AVITOLOG_BACKEND_MODE ? text(user && user.id) : 'local');
    }
    function ready() { return !win.AVITOLOG_BACKEND_MODE || win.AVITOLOG_BACKEND_INITIAL_SYNC_READY === true; }
    function canWrite() {
      if (!ready()) return false;
      if (!win.AVITOLOG_BACKEND_MODE) return true;
      var user = identity();
      return !!(user && text(user.id) && ((profile() === 'fil') === (text(user.id) === OWNER_ID)));
    }
    function ownDriveVerified() {
      if (!canWrite()) return false;
      try {
        var user = identity(), verified = typeof win.__avitologVerifiedDriveIdentity === 'function' && win.__avitologVerifiedDriveIdentity();
        return !!(user && text(user.id) && text(user.email) && verified && verified.id === user.id && verified.email === user.email);
      } catch (error) { return false; }
    }
    function retryNow() { return win.Date && typeof win.Date.now === 'function' ? win.Date.now() : Date.now(); }
    function read(key, fallback) {
      try { var value = JSON.parse(win.localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
      catch (error) { return fallback; }
    }
    function projects() {
      if (!ready()) return { projects: [], hiddenProjects: [] };
      try { if (typeof win.loadProjectsData === 'function') return win.loadProjectsData(); } catch (error) {}
      return read(scoped('avitolog_projects'), { projects: [], hiddenProjects: [] });
    }
    function allProjects(data) { return list(data.projects).concat(list(data.hiddenProjects)); }
    function sources() {
      var result = { projects: allProjects(projects()), clients: [], goals: [], cash: [] };
      if (!ready()) return result;
      try { result.clients = typeof win.getCrmClients === 'function' ? list(win.getCrmClients()) : list(read(scoped('avitolog_clients'), [])); } catch (error) {}
      var ownCash = scoped('avitolog_assets_my_v2'), agencyCash = scoped('avitolog_assets_sasha_v2'), goalsKey = scoped('avitolog_goals_v1');
      var keys = [ownCash, agencyCash, goalsKey].concat(knownSourceKeys[context()] || []);
      try {
        for (var i = 0; i < win.localStorage.length; i++) {
          var key = win.localStorage.key(i);
          if ([ownCash, agencyCash, goalsKey].some(function (base) { return key && key.indexOf(base + '_month_') === 0 && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(key.slice(base.length + 7)); })) keys.push(key);
        }
      } catch (error) {}
      var months = keys.map(function (key) { return key.slice(-7); }).filter(function (ym) { return /^\d{4}-\d{2}$/.test(ym); });
      var cashMemory = null;
      try { if (typeof win.__avitologAdsCashRead === 'function') cashMemory = win.__avitologAdsCashRead(months); } catch (error) {}
      var goalsMemory = null;
      try { if (typeof win.__avitologAdsGoalsRead === 'function') goalsMemory = win.__avitologAdsGoalsRead(months); } catch (error) {}
      keys.filter(function (key, index, array) { return array.indexOf(key) === index; }).forEach(function (key) {
        if (key === goalsKey || key.indexOf(goalsKey + '_month_') === 0) {
          var goalMonth = key === goalsKey ? '' : key.slice(-7);
          var memoryValue = goalsMemory && (goalMonth ? goalsMemory.months && goalsMemory.months[goalMonth] : goalsMemory.live);
          result.goals.push({ key: key, projects: list((memoryValue || read(key, {})).projects) }); return;
        }
        var agency = key === agencyCash || key.indexOf(agencyCash + '_month_') === 0;
        // Sasha's own profile must never read Fil's separate agency column.
        if (agency && profile() === 'sasha') return;
        var memory = cashMemory && (agency ? cashMemory.sasha : cashMemory);
        var month = key.indexOf('_month_') >= 0 ? key.slice(-7) : '';
        var rows = memory && (month ? memory.months && memory.months[month] : memory.live);
        result.cash.push({ key: key, column: agency ? 'agency' : 'own', rows: Array.isArray(rows) ? rows : list(read(key, [])) });
      });
      return result;
    }
    function resolve(target, data) {
      if (typeof target === 'string' || typeof target === 'number') return allProjects(data).find(function (project) { return text(project.id) === text(target); }) || null;
      if (!target || typeof target !== 'object') return null;
      var found = allProjects(data).find(function (project) { return text(target.id) && text(project.id) === text(target.id); });
      return found || target;
    }
    function entriesFor(target, dataSources) {
      if (!target || !ready()) return [];
      var journal = target.paymentJournalV1;
      var saved = journal && journal.format === FORMAT && journal.profile === profile() ? list(journal.entries) : [];
      var current = derive(target, dataSources || sources());
      return mergeEntries(current.entries, saved, current.observed);
    }
    function getEntries(target) {
      var resolved = resolve(target, projects());
      return clone(entriesFor(resolved));
    }
    function getSummary(target) {
      var entries = getEntries(target);
      return { entries: entries, count: entries.length, total: Math.round(entries.reduce(function (sum, entry) { return sum + entry.amount; }, 0) * 100) / 100, currency: 'RUB' };
    }
    function notify(name, detail) {
      try { doc.dispatchEvent(new win.CustomEvent(name, { detail: detail })); } catch (error) {}
    }
    function persist(data) {
      if (typeof win.saveProjectsData !== 'function') return false;
      win.saveProjectsData(data);
      return true;
    }
    function materialize(syncFiles) {
      if (!canWrite()) return false;
      if (busy) { again = true; return false; }
      var captured = context(), data = projects(), dataSources = prepareSources(sources()), changed = false;
      busy = true;
      try {
        allProjects(data).forEach(function (project) {
          var entries = entriesFor(project, dataSources), old = project.paymentJournalV1;
          if (old && (old.format !== FORMAT || old.profile !== profile())) return;
          if (!entries.length && !old) return;
          if (old && old.format === FORMAT && old.profile === profile() && JSON.stringify(old.entries) === JSON.stringify(entries)) return;
          project.paymentJournalV1 = { format: FORMAT, profile: profile(), entries: entries, updatedAt: new Date().toISOString(), drivePending: true, driveAutoSync: !!(syncFiles || old && old.driveAutoSync === true) };
          if (old && old.driveFileId) project.paymentJournalV1.driveFileId = text(old.driveFileId);
          if (syncFiles && folderId(project.folderId || project.folderLink || project.crmData && (project.crmData.folderId || project.crmData.folderLink))) pendingFiles[captured + '|' + text(project.id)] = { context: captured, id: text(project.id) };
          changed = true;
        });
        if (changed && context() === captured && canWrite() && persist(data)) notify('avitolog:project-payments-changed', { profile: profile() });
      } finally { busy = false; }
      if (again) { again = false; schedule(false); }
      if (syncFiles) void drainFiles();
      return changed;
    }
    function schedule(syncFiles) {
      var captured = context();
      if (timerContext !== captured) scheduledSyncFiles = false;
      timerContext = captured;
      scheduledSyncFiles = scheduledSyncFiles || !!syncFiles;
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(function () {
        var sync = scheduledSyncFiles;
        timer = null; timerContext = ''; scheduledSyncFiles = false;
        if (captured === context()) materialize(sync);
      }, 250);
    }
    function assertContext(captured) {
      if (captured !== context() || !canWrite()) throw new Error('context_changed');
      if (win.AVITOLOG_BACKEND_MODE) {
        var user = identity(), verified = typeof win.__avitologVerifiedDriveIdentity === 'function' && win.__avitologVerifiedDriveIdentity();
        if (!verified || verified.id !== user.id || verified.email !== user.email) throw new Error('drive_not_connected');
      }
    }
    async function syncProjectFile(target) {
      if (!canWrite()) return { ok: false, reason: 'read_only_profile' };
      var captured = context(), data = projects(), project = resolve(target, data);
      if (!project) return { ok: false, reason: 'project_not_found' };
      if (project.paymentJournalV1 && (project.paymentJournalV1.format !== FORMAT || project.paymentJournalV1.profile !== profile())) return { ok: false, reason: 'journal_file_conflict' };
      var folder = folderId(project.folderId || project.folderLink || project.crmData && (project.crmData.folderId || project.crmData.folderLink));
      if (!folder) return { ok: false, reason: 'folder_not_linked' };
      var jobKey = captured + '|' + folder;
      if (fileJobs[jobKey]) return fileJobs[jobKey];
      fileJobs[jobKey] = (async function () {
        try {
          if (typeof win.getDriveToken !== 'function') throw new Error('drive_not_connected');
          var token = await win.getDriveToken();
          assertContext(captured);
          async function request(url, init) {
            assertContext(captured);
            init = init || {}; init.headers = Object.assign({}, init.headers, { Authorization: 'Bearer ' + token });
            var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
            var timeout = controller ? win.setTimeout(function () { controller.abort(); }, 12000) : null;
            if (controller) init.signal = controller.signal;
            try {
              var response = await win.fetch(url, init);
              assertContext(captured);
              if (!response.ok) throw new Error(response.status === 401 ? 'drive_not_connected' : 'drive_http_' + response.status);
              var raw = await response.text();
              assertContext(captured);
              if (raw.length > 2000000) throw new Error('journal_file_conflict');
              return { headers: response.headers, json: async function () { return JSON.parse(raw); }, text: async function () { return raw; } };
            } finally { if (timeout) win.clearTimeout(timeout); }
          }
          var folderResponse = await request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folder) + '?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true');
          var metadata = await folderResponse.json(); assertContext(captured);
          if (metadata.mimeType !== 'application/vnd.google-apps.folder' || metadata.capabilities && metadata.capabilities.canAddChildren === false) throw new Error('folder_not_writable');
          var escape = function (value) { return text(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
          var query = "name='" + FILE_NAME + "' and '" + escape(folder) + "' in parents and trashed=false";
          var fileResponse = await request('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id,appProperties),nextPageToken&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true');
          var fileList = await fileResponse.json(); assertContext(captured);
          var fileScope = captured.replace(/[^a-zA-Z0-9_|-]/g, '').slice(0, 100);
          var existing = list(fileList.files).filter(function (file) { return file.appProperties && file.appProperties.avitobossPaymentJournal === FORMAT && file.appProperties.profileScope === fileScope; });
          if (fileList.nextPageToken || existing.length > 1 || list(fileList.files).length && !existing.length) throw new Error('journal_file_conflict');
          var fileId = existing[0] && text(existing[0].id), remoteEntries = [], etag = '';
          if (fileId) {
            var contentResponse = await request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true');
            var rawContent = await contentResponse.text(); assertContext(captured);
            if (rawContent.length > 2000000) throw new Error('journal_file_conflict');
            var remote;
            try { remote = JSON.parse(rawContent); } catch (error) { throw new Error('journal_file_conflict'); }
            if (!remote || remote.format !== FORMAT || remote.profile !== profile() || remote.folderId !== folder || !Array.isArray(remote.entries)) throw new Error('journal_file_conflict');
            remoteEntries = remote.entries;
            etag = contentResponse.headers && contentResponse.headers.get('ETag') || '';
          }
          // Resolve again after network I/O so an edit in this browser cannot be
          // overwritten by the earlier, captured project object.
          data = projects(); project = resolve(target, data);
          if (!project || folderId(project.folderId || project.folderLink || project.crmData && (project.crmData.folderId || project.crmData.folderLink)) !== folder) throw new Error('context_changed');
          if (project.paymentJournalV1 && (project.paymentJournalV1.format !== FORMAT || project.paymentJournalV1.profile !== profile())) throw new Error('journal_file_conflict');
          var dataSources = prepareSources(sources()), current = derive(project, dataSources);
          var entries = mergeEntries(entriesFor(project, dataSources), remoteEntries, current.observed);
          var payload = JSON.stringify({ format: FORMAT, profile: profile(), folderId: folder, project: text(project.title || project.company || project.name), currency: 'RUB', count: entries.length, total: Math.round(entries.reduce(function (sum, entry) { return sum + entry.amount; }, 0) * 100) / 100, entries: entries }, null, 2);
          var saved;
          if (fileId) {
            var headers = { 'Content-Type': 'application/json; charset=utf-8' };
            if (etag) headers['If-Match'] = etag;
            var update = await request('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&supportsAllDrives=true&fields=id', { method: 'PATCH', headers: headers, body: payload });
            saved = await update.json(); assertContext(captured);
          } else {
            var boundary = 'avitoboss_payment_' + Date.now();
            var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FILE_NAME, mimeType: 'application/json', parents: [folder], appProperties: { avitobossPaymentJournal: FORMAT, profileScope: fileScope } }) + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + payload + '\r\n--' + boundary + '--';
            var create = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body });
            saved = await create.json(); assertContext(captured);
          }
          if (!saved || !text(saved.id)) throw new Error('drive_unconfirmed');
          data = projects(); project = resolve(target, data); assertContext(captured);
          if (!project || folderId(project.folderId || project.folderLink || project.crmData && (project.crmData.folderId || project.crmData.folderLink)) !== folder) throw new Error('context_changed');
          if (project.paymentJournalV1 && (project.paymentJournalV1.format !== FORMAT || project.paymentJournalV1.profile !== profile())) throw new Error('journal_file_conflict');
          if (project && list(data.projects).concat(list(data.hiddenProjects)).indexOf(project) >= 0) {
            var latestSources = prepareSources(sources()), latestCurrent = derive(project, latestSources);
            var latestEntries = mergeEntries(entriesFor(project, latestSources), entries, latestCurrent.observed);
            var caughtUp = JSON.stringify(latestEntries) === JSON.stringify(entries);
            project.paymentJournalV1 = { format: FORMAT, profile: profile(), entries: latestEntries, updatedAt: new Date().toISOString(), drivePending: !caughtUp, driveAutoSync: !caughtUp && !!(project.paymentJournalV1 && project.paymentJournalV1.driveAutoSync === true), driveFileId: text(saved.id) };
            persist(data);
          }
          notify('avitolog:project-payments-file', { projectId: text(project && project.id), ok: true });
          return { ok: true, fileId: text(saved.id), fileName: FILE_NAME, pending: !!(project.paymentJournalV1 && project.paymentJournalV1.drivePending) };
        } catch (error) {
          var reason = text(error && error.message);
          if (!/^(context_changed|drive_not_connected|folder_not_writable|journal_file_conflict|drive_http_\d+|drive_unconfirmed)$/.test(reason)) reason = 'drive_unavailable';
          return { ok: false, reason: reason };
        } finally { delete fileJobs[jobKey]; }
      }());
      return fileJobs[jobKey];
    }
    async function drainFiles() {
      if (fileDrainRunning || !ownDriveVerified()) return;
      fileDrainRunning = true;
      try {
        var items = Object.keys(pendingFiles);
        for (var i = 0; i < items.length; i++) {
          var queueKey = items[i], item = pendingFiles[queueKey];
          if (!item || item.context !== context()) { delete pendingFiles[queueKey]; delete fileRetries[queueKey]; continue; }
          if (!ownDriveVerified()) break;
          var retry = fileRetries[queueKey];
          if (retry && retry.at > retryNow()) continue;
          var project = resolve(item.id, projects()), journal = project && project.paymentJournalV1;
          if (!journal || journal.format !== FORMAT || journal.profile !== profile() || journal.drivePending !== true || journal.driveAutoSync !== true) { delete pendingFiles[queueKey]; delete fileRetries[queueKey]; continue; }
          var result = await syncProjectFile(item.id);
          if (item.context !== context()) { delete pendingFiles[queueKey]; delete fileRetries[queueKey]; break; }
          if (result.ok && !result.pending) { delete pendingFiles[queueKey]; delete fileRetries[queueKey]; }
          else {
            var attempts = Math.min((retry && retry.attempts || 0) + 1, 6);
            fileRetries[queueKey] = { attempts: attempts, at: retryNow() + Math.min(900000, 45000 * Math.pow(2, attempts - 1)) };
          }
        }
      } finally { fileDrainRunning = false; }
    }
    function retryPendingFiles() {
      if (!ownDriveVerified()) return Promise.resolve();
      var captured = context();
      allProjects(projects()).forEach(function (project) {
        var journal = project.paymentJournalV1;
        if (!journal || journal.format !== FORMAT || journal.profile !== profile() || journal.drivePending !== true || journal.driveAutoSync !== true || !text(project.id)) return;
        if (!folderId(project.folderId || project.folderLink || project.crmData && (project.crmData.folderId || project.crmData.folderLink))) return;
        pendingFiles[captured + '|' + text(project.id)] = { context: captured, id: text(project.id) };
      });
      return drainFiles();
    }
    function isSourceKey(key) {
      var ownCash = scoped('avitolog_assets_my_v2'), agencyCash = scoped('avitolog_assets_sasha_v2'), goalsKey = scoped('avitolog_goals_v1');
      return [ownCash, goalsKey].concat(profile() === 'fil' ? [agencyCash] : []).some(function (base) { return key === base || key.indexOf(base + '_month_') === 0 && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(key.slice(base.length + 7)); });
    }
    doc.addEventListener('avitolog:storage-write', function (event) {
      var detail = event.detail || {};
      if (canWrite() && isSourceKey(text(detail.key))) {
        var keyList = knownSourceKeys[context()] || (knownSourceKeys[context()] = []);
        if (keyList.indexOf(text(detail.key)) < 0) keyList.push(text(detail.key));
        schedule(true);
      }
    });
    doc.addEventListener('avitolog:backend-initial-ready', function () { schedule(false); });
    doc.addEventListener('avitolog:backend-remote-applied', function () { schedule(false); });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { schedule(false); });
    else schedule(false);
    if (typeof win.setInterval === 'function') win.setInterval(retryPendingFiles, 45000);
    return { getEntries: getEntries, getSummary: getSummary, syncProjectFile: syncProjectFile, refresh: materialize, fileName: FILE_NAME };
  }
  return { derive: derive, mergeEntries: mergeEntries, normalizeEntry: normalizeEntry, install: install, format: FORMAT, fileName: FILE_NAME };
}));
