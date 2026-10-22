(function (root, factory) {
  'use strict';
  var library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  else if (root && root.document) root.ProjectContextStore = library.install(root);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var FORMAT = 'avitoboss-project-context-v1';
  var FILE_NAME = 'AVITOBOSS-context.json';
  var MAX_BYTES = 5 * 1024 * 1024;
  var FIELD_LIMITS = { title: 300, company: 300, contact_name: 200, phone: 100, telegram: 200, vk: 500, category: 300, city: 1000, client_type: 100, kp_count: 100, positions: 5000, notes: 20000 };
  function fail(reason) { throw new Error(reason); }
  function text(value) { return value == null ? '' : String(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function bytes(value) { return unescape(encodeURIComponent(value)).length; }
  function string(value, max, optional) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('invalid_context_entry');
    return value;
  }
  function keys(value, allowed) {
    if (!object(value) || Object.keys(value).some(function (key) { return allowed.indexOf(key) < 0; })) fail('invalid_context_entry');
  }
  function entry(value) {
    keys(value, ['id', 'createdAt', 'kind', 'text', 'summary', 'facts', 'tasks', 'suggestions', 'provider', 'audioName', 'sourceName']);
    var result = { id: string(value.id, 100), createdAt: string(value.createdAt, 40), kind: value.kind, text: string(value.text, 20000), summary: string(value.summary, 4000, true), facts: [], tasks: [], suggestions: [], provider: value.provider || 'manual' };
    if (!result.id || /\s/.test(result.id) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(result.createdAt) || !isFinite(Date.parse(result.createdAt)) || new Date(result.createdAt).toISOString().slice(0, 19) !== result.createdAt.slice(0, 19) || ['text', 'audio'].indexOf(result.kind) < 0 || !result.text.trim() || ['manual', 'anthropic'].indexOf(result.provider) < 0) fail('invalid_context_entry');
    ['facts', 'tasks', 'suggestions'].forEach(function (field) {
      var values = value[field] === undefined ? [] : value[field];
      if (!Array.isArray(values) || values.length > 40) fail('invalid_context_entry');
      result[field] = values.map(function (item) {
        var suggestion = field === 'suggestions';
        keys(item, suggestion ? ['field', 'value', 'evidence'] : ['text', 'evidence']);
        var evidence = string(item.evidence, 1000);
        if (!evidence.trim() || result.text.indexOf(evidence) < 0) fail('invalid_context_evidence');
        if (suggestion && !Object.prototype.hasOwnProperty.call(FIELD_LIMITS, item.field)) fail('invalid_context_entry');
        return suggestion ? { field: item.field, value: string(item.value, FIELD_LIMITS[item.field]), evidence: evidence } : { text: string(item.text, 2000), evidence: evidence };
      });
    });
    ['audioName', 'sourceName'].forEach(function (field) { if (value[field] !== undefined) result[field] = string(value[field], 300); });
    if (bytes(JSON.stringify(result)) > 250000) fail('context_operation_too_large');
    return result;
  }
  function mergeEntries(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) fail('context_file_conflict');
    var found = new Map(), out = [];
    left.concat(right).forEach(function (value) {
      var next = entry(value), old = found.get(next.id);
      if (old && JSON.stringify(old) !== JSON.stringify(next)) fail('context_entry_conflict');
      if (!old) { found.set(next.id, next); out.push(next); }
    });
    if (bytes(JSON.stringify(out)) > MAX_BYTES - 10000) fail('context_operation_too_large');
    return out;
  }
  function folderId(value) {
    if (typeof value !== 'string') return '';
    if (/^[a-zA-Z0-9_-]{1,200}$/.test(value)) return value;
    try { var url = new URL(value), match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{1,200})\/?$/); return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password && match ? match[1] : ''; } catch (_) { return ''; }
  }
  function install(win) {
    var jobs = new Map();
    function identity() { try { return typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() || {} : {}; } catch (_) { return {}; } }
    function key(base) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(base) : base; }
    function profile() { return win.AVITOLOG_KEY_SUFFIX === '_sasha' ? 'sasha' : 'fil'; }
    function actor() { var user = identity(); return text(user.id || user.email || win.AVITOLOG_USER || win.AVITOLOG_KEY_EMAIL || 'local'); }
    function scope() { var user = identity(); return [key('avitolog_projects'), key('avitolog_clients'), win.AVITOLOG_KEY_EMAIL || '', win.AVITOLOG_USER || '', user.id || '', user.email || ''].join('|'); }
    function ready() { return !(win.AVITOLOG_BACKEND_MODE || win.AVITOLOG_BACKEND_SERVER_ONLY) || win.AVITOLOG_BACKEND_INITIAL_SYNC_READY === true; }
    function readOnlySasha() { return !!(win.AVITOLOG_BACKEND_MODE && profile() === 'sasha' && text(identity().email).toLowerCase() !== 'cyplakovaleksandr153@gmail.com'); }
    function writable() { return ready() && !readOnlySasha(); }
    function assertScope(target, write) {
      if (!target || typeof target.scope !== 'string' || target.scope !== scope() || !ready()) fail('context_changed');
      if (!text(target.projectId)) fail('context_project_required');
      if (write && !writable()) fail('read_only_profile');
    }
    function read() {
      if (!ready()) fail('context_not_ready');
      if (win._projectsDataMem && win._projectsDataMemKey === key('avitolog_projects') && Array.isArray(win._projectsDataMem.projects)) return win._projectsDataMem;
      var data;
      try { data = JSON.parse(win.localStorage.getItem(key('avitolog_projects')) || 'null'); } catch (_) { fail('context_storage_unavailable'); }
      if (!data || !Array.isArray(data.projects)) fail('context_project_not_found');
      return data;
    }
    function rows(data) { return data.projects.concat(Array.isArray(data.hiddenProjects) ? data.hiddenProjects : []); }
    function project(target, data) {
      assertScope(target, false);
      var matches = rows(data).filter(function (item) { return item && text(item.id) === text(target.projectId); });
      if (matches.length !== 1) fail('context_project_not_found');
      return matches[0];
    }
    function projectFolder(item) { return folderId(item.folderId) || folderId(item.folderLink) || folderId(item.crmData && item.crmData.folderId) || folderId(item.crmData && item.crmData.folderLink); }
    function context(item, viewing) {
      var saved = item.intakeContextV1;
      if (!saved) return { format: FORMAT, profile: profile(), actor: actor(), projectId: text(item.id), entries: [], drivePending: false };
      var mayViewSasha = viewing === true && readOnlySasha();
      if (!object(saved) || saved.format !== FORMAT || saved.profile !== profile() || typeof saved.actor !== 'string' || !saved.actor || (!mayViewSasha && saved.actor !== actor()) || saved.projectId !== text(item.id)) fail('context_owner_conflict');
      var result = clone(saved); result.entries = mergeEntries(saved.entries, []); return result;
    }
    function get(target) { assertScope(target, false); return clone(context(project(target, read()), true)); }
    function businessShape(data) {
      var set = new Set(rows(data));
      return JSON.stringify(data, function (name, value) { return name === 'intakeContextV1' && set.has(this) ? undefined : value; });
    }
    function snapshot(target) {
      assertScope(target, true);
      var data = read(), item = project(target, data), raw = win.localStorage.getItem(key('avitolog_projects')), baseline;
      try { baseline = JSON.parse(raw || 'null'); } catch (_) { fail('context_snapshot_changed'); }
      if (!baseline || !Array.isArray(baseline.projects) || businessShape(data) !== businessShape(baseline)) fail('context_snapshot_changed');
      var row = project(target, baseline);
      if (JSON.stringify(item.intakeContextV1) !== JSON.stringify(row.intakeContextV1)) fail('context_snapshot_changed');
      return { raw: raw, data: baseline, item: row, before: row.intakeContextV1, scope: scope(), business: businessShape(baseline), key: key('avitolog_projects') };
    }
    function notify(target) { try { win.document.dispatchEvent(new win.CustomEvent('avitolog:project-context-changed', { detail: { projectId: text(target.projectId), scope: target.scope } })); } catch (_) {} }
    function persist(target, next) {
      var baseline = snapshot(target), beforeValue = JSON.stringify(baseline.before);
      context(baseline.item);
      baseline.item.intakeContextV1 = clone(next);
      if (businessShape(baseline.data) !== baseline.business || win.localStorage.getItem(baseline.key) !== baseline.raw || JSON.stringify(project(target, read()).intakeContextV1) !== beforeValue || typeof win.flushProjectsDataToStorage !== 'function') fail('context_snapshot_changed');
      assertScope(target, true);
      try {
        var flushed = win.flushProjectsDataToStorage(baseline.data);
        if (flushed === false || win.localStorage.getItem(baseline.key) !== JSON.stringify(baseline.data)) fail('context_persist_failed');
        assertScope(target, true);
      } catch (error) {
        // A quota failure in the legacy flush helper must not appear as success.
        var memory = win._projectsDataMem;
        if (win._projectsDataMemKey === baseline.key && memory && Array.isArray(memory.projects)) {
          var same = rows(memory).find(function (item) { return text(item.id) === text(target.projectId); });
          if (same && JSON.stringify(same.intakeContextV1) === JSON.stringify(next)) { if (baseline.before === undefined) delete same.intakeContextV1; else same.intakeContextV1 = clone(baseline.before); }
        }
        throw error;
      }
      notify(target);
      return clone(next);
    }
    function ownDrive() {
      try { var user = identity(), verified = typeof win.__avitologVerifiedDriveIdentity === 'function' && win.__avitologVerifiedDriveIdentity(); return writable() && !!(user.id && user.email && verified && verified.id === user.id && verified.email === user.email); } catch (_) { return false; }
    }
    function guarded(target, folder) {
      assertScope(target, true);
      var item = project(target, read());
      if (projectFolder(item) !== folder || folderId(target.folderId) !== folder) fail('context_folder_changed');
      if (!ownDrive()) fail('drive_not_connected');
      context(item);
      return item;
    }
    function bounded(promise, ms) {
      var timer;
      return Promise.race([promise, new Promise(function (_, reject) { timer = win.setTimeout(function () { reject(new Error('drive_timeout')); }, ms); })]).finally(function () { win.clearTimeout(timer); });
    }
    async function syncProjectFile(target) {
      target = Object.assign({}, target);
      var folder, jobKey;
      try {
        assertScope(target, true);
        var initial = project(target, read()); context(initial);
        folder = projectFolder(initial);
        if (!folder || folderId(target.folderId) !== folder) fail('context_folder_changed');
        if (!ownDrive() || typeof win.getDriveToken !== 'function' || typeof win.fetch !== 'function') fail('drive_not_connected');
        snapshot(target);
        jobKey = target.scope + '|' + target.projectId + '|' + folder;
      } catch (error) { return { ok: false, pending: true, reason: error.message }; }
      if (jobs.has(jobKey)) return jobs.get(jobKey);
      var job = (async function () {
        try {
          var token = await bounded(Promise.resolve().then(function () { guarded(target, folder); return win.getDriveToken(); }), 12000); guarded(target, folder);
          if (typeof token !== 'string' || !token) fail('drive_not_connected');
          async function request(url, init) {
            guarded(target, folder);
            init = init || {}; init.headers = Object.assign({}, init.headers, { Authorization: 'Bearer ' + token });
            var controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
            if (controller) init.signal = controller.signal;
            try {
              var response = await bounded(Promise.resolve(win.fetch(url, init)), 12000); guarded(target, folder);
              if (!response.ok) fail(response.status === 412 ? 'context_remote_changed' : response.status === 401 ? 'drive_not_connected' : 'drive_http_' + response.status);
              var length = response.headers && Number(response.headers.get('Content-Length'));
              if (length > MAX_BYTES) fail('context_file_too_large');
              var raw = await bounded(Promise.resolve(response.text()), 12000); guarded(target, folder);
              if (typeof raw !== 'string' || bytes(raw) > MAX_BYTES) fail('context_file_too_large');
              var result; try { result = JSON.parse(raw); } catch (_) { fail('context_file_conflict'); }
              return { data: result, headers: response.headers };
            } finally { if (controller) controller.abort(); }
          }
          var metadata = (await request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folder) + '?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true')).data; guarded(target, folder);
          if (!metadata || metadata.id !== folder || metadata.mimeType !== 'application/vnd.google-apps.folder' || !metadata.capabilities || metadata.capabilities.canAddChildren !== true) fail('folder_not_writable');
          var ownership = { avitobossContext: FORMAT, profile: profile(), actor: actor(), projectId: text(target.projectId) };
          if (Object.keys(ownership).some(function (name) { return bytes(name + ownership[name]) > 124; })) fail('context_owner_invalid');
          var escape = function (value) { return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
          var query = "name='" + FILE_NAME + "' and '" + escape(folder) + "' in parents and trashed=false";
          var listing = (await request('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&fields=files(id,appProperties),nextPageToken&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true')).data; guarded(target, folder);
          if (!listing || !Array.isArray(listing.files) || listing.nextPageToken || listing.files.length > 1) fail('context_file_conflict');
          var fileId = '', remoteEntries = [], etag = '';
          if (listing.files.length) {
            var file = listing.files[0];
            if (!file || !/^[a-zA-Z0-9_-]{1,200}$/.test(text(file.id)) || !object(file.appProperties) || Object.keys(ownership).some(function (name) { return file.appProperties[name] !== ownership[name]; })) fail('context_file_conflict');
            fileId = file.id;
            var content = await request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true'); guarded(target, folder);
            var remote = content.data;
            if (!remote || remote.format !== FORMAT || remote.profile !== profile() || remote.actor !== actor() || remote.projectId !== text(target.projectId) || remote.folderId !== folder || !Array.isArray(remote.entries)) fail('context_file_conflict');
            remoteEntries = mergeEntries(remote.entries, []);
            etag = content.headers && content.headers.get('ETag');
            if (typeof etag !== 'string' || !etag) fail('context_etag_required');
          }
          var latest = guarded(target, folder), savedContext = context(latest), entries = mergeEntries(savedContext.entries, remoteEntries);
          snapshot(target);
          var payload = JSON.stringify({ format: FORMAT, profile: profile(), actor: actor(), projectId: text(target.projectId), folderId: folder, entries: entries }, null, 2);
          if (bytes(payload) > MAX_BYTES) fail('context_file_too_large');
          var saved;
          if (fileId) saved = (await request('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&supportsAllDrives=true&fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=utf-8', 'If-Match': etag }, body: payload })).data;
          else {
            var boundary = 'avitoboss_context_' + Date.now();
            var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FILE_NAME, mimeType: 'application/json', parents: [folder], appProperties: ownership }) + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + payload + '\r\n--' + boundary + '--';
            saved = (await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body })).data;
          }
          latest = guarded(target, folder);
          if (!saved || !/^[a-zA-Z0-9_-]{1,200}$/.test(text(saved.id)) || fileId && saved.id !== fileId) fail('drive_unconfirmed');
          var current = context(latest), merged = mergeEntries(current.entries, entries), caughtUp = JSON.stringify(merged) === JSON.stringify(entries);
          var next = Object.assign({}, current, { entries: merged, updatedAt: new Date().toISOString(), drivePending: !caughtUp, driveFileId: saved.id, driveFolderId: folder });
          persist(target, next);
          return { ok: true, fileId: saved.id, fileName: FILE_NAME, pending: !caughtUp };
        } catch (error) { return { ok: false, fileName: FILE_NAME, pending: true, reason: error.message || 'drive_sync_failed' }; }
      }());
      jobs.set(jobKey, job);
      try { return await job; } finally { if (jobs.get(jobKey) === job) jobs.delete(jobKey); }
    }
    async function append(target, value) {
      target = Object.assign({}, target);
      assertScope(target, true);
      var validated = entry(value), current = get(target), entries = mergeEntries(current.entries, [validated]);
      if (JSON.stringify(entries) !== JSON.stringify(current.entries)) current = persist(target, Object.assign({}, current, { entries: entries, updatedAt: new Date().toISOString(), drivePending: true }));
      var drive = null;
      if (ownDrive() && folderId(target.folderId)) drive = await syncProjectFile(target);
      assertScope(target, true);
      current = get(target);
      return { ok: true, context: current, drivePending: current.drivePending === true, drive: drive };
    }
    return { scope: scope, get: get, append: append, syncProjectFile: syncProjectFile, fileName: FILE_NAME };
  }
  return { install: install, format: FORMAT, fileName: FILE_NAME, validateEntry: entry, mergeEntries: mergeEntries };
}));
