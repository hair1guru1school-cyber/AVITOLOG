(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (!root.AvitoChatPhones) root.AvitoChatPhones = api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var excluded = ['b8118a9d75ed1227b9fd1498b32419cb854a793a2e2a4b77f2f7e8ddafebf9f7', '4e74d10024365eb4f8527e54f135130316cafdb24cdc1823d6d0c5eb2e621084'];
  function text(value) { return value == null ? '' : String(value); }
  function blank(value) { return !text(value).trim(); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function extractPhones(value) {
    var input = text(value).replace(/(?:https?:\/\/|www\.)\S+/gi, ' '), phones = [];
    var pattern = /(?:[78][ \t\u00a0\u202f.\-\u2010-\u2014]*|\+7[ \t\u00a0\u202f.\-\u2010-\u2014]*)?(?:\([ \t\u00a0\u202f]*[3489]\d{2}[ \t\u00a0\u202f]*\)|[3489]\d{2})[ \t\u00a0\u202f.\-\u2010-\u2014]*\d{3}[ \t\u00a0\u202f.\-\u2010-\u2014]*\d{2}[ \t\u00a0\u202f.\-\u2010-\u2014]*\d{2}/g, match;
    while ((match = pattern.exec(input))) {
      var before = input.charAt(match.index - 1), after = input.charAt(pattern.lastIndex), digits = match[0].replace(/\D/g, '');
      if (/[\dA-Za-zА-Яа-яЁё+]/.test(before) || /[\dA-Za-zА-Яа-яЁё]/.test(after)) continue;
      if (/(?:заказ|сч[её]т|инн|огрн|артикул|договор|номер карты|реквизиты|сумма)\s*[№:#-]?\s*$/i.test(input.slice(Math.max(0, match.index - 60), match.index)) || /^\s*(?:₽|руб)/i.test(input.slice(pattern.lastIndex))) continue;
      if (digits.length === 10 && digits.charAt(0) !== '9') continue;
      if (digits.length === 11) digits = digits.slice(1);
      var phone = '+7' + digits;
      if (phones.indexOf(phone) === -1) phones.push(phone);
    }
    return phones;
  }
  async function phoneFromMessages(list, account, counterpartyId, crypto) {
    if (!crypto || !crypto.subtle || !account || !/^[1-9]\d{0,24}$/.test(text(account.avito_user_id))) return null;
    var ordered = (Array.isArray(list) ? list : []).slice().sort(function (a, b) { return (Number(b && b.created) || 0) - (Number(a && a.created) || 0); });
    for (var i = 0; i < ordered.length; i++) {
      var message = ordered[i];
      if (!message || message.direction !== 'in' || message.type !== 'text' || !message.id || !/^[1-9]\d{0,24}$/.test(text(message.author_id)) || text(message.author_id) === text(account.avito_user_id) || counterpartyId && text(message.author_id) !== text(counterpartyId)) continue;
      var candidates = extractPhones(message.text), allowed = [];
      for (var j = 0; j < candidates.length; j++) {
        var bytes = Uint8Array.from(candidates[j].slice(1), function (char) { return char.charCodeAt(0); });
        var digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        if (excluded.indexOf(digest) === -1) allowed.push(candidates[j]);
      }
      if (allowed.length === 1) return { phone: allowed[0], messageId: text(message.id), authorId: text(message.author_id) };
    }
    return null;
  }
  function install(win) {
    var bridge = win.AvitoWorkspaceBridge, owner = '', generation = 0, running = null, cursor = 0, pages = Object.create(null), timer;
    var socials = win.AvitoChatSocials, fields = ['phone'];
    if (socials && typeof socials.contactsFromMessages === 'function') fields.push('vk', 'telegram');
    function contact(record, field) {
      var names = field === 'telegram' ? ['telegram', 'tg'] : field === 'vk' ? ['vk', 'vk_url'] : ['phone'];
      for (var i = 0; record && i < names.length; i++) if (!blank(record[names[i]])) return text(record[names[i]]).trim();
      return '';
    }
    function missing(record) { return fields.some(function (field) { return blank(contact(record, field)); }); }
    function key(base) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(base) : base; }
    function context() {
      if (!bridge || win.AVITOLOG_BACKEND_MODE && win.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true) return '';
      var scope = bridge.context(), parts = text(scope).split('|');
      if (parts.length !== 3 || !parts[0] || !parts[2] || !/^(fil|sasha)$/.test(parts[1])) return '';
      // Viewing another profile must never trigger background writes into it.
      if (typeof win.AVITOLOG_PROFILE_LOCKED !== 'boolean' || (parts[1] === 'sasha') !== win.AVITOLOG_PROFILE_LOCKED) return '';
      if (key('avitolog_clients') !== 'avitolog_clients' + (parts[1] === 'sasha' ? '_sasha' : '')) return '';
      return scope + '|' + key('avitolog_clients') + '|' + key('avitolog_projects');
    }
    function reset() { owner = ''; generation++; cursor = 0; pages = Object.create(null); running = null; }
    function capture() { var value = context(); if (value !== owner) { reset(); owner = value; } return { owner: value, generation: generation }; }
    function valid(token) { return !!token.owner && token.owner === context() && token.owner === owner && token.generation === generation; }
    function assertCurrent(token) { if (!valid(token)) throw new Error('context_changed'); }
    function clients() { var value = typeof win.getCrmClients === 'function' ? win.getCrmClients() : []; return Array.isArray(value) ? value : []; }
    function hasChat(client, identity) { return client && (client.avito_chat_key === identity || Array.isArray(client.avito_chat_keys) && client.avito_chat_keys.indexOf(identity) !== -1); }
    function linkedProject(project, client) { return project && (project.crmClientId ? text(project.crmClientId) === text(client.client_id) : client.folderId && text(project.folderId) === text(client.folderId)); }
    function syncActive(client, names, token) {
      if (typeof win.getActiveClient !== 'function') return;
      function matches(record) {
        return record && (record.client_id ? text(record.client_id) === text(client.client_id) : client.folderId && text(record.folderId) === text(client.folderId) && clients().filter(function (item) { return text(item.folderId) === text(client.folderId); }).length === 1);
      }
      var active = win.getActiveClient();
      if (!matches(active)) return;
      assertCurrent(token);
      var stored = null, storedChanged = false, activeKey = key('avitolog_active_client');
      try { stored = JSON.parse(win.localStorage.getItem(activeKey) || 'null'); } catch (_) {}
      names.forEach(function (field) {
        var value = client[field];
        if (matches(stored) && contact(stored, field) && contact(stored, field) !== value) return;
        if (blank(contact(active, field))) active[field] = value;
        if (contact(active, field) !== value) return;
        if (matches(stored) && blank(contact(stored, field))) { stored[field] = value; storedChanged = true; }
        var input = typeof win.document.getElementById === 'function' && win.document.getElementById(field === 'telegram' ? 'tg' : field);
        if (input && input !== win.document.activeElement && blank(input.value)) input.value = value;
      });
      if (storedChanged) { assertCurrent(token); try { win.localStorage.setItem(activeKey, JSON.stringify(stored)); } catch (_) {} }
    }
    function mirror(client, token) {
      var imported = {};
      fields.forEach(function (field) {
        var stamp = field === 'phone' ? client.avitoPhoneImportV1 : client.avitoContactImportV1 && client.avitoContactImportV1[field];
        var value = stamp && (field === 'phone' ? stamp.phone : stamp.value);
        if (stamp && value && value === client[field] && hasChat(client, stamp.chatKey)) imported[field] = { value: value, stamp: stamp };
      });
      var names = Object.keys(imported);
      if (!names.length) return;
      assertCurrent(token);
      syncActive(client, names, token);
      if (typeof win.loadProjectsData === 'function' && typeof win.saveProjectsData === 'function') {
        var data = copy(win.loadProjectsData()), changed = false;
        (data.projects || []).forEach(function (project) {
          if (!linkedProject(project, client)) return;
          names.forEach(function (field) {
            if (!blank(contact(project.crmData, field)) || !blank(contact(project, field))) return;
            var patch = {}; patch[field] = imported[field].value;
            project.crmData = Object.assign({}, project.crmData || {}, patch); changed = true;
          });
        });
        if (changed) { assertCurrent(token); win.saveProjectsData(data); assertCurrent(token); }
      }
      var live = typeof win.__avitologAdsGoalsRead === 'function' && win.__avitologAdsGoalsRead([]), storageKey = key('avitolog_goals_v1');
      var goals = live && live.live ? copy(live.live) : JSON.parse(win.localStorage.getItem(storageKey) || '{"projects":[]}'), goalsChanged = false;
      (goals.projects || []).forEach(function (goal) {
        names.forEach(function (field) {
          var linked = goal && (goal.crmClientRecordId ? text(goal.crmClientRecordId) === text(client.client_id) : goal.avitoChatKey === imported[field].stamp.chatKey);
          if (linked && blank(contact(goal, field)) && blank(contact(goal.payload, field))) { goal[field] = imported[field].value; goalsChanged = true; }
        });
      });
      if (goalsChanged) {
        assertCurrent(token); var old = win.localStorage.getItem(storageKey), raw = JSON.stringify(goals), written = false;
        try { win.localStorage.setItem(storageKey, raw); written = true; } catch (error) { if (!/quota/i.test(text(error.name) + text(error.message))) throw error; }
        var memory = typeof win.__goalsApplyBackendValue === 'function' && win.__goalsApplyBackendValue(storageKey, raw);
        if (!written && !memory) throw new Error('storage_unavailable');
        win.document.dispatchEvent(new win.CustomEvent('avitolog:storage-write', { detail: { key: storageKey, value: raw, previousValue: old } })); assertCurrent(token);
      }
      if (changed || goalsChanged) {
        assertCurrent(token);
        win.document.dispatchEvent(new win.CustomEvent('avitolog:chat-contacts-updated', { detail: { clientId: text(client.client_id), fields: names } }));
      }
    }
    async function scan() {
      var token = capture();
      if (!token.owner || running || win.document.visibilityState === 'hidden' || typeof win.saveCrmClients !== 'function') return;
      var job = {}; running = job;
      try {
        var pending = clients().filter(function (client) { return client && client.client_id && (client.avito_chat_key || Array.isArray(client.avito_chat_keys) && client.avito_chat_keys.length); });
        if (!pending.length) return;
        pending.forEach(function (client) { try { mirror(client, token); } catch (_) {} });
        pending = pending.filter(missing);
        if (!pending.length) return;
        var accounts = await bridge.listAccounts(false); if (!valid(token)) return;
        var jobs = [], seen = Object.create(null);
        pending.forEach(function (client) {
          [client.avito_chat_key].concat(client.avito_chat_keys || []).forEach(function (identity) {
            if (typeof identity !== 'string' || seen[identity]) return;
            var at = identity.indexOf(':'), userId = identity.slice(0, at), chatId = identity.slice(at + 1);
            if (at < 1 || !/^[1-9]\d{0,24}$/.test(userId) || !chatId || clients().filter(function (item) { return hasChat(item, identity); }).length !== 1) return;
            var matches = accounts.filter(function (account) { return text(account.avito_user_id) === userId; });
            var account = matches.find(function (item) { return item.id === client.avito_origin_account_id; }) || (matches.length === 1 ? matches[0] : null);
            if (!account) return;
            seen[identity] = true; jobs.push({ clientId: text(client.client_id), identity: identity, chatId: chatId, account: account });
          });
        });
        var start = jobs.length ? cursor % jobs.length : 0, limit = Math.min(2, jobs.length); cursor = start + limit;
        for (var i = 0; i < limit; i++) {
          var target = jobs[(start + i) % jobs.length];
          for (var page = 0; page < 2; page++) {
            if (!valid(token)) return;
            var latest = clients().filter(function (client) { return hasChat(client, target.identity); });
            if (latest.length !== 1 || text(latest[0].client_id) !== target.clientId || !missing(latest[0])) break;
            var offset = page === 0 ? 0 : pages[target.identity];
            if (page && !offset) break;
            try {
              var result = await bridge.getMessages(target.account.id, target.chatId, offset);
              if (!valid(token)) return;
              var candidates = socials && typeof socials.contactsFromMessages === 'function' ? socials.contactsFromMessages(result && result.messages, target.account, null) : {};
              var candidate = blank(contact(latest[0], 'phone')) ? await phoneFromMessages(result && result.messages, target.account, null, win.crypto) : null;
              if (candidate) candidates.phone = { value: candidate.phone, messageId: candidate.messageId, authorId: candidate.authorId };
              if (!valid(token)) return;
              if (!page && pages[target.identity] === undefined) pages[target.identity] = result && result.pagination && result.pagination.has_more ? 50 : 0;
              if (page) pages[target.identity] = result && result.pagination && result.pagination.has_more && offset < 1000 ? offset + 50 : 0;
              if (!Object.keys(candidates).length) continue;
              var rows = clients().slice(), matches = rows.filter(function (client) { return hasChat(client, target.identity); });
              if (matches.length !== 1 || text(matches[0].client_id) !== target.clientId) break;
              var changed = Object.assign({}, matches[0]), applied = [], importedAt = new Date().toISOString();
              fields.forEach(function (field) {
                var value = candidates[field];
                if (!value || !value.value || !blank(contact(matches[0], field))) return;
                changed[field] = value.value; applied.push(field);
                if (field === 'phone') changed.avitoPhoneImportV1 = { phone: value.value, chatKey: target.identity, messageId: value.messageId, importedAt: importedAt };
                else {
                  changed.avitoContactImportV1 = Object.assign({}, changed.avitoContactImportV1 || {});
                  changed.avitoContactImportV1[field] = { value: value.value, chatKey: target.identity, messageId: value.messageId, importedAt: importedAt };
                }
              });
              if (!applied.length) continue;
              rows[rows.indexOf(matches[0])] = changed;
              assertCurrent(token); win.saveCrmClients(rows); assertCurrent(token);
              var saved = clients().find(function (client) { return text(client.client_id) === target.clientId && hasChat(client, target.identity); });
              if (!saved || applied.some(function (field) { return saved[field] !== changed[field]; })) throw new Error('storage_unconfirmed');
              mirror(saved, token);
              if (applied.indexOf('phone') !== -1) win.document.dispatchEvent(new win.CustomEvent('avitolog:chat-phone-updated', { detail: { clientId: target.clientId } }));
              win.document.dispatchEvent(new win.CustomEvent('avitolog:chat-contacts-updated', { detail: { clientId: target.clientId, fields: applied } }));
              if (!missing(saved)) break;
            } catch (error) { if (!valid(token)) return; break; }
          }
        }
      } catch (_) {} finally { if (running === job) running = null; }
    }
    function schedule() { if (timer) win.clearTimeout(timer); timer = win.setTimeout(function () { timer = null; scan(); }, 1500); }
    win.document.addEventListener('avitolog:workspace-reset', reset);
    win.document.addEventListener('avitolog:backend-initial-ready', schedule);
    win.document.addEventListener('avitolog:storage-write', function (event) { if (event.detail && event.detail.key === key('avitolog_clients')) schedule(); });
    win.document.addEventListener('visibilitychange', function () { if (win.document.visibilityState !== 'hidden') schedule(); });
    win.setInterval(function () { capture(); scan(); }, 60000); schedule();
    return Object.freeze({ scan: scan, reset: reset });
  }
  return { extractPhones: extractPhones, phoneFromMessages: phoneFromMessages, install: install };
});
