(function () {
  'use strict';
  if (window.AVITOLOG_ADS_DASHBOARD) return;

  var legacyRender = window.__showAdsPage;
  var active = null;
  var ORIGIN = 'https://avitoboss.online';
  var ACCOUNTS_URL = ORIGIN + '/integrations/avito-accounts/';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var ACCOUNT_ID = /^[1-9][0-9]{0,19}$/;
  var PREF_PREFIX = 'avitolog_ads_dashboard_v1:';
  var SNAPSHOT_PREFIX = 'avitolog_ads_snapshot_v1:';
  var API_METRICS = ['views', 'contacts', 'contactsShowPhone', 'contactsMessenger', 'favorites', 'spending'];
  var DEFAULT_ACCOUNTS = [['филпродвижение', 'филproдвижение'], ['filaiмаркетинг']];
  var COMPACT_NUMBERS = ['earned', 'bought', 'cpl', 'cpv', 'crm', 'kp', 'phones', 'messages'];
  var COMPACT_CHARTS = ['contacts', 'views', 'spending'];
  var METRICS = [
    { key: 'earned', name: 'Заработано', icon: '₽', money: true, color: '#00d49a' },
    { key: 'contacts', name: 'Контакты', icon: '☏', color: '#b18aff' },
    { key: 'phones', name: 'Показали телефон', icon: '☎', color: '#44c5ff' },
    { key: 'messages', name: 'Написали в чат', icon: '✉', color: '#bd91ff' },
    { key: 'crm', name: 'В CRM', icon: '+', color: '#5ee8cd' },
    { key: 'kp', name: 'Отправлено КП', icon: '↗', color: '#ffd577' },
    { key: 'bought', name: 'Купили', icon: '✓', color: '#5ee89b' },
    { key: 'spending', name: 'Расходы на рекламу', icon: '₽', money: true, color: '#ff9e79' },
    { key: 'cpl', name: 'Цена за лид', icon: '₽', money: true, color: '#ffa4cb' },
    { key: 'cpv', name: 'Средняя цена просмотра', icon: '₽', money: true, color: '#79caff' },
    { key: 'views', name: 'Просмотры', icon: '◉', color: '#44c5ff' }
  ];

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, action) {
    var node = element('button', className, text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function profile() { return window.AVITOLOG_KEY_SUFFIX === '_sasha' || window.AVITOLOG_USER === 'sasha' ? 'sasha' : 'fil'; }
  function userId() {
    try {
      var identity = typeof window.__avitologBackendIdentity === 'function' && window.__avitologBackendIdentity();
      var id = String(identity && identity.id || '').toLowerCase();
      return UUID.test(id) ? id : '';
    } catch (error) { return ''; }
  }
  function preferenceKey() { var id = userId(); return id ? PREF_PREFIX + id + ':' + profile() : ''; }
  function snapshotKey() {
    var config = window.AVITOLOG_SUPABASE || {}, id = userId();
    var org = String(config.profileOrganizations && config.profileOrganizations[profile()] || '').toLowerCase();
    return id && UUID.test(org) ? SNAPSHOT_PREFIX + id + ':' + profile() + ':' + org : '';
  }
  function safeMetric(value) { return typeof value === 'number' && isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null; }
  function cachedRaw(key) {
    var cache = window.AVITOLOG_ADS_CACHE;
    return cache ? cache.get(key) : localStorage.getItem(key);
  }
  function persistRaw(state, key, raw, warning) {
    var cache = window.AVITOLOG_ADS_CACHE;
    if (cache) {
      cache.write(key, raw).then(function (saved) {
        if (!saved && current(state)) { state.localWarning = warning; renderStatus(state); }
      });
    } else localStorage.setItem(key, raw);
  }
  function cleanStatistics(values) {
    var helper = window.AVITOLOG_ADS_FUNNEL;
    if (!helper || !Array.isArray(values) || values.length > 200) return [];
    var span = helper.range(new Date()), seen = Object.create(null);
    function metrics(value) { var result = {}; API_METRICS.forEach(function (key) { result[key] = safeMetric(value && value[key]); }); return result; }
    return values.filter(function (value) {
      var id = String(value && value.avitoUserId || '');
      if (!ACCOUNT_ID.test(id) || seen[id]) return false;
      seen[id] = true; return true;
    }).map(function (value) {
      var today = value.today || {}, history = value.history || {};
      var validToday = today.available === true && today.date === span.today;
      var validHistory = history.available === true && history.dateFrom === span.dateFrom && history.dateTo === span.today && Array.isArray(history.days) && history.days.length === span.days.length && history.days.every(function (day, index) { return day && day.date === span.days[index]; });
      var days = span.days.map(function (date, index) { return Object.assign({ date: date }, metrics(validHistory ? history.days[index] : null)); });
      var totals = {};
      API_METRICS.forEach(function (key) { totals[key] = days.every(function (day) { return day[key] !== null; }) ? days.reduce(function (sum, day) { return sum + day[key]; }, 0) : null; });
      return { avitoUserId: String(value.avitoUserId), name: typeof value.name === 'string' ? value.name.slice(0, 200) : 'Avito', today: Object.assign({ available: validToday, date: span.today }, metrics(validToday ? today : null)), history: { available: validHistory, dateFrom: span.dateFrom, dateTo: span.today, days: days, totals: totals } };
    });
  }
  function hasStatistics(statistics) { return statistics.some(function (entry) { return API_METRICS.some(function (key) { return entry.today[key] !== null || entry.history.days.some(function (day) { return day[key] !== null; }); }); }); }
  function restoreSnapshot(state, raw) {
    if (!ready() || !current(state)) return;
    var key = state.snapshotKey;
    if (!key) return;
    try {
      if (raw === undefined) raw = cachedRaw(key);
      if (!raw || raw.length > 500000) return;
      var saved = JSON.parse(raw), span = window.AVITOLOG_ADS_FUNNEL.range(new Date());
      if (!saved || saved.version !== 1 || saved.date !== span.today || typeof saved.savedAt !== 'number' || !isFinite(saved.savedAt) || saved.savedAt > Date.now() + 60000 || Date.now() - saved.savedAt > 24 * 3600000) return;
      var selected = state.preferences.selectedAccountIds || [];
      state.statistics = cleanStatistics(saved.statistics).filter(function (entry) { return selected.indexOf(entry.avitoUserId) !== -1; });
      if (!hasStatistics(state.statistics)) { state.statistics = []; return; }
      state.accounts = safeAccounts(saved.accounts).filter(function (account) { return selected.indexOf(account.avitoUserId) !== -1; });
      state.statisticsDate = span.today; state.updatedAt = new Date(saved.savedAt); state.showingPrevious = true;
    } catch (error) {}
  }
  function saveSnapshot(state) {
    if (!current(state) || !ready() || !hasStatistics(state.statistics)) return;
    var key = state.snapshotKey, selected = state.preferences.selectedAccountIds || [];
    if (!key) return;
    try {
      var stamp = state.showingPrevious && state.previousUpdatedAt || state.updatedAt;
      var data = { version: 1, date: window.AVITOLOG_ADS_FUNNEL.range(new Date()).today, savedAt: stamp ? stamp.getTime() : Date.now(), accounts: safeAccounts(state.accounts).filter(function (account) { return selected.indexOf(account.avitoUserId) !== -1; }), statistics: cleanStatistics(state.statistics).filter(function (entry) { return selected.indexOf(entry.avitoUserId) !== -1; }) };
      var raw = JSON.stringify(data);
      if (raw.length <= 500000) persistRaw(state, key, raw, 'Кэш статистики не сохранён; рабочие данные не изменены.');
    } catch (error) { state.localWarning = 'Кэш статистики не сохранён; рабочие данные не изменены.'; }
  }
  function handleApiError(state, error) {
    if (!current(state)) return;
    if (/^(subject_mismatch|organization_forbidden|account_forbidden)$/.test(error && error.message || '')) {
      state.statistics = []; state.accounts = []; state.accountsLoaded = false; state.updatedAt = null; state.showingPrevious = false;
      try { if (state.snapshotKey) { if (window.AVITOLOG_ADS_CACHE) window.AVITOLOG_ADS_CACHE.remove(state.snapshotKey); else localStorage.removeItem(state.snapshotKey); } } catch (ignore) {}
      renderSettings(state);
    }
    if (error && error.message === 'auth_required') state.showingPrevious = hasStatistics(state.statistics);
    state.apiWarning = bridgeError(error);
  }
  function mergeStatistics(state, fresh) {
    var cleaned = cleanStatistics(fresh), changed = false;
    cleaned.forEach(function (next) {
      var previous = state.statistics.filter(function (entry) { return entry.avitoUserId === next.avitoUserId; })[0];
      if (!hasStatistics([next])) { if (previous) state.refreshRetained = true; return; }
      changed = true;
      if (previous) {
        function retain(old, value) {
          API_METRICS.forEach(function (key) { if (value[key] === null && old[key] !== null) { value[key] = old[key]; state.refreshRetained = true; } });
        }
        retain(previous.today, next.today);
        if (previous.today.available) next.today.available = true;
        next.history.days.forEach(function (day, index) { retain(previous.history.days[index], day); });
        if (previous.history.available) next.history.available = true;
        API_METRICS.forEach(function (key) { next.history.totals[key] = next.history.days.every(function (day) { return day[key] !== null; }) ? next.history.days.reduce(function (sum, day) { return sum + day[key]; }, 0) : null; });
      }
      state.statistics = state.statistics.filter(function (entry) { return entry.avitoUserId !== next.avitoUserId; }).concat([next]);
    });
    return changed;
  }
  function accountIds(value) {
    if (!Array.isArray(value) || value.length > 200) return [];
    return value.map(String).filter(function (id, index, all) { return ACCOUNT_ID.test(id) && all.indexOf(id) === index; });
  }
  function defaults() {
    var visible = {};
    METRICS.forEach(function (metric) { visible[metric.key] = true; });
    return { period: 'month', viewMode: 'charts', dailyMetric: 'contacts', metrics: visible, calendar: profile() === 'fil', expenses: false, links: false, selectedAccountIds: null, sourceMap: Object.create(null) };
  }
  function readPreferences(raw) {
    var result = defaults();
    var key = preferenceKey();
    if (!key) return result;
    try {
      if (raw === undefined) raw = cachedRaw(key);
      if (!raw || raw.length > 64000) return result;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
      result.period = saved.period === 'today' ? 'today' : 'month';
      result.viewMode = ['compact', 'daily'].indexOf(saved.viewMode) !== -1 ? saved.viewMode : 'charts';
      result.dailyMetric = ['contacts', 'spending', 'earned', 'bought', 'views'].indexOf(saved.dailyMetric) !== -1 ? saved.dailyMetric : 'contacts';
      METRICS.forEach(function (metric) { result.metrics[metric.key] = !(saved.metrics && saved.metrics[metric.key] === false); });
      ['calendar', 'expenses', 'links'].forEach(function (key) { if (typeof saved[key] === 'boolean') result[key] = saved[key]; });
      if (Array.isArray(saved.selectedAccountIds)) result.selectedAccountIds = accountIds(saved.selectedAccountIds);
      if (saved.sourceMap && typeof saved.sourceMap === 'object' && !Array.isArray(saved.sourceMap)) {
        Object.keys(saved.sourceMap).slice(0, 200).forEach(function (sourceId) {
          var id = String(saved.sourceMap[sourceId]);
          if (sourceId.length <= 100 && sourceId !== '__proto__' && sourceId !== 'constructor' && ACCOUNT_ID.test(id)) result.sourceMap[sourceId] = id;
        });
      }
    } catch (error) {}
    return result;
  }
  function savePreferences(state) {
    if (!state.key || state.key !== preferenceKey()) return;
    state.preferenceRevision = (state.preferenceRevision || 0) + 1;
    try { persistRaw(state, state.key, JSON.stringify(state.preferences), 'Настройки не удалось сохранить в этом браузере.'); }
    catch (error) { state.localWarning = 'Настройки не удалось сохранить в этом браузере.'; }
  }
  function hydrateCache(state) {
    if (state.cacheAttempted || !ready() || !current(state)) return;
    state.cacheAttempted = true;
    restoreSnapshot(state);
    var cache = window.AVITOLOG_ADS_CACHE;
    if (!cache) { state.cacheReady = true; return; }
    var revision = state.preferenceRevision || 0;
    Promise.all([cache.read(state.key), cache.read(state.snapshotKey)]).then(function (values) {
      if (!current(state)) return;
      if (values[0] && revision === (state.preferenceRevision || 0)) state.preferences = readPreferences(values[0]);
      if (!state.loadVersion) restoreSnapshot(state, values[1]);
    }).catch(function () {}).then(function () {
      if (!current(state)) return;
      state.cacheReady = true;
      applyLegacyVisibility(state); render(state); renderSettings(state);
      if (!state.frame) setupBridge(state);
    });
  }
  function ready() { return !window.AVITOLOG_BACKEND_MODE || window.AVITOLOG_BACKEND_INITIAL_SYNC_READY === true; }
  function number(value, money) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    return value.toLocaleString('ru-RU', { maximumFractionDigits: money ? 2 : 0 }) + (money ? ' ₽' : '');
  }
  function normalizedName(value) { return String(value || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, ''); }
  function nonce() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') throw new Error('secure_random_unavailable');
    var data = new Uint8Array(18);
    window.crypto.getRandomValues(data);
    return Array.prototype.map.call(data, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
  }
  function current(state) { return active === state && !state.destroyed && state.key === preferenceKey() && state.profile === profile() && state.snapshotKey === snapshotKey(); }
  function mounted(state) { return state.host && state.root.isConnected !== false && state.root.parentNode === state.host; }
  function listen(state, target, type, callback) {
    target.addEventListener(type, callback);
    state.unlisten.push(function () { target.removeEventListener(type, callback); });
  }
  function destroy(state) {
    if (!state || state.destroyed) return;
    saveSnapshot(state);
    state.destroyed = true;
    state.unlisten.forEach(function (remove) { remove(); });
    if (state.observer) state.observer.disconnect();
    clearTimeout(state.frameTimer);
    Object.keys(state.pending).forEach(function (key) { state.pending[key].reject(new Error('cancelled')); });
    if (state.frame && state.frame.parentNode) state.frame.parentNode.removeChild(state.frame);
    if (active === state) active = null;
  }
  function request(state, action, ids) {
    return new Promise(function (resolve, reject) {
      if (!current(state) || !state.frame || !state.frameLoaded) { reject(new Error('unavailable')); return; }
      var id;
      try { id = nonce(); } catch (error) { reject(error); return; }
      var timer = setTimeout(function () { delete state.pending[id]; reject(new Error('timeout')); }, 90000);
      state.pending[id] = {
        resolve: function (message) { clearTimeout(timer); delete state.pending[id]; resolve(message); },
        reject: function (error) { clearTimeout(timer); delete state.pending[id]; reject(error); }
      };
      var message = { type: 'avitolog:ads:request', requestId: id, action: action };
      if (action === 'metrics') message.accountIds = ids || [];
      try { state.frame.contentWindow.postMessage(message, ORIGIN); }
      catch (error) { state.pending[id].reject(new Error('unavailable')); }
    });
  }
  function bridgeError(error) {
    var code = error && error.message || '';
    if (/auth_required|subject_mismatch/.test(code)) return 'Для статистики войдите в «Аккаунты» тем же пользователем, затем обновите ADS.';
    if (/organization_forbidden|configuration/.test(code)) return 'Для этого режима пространство аккаунтов ещё не настроено. Чужие аккаунты не загружаются.';
    if (code === 'timeout') return 'Сервис статистики не ответил вовремя. Нажмите «Обновить».';
    return 'Статистика API пока недоступна. Данные CRM и кассы показаны отдельно, без подстановки нулей.';
  }
  function openAccounts() {
    if (window.AVITOLOG_MAIN_MENU_SETTINGS && typeof window.AVITOLOG_MAIN_MENU_SETTINGS.openAccounts === 'function') window.AVITOLOG_MAIN_MENU_SETTINGS.openAccounts();
    else window.open(ACCOUNTS_URL, '_blank', 'noopener');
  }
  function setupBridge(state) {
    if (!current(state) || !state.cacheReady) return;
    (state.bridgeCleanup || []).forEach(function (remove) { remove(); });
    state.bridgeCleanup = [];
    clearTimeout(state.frameTimer);
    var config = window.AVITOLOG_SUPABASE || {};
    var organization = String(config.profileOrganizations && config.profileOrganizations[state.profile] || '').toLowerCase();
    var uid = userId();
    if (!UUID.test(organization) || !uid) {
      state.apiWarning = bridgeError(new Error(uid ? 'configuration' : 'auth_required'));
      render(state);
      return;
    }
    var frame = element('iframe', 'ads-dashboard-bridge');
    frame.hidden = true;
    frame.title = 'Защищённое чтение статистики Avito';
    frame.setAttribute('aria-hidden', 'true');
    frame.src = ACCOUNTS_URL + '?adsBridge=1&expected_user_id=' + encodeURIComponent(uid) + '&organization_id=' + encodeURIComponent(organization) + '&ads_v=20261020-ready1';
    state.frame = frame;
    var receive = function (event) {
      if (!current(state) || event.origin !== ORIGIN || event.source !== frame.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== 'avitolog:ads:response' || typeof data.requestId !== 'string') return;
      var pending = state.pending[data.requestId];
      if (!pending) return;
      if (data.ok === true) pending.resolve(data);
      else pending.reject(new Error(typeof data.code === 'string' ? data.code : 'unavailable'));
    };
    window.addEventListener('message', receive);
    var removeReceive = function () { window.removeEventListener('message', receive); };
    state.bridgeCleanup.push(removeReceive); state.unlisten.push(removeReceive);
    state.frameLoaded = false;
    listen(state, frame, 'load', function () { clearTimeout(state.frameTimer); state.frameLoaded = true; loadAccounts(state); });
    state.frameTimer = setTimeout(function () { if (current(state) && !state.frameLoaded) { state.apiWarning = bridgeError(new Error('timeout')); render(state); } }, 20000);
    // Navigation replaces the page host; keep authorized reads outside it.
    document.body.appendChild(frame);
  }
  function safeAccounts(value) {
    if (!Array.isArray(value) || value.length > 10000) return [];
    var seen = {};
    return value.filter(function (account) {
      var id = String(account && account.avitoUserId || '');
      if (!ACCOUNT_ID.test(id) || seen[id] || typeof account.name !== 'string' || account.name.length > 500) return false;
      seen[id] = true; return true;
    }).map(function (account) { return { avitoUserId: String(account.avitoUserId), name: account.name }; });
  }
  async function loadAccounts(state) {
    if (!current(state) || state.loading) return;
    state.loading = true; state.apiWarning = ''; renderStatus(state);
    try {
      var response = await request(state, 'accounts');
      if (!current(state)) return;
      state.accounts = safeAccounts(response.accounts);
      state.statistics = state.statistics.filter(function (entry) { return state.accounts.some(function (account) { return account.avitoUserId === entry.avitoUserId; }); });
      if (state.preferences.selectedAccountIds === null) {
        state.preferences.selectedAccountIds = [];
        DEFAULT_ACCOUNTS.forEach(function (names) {
          var matches = state.accounts.filter(function (account) { return names.indexOf(normalizedName(account.name)) !== -1; });
          if (matches.length === 1) state.preferences.selectedAccountIds.push(matches[0].avitoUserId);
        });
        savePreferences(state);
      }
      state.accountsLoaded = true;
      renderSettings(state);
    } catch (error) { handleApiError(state, error); }
    finally { state.loading = false; if (current(state)) { render(state); if (state.accountsLoaded) loadMetrics(state); } }
  }
  async function loadMetrics(state) {
    if (!current(state)) return;
    if (state.loading) { state.metricsQueued = true; return; }
    state.metricsQueued = false;
    state.refreshStartedAt = Date.now();
    var selected = (state.preferences.selectedAccountIds || []).filter(function (id) { return state.accounts.some(function (account) { return account.avitoUserId === id; }); });
    var version = ++state.loadVersion;
    state.statistics = cleanStatistics(state.statistics).filter(function (entry) { return selected.indexOf(entry.avitoUserId) !== -1; });
    state.showingPrevious = hasStatistics(state.statistics); state.refreshRetained = false;
    state.previousUpdatedAt = state.updatedAt;
    var received = [];
    state.loading = selected.length > 0;
    state.apiWarning = selected.length ? '' : 'Выберите свои рекламные аккаунты в настройках ADS. Клиентские аккаунты автоматически не включаются.';
    render(state);
    try {
      for (var offset = 0; offset < selected.length; offset += 4) {
        if (!current(state) || version !== state.loadVersion) return;
        state.progress = Math.min(offset + 4, selected.length) + ' / ' + selected.length;
        renderStatus(state);
        var response = await request(state, 'metrics', selected.slice(offset, offset + 4));
        if (!current(state) || version !== state.loadVersion) return;
        var allowed = selected.slice(offset, offset + 4);
        var fresh = (Array.isArray(response.statistics) ? response.statistics : []).filter(function (statistic) { return statistic && allowed.indexOf(String(statistic.avitoUserId)) !== -1; });
        cleanStatistics(fresh).forEach(function (entry) { if (hasStatistics([entry])) received.push(entry.avitoUserId); });
        if (mergeStatistics(state, fresh)) state.updatedAt = new Date();
        state.statisticsDate = window.AVITOLOG_ADS_FUNNEL.range(new Date()).today;
        state.showingPrevious = state.refreshRetained || selected.some(function (id) { return received.indexOf(id) === -1; });
        saveSnapshot(state);
        render(state);
        if (state.metricsQueued) break;
      }
    } catch (error) { if (version === state.loadVersion) handleApiError(state, error); }
    finally {
      if (current(state) && version === state.loadVersion) {
        state.loading = false; state.progress = ''; if (state.showingPrevious && state.previousUpdatedAt) state.updatedAt = state.previousUpdatedAt; render(state);
        if (state.metricsQueued) { state.metricsQueued = false; loadMetrics(state); }
      }
    }
  }
  function toggle(state, label, checked, change) {
    var wrap = element('label', 'ads-dashboard-check');
    var input = element('input'); input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', function () { change(input.checked); savePreferences(state); });
    wrap.appendChild(input); wrap.appendChild(element('span', '', label));
    return wrap;
  }
  function renderSettings(state) {
    if (!mounted(state)) return;
    empty(state.settingsContent);
    state.settingsContent.appendChild(element('h3', '', 'Режим отображения'));
    var modeLabel = element('label', 'ads-dashboard-view-mode');
    modeLabel.appendChild(element('span', '', 'Вид ADS'));
    var modeSelect = element('select'); modeSelect.setAttribute('aria-label', 'Режим отображения');
    [['charts', 'Все графики (текущий)'], ['compact', 'Компактный обзор (цифры + графики)'], ['daily', 'Ежедневный анализ (по макету)']].forEach(function (mode) {
      var option = element('option', '', mode[1]); option.value = mode[0]; modeSelect.appendChild(option);
    });
    modeSelect.value = state.preferences.viewMode;
    modeSelect.addEventListener('change', function () { state.preferences.viewMode = ['compact', 'daily'].indexOf(modeSelect.value) !== -1 ? modeSelect.value : 'charts'; savePreferences(state); render(state); });
    modeLabel.appendChild(modeSelect); state.settingsContent.appendChild(modeLabel);
    state.settingsContent.appendChild(element('p', 'ads-dashboard-muted', 'Компактный обзор: итоги цифрами, динамика контактов, просмотров и расходов — графиками. Переключение не меняет данные.'));
    state.settingsContent.appendChild(element('h3', '', 'Показатели'));
    var grid = element('div', 'ads-dashboard-settings-grid');
    METRICS.forEach(function (metric) { grid.appendChild(toggle(state, metric.icon + ' ' + metric.name, state.preferences.metrics[metric.key], function (checked) { state.preferences.metrics[metric.key] = checked; render(state); })); });
    grid.appendChild(toggle(state, 'Контент-календарь', state.profile === 'fil' && state.preferences.calendar, function (checked) { state.preferences.calendar = checked; applyLegacyVisibility(state); }));
    grid.appendChild(toggle(state, 'Ручные расходы (старый блок)', state.preferences.expenses, function (checked) { state.preferences.expenses = checked; applyLegacyVisibility(state); }));
    grid.appendChild(toggle(state, 'Ссылки (старый блок)', state.preferences.links, function (checked) { state.preferences.links = checked; applyLegacyVisibility(state); }));
    state.settingsContent.appendChild(grid);
    state.settingsContent.appendChild(element('h3', '', 'Аккаунты услуг авитолога'));
    state.settingsContent.appendChild(element('p', 'ads-dashboard-muted', 'Включайте только свои рекламные аккаунты. Список можно расширять; запросы идут небольшими пакетами.'));
    if (!state.accountsLoaded) state.settingsContent.appendChild(element('p', 'ads-dashboard-muted', 'Список появится после входа в «Аккаунты».'));
    var accountList = element('div', 'ads-dashboard-account-list');
    state.accounts.forEach(function (account) {
      accountList.appendChild(toggle(state, account.name, (state.preferences.selectedAccountIds || []).indexOf(account.avitoUserId) !== -1, function (checked) {
        var selected = state.preferences.selectedAccountIds || [];
        if (checked && selected.indexOf(account.avitoUserId) === -1 && selected.length < 200) selected.push(account.avitoUserId);
        if (!checked) selected = selected.filter(function (id) { return id !== account.avitoUserId; });
        state.preferences.selectedAccountIds = selected;
        loadMetrics(state);
      }));
    });
    (state.preferences.selectedAccountIds || []).filter(function (id) { return !state.accounts.some(function (account) { return account.avitoUserId === id; }); }).forEach(function (id) {
      accountList.appendChild(toggle(state, 'Недоступный аккаунт · ID ' + id, true, function (checked) {
        if (!checked) { state.preferences.selectedAccountIds = state.preferences.selectedAccountIds.filter(function (selected) { return selected !== id; }); loadMetrics(state); }
      }));
    });
    state.settingsContent.appendChild(accountList);
    if (state.model && state.model.sourceAccounts && state.model.sourceAccounts.length) {
      state.settingsContent.appendChild(element('h3', '', 'Источник CRM → аккаунт Avito'));
      state.settingsContent.appendChild(element('p', 'ads-dashboard-muted', 'Привязка источников задаётся вручную. Совпадение названий не считается доказательством.'));
      state.model.sourceAccounts.forEach(function (source) {
        var label = element('label', 'ads-dashboard-source-map');
        label.appendChild(element('span', '', source.name));
        var select = element('select'); select.setAttribute('aria-label', 'Аккаунт для источника ' + source.name);
        var none = element('option', '', 'Не привязан'); none.value = ''; select.appendChild(none);
        state.accounts.filter(function (account) { return (state.preferences.selectedAccountIds || []).indexOf(account.avitoUserId) !== -1; }).forEach(function (account) {
          var option = element('option', '', account.name); option.value = account.avitoUserId; select.appendChild(option);
        });
        select.value = state.preferences.sourceMap[String(source.id)] || '';
        select.addEventListener('change', function () { if (select.value) state.preferences.sourceMap[String(source.id)] = select.value; else delete state.preferences.sourceMap[String(source.id)]; savePreferences(state); render(state); });
        label.appendChild(select); state.settingsContent.appendChild(label);
      });
    }
    state.settingsContent.appendChild(button('Открыть «Аккаунты» для входа', 'ads-dashboard-button', openAccounts));
  }
  function applyLegacyVisibility(state) {
    if (!state.legacyMounted) return;
    var visibility = { '.ads-posts-card': state.preferences.calendar, '.ads-expenses-card': state.preferences.expenses, '.ads-links-card': state.preferences.links, '.ads-sidebar': state.preferences.expenses, '#adsTopSummary': state.preferences.expenses };
    Object.keys(visibility).forEach(function (selector) { Array.prototype.forEach.call(state.legacy.querySelectorAll(selector), function (node) { node.hidden = !visibility[selector]; node.style.display = visibility[selector] ? '' : 'none'; }); });
    state.legacy.hidden = !(state.preferences.calendar || state.preferences.expenses || state.preferences.links);
  }
  function mountLegacy(state) {
    if (!mounted(state) || state.legacyMounted || state.profile === 'sasha' || !ready() || typeof legacyRender !== 'function') return;
    legacyRender(state.legacy);
    state.legacyMounted = true;
    applyLegacyVisibility(state);
  }
  function renderStatus(state) {
    var waiting = !ready();
    var stamp = state.showingPrevious && state.previousUpdatedAt || state.updatedAt;
    var saved = stamp ? stamp.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    var retained = state.showingPrevious && hasStatistics(state.statistics);
    state.status.textContent = waiting ? 'Загружаем подтверждённые данные Supabase…' : state.loading ? (retained ? 'Предыдущие данные от ' + saved + ' · обновляем в фоне' : 'Загружаем статистику Avito') + (state.progress ? ' · ' + state.progress : '') + '…' : state.apiWarning ? state.apiWarning + (retained ? ' Предыдущие данные от ' + saved + ' оставлены на экране.' : '') : state.updatedAt ? (retained ? 'Часть показателей — предыдущие данные · ' : 'Обновлено ') + saved : 'CRM и касса загружены. Подключаем статистику Avito…';
    state.status.className = 'ads-dashboard-status' + (state.apiWarning ? ' is-warning' : '');
    state.refresh.disabled = state.loading || waiting;
    state.authButton.hidden = !state.apiWarning;
    state.note.textContent = [state.localWarning || '', state.profile === 'sasha' ? 'Старый контент-календарь Фила в режиме Саши не открывается.' : '', '«Заработано» — датированные поступления кассы' + (state.profile === 'fil' ? ', включая долю «Агентству» от Саши' : '') + '. «Показали телефон» — действие в Авито, не подтверждённый звонок. Общие контакты не складываются повторно с телефоном и чатом. Расходы — рекламные расходы API, не только списания аванса.'].filter(Boolean).join(' ');
  }
  function metricCard(state, metric, data, days, numberOnly) {
    var card = element('article', 'ads-dashboard-metric' + (numberOnly ? ' ads-dashboard-number' : '')); card.style.setProperty('--ads-metric-color', metric.color);
    var header = element('div', 'ads-dashboard-metric-heading');
    header.appendChild(element('span', '', metric.icon + ' ' + metric.name));
    header.appendChild(element('strong', '', number(data[metric.key], metric.money))); card.appendChild(header);
    if (metric.key === 'earned' && state.profile === 'fil' && typeof data.earnedSasha === 'number') card.appendChild(element('small', 'ads-dashboard-revenue-detail', 'От Саши агентству ' + (state.preferences.period === 'today' ? 'сегодня' : 'за месяц') + ': ' + number(data.earnedSasha, true)));
    if (numberOnly) return card;
    var chart = element('div', 'ads-dashboard-chart'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', metric.name + ': ' + number(data[metric.key], metric.money));
    var max = days.reduce(function (value, day) { var n = day[metric.key]; return typeof n === 'number' && isFinite(n) ? Math.max(value, n) : value; }, 0);
    days.forEach(function (day) {
      var value = day[metric.key]; var known = typeof value === 'number' && isFinite(value);
      var column = element('div', 'ads-dashboard-day');
      var candle = element('div', 'ads-dashboard-candle' + (known ? '' : ' is-missing'));
      candle.style.height = known ? Math.max(value === 0 ? 2 : 4, max ? value / max * 58 : 2) + 'px' : '2px';
      var date = String(day.date || '').slice(8, 10) + '.' + String(day.date || '').slice(5, 7);
      var tooltip = date + ' · ' + metric.name + ': ' + number(value, metric.money);
      column.title = tooltip; column.setAttribute('aria-label', tooltip); column.tabIndex = 0;
      column.appendChild(candle); column.appendChild(element('span', '', String(day.date || '').slice(8, 10)));
      column.appendChild(element('span', 'ads-dashboard-tooltip', tooltip)); chart.appendChild(column);
    });
    card.appendChild(chart); return card;
  }
  function renderFunnel(state, data) {
    empty(state.funnel);
    [['contacts', 'Контакты'], ['crm', 'В CRM'], ['kp', 'КП'], ['bought', 'Купили']].forEach(function (entry, index) {
      if (index) state.funnel.appendChild(element('span', 'ads-dashboard-funnel-arrow', '→'));
      var step = element('div', 'ads-dashboard-funnel-step'); step.appendChild(element('strong', '', number(data[entry[0]]))); step.appendChild(element('span', '', entry[1])); state.funnel.appendChild(step);
    });
  }
  function renderSources(state) {
    empty(state.sources);
    state.sources.appendChild(element('h3', '', 'Кто пришёл и с какого аккаунта · 30 дней'));
    var sources = state.model.sources || [];
    if (!sources.length) state.sources.appendChild(element('p', 'ads-dashboard-muted', 'За выбранный период нет заявок CRM с датой. Источник выбирается в CRM.'));
    sources.forEach(function (source) {
      var row = element('details', 'ads-dashboard-source');
      var name = source.name;
      var linkedId = state.preferences.sourceMap[String(source.sourceId)];
      var account = state.accounts.filter(function (account) { return account.avitoUserId === linkedId; })[0];
      var summary = element('summary', '', name + (account ? ' · ' + account.name : ' · аккаунт не привязан') + ' · CRM ' + number(source.crm) + ' / КП ' + number(source.kp) + ' / купили ' + number(source.bought));
      row.appendChild(summary);
      var list = element('ul');
      var stages = { weekly: 'В CRM', sold: 'Купили', work: 'В работе', in_work: 'В работе', kp: 'КП', kp_sent: 'КП' };
      (source.clients || []).forEach(function (client) { list.appendChild(element('li', '', client.name + ' · ' + client.date + ' · ' + (stages[client.stage] || client.stage))); });
      row.appendChild(list); state.sources.appendChild(row);
    });
  }
  function render(state) {
    if (!current(state)) return;
    if (ready() && state.statisticsDate && state.statisticsDate !== window.AVITOLOG_ADS_FUNNEL.range(new Date()).today) {
      state.statistics = []; state.statisticsDate = ''; state.updatedAt = null; state.showingPrevious = false;
    }
    if (!mounted(state)) return;
    renderStatus(state);
    state.todayButton.setAttribute('aria-pressed', state.preferences.period === 'today' ? 'true' : 'false');
    state.monthButton.setAttribute('aria-pressed', state.preferences.period === 'month' ? 'true' : 'false');
    if (!ready()) return;
    var helper = window.AVITOLOG_ADS_FUNNEL;
    if (!helper || typeof helper.compute !== 'function') { state.status.textContent = 'Модуль воронки ещё не загружен. Обновите страницу.'; return; }
    try {
      var now = new Date(); var range = helper.range(now); var sources = helper.readSources(range.months);
      state.model = helper.compute({ now: now, goals: sources.goals, cash: sources.cash, statistics: state.statistics, selectedAccountIds: state.preferences.selectedAccountIds || [], sourceMap: state.preferences.sourceMap });
      var model = state.model; var today = state.preferences.period === 'today';
      var data = today ? model.today : model.month;
      var days = today ? model.days.filter(function (day) { return day.date === model.range.today; }) : model.days;
      state.rangeLabel.textContent = today ? 'Сегодня · ' + model.range.today + ' (МСК)' : model.range.dateFrom + ' — ' + model.range.today + ' · 30 дней (МСК)';
      var signature = JSON.stringify({ data: data, days: days, sources: model.sources, warnings: model.warnings, period: state.preferences.period, mode: state.preferences.viewMode, metrics: state.preferences.metrics, sourceMap: state.preferences.sourceMap, accounts: state.accounts, dailyMetric: state.preferences.dailyMetric, selected: state.preferences.selectedAccountIds, statistics: state.preferences.viewMode === 'daily' ? state.statistics : null });
      if (signature === state.renderSignature) { mountLegacy(state); return; }
      state.renderSignature = signature;
      empty(state.metrics);
      if (state.preferences.viewMode === 'daily' && window.AVITOLOG_ADS_DAILY_LAYOUT) {
        state.metrics.className = 'ads-dashboard-metrics is-daily';
        state.funnel.hidden = true; state.sources.hidden = true;
        state.metrics.appendChild(window.AVITOLOG_ADS_DAILY_LAYOUT.render({ model: model, statistics: state.statistics, accounts: state.accounts, selectedAccountIds: state.preferences.selectedAccountIds || [], sourceMap: state.preferences.sourceMap, period: state.preferences.period, metric: state.preferences.dailyMetric, metrics: state.preferences.metrics, showSashaRevenue: state.profile === 'fil', onMetricChange: function (key) { state.preferences.dailyMetric = key; savePreferences(state); render(state); } }));
        state.warnings.textContent = (model.warnings || []).join(' '); mountLegacy(state); return;
      }
      state.funnel.hidden = false; state.sources.hidden = false;
      var compact = state.preferences.viewMode === 'compact';
      state.metrics.className = 'ads-dashboard-metrics' + (compact ? ' is-compact' : '');
      if (compact) {
        var numbers = element('div', 'ads-dashboard-number-grid'); numbers.setAttribute('aria-label', 'Итоги цифрами');
        var charts = element('div', 'ads-dashboard-compact-charts'); charts.setAttribute('aria-label', 'Динамика по дням');
        [[COMPACT_NUMBERS, numbers, true], [COMPACT_CHARTS, charts, false]].forEach(function (group) {
          group[0].forEach(function (key) {
            var metric = METRICS.filter(function (item) { return item.key === key; })[0];
            if (state.preferences.metrics[key]) group[1].appendChild(metricCard(state, metric, data, days, group[2]));
          });
          if (group[1].firstChild) state.metrics.appendChild(group[1]);
        });
      } else {
        METRICS.forEach(function (metric) { if (state.preferences.metrics[metric.key]) state.metrics.appendChild(metricCard(state, metric, data, days)); });
      }
      renderFunnel(state, data); renderSources(state);
      state.warnings.textContent = (model.warnings || []).join(' ');
      mountLegacy(state);
    } catch (error) { state.status.textContent = 'Не удалось собрать воронку. Исходные данные не изменены.'; }
  }
  function createState(host) {
    var state = { host: host, profile: profile(), key: preferenceKey(), snapshotKey: snapshotKey(), preferences: readPreferences(), accounts: [], statistics: [], pending: {}, unlisten: [], loadVersion: 0, accountsLoaded: false, loading: false };
    active = state;
    state.root = element('section', 'ads-dashboard');
    state.root.setAttribute('aria-label', 'ADS: воронка услуг авитолога');
    var heading = element('div', 'ads-dashboard-heading');
    var title = element('div'); title.appendChild(element('h2', '', 'ADS · Воронка услуг авитолога'));
    state.rangeLabel = element('p', 'ads-dashboard-muted'); title.appendChild(state.rangeLabel); heading.appendChild(title);
    var controls = element('div', 'ads-dashboard-controls');
    state.todayButton = button('Сегодня', 'ads-dashboard-button', function () { state.preferences.period = 'today'; savePreferences(state); render(state); });
    state.monthButton = button('30 дней', 'ads-dashboard-button', function () { state.preferences.period = 'month'; savePreferences(state); render(state); });
    state.refresh = button('Обновить', 'ads-dashboard-button', function () { if (state.frameLoaded) { if (state.accountsLoaded) loadMetrics(state); else loadAccounts(state); } else { if (state.frame && state.frame.parentNode) state.frame.parentNode.removeChild(state.frame); setupBridge(state); } });
    state.gear = button('⚙', 'ads-dashboard-button ads-dashboard-gear', function () { state.settings.hidden = !state.settings.hidden; state.gear.setAttribute('aria-expanded', state.settings.hidden ? 'false' : 'true'); if (!state.settings.hidden) renderSettings(state); });
    state.gear.setAttribute('aria-label', 'Настройки ADS'); state.gear.setAttribute('aria-expanded', 'false');
    [state.todayButton, state.monthButton, state.refresh, state.gear].forEach(function (node) { controls.appendChild(node); }); heading.appendChild(controls); state.root.appendChild(heading);
    state.settings = element('section', 'ads-dashboard-settings'); state.settings.hidden = true; state.settings.setAttribute('aria-label', 'Настройки ADS');
    state.settingsContent = element('div'); state.settings.appendChild(state.settingsContent); state.root.appendChild(state.settings);
    state.status = element('p', 'ads-dashboard-status'); state.status.setAttribute('role', 'status'); state.root.appendChild(state.status);
    state.authButton = button('Войти в «Аккаунты»', 'ads-dashboard-button', openAccounts); state.authButton.hidden = true; state.root.appendChild(state.authButton);
    state.funnel = element('div', 'ads-dashboard-funnel'); state.root.appendChild(state.funnel);
    state.metrics = element('div', 'ads-dashboard-metrics'); state.root.appendChild(state.metrics);
    state.sources = element('section', 'ads-dashboard-sources'); state.root.appendChild(state.sources);
    state.warnings = element('p', 'ads-dashboard-muted'); state.root.appendChild(state.warnings);
    state.note = element('p', 'ads-dashboard-note'); state.root.appendChild(state.note);
    state.legacy = element('div', 'ads-dashboard-legacy'); state.root.appendChild(state.legacy);
    if (host) { empty(host); host.appendChild(state.root); }
    hydrateCache(state);
    listen(state, document, 'keydown', function (event) { if (event.key === 'Escape' && !state.settings.hidden) { state.settings.hidden = true; state.gear.setAttribute('aria-expanded', 'false'); state.gear.focus(); } });
    listen(state, document, 'click', function (event) { if (!state.settings.hidden && !state.settings.contains(event.target) && !state.gear.contains(event.target)) { state.settings.hidden = true; state.gear.setAttribute('aria-expanded', 'false'); } });
    listen(state, document, 'avitolog:backend-initial-ready', function () { hydrateCache(state); render(state); if (!state.frame) setupBridge(state); });
    listen(state, document, 'avitolog:backend-remote-applied', function () { render(state); });
    listen(state, document, 'avitolog:storage-write', function () { render(state); });
    listen(state, document, 'avitolog:backend-initial-error', function () { renderStatus(state); state.status.textContent = window.AVITOLOG_BACKEND_INITIAL_SYNC_ERROR || 'Не удалось загрузить данные Supabase.'; });
    listen(state, window, 'storage', function () { render(state); });
    if (window.MutationObserver) { state.observer = new window.MutationObserver(function () { if (!current(state)) { state.root.hidden = true; destroy(state); } }); state.observer.observe(document.documentElement, { childList: true, subtree: true }); }
    render(state); renderSettings(state); if (ready()) setupBridge(state);
    return state;
  }
  function show(host) {
    if (!host) return;
    if (active && current(active)) {
      if (mounted(active) && active.host === host) {
        if (active.legacyMounted && typeof legacyRender === 'function') { legacyRender(active.legacy); applyLegacyVisibility(active); }
      } else {
        active.host = host; empty(host); host.appendChild(active.root);
      }
      render(active); renderSettings(active);
      if (!active.loading && active.frameLoaded) {
        if (!active.accountsLoaded) loadAccounts(active);
        else if (active.apiWarning || Date.now() - (active.refreshStartedAt || 0) >= 60000) loadMetrics(active);
      } else if (!active.loading && active.apiWarning && !active.frameLoaded) {
        if (active.frame && active.frame.parentNode) active.frame.parentNode.removeChild(active.frame);
        setupBridge(active);
      }
      return;
    }
    if (active) destroy(active);
    createState(host);
  }
  function prefetch() {
    if (!ready() || !snapshotKey()) return;
    if (active && current(active)) return;
    if (active) destroy(active);
    createState(null);
  }
  window.__showAdsPage = show;
  window.AVITOLOG_ADS_DASHBOARD = { show: show, prefetch: prefetch, destroy: function () { destroy(active); } };
  document.addEventListener('avitolog:backend-initial-ready', prefetch);
  document.addEventListener('DOMContentLoaded', prefetch);
  if (document.readyState && document.readyState !== 'loading') setTimeout(prefetch, 0);
})();
