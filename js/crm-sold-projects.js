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
    var base = days(data && data.daysManage), extra = String(data && data.extraManageEnabled) === '1' ? days(data.extraManageDays, true) : 0;
    if (base === null || extra === null || base + extra > 3660 || !binding || !scope) return null;
    return { format: FORMAT, source: 'contract-explicit-generate', scope: scope, clientId: text(binding.clientId), folderId: text(binding.folderId), managementDays: base + extra, baseDays: base, extraDays: extra, generatedAt: at };
  }
  function validTerm(term, goal, client, scope) {
    if (!term || term.format !== FORMAT || term.source !== 'contract-explicit-generate' || term.scope !== scope || days(term.managementDays) === null || !term.generatedAt) return false;
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
    if (!created) return { ok: true, reason: 'existing_project_preserved', created: false, changed: false, projectId: project.id, data: out };
    if (options && options.schedule === false) return { ok: true, reason: 'manual_link', created: true, changed: true, projectId: project.id, data: out };
    var terms = [client && client.contractServiceTermV1, project.contractServiceTermV1, project.crmData && project.crmData.contractServiceTermV1, goal.contractServiceTermV1, goal.payload && goal.payload.contractServiceTermV1].filter(function (term) { return validTerm(term, goal, client, scope); });
    terms.sort(function (a, b) { return text(b.generatedAt).localeCompare(text(a.generatedAt)); });
    var term = terms[0], start = goal.statusDates && goal.statusDates.paid || goal.date;
    var cycle = text(goal.paidCycleId || goal.id + ':' + text(start)), eventId = 'crm_sale_' + cycle;
    var marker = { goalId: text(goal.id), cycleId: cycle, saleDate: text(start), state: !term ? 'duration_missing' : !validDate(start) ? 'date_missing' : 'ready' };
    if (!term || !validDate(start)) {
      if (JSON.stringify(project.crmSoldAutomationV1) !== JSON.stringify(marker)) { project.crmSoldAutomationV1 = marker; changed = true; }
      return { ok: true, reason: marker.state, created: created, changed: changed, projectId: project.id, data: out };
    }
    var events = Array.isArray(project.events) ? project.events : [];
    if (events.some(function (event) { return event && event.id === eventId; })) return { ok: true, reason: 'already_linked', changed: changed, created: created, projectId: project.id, data: out };
    if (events.some(function (event) { return event && event.type === 'active_range' && event.source !== 'crm_contract' && text(event.endDate) >= start; })) return { ok: true, reason: 'manual_calendar_preserved', created: created, changed: changed, projectId: project.id, data: out };
    var end = addDays(start, term.managementDays - 1);
    project.events = events.concat({ id: eventId, type: 'active_range', startDate: start, endDate: end, source: 'crm_contract', goalId: text(goal.id), paidCycleId: cycle, contractGeneratedAt: term.generatedAt, managementDays: term.managementDays });
    marker.state = 'scheduled'; marker.days = term.managementDays; marker.startDate = start; marker.endDate = end; project.crmSoldAutomationV1 = marker;
    return { ok: true, reason: 'scheduled', created: created, changed: true, projectId: project.id, data: out };
  }
  function install(win) {
    function key(value) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(value) : value; }
    function scope() {
      var suffix = key('avitolog_clients') === 'avitolog_clients_sasha' ? 'sasha' : key('avitolog_clients') === 'avitolog_clients' ? 'fil' : '';
      if (!suffix || typeof win.AVITOLOG_PROFILE_LOCKED !== 'boolean' || (suffix === 'sasha') !== win.AVITOLOG_PROFILE_LOCKED) return '';
      if (win.AVITOLOG_BACKEND_MODE && win.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) return '';
      var identity = typeof win.__avitologBackendIdentity === 'function' ? win.__avitologBackendIdentity() || {} : {};
      if (win.AVITOLOG_BACKEND_MODE && !identity.id) return '';
      return [identity.id || 'local', suffix, key('avitolog_clients'), key('avitolog_projects')].join('|');
    }
    function assertScope(expected) { if (!expected || expected !== scope()) throw Error('context_changed'); }
    function clients() { var rows = typeof win.getCrmClients === 'function' ? win.getCrmClients() : []; return Array.isArray(rows) ? rows : []; }
    function message(result) {
      if (result.reason === 'duration_missing') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d. \u0421\u0440\u043e\u043a \u0432\u0435\u0434\u0435\u043d\u0438\u044f \u0432 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d; \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0451\u043d.';
      if (result.reason === 'existing_non_active') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0432 Zzz/\u0430\u0440\u0445\u0438\u0432\u0435. \u0415\u0433\u043e \u043f\u043e\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0435 \u043c\u0435\u043d\u044f\u043b\u043e\u0441\u044c.';
      if (result.reason === 'manual_calendar_preserved') return '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d; \u0440\u0443\u0447\u043d\u044b\u0435 \u0434\u0430\u0442\u044b \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b.';
      if (!result.ok) return '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0434\u043d\u043e\u0437\u043d\u0430\u0447\u043d\u043e \u0441\u0432\u044f\u0437\u0430\u0442\u044c \u043f\u0440\u043e\u0435\u043a\u0442. \u0414\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u044b.';
      return result.reason === 'scheduled' ? '\u041f\u0440\u043e\u0435\u043a\u0442 \u0441\u0432\u044f\u0437\u0430\u043d, \u0441\u0440\u043e\u043a \u0438\u0437 \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0430 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d \u0432 \u043a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c.' : '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0436\u0435 \u0441\u0432\u044f\u0437\u0430\u043d.';
    }
    function link(goal, automatic) {
      var expected = scope();
      if (!expected || automatic && (!goal || goal.stage !== 'sold')) return { ok: false, reason: 'inactive_context' };
      if (typeof win.loadProjectsData !== 'function' || typeof win.saveProjectsData !== 'function') return { ok: false, reason: 'projects_unavailable' };
      try {
        var result = planSale(win.loadProjectsData(), goal, clients(), expected, { schedule: automatic === true }); result.message = message(result);
        if (result.changed) { assertScope(expected); win.saveProjectsData(result.data); assertScope(expected); }
        if (result.changed && win.projectsMode && typeof win.rerenderProjectsPreserveScroll === 'function') win.rerenderProjectsPreserveScroll();
        if (result.changed && win.document && win.CustomEvent) win.document.dispatchEvent(new win.CustomEvent('avitolog:crm-sold-project-linked', { detail: { goalId: goal.id, projectId: result.projectId, reason: result.reason } }));
        if (automatic && result.created && result.reason !== 'scheduled' && typeof win.showAnalyticsReadyToast === 'function') win.showAnalyticsReadyToast(result.message);
        return result;
      } catch (_) { return { ok: false, reason: 'save_failed', message: '\u041f\u0440\u043e\u0434\u0430\u0436\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430; \u043f\u0440\u043e\u0435\u043a\u0442 \u043d\u0435 \u0441\u0432\u044f\u0437\u0430\u043d. \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u043e\u0439 \ud83c\udd70\ufe0f.' }; }
    }
    function captureContractContext() {
      var expected = scope(), active = typeof win.getActiveClient === 'function' ? win.getActiveClient() : null;
      if (!expected || !active) return null;
      return { scope: expected, clientId: text(active.client_id), folderId: text(active.folderId) };
    }
    function rememberContractTerm(data, binding) {
      var expected = scope();
      if (!binding || binding.scope !== expected) return { ok: false, reason: 'context_changed' };
      var current = captureContractContext();
      if (!current || current.clientId !== binding.clientId || current.folderId !== binding.folderId) return { ok: false, reason: 'client_changed' };
      var term = makeTerm(data, binding, expected, new Date().toISOString());
      if (!term) return { ok: false, reason: 'invalid_duration' };
      var rows = clients(), matches = rows.filter(function (row) { return binding.clientId ? same(row.client_id, binding.clientId) : binding.folderId && same(row.folderId, binding.folderId); });
      if (matches.length !== 1 || typeof win.saveCrmClients !== 'function') return { ok: false, reason: 'client_not_saved' };
      var next = rows.slice(), updated = Object.assign({}, matches[0], { contractServiceTermV1: term }); next[rows.indexOf(matches[0])] = updated;
      try {
        assertScope(expected); win.saveCrmClients(next); assertScope(expected);
        var saved = clients().find(function (row) { return same(row.client_id, updated.client_id); });
        if (!saved || JSON.stringify(saved.contractServiceTermV1) !== JSON.stringify(term)) return { ok: false, reason: 'save_unconfirmed' };
        var active = typeof win.getActiveClient === 'function' && win.getActiveClient(); if (active && same(active.client_id, updated.client_id)) active.contractServiceTermV1 = term;
        return { ok: true, days: term.managementDays };
      } catch (_) { return { ok: false, reason: 'save_failed' }; }
    }
    var api = { onSold: function (goal) { return link(goal, true); }, link: function (goal) { return link(goal, false); }, captureContractContext: captureContractContext, rememberContractTerm: rememberContractTerm };
    win.__onGoalsProjectSentToActive = api.link;
    return Object.freeze(api);
  }
  return { makeTerm: makeTerm, planSale: planSale, resolveClient: resolveClient, matchesProject: matchesProject, validDate: validDate, addDays: addDays, install: install };
});
