(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvitoBidding = api.install(root);
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  var MAX_BATCH = 20;
  var CONTACT_GROUP_ID = '00000000-0000-4000-8000-000000000001';
  var GROUP_COLORS = ['#35d0a1', '#54b8ff', '#b18cff', '#f3c56b', '#f38bb0', '#b7c3d4'];
  function statValue(item, key) { var value = item && item.statistics && item.statistics[key]; return Number.isSafeInteger(value) && value >= 0 ? value : null; }
  function sortItems(items, key, direction) {
    if (['contacts', 'views', 'favorites'].indexOf(key) < 0) return items.slice();
    return items.map(function (item, index) { return { item: item, index: index, value: statValue(item, key) }; }).sort(function (a, b) {
      if (a.value == null || b.value == null) return a.value == null && b.value == null ? a.index - b.index : a.value == null ? 1 : -1;
      return (direction === 'asc' ? a.value - b.value : b.value - a.value) || a.index - b.index;
    }).map(function (row) { return row.item; });
  }
  function groupAppearance(group) {
    var name = String(group && group.name || ''), hash = 0;
    Array.from(name).forEach(function (letter) { hash = (Math.imul(hash, 31) + letter.codePointAt(0)) >>> 0; });
    var defaults = /контакт|заяв|лид/i.test(name) ? '☎️' : /дом|строй|ремонт/i.test(name) ? '🏠' : /мебел/i.test(name) ? '🪑' : /авто|машин/i.test(name) ? '🚗' : /тест|нов/i.test(name) ? '✨' : ['📁', '🎯', '💼', '⭐', '🔹'][hash % 5];
    var emoji = group && typeof group.emoji === 'string' && Array.from(group.emoji.trim()).length <= 12 ? group.emoji.trim() : '';
    return { emoji: emoji || defaults, color: group && /^#[0-9a-f]{6}$/i.test(group.color) ? group.color.toLowerCase() : GROUP_COLORS[hash % GROUP_COLORS.length] };
  }
  function allGroups(state) {
    var builtin = state.groups.find(function (row) { return row.id === CONTACT_GROUP_ID; });
    return [Object.assign({}, builtin || {}, { id: CONTACT_GROUP_ID, name: 'Контактные', item_ids: [], automatic: true })].concat(state.groups.filter(function (row) { return row.id !== CONTACT_GROUP_ID; }));
  }
  function groupContains(group, item) { return group.id === CONTACT_GROUP_ID ? statValue(item, 'contacts') > 1 : Array.isArray(group.item_ids) && group.item_ids.map(String).indexOf(String(item.item_id)) >= 0; }
  function mergeStatistics(items, oldItems) {
    var old = new Map(oldItems.map(function (item) { return [String(item.item_id), item]; }));
    return items.map(function (item) {
      var previous = old.get(String(item.item_id));
      var noValues = !item.statistics || ['contacts', 'views', 'favorites'].every(function (key) { return statValue(item, key) == null; });
      if ((!item.statistics || item.statistics_error && noValues) && previous && previous.statistics) return Object.assign({}, item, { statistics: Object.assign({}, previous.statistics, { stale: true }) });
      return item;
    });
  }
  function moneyInput(value) {
    var text = String(value == null ? '' : value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    var number = Number(text), penny = Math.round(number * 100);
    return Number.isSafeInteger(penny) && penny >= 0 ? penny : null;
  }
  function money(value) {
    return Number.isSafeInteger(value) && value >= 0 ? (value / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽' : 'Нет данных';
  }
  function editMoney(value) { return Number.isSafeInteger(value) ? String(value / 100).replace('.', ',') : ''; }
  function moneyRange(low, high) { return Number.isSafeInteger(low) && Number.isSafeInteger(high) && low >= 0 && high >= low; }
  function actionLabel(id) { return { 5: 'пакет кликов (тип 5)', 1: 'звонок', 7: 'контакт в чате' }[id] || 'целевое действие ' + String(id || 'не определено'); }
  function modeLabel(value) { return { manual: 'Своя ставка', auto: 'Автобюджет', base: 'Базовая цена' }[value] || 'Не определён'; }
  function offerAt(ladder, penny) { return (Array.isArray(ladder) ? ladder : []).find(function (row) { return row.value_penny === penny; }) || null; }
  function currentLabel(current) {
    if (!current) return 'Нет данных';
    if (current.mode === 'manual') return money(current.bid_penny) + ' / ' + actionLabel(current.action_type_id) + '; лимит ' + money(current.limit_penny) + '/день';
    if (current.mode === 'auto') return 'Авто: ' + money(current.budget_penny) + ' / ' + ({ '1d': 'день', '7d': '7 дней', '30d': '30 дней' }[current.budget_type] || 'период');
    return modeLabel(current.mode);
  }
  function scopeKey(context) {
    var account = context.account || {};
    return JSON.stringify([context.key, context.organizationId, account.source, account.id, account.avito_user_id, account.credential_version]);
  }
  function validateForm(form, detail) {
    if (!detail || !detail.current || !detail.action_type_id) throw new Error('Сначала получите актуальные настройки объявления.');
    var result = { mode: form.mode };
    if (form.mode === 'base') return result;
    if (form.mode === 'manual') {
      var manual = detail.manual;
      if (!manual) throw new Error('Своя ставка для этого объявления недоступна.');
      if (!moneyRange(manual.min_bid_penny, manual.max_bid_penny) || !moneyRange(manual.min_limit_penny, manual.max_limit_penny)) throw new Error('Авито не предоставил допустимые границы ставки и лимита. Обновите данные.');
      result.bid_penny = moneyInput(form.bid);
      result.limit_penny = moneyInput(form.limit);
      if (result.bid_penny == null || result.bid_penny <= manual.min_bid_penny || result.bid_penny > Math.min(35000, manual.max_bid_penny)) throw new Error('Ставка должна быть больше ' + money(manual.min_bid_penny) + ' и не больше ' + money(Math.min(35000, manual.max_bid_penny)) + '.');
      if (result.limit_penny == null || result.limit_penny <= 0 || result.limit_penny < manual.min_limit_penny || result.limit_penny > manual.max_limit_penny) throw new Error('Дневной лимит: от ' + money(manual.min_limit_penny) + ' до ' + money(manual.max_limit_penny) + '.');
      return result;
    }
    if (form.mode === 'auto') {
      var auto = detail.auto, period = { '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[form.period];
      if (!auto || !period || !auto[period]) throw new Error('Этот период автобюджета недоступен.');
      result.budget_penny = moneyInput(form.budget);
      result.budget_type = form.period;
      var low = auto[period].min_limit_penny == null ? auto.min_budget_penny : auto[period].min_limit_penny;
      var high = auto[period].max_limit_penny == null ? auto.max_budget_penny : auto[period].max_limit_penny;
      if (!moneyRange(low, high)) throw new Error('Авито не предоставил допустимые границы бюджета.');
      if (result.budget_penny == null || result.budget_penny <= 0 || result.budget_penny < low || result.budget_penny > high) throw new Error('Бюджет: от ' + money(low) + ' до ' + money(high) + '.');
      return result;
    }
    throw new Error('Выберите способ продвижения.');
  }
  function sameActions(details) {
    return details.length > 0 && details.every(function (detail) { return detail && detail.action_type_id && detail.action_type_id === details[0].action_type_id; });
  }
  function effectiveCurrent(item, details, loadedAt) {
    var cached = details && details.get(String(item.item_id));
    return cached && cached.at >= loadedAt && cached.value && cached.value.current || item.promotion || null;
  }
  function initialItemId(items, details, loadedAt) {
    var preferred = items.find(function (item) { var current = effectiveCurrent(item, details, loadedAt); return current && (current.mode === 'manual' || current.mode === 'auto'); }) || items[0];
    return preferred ? String(preferred.item_id) : '';
  }
  function averageBids(items, details, loadedAt) {
    var seen = new Set(), buckets = {}, result = { total_count: 0, manual_count: 0, auto_count: 0, base_count: 0, unknown_count: 0, groups: [] };
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || item.item_id == null || seen.has(String(item.item_id))) return;
      seen.add(String(item.item_id)); result.total_count += 1;
      var current = effectiveCurrent(item, details, loadedAt || 0);
      if (current && current.mode === 'manual' && [1, 5, 7].indexOf(current.action_type_id) >= 0 && Number.isSafeInteger(current.bid_penny) && current.bid_penny > 0) {
        var bucket = buckets[current.action_type_id] || (buckets[current.action_type_id] = { action_type_id: current.action_type_id, count: 0, total: 0 });
        bucket.count += 1; bucket.total += current.bid_penny; result.manual_count += 1;
      } else if (current && current.mode === 'auto') result.auto_count += 1;
      else if (current && current.mode === 'base') result.base_count += 1;
      else result.unknown_count += 1;
    });
    [5, 1, 7].forEach(function (type) { var bucket = buckets[type]; if (bucket) result.groups.push({ action_type_id: type, count: bucket.count, average_penny: Math.round(bucket.total / bucket.count) }); });
    return result;
  }
  function createRunner(deps) {
    var cancelled = false, running = false;
    return {
      cancel: function () { cancelled = true; },
      isRunning: function () { return running; },
      run: async function (items) {
        if (running) throw new Error('Операция уже выполняется.');
        running = true; cancelled = false;
        var results = [];
        try {
          for (var index = 0; index < items.length; index += 1) {
            if (cancelled || !deps.isCurrent()) break;
            await deps.wait(index, items[index]);
            if (cancelled || !deps.isCurrent()) break;
            var result;
            try { result = await deps.perform(items[index], index); }
            catch (error) { result = { status: 'unknown', error: error.message || 'Ответ не получен. Не повторяйте операцию без проверки.' }; }
            results.push({ item: items[index], result: result });
            if (deps.isCurrent()) deps.onResult(items[index], result, index);
            if (result && (result.status === 'unknown' || result.stop === true)) { cancelled = true; break; }
          }
          return results;
        } finally { running = false; }
      }
    };
  }

  function install(win) {
    var doc = win.document, active = null, cache = new Map();
    var dashboard = win.AvitoBiddingDashboard, storage = dashboard && dashboard.createStorage(win);
    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = String(text);
      return node;
    }
    function valid(state) { try { return active === state && !state.disposed && typeof state.ctx.isCurrent === 'function' && !!state.ctx.isCurrent(); } catch (_) { return false; } }
    function message(error) {
      var code = error && error.code;
      var known = {
        bidding_unavailable: 'Продвижение по ставке для этого объявления недоступно.',
        bidding_groups_conflict: 'Группы изменились в другом окне. Обновите список групп и повторите правку.',
        groups_conflict: 'Группы изменились в другом окне. Список будет обновлён; повторите правку.',
        quote_expired: 'Предпросмотр устарел. Получите новый перед применением.',
        cpx_rate_limit: 'Авито ограничил частоту запросов. Подождите и обновите вручную.',
        bidding_quote_expired: 'Предпросмотр устарел. Получите новый перед применением.'
      };
      known.bidding_scope_required = 'У приложения нет необходимого доступа Авито к управлению продвижением.';
      known.bidding_changed = 'Настройки объявления изменились после расчёта. Обновите и рассчитайте заново.';
      known.bidding_quote_consumed = 'Этот предпросмотр уже использован. Повторная отправка заблокирована.';
      known.bidding_item_not_active = 'Объявление не активно. Изменение ставки недоступно.';
      known.bidding_rate_limited = 'Достигнут лимит запросов Авито. Подождите и повторите проверку вручную.';
      return known[code] || String(error && error.message || 'Не удалось получить ответ.');
    }
    function note(state, value, tone) {
      if (!valid(state)) return;
      state.status = value || ''; state.statusTone = tone || '';
      if (state.parts) { state.parts.status.textContent = state.status; state.parts.status.className = 'avb-status' + (tone ? ' avb-' + tone : ''); }
    }
    function button(state, label, className, handler) {
      var node = el('button', className || 'avb-secondary', label); node.type = 'button';
      node.addEventListener('click', function () { if (valid(state)) handler(); });
      return node;
    }
    function groupId() {
      if (win.crypto && win.crypto.randomUUID) return win.crypto.randomUUID();
      if (!win.crypto || !win.crypto.getRandomValues) return null;
      var bytes = new Uint8Array(16); win.crypto.getRandomValues(bytes); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
      var hex = Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
    function stop(state) {
      if (state.jobsTimer) win.clearTimeout(state.jobsTimer);
      state.disposed = true; state.cancelAllLoad = true;
      if (state.runner) state.runner.cancel();
      if (state.dialog) { try { state.dialog.close(); } catch (_) {} state.dialog.remove(); }
      if (state.host) state.host.replaceChildren();
      state.dialog = null; state.parts = null; state.quotes = [];
    }
    function clear() { if (active) stop(active); active = null; cache.clear(); }
    function mount(host, context) {
      if (!host || !context || !context.account || !context.organizationId || typeof context.api !== 'function') return;
      var key = scopeKey(context), state;
      if (active && active.key === key && valid(active)) { state = active; state.ctx = context; state.host = host; }
      else {
        if (active) stop(active);
        var saved = cache.get(key);
        state = { key: key, ctx: context, host: host, items: saved ? saved.items : [], details: saved ? saved.details : new Map(), loadedAt: saved ? saved.loadedAt : 0, next: saved ? saved.next : null, loaded: !!(saved && saved.loaded), statisticsPeriod: saved ? saved.statisticsPeriod : null, groups: saved ? saved.groups : [], revision: saved ? saved.revision : null, selected: new Set(), selectedId: '', filter: '', groupId: '', groupName: '', groupEmoji: '', groupColor: '', sortKey: '', sortDirection: 'desc', form: { mode: 'manual', bid: '', limit: '', budget: '', period: '1d' }, quotes: [], results: [], disposed: false, busy: false, loading: false, loadingAll: false, cancelAllLoad: false, detailLoading: false, lastCpxAt: 0, lastReadAttempt: saved ? saved.lastReadAttempt : 0, status: '' };
        active = state;
        state.expandedRows = new Set();
        if (storage) {
          var mountedAt = state.loadedAt;
          state.restoreTask = storage.read(key).then(function (saved) {
            if (!saved || !valid(state) || state.loadedAt !== mountedAt || state.busy || state.loadedAt >= saved.loadedAt) return;
            ['items', 'loaded', 'loadedAt', 'next', 'statisticsPeriod'].forEach(function (name) { state[name] = saved[name]; });
            if (!state.groupsLoaded) { state.groups = saved.groups; state.revision = saved.revision; }
            state.details = new Map(saved.details); state.restored = true;
            renderSummary(state); renderToolbar(state); renderTable(state); renderControls(state);
          }).catch(function () { state.cacheWarning = true; });
        }
      }
      renderSummary(state);
      if (state.ctx.serverQueue !== false && !state.jobsChecked) { state.jobsChecked = true; pollJobs(state); }
      if (!(state.dialog && state.dialog.open) && (!state.loaded || Date.now() - state.loadedAt >= 60000) && (!state.lastReadAttempt || Date.now() - state.lastReadAttempt >= 60000)) warmItems(state);
      return state;
    }
    function remember(state) {
      if (!valid(state)) return;
      cache.set(state.key, { items: state.items, details: state.details, loaded: state.loaded, loadedAt: state.loadedAt, next: state.next, statisticsPeriod: state.statisticsPeriod, groups: state.groups, revision: state.revision, lastReadAttempt: state.lastReadAttempt });
      if (storage) {
        if (state.cacheTimer) win.clearTimeout(state.cacheTimer);
        state.cacheTimer = win.setTimeout(function () {
          state.cacheTimer = null;
          storage.write(state.key, dashboard.snapshot(state)).catch(function () { state.cacheWarning = true; });
        }, 400);
      }
    }
    function renderSummary(state) {
      if (!valid(state)) return;
      var summary = el('div', 'avb-summary'), main = el('div', 'avb-summary-main');
      main.append(el('strong', 'avb-summary-title', 'Ставки и продвижение'));
      var average = averageBids(state.items, state.details, state.loadedAt), metrics = el('div', 'avb-summary-metrics');
      average.groups.forEach(function (group) { var metric = el('div', 'avb-summary-metric'); metric.append(el('strong', 'avb-big-value', money(group.average_penny)), el('span', 'avb-summary-note', 'Средняя за ' + actionLabel(group.action_type_id) + ' · ' + group.count + ' объявл.')); metrics.append(metric); });
      if (!average.groups.length) metrics.append(el('span', 'avb-summary-note', state.loaded ? 'Ручные ставки не получены' : 'Получаем текущие ставки…'));
      main.append(metrics);
      var coverage = state.loaded ? (state.next == null ? 'Все активные: ' + average.total_count : 'По загруженным ' + average.total_count + ' объявлениям') + ' · ' + new Date(state.loadedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Только чтение; расходы не меняются';
      if (average.auto_count) coverage += ' · Автобюджет: ' + average.auto_count;
      if (average.base_count) coverage += ' · Базовая цена: ' + average.base_count;
      if (average.unknown_count) coverage += ' · Без ставки: ' + average.unknown_count;
      main.append(el('span', 'avb-summary-note', coverage + (state.summaryError ? ' · Не обновлено: ' + state.summaryError : state.loading ? ' · Обновляем…' : '')));
      summary.append(main, button(state, 'Управлять ставками', 'avb-primary', function () { open(state); }));
      var running = (state.jobs || []).filter(function (job) { return ['queued','running'].indexOf(job.status) >= 0; });
      if (running.length) main.append(el('strong', 'avb-note', 'Серверная очередь: ' + running.reduce(function (sum,j) { return sum + (j.counts.applied || 0); },0) + ' применено · работает и без браузера'));
      state.host.replaceChildren(summary);
    }
    function base(state) { return (state.ctx.account.source === 'oauth' ? '/connections/' : '/accounts/') + encodeURIComponent(state.ctx.account.id) + '/bidding'; }
    async function request(state, path, body) {
      if (!valid(state)) throw new Error('Аккаунт изменился.');
      var options = body ? { method: 'POST', body: Object.assign({ organization_id: state.ctx.organizationId }, body) } : undefined;
      var url = base(state) + path + (body ? '' : (path.indexOf('?') < 0 ? '?' : '&') + 'organization_id=' + encodeURIComponent(state.ctx.organizationId));
      var reply = await state.ctx.api(url, options);
      if (!valid(state)) throw new Error('Аккаунт изменился.');
      return reply;
    }
    async function pace(state, gap) {
      while (valid(state) && Date.now() - state.lastCpxAt < gap) await new Promise(function (resolve) { win.setTimeout(resolve, Math.min(150, gap)); });
      if (!valid(state)) throw new Error('Аккаунт изменился.');
      state.lastCpxAt = Date.now();
    }
    async function loadItems(state, more, background) {
      if (state.restoreTask) await state.restoreTask;
      if (!valid(state) || state.busy) return false;
      if (state.loading) return state.readPromise;
      state.loading = true; state.lastReadAttempt = Date.now(); state.summaryError = '';
      if (!background) note(state, 'Получаем объявления; уже загруженные данные остаются на экране.');
      renderSummary(state); renderToolbar(state);
      state.readPromise = (async function () { try {
        var offset = more ? state.next : 0;
        var reply = await request(state, '/items?limit=99&offset=' + Number(offset || 0) + (dashboard ? '&statistics_days=30' : ''));
        if (!Array.isArray(reply.items)) throw new Error('Сервер не подтвердил список. Предыдущие объявления сохранены.');
        if (!dashboard && background && !more && state.loaded && state.dialog && state.dialog.open) return true;
        var items = mergeStatistics(Array.isArray(reply.items) ? reply.items : [], state.items);
        if (dashboard) {
          items = dashboard.mergeItems(items, state.items);
          if (!more) state.refreshSeen = new Set();
          var updates = new Map(items.map(function (item) { if (state.refreshSeen) state.refreshSeen.add(String(item.item_id)); return [String(item.item_id), item]; }));
          state.items = state.items.map(function (item) { var id = String(item.item_id), next = updates.get(id); updates.delete(id); return next || item; }).concat(Array.from(updates.values()));
          if (reply.next_offset == null && state.refreshSeen) state.items = state.items.filter(function (item) { return state.refreshSeen.has(String(item.item_id)); });
        } else state.items = more ? state.items.concat(items.filter(function (item) { return !state.items.some(function (old) { return String(old.item_id) === String(item.item_id); }); })) : items;
        state.statisticsPeriod = reply.statistics_period || state.statisticsPeriod;
        state.next = reply.next_offset == null ? null : reply.next_offset;
        state.loaded = true; state.loadedAt = Date.now();
        if (dashboard && state.groupSelection) state.selected = new Set(filtered(state).map(function (item) { return String(item.item_id); }));
        remember(state); renderSummary(state);
        if (!background) note(state, 'Список обновлён. Выберите объявление для изменения ставки.');
        if (!background && state.dialog && state.dialog.open && !state.selectedId && state.items.length) choose(state, initialItemId(state.items, state.details, state.loadedAt));
        return true;
      } catch (error) { if (valid(state)) { state.summaryError = message(error); note(state, message(error) + (state.loaded ? ' Показаны ранее полученные данные.' : ''), 'error'); } return false; }
      finally { state.loading = false; state.readPromise = null; if (valid(state)) { remember(state); renderSummary(state); renderToolbar(state); renderTable(state); } } }());
      return state.readPromise;
    }
    async function warmItems(state) {
      if (state.warming || state.loading || !valid(state) || state.dialog && state.dialog.open) return;
      state.warming = true;
      try {
        if (!await loadItems(state, false, true)) return;
        for (var page = 1; page < 5 && state.next != null && valid(state); page += 1) {
          if (state.dialog && state.dialog.open || state.busy) break;
          await new Promise(function (resolve) { win.setTimeout(resolve, 1200); });
          if (!valid(state) || state.dialog && state.dialog.open || state.busy) break;
          if (!await loadItems(state, true, true)) break;
        }
      } finally { state.warming = false; }
    }
    async function loadAllItems(state) {
      if (!valid(state) || !state.dialog || !state.dialog.open || state.busy || state.loadingAll) return;
      state.loadingAll = true; state.cancelAllLoad = false; renderToolbar(state);
      function current() { return valid(state) && !state.cancelAllLoad && !state.busy && state.dialog && state.dialog.open; }
      var pages = 0, failed = false;
      try {
        if (state.loading && state.readPromise && !await state.readPromise) failed = true;
        if (!current() || failed) return;
        if (!state.loaded && !await loadItems(state, false, true)) return;
        while (current() && state.next != null && pages < 100) {
          await new Promise(function (resolve) { win.setTimeout(resolve, Math.max(0, 3500 - (Date.now() - state.lastReadAttempt))); });
          if (!current()) break;
          if (state.loading) { if (!await state.readPromise) { failed = true; break; } continue; }
          var previousOffset = state.next;
          if (!await loadItems(state, true, true)) { failed = true; break; }
          pages += 1;
          if (state.next != null && Number(state.next) <= Number(previousOffset)) { failed = true; note(state, 'Авито не подтвердил следующую страницу. Показаны загруженные объявления; повторной отправки не было.', 'warning'); break; }
        }
        if (current() && !failed) note(state, state.next == null ? 'Загружены все активные объявления: ' + state.items.length + '. Группы и сортировка обновлены; ставки не менялись.' : 'Показаны ' + state.items.length + ' объявлений. Список ещё неполный: достигнут предел 100 страниц за запуск. Нажмите «Загрузить все», чтобы продолжить.', state.next == null ? '' : 'warning');
      } finally { state.loadingAll = false; var resume = state.resumeContactsLoad; state.resumeContactsLoad = false; if (valid(state)) { renderToolbar(state); if (resume && !state.busy && state.dialog && state.dialog.open && state.groupId === CONTACT_GROUP_ID && state.next != null) loadAllItems(state); } }
    }
    async function loadGroups(state) {
      try { var reply = await request(state, '/groups'); state.groups = reply.groups || []; state.revision = reply.revision; state.groupsLoaded = true; remember(state); renderToolbar(state); renderTable(state); }
      catch (error) { note(state, 'Группы: ' + message(error), 'error'); }
    }
    async function saveGroups(state, next) {
      if (!state.ctx.canManage || state.busy || state.revision == null) return note(state, 'Для изменения групп нужен доступ владельца/менеджера и загруженная версия групп.', 'warning');
      state.busy = true; state.cancelAllLoad = true; renderToolbar(state);
      try { var reply = await request(state, '/groups', { revision: state.revision, groups: next }); state.groups = reply.groups || next; state.revision = reply.revision; state.groupsLoaded = true; remember(state); note(state, 'Группа сохранена. Ставки не изменялись.'); }
      catch (error) { note(state, message(error), 'error'); if (valid(state)) await loadGroups(state); }
      finally { state.busy = false; if (valid(state)) { renderToolbar(state); renderTable(state); } }
    }
    async function detail(state, id, force) {
      var cached = state.details.get(id);
      if (!force && cached && Date.now() - cached.at < 60000) return cached.value;
      await pace(state, 3200);
      var reply = await request(state, '/items/' + encodeURIComponent(id));
      if (!reply.bidding) throw new Error('Авито не вернул настройки продвижения.');
      state.details.set(id, { value: reply.bidding, at: Date.now() }); remember(state); renderSummary(state);
      return reply.bidding;
    }
    function applyFormDefaults(state, value) {
      var current = value.current || {};
      state.form.mode = current.mode === 'auto' ? 'auto' : (value.manual ? 'manual' : current.mode || 'base');
      state.form.bid = editMoney(current.bid_penny);
      state.form.limit = editMoney(current.limit_penny);
      state.form.budget = editMoney(current.budget_penny);
      state.form.period = current.budget_type || '1d';
    }
    async function choose(state, id) {
      if (!valid(state) || state.busy) return;
      state.selectedId = id; state.quotes = []; state.detailLoading = true;
      var cached = state.details.get(id);
      if (cached) applyFormDefaults(state, cached.value);
      var initialForm = JSON.stringify(state.form);
      renderTable(state); renderControls(state); renderPreview(state);
      try { var value = await detail(state, id, false); if (state.selectedId !== id) return; if (JSON.stringify(state.form) === initialForm) applyFormDefaults(state, value); note(state, 'Настройки объявления получены. Изменения применяются только после предпросмотра и подтверждения.'); }
      catch (error) { if (state.selectedId === id) note(state, message(error) + (cached ? ' Предыдущие настройки сохранены на экране.' : ''), 'error'); }
      finally { if (valid(state) && state.selectedId === id) { state.detailLoading = false; renderControls(state); renderTable(state); } }
    }
    function open(state) {
      if (!valid(state)) return;
      if (state.dialog) { if (!state.dialog.open) state.dialog.showModal(); if (state.groupId === CONTACT_GROUP_ID && state.next != null) { if (state.loadingAll && state.cancelAllLoad) state.resumeContactsLoad = true; else loadAllItems(state); } return; }
      var dialog = el('dialog', 'avb-dialog'), head = el('header', 'avb-dialog-head'), title = el('div');
      title.append(el('h2', '', 'Ставки и группы объявлений'), el('p', 'avb-muted', state.ctx.account.display_name || 'Аккаунт Avito'));
      var close = button(state, 'Закрыть', 'avb-secondary', function () { dialog.close(); });
      head.append(title, close);
      var status = el('div', 'avb-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      var toolbar = el('section', 'avb-toolbar'), layout = el('div', 'avb-layout'), table = el('div', 'avb-table-wrap'), editor = el('div', 'avb-editor'), controls = el('section', 'avb-controls'), preview = el('section', 'avb-preview'), foot = el('footer', 'avb-dialog-foot');
      var chart = dashboard ? el('section', 'avb-chart-host') : null;
      if (chart) editor.append(chart);
      var groupBars = state.ctx.serverQueue !== false ? el('section','avb-list-groups') : null;
      if(groupBars){var listPane=el('section','avb-list-pane');listPane.append(groupBars,table);layout.append(listPane,editor);}else layout.append(table,editor);
      editor.append(controls, preview);
      foot.append(el('span', 'avb-muted', 'Ставки меняются только после подтверждения. После применения расходы идут по правилам Авито. Конкуренция и прогноз — оценки Авито, не гарантия заявок.'));
      dialog.append(head, status, toolbar, layout, foot); doc.body.append(dialog);
      state.dialog = dialog; state.parts = { status: status, toolbar: toolbar, table: table, controls: controls, preview: preview, chart: chart, groupBars: groupBars };
      dialog.addEventListener('close', function () { state.cancelPreview = true; state.cancelAllLoad = true; state.resumeContactsLoad = false; if (state.runner) state.runner.cancel(); });
      dialog.showModal(); renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state);
      if (!state.loaded || state.loading || dashboard && Date.now() - state.loadedAt >= 60000) loadItems(state, false).then(function () { if (valid(state) && dialog.open && !state.selectedId && state.items.length) choose(state, initialItemId(state.items, state.details, state.loadedAt)); });
      else { note(state, 'Снимок от ' + new Date(state.loadedAt).toLocaleString('ru-RU') + '. Выберите объявления → укажите ставку → проверьте изменения.'); if (!state.selectedId && state.items.length) choose(state, initialItemId(state.items, state.details, state.loadedAt)); }
      loadGroups(state);
    }
    function filtered(state) {
      var group = allGroups(state).find(function (row) { return row.id === state.groupId; }), query = state.filter.toLocaleLowerCase('ru-RU');
      var ids = group && group.id !== CONTACT_GROUP_ID ? new Set(group.item_ids.map(String)) : null;
      return sortItems(state.items.filter(function (item) { return (!group || (ids ? ids.has(String(item.item_id)) : groupContains(group, item))) && (!query || (String(item.title || '') + ' ' + item.item_id).toLocaleLowerCase('ru-RU').indexOf(query) >= 0); }), state.sortKey, state.sortDirection);
    }
    function dashboardEnv(state) {
      return { doc: doc, win: win, el: el, button: button, groups: allGroups, contains: groupContains, appearance: groupAppearance, money: money, currentLabel: currentLabel, actionLabel: actionLabel,
        current: function (item) { return effectiveCurrent(item, state.details, state.loadedAt); },
        peers: function () { return state.groupId ? filtered(state) : state.selected.size > 1 ? state.items.filter(function (item) { return state.selected.has(String(item.item_id)); }) : state.items; },
        redraw: function () { renderChart(state); },
        selectGroup: function (id, items) {
          if (!valid(state) || state.busy) return;
          state.filter = ''; state.groupId = id; items = filtered(state);
          state.groupId = id; state.groupSelection = true; state.selected = new Set(items.map(function (item) { return String(item.item_id); })); state.quotes = []; state.bulkIntent = null;
          var group = allGroups(state).find(function (row) { return row.id === id; }), appearance = groupAppearance(group);
          state.groupName = group ? group.name : ''; state.groupEmoji = group ? appearance.emoji : ''; state.groupColor = group ? appearance.color : '';
          renderToolbar(state, true); renderTable(state); renderPreview(state);
          if (items.length) choose(state, String(items[0].item_id));
          if (state.next != null) loadAllItems(state);
        }
      };
    }
    function renderChart(state) { if (dashboard && valid(state) && state.parts && state.parts.chart) state.parts.chart.replaceChildren(dashboard.renderChart(state, dashboardEnv(state))); }
    function tint(node, color) { if (node.style && node.style.setProperty && /^#[0-9a-f]{6}$/i.test(color)) node.style.setProperty('--avb-group-color', color); }
    function groupRecord(row) { return Object.assign({ id: row.id, name: row.id === CONTACT_GROUP_ID ? 'Контактные' : row.name, item_ids: row.id === CONTACT_GROUP_ID ? [] : row.item_ids.slice() }, groupAppearance(row)); }
    function statsPeriodLabel(state, item) {
      var period = item && item.statistics && item.statistics.period || state.statisticsPeriod || (state.items.find(function (entry) { return entry.statistics && entry.statistics.period; }) || {}).statistics;
      if (period && period.period) period = period.period;
      function date(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4) : ''; }
      var from = period && date(period.date_from), to = period && date(period.date_to);
      return from && to ? 'За доступный период ' + from + '—' + to + (Number.isSafeInteger(period.days) ? ' · ' + period.days + ' дней' : '') : 'Период статистики не предоставлен';
    }
    function renderToolbar(state, force) {
      if (!valid(state) || !state.parts) return;
      if (!force && doc.activeElement && state.parts.toolbar.contains && state.parts.toolbar.contains(doc.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName)) { state.toolbarPending = true; return; }
      state.toolbarPending = false;
      var target = state.parts.toolbar; target.replaceChildren();
      var search = el('input'); search.type = 'search'; search.placeholder = 'Объявление или ID'; search.setAttribute('aria-label', 'Найти объявление'); search.value = state.filter;
      search.addEventListener('input', function () { if (valid(state)) { state.filter = search.value; renderTable(state); } });
      var group = el('select'); group.setAttribute('aria-label', 'Группа объявлений'); group.append(new win.Option('Все объявления', ''));
      allGroups(state).forEach(function (row) { var count = row.automatic ? state.items.filter(function (item) { return groupContains(row, item); }).length : row.item_ids.length; group.append(new win.Option(groupAppearance(row).emoji + ' ' + row.name + ' (' + count + ')' + (row.automatic ? ' · >1 контакта' : ''), row.id)); }); group.value = state.groupId;
      group.addEventListener('change', function () { if (!valid(state)) return; if (dashboard) { state.groupId = group.value; dashboardEnv(state).selectGroup(group.value, filtered(state)); return; } state.groupId = group.value; var selected = allGroups(state).find(function (row) { return row.id === group.value; }), appearance = groupAppearance(selected); state.groupName = selected ? selected.name : ''; state.groupEmoji = selected ? appearance.emoji : ''; state.groupColor = selected ? appearance.color : ''; renderToolbar(state, true); renderTable(state); if (state.groupId === CONTACT_GROUP_ID && (!state.loaded || state.loading || state.next != null)) loadAllItems(state); });
      var refresh = button(state, state.loading ? 'Обновляем…' : 'Обновить список', 'avb-secondary', async function () { if (await loadItems(state, false) && state.groupId === CONTACT_GROUP_ID && state.next != null) loadAllItems(state); }); refresh.disabled = state.loading || state.loadingAll || state.busy;
      target.append(search, group, refresh);
      if (state.loadingAll) { var cancelLoad = button(state, state.cancelAllLoad ? 'Останавливаем загрузку…' : 'Остановить загрузку', 'avb-secondary', function () { state.cancelAllLoad = true; note(state, 'Останавливаем оставшиеся страницы. Уже загруженные данные сохранены; отправленный запрос отменить нельзя.'); renderToolbar(state); }); cancelLoad.disabled = state.cancelAllLoad; target.append(cancelLoad); }
      else if (state.next != null) { var more = button(state, 'Ещё объявления', 'avb-secondary', function () { loadItems(state, true); }); more.disabled = state.loading || state.busy; target.append(more); var all = button(state, 'Загрузить все', 'avb-secondary', function () { loadAllItems(state); }); all.disabled = state.busy; target.append(all); }
      var selected = button(state, dashboard ? (state.filter ? 'Выбрать найденные' : 'Выбрать всю группу') : 'Выбрать видимые', 'avb-secondary', function () { var items = filtered(state); if (!dashboard && items.length > MAX_BATCH) return note(state, 'За один раз можно изменить до 20 объявлений. Уточните поиск или выберите строки вручную.', 'warning'); state.selected = new Set(items.map(function (item) { return String(item.item_id); })); state.groupSelection = !!dashboard; state.quotes = []; renderTable(state); renderControls(state); renderPreview(state); if (dashboard && state.next != null) loadAllItems(state); }); selected.disabled = state.busy; target.append(selected);
      var groupsEditor = el('details', 'avb-groups-editor'), groupsContent = el('div', 'avb-groups-content');
      groupsEditor.open = !!state.groupsEditorOpen;
      groupsEditor.addEventListener('toggle', function () { state.groupsEditorOpen = groupsEditor.open; });
      groupsEditor.append(el('summary', '', 'Изменить группы'), groupsContent); target.append(groupsEditor);
      var builtin = state.groupId === CONTACT_GROUP_ID, appearance = groupAppearance({ name: state.groupName, emoji: state.groupEmoji, color: state.groupColor });
      var name = el('input'); name.type = 'text'; name.maxLength = 80; name.placeholder = 'Название своей группы'; name.setAttribute('aria-label', 'Название группы'); name.value = state.groupName; name.disabled = state.busy || !state.ctx.canManage || builtin;
      name.addEventListener('input', function () { if (valid(state)) { state.groupName = name.value; var automatic = groupAppearance({ name: name.value }); if (!state.groupEmoji) emoji.value = automatic.emoji; if (!state.groupColor) { color.value = automatic.color; tint(look, automatic.color); } } }); groupsContent.append(name);
      if (builtin) groupsContent.append(el('p', 'avb-note', 'Автоматически: объявления с более чем 1 контактом за показанный период. Состав обновляется вместе со статистикой; оформление можно изменить.'));
      var look = el('div', 'avb-group-appearance'), emojiWrap = el('label', 'avb-group-emoji'), colorWrap = el('label', 'avb-group-color'), emoji = el('input'), color = el('select');
      emoji.type = 'text'; emoji.maxLength = 24; emoji.value = appearance.emoji; emoji.setAttribute('aria-label', 'Эмоджи группы'); emoji.disabled = state.busy || !state.ctx.canManage;
      emoji.addEventListener('input', function () { if (valid(state)) state.groupEmoji = emoji.value; });
      color.setAttribute('aria-label', 'Цвет группы'); color.disabled = state.busy || !state.ctx.canManage;
      var colors = GROUP_COLORS.slice(); if (colors.indexOf(appearance.color) < 0) colors.push(appearance.color);
      colors.forEach(function (value, index) { color.append(new win.Option(['Мятный', 'Голубой', 'Фиолетовый', 'Золотой', 'Розовый', 'Серебряный'][index] || 'Свой цвет', value)); }); color.value = appearance.color;
      color.addEventListener('change', function () { if (valid(state)) { state.groupColor = color.value; tint(look, color.value); } });
      emojiWrap.append(el('span', '', 'Эмоджи'), emoji); colorWrap.append(el('span', '', 'Цвет'), color); look.append(emojiWrap, colorWrap); tint(look, appearance.color); groupsContent.append(look);
      function chosenAppearance(title) {
        var value = state.groupEmoji.trim();
        if (Array.from(value).length > 12 || /[\u0000-\u001f\u007f]/.test(value)) { note(state, 'Эмоджи группы: до 12 символов без управляющих знаков.', 'warning'); return null; }
        return groupAppearance({ name: title, emoji: value, color: state.groupColor });
      }
      var save = button(state, builtin ? 'Сохранить оформление' : state.groupId ? 'Сохранить состав группы' : 'Создать группу из выбранных', 'avb-secondary', function () {
        var title = state.groupName.trim(), ids = Array.from(state.selected);
        if (!builtin && (!title || !ids.length)) return note(state, 'Введите название и отметьте объявления. Сохранение заменяет состав выбранной группы.', 'warning');
        var chosen = chosenAppearance(title); if (!chosen) return;
        var groups = state.groups.map(groupRecord), record;
        if (builtin) { record = Object.assign({ id: CONTACT_GROUP_ID, name: 'Контактные', item_ids: [] }, chosen); groups = groups.filter(function (row) { return row.id !== CONTACT_GROUP_ID; }); groups.push(record); }
        else if (state.groupId) groups = groups.map(function (row) { return row.id === state.groupId ? Object.assign({ id: row.id, name: title, item_ids: ids }, chosen) : row; });
        else { var id = groupId(); if (!id) return note(state, 'Браузер не поддерживает создание безопасного идентификатора группы. Откройте систему по HTTPS в современном браузере.', 'error'); groups.push(Object.assign({ id: id, name: title, item_ids: ids }, chosen)); }
        saveGroups(state, groups);
      }); save.disabled = state.busy || !state.ctx.canManage || state.revision == null; groupsContent.append(save);
      if (state.groupId && !builtin) { var remove = button(state, 'Удалить группу', 'avb-secondary', function () { var groups = state.groups.filter(function (row) { return row.id !== state.groupId; }).map(groupRecord); state.groupId = ''; state.groupName = ''; state.groupEmoji = ''; state.groupColor = ''; saveGroups(state, groups); renderTable(state); }); remove.disabled = state.busy || !state.ctx.canManage; groupsContent.append(remove); }
      if (state.groupId && !builtin) { var rename = button(state, 'Сохранить название и оформление', 'avb-secondary', function () { var title = state.groupName.trim(), chosen = chosenAppearance(title); if (!chosen) return; if (!title) return note(state, 'Введите название группы.', 'warning'); saveGroups(state, state.groups.map(function (row) { return row.id === state.groupId ? Object.assign(groupRecord(row), { name: title }, chosen) : groupRecord(row); })); }); rename.disabled = state.busy || !state.ctx.canManage; groupsContent.append(rename); }
      var hasStale = state.items.some(function (item) { return item.statistics && item.statistics.stale; }), hasMissing = state.items.some(function (item) { return item.statistics_error && !(item.statistics && item.statistics.stale); });
      target.append(el('small', 'avb-stats-period', statsPeriodLabel(state) + ' · Загружено объявлений: ' + state.items.length + ' · Нажмите заголовок для сортировки' + (state.next != null ? ' · Список загружен частично' : '') + (state.loadingAll ? state.cancelAllLoad ? ' · Останавливаем загрузку…' : ' · Загружаем остальные…' : '') + (hasStale ? ' · Часть статистики из предыдущего обновления' : '') + (hasMissing ? ' · Часть статистики недоступна' : '')));
      if (dashboard) { if(state.parts.groupBars)state.parts.groupBars.replaceChildren(dashboard.renderBars(state,dashboardEnv(state)));else target.append(dashboard.renderBars(state, dashboardEnv(state))); if (state.cacheWarning) target.append(el('small', 'avb-warning', 'Кэш браузера недоступен. Серверные группы и ставки сохранены; снимки пока только в памяти вкладки.')); }
      [search, group, name, emoji, color].forEach(function (input) { input.addEventListener('blur', function () { if (valid(state) && state.toolbarPending) win.setTimeout(function () { renderToolbar(state); }, 0); }); });
    }
    function renderTable(state) {
      if (!valid(state) || !state.parts) return;
      var wrap = state.parts.table; wrap.replaceChildren();
      var table = el('table', 'avb-table'), header = el('tr');
      header.append(el('th', '', 'Выбор'), el('th', '', 'Объявление'));
      [['contacts', 'Контакты'], ['views', 'Просмотры'], ['favorites', 'Избранное']].forEach(function (entry) {
        var cell = el('th', 'avb-stat-column'), activeSort = state.sortKey === entry[0], sort = button(state, entry[1], 'avb-stat-head', function () { state.sortDirection = state.sortKey === entry[0] && state.sortDirection === 'desc' ? 'asc' : 'desc'; state.sortKey = entry[0]; renderTable(state); });
        cell.setAttribute('aria-sort', activeSort ? state.sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'); sort.title = entry[1] + ': ' + (activeSort && state.sortDirection === 'desc' ? 'сначала меньше' : 'сначала больше'); cell.append(sort); header.append(cell);
      });
      header.append(el('th', '', 'Режим / ставка'), el('th', '', 'Лимит'));
      var thead = el('thead'); thead.append(header); table.append(thead); var body = el('tbody');
      var groups = allGroups(state), groupIndexes = new Map(groups.map(function (group) { return [group.id, new Set(group.item_ids.map(String))]; }));
      var visibleItems = filtered(state), tableLimit = dashboard ? state.tableLimit || 150 : visibleItems.length;
      visibleItems.slice(0, tableLimit).forEach(function (item) {
        var id = String(item.item_id), row = el('tr', (state.selectedId === id ? 'avb-item-selected' : '') + (statValue(item, 'contacts') > 1 ? ' avb-item-contact' : ''));
        var checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(id); checkbox.disabled = state.busy; checkbox.setAttribute('aria-label', 'Выбрать ' + (item.title || id));
        checkbox.addEventListener('change', function () { if (!valid(state) || state.busy) return; if (!dashboard && checkbox.checked && state.selected.size >= MAX_BATCH) { checkbox.checked = false; return note(state, 'До 20 объявлений за одно подтверждение.', 'warning'); } state.groupSelection = false; if (checkbox.checked) state.selected.add(id); else state.selected.delete(id); state.quotes = []; renderControls(state); renderPreview(state); });
        var checkcell = el('td'); checkcell.append(checkbox); row.append(checkcell);
        var title = el('td'), select = button(state, item.title || 'Объявление ' + id, 'avb-item-title', function () { choose(state, id); }); select.disabled = state.busy; title.append(select, el('div', 'avb-item-meta', 'ID ' + id + (item.status ? ' · ' + item.status : ''))); row.append(title);
        if (dashboard) { var expand = button(state, state.expandedRows.has(id) ? '▴ Статистика' : '▾ Статистика', 'avb-item-expand', function () { if (state.expandedRows.has(id)) state.expandedRows.delete(id); else state.expandedRows.add(id); renderTable(state); }); expand.setAttribute('aria-expanded', String(state.expandedRows.has(id))); title.append(expand); }
        var memberships = groups.filter(function (group) { return group.id === CONTACT_GROUP_ID ? groupContains(group, item) : groupIndexes.get(group.id).has(id); });
        if (memberships.length) {
          var badges = el('div', 'avb-group-badges');
          memberships.slice(0, 3).forEach(function (group) { var appearance = groupAppearance(group), badge = el('span', 'avb-group-badge', appearance.emoji + ' ' + group.name); tint(badge, appearance.color); badges.append(badge); });
          if (memberships.length > 3) badges.append(el('small', 'avb-muted', '+' + (memberships.length - 3)));
          title.append(badges); tint(row, groupAppearance(memberships.find(function (group) { return group.id === state.groupId; }) || memberships[0]).color);
        }
        ['contacts', 'views', 'favorites'].forEach(function (key) { var value = statValue(item, key), cell = el('td', 'avb-item-stat', value == null ? '' : value.toLocaleString('ru-RU')); cell.setAttribute('data-stat', key); cell.setAttribute('data-empty', String(value == null || value === 0)); cell.title = value == null ? 'Авито не предоставил значение' : statsPeriodLabel(state, item) + (item.statistics && item.statistics.stale ? ' · Предыдущее успешное обновление' : ''); row.append(cell); });
        var current = effectiveCurrent(item, state.details, state.loadedAt);
        var price = el('td'); price.append(el('span', '', current ? modeLabel(current.mode) : 'Не загружено'));
        if (current && current.bid_penny != null) price.append(el('div', 'avb-muted', money(current.bid_penny) + ' / ' + actionLabel(current.action_type_id)));
        row.append(price, el('td', '', current && current.mode === 'auto' ? money(current.budget_penny) + ' / ' + (current.budget_type || '') : money(current && current.limit_penny)));
        body.append(row);
        if (dashboard && state.expandedRows.has(id)) { var detailRow = el('tr', 'avb-item-detail'), detailCell = el('td'); detailCell.setAttribute('colspan', '7'); detailCell.append(dashboard.renderRow(item, state, dashboardEnv(state))); detailRow.append(detailCell); body.append(detailRow); }
      });
      table.append(body); wrap.append(table);
      if (dashboard && visibleItems.length > tableLimit) wrap.append(button(state, 'Показать ещё 150 · всего ' + visibleItems.length, 'avb-secondary avb-more-rows', function () { state.tableLimit = tableLimit + 150; renderTable(state); }));
      renderChart(state);
      if (!filtered(state).length) wrap.append(el('p', 'avb-empty', state.loading ? 'Загрузка объявлений…' : state.groupId === CONTACT_GROUP_ID && state.items.some(function (item) { return statValue(item, 'contacts') == null; }) ? 'В загруженных данных пока нет объявлений с более чем 1 контактом. Для части объявлений статистика не получена.' : 'Нет объявлений по этому фильтру.'));
    }
    function field(state, label, key, parent) {
      var wrap = el('label', 'avb-field'), input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.value = state.form[key] || ''; input.disabled = state.busy || !state.ctx.canManage;
      wrap.append(el('span', '', label), input); parent.append(wrap);
      input.addEventListener('input', function () { if (valid(state)) { state.form[key] = input.value; state.quotes = []; renderForecast(state); renderChart(state); renderPreview(state); } });
      return input;
    }
    function ladder(state, value, parent) {
      var part = state.form.mode === 'auto' ? value.auto && value.auto[{ '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[state.form.period]] : value.manual;
      if (!part || !Array.isArray(part.ladder) || !part.ladder.length) { parent.append(el('p', 'avb-muted', 'Рыночные рекомендации для этого режима не предоставлены Авито.')); return; }
      var details = el('details', 'avb-market-details'), scroll = el('div', 'avb-market-scroll'), table = el('table', 'avb-market-ladder'), head = el('tr');
      details.append(el('summary', '', 'Все варианты Авито · ' + part.ladder.length), scroll);
      [state.form.mode === 'auto' ? 'Бюджет' : 'Ставка', 'Прогноз действий', 'Сравнение Авито'].forEach(function (text) { head.append(el('th', '', text)); });
      var thead = el('thead'); thead.append(head); table.append(thead); var body = el('tbody');
      part.ladder.forEach(function (offer) {
        var row = el('tr'), choice = el('td'), select = button(state, money(offer.value_penny), 'avb-secondary', function () { if (state.form.mode === 'auto') state.form.budget = editMoney(offer.value_penny); else state.form.bid = editMoney(offer.value_penny); state.quotes = []; renderControls(state); renderPreview(state); }); select.disabled = state.busy || !state.ctx.canManage; choice.append(select);
        row.append(choice, el('td', '', offer.min_forecast != null && offer.max_forecast != null ? offer.min_forecast + '–' + offer.max_forecast : 'Нет данных'), el('td', '', offer.compare == null ? 'Нет данных' : String(offer.compare) + ' п.п.')); body.append(row);
      }); table.append(body); scroll.append(table); details.append(el('p', 'avb-note', 'Кнопка только заполняет поле. Прогноз — оценка Авито, не гарантия. Точные цены конкурентов не раскрываются.')); parent.append(details);
    }
    function renderForecast(state) {
      if (!valid(state) || !state.forecastHost) return;
      var target = state.forecastHost, cached = state.details.get(state.selectedId), value = cached && cached.value; target.replaceChildren();
      if (!value || state.form.mode === 'base') return;
      var part = state.form.mode === 'auto' ? value.auto && value.auto[{ '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[state.form.period]] : value.manual;
      var wanted = offerAt(part && part.ladder, moneyInput(state.form.mode === 'auto' ? state.form.budget : state.form.bid));
      if (!wanted) { target.append(el('span', 'avb-muted', 'Прогноз доступен для точных вариантов Авито ниже.')); return; }
      target.append(el('strong', '', 'Прогноз Авито: ' + (wanted.min_forecast != null && wanted.max_forecast != null ? wanted.min_forecast + '–' + wanted.max_forecast + ' действий' : 'нет данных')),
        el('span', 'avb-muted', wanted.compare == null ? 'Сравнение не предоставлено' : 'Показатель сравнения: ' + wanted.compare + ' п.п.'));
    }
    function renderControls(state) {
      if (!valid(state) || !state.parts) return;
      renderChart(state);
      if (dashboard && !state.busy && doc.activeElement && state.parts.controls.contains && state.parts.controls.contains(doc.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName)) return;
      var target = state.parts.controls; target.replaceChildren();
      var item = state.items.find(function (row) { return String(row.item_id) === state.selectedId; }), cached = state.details.get(state.selectedId), value = cached && cached.value;
      var header = el('div', 'avb-current-header'), heading = el('div', 'avb-current-heading'); heading.append(el('h3', '', item ? item.title || 'Объявление ' + item.item_id : 'Выберите объявление')); header.append(heading); target.append(header);
      if (!value) { target.append(el('p', 'avb-muted', state.detailLoading ? 'Получаем действующие ставки…' : 'Выберите строку, чтобы получить доступные режимы и рекомендации.')); return; }
      var refreshed = button(state, state.detailLoading ? 'Обновляем…' : 'Обновить ставку', 'avb-secondary', async function () { state.detailLoading = true; renderControls(state); try { await detail(state, state.selectedId, true); note(state, 'Настройки обновлены; поля для изменения сохранены.'); } catch (error) { note(state, message(error), 'error'); } finally { state.detailLoading = false; if (valid(state)) { renderControls(state); renderTable(state); } } }); refreshed.disabled = state.busy || state.detailLoading;
      header.append(refreshed);
      var grid = el('div', 'avb-current-grid'), currentMetric = el('div', 'avb-kpi'), selectionMetric = el('div', 'avb-kpi');
      var current = value.current || {}, autoPart = value.auto && value.auto[{ '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[state.form.period]], recommendedValue = state.form.mode === 'auto' ? autoPart && autoPart.recommended_budget_penny : value.manual && value.manual.recommended_bid_penny;
      var hasRecommendation = state.form.mode !== 'base' && Number.isSafeInteger(recommendedValue) && recommendedValue > 0;
      var recommendationMetric = hasRecommendation ? button(state, '', 'avb-kpi avb-recommendation', function () { if (state.form.mode === 'auto') state.form.budget = editMoney(recommendedValue); else state.form.bid = editMoney(recommendedValue); state.quotes = []; renderControls(state); renderPreview(state); }) : el('div', 'avb-kpi');
      if (hasRecommendation) { recommendationMetric.disabled = state.busy || !state.ctx.canManage; recommendationMetric.setAttribute('aria-label', (state.form.mode === 'auto' ? 'Рекомендовано: ' : 'Рекомендация: ') + money(recommendedValue)); }
      currentMetric.append(el('small', '', 'Сейчас · ' + modeLabel(current.mode)), el('strong', 'avb-big-value', current.mode === 'manual' ? money(current.bid_penny) : current.mode === 'auto' ? money(current.budget_penny) : modeLabel(current.mode)));
      recommendationMetric.append(el('small', '', state.form.mode === 'auto' ? 'Рекомендованный бюджет' : 'Рекомендация Авито'), el('strong', 'avb-big-value', state.form.mode === 'base' ? 'Не требуется' : money(recommendedValue)));
      if (hasRecommendation) recommendationMetric.append(el('small', '', 'Подставить'));
      selectionMetric.append(el('small', '', 'Выбрано объявлений'), el('strong', 'avb-big-value', String(state.selected.size || 1)));
      heading.append(el('small', 'avb-current-meta', 'За ' + actionLabel(value.action_type_id) + ' · ' + new Date(cached.at).toLocaleTimeString('ru-RU')));
      grid.append(currentMetric, recommendationMetric, selectionMetric); target.append(grid);
      if (dashboard && state.form.mode === 'manual') {
        var ours = dashboard.recommendation(item, dashboardEnv(state).peers(), value);
        if (ours) { var advice = button(state, 'AVITOBOSS: ' + money(ours.value) + ' · подставить', 'avb-own-recommendation', function () { state.form.bid = editMoney(ours.value); state.quotes = []; renderControls(state); renderPreview(state); }); advice.title = ours.reason; advice.disabled = state.busy || !state.ctx.canManage; target.append(advice); }
      }
      var tabs = el('div', 'avb-mode-tabs');
      ['manual', 'auto', 'base'].forEach(function (mode) { var control = button(state, modeLabel(mode), 'avb-secondary', function () { state.form.mode = mode; state.quotes = []; renderControls(state); renderPreview(state); }); control.setAttribute('aria-pressed', String(state.form.mode === mode)); control.disabled = state.busy || (mode === 'manual' && !value.manual) || (mode === 'auto' && !value.auto); tabs.append(control); }); target.append(tabs);
      if (state.form.mode === 'manual' && value.manual) {
        var fields = el('div', 'avb-fields-grid'); target.append(fields);
        var bidInput = field(state, 'Новая ставка, ₽', 'bid', fields);
        var limitInput = field(state, 'Обязательный лимит в день, ₽ / объявл.', 'limit', fields);
        limitInput.placeholder = 'Укажите дневной предел'; limitInput.required = true;
        if (dashboard && moneyRange(value.manual.min_bid_penny, value.manual.max_bid_penny) && value.manual.max_bid_penny > value.manual.min_bid_penny) {
          var slider = el('input', 'avb-bid-slider'); slider.type = 'range'; slider.min = String(value.manual.min_bid_penny + 1); slider.max = String(Math.max(value.manual.min_bid_penny + 1, Math.min(35000, value.manual.max_bid_penny))); slider.step = '1'; slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), moneyInput(state.form.bid) || value.manual.recommended_bid_penny || Number(slider.min)))); slider.setAttribute('aria-label', 'Ставка для выбранной группы, максимум 350 рублей'); slider.disabled = state.busy || !state.ctx.canManage || value.manual.min_bid_penny >= 35000;
          slider.addEventListener('input', function () { if (!valid(state) || state.busy) return; state.form.bid = editMoney(Number(slider.value)); bidInput.value = state.form.bid; state.quotes = []; renderForecast(state); renderChart(state); renderPreview(state); }); target.append(slider, el('small', 'avb-muted', 'Ползунок меняет только черновик общей ставки. Лимит задан на одно объявление.'));
        }
        target.append(el('p', 'avb-muted', 'Ставка до ' + money(Math.min(35000,value.manual.max_bid_penny)) + ' за ' + actionLabel(value.action_type_id) + '. Дневной лимит задаётся отдельно.'));
      } else if (state.form.mode === 'auto' && value.auto) {
        var select = el('select'); select.setAttribute('aria-label', 'Период автобюджета'); ['1d', '7d', '30d'].forEach(function (period) { var prop = { '1d': 'daily', '7d': 'weekly', '30d': 'monthly' }[period]; if (value.auto[prop]) select.append(new win.Option({ '1d': 'На день', '7d': 'На 7 дней', '30d': 'На 30 дней' }[period], period)); }); select.value = state.form.period; select.disabled = state.busy || !state.ctx.canManage;
        select.addEventListener('change', function () { if (!valid(state)) return; state.form.period = select.value; state.quotes = []; renderControls(state); renderPreview(state); }); target.append(select); field(state, 'Бюджет на объявление за выбранный период, ₽', 'budget', target);
      } else if (state.form.mode === 'base') target.append(el('p', 'avb-warning', 'Возврат к базовой цене Авито: выбранные повышенные ставки и бюджеты будут сброшены. Это не бесплатное размещение.'));
      state.forecastHost = null;
      if (state.form.mode !== 'base') { state.forecastHost = el('div', 'avb-forecast'); target.append(state.forecastHost); renderForecast(state); ladder(state, value, target); }
      state.formError = el('p', 'avb-error'); state.formError.setAttribute('role','alert'); target.append(state.formError);
      var preview = button(state, (state.ctx.serverQueue === false ? 'Рассчитать для выбранных (' : 'Проверить и поставить в очередь (') + (state.selected.size || 1) + ')', 'avb-primary', function () { if(state.ctx.serverQueue===false)previewChanges(state);else serverPreviewChanges(state); }); preview.disabled = state.busy || state.detailLoading || !state.ctx.canManage; target.append(preview);
      if (!state.ctx.canManage) target.append(el('p', 'avb-warning', 'Только просмотр. Изменение расходов доступно владельцу или менеджеру.'));
    }
    function pendingIds(state) { return state.selected.size ? Array.from(state.selected) : state.selectedId ? [state.selectedId] : []; }
    async function pollJobs(state) {
      if (!valid(state)) return;
      try { var reply = await request(state, '/jobs'); if (Array.isArray(reply.jobs)) state.jobs = reply.jobs; renderSummary(state); renderServerJobs(state); } catch (_) { /* Keep the last confirmed server state. */ }
      if (valid(state) && (state.jobs||[]).some(function(job){return ['queued','running'].indexOf(job.status)>=0;})) { state.jobsTimer = win.setTimeout(function () { pollJobs(state); }, 15000); if(state.jobsTimer&&state.jobsTimer.unref)state.jobsTimer.unref(); }
    }
    function renderServerJobs(state) {
      if (!state.parts || !state.parts.jobs) return;
      var host = state.parts.jobs; host.replaceChildren();
      (state.jobs || []).slice(0,3).forEach(function (job) {
        var counts = job.counts || {}, row = el('div','avb-server-job'), done = (counts.applied||0)+(counts.rejected||0)+(counts.unknown||0)+(counts.cancelled||0)+(counts.superseded||0), meter = el('progress'); meter.max = job.item_count; meter.value = done;
        row.append(el('strong','',({queued:'В очереди',running:'Выполняется на сервере',complete:'Готово',partial:'Частично / заменено новой ставкой',blocked:'Остановлено: проверьте результат',cancelled:'Остановлено',expired:'Срок очереди истёк'})[job.status] || job.status),el('span','','Применено '+(counts.applied||0)+' / '+job.item_count),meter);
        if (['queued','running'].indexOf(job.status)>=0) row.append(button(state,'Остановить оставшиеся','avb-secondary',async function(){try { await request(state,'/queue-cancel',{job_id:job.id}); if(state.jobsTimer)win.clearTimeout(state.jobsTimer);pollJobs(state); }catch(error){note(state,message(error),'error');}}));
        if (job.status==='blocked') row.append(el('small','avb-warning','Автоматического повтора нет. '+((job.results||[]).find(function(r){return r.error_code;})||{}).error_code));
        host.append(row);
      });
    }
    async function serverPreviewChanges(state) {
      if (!valid(state) || state.busy || !state.ctx.canManage) return;
      try {
        var ids = pendingIds(state), cached = state.details.get(state.selectedId);
        if (!ids.length || ids.length>10000) throw Error('Выберите от 1 до 10 000 объявлений.');
        if (state.groupSelection && (state.loadingAll || state.loading || state.next!=null)) throw Error('Дождитесь загрузки полного состава группы.');
        var change = validateForm(state.form,cached&&cached.value), fingerprint = JSON.stringify([ids,state.form]);
        state.busy=true; state.serverDraft=null;
        var reply=await request(state,'/queue-preview',{item_ids:ids,change:change});
        if (!reply.quote || !reply.after || reply.count!==ids.length) throw Error('Сервер не подтвердил очередь.');
        state.serverDraft={reply:reply,fingerprint:fingerprint};
        note(state,'Проверьте ставку и общий предел расходов. Очередь ещё не запущена.');
      } catch(error) { if(state.formError)state.formError.textContent=message(error); note(state,message(error),'error'); }
      finally {state.busy=false;renderPreview(state);}
    }
    function prepareBulk(state, ids, form) {
      if (state.groupSelection && state.next != null) throw new Error('Сначала дождитесь загрузки всей группы. Предыдущие данные остаются на экране.');
      if (ids.length > 10000) throw new Error('В очереди допустимо не более 10 000 объявлений.');
      var cached = state.details.get(state.selectedId), value = cached && cached.value;
      var change = validateForm(form, value);
      state.bulkIntent = { ids: ids.slice(), form: Object.assign({}, form), change: change, action: value.action_type_id, at: Date.now(), fingerprint: dashboard.fingerprint(ids, form) };
      state.quotes = []; state.results = [];
      note(state, 'Проверьте общую ставку, количество и сумму лимитов. После одного подтверждения каждое объявление будет проверено заново и обработано по очереди.');
      renderPreview(state);
    }
    async function applyBulk(state, intent) {
      if (!valid(state) || state.busy || !state.ctx.canManage || state.bulkIntent !== intent || Date.now() - intent.at > 300000 || dashboard.fingerprint(pendingIds(state), state.form) !== intent.fingerprint) return note(state, 'Настройки или состав изменились. Сначала рассчитайте очередь заново.', 'warning');
      var change = Object.assign({}, intent.change), ids = intent.ids.slice();
      state.busy = true; state.cancelAllLoad = true; state.cancelPreview = false; state.results = []; state.bulkIntent = null;
      function current() { return valid(state) && state.ctx.canManage && !state.cancelPreview && state.dialog && state.dialog.open; }
      state.runner = createRunner({
        isCurrent: current, wait: function () { return pace(state, 6500); },
        perform: async function (id) {
          var quote;
          try { if (!current()) return { status: 'not_sent', stop: true }; quote = await request(state, '/preview', Object.assign({ item_id: id }, change)); }
          catch (error) { return { status: 'rejected', error: message(error), stop: true }; }
          if (!quote.quote || !quote.after || !quote.expires_at || Date.parse(quote.expires_at) <= Date.now()) return { status: 'rejected', error: 'Сервер не подтвердил предварительную проверку.', stop: true };
          if (quote.after.action_type_id !== intent.action || Object.keys(change).some(function (key) { return quote.after[key] !== change[key]; })) return { status: 'rejected', error: 'Другой тип оплаты или условия; ставка не отправлена.', stop: true };
          await pace(state, 6500);
          if (!current()) return { status: 'not_sent', stop: true };
          if (Date.parse(quote.expires_at) <= Date.now()) return { status: 'rejected', error: 'Предварительная проверка устарела.', stop: true };
          note(state, 'Очередь ' + (state.results.length + 1) + '/' + ids.length + ' · ID ' + id);
          var result = await request(state, '/apply', { quote: quote.quote, confirmation: 'APPLY_BIDS' });
          return ['applied', 'rejected', 'unknown'].indexOf(result.status) >= 0 ? result : { status: 'unknown', error: 'Результат не подтверждён.' };
        },
        onResult: function (id, result) {
          state.results.push({ id: id, status: result.status, error: result.error && (result.error.message || result.error.code || String(result.error)) });
          if (result.status === 'applied') {
            var after = Object.assign({ action_type_id: intent.action }, change), item = state.items.find(function (row) { return String(row.item_id) === id; }), cached = state.details.get(id);
            if (item) { item.promotion = after; item.promotion_stale = false; }
            if (cached) { cached.value.current = after; cached.at = Date.now(); }
            remember(state);
          }
          if (valid(state)) { renderPreview(state); renderTable(state); renderSummary(state); }
        }
      });
      renderToolbar(state); renderControls(state); renderPreview(state);
      try { await state.runner.run(ids); }
      catch (error) { if (valid(state)) note(state, message(error) + ' Оставшиеся запросы остановлены.', 'warning'); }
      finally {
        var completed = new Set(state.results.map(function (row) { return row.id; }));
        ids.forEach(function (id) { if (!completed.has(id)) state.results.push({ id: id, status: 'not_sent' }); });
        state.busy = false;
        if (valid(state)) { note(state, 'Очередь завершена: подтверждено ' + state.results.filter(function (row) { return row.status === 'applied'; }).length + '/' + ids.length + '. Неотправленные не применены; автоматического повтора нет.'); renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state); }
      }
    }
    async function previewChanges(state) {
      if (!valid(state) || state.busy || !state.ctx.canManage) return;
      var ids = pendingIds(state), form = Object.assign({}, state.form);
      if (dashboard && state.groupSelection && (state.next != null || state.loadingAll || state.loading)) return note(state, 'Дождитесь загрузки всей группы: состав ещё обновляется. Сейчас ставки не отправлены.', 'warning');
      if (dashboard && ids.length > MAX_BATCH) { try { prepareBulk(state, ids, form); } catch (error) { note(state, message(error), 'warning'); } return; }
      if (!ids.length || ids.length > MAX_BATCH) return note(state, 'Выберите от 1 до 20 объявлений.', 'warning');
      state.busy = true; state.cancelAllLoad = true; state.cancelPreview = false; state.quotes = []; state.results = []; renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state);
      try {
        var details = [];
        for (var i = 0; i < ids.length; i += 1) { if (!valid(state) || state.cancelPreview) return; note(state, 'Проверяем целевые действия ' + (i + 1) + '/' + ids.length + '…'); details.push(await detail(state, ids[i], false)); }
        if (!sameActions(details)) throw new Error('В группе разные целевые действия. Разделите просмотры, звонки и контакты в чате: общую ставку применять небезопасно.');
        var payloads = details.map(function (value) { return validateForm(form, value); });
        for (var j = 0; j < ids.length; j += 1) {
          if (!valid(state) || state.cancelPreview) return;
          note(state, 'Предпросмотр ' + (j + 1) + '/' + ids.length + '… Это ещё не изменение ставок.');
          await pace(state, 3200);
          if (!valid(state) || state.cancelPreview) return;
          var reply = await request(state, '/preview', Object.assign({ item_id: ids[j] }, payloads[j]));
          if (!reply.quote || !reply.after || !reply.expires_at) throw new Error('Сервер не подтвердил предпросмотр. Изменения не применялись.');
          state.quotes.push({ id: ids[j], quote: reply.quote, expires: reply.expires_at, before: reply.before, after: reply.after });
        }
        note(state, 'Проверьте каждое изменение и подтвердите ниже. Ставки ещё не изменены.');
      } catch (error) { state.quotes = []; note(state, message(error) + ' Ставки не изменялись.', 'error'); }
      finally { state.busy = false; if (valid(state)) { if (state.cancelPreview) state.quotes = []; renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state); } }
    }
    function renderPreview(state) {
      if (!valid(state) || !state.parts) return;
      var target = state.parts.preview; target.replaceChildren();
      if(state.ctx.serverQueue !== false){
      var draft=state.serverDraft, fresh=draft&&draft.fingerprint===JSON.stringify([pendingIds(state),state.form]);
      if(state.parts.chart)state.parts.chart.hidden=!!fresh;
      state.parts.controls.hidden=!!fresh;
      if(fresh){
        var quote=draft.reply, summary=el('details','avb-server-consent');summary.open=true;
        summary.append(el('summary','','Подтверждение · '+quote.count+' объявлений'),el('strong','',currentLabel(quote.after)),el('p','avb-warning',quote.after.mode==='base'?'Повышенное продвижение будет отключено. Базовое размещение может быть платным.':'Общий предел: '+money((quote.after.limit_penny||quote.after.budget_penny)*quote.count)+' / '+(quote.after.mode==='manual'?'день':quote.after.budget_type)+'. Это лимит, не прогноз.'));
        summary.append(el('small','avb-muted','Работает без браузера, до 24 часов. Условия каждого объявления проверяются перед отправкой. Новая очередь заменяет ещё не отправленные ставки этих объявлений. Неизвестный ответ останавливает очередь без повтора.'),button(state,'← Изменить параметры','avb-secondary',function(){state.serverDraft=null;renderPreview(state);}));
        var check=el('input');check.type='checkbox';var label=el('label','avb-risk-confirm');label.append(check,el('span','','Подтверждаю расходы и запуск серверной очереди.'));
        var send=button(state,'Подтвердить и запустить','avb-danger',async function(){
          if(!check.checked||state.busy||state.serverDraft!==draft||draft.fingerprint!==JSON.stringify([pendingIds(state),state.form]))return;
          state.busy=true;send.disabled=true;
          try{var result=await request(state,'/queue-confirm',{quote:quote.quote,confirmation:'QUEUE_BIDS'});if(!result.job)throw Error('Статус не подтверждён. Проверьте список очередей перед новым запуском.');state.serverDraft=null;note(state,'Очередь сохранена на сервере. Можно закрыть окно и браузер.');if(state.jobsTimer)win.clearTimeout(state.jobsTimer);await pollJobs(state);}catch(error){note(state,message(error)+' Проверьте очереди: подтверждение могло сохраниться. Повтор этого же подтверждения не создаёт новую очередь.','warning');}finally{state.busy=false;renderPreview(state);}
        });send.disabled=true;check.addEventListener('change',function(){send.disabled=!check.checked||state.busy;});summary.append(label,send);target.append(summary);
      }
      var jobs=el('div','avb-server-jobs');target.append(jobs);state.parts.jobs=jobs;renderServerJobs(state);
      return;
      }
      if (state.busy) { var cancel = button(state, 'Остановить оставшиеся', 'avb-secondary', function () { state.cancelPreview = true; if (state.runner) state.runner.cancel(); note(state, 'Останавливаем оставшиеся операции. Уже отправленный запрос отменить нельзя.', 'warning'); }); target.append(cancel); }
      var intent = dashboard && state.bulkIntent;
      if (intent && !state.busy && intent.fingerprint === dashboard.fingerprint(pendingIds(state), state.form)) {
        target.append(el('p', 'avb-muted', 'Большая группа обрабатывается постепенно из-за лимитов API. Не закрывайте окно и вкладку до завершения. Автоматического повтора или возобновления платных операций нет.'));
        target.append(el('h3', '', 'Вся группа · ' + intent.ids.length + ' объявлений'), el('p', 'avb-note', currentLabel(Object.assign({ action_type_id: intent.action }, intent.change))), el('p', 'avb-warning', (intent.change.mode === 'base' ? 'Повышенные ставки будут сброшены. Базовая цена не означает бесплатное размещение.' : 'Сумма лимитов / бюджетов: ' + money((intent.change.limit_penny || intent.change.budget_penny) * intent.ids.length) + '. Это верхние лимиты, не прогноз расхода.') + ' У каждого объявления проверяются актуальные условия. При ошибке очередь останавливается; отправленные действия не откатываются.'));
        var targets = el('details', 'avb-queue-targets'); targets.append(el('summary', '', 'Список ID выбранных объявлений'), el('p', '', intent.ids.join(', '))); target.append(targets);
        var consent = el('input'); consent.type = 'checkbox'; var label = el('label', 'avb-risk-confirm'); label.append(consent, el('span', '', 'Подтверждаю эти условия для всех перечисленных объявлений и запуск одной очереди.'));
        var start = button(state, 'Применить ко всей группе (' + intent.ids.length + ')', 'avb-danger', function () { if (consent.checked) applyBulk(state, intent); }); start.disabled = true; consent.addEventListener('change', function () { start.disabled = !consent.checked; }); target.append(label, start);
      }
      if (state.quotes.length) {
        target.append(el('h3', '', 'Подтверждение · ' + (state.ctx.account.display_name || state.ctx.account.id)), el('p', 'avb-note', state.quotes.length + ' объявлений. Деньги и лимиты указаны для каждого объявления отдельно; это не гарантия фактического расхода.'));
        var table = el('table', 'avb-table'), header = el('tr'); ['Объявление', 'Было', 'Станет'].forEach(function (text) { header.append(el('th', '', text)); }); var thead = el('thead'); thead.append(header); table.append(thead); var body = el('tbody');
        state.quotes.forEach(function (quote) { var row = el('tr'), item = state.items.find(function (entry) { return String(entry.item_id) === quote.id; }); row.append(el('td', '', (item ? item.title : quote.id) + ' · ID ' + quote.id), el('td', '', currentLabel(quote.before)), el('td', '', currentLabel(quote.after))); body.append(row); }); table.append(body); target.append(table);
        var totals = {};
        state.quotes.forEach(function (quote) { var after = quote.after, key = after.mode === 'manual' ? 'дневных лимитов' : after.mode === 'auto' ? 'бюджетов ' + ({ '1d': 'на день', '7d': 'на 7 дней', '30d': 'на 30 дней' }[after.budget_type] || '') : ''; var value = after.mode === 'manual' ? after.limit_penny : after.budget_penny; if (key && Number.isSafeInteger(value)) totals[key] = (totals[key] || 0) + value; });
        Object.keys(totals).forEach(function (key) { target.append(el('p', 'avb-kpi', 'Сумма ' + key + ': ' + money(totals[key]))); });
        if (!state.busy) {
          var label = el('label', 'avb-risk-confirm'), check = el('input'); check.type = 'checkbox'; label.append(check, el('span', '', 'Подтверждаю изменение рекламных расходов в этом аккаунте по таблице выше.'));
          var apply = button(state, 'Применить к ' + state.quotes.length + ' объявлениям', 'avb-danger', function () { if (check.checked) applyChanges(state); }); apply.disabled = true;
          check.addEventListener('change', function () { apply.disabled = !check.checked; }); target.append(label, apply);
        }
      }
      if (state.results.length) {
        var results = el('div', 'avb-results'); results.append(el('h3', '', 'Результат применения'));
        if (dashboard && state.results.length > 100) results.append(el('small', 'avb-muted', 'Всего записей: ' + state.results.length + '. Показаны последние 100; подтверждённые операции также записаны на сервере.'));
        (dashboard ? state.results.slice(-100) : state.results).forEach(function (entry) { results.append(el('p', entry.status === 'applied' ? 'avb-note' : 'avb-warning', 'ID ' + entry.id + ' · ' + ({ applied: 'Применено', rejected: 'Отклонено', not_sent: 'Не отправлено', unknown: 'Нет подтверждения — проверьте в Авито; не повторять автоматически' }[entry.status] || entry.status) + (entry.error ? ': ' + entry.error : ''))); }); target.append(results);
      }
    }
    async function applyChanges(state) {
      if (!valid(state) || state.busy || !state.ctx.canManage || !state.quotes.length) return;
      if (state.quotes.some(function (quote) { return !Number.isFinite(Date.parse(quote.expires)) || Date.parse(quote.expires) <= Date.now(); })) { state.quotes = []; renderPreview(state); return note(state, 'Предпросмотр устарел. Рассчитайте заново.', 'warning'); }
      var quotes = state.quotes.slice(); state.busy = true; state.cancelAllLoad = true; state.results = []; renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state);
      state.runner = createRunner({
        isCurrent: function () { return valid(state) && !!state.ctx.canManage; },
        wait: function () { return pace(state, 6500); },
        perform: async function (quote) {
          if (Date.parse(quote.expires) <= Date.now()) return { status: 'rejected', error: 'Предпросмотр устарел; запрос не отправлен.' };
          note(state, 'Применяем ID ' + quote.id + '… Не закрывайте страницу до ответа.');
          var reply = await request(state, '/apply', { quote: quote.quote, confirmation: 'APPLY_BIDS' });
          return ['applied', 'rejected', 'unknown'].indexOf(reply.status) >= 0 ? reply : { status: 'unknown', error: 'Сервер не подтвердил результат.' };
        },
        onResult: function (quote, result) {
          state.results.push({ id: quote.id, status: result.status, error: result.error && (result.error.message || result.error.code || String(result.error)) });
          if (result.status === 'applied') { var current = state.details.get(quote.id); if (current) { current.value.current = quote.after; current.value.mode = quote.after.mode; current.at = Date.now(); } var item = state.items.find(function (entry) { return String(entry.item_id) === quote.id; }); if (item) item.promotion = quote.after; remember(state); }
          renderPreview(state); renderTable(state); renderSummary(state);
        }
      });
      try { await state.runner.run(quotes); }
      finally {
        state.busy = false; state.quotes = [];
        quotes.forEach(function (quote) { if (!state.results.some(function (entry) { return entry.id === quote.id; })) state.results.push({ id: quote.id, status: 'not_sent' }); });
        if (valid(state)) { note(state, 'Подтверждено: ' + state.results.filter(function (entry) { return entry.status === 'applied'; }).length + '/' + quotes.length + '. Неотправленные операции не применены. Неопределённый результат проверьте вручную в Авито.'); renderToolbar(state); renderTable(state); renderControls(state); renderPreview(state); }
      }
    }
    return { mount: mount, clear: clear };
  }
  return { install: install, moneyInput: moneyInput, money: money, actionLabel: actionLabel, offerAt: offerAt, scopeKey: scopeKey, validateForm: validateForm, sameActions: sameActions, effectiveCurrent: effectiveCurrent, averageBids: averageBids, createRunner: createRunner, statValue: statValue, sortItems: sortItems, groupAppearance: groupAppearance, groupContains: groupContains, mergeStatistics: mergeStatistics, CONTACT_GROUP_ID: CONTACT_GROUP_ID };
}));
