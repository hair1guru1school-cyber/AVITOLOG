(function () {
  'use strict';
  if (window.AvitoChat) return;
  var bridge = window.AvitoWorkspaceBridge, state = { scope: '', mode: 'closed', accounts: [], selected: [], chats: [], chat: null, loading: false, sending: false, generation: 0, lastPoll: 0 };
  var ui = {}, messages = Object.create(null), chatPages = Object.create(null), layoutOwner = '', layout = {}, activeResize = null, selectionVersion = 0, pendingOpen = false, pendingMode;
  function el(tag, className, text) { var n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
  function btn(text, title, action) { var n = el('button', '', text); n.type = 'button'; n.title = title || text; n.addEventListener('click', action); return n; }
  function empty(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function scope() { return bridge && bridge.context(); }
  function current(generation) { return state.scope === scope() && generation === state.generation; }
  function key(row) { return row.account.id + '|' + row.chat.id; }
  function name(row) { return row.chat.counterparty && row.chat.counterparty.name || row.chat.item && row.chat.item.title || 'Собеседник Avito'; }
  function clientTopics(value) {
    var text = String(value || '').toLowerCase(), topics = [];
    [['строй|ремонт|каркас|дом[ао]стро', 'Строительство / ремонт'], ['забор|ворот', 'Заборы / ворота'], ['мебел|кухн|шкаф', 'Мебель'], ['авто|шиномонтаж', 'Авто'], ['квартир|недвижим|риелтор', 'Недвижимость'], ['маркет|продвиж|авитолог|реклам', 'Маркетинг'], ['красот|маникюр|парикмах|салон', 'Красота'], ['груз|перевоз', 'Перевозки']].forEach(function (rule) { if (new RegExp(rule[0], 'i').test(text)) topics.push(rule[1]); });
    return topics.slice(0, 2).join(', ');
  }
  function chatEmoji(row) {
    var value = String(row.chat.counterparty && row.chat.counterparty.name || '') + ' ' + String(row.chat.item && row.chat.item.title || '');
    var match = value.match(/[\u{1F300}-\u{1FAFF}]/u); if (match) return match[0];
    if (/забор|ворот/i.test(value)) return '🏡';
    if (/мебел|кухн|шкаф/i.test(value)) return '🛋️';
    if (/строй|ремонт|каркас/i.test(value)) return '🏗️';
    var icons = ['👤', '💼', '🌿', '⭐', '☀️', '🔷'], seed = Array.from(String(row.chat.counterparty && row.chat.counterparty.id || row.chat.id)).reduce(function (sum, c) { return sum + c.codePointAt(0); }, 0);
    return icons[seed % icons.length];
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^а-яёa-z0-9]/g, ''); }
  function safeUrl(raw) { try { var u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)avito\.(ru|st)$/.test(u.hostname) ? u.href : ''; } catch (e) { return ''; } }
  function link(label, raw) { var href = safeUrl(raw); if (!href) return el('span', '', label); var n = el('a', '', label); n.href = href; n.target = '_blank'; n.rel = 'noopener noreferrer'; return n; }
  function errorText(error) {
    var code = error && error.message || '';
    var transport = { timeout: 'Сервер не ответил вовремя. Уже загруженные сообщения сохранены; обновите чат.', busy: 'Другой запрос ещё выполняется. Обновите чат через несколько секунд.', invalid_request: 'Запрос чата отклонён: неверный формат.', chat_unavailable: 'Avito временно не вернул список чатов.', messages_unavailable: 'Avito временно не вернул историю переписки.', account_forbidden: 'Этот аккаунт больше недоступен в текущем режиме.', unavailable: 'Сервис чатов сейчас недоступен. Уже загруженные сообщения сохранены.' };
    if (transport[code]) return transport[code];
    return ({ auth_required: 'Войдите в CRM и модуль «Аккаунты» под одним пользователем.', subject_mismatch: 'В CRM и аккаунтах выполнен вход разными пользователями.', organization_forbidden: 'Нет доступа к аккаунтам этого режима.', messenger_read_required: 'У аккаунта нет права messenger:read. Переподключите его с этим правом.', messenger_write_required: 'Нет права отправки messenger:write.', permission_denied: 'Avito не разрешил это действие для аккаунта.', try_later: 'Слишком частые запросы. Подождите немного.', send_unknown: 'Ответ Avito об отправке не получен. Не отправляйте повторно, сначала обновите историю.', context_changed: 'Режим изменился. Откройте чат заново.' })[code] || 'Не удалось получить ответ. Уже загруженные сообщения сохранены в этом окне; попробуйте обновить.';
  }
  function notice(text, bad) { ui.status.textContent = text || ''; ui.status.dataset.error = bad ? 'true' : 'false'; }
  function chatPreferences() {
    if (!scope()) return { niche: false, niches: {} };
    try {
      var value = JSON.parse(settingRead('avitolog_chat_preferences_v1:' + scope()) || '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) return { niche: value.niche === true, niches: value.niches && typeof value.niches === 'object' && !Array.isArray(value.niches) ? value.niches : {} };
    } catch (e) {}
    return { niche: false, niches: {} };
  }
  async function saveChatPreferences(value, owner) {
    if (!owner || scope() !== owner) return false;
    var generation = state.generation; state.preferenceSavingOwner = owner; ui.nicheSetting.disabled = true; notice('Сохраняем настройки…');
    try {
      await settingWrite('avitolog_chat_preferences_v1:' + owner, JSON.stringify(value));
      if (scope() !== owner || state.generation !== generation) return false;
      ui.nicheSetting.checked = value.niche === true; notice('Настройки сохранены.'); updateStorageInfo(); return true;
    } catch (e) { if (scope() === owner && state.generation === generation) notice('Браузер не подтвердил сохранение настроек. Изменение не применено; попробуйте ещё раз.', true); return false; }
    finally { if (state.generation === generation) { state.preferenceSavingOwner = ''; if (scope() === owner) ui.nicheSetting.disabled = false; } }
  }
  function renderChatTitle() {
    empty(ui.chatTitle);
    if (!state.chat) { ui.chatTitle.appendChild(el('strong', '', 'Выберите переписку')); ui.toCrm.disabled = true; return; }
    var row = state.chat, top = el('div', 'avchat-title-line'), copy = el('div', 'avchat-title-copy');
    copy.append(el('strong', '', name(row)), el('small', '', row.account.display_name)); top.append(copy, ui.toCrm); ui.chatTitle.append(top, link('Профиль Avito ↗', row.chat.counterparty && row.chat.counterparty.profile_url));
    ui.toCrm.disabled = false;
    var preferences = chatPreferences(); if (!preferences.niche) return;
    var owner = scope(), saved = preferences.niches[key(row)], guessed = clientTopics(row.chat.counterparty && row.chat.counterparty.name), niche = btn('Ниша: ' + (typeof saved === 'string' && saved.trim() ? saved : guessed || 'не определена') + (saved ? '' : guessed ? ' · по имени, предположение' : ''), 'Изменить нишу вручную. Объявления и архив чужого аккаунта API не предоставляет.', function () {
      var input = el('input'); input.type = 'text'; input.maxLength = 120; input.value = typeof saved === 'string' ? saved : guessed; input.setAttribute('aria-label', 'Ниша клиента');
      var form = el('form', 'avchat-niche-editor'), save = btn('Сохранить', '', function () {}); save.type = 'submit'; form.append(input, save, btn('Отмена', '', renderChatTitle));
      form.addEventListener('submit', async function (event) { event.preventDefault(); if (!state.chat || key(state.chat) !== key(row) || scope() !== owner || ui.nicheSetting.disabled) return; var next = chatPreferences(); next.niches[key(row)] = input.value.trim().slice(0, 120); save.disabled = true; var saved = await saveChatPreferences(next, owner); if (scope() === owner && state.chat && key(state.chat) === key(row)) { if (saved) renderChatTitle(); else save.disabled = false; } });
      ui.chatTitle.appendChild(form); niche.hidden = true; input.focus();
    }); niche.className = 'avchat-niche'; ui.chatTitle.appendChild(niche);
  }
  function layoutKey() { return 'avitolog_chat_layout_v1:' + (scope() || 'local'); }
  function settingRead(key) { return window.AvitoChatStore ? window.AvitoChatStore.getItem(key) : localStorage.getItem(key); }
  function settingWrite(key, raw) {
    if (window.AvitoChatStore) return window.AvitoChatStore.setItem(key, raw);
    try { localStorage.setItem(key, raw); return Promise.resolve(); } catch (error) { return Promise.reject(error); }
  }
  function updateStorageInfo() {
    if (!ui.storageInfo || !window.AvitoChatStore) return;
    var info = window.AvitoChatStore.stats(), mib = function (value) { return (value / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); };
    ui.storageInfo.textContent = (info.backend === 'indexeddb' ? 'Настройки: IndexedDB.' : info.backend === 'localstorage' ? 'Настройки: резервное хранилище браузера.' : 'Хранилище настроек недоступно.') + ' LocalStorage: ' + mib(info.localBytes) + ' МБ.';
    ui.storageInfo.title = 'Объём в LocalStorage: CRM ' + mib(info.categories.crm) + ' МБ; проекты ' + mib(info.categories.projects) + ' МБ; финансы ' + mib(info.categories.finance) + ' МБ; кэш картинок ' + mib(info.categories.imageCache) + ' МБ; другое ' + mib(info.categories.other) + ' МБ. Пользовательские данные не очищаются.';
  }
  function layoutSettings() {
    var owner = layoutKey();
    if (owner !== layoutOwner) {
      layoutOwner = owner; layout = {};
      try { var saved = JSON.parse(settingRead(owner) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) layout = saved; } catch (e) {}
    }
    var mode = state.mode === 'closed' ? layout.lastMode === 'web' ? 'web' : 'mini' : state.mode;
    if (!layout[mode] || typeof layout[mode] !== 'object' || Array.isArray(layout[mode])) layout[mode] = {};
    return layout[mode];
  }
  function saveLayout() { var owner = scope(); if (!owner) return; settingWrite(layoutOwner, JSON.stringify(layout)).catch(function () { if (scope() === owner) notice('Положение окна не сохранилось. Браузер не подтвердил запись.', true); }); }
  function bounded(value, fallback, min, max) { return Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : fallback)); }
  function chatGeometry(mode, saved, viewportWidth, viewportHeight) {
    var small = viewportWidth <= 650, marginX = small ? 8 : mode === 'web' ? 35 : 18, marginY = small ? 8 : mode === 'web' ? 30 : 18;
    var viewportMaxWidth = Math.max(1, viewportWidth - marginX * 2), viewportMaxHeight = Math.max(1, viewportHeight - marginY * 2);
    var width = bounded(saved.width, mode === 'web' ? viewportMaxWidth : 440, Math.min(360, viewportMaxWidth), viewportMaxWidth);
    var height = bounded(saved.height, mode === 'web' ? viewportMaxHeight : 680, Math.min(320, viewportMaxHeight), viewportMaxHeight);
    var right = bounded(saved.right, marginX, marginX, Math.max(marginX, viewportWidth - width - marginX));
    var bottom = bounded(saved.bottom, marginY, marginY, Math.max(marginY, viewportHeight - height - marginY));
    var maxWidth = Math.max(1, viewportWidth - right - marginX), maxHeight = Math.max(1, viewportHeight - bottom - marginY);
    var minSplit = Math.min(140, Math.floor(width * .38)), maxSplit = Math.max(minSplit, width - 10 - Math.min(280, Math.floor(width * .5)));
    var split = bounded(saved.split, mode === 'web' && !small ? 300 : width * .35, minSplit, maxSplit);
    return { width: width, height: height, split: split, minSplit: minSplit, maxSplit: maxSplit, maxWidth: maxWidth, maxHeight: maxHeight, right: right, bottom: bottom, marginX: marginX, marginY: marginY };
  }
  function applyChatLayout() {
    if (!ui.panel || state.mode === 'closed') return null;
    var geometry = chatGeometry(state.mode, layoutSettings(), window.innerWidth, window.innerHeight);
    ui.panel.style.width = geometry.width + 'px'; ui.panel.style.height = geometry.height + 'px';
    ui.panel.style.right = geometry.right + 'px'; ui.panel.style.bottom = geometry.bottom + 'px';
    ui.list.style.width = geometry.split + 'px';
    ui.split.setAttribute('aria-valuemin', String(Math.round(geometry.minSplit))); ui.split.setAttribute('aria-valuemax', String(Math.round(geometry.maxSplit))); ui.split.setAttribute('aria-valuenow', String(Math.round(geometry.split)));
    return geometry;
  }
  function finishResize(commit) {
    if (!activeResize) return;
    var resize = activeResize; activeResize = null;
    window.removeEventListener('pointermove', moveResize); window.removeEventListener('pointerup', endResize); window.removeEventListener('pointercancel', cancelResize); window.removeEventListener('keydown', resizeEscape);
    delete ui.panel.dataset.resizing;
    if (!commit) { layout[resize.mode] = resize.before; applyChatLayout(); } else saveLayout();
    try { resize.handle.releasePointerCapture(resize.pointerId); } catch (e) {}
  }
  function moveResize(event) {
    if (!activeResize || event.pointerId !== activeResize.pointerId) return;
    if (state.mode !== activeResize.mode || layoutKey() !== activeResize.owner) { finishResize(false); return; }
    event.preventDefault();
    var resize = activeResize, saved = layoutSettings(), dx = event.clientX - resize.x, dy = event.clientY - resize.y;
    if (resize.kind === 'left' || resize.kind === 'corner') saved.width = Math.min(resize.geometry.maxWidth, resize.geometry.width - dx);
    if (resize.kind === 'top' || resize.kind === 'corner') saved.height = Math.min(resize.geometry.maxHeight, resize.geometry.height - dy);
    if (resize.kind === 'split') saved.split = resize.geometry.split + dx;
    if (resize.kind === 'move') {
      saved.right = bounded(resize.geometry.right - dx, resize.geometry.right, resize.geometry.marginX, Math.max(resize.geometry.marginX, window.innerWidth - resize.geometry.width - resize.geometry.marginX));
      saved.bottom = bounded(resize.geometry.bottom - dy, resize.geometry.bottom, resize.geometry.marginY, Math.max(resize.geometry.marginY, window.innerHeight - resize.geometry.height - resize.geometry.marginY));
    }
    var actual = applyChatLayout();
    if (resize.kind === 'left' || resize.kind === 'corner') saved.width = actual.width;
    if (resize.kind === 'top' || resize.kind === 'corner') saved.height = actual.height;
    if (resize.kind === 'split') saved.split = actual.split;
  }
  function endResize(event) { if (activeResize && event.pointerId === activeResize.pointerId) finishResize(true); }
  function cancelResize(event) { if (activeResize && event.pointerId === activeResize.pointerId) finishResize(false); }
  function resizeEscape(event) { if (event.key === 'Escape' && activeResize) { event.preventDefault(); finishResize(false); } }
  function chatResizeHandle(kind, label, orientation) {
    var handle = el('div', 'avchat-resize avchat-resize-' + kind); handle.tabIndex = 0; handle.title = label + '. Двойное нажатие: исходный размер'; handle.setAttribute('aria-label', label);
    handle.setAttribute('role', kind === 'corner' ? 'button' : 'separator'); if (orientation) handle.setAttribute('aria-orientation', orientation);
    handle.addEventListener('pointerdown', function (event) {
      if (activeResize || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); var saved = layoutSettings(), geometry = applyChatLayout();
      activeResize = { kind: kind, handle: handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, geometry: geometry, before: Object.assign({}, saved), mode: state.mode, owner: layoutOwner };
      ui.panel.dataset.resizing = kind === 'split' || kind === 'left' ? 'horizontal' : kind === 'top' ? 'vertical' : 'corner';
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
      window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', endResize); window.addEventListener('pointercancel', cancelResize); window.addEventListener('keydown', resizeEscape);
    });
    handle.addEventListener('dblclick', function () {
      finishResize(false); var saved = layoutSettings();
      if (kind === 'left' || kind === 'corner') delete saved.width;
      if (kind === 'top' || kind === 'corner') delete saved.height;
      if (kind === 'split') delete saved.split;
      applyChatLayout(); saveLayout();
    });
    handle.addEventListener('keydown', function (event) {
      var dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if ((!dx || kind === 'top') && (!dy || kind === 'left' || kind === 'split')) return;
      event.preventDefault(); var saved = layoutSettings(), geometry = applyChatLayout(), step = event.shiftKey ? 50 : 20;
      if (kind === 'left' || kind === 'corner') saved.width = Math.min(geometry.maxWidth, geometry.width - dx * step);
      if (kind === 'top' || kind === 'corner') saved.height = Math.min(geometry.maxHeight, geometry.height - dy * step);
      if (kind === 'split') saved.split = geometry.split + dx * step;
      var actual = applyChatLayout();
      if (kind === 'left' || kind === 'corner') saved.width = actual.width;
      if (kind === 'top' || kind === 'corner') saved.height = actual.height;
      if (kind === 'split') saved.split = actual.split;
      saveLayout();
    });
    return handle;
  }
  function chatMoveHandle(handle) {
    handle = handle || el('div', 'avchat-drag-edge'); handle.tabIndex = 0; handle.title = 'Перетащите окно. Стрелки: переместить; двойное нажатие: исходное положение'; handle.setAttribute('aria-label', 'Переместить окно чата');
    function control(event) {
      for (var node = event.target; node && node !== handle; node = node.parentNode) {
        if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A|SUMMARY)$/.test(node.tagName) || node.isContentEditable) return true;
      }
      return false;
    }
    handle.addEventListener('pointerdown', function (event) {
      if (activeResize || event.button !== 0 || event.isPrimary === false || control(event)) return;
      event.preventDefault(); event.stopPropagation(); var saved = layoutSettings(), geometry = applyChatLayout();
      activeResize = { kind: 'move', handle: handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, geometry: geometry, before: Object.assign({}, saved), mode: state.mode, owner: layoutOwner };
      ui.panel.dataset.resizing = 'moving';
      try { handle.setPointerCapture(event.pointerId); } catch (e) {}
      window.addEventListener('pointermove', moveResize); window.addEventListener('pointerup', endResize); window.addEventListener('pointercancel', cancelResize); window.addEventListener('keydown', resizeEscape);
    });
    handle.addEventListener('dblclick', function (event) { if (control(event)) return; event.stopPropagation(); finishResize(false); var saved = layoutSettings(); delete saved.right; delete saved.bottom; applyChatLayout(); saveLayout(); });
    handle.addEventListener('keydown', function (event) {
      if (control(event)) return;
      var dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation(); var saved = layoutSettings(), geometry = applyChatLayout(), step = event.shiftKey ? 50 : 20;
      saved.right = bounded(geometry.right - dx * step, geometry.right, geometry.marginX, Math.max(geometry.marginX, window.innerWidth - geometry.width - geometry.marginX));
      saved.bottom = bounded(geometry.bottom - dy * step, geometry.bottom, geometry.marginY, Math.max(geometry.marginY, window.innerHeight - geometry.height - geometry.marginY));
      applyChatLayout(); saveLayout();
    });
    return handle;
  }
  function setMode(mode) {
    var previous = state.mode, sameOwner = layoutOwner === layoutKey(); finishResize(false); layoutSettings();
    state.restoreOnReady = mode !== 'closed' && mode !== 'mini' && mode !== 'web' && !scope();
    if (mode !== 'closed' && mode !== 'mini' && mode !== 'web') mode = layout.lastMode === 'web' ? 'web' : 'mini';
    if (mode !== 'closed') { layout.lastMode = mode; saveLayout(); }
    else if (sameOwner && (previous === 'mini' || previous === 'web')) { layout.lastMode = previous; saveLayout(); }
    state.mode = mode; ui.panel.hidden = mode === 'closed'; ui.launch.hidden = mode !== 'closed'; ui.panel.dataset.mode = mode;
    ui.nicheSetting.disabled = !scope() || state.preferenceSavingOwner === scope();
    if (mode !== 'closed') { applyChatLayout(); refresh(false); }
  }
  function reset() {
    state.selectionRefresh = false; state.selectionSaving = false; state.preferenceSavingOwner = ''; state.restoreOnReady = false; state.importing = null; selectionVersion += 1;
    state.generation += 1; state.scope = ''; state.accounts = []; state.selected = []; state.chats = []; state.chat = null; state.loading = false; state.sending = false; state.lastPoll = 0;
    messages = Object.create(null); chatPages = Object.create(null); if (ui.list) { empty(ui.list); empty(ui.history); empty(ui.accounts); ui.text.value = ''; ui.compose.hidden = true; ui.import.hidden = true; ui.refresh.disabled = false; ui.send.disabled = false; ui.toCrm.disabled = true; if (ui.replies) ui.replies.reset(); ui.nicheSetting.checked = false; ui.nicheSetting.disabled = false; renderChatTitle(); notice(''); setMode('closed'); }
  }
  function renderAccounts() {
    empty(ui.accounts);
    state.accounts.forEach(function (account) {
      var label = el('label'), input = el('input'); input.type = 'checkbox'; input.checked = state.selected.indexOf(account.id) !== -1;
      input.addEventListener('change', async function () {
        var owner = state.scope, version = ++selectionVersion; state.selectionSaving = true;
        state.selected = input.checked ? state.selected.concat([account.id]) : state.selected.filter(function (id) { return id !== account.id; });
        if (state.chat && state.selected.indexOf(state.chat.account.id) === -1) { state.chat = null; empty(ui.history); ui.compose.hidden = true; ui.import.hidden = true; if (ui.replies) ui.replies.reset(); renderChatTitle(); }
        renderChats(); var saved = await saveSelection();
        if (owner !== scope() || version !== selectionVersion) return;
        state.selectionSaving = false; if (!saved) return;
        state.lastPoll = 0; if (state.loading) state.selectionRefresh = true; else refresh(false);
      });
      label.append(input, el('span', '', account.display_name)); ui.accounts.appendChild(label);
    });
  }
  function selectionKey() { return 'avitolog_chat_accounts_v1:' + state.scope; }
  function saveSelection() { var owner = state.scope; return settingWrite(selectionKey(), JSON.stringify(state.selected)).then(function () { return true; }, function () { if (scope() === owner) notice('Выбор аккаунтов не сохранился. Браузер не подтвердил запись.', true); return false; }); }
  function chooseAccounts() {
    var saved = null; try { saved = JSON.parse(settingRead(selectionKey()) || 'null'); } catch (e) {}
    state.selected = Array.isArray(saved) ? state.accounts.filter(function (a) { return saved.indexOf(a.id) !== -1; }).map(function (a) { return a.id; }) : state.accounts.filter(function (a) { return /филproдвижение|филпродвижение|filaiмаркетинг/.test(norm(a.display_name)); }).map(function (a) { return a.id; });
  }
  function renderChats() {
    empty(ui.list); var rows = state.chats.filter(function (row) { return state.selected.indexOf(row.account.id) !== -1; }).sort(function (a, b) { return (b.chat.updated || b.chat.created || 0) - (a.chat.updated || a.chat.created || 0); });
    rows.forEach(function (row) {
      var button = btn('', name(row), function () { openChat(row); }); button.className = 'avchat-row'; button.dataset.active = state.chat && key(state.chat) === key(row) ? 'true' : 'false';
      var avatar = el('span', 'avchat-avatar', chatEmoji(row)); avatar.setAttribute('aria-hidden', 'true'); var copy = el('span', 'avchat-row-copy');
      copy.append(el('strong', '', (row.chat.unread ? '● ' : '') + name(row)), el('small', '', row.account.display_name), el('span', '', row.chat.last_message && row.chat.last_message.text || row.chat.item && row.chat.item.title || 'Открыть переписку')); button.append(avatar, copy);
      ui.list.appendChild(button);
    });
    if (!rows.length) ui.list.appendChild(el('p', 'avchat-empty', state.selected.length ? 'Чаты ещё не загружены или отсутствуют.' : 'Выберите аккаунты в настройках чата.'));
    state.accounts.filter(function (a) { return state.selected.indexOf(a.id) !== -1 && chatPages[a.id] && chatPages[a.id].hasMore; }).forEach(function (a) { ui.list.appendChild(btn('Ещё · ' + a.display_name, 'Загрузить следующую страницу чатов', function () { loadMoreChats(a); })); });
  }
  function mergeChats(account, result, offset) {
    var byId = Object.create(null);
    state.chats.filter(function (r) { return r.account.id === account.id; }).forEach(function (r) { byId[r.chat.id] = r; });
    (result.chats || []).forEach(function (chat) { byId[chat.id] = { chat: chat, account: account }; });
    state.chats = state.chats.filter(function (r) { return r.account.id !== account.id; }).concat(Object.keys(byId).map(function (id) { return byId[id]; }));
    if (offset || !chatPages[account.id]) chatPages[account.id] = { offset: offset, hasMore: !!(result.pagination && result.pagination.has_more) && offset < 1000 };
  }
  async function loadMoreChats(account) {
    var page = chatPages[account.id], generation = state.generation;
    if (!page || !page.hasMore || page.loading) return;
    page.loading = true;
    try { var result = await bridge.getChats(account.id, page.offset + 50); if (current(generation)) { mergeChats(account, result, page.offset + 50); renderChats(); } }
    catch (error) { if (current(generation)) notice(errorText(error), true); }
    finally { page.loading = false; }
  }
  async function refresh(force) {
    if (!bridge || state.loading || state.mode === 'closed' || document.visibilityState === 'hidden') return;
    var next = scope();
    if (!next) { ui.nicheSetting.disabled = true; notice(window.AVITOLOG_BACKEND_MODE && window.AVITOLOG_BACKEND_INITIAL_SYNC_READY !== true ? 'Восстанавливаем вход и режим. Сохранённые настройки появятся автоматически.' : 'Для чата нужен вход в CRM и доступ к организации аккаунтов.', true); return; }
    if (state.scope && state.scope !== next) reset();
    state.scope = next;
    if (state.preferenceSavingOwner !== next) { ui.nicheSetting.checked = chatPreferences().niche; ui.nicheSetting.disabled = false; }
    if (state.restoreOnReady || layoutOwner !== layoutKey()) {
      finishResize(false); layoutSettings();
      if (state.restoreOnReady) state.mode = layout.lastMode === 'web' ? 'web' : 'mini';
      state.restoreOnReady = false; layout.lastMode = state.mode; ui.panel.dataset.mode = state.mode; applyChatLayout();
    }
    if (!force && Date.now() - state.lastPoll < 30000) return;
    var generation = state.generation; state.loading = true; ui.refresh.disabled = true; notice('Обновление чатов…');
    try {
      if (!state.accounts.length || force) {
        var catalog = await bridge.listAccounts(force); if (!current(generation)) return;
        state.accounts = catalog;
        if (state.selectionSaving) state.selected = state.selected.filter(function (id) { return catalog.some(function (account) { return account.id === id; }); }); else chooseAccounts();
        renderAccounts();
        if (!ui.nicheSetting.disabled) ui.nicheSetting.checked = chatPreferences().niche;
        renderChatTitle();
      }
      var selected = state.accounts.filter(function (a) { return state.selected.indexOf(a.id) !== -1; }), failed = [];
      for (var i = 0; i < selected.length; i += 2) {
        await Promise.all(selected.slice(i, i + 2).map(async function (account) {
          try {
            var result = await bridge.getChats(account.id); if (!current(generation)) return;
            mergeChats(account, result, 0);
          } catch (error) { failed.push(account.display_name + ': ' + errorText(error)); }
        }));
      }
      if (!current(generation)) return;
      state.lastPoll = Date.now(); renderChats(); notice(failed.join(' · ') || 'Чаты обновлены. Новые сообщения проверяются, пока окно открыто.', !!failed.length);
      if (state.chat) await loadMessages(state.chat, false);
    } catch (error) { if (current(generation)) notice(errorText(error), true); }
    finally { if (current(generation)) { state.loading = false; ui.refresh.disabled = false; if (state.selectionRefresh) { state.selectionRefresh = false; state.lastPoll = 0; refresh(false); } } }
  }
  function renderMessages(row, scroll) {
    if (!state.chat || key(row) !== key(state.chat)) return;
    var previousTop = ui.history.scrollTop, pinned = ui.history.scrollHeight - ui.history.scrollTop - ui.history.clientHeight < 50;
    empty(ui.history);
    var entry = messages[key(row)], list = entry && entry.messages || [];
    list.slice().sort(function (a, b) { return (a.created || 0) - (b.created || 0); }).forEach(function (message) {
      var bubble = el('div', 'avchat-message'); bubble.dataset.direction = message.direction || 'in';
      bubble.appendChild(el('div', '', message.text || (message.type === 'image' ? 'Фото' : 'Сообщение: ' + message.type)));
      if (message.image_url) bubble.appendChild(link('Открыть изображение', message.image_url));
      if (message.link_url) bubble.appendChild(link('Открыть ссылку', message.link_url));
      if (message.created) bubble.appendChild(el('small', '', new Date(message.created * 1000).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
      ui.history.appendChild(bubble);
    });
    if (!list.length) ui.history.appendChild(el('p', 'avchat-empty', 'Сообщения ещё не получены.'));
    ui.older.hidden = !(entry && entry.hasMore);
    ui.history.scrollTop = scroll || pinned ? ui.history.scrollHeight : previousTop;
  }
  async function loadMessages(row, older) {
    var owner = key(row), generation = state.generation, entry = messages[owner];
    if (entry && entry.loading) return;
    messages[owner] = Object.assign({ messages: [], offset: 0 }, entry, { loading: true });
    var offset = older && entry ? entry.offset + 50 : 0;
    try {
      var result = await bridge.getMessages(row.account.id, row.chat.id, offset);
      if (!current(generation)) return;
      var byId = Object.create(null), combined = (entry ? entry.messages : []).concat(result.messages || []);
      combined.forEach(function (message) { byId[message.id] = message; });
      messages[owner] = { messages: Object.keys(byId).map(function (id) { return byId[id]; }), offset: older ? offset : entry && entry.offset || 0, hasMore: older || !entry ? !!(result.pagination && result.pagination.has_more) && offset < 1000 : entry.hasMore, loading: false }; renderMessages(row);
      if (state.chat && key(state.chat) === owner && state.mode !== 'closed' && row.chat.unread === true && document.visibilityState !== 'hidden') {
        bridge.markRead(row.account.id, row.chat.id).then(function () { if (current(generation) && state.chat && key(state.chat) === owner) { row.chat.unread = false; renderChats(); } }).catch(function () {});
      }
    } catch (error) { if (current(generation)) { messages[owner].loading = false; notice(errorText(error), true); } }
  }
  function openChat(row) {
    if (state.sending) return;
    state.chat = row; ui.text.value = ''; renderChatTitle();
    ui.compose.hidden = false; ui.import.hidden = true; if (ui.replies) { ui.replies.reset(); ui.replies.setEnabled(true); } renderChats(); renderMessages(row, true); loadMessages(row, false);
  }
  async function send(event) {
    event.preventDefault(); return sendText(ui.text.value, true);
  }
  async function sendText(text, fromDraft) {
    if (!state.chat || state.sending || !String(text || '').trim() || !state.scope || state.scope !== scope()) { if (!fromDraft) throw new Error('context_changed'); return; }
    var row = state.chat, generation = state.generation;
    if (Array.from(text).length > 1000) { notice('В сообщении не больше 1000 символов.', true); if (!fromDraft) throw new Error('invalid_request'); return; }
    state.sending = true; ui.send.disabled = true; if (ui.replies) ui.replies.setEnabled(false); notice('Отправка…');
    try {
      var sent = await bridge.sendMessage(row.account.id, row.chat.id, text);
      if (!current(generation)) return;
      if (fromDraft && ui.text.value === text) ui.text.value = '';
      if (sent && sent.message) {
        var entry = messages[key(row)] || { messages: [], offset: 0, hasMore: false, loading: false };
        entry.messages = entry.messages.filter(function (message) { return message.id !== sent.message.id; }).concat([sent.message]);
        messages[key(row)] = entry; renderMessages(row, true);
      }
      notice('Отправлено'); await loadMessages(row, false);
    } catch (error) { if (current(generation)) notice(errorText(error), true); if (!fromDraft) throw error; }
    finally { if (current(generation)) { state.sending = false; ui.send.disabled = false; if (ui.replies) ui.replies.setEnabled(!!state.chat); } }
  }
  function dataKey(base) { return typeof window.AVITOLOG_KEY === 'function' ? window.AVITOLOG_KEY(base) : base; }
  var importTasks = Object.create(null);
  function importFolderId(client) {
    var value = String(client && (client.folderId || client.folder_id || client.drive_folder_id) || '').trim();
    if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
    try { var url = new URL(client && (client.folderLink || client.driveFolderUrl || client.folderUrl) || ''); var match = url.pathname.match(/^\/drive\/folders\/([a-zA-Z0-9_-]+)\/?$/); return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password && match ? match[1] : ''; } catch (_) { return ''; }
  }
  function assertImportScope(owner, generation) { if (!owner || scope() !== owner || state.scope !== owner || state.generation !== generation) throw new Error('context_changed'); }
  function sameImportChat(row) { return !!state.chat && state.chat.account.id === row.account.id && state.chat.chat.id === row.chat.id; }
  function focusImportedClient(client, row, owner, generation) {
    assertImportScope(owner, generation); if (!sameImportChat(row)) return false;
    try {
      window._selectedProjectId = null;
      if (typeof window.markProjectRowSelection === 'function') window.markProjectRowSelection('');
      assertImportScope(owner, generation);
      if (typeof window.setActiveClient === 'function') window.setActiveClient(client);
      assertImportScope(owner, generation);
      if (typeof window.fillClientForm === 'function') window.fillClientForm(client);
      else if (typeof window.fillClientFormFromData === 'function') window.fillClientFormFromData(client);
      else return false;
      return true;
    } catch (error) { if (error.message === 'context_changed') throw error; return false; }
  }
  function loadGoals() {
    var live = typeof window.__avitologAdsGoalsRead === 'function' && window.__avitologAdsGoalsRead([]);
    var value = live && live.live ? JSON.parse(JSON.stringify(live.live)) : JSON.parse(localStorage.getItem(dataKey('avitolog_goals_v1')) || '{"projects":[]}');
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.projects)) throw new Error('invalid_goals');
    return value;
  }
  function saveGoals(value) {
    var keyName = dataKey('avitolog_goals_v1'), old = localStorage.getItem(keyName), raw = JSON.stringify(value), written = false;
    try { localStorage.setItem(keyName, raw); written = true; } catch (error) { if (!/quota/i.test(String(error.name) + ' ' + String(error.message))) throw error; }
    var memory = typeof window.__goalsApplyBackendValue === 'function' && window.__goalsApplyBackendValue(keyName, raw);
    if (!written && !memory) throw new Error('storage_unavailable');
    document.dispatchEvent(new CustomEvent('avitolog:storage-write', { detail: { key: keyName, value: raw, previousValue: old } }));
  }
  function importClient(row, title, category, week, selectedClientId) {
    if (!scope() || state.scope !== scope() || !title.trim() || title.length > 200 || typeof window.getCrmClients !== 'function' || typeof window.saveCrmClients !== 'function') throw new Error('context_changed');
    var capturedScope = scope(), generation = state.generation;
    var categories = typeof CRM_CATEGORY_OPTIONS !== 'undefined' ? CRM_CATEGORY_OPTIONS : [];
    if (!categories.some(function (c) { return String(c.v) === category; }) || !Number.isInteger(week) || week < 0 || week > 4) throw new Error('invalid_request');
    var identity = row.account.avito_user_id + ':' + row.chat.id, taskKey = capturedScope + '|' + generation + '|' + identity;
    if (importTasks[taskKey]) return importTasks[taskKey];
    var task = (async function () {
    var clients = window.getCrmClients().slice(), index = clients.findIndex(function (c) { return c && (c.avito_chat_key === identity || Array.isArray(c.avito_chat_keys) && c.avito_chat_keys.indexOf(identity) !== -1); });
    if (selectedClientId) {
      var selectedIndex = clients.findIndex(function (c) { return c && String(c.client_id) === selectedClientId; });
      if (selectedIndex < 0 || index >= 0 && index !== selectedIndex) throw new Error('chat_already_linked');
      index = selectedIndex;
    }
    var existing = index >= 0 ? clients[index] : null;
    var client = Object.assign({}, existing || {}, { client_id: existing && existing.client_id || 'avito_' + crypto.randomUUID(), company: title.trim(), contact_name: existing && existing.contact_name || row.chat.counterparty && row.chat.counterparty.name || '', avito_account: existing && existing.avito_account || safeUrl(row.chat.counterparty && row.chat.counterparty.profile_url), categoryFolderId: category, avito_chat_key: existing && existing.avito_chat_key || identity, avito_chat_keys: Array.from(new Set((existing && existing.avito_chat_keys || []).concat(existing && existing.avito_chat_key || [], identity))), avito_chat_id: existing && existing.avito_chat_id || row.chat.id, avito_origin_account_id: existing && existing.avito_origin_account_id || row.account.id, avito_origin_user_id: existing && existing.avito_origin_user_id || row.account.avito_user_id, createdAt: existing && existing.createdAt || new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) });
    var folderId = importFolderId(client);
    if (folderId) { client.folderId = folderId; client.folderLink = client.folderLink || 'https://drive.google.com/drive/folders/' + folderId; }
    else { client.folder_name = client.folder_name || client.company + ' (' + client.createdAt + ')'; client.avito_drive_parent_id = client.avito_drive_parent_id || category; }
    if (index >= 0) clients[index] = client; else clients.unshift(client);
    assertImportScope(capturedScope, generation);
    window.saveCrmClients(clients);
    assertImportScope(capturedScope, generation);
    if (week) {
      var goals = loadGoals(), goal = goals.projects.find(function (p) { return p && (p.crmClientRecordId === client.client_id || p.avitoChatKey === identity); });
      if (!goal) {
        var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        var sources = goals.sourceAccounts = Array.isArray(goals.sourceAccounts) ? goals.sourceAccounts : [];
        var source = sources.find(function (s) { return s.avitoUserId === row.account.avito_user_id || norm(s.name) === norm(row.account.display_name); });
        if (!source) { source = { id: 'avito_' + row.account.avito_user_id, name: row.account.display_name, icon: '👤', avitoUserId: row.account.avito_user_id }; sources.push(source); }
        goal = { id: 'g_' + crypto.randomUUID(), name: title.trim(), company: title.trim(), contact_name: client.contact_name, avito_account: client.avito_account, categoryFolderId: category, crmClientRecordId: client.client_id, avitoChatKey: identity, sourceAccountId: source.id, date: today, weekIndex: week, stage: 'weekly', status: [], statusDates: {}, touchMarkers: [], tags: [], mainPrice: '', priceOptions: ['—'], note: '' };
        goals.projects.unshift(goal);
      } else goal.weekIndex = week;
      if (folderId && !importFolderId(goal)) { goal.folderId = folderId; goal.folderLink = client.folderLink; goal.folder_name = client.folder_name || client.company; }
      assertImportScope(capturedScope, generation);
      saveGoals(goals);
      if (window.AVITOLOG_GOALS && typeof window.AVITOLOG_GOALS.render === 'function' && window.goalsMode) window.AVITOLOG_GOALS.render();
    }
    var sidebarReady = focusImportedClient(client, row, capturedScope, generation), drivePending = false, syncPending = false;
    if (!folderId) {
      var intendedName = client.folder_name, intendedParent = client.avito_drive_parent_id;
      try {
        if (typeof window.driveCreateClientFolder !== 'function') throw new Error('drive_unavailable');
        folderId = await window.driveCreateClientFolder(intendedName, intendedParent, function () { assertImportScope(capturedScope, generation); });
        assertImportScope(capturedScope, generation);
        if (typeof folderId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(folderId)) throw new Error('drive_unavailable');
        // Re-read after Drive: a slow request must never overwrite newer CRM edits.
        var latest = window.getCrmClients().slice(), latestIndex = latest.findIndex(function (c) { return c && String(c.client_id) === String(client.client_id); });
        if (latestIndex < 0) throw new Error('client_removed');
        var currentClient = latest[latestIndex], currentFolder = importFolderId(currentClient);
        if (!currentFolder && (currentClient.folder_name !== intendedName || currentClient.avito_drive_parent_id !== intendedParent)) throw new Error('client_changed');
        client = Object.assign({}, currentClient);
        client.folderId = currentFolder || folderId;
        client.folderLink = client.folderLink || 'https://drive.google.com/drive/folders/' + client.folderId;
        latest[latestIndex] = client; assertImportScope(capturedScope, generation); window.saveCrmClients(latest); assertImportScope(capturedScope, generation);
        if (week) {
          var latestGoals = loadGoals(), changed = false;
          latestGoals.projects.forEach(function (p) { if (p && (p.crmClientRecordId === client.client_id || p.avitoChatKey === identity) && !importFolderId(p)) { p.folderId = client.folderId; p.folderLink = client.folderLink; p.folder_name = client.folder_name; changed = true; } });
          if (changed) { assertImportScope(capturedScope, generation); saveGoals(latestGoals); }
        }
        sidebarReady = focusImportedClient(client, row, capturedScope, generation);
      } catch (error) {
        assertImportScope(capturedScope, generation);
        if (error.message === 'client_removed' || error.message === 'client_changed') throw error;
        var savedClient = window.getCrmClients().find(function (c) { return c && String(c.client_id) === String(client.client_id); });
        if (!savedClient) throw new Error('client_removed');
        client = Object.assign({}, savedClient);
        drivePending = !importFolderId(client); syncPending = !drivePending;
        sidebarReady = focusImportedClient(client, row, capturedScope, generation);
      }
    }
    return { client: client, existing: !!existing, drivePending: drivePending, syncPending: syncPending, folderReady: !!importFolderId(client), sidebarReady: sidebarReady };
    })();
    importTasks[taskKey] = task;
    task.then(function () { if (importTasks[taskKey] === task) delete importTasks[taskKey]; }, function () { if (importTasks[taskKey] === task) delete importTasks[taskKey]; });
    return task;
  }
  function showImport() {
    if (!state.chat) return; ui.import.hidden = false; ui.clientName.value = name(state.chat); empty(ui.category);
    empty(ui.existing); var create = el('option', '', 'Создать нового клиента'); create.value = ''; ui.existing.appendChild(create);
    var clients = typeof window.getCrmClients === 'function' ? window.getCrmClients() : [];
    clients.forEach(function (client) { if (!client || !client.client_id) return; var option = el('option', '', client.company || client.contact_name || client.client_id); option.value = client.client_id; ui.existing.appendChild(option); });
    var categories = typeof CRM_CATEGORY_OPTIONS !== 'undefined' ? CRM_CATEGORY_OPTIONS : [];
    categories.forEach(function (c) { var option = el('option', '', c.n); option.value = c.v; ui.category.appendChild(option); });
    if (typeof CRM_DEFAULT_CATEGORY_ID !== 'undefined') ui.category.value = CRM_DEFAULT_CATEGORY_ID;
    ui.importAdd.disabled = false; ui.importLink.disabled = true; ui.clientName.focus();
  }
  function mount() {
    if (!bridge || document.getElementById('avitoChatLauncher')) return;
    var style = el('style'); style.textContent = '.avchat-launch{position:fixed;right:22px;bottom:22px;z-index:3500;width:56px;height:56px;border-radius:50%;font-size:27px;background:#093b42;border:1px solid #29d4c4;color:white;box-shadow:0 6px 25px #0008;cursor:pointer}.avchat-panel{position:fixed;right:18px;bottom:18px;z-index:3501;width:min(440px,calc(100vw - 24px));height:min(680px,calc(100dvh - 32px));display:flex;flex-direction:column;background:#0a1420;color:#e8f4ff;border:1px solid #29485e;border-radius:15px;box-shadow:0 15px 70px #000a;overflow:hidden;font:13px/1.4 Arial,sans-serif}.avchat-panel[hidden],.avchat-panel [hidden]{display:none!important}.avchat-panel[data-mode=web]{inset:30px 35px;width:auto;height:auto}.avchat-head,.avchat-tools,.avchat-chat-title{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #25394b}.avchat-head strong{flex:1}.avchat-panel button,.avchat-panel select,.avchat-panel input,.avchat-panel textarea{color:inherit;background:#122639;border:1px solid #35546a;border-radius:7px;padding:7px;font:inherit}.avchat-panel button{cursor:pointer}.avchat-panel button:disabled{opacity:.5;cursor:wait}.avchat-panel a{color:#64dcff}.avchat-body{display:flex;flex:1;min-height:0}.avchat-conversations{width:42%;overflow:auto;border-right:1px solid #25394b}.avchat-row{display:flex;width:100%;flex-direction:column;gap:3px;text-align:left;border-radius:0!important;border:0!important;border-bottom:1px solid #25394b!important;background:transparent!important;min-width:0}.avchat-row strong,.avchat-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.avchat-row small{font-size:10px;color:#89adca}.avchat-row[data-active=true]{background:#154052!important}.avchat-dialog{flex:1;min-width:0;display:flex;flex-direction:column}.avchat-chat-title{align-items:flex-start;flex-direction:column;gap:2px}.avchat-chat-title small{color:#89adca}.avchat-history{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}.avchat-message{max-width:92%;background:#19354b;padding:8px 10px;border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere}.avchat-message[data-direction=out]{align-self:flex-end;background:#104a44}.avchat-message small{display:block;font-size:10px;color:#a2c2d3;margin-top:5px}.avchat-compose{display:flex;gap:6px;padding:8px}.avchat-compose textarea{resize:vertical;min-height:52px;width:100%;box-sizing:border-box}.avchat-compose button{align-self:flex-end}.avchat-status{padding:6px 12px;font-size:11px;color:#9bbace;max-height:65px;overflow:auto}.avchat-status[data-error=true]{color:#ffb0a8}.avchat-empty{padding:12px;color:#91aec6}.avchat-settings{padding:0 12px;max-height:150px;overflow:auto}.avchat-settings label{display:flex;align-items:center;gap:6px;padding:4px}.avchat-import{display:grid;gap:6px;padding:8px;border-top:1px solid #35546a}.avchat-import input{min-width:0}.avchat-panel[data-mode=mini] .avchat-conversations{width:35%}.avchat-panel[data-mode=web] .avchat-conversations{width:300px}.avchat-panel[data-mode=web] .avchat-dialog{max-width:none}@media(max-width:650px){.avchat-panel[data-mode=web]{inset:8px}.avchat-panel[data-mode=web] .avchat-conversations{width:35%}}'; document.head.appendChild(style);
    style.textContent += '.avchat-panel{box-sizing:border-box;min-width:0;min-height:0}.avchat-panel[data-mode=web]{inset:auto}.avchat-conversations{flex:0 0 auto;min-width:0}.avchat-resize{touch-action:none;user-select:none;-webkit-user-select:none}.avchat-resize-left,.avchat-resize-top,.avchat-resize-corner{position:absolute;z-index:4}.avchat-resize-left{left:0;top:12px;bottom:0;width:8px;cursor:ew-resize}.avchat-resize-top{top:0;left:12px;right:0;height:8px;cursor:ns-resize}.avchat-resize-corner{left:0;top:0;width:16px;height:16px;cursor:nwse-resize}.avchat-resize-split{flex:0 0 8px;cursor:col-resize;border-left:1px solid #25394b;background:#0d1d2b;position:relative}.avchat-resize-split:after{content:"";position:absolute;left:2px;top:45%;width:2px;height:28px;border-radius:3px;background:#496678}.avchat-resize:hover,.avchat-resize:focus-visible{background:#29d4c430;outline:1px solid #29d4c4;outline-offset:-1px}.avchat-panel[data-resizing]{user-select:none;-webkit-user-select:none}.avchat-panel[data-resizing=horizontal],.avchat-panel[data-resizing=horizontal] *{cursor:ew-resize!important}.avchat-panel[data-resizing=vertical],.avchat-panel[data-resizing=vertical] *{cursor:ns-resize!important}.avchat-panel[data-resizing=corner],.avchat-panel[data-resizing=corner] *{cursor:nwse-resize!important}';
    style.textContent += '.avchat-conversations,.avchat-resize-split{box-sizing:border-box}';
    style.textContent += '.avchat-move{touch-action:none;cursor:move!important}.avchat-panel[data-resizing=moving],.avchat-panel[data-resizing=moving] *{cursor:move!important}.avchat-row{flex-direction:row;align-items:center;gap:8px;padding:9px!important}.avchat-avatar{flex:0 0 34px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#244457;font-size:22px}.avchat-row-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.avchat-title-line{display:flex;align-items:center;gap:10px;width:100%;min-width:0}.avchat-title-copy{flex:1;min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere}.avchat-crm{flex:0 0 auto;background:#115349!important;border-color:#27bfa8!important;white-space:nowrap;font-size:12px!important}.avchat-import-actions{display:flex;gap:5px;overflow-x:auto}.avchat-import-actions button{flex:1;white-space:nowrap;font-size:12px!important}.avchat-import-add{background:#136448!important;border-color:#32c68a!important}.avchat-import-link{background:#194e75!important;border-color:#4bb4f5!important}.avchat-import-cancel{background:#612c3a!important;border-color:#d06a7b!important}.avchat-options{margin-left:auto;position:relative}.avchat-options summary{cursor:pointer;list-style:none;padding:5px 9px;border:1px solid #35546a;border-radius:7px;font-size:18px}.avchat-options-menu{position:absolute;right:0;top:35px;width:280px;max-width:calc(100vw - 60px);background:#0d1d2b;border:1px solid #35546a;border-radius:9px;box-shadow:0 10px 30px #0008;z-index:5;padding:10px;max-height:45vh;overflow:auto}.avchat-options-menu label{display:flex;gap:6px;align-items:center;padding:5px 0}.avchat-options-menu small{display:block;color:#9bbace;font-size:11px}.avchat-niche{font-size:11px!important;text-align:left;padding:3px 6px!important;color:#b9c9dd!important}.avchat-niche-editor{display:flex;flex-wrap:wrap;gap:5px;width:100%}.avchat-niche-editor input{min-width:0;flex:1}.avchat-quick-replies{flex:0 0 auto}';
    ui.launch = btn('💬', 'Чаты Avito. Shift + нажатие: большой вид', function (event) { setMode(event.shiftKey ? 'web' : undefined); }); ui.launch.id = 'avitoChatLauncher'; ui.launch.className = 'avchat-launch';
    ui.panel = el('section', 'avchat-panel'); ui.panel.id = 'avitoChatPanel'; ui.panel.hidden = true; ui.panel.setAttribute('aria-label', 'Чаты Avito');
    var head = chatMoveHandle(el('header', 'avchat-head')); head.append(el('strong', '', 'Avito · Чаты'), btn('↗', 'Мини / большой вид (Shift + нажатие)', function (event) { event.stopPropagation(); setMode(state.mode === 'web' ? 'mini' : 'web'); }), btn('—', 'Свернуть чат', function (event) { event.stopPropagation(); setMode('closed'); })); head.addEventListener('click', function (event) { if (event.shiftKey && event.target === head) setMode(state.mode === 'web' ? 'mini' : 'web'); });
    var tools = el('div', 'avchat-tools'); ui.refresh = btn('Обновить', '', function () { refresh(true); }); var settings = el('details', 'avchat-options'), settingsTitle = el('summary', '', '⚙'); settingsTitle.setAttribute('aria-label', 'Настройки чата'); settings.appendChild(settingsTitle); var settingsMenu = el('div', 'avchat-options-menu'); settingsMenu.appendChild(el('strong', '', 'Аккаунты чата')); ui.accounts = el('div', 'avchat-settings'); settingsMenu.appendChild(ui.accounts); var nicheLabel = el('label'); ui.nicheSetting = el('input'); ui.nicheSetting.type = 'checkbox'; ui.nicheSetting.checked = chatPreferences().niche; ui.nicheSetting.addEventListener('change', async function () { var owner = scope(), value = chatPreferences(); value.niche = ui.nicheSetting.checked; if (await saveChatPreferences(value, owner)) renderChatTitle(); else if (scope() === owner) ui.nicheSetting.checked = chatPreferences().niche; }); nicheLabel.append(ui.nicheSetting, el('span', '', 'Подсказка ниши · эксперимент')); ui.storageInfo = el('small', 'avchat-storage-info'); settings.addEventListener('toggle', updateStorageInfo); settingsMenu.append(nicheLabel, el('small', '', 'Предположение по имени собеседника, можно исправить. Чужие объявления и архив через API недоступны.'), ui.storageInfo); settings.appendChild(settingsMenu); tools.append(ui.refresh, settings); updateStorageInfo();
    var body = el('div', 'avchat-body'); ui.list = el('nav', 'avchat-conversations'); ui.split = chatResizeHandle('split', 'Ширина списка переписок', 'vertical'); var dialog = el('div', 'avchat-dialog'); ui.chatTitle = el('div', 'avchat-chat-title'); ui.chatTitle.appendChild(el('strong', '', 'Выберите переписку'));
    ui.toCrm = btn('+ В CRM', 'Добавить клиента в базу или неделю', showImport); ui.toCrm.className = 'avchat-crm'; ui.toCrm.disabled = true;
    ui.older = btn('Ранние сообщения', '', function () { if (state.chat) loadMessages(state.chat, true); }); ui.older.hidden = true;
    ui.history = el('div', 'avchat-history'); ui.compose = el('form', 'avchat-compose'); ui.compose.hidden = true; ui.text = el('textarea'); ui.text.setAttribute('aria-label', 'Сообщение Avito'); ui.text.maxLength = 1000; ui.text.placeholder = 'Сообщение…'; ui.send = btn('➤', 'Отправить сообщение', function () {}); ui.send.type = 'submit'; ui.quick = btn('⚡', 'Быстрые ответы: нажатие на шаблон сразу отправляет его', function () { if (ui.replies) ui.replies.toggle(); }); ui.compose.append(ui.quick, ui.text, ui.send); ui.compose.addEventListener('submit', send);
    ui.text.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ui.compose.requestSubmit(); } });
    ui.import = el('form', 'avchat-import'); ui.import.hidden = true; ui.existing = el('select'); ui.existing.setAttribute('aria-label', 'Новый или существующий клиент'); ui.existing.addEventListener('change', function () { var client = window.getCrmClients().find(function (c) { return c && c.client_id === ui.existing.value; }); ui.clientName.value = client && (client.company || client.contact_name) || name(state.chat); if (client && client.categoryFolderId) ui.category.value = client.categoryFolderId; ui.importAdd.disabled = !!ui.existing.value; ui.importLink.disabled = !ui.existing.value; }); ui.clientName = el('input'); ui.clientName.placeholder = 'Название клиента / проекта'; ui.clientName.setAttribute('aria-label', 'Название клиента'); ui.clientName.maxLength = 200; ui.clientName.required = true; ui.category = el('select'); ui.category.setAttribute('aria-label', 'Категория CRM'); ui.week = el('select'); ui.week.setAttribute('aria-label', 'Неделя CRM'); ['Только в базу', 'Неделя 1', 'Неделя 2', 'Неделя 3', 'Неделя 4'].forEach(function (name, i) { var option = el('option', '', name); option.value = String(i); ui.week.appendChild(option); }); ui.importAdd = btn('➕ Добавить', '', function () {}); ui.importAdd.type = 'submit'; ui.importAdd.className = 'avchat-import-add'; ui.importLink = btn('🔗 Привязать', '', function () {}); ui.importLink.type = 'submit'; ui.importLink.className = 'avchat-import-link'; ui.importLink.disabled = true; var importCancel = btn('✕ Отмена', '', function () { ui.import.hidden = true; }); importCancel.className = 'avchat-import-cancel'; var importActions = el('div', 'avchat-import-actions'); importActions.append(ui.importAdd, ui.importLink, importCancel); ui.import.append(ui.existing, ui.clientName, ui.category, ui.week, importActions);
    ui.import.addEventListener('submit', async function (event) {
      event.preventDefault(); if (!state.chat || state.importing) return;
      var row = state.chat, owner = scope(), generation = state.generation, job = {};
      state.importing = job; ui.importAdd.disabled = true; ui.importLink.disabled = true;
      notice('Сохраняем клиента и готовим папку Drive…');
      try {
        var result = await importClient(row, ui.clientName.value, ui.category.value, Number(ui.week.value), ui.existing.value);
        if (scope() !== owner || state.scope !== owner || state.generation !== generation || !sameImportChat(row)) return;
        ui.import.hidden = !(result.drivePending || result.syncPending);
        notice(result.drivePending ? 'Клиент сохранён в CRM, но папка Drive пока не готова. Войдите через кнопку Drive и повторите добавление: существующий клиент будет использован повторно.' : result.syncPending ? 'Клиент и папка Drive сохранены, но завершение синхронизации не подтверждено. Повторите добавление для проверки: клиент и папка будут использованы повторно.' : (result.existing ? 'Привязка обновлена.' : 'Клиент добавлен.') + ' Папка Drive привязана.' + (result.sidebarReady ? ' Данные открыты слева.' : ' Выберите клиента в базе, чтобы открыть данные слева.'), result.drivePending || result.syncPending);
      } catch (error) {
        if (scope() === owner && state.scope === owner && state.generation === generation && sameImportChat(row)) notice(error.message === 'chat_already_linked' ? 'Переписка уже привязана к другому клиенту. Выберите его в списке.' : 'Не удалось завершить добавление. Проверьте клиента в базе перед повтором; сохранённые данные не удалялись.', true);
      } finally {
        if (state.importing === job) { state.importing = null; if (scope() === owner && state.generation === generation) { ui.importAdd.disabled = !!ui.existing.value; ui.importLink.disabled = !ui.existing.value; } }
      }
    });
    var repliesContainer = el('div', 'avchat-quick-replies');
    if (window.AvitoChatReplies) ui.replies = window.AvitoChatReplies.create({ container: repliesContainer, context: scope, canSend: function () { return !!state.chat && !state.sending && state.scope === scope(); }, variables: function () { return state.chat ? { 'имя': name(state.chat), 'аккаунт': state.chat.account.display_name, 'объявление': state.chat.chat.item && state.chat.chat.item.title || '' } : {}; }, send: function (text, capture) { if (!state.chat || capture.scope !== scope() || state.scope !== scope()) return Promise.reject(new Error('context_changed')); return sendText(text, false); }, onError: function (error) { notice(errorText(error), true); } });
    else ui.quick.disabled = true;
    dialog.append(ui.chatTitle, ui.older, ui.history, ui.import, repliesContainer, ui.compose); body.append(ui.list, ui.split, dialog); ui.status = el('div', 'avchat-status'); ui.status.setAttribute('role', 'status'); ui.panel.append(head, tools, body, ui.status, chatResizeHandle('left', 'Ширина окна чата', 'vertical'), chatResizeHandle('top', 'Высота окна чата', 'horizontal'), chatResizeHandle('corner', 'Размер окна чата')); document.body.append(ui.launch, ui.panel);
    ['left', 'right', 'top', 'bottom'].forEach(function (side) { var edge = chatMoveHandle(); edge.className += ' avchat-drag-' + side; edge.tabIndex = -1; edge.setAttribute('aria-hidden', 'true'); ui.panel.appendChild(edge); });
    style.textContent += '.avchat-head{cursor:move;touch-action:none;user-select:none}.avchat-drag-edge{position:absolute;z-index:5;cursor:move;touch-action:none}.avchat-drag-left{left:0;top:16px;bottom:10px;width:4px}.avchat-drag-right{right:0;top:16px;bottom:10px;width:4px}.avchat-drag-top{top:0;left:16px;right:16px;height:4px}.avchat-drag-bottom{bottom:0;left:10px;right:10px;height:4px}.avchat-resize-left{left:4px}.avchat-resize-top{top:4px}.avchat-resize-corner{z-index:6}';
    window.addEventListener('resize', function () { finishResize(false); applyChatLayout(); });
    document.addEventListener('avitolog:workspace-reset', reset);
    setInterval(function () {
      var next = scope();
      if (state.scope && state.scope !== next) { reset(); return; }
      ui.nicheSetting.disabled = !next || state.preferenceSavingOwner === next;
      if (next && !state.scope && state.mode !== 'closed' && document.visibilityState !== 'hidden') refresh(false);
    }, 1000);
    setInterval(function () { if (state.scope && state.scope !== scope()) reset(); else if (state.mode !== 'closed' && document.visibilityState !== 'hidden') { if (state.chat) loadMessages(state.chat, false); if (Date.now() - state.lastPoll > 45000) refresh(false); } }, 15000);
    if (pendingOpen) { pendingOpen = false; setMode(pendingMode); }
  }
  window.AvitoChat = Object.freeze({ open: function (large) { var mode = arguments.length ? large ? 'web' : 'mini' : undefined; if (ui.panel) setMode(mode); else { pendingOpen = true; pendingMode = mode; } } });
  function start() { if (window.AvitoChatStore) window.AvitoChatStore.ready().then(mount); else mount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
