(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (!root.CrmSoldProjects) root.CrmSoldProjects = api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var FORMAT = 'avitoboss-contract-service-term-v1';
  function text(value) { return value == null ? '' : String(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function same(a, b) { return !!text(a) && text(a) === text(b); }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
    var date = new Date(value + 'T00:00:00Z');
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function addDays(value, count) {
    var date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function contractDate(value) {
    var raw = text(value).trim(), match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (match) raw = match[3] + '-' + match[2] + '-' + match[1];
    return validDate(raw) ? raw : '';
  }
  function days(value, allowZero) {
    if (!/^\d{1,4}$/.test(text(value).trim())) return null;
    var result = Number(value);
    return result >= (allowZero ? 0 : 1) && result <= 3660 ? result : null;
  }
  function folder(goal) {
    var direct = text(goal && (goal.folderId || goal.crmClientId)).trim();
    if (direct) return direct;
    var match = text(goal && goal.folderLink).match(/\/folders\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : '';
  }
  function resolveClient(goal, clients) {
    var id = goal && (goal.crmClientRecordId || goal.client_id), fid = folder(goal);
    var matches = (clients || []).filter(function (client) { return client && (id ? same(client.client_id, id) : fid && same(client.folderId, fid)); });
    return matches.length === 1 ? matches[0] : null;
  }
  function matchesProject(project, goal, client) {
    if (!project) return false;
    var clientId = client && client.client_id || goal && goal.crmClientRecordId;
    if (project.crmClientId && clientId && !same(project.crmClientId, clientId)) return false;
    var sources = [goal && goal.id, goal && goal.soldFromId].filter(Boolean);
    if (sources.some(function (id) { return same(project.goalsSourceId, id); })) return true;
    if (project.crmClientId && clientId) return same(project.crmClientId, clientId);
    var fid = client && client.folderId || folder(goal);
    return !!fid && same(project.folderId, fid);
  }
  function makeTerm(data, binding, scope, at) {
    var creation = days(data && data.daysCreate), base = days(data && data.daysManage), extra = String(data && data.extraManageEnabled) === '1' ? days(data.extraManageDays, true) : 0;
    if (creation === null || !binding || !scope) return null;
    var management = base !== null && extra !== null && base + extra <= 3660 ? base + extra : null;
    return { format: FORMAT, source: 'contract-explicit-generate', scope: scope, clientId: text(binding.clientId), folderId: text(binding.folderId), startDate: contractDate(data.startDate), creationDays: creation, managementDays: management, baseDays: base, extraDays: extra, generatedAt: at };
  }
  function validTerm(term, goal, client, scope) {
    if (!term || term.format !== FORMAT || term.source !== 'contract-explicit-generate' || term.scope !== scope || days(term.creationDays) === null || !term.generatedAt) return false;
    var id = client && client.client_id || goal && goal.crmClientRecordId, fid = client && client.folderId || folder(goal);
    return term.clientId ? same(term.clientId, id) : !!fid && same(term.folderId, fid);
  }
  function planSale(data, goal, clients, scope, options) {
    var out = clone(data || { projects: [] }); out.projects = Array.isArray(out.projects) ? out.projects : [];
    if (!goal || !goal.id || !text(goal.name || goal.company).trim()) return { ok: false, reason: 'missing_sale', data: out };
    var client = resolveClient(goal, clients), matches = [], ids = Object.create(null);
    out.projects.concat(out.hiddenProjects || []).forEach(function (project) {
      if (!matchesProject(project, goal, client) || ids[text(project.id)]) return;
      ids[text(project.id)] = true; matches.push(project);
    });
    if (matches.length > 1) return { ok: false, reason: 'ambiguous_project', data: out };
    var project = matches[0], created = false, changed = false;
    if (!project) {
      var id = 'g2a_' + text(goal.id);
      if (out.projects.concat(out.hiddenProjects || []).some(function (row) { return same(row.id, id); })) return { ok: false, reason: 'id_conflict', data: out };
      var active = out.projects.filter(function (row) { return !row.zone || row.zone === 'active'; });
      project = { id: id, title: text(goal.name || goal.company).trim(), emoji: goal.emoji || '\ud83d\udce6', zone: 'active', status: '\u0412 \u0440\u0430\u0431\u043e\u0442\u0435', clientType: 'new', sortOrder: active.length ? Math.min.apply(null, active.map(function (row) { return Number(row.sortOrder) || 0; })) - 1 : 0, clientPath: { autoload: false, analytics: false, texts: false, packaging: false, portfolio: false }, events: [], childLines: [], optionalField: '', cardsActive: '', mustLaunchRequired: false, goalsSourceId: goal.id };
      var fid = client && client.folderId || folder(goal), cid = client && client.client_id || goal.crmClientRecordId;
      if (fid) project.folderId = fid;
      if (cid) project.crmClientId = cid;
      if (goal.folderLink) project.folderLink = goal.folderLink;
      project.crmData = Object.assign({}, client || goal.payload || {});
      out.projects.push(project); created = changed = true;
    }
    if (project.zone && project.zone !== 'active' || (out.hiddenProjects || []).indexOf(project) !== -1) return { ok: true, reason: 'existing_non_active', created: created, changed: changed, projectId: project.id, data: out };
    var previous = project.crmSoldAutomationV1;
    var awaitingSale = previous && previous.state === 'awaiting_sale' && goal.stage === 'sold' && [goal.id, goal.soldFromId].some(function (id) { return same(previous.goalId, id); });
    var pending = awaitingSale || previous && ['duration_missing', 'date_missing', 'disabled'].indexOf(previous.state) !== -1 && same(previous.goalId, goal.id) && same(previous.cycleId, goal.paidCycleId || goal.id + ':' + text(goal.statusDates && goal.statusDates.paid || goal.date));
    if (!created && !pending) return { ok: true, reason: 'existing_project_preserved', created: false, changed: false, projectId: project.id, data: out };
    if (options && options.manual) {
      if (created && goal.stage === 'working') project.crmSoldAutomationV1 = { goalId: text(goal.id), state: 'awaiting_sale' };
      return { ok: true, reason: 'manual_link', created: created, changed: changed, projectId: project.id, data: out };
    }
    var terms = [client && client.contractServiceTermV1, project.contractServiceTermV1, project.crmData && project.crmData.contractServiceTermV1, goal.contractServiceTermV1, goal.payload && goal.payload.contractServiceTermV1].filter(function (term) { return validTerm(term, goal, client, scope); });
    terms.sort(function (a, b) { return text(b.generatedAt).localeCompare(text(a.generatedAt)); });
    var term = terms[0], saleDate = goal.statusDates && goal.statusDates.paid || goal.date, start = term && term.startDate || saleDate;
    var cycle = text(goal.paidCycleId || goal.id + ':' + text(saleDate)), eventId = 'crm_sale_' + cycle;
    var marker = { goalId: text(goal.id), cycleId: cycle, saleDate: text(saleDate), state: options && options.schedule === false ? 'disabled' : !term ? 'duration_missing' : !validDate(start) ? 'date_missing' : 'ready' };
    if (marker.state !== 'ready') {
      if (JSON.stringify(project.crmSoldAutomationV1) !== JSON.stringify(marker)) { project.crmSoldAutomationV1 = marker; changed = true; }
      return { ok: true, reason: marker.state, created: created, changed: changed, projectId: project.id, data: out };
    }
    var events = Array.isArray(project.events) ? project.events : [];
    if (events.some(function (event) { return event && event.id === eventId; })) return { ok: true, reason: 'already_linked', changed: changed, created: created, projectId: project.id, data: out };
    if (events.some(function (event) { return event && event.source !== 'crm_contract'; })) return { ok: true, reason: 'manual_calendar_preserved', created: created, changed: changed, projectId: project.id, data: out };
    var end = addDays(start, Number(term.creationDays));
    project.events = events.concat(
      { id: eventId, type: 'launch_range', startDate: start, endDate: end, source: 'crm_contract', goalId: text(goal.id), paidCycleId: cycle, contractGeneratedAt: term.generatedAt, creationDays: Number(term.creationDays) },
      { id: eventId + '_launch', type: 'not_launched_project_marker', date: end, source: 'crm_contract', goalId: text(goal.id) }
    );
    project.status = '\u041e\u0436\u0438\u0434\u0430\u044e\u0442';
    marker.state = 'scheduled'; marker.kind = 'launch'; marker.days = Number(term.creationDays); marker.startDate = start; marker.endDate = end; project.crmSoldAutomationV1 = marker;
    return { ok: true, reason: 'scheduled', created: created, changed: true, projectId: project.id, data: out };
  }
  function planContract(data, clients, term, binding, expected, schedule) {
    if (!Array.isArray(clients) || !data || !Array.isArray(data.projects)) throw Error('Данные проекта ещё не загружены.');
    if (!validTerm(term, { crmClientRecordId: binding.clientId, folderId: binding.folderId }, null, expected)) throw Error('Срок договора относится к другому клиенту или режиму.');
    var rows = clone(clients), out = clone(data);
    var matches = rows.filter(function (row) { return binding.clientId ? same(row.client_id, binding.clientId) : same(row.folderId, binding.folderId); });
    if (matches.length > 1 || binding.clientId && matches.length !== 1) throw Error('Не удалось однозначно найти клиента договора.');
    var client = matches[0] || null;
    if (client && binding.folderId && client.folderId && !same(client.folderId, binding.folderId)) throw Error('Папка клиента изменилась.');
    var identity = { crmClientRecordId: binding.clientId, folderId: binding.folderId };
    var linked = out.projects.concat(out.hiddenProjects || []).filter(function (p) { return matchesProject(p, identity, client); });
    if (linked.length > 1 || !client && !linked.length) throw Error('Не удалось однозначно найти проект договора.');
    if (linked.some(function (p) { return binding.folderId && p.folderId && !same(p.folderId, binding.folderId) || !client && p.crmClientId; })) throw Error('Привязка проекта изменилась.');
    if (client) client.contractServiceTermV1 = clone(term);
    var result = null;
    linked.forEach(function (p) {
      p.contractServiceTermV1 = clone(term);
      var marker = p.crmSoldAutomationV1;
      if (!marker || ['duration_missing', 'date_missing', 'disabled'].indexOf(marker.state) === -1) return;
      var goal = { id: marker.goalId, name: p.title, stage: 'sold', crmClientRecordId: client && client.client_id, folderId: binding.folderId, date: marker.saleDate, paidCycleId: marker.cycleId };
      result = planSale(out, goal, rows, expected, { schedule: schedule });
      if (!result.ok) throw Error('Не удалось заполнить запуск проекта.');
      out = result.data;
    });
    return { clients: rows, data: out, clientChanged: JSON.stringify(rows) !== JSON.stringify(clients), changed: JSON.stringify(out) !== JSON.stringify(data), reason: result && result.reason || (schedule ? 'term_saved' : 'disabled'), projectId: linked[0] && linked[0].id, term: term };
  }
  function install(win) {
    var tail = Promise.resolve(), pending = 0;
    function backend() { return !!(win.AVITOLOG_BACKEND_MODE || win.AVITOLOG_BACKEND_SERVER_ONLY); }
    function key(value) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(value) : value; }
    function scope() {
      var suffix = key('avitolog_clients') === 'avitolog_clients_sasha' ? 'sasha' : key('avitolog_clients') === 'avitolog_clients' ? 'fil' : '';
      if (!suffix || typeof win.AVITOLOG_PROFILE_LOCKED !== 'boolean' || (suffix === 'sasha') !== win.AVITOLOG_PROFILE_LOCKED) return '';
      if (backend() && win.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) return '';
      var identity = typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() || {} : {};
      if (backend() && !identity.id) return '';
      return [identity.id || 'local', suffix, key('avitolog_clients'), key('avitolog_projects')].join('|');
    }
    function assertScope(expected) { if (!expected || expected !== scope()) throw Error('context_changed'); }
    function clients() { var rows = typeof win.getCrmClients === 'function' ? win.getCrmClients() : []; return Array.isArray(rows) ? rows : []; }
    function enabled() { return !win.CrmSettings || win.CrmSettings.get().autoContractCalendar !== false; }
    function run(expected, action) {
      function invoke() { assertScope(expected); return action(); }
      if (!backend() && !(win.CrmSettings && typeof win.CrmSettings.whenReady === 'function')) {
        try { return invoke(); } catch (error) { return { ok: false, reason: 'save_failed', error: error.message }; }
      }
      pending++;
      var task = tail.then(function () { return win.CrmSettings && typeof win.CrmSettings.whenReady === 'function' ? win.CrmSettings.whenReady() : null; }).then(invoke).catch(function (error) { return { ok: false, reason: 'save_failed', error: error.message }; }).finally(function () { pending--; });
      tail = task; return task;
    }
    function write(expected, build) {
      if (!backend()) {
        var result = build(win.loadProjectsData(), clients()); assertScope(expected);
        if (result.clientChanged) win.saveCrmClients(result.clients);
        if (result.changed) win.saveProjectsData(result.data);
        assertScope(expected); return result;
      }
      if (typeof win.__avitologBackendCommitStatePatch !== 'function') throw Error('Обновите страницу для надёжного сохранения запуска.');
      var clientKey = key('avitolog_clients'), projectKey = key('avitolog_projects'), result;
      return win.__avitologBackendCommitStatePatch([clientKey, projectKey], function (values) {
        assertScope(expected);
        if (typeof values[clientKey] !== 'string' || typeof values[projectKey] !== 'string') throw Error('Данные проекта ещё не загружены сервером.');
        var projects = JSON.parse(values[projectKey]), rows = JSON.parse(values[clientKey]);
        if (!projects || !Array.isArray(projects.projects) || !Array.isArray(rows)) throw Error('Сервер вернул неполные данные проекта.');
        result = build(projects, rows);
        var updates = {}; if (result.clientChanged) updates[clientKey] = JSON.stringify(result.clients); if (result.changed) updates[projectKey] = JSON.stringify(result.data); return updates;
      }).then(function () { assertScope(expected); return result; });
    }
    function after(result, action) { return result && typeof result.then === 'function' ? result.then(action) : action(result); }
    function message(result) {
      if (result.reason === 'disabled') return 'Проект связан. Автозаполнение календаря выключено в настройках CRM.';
      if (result.reason === 'duration_missing') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d. \u0421\u0440\u043e\u043a \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0432 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d; \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0451\u043d.';
      if (result.reason === 'existing_non_active') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0432 Zzz/\u0430\u0440\u0445\u0438\u0432\u0435. \u0415\u0433\u043e \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0435 \u043c\u0435\u043d\u044f\u043b\u043e\u0441\u044c.';
      if (result.reason === 'manual_calendar_preserved') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d; \u0440\u0443\u0447\u043d\u044b\u0435 \u0434\u0430\u0442\u044b \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b.';
      if (!result.ok) return '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0434\u043d\u043e\u0437\u043d\u0430\u0447\u043d\u043e \u0441\u0432\u044f\u0437\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442. \u0414\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u044b.';
      return result.reason === 'scheduled' ? '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d, \u0441\u0440\u043e\u043a \u0438\u0437 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d \u0432 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c.' : '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0436\u0435 \u0441\u0432\u044f\u0437\u0430\u043d.';
    }
    function link(goal, automatic) {
      var expected = scope();
      if (!expected || automatic && (!goal || goal.stage !== 'sold')) return { ok: false, reason: 'inactive_context' };
      if (typeof win.loadProjectsData !== 'function' || typeof win.saveProjectsData !== 'function') return { ok: false, reason: 'projects_unavailable' };
      goal = clone(goal);
      return run(expected, function () { return after(write(expected, function (data, rows) { return planSale(data, goal, rows, expected, { schedule: automatic === true && enabled(), manual: !automatic }); }), function (result) {
        result.message = message(result);
        if (result.changed && win.projectsMode && typeof win.rerenderProjectsPreserveScroll === 'function') win.rerenderProjectsPreserveScroll();
        if (result.changed && win.document && win.CustomEvent) win.document.dispatchEvent(new win.CustomEvent('avitolog:crm-sold-project-linked', { detail: { goalId: goal.id, projectId: result.projectId, reason: result.reason } }));
        if (automatic && result.created && result.reason !== 'scheduled' && typeof win.showAnalyticsReadyToast === 'function') win.showAnalyticsReadyToast(result.message);
        return result;
      }); });
    }
    function captureContractContext() {
      var expected = scope(), active = win.ContractClientSync && typeof win.ContractClientSync.target === 'function' ? win.ContractClientSync.target() : typeof win.getActiveClient === 'function' ? win.getActiveClient() : null;
      if (!expected || !active) return null;
      var match = text(active.folderLink || active.driveFolderUrl || active.folderUrl).match(/\/folders\/([A-Za-z0-9_-]+)/);
      var binding = { scope: expected, clientId: text(active.client_id || active.crmClientId), folderId: text(active.folderId || active.folder_id || active.drive_folder_id) || (match ? match[1] : '') };
      return binding.clientId || binding.folderId ? binding : null;
    }
    function rememberContractTerm(data, binding) {
      var expected = scope();
      if (!binding || binding.scope !== expected) return { ok: false, reason: 'context_changed' };
      var current = captureContractContext();
      if (!current || current.clientId !== binding.clientId || current.folderId !== binding.folderId) return { ok: false, reason: 'client_changed' };
      var term = makeTerm(data, binding, expected, new Date().toISOString());
      if (!term) return { ok: false, reason: 'invalid_duration' };
      return run(expected, function () { return after(write(expected, function (projects, rows) {
        var current = captureContractContext();
        if (!current || current.clientId !== binding.clientId || current.folderId !== binding.folderId) throw Error('Клиент договора изменился.');
        return planContract(projects, rows, term, binding, expected, enabled());
      }), function (result) {
        var active = typeof win.getActiveClient === 'function' && win.getActiveClient();
        if (active && (binding.clientId ? same(active.client_id, binding.clientId) : same(active.folderId, binding.folderId))) active.contractServiceTermV1 = term;
        if (result.reason === 'scheduled' && win.projectsMode && typeof win.rerenderProjectsPreserveScroll === 'function') win.rerenderProjectsPreserveScroll();
        return result.reason === 'term_saved' ? { ok: true, days: term.creationDays } : { ok: true, days: term.creationDays, calendar: result.reason };
      }); });
    }
    var api = { onSold: function (goal) { return link(goal, true); }, link: function (goal) { return link(goal, false); }, captureContractContext: captureContractContext, rememberContractTerm: rememberContractTerm };
    win.__onGoalsProjectSentToActive = api.link;
    if (win.addEventListener) win.addEventListener('beforeunload', function (event) { if (pending) { event.preventDefault(); event.returnValue = ''; } });
    return Object.freeze(api);
  }
  return { makeTerm: makeTerm, planSale: planSale, planContract: planContract, resolveClient: resolveClient, matchesProject: matchesProject, validDate: validDate, addDays: addDays, install: install };
});
