(function () {
  'use strict';
  if (window.AvitoWorkspaceBridge) return;
  var ORIGIN = 'https://avitoboss.online';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var frame = null, scope = '', loaded = false, readyTask = null, readyReject = null, readyTimer = null, catalog = null, pending = Object.create(null);
  function context() {
    if (window.AVITOLOG_BACKEND_MODE && window.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) return '';
    var identity = typeof window.__avitologBackendIdentity === 'function' && window.__avitologBackendIdentity();
    var user = String(identity && identity.id || '').toLowerCase();
    var profile = window.AVITOLOG_KEY_SUFFIX === '_sasha' || window.AVITOLOG_USER === 'sasha' ? 'sasha' : 'fil';
    var config = window.AVITOLOG_SUPABASE || {};
    var org = String(config.profileOrganizations && config.profileOrganizations[profile] || '').toLowerCase();
    return UUID.test(user) && UUID.test(org) ? user + '|' + profile + '|' + org : '';
  }
  function clear(reason) {
    var code = reason === 'transport_unavailable' ? reason : 'context_changed';
    clearTimeout(readyTimer); readyTimer = null;
    if (readyReject) { var reject = readyReject; readyReject = null; reject(new Error(code)); }
    Object.keys(pending).forEach(function (id) { clearTimeout(pending[id].timer); pending[id].reject(new Error(code)); });
    pending = Object.create(null);
    if (frame) frame.remove();
    frame = null; scope = ''; loaded = false; readyTask = null; catalog = null;
    document.dispatchEvent(new CustomEvent('avitolog:workspace-reset', { detail: { reason: code } }));
  }
  function ensure() {
    var next = context();
    if (!next) { if (scope) clear(); return Promise.reject(new Error('auth_required')); }
    if (scope && scope !== next) clear();
    if (readyTask) return readyTask;
    scope = next;
    var parts = next.split('|');
    frame = document.createElement('iframe'); frame.hidden = true;
    frame.title = 'Защищённая связь CRM с Avito'; frame.setAttribute('aria-hidden', 'true');
    frame.src = ORIGIN + '/integrations/avito-accounts/?workspaceBridge=1&expected_user_id=' + encodeURIComponent(parts[0]) + '&organization_id=' + encodeURIComponent(parts[2]) + '&v=20261020-workspace2';
    readyTask = new Promise(function (resolve, reject) {
      var owner = frame; readyReject = reject;
      readyTimer = setTimeout(function () { if (owner === frame) clear(next === context() ? 'transport_unavailable' : undefined); }, 25000);
      owner.addEventListener('load', function () { if (owner !== frame) { reject(new Error('context_changed')); return; } clearTimeout(readyTimer); readyReject = null; if (next === context()) { loaded = true; resolve(); } else { reject(new Error('context_changed')); clear(); } }, { once: true });
    });
    document.body.appendChild(frame);
    return readyTask;
  }
  function nonce() {
    var bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
    return Array.from(bytes, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  }
  async function request(action, fields) {
    await ensure();
    var owner = frame, ownerScope = scope;
    if (!loaded || ownerScope !== context()) throw new Error('context_changed');
    return new Promise(function (resolve, reject) {
      var id = nonce();
      var deadline = action === 'chats' || action === 'messages' ? 90000 : 45000;
      pending[id] = { resolve: resolve, reject: reject, scope: ownerScope, timer: setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error(action === 'send' ? 'send_unknown' : 'timeout')); } }, deadline) };
      owner.contentWindow.postMessage(Object.assign({ type: 'avitolog:workspace:request', requestId: id, action: action }, fields || {}), ORIGIN);
    });
  }
  window.addEventListener('message', function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || data.type !== 'avitolog:workspace:response' || typeof data.requestId !== 'string') return;
    var task = pending[data.requestId];
    if (!task) return;
    clearTimeout(task.timer); delete pending[data.requestId];
    if (task.scope !== context() || task.scope !== scope) { task.reject(new Error('context_changed')); clear(); return; }
    if (data.ok === true) task.resolve(data);
    else {
      task.reject(new Error(typeof data.code === 'string' ? data.code : 'unavailable'));
      if (/^(auth_required|subject_mismatch|organization_forbidden)$/.test(data.code || '')) clear();
    }
  });
  function accountId(value) { if (typeof value !== 'string' || !/^(personal|oauth):[0-9a-f-]{36}$/i.test(value) || !UUID.test(value.split(':')[1])) throw new Error('account_forbidden'); return value; }
  async function listAccounts(force) {
    if (!force && catalog && catalog.scope === context() && Date.now() - catalog.at < 30000) return catalog.value.slice();
    var owner = context(), result = await request('accounts');
    if (owner !== context()) throw new Error('context_changed');
    var accounts = (Array.isArray(result.accounts) ? result.accounts : []).filter(function (item) {
      return item && /^(personal|oauth)$/.test(item.source) && UUID.test(item.account_id || '') && item.id === item.source + ':' + item.account_id && /^[1-9][0-9]{0,24}$/.test(item.avito_user_id || '') && typeof item.display_name === 'string';
    }).map(function (item) { return Object.freeze({ id: item.id, account_id: item.account_id, source: item.source, avito_user_id: item.avito_user_id, display_name: item.display_name.slice(0, 200) }); });
    catalog = { scope: owner, at: Date.now(), value: accounts };
    return accounts.slice();
  }
  async function operation(action, id, chatId, extra) { return (await request(action, Object.assign({ accountId: accountId(id) }, chatId ? { chatId: chatId } : {}, extra || {}))).result; }
  window.AvitoWorkspaceBridge = Object.freeze({
    context: context, listAccounts: listAccounts,
    getAccountOverview: async function (id) { return (await request('overview', { accountId: accountId(id) })).overview; },
    getChats: function (id, offset) { return operation('chats', id, '', { offset: offset || 0 }); },
    getMessages: function (id, chat, offset) { return operation('messages', id, chat, { offset: offset || 0 }); },
    sendMessage: function (id, chat, text) { return operation('send', id, chat, { text: text, sendId: crypto.randomUUID() }); },
    markRead: function (id, chat) { return operation('read', id, chat); }
  });
  setInterval(function () { if (scope && context() !== scope) clear(); }, 1000);
})();
