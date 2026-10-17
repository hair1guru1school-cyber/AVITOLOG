(function () {
  'use strict';

  if (window.AVITOLOG_MAIN_MENU_SETTINGS) return;

  var DB_NAME = 'avitolog_main_menu_settings';
  var DB_VERSION = 1;
  var STORE_NAME = 'profiles';
  var FALLBACK_PREFIX = 'avitolog_main_menu_visibility_v1:';
  var IDB_TIMEOUT_MS = 1200;
  var ACCOUNTS_URL = 'https://avitoboss.online/integrations/avito-accounts/?embedded=1';
  var TAB_DEFINITIONS = [
    { key: 'goals', buttonId: 'btnGoals', label: 'CRM' },
    { key: 'analytics', buttonId: 'btnProjectsReturn', label: 'Клиент' },
    { key: 'projects', buttonId: 'btnProjects', label: 'Проекты' },
    { key: 'assets', buttonId: 'btnAssets', label: 'Касса' },
    { key: 'tasks', buttonId: 'btnTasks', label: 'Задачи' },
    { key: 'ads', buttonId: 'btnAds', label: 'ADS' },
    { key: 'accounts', buttonId: 'btnAvitoAccounts', label: 'Аккаунты Avito' }
  ];
  var NAVIGATION_FUNCTIONS = [
    'openGoalsTab',
    'openAnalyticsTab',
    'openProjectsTab',
    'openAssetsTab',
    'openTasksTab',
    'openAdsTab',
    'openStrategyTab',
    'openAgencyTab',
    'switchTab'
  ];

  var state = {
    initialized: false,
    profile: profileId(),
    visible: defaultVisibility(),
    menuOpen: false,
    accountsOpen: false,
    storageMode: 'loading',
    storageMessage: 'Проверяем хранилище настроек меню...',
    pendingWrites: 0,
    mutationVersion: 0,
    loadVersion: 0,
    initPromise: null,
    writeTail: Promise.resolve(),
    db: null,
    idbDisabled: false
  };

  function defaultVisibility() {
    var result = {};
    TAB_DEFINITIONS.forEach(function (tab) { result[tab.key] = true; });
    return result;
  }

  function copyVisibility(value) {
    var result = {};
    TAB_DEFINITIONS.forEach(function (tab) { result[tab.key] = value[tab.key] !== false; });
    return result;
  }

  function normalizeVisibility(value) {
    var source = value && typeof value === 'object' && value.visible && typeof value.visible === 'object' ? value.visible : value;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    var result = {};
    var shown = 0;
    TAB_DEFINITIONS.forEach(function (tab) {
      result[tab.key] = source[tab.key] !== false;
      if (result[tab.key]) shown += 1;
    });
    return shown ? result : null;
  }

  function profileId() {
    var suffix = typeof window.AVITOLOG_KEY_SUFFIX === 'string' ? window.AVITOLOG_KEY_SUFFIX : '';
    var user = typeof window.AVITOLOG_USER === 'string' ? window.AVITOLOG_USER.trim().toLowerCase() : '';
    return suffix === '_sasha' || user === 'sasha' ? 'sasha' : 'fil';
  }

  function fallbackKey(profile) {
    return FALLBACK_PREFIX + (profile === 'sasha' ? 'sasha' : 'fil');
  }

  function element(tag, id, className, text) {
    var node = document.createElement(tag);
    if (id) node.id = id;
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function containsNode(container, candidate) {
    var node = candidate;
    while (node) {
      if (node === container) return true;
      node = node.parentNode;
    }
    return false;
  }

  function closestTopTab(candidate) {
    var row = document.getElementById('analyticsTopRow');
    var node = candidate;
    while (node && node !== row) {
      if (node.dataset && node.dataset.tab) return node;
      node = node.parentNode;
    }
    return null;
  }

  function setStatus(message, mode) {
    state.storageMessage = String(message || '');
    if (mode) state.storageMode = mode;
    var status = document.getElementById('mainMenuSettingsStatus');
    if (status) {
      status.textContent = state.storageMessage;
      status.dataset.mode = state.storageMode;
    }
  }

  function localRead(profile) {
    try {
      var raw = window.localStorage.getItem(fallbackKey(profile));
      if (!raw) return { available: true, visibility: null };
      return { available: true, visibility: normalizeVisibility(JSON.parse(raw)) };
    } catch (error) {
      return { available: false, visibility: null };
    }
  }

  function localWrite(profile, visibility) {
    try {
      window.localStorage.setItem(fallbackKey(profile), JSON.stringify({ visible: copyVisibility(visibility) }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function localRemove(profile) {
    try { window.localStorage.removeItem(fallbackKey(profile)); } catch (error) {}
  }

  function openDatabase() {
    if (state.db) return Promise.resolve(state.db);
    if (state.idbDisabled || !window.indexedDB || typeof window.indexedDB.open !== 'function') {
      return Promise.reject(new Error('indexeddb_unavailable'));
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var request;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        state.idbDisabled = true;
        reject(new Error('indexeddb_timeout'));
      }, IDB_TIMEOUT_MS);
      function fail() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.idbDisabled = true;
        reject(new Error('indexeddb_failed'));
      }
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        fail();
        return;
      }
      request.onupgradeneeded = function () {
        try {
          var db = request.result;
          if (!db.objectStoreNames || !db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'profile' });
        } catch (error) {
          fail();
        }
      };
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = function () {
        var db = request.result;
        if (settled) {
          try { db.close(); } catch (error) {}
          return;
        }
        settled = true;
        clearTimeout(timer);
        state.db = db;
        try {
          db.onversionchange = function () {
            try { db.close(); } catch (error) {}
            if (state.db === db) state.db = null;
          };
        } catch (error) {}
        resolve(db);
      };
    });
  }

  function idbRead(profile) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var result = null;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('indexeddb_read_timeout'));
        }, IDB_TIMEOUT_MS);
        function finish(error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(result);
        }
        try {
          var transaction = db.transaction(STORE_NAME, 'readonly');
          var request = transaction.objectStore(STORE_NAME).get(profile);
          request.onsuccess = function () { result = normalizeVisibility(request.result); };
          request.onerror = function () { finish(new Error('indexeddb_read_failed')); };
          transaction.oncomplete = function () { finish(); };
          transaction.onerror = function () { finish(new Error('indexeddb_read_failed')); };
          transaction.onabort = function () { finish(new Error('indexeddb_read_failed')); };
        } catch (error) {
          finish(new Error('indexeddb_read_failed'));
        }
      });
    });
  }

  function idbWrite(profile, visibility) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('indexeddb_write_timeout'));
        }, IDB_TIMEOUT_MS);
        function finish(error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(true);
        }
        try {
          var transaction = db.transaction(STORE_NAME, 'readwrite');
          transaction.objectStore(STORE_NAME).put({ profile: profile, visible: copyVisibility(visibility) });
          transaction.oncomplete = function () { finish(); };
          transaction.onerror = function () { finish(new Error('indexeddb_write_failed')); };
          transaction.onabort = function () { finish(new Error('indexeddb_write_failed')); };
        } catch (error) {
          finish(new Error('indexeddb_write_failed'));
        }
      });
    });
  }

  function readPreferences(profile) {
    return idbRead(profile).then(function (visibility) {
      if (visibility) return { visibility: visibility, mode: 'indexeddb' };
      var fallback = localRead(profile);
      if (!fallback.available || !fallback.visibility) return { visibility: null, mode: 'indexeddb' };
      return idbWrite(profile, fallback.visibility).then(function () {
        localRemove(profile);
        return { visibility: fallback.visibility, mode: 'indexeddb' };
      }, function () {
        return { visibility: fallback.visibility, mode: 'localStorage' };
      });
    }, function () {
      var fallback = localRead(profile);
      if (fallback.available) return { visibility: fallback.visibility, mode: 'localStorage' };
      return { visibility: null, mode: 'memory' };
    });
  }

  function persistPreferences(profile, visibility) {
    return idbWrite(profile, visibility).then(function () {
      localRemove(profile);
      return { saved: true, mode: 'indexeddb' };
    }, function () {
      if (localWrite(profile, visibility)) return { saved: true, mode: 'localStorage' };
      return { saved: false, mode: 'memory' };
    });
  }

  function storageCopy(mode, saved) {
    if (mode === 'indexeddb') return 'Настройки меню сохраняются только в этом браузере отдельно для профиля ' + (state.profile === 'sasha' ? 'Саша.' : 'Фил.');
    if (mode === 'localStorage') return 'IndexedDB недоступен. Настройки меню сохраняются в локальном хранилище этого браузера для профиля ' + (state.profile === 'sasha' ? 'Саша.' : 'Фил.');
    return saved === false
      ? 'Хранилище браузера недоступно: последнее изменение не сохранено и действует только до перезагрузки.'
      : 'Хранилище браузера недоступно: настройки действуют только до перезагрузки.';
  }

  function syncCheckboxes() {
    TAB_DEFINITIONS.forEach(function (tab) {
      var input = document.getElementById('mainMenuTab-' + tab.key);
      if (input) input.checked = state.visible[tab.key] !== false;
    });
  }

  function syncActiveButtons() {
    var row = document.getElementById('analyticsTopRow');
    var accountButton = document.getElementById('btnAvitoAccounts');
    if (!row || !accountButton) return;
    if (state.accountsOpen) {
      Array.prototype.forEach.call(row.querySelectorAll('.btn-projects[data-tab]'), function (button) {
        button.classList.toggle('is-on', button === accountButton);
      });
    } else {
      accountButton.classList.remove('is-on');
    }
  }

  function closeAccounts() {
    var wasOpen = state.accountsOpen;
    state.accountsOpen = false;
    document.body.classList.remove('avito-accounts-mode');
    var panel = document.getElementById('avitoAccountsPanel');
    if (panel) {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
    if (wasOpen) {
      var update = window.updateTopRowButtons;
      var original = update && update.__avitologMainMenuOriginal;
      if (typeof original === 'function') original.call(window);
      else if (typeof update === 'function' && !update.__avitologMainMenuUpdate) update.call(window);
    }
    applyVisibility();
    syncActiveButtons();
    return wasOpen;
  }

  function applyVisibility() {
    TAB_DEFINITIONS.forEach(function (tab) {
      var button = document.getElementById(tab.buttonId);
      if (!button) return;
      var shown = state.visible[tab.key] !== false;
      button.hidden = !shown;
      button.style.display = shown ? '' : 'none';
      button.setAttribute('aria-hidden', shown ? 'false' : 'true');
    });
    if (state.visible.accounts === false && state.accountsOpen) closeAccounts();
    syncCheckboxes();
    syncActiveButtons();
  }

  function ensureAccountsFrame() {
    var frame = document.getElementById('avitoAccountsFrame');
    if (frame) return frame;
    var host = document.getElementById('avitoAccountsFrameHost');
    if (!host) return null;
    frame = element('iframe', 'avitoAccountsFrame', 'avito-main-accounts-frame');
    frame.src = ACCOUNTS_URL;
    frame.title = 'Аккаунты Avito';
    frame.loading = 'lazy';
    frame.allow = 'clipboard-write';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', 'clipboard-write');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    host.appendChild(frame);
    return frame;
  }

  function openAccounts() {
    ensureProfile();
    if (state.visible.accounts === false) return false;
    var panel = document.getElementById('avitoAccountsPanel');
    if (!panel || !ensureAccountsFrame()) return false;
    closeMenu(false);
    state.accountsOpen = true;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('avito-accounts-mode');
    syncActiveButtons();
    return true;
  }

  function registerTopTabOrder() {
    var order = null;
    try { order = window._topTabOrder; } catch (error) {}
    if (!Array.isArray(order) || order.indexOf('accounts') !== -1) return;
    var afterAds = order.indexOf('ads');
    var beforeHidden = order.indexOf('strategy');
    var index = afterAds >= 0 ? afterAds + 1 : beforeHidden >= 0 ? beforeHidden : order.length;
    order.splice(index, 0, 'accounts');
  }

  function wrapNavigation(name) {
    var original = window[name];
    if (typeof original !== 'function' || original.__avitologMainMenuNavigation) return;
    function wrappedNavigation() {
      closeAccounts();
      return original.apply(this, arguments);
    }
    wrappedNavigation.__avitologMainMenuNavigation = true;
    wrappedNavigation.__avitologMainMenuOriginal = original;
    window[name] = wrappedNavigation;
  }

  function wrapUpdateTopRowButtons() {
    var original = window.updateTopRowButtons;
    if (typeof original !== 'function' || original.__avitologMainMenuUpdate) return;
    function wrappedUpdateTopRowButtons() {
      var result = original.apply(this, arguments);
      applyVisibility();
      return result;
    }
    wrappedUpdateTopRowButtons.__avitologMainMenuUpdate = true;
    wrappedUpdateTopRowButtons.__avitologMainMenuOriginal = original;
    window.updateTopRowButtons = wrappedUpdateTopRowButtons;
  }

  function wrapSashaVisibility() {
    var original = window.applySashaTabVisibility;
    if (typeof original !== 'function' || original.__avitologMainMenuVisibility) return;
    function wrappedSashaVisibility() {
      var result = original.apply(this, arguments);
      applyVisibility();
      return result;
    }
    wrappedSashaVisibility.__avitologMainMenuVisibility = true;
    wrappedSashaVisibility.__avitologMainMenuOriginal = original;
    window.applySashaTabVisibility = wrappedSashaVisibility;
  }

  function installHooks() {
    NAVIGATION_FUNCTIONS.forEach(wrapNavigation);
    wrapUpdateTopRowButtons();
    wrapSashaVisibility();
    registerTopTabOrder();
    if (typeof window.applyTopTabOrder === 'function') window.applyTopTabOrder();
    applyVisibility();
  }

  function closeMenu(restoreFocus) {
    var menu = document.getElementById('mainMenuSettingsMenu');
    var button = document.getElementById('mainMenuSettingsBtn');
    state.menuOpen = false;
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
    if (restoreFocus !== false && button && typeof button.focus === 'function') button.focus();
  }

  function openMenu() {
    ensureProfile();
    var menu = document.getElementById('mainMenuSettingsMenu');
    var button = document.getElementById('mainMenuSettingsBtn');
    if (!menu || !button) return false;
    state.menuOpen = true;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    syncCheckboxes();
    var first = document.getElementById('mainMenuTab-goals');
    if (first && typeof first.focus === 'function') first.focus();
    return true;
  }

  function queuePersist(profile, visibility, mutationVersion) {
    state.pendingWrites += 1;
    var task = state.writeTail.then(function () {
      return persistPreferences(profile, visibility);
    }, function () {
      return persistPreferences(profile, visibility);
    });
    state.writeTail = task.then(function () {}, function () {});
    return task.then(function (result) {
      state.pendingWrites = Math.max(0, state.pendingWrites - 1);
      if (state.profile === profile && state.mutationVersion === mutationVersion) {
        setStatus(storageCopy(result.mode, result.saved), result.mode);
      }
      return result.saved;
    }, function () {
      state.pendingWrites = Math.max(0, state.pendingWrites - 1);
      if (state.profile === profile && state.mutationVersion === mutationVersion) {
        setStatus(storageCopy('memory', false), 'memory');
      }
      return false;
    });
  }

  function setTabVisible(key, shown) {
    ensureProfile();
    var known = TAB_DEFINITIONS.some(function (tab) { return tab.key === key; });
    if (!known) return Promise.resolve(false);
    var next = copyVisibility(state.visible);
    next[key] = shown !== false;
    if (!TAB_DEFINITIONS.some(function (tab) { return next[tab.key]; })) {
      syncCheckboxes();
      setStatus('Нельзя скрыть все разделы: оставьте хотя бы один пункт меню.', state.storageMode);
      return Promise.resolve(false);
    }
    if (next[key] === state.visible[key]) {
      syncCheckboxes();
      return Promise.resolve(true);
    }
    state.visible = next;
    state.mutationVersion += 1;
    var version = state.mutationVersion;
    var profile = state.profile;
    applyVisibility();
    return queuePersist(profile, copyVisibility(next), version);
  }

  function refreshProfile() {
    var nextProfile = profileId();
    if (nextProfile !== state.profile) {
      state.profile = nextProfile;
      state.visible = defaultVisibility();
      state.mutationVersion = 0;
      applyVisibility();
    }
    var profile = state.profile;
    var startMutation = state.mutationVersion;
    var loadVersion = ++state.loadVersion;
    setStatus('Проверяем хранилище настроек меню...', 'loading');
    return readPreferences(profile).then(function (result) {
      if (loadVersion !== state.loadVersion || profile !== state.profile) return getState();
      if (state.mutationVersion === startMutation && result.visibility) {
        state.visible = result.visibility;
        applyVisibility();
      }
      setStatus(storageCopy(result.mode, true), result.mode);
      if (state.mutationVersion !== startMutation) {
        queuePersist(profile, copyVisibility(state.visible), state.mutationVersion);
      }
      return getState();
    }, function () {
      if (loadVersion === state.loadVersion && profile === state.profile) setStatus(storageCopy('memory', false), 'memory');
      return getState();
    });
  }

  function ensureProfile() {
    if (profileId() !== state.profile) refreshProfile();
  }

  function getState() {
    return {
      initialized: state.initialized,
      profile: state.profile,
      visible: copyVisibility(state.visible),
      menuOpen: state.menuOpen,
      accountsOpen: state.accountsOpen,
      storageMode: state.storageMode,
      storageMessage: state.storageMessage,
      pendingWrites: state.pendingWrites
    };
  }

  function addStyle() {
    if (document.getElementById('mainMenuSettingsStyle')) return;
    var style = element('style', 'mainMenuSettingsStyle');
    style.textContent = [
      '#mainMenuSettingsBtn{position:relative}',
      '#mainMenuSettingsMenu{position:fixed;z-index:2147483000;top:52px;right:12px;width:min(290px,calc(100vw - 24px));padding:14px;border:1px solid var(--border,#314052);border-radius:12px;background:var(--surface,#111923);color:var(--text,#eef6ff);box-shadow:0 16px 44px rgba(0,0,0,.5);font-family:inherit}',
      '#mainMenuSettingsMenu[hidden]{display:none!important}',
      '.main-menu-settings-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}',
      '.main-menu-settings-title{margin:0;font-size:14px}',
      '.main-menu-settings-close{width:30px;height:30px;border:1px solid var(--border,#314052);border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-size:18px}',
      '.main-menu-settings-list{display:grid;gap:6px;border:0;margin:8px 0;padding:0}',
      '.main-menu-settings-option{display:flex;flex-direction:row;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.035);font-size:12px;font-weight:700;cursor:pointer}',
      '.main-menu-settings-option input{width:17px;height:17px;min-height:0;margin:0;accent-color:var(--accent,#00d97e)}',
      '.main-menu-settings-note,.main-menu-settings-status{margin:8px 0 0;font-size:10px;line-height:1.45;color:var(--muted,#91a0b8)}',
      '.main-menu-settings-status[data-mode="memory"]{color:#ffabb3}',
      '#analyticsTopRow .btn-projects[hidden]{display:none!important}',
      '#btnAvitoAccounts.is-on{background:linear-gradient(180deg,#123247,#102033);color:#7cf5ff;box-shadow:0 0 22px rgba(53,208,255,.42)}',
      '#avitoAccountsPanel[hidden]{display:none!important}',
      '#avitoAccountsPanel{min-height:0;flex:1;padding:10px 12px 14px;background:#070c14;color:#edf7ff}',
      '.avito-main-accounts-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;font-size:11px;color:#93a9bb}',
      '.avito-main-accounts-head a{color:#7cf5ff;font-weight:800}',
      '#avitoAccountsFrameHost{height:calc(100vh - 145px);min-height:520px;border:1px solid #233b4e;border-radius:12px;overflow:hidden;background:#070c14}',
      '#avitoAccountsFrame{display:block;width:100%;height:100%;border:0;background:#070c14}',
      'body.avito-accounts-mode .sidebar,body.avito-accounts-mode #sidebarTogglePeek,body.avito-accounts-mode #mainContent,body.avito-accounts-mode #rightPanelWrap,body.avito-accounts-mode #taskPanelWrap,body.avito-accounts-mode #chatFloat,body.avito-accounts-mode #analyticsControlPanel,body.avito-accounts-mode #secBar,body.avito-accounts-mode #genExtraPrompt,body.avito-accounts-mode #genButtonsRow{display:none!important}',
      'body.avito-accounts-mode .layout{grid-template-columns:minmax(0,1fr)!important}',
      'body.avito-accounts-mode .content-wrap{min-width:0;min-height:0;margin-right:0!important}',
      '@media(max-width:768px){#mainMenuSettingsMenu{top:48px;right:8px}#avitoAccountsPanel{padding:8px}#avitoAccountsFrameHost{height:calc(100dvh - 145px);min-height:440px}.avito-main-accounts-head{align-items:flex-start;flex-direction:column}}'
    ].join('');
    document.head.appendChild(style);
  }

  function addSettingsMenu(manualSaveButton) {
    var gear = element('button', 'mainMenuSettingsBtn', 'header-day-toggle', '⚙');
    gear.type = 'button';
    gear.title = 'Настроить главное меню';
    gear.setAttribute('aria-label', 'Настроить главное меню');
    gear.setAttribute('aria-haspopup', 'dialog');
    gear.setAttribute('aria-controls', 'mainMenuSettingsMenu');
    gear.setAttribute('aria-expanded', 'false');
    if (typeof manualSaveButton.after === 'function') manualSaveButton.after(gear);
    else manualSaveButton.parentNode.insertBefore(gear, manualSaveButton.nextSibling);

    var menu = element('div', 'mainMenuSettingsMenu', 'main-menu-settings-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'false');
    menu.setAttribute('aria-labelledby', 'mainMenuSettingsTitle');
    var head = element('div', '', 'main-menu-settings-head');
    head.appendChild(element('h2', 'mainMenuSettingsTitle', 'main-menu-settings-title', 'Главное меню'));
    var close = element('button', 'mainMenuSettingsClose', 'main-menu-settings-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть настройки меню');
    head.appendChild(close);
    menu.appendChild(head);
    var list = element('fieldset', '', 'main-menu-settings-list');
    list.setAttribute('aria-label', 'Видимые разделы');
    TAB_DEFINITIONS.forEach(function (tab) {
      var label = element('label', '', 'main-menu-settings-option');
      var input = element('input', 'mainMenuTab-' + tab.key);
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.tab = tab.key;
      input.addEventListener('change', function () {
        setTabVisible(tab.key, input.checked).then(syncCheckboxes);
      });
      label.appendChild(input);
      label.appendChild(element('span', '', '', tab.label));
      list.appendChild(label);
    });
    menu.appendChild(list);
    menu.appendChild(element('p', 'mainMenuSettingsNote', 'main-menu-settings-note', 'Настройки хранятся только в этом браузере и отдельно для профилей Фил и Саша.'));
    var status = element('p', 'mainMenuSettingsStatus', 'main-menu-settings-status', state.storageMessage);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    menu.appendChild(status);
    document.body.appendChild(menu);

    gear.addEventListener('click', function () {
      if (state.menuOpen) closeMenu();
      else openMenu();
    });
    close.addEventListener('click', function () { closeMenu(); });
    document.addEventListener('keydown', function (event) {
      if (state.menuOpen && event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    });
    document.addEventListener('click', function (event) {
      if (!state.menuOpen || containsNode(menu, event.target) || containsNode(gear, event.target)) return;
      closeMenu(false);
    });
  }

  function addAccountsTab(row) {
    var button = element('button', 'btnAvitoAccounts', 'btn-projects', '🔗 АККАУНТЫ AVITO');
    button.type = 'button';
    button.dataset.tab = 'accounts';
    button.draggable = true;
    button.addEventListener('click', openAccounts);
    button.addEventListener('dragstart', function (event) { if (typeof window.topTabDragStart === 'function') window.topTabDragStart(event, 'accounts'); });
    button.addEventListener('dragover', function (event) { if (typeof window.topTabDragOver === 'function') window.topTabDragOver(event); });
    button.addEventListener('dragleave', function (event) { if (typeof window.topTabDragLeave === 'function') window.topTabDragLeave(event); });
    button.addEventListener('drop', function (event) { if (typeof window.topTabDrop === 'function') window.topTabDrop(event, 'accounts'); });
    button.addEventListener('dragend', function (event) { if (typeof window.topTabDragEnd === 'function') window.topTabDragEnd(event); });
    row.appendChild(button);
    row.addEventListener('click', function (event) {
      var target = closestTopTab(event.target);
      if (target && target.dataset.tab !== 'accounts') closeAccounts();
    }, true);
  }

  function addAccountsPanel(mainContent) {
    var panel = element('section', 'avitoAccountsPanel', 'avito-main-accounts-panel');
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-label', 'Аккаунты Avito');
    var head = element('div', '', 'avito-main-accounts-head');
    head.appendChild(element('span', '', '', 'Вход выполняется внутри модуля Avito и не передаётся из CRM.'));
    var link = element('a', 'avitoAccountsExternal', '', 'Открыть отдельно');
    link.href = ACCOUNTS_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    head.appendChild(link);
    panel.appendChild(head);
    panel.appendChild(element('div', 'avitoAccountsFrameHost'));
    if (typeof mainContent.after === 'function') mainContent.after(panel);
    else mainContent.parentNode.insertBefore(panel, mainContent.nextSibling);
  }

  function init() {
    if (state.initialized) {
      installHooks();
      return state.initPromise || Promise.resolve(getState());
    }
    var manualSaveButton = document.getElementById('manualSaveBtn');
    var row = document.getElementById('analyticsTopRow');
    var mainContent = document.getElementById('mainContent');
    if (!manualSaveButton || !row || !mainContent || !document.body || !document.head) return Promise.resolve(false);

    addStyle();
    addSettingsMenu(manualSaveButton);
    addAccountsTab(row);
    addAccountsPanel(mainContent);
    state.initialized = true;
    installHooks();
    applyVisibility();
    window.addEventListener('focus', ensureProfile);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden') ensureProfile();
    });
    setTimeout(installHooks, 0);
    setTimeout(installHooks, 250);
    setTimeout(installHooks, 1000);
    state.initPromise = refreshProfile();
    return state.initPromise;
  }

  window.AVITOLOG_MAIN_MENU_SETTINGS = {
    init: init,
    openMenu: openMenu,
    closeMenu: closeMenu,
    openAccounts: openAccounts,
    closeAccounts: closeAccounts,
    refreshProfile: refreshProfile,
    setTabVisible: setTabVisible,
    getState: getState
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
