'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '../../js/main-menu-settings.js');

function coreTabOrderSource() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/core.js'), 'utf8');
  const start = source.indexOf('var _topTabOrder = (function(){');
  const end = source.indexOf('function updateProjectsButtonVisibility()', start);
  assert.ok(start >= 0 && end > start, 'existing core tab-order implementation can be isolated without rewriting it');
  return source.slice(start, end);
}

function storage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    failWrites: false,
    writes: [],
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      this.writes.push(String(key));
      values.set(String(key), String(value));
    },
    removeItem(key) { values.delete(String(key)); },
    snapshot() { return Object.fromEntries(values); }
  };
}

function indexedDatabase() {
  const records = new Map();
  const operations = [];
  const pendingReads = [];
  const control = { holdReads: false };
  const db = {
    objectStoreNames: { contains: name => name === 'profiles' },
    close() {},
    transaction(name, mode) {
      assert.strictEqual(name, 'profiles');
      const transaction = {
        objectStore() {
          return {
            get(profile) {
              operations.push({ type: 'get', profile, mode });
              const request = {};
              const saved = records.has(profile) ? JSON.parse(JSON.stringify(records.get(profile))) : undefined;
              const complete = () => {
                request.result = saved;
                if (request.onsuccess) request.onsuccess();
                if (transaction.oncomplete) transaction.oncomplete();
              };
              if (control.holdReads) pendingReads.push(complete);
              else queueMicrotask(complete);
              return request;
            },
            put(record) {
              operations.push({ type: 'put', profile: record.profile, mode });
              records.set(record.profile, JSON.parse(JSON.stringify(record)));
              queueMicrotask(() => { if (transaction.oncomplete) transaction.oncomplete(); });
            }
          };
        }
      };
      return transaction;
    }
  };
  return {
    records,
    operations,
    get pendingReadCount() { return pendingReads.length; },
    get holdReads() { return control.holdReads; },
    set holdReads(value) { control.holdReads = !!value; },
    releaseReads() {
      control.holdReads = false;
      pendingReads.splice(0).forEach(complete => queueMicrotask(complete));
    },
    open(name, version) {
      assert.strictEqual(name, 'avitolog_main_menu_settings');
      assert.strictEqual(version, 1);
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

class FakeEvent {
  constructor(type, options) {
    Object.assign(this, { type, bubbles: false, defaultPrevented: false }, options);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
}

class EventTarget {
  constructor() { this.listeners = {}; }
  addEventListener(type, handler) {
    (this.listeners[type] || (this.listeners[type] = [])).push(handler);
  }
  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter(item => item !== handler);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const handler of [...(this.listeners[event.type] || [])]) handler.call(this, event);
    const propertyHandler = this['on' + event.type];
    if (typeof propertyHandler === 'function') propertyHandler.call(this, event);
    if (event.bubbles && !event.stopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function simpleMatch(element, selector) {
  if (element.nodeType !== 1) return false;
  let remainder = selector.trim();
  const attributes = [...remainder.matchAll(/\[([^\]=\s]+)(?:\s*=\s*["']?([^\]"']*)["']?)?\]/g)];
  remainder = remainder.replace(/\[[^\]]+\]/g, '');
  for (const match of attributes) {
    if (!element.hasAttribute(match[1])) return false;
    if (match[2] !== undefined && element.getAttribute(match[1]) !== match[2].trim()) return false;
  }
  if (remainder.includes(':checked') && !element.checked) return false;
  remainder = remainder.replace(':checked', '');
  const id = remainder.match(/#([\w-]+)/);
  if (id && element.id !== id[1]) return false;
  const classes = [...remainder.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  if (classes.some(value => !element.classList.contains(value))) return false;
  const tag = remainder.match(/^[\w-]+/);
  return !tag || element.tagName === tag[0].toUpperCase();
}

function matches(element, selector) {
  return selector.split(',').some(part => {
    const pieces = part.trim().split(/\s+/);
    if (!simpleMatch(element, pieces.pop())) return false;
    let ancestor = element.parentNode;
    while (pieces.length) {
      const next = pieces.pop();
      while (ancestor && !simpleMatch(ancestor, next)) ancestor = ancestor.parentNode;
      if (!ancestor) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  });
}

class Element extends EventTarget {
  constructor(tagName, document) {
    super();
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { delete this[name]; },
      getPropertyValue(name) { return this[name] || ''; }
    };
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.value = '';
    this._text = '';
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set(this.className.split(/\s+/).filter(Boolean).concat(values))].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
      toggle: (value, force) => {
        const enabled = force === undefined ? !this.classList.contains(value) : !!force;
        this.classList[enabled ? 'add' : 'remove'](value);
        return enabled;
      }
    };
  }
  get id() { return this.attributes.get('id') || ''; }
  set id(value) { this.attributes.set('id', String(value)); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    this._text = String(value);
    for (const child of this.children) child.parentNode = null;
    this.children = [];
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children.find(child => child.nodeType === 1) || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
  }
  get nextElementSibling() { return this.nextSibling; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  insertBefore(child, reference) {
    if (!reference) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(reference);
    assert.notEqual(index, -1, 'insertBefore reference belongs to parent');
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }
  after(child) { this.parentNode.insertBefore(child, this.nextSibling); }
  removeChild(child) {
    const index = this.children.indexOf(child);
    assert.notEqual(index, -1);
    this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...children) {
    if (this.id === 'mainContent') throw new Error('Existing business DOM must not be replaced');
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...children);
  }
  set innerHTML(_value) { throw new Error('HTML injection is forbidden in menu tests'); }
  get innerHTML() { return ''; }
  setAttribute(name, value) {
    if (name === 'class') this.className = String(value);
    else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    else this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    if (name === 'class') return this.className;
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
    if (['type', 'name', 'src', 'value'].includes(name) && this[name] !== undefined) return String(this[name]);
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(child) { return child === this || descendants(this).includes(child); }
  matches(selector) { return matches(this, selector); }
  closest(selector) {
    let candidate = this;
    while (candidate && candidate.nodeType === 1) {
      if (matches(candidate, selector)) return candidate;
      candidate = candidate.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) { return descendants(this).filter(element => matches(element, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { if (!this.disabled) this.dispatchEvent(new FakeEvent('click', { bubbles: true })); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function createHarness(options = {}) {
  const document = new EventTarget();
  document.readyState = 'loading';
  document.createElement = tag => new Element(tag, document);
  document.documentElement = document.createElement('html');
  document.head = document.createElement('head');
  document.body = document.createElement('body');
  document.documentElement.append(document.head, document.body);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => descendants(document.documentElement).find(element => element.id === id) || null;
  function add(tag, id, parent = document.body) {
    const element = document.createElement(tag);
    element.id = id;
    parent.appendChild(element);
    return element;
  }
  const header = add('header', 'header');
  const save = add('button', 'manualSaveBtn', header);
  const contentWrap = add('div', 'contentWrap');
  contentWrap.className = 'content-wrap';
  const tabs = add('div', 'analyticsTopRow', contentWrap);
  for (const [key, id] of Object.entries({ goals: 'btnGoals', analytics: 'btnProjectsReturn', projects: 'btnProjects', assets: 'btnAssets', tasks: 'btnTasks', ads: 'btnAds', strategy: 'btnStrategy' })) {
    const button = add('button', id, tabs);
    button.dataset.tab = key;
    button.className = 'btn-projects';
    if (key === 'strategy') button.style.display = 'none';
  }
  const main = add('div', 'mainContent', contentWrap);
  const sentinel = add('input', 'businessSentinel', main);
  sentinel.value = 'Unsaved project note: must survive navigation';
  const localStorage = options.localStorage || storage();
  const sessionStorage = options.sessionStorage || storage();
  const calls = [];
  const navigationNames = ['openGoalsTab', 'openAnalyticsTab', 'openProjectsTab', 'openAssetsTab', 'openTasksTab', 'openAdsTab', 'openStrategyTab', 'switchTab'];
  const window = new EventTarget();
  Object.assign(window, {
    window,
    document,
    localStorage,
    sessionStorage,
    location: { origin: 'https://avitoboss.online', pathname: '/', hash: '' },
    AVITOLOG_KEY_SUFFIX: options.profile === 'sasha' ? '_sasha' : '',
    AVITOLOG_USER: options.profile || 'fil',
    AVITOLOG_KEY(key) { return key + this.AVITOLOG_KEY_SUFFIX; },
    console,
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame(handler) { handler(); return 1; },
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    fetch() { throw new Error('Menu settings must not call production or backend'); }
  });
  Object.assign(window, options.globals || {});
  for (const name of navigationNames) {
    window[name] = function (...args) {
      const result = { navigation: name, marker: args[0] };
      calls.push({ name, args, receiver: this, result });
      return result;
    };
  }
  const context = vm.createContext(window);
  if (options.coreTabOrder) {
    vm.runInContext(coreTabOrderSource(), context, { filename: 'core.js:existing-tab-order' });
    for (const button of [...tabs.children]) {
      const key = button.dataset.tab;
      button.addEventListener('dragstart', event => window.topTabDragStart(event, key));
      button.addEventListener('drop', event => window.topTabDrop(event, key));
      button.addEventListener('dragend', event => window.topTabDragEnd(event));
    }
  }
  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context, { filename: scriptPath });
  document.readyState = 'complete';
  document.dispatchEvent(new FakeEvent('DOMContentLoaded'));
  return { window, document, localStorage, sessionStorage, calls, save, tabs, main, sentinel };
}

async function boot(options) {
  const harness = createHarness(options);
  const api = harness.window.AVITOLOG_MAIN_MENU_SETTINGS;
  assert.ok(api, 'module exposes a narrow, testable menu API');
  await api.init();
  harness.api = api;
  return harness;
}

function isShown(element) {
  return !!element && !element.hidden && element.style.display !== 'none';
}

function changeCheckbox(harness, key, checked) {
  const checkbox = harness.document.getElementById('mainMenuTab-' + key);
  assert.ok(checkbox, 'settings checkbox exists: ' + key);
  checkbox.checked = checked;
  checkbox.dispatchEvent(new FakeEvent('change', { bubbles: true }));
  return checkbox;
}

async function settle(harness) {
  for (let index = 0; index < 20; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
    if (!harness.api.getState().pendingWrites) return;
  }
  assert.fail('menu preference writes did not settle');
}

function dragTab(harness, sourceKey, targetKey) {
  const source = harness.tabs.children.find(button => button.dataset.tab === sourceKey);
  const target = harness.tabs.children.find(button => button.dataset.tab === targetKey);
  assert.ok(source && target, 'drag source and target exist');
  const values = new Map();
  const dataTransfer = {
    setData(type, value) { values.set(type, value); },
    getData(type) { return values.get(type); }
  };
  source.dispatchEvent(new FakeEvent('dragstart', { bubbles: true, dataTransfer }));
  target.dispatchEvent(new FakeEvent('drop', { bubbles: true, dataTransfer }));
  source.dispatchEvent(new FakeEvent('dragend', { bubbles: true, dataTransfer }));
  return { values, dataTransfer };
}

test('settings gear is beside manual save and opens an accessible checkbox menu', async () => {
  const harness = await boot();
  const { document, save, api } = harness;
  const gear = document.getElementById('mainMenuSettingsBtn');
  assert.ok(gear);
  assert.strictEqual(save.nextElementSibling, gear);
  assert.strictEqual(gear.getAttribute('type') || gear.type, 'button');
  assert.ok(gear.getAttribute('aria-label') || gear.title);
  assert.strictEqual(api.getState().menuOpen, false);
  gear.click();
  assert.strictEqual(api.getState().menuOpen, true);
  const menu = document.getElementById('mainMenuSettingsMenu');
  assert.ok(menu);
  assert.strictEqual(menu.querySelectorAll('input[type="checkbox"]').length, 8);
  document.getElementById('mainMenuSettingsClose').click();
  assert.strictEqual(api.getState().menuOpen, false);
});

test('ADS visibility changes through its checkbox, persists reload, and never writes business keys', async () => {
  const localStorage = storage({ avitolog_clients: '[{"id":"existing-client"}]' });
  const harness = await boot({ localStorage });
  harness.api.openMenu();
  changeCheckbox(harness, 'ads', false);
  await settle(harness);
  assert.strictEqual(isShown(harness.document.getElementById('btnAds')), false);
  assert.strictEqual(harness.api.getState().visible.ads, false);
  const reloaded = await boot({ localStorage });
  assert.strictEqual(isShown(reloaded.document.getElementById('btnAds')), false);
  assert.strictEqual(reloaded.document.getElementById('mainMenuTab-ads').checked, false);
  assert.ok(localStorage.writes.length);
  assert.ok(localStorage.writes.every(key => key.startsWith('avitolog_main_menu_visibility_v1:')));
  assert.strictEqual(localStorage.getItem('avitolog_clients'), '[{"id":"existing-client"}]');
  changeCheckbox(reloaded, 'ads', true);
  await settle(reloaded);
  assert.strictEqual(isShown(reloaded.document.getElementById('btnAds')), true);
});

test('cannot hide the last menu tab and does not persist an empty navigation', async () => {
  const harness = await boot();
  const keys = ['goals', 'analytics', 'projects', 'assets', 'tasks', 'ads', 'accounts', 'protection'];
  for (const key of keys.slice(1)) assert.strictEqual(await harness.api.setTabVisible(key, false), true);
  const savedBefore = harness.localStorage.snapshot();
  assert.strictEqual(await harness.api.setTabVisible('goals', false), false);
  assert.strictEqual(harness.api.getState().visible.goals, true);
  assert.strictEqual(harness.document.getElementById('mainMenuTab-goals').checked, true);
  assert.deepStrictEqual(harness.localStorage.snapshot(), savedBefore);
  assert.ok(harness.document.getElementById('mainMenuSettingsStatus').textContent.trim());
});

test('accounts embed is lazy, fixed-origin and preserved without replacing original business DOM', async () => {
  const harness = await boot();
  const { document, api, main, sentinel } = harness;
  assert.strictEqual(document.getElementById('avitoAccountsFrame'), null);
  const originalChildren = [...main.children];
  const accountsButton = document.getElementById('btnAvitoAccounts');
  assert.ok(accountsButton);
  assert.strictEqual(accountsButton.textContent, '🔗 АККАУНТЫ');
  assert.strictEqual(accountsButton.title, 'Аккаунты Avito');
  accountsButton.click();
  const iframe = document.getElementById('avitoAccountsFrame');
  assert.ok(iframe);
  assert.strictEqual(iframe.tagName, 'IFRAME');
  assert.strictEqual(iframe.src || iframe.getAttribute('src'), 'https://avitoboss.online/integrations/avito-accounts/?embedded=1&profile=fil&organization_id=&expected_user_id=');
  assert.strictEqual(iframe.referrerPolicy, 'no-referrer');
  assert.strictEqual(iframe.getAttribute('referrerpolicy'), 'no-referrer');
  assert.strictEqual(api.getState().accountsOpen, true);
  assert.strictEqual(document.body.classList.contains('avito-accounts-mode'), true);
  const panel = document.getElementById('avitoAccountsPanel');
  assert.ok(panel.contains(iframe));
  assert.strictEqual(main.contains(iframe), false, 'embed is a sibling, not a replacement of CRM content');
  api.closeAccounts();
  assert.strictEqual(api.getState().accountsOpen, false);
  assert.strictEqual(document.getElementById('avitoAccountsFrame'), iframe);
  api.openAccounts();
  assert.strictEqual(document.getElementById('avitoAccountsFrame'), iframe);
  assert.strictEqual(document.querySelectorAll('iframe').length, 1);
  assert.deepStrictEqual(main.children, originalChildren);
  assert.strictEqual(main.children[0], sentinel);
  assert.strictEqual(sentinel.value, 'Unsaved project note: must survive navigation');
  assert.strictEqual(harness.calls.length, 0, 'opening accounts does not invoke destructive business rendering');
});

test('accounts frame is pinned to profile organization and authenticated user, never a token', async () => {
  const filOrg = '11111111-1111-4111-8111-111111111111';
  const sashaOrg = '22222222-2222-4222-8222-222222222222';
  let identity = { id: '33333333-3333-4333-8333-333333333333', email: 'private@example.test', access_token: 'must-not-bridge' };
  const harness = await boot({ globals: {
    AVITOLOG_SUPABASE: { profileOrganizations: { fil: filOrg, sasha: sashaOrg } },
    __avitologBackendIdentity() { return identity; }
  } });
  harness.api.openAccounts();
  const filFrame = harness.document.getElementById('avitoAccountsFrame');
  const filUrl = new URL(filFrame.src);
  assert.equal(filUrl.searchParams.get('organization_id'), filOrg);
  assert.equal(filUrl.searchParams.get('expected_user_id'), identity.id);
  assert.ok(!filFrame.src.includes('must-not-bridge') && !filFrame.src.includes('private'));
  await harness.api.refreshProfile();
  assert.equal(harness.document.getElementById('avitoAccountsFrame'), filFrame, 'same identity keeps its independent module session');
  harness.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  harness.window.AVITOLOG_USER = 'sasha';
  await harness.api.refreshProfile();
  const sashaFrame = harness.document.getElementById('avitoAccountsFrame');
  assert.notEqual(sashaFrame, filFrame);
  assert.equal(filFrame.parentNode, null);
  assert.equal(new URL(sashaFrame.src).searchParams.get('profile'), 'sasha');
  assert.equal(new URL(sashaFrame.src).searchParams.get('organization_id'), sashaOrg);
  identity = { id: identity.id, email: 'changed@example.test', access_token: 'renewed-token-must-not-bridge' };
  harness.window.dispatchEvent(new FakeEvent('storage'));
  assert.equal(harness.document.getElementById('avitoAccountsFrame'), sashaFrame, 'token renewal for the same user does not replace the frame');
  identity = { id: '44444444-4444-4444-8444-444444444444' };
  harness.window.dispatchEvent(new FakeEvent('storage'));
  const changedUserFrame = harness.document.getElementById('avitoAccountsFrame');
  assert.notEqual(changedUserFrame, sashaFrame);
  assert.equal(new URL(changedUserFrame.src).searchParams.get('expected_user_id'), identity.id);
  assert.equal(harness.document.querySelectorAll('iframe').length, 1);
  assert.equal(harness.document.getElementById('avitoAccountsExternal').href, changedUserFrame.src);
  harness.window.AVITOLOG_SUPABASE.profileOrganizations.sasha = 'invalid-org';
  identity = { id: 'invalid-user' };
  await harness.api.refreshProfile();
  const unconfigured = new URL(harness.document.getElementById('avitoAccountsFrame').src);
  assert.equal(unconfigured.searchParams.get('organization_id'), '');
  assert.equal(unconfigured.searchParams.get('expected_user_id'), '');
  assert.equal(unconfigured.searchParams.get('embedded'), '1', 'missing pins remain embedded and fail closed in the child');
});

test('all existing navigation wrappers close the embed and preserve receiver, arguments and return values', async () => {
  const harness = await boot();
  const names = ['openGoalsTab', 'openAnalyticsTab', 'openProjectsTab', 'openAssetsTab', 'openTasksTab', 'openAdsTab', 'openStrategyTab', 'switchTab'];
  const receiver = { marker: 'custom-call-context' };
  const argument = { id: 'do-not-clone' };
  for (const name of names) {
    harness.api.openAccounts();
    const returned = harness.window[name].call(receiver, argument, 'second');
    const call = harness.calls.at(-1);
    assert.strictEqual(call.name, name);
    assert.strictEqual(call.receiver, receiver);
    assert.strictEqual(call.args[0], argument);
    assert.strictEqual(call.args[1], 'second');
    assert.strictEqual(returned, call.result);
    assert.strictEqual(harness.api.getState().accountsOpen, false, name + ' closes embedded accounts');
  }
});

test('menu preference namespaces are isolated between Fil and Sasha profiles', async () => {
  const localStorage = storage();
  const fil = await boot({ localStorage, profile: 'fil' });
  assert.strictEqual(await fil.api.setTabVisible('ads', false), true);
  const sasha = await boot({ localStorage, profile: 'sasha' });
  assert.strictEqual(sasha.api.getState().visible.ads, true);
  assert.strictEqual(await sasha.api.setTabVisible('projects', false), true);
  const filReloaded = await boot({ localStorage, profile: 'fil' });
  assert.strictEqual(filReloaded.api.getState().visible.ads, false);
  assert.strictEqual(filReloaded.api.getState().visible.projects, true);
  assert.ok(localStorage.getItem('avitolog_main_menu_visibility_v1:fil'));
  assert.ok(localStorage.getItem('avitolog_main_menu_visibility_v1:sasha'));
  filReloaded.window.AVITOLOG_USER = 'sasha';
  filReloaded.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  await filReloaded.api.refreshProfile();
  assert.strictEqual(filReloaded.api.getState().profile, 'sasha');
  assert.strictEqual(filReloaded.api.getState().visible.projects, false);
  assert.strictEqual(filReloaded.api.getState().visible.ads, true);
});

test('failed storage writes are reported honestly and do not promise persistence', async () => {
  const localStorage = storage();
  const harness = await boot({ localStorage });
  const before = localStorage.snapshot();
  localStorage.failWrites = true;
  assert.strictEqual(await harness.api.setTabVisible('ads', false), false);
  const state = harness.api.getState();
  assert.strictEqual(state.storageMode, 'memory');
  assert.ok(state.storageMessage);
  const message = harness.document.getElementById('mainMenuSettingsStatus').textContent;
  assert.match(message, /не сохран|не удалось|только.*(?:вкладк|страниц|сеанс)|памят/i);
  assert.doesNotMatch(message, /^\s*(?:Сохранено|Настройки сохранены)[.!]?\s*$/i);
  assert.deepStrictEqual(localStorage.snapshot(), before);
});

test('primary IndexedDB persists only the menu preference record and reloads it', async () => {
  const indexedDB = indexedDatabase();
  const localStorage = storage({ avitolog_projects: 'business-data-unchanged' });
  const globals = { indexedDB };
  const harness = await boot({ globals, localStorage });
  assert.strictEqual(harness.api.getState().storageMode, 'indexeddb');
  assert.strictEqual(await harness.api.setTabVisible('ads', false), true);
  const saved = indexedDB.records.get('fil');
  assert.deepStrictEqual(Object.keys(saved).sort(), ['order', 'profile', 'tabScale', 'visible']);
  assert.strictEqual(saved.visible.ads, false);
  assert.strictEqual(saved.profile, 'fil');
  const reloaded = await boot({ globals, localStorage });
  assert.strictEqual(reloaded.api.getState().visible.ads, false);
  assert.strictEqual(localStorage.getItem('avitolog_projects'), 'business-data-unchanged');
  assert.deepStrictEqual(localStorage.writes, []);
  assert.ok(indexedDB.operations.some(operation => operation.type === 'put' && operation.mode === 'readwrite'));
});

test('repeat init is idempotent and returned preference snapshots cannot mutate live settings', async () => {
  const harness = await boot();
  await harness.api.init();
  await harness.api.init();
  assert.strictEqual(harness.document.querySelectorAll('#mainMenuSettingsBtn').length, 1);
  assert.strictEqual(harness.document.querySelectorAll('#btnAvitoAccounts').length, 1);
  assert.strictEqual(harness.document.querySelectorAll('#avitoAccountsPanel').length, 1);
  const copy = harness.api.getState();
  copy.visible.ads = false;
  copy.order.splice(0, copy.order.length, 'not-a-real-tab');
  assert.strictEqual(harness.api.getState().visible.ads, true);
  assert.ok(!harness.api.getState().order.includes('not-a-real-tab'));
  harness.api.openMenu();
  harness.document.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.strictEqual(harness.api.getState().menuOpen, false);
  assert.strictEqual(harness.document.activeElement, harness.document.getElementById('mainMenuSettingsBtn'));
});

test('scoped display rules honor hidden tabs and isolate the full-area accounts layout', async () => {
  const harness = await boot();
  const css = harness.document.getElementById('mainMenuSettingsStyle').textContent;
  assert.ok(css.includes('#analyticsTopRow .btn-projects[hidden]{display:none!important}'));
  assert.ok(css.includes('#analyticsTopRow{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}'), 'top navigation can scroll horizontally instead of clipping tabs');
  assert.ok(css.includes('@media(min-width:769px){#analyticsTopRow{justify-content:flex-start;gap:calc(8px * var(--main-menu-tab-scale,1))}'), 'desktop tabs stay left-aligned');
  assert.ok(css.includes('#analyticsTopRow>.btn-projects{min-width:0;width:auto;padding:0 calc(14px * var(--main-menu-tab-scale,1));flex:0 0 auto;'), 'scaled desktop tabs retain content width');
  assert.ok(css.includes('font-size:calc(14px * var(--main-menu-tab-scale,1))'));
  assert.ok(css.includes('height:calc(46px * var(--main-menu-tab-scale,1))'));
  assert.ok(css.includes('white-space:nowrap}}'));
  assert.ok(css.includes('@media(max-width:768px){#analyticsTopRow{gap:calc(6px * var(--main-menu-tab-scale,1))}'), 'mobile spacing scales without replacing its responsive grid');
  const rules = css.split('}').map(rule => rule.split('{'));
  const hiddenPanels = rules.find(([selector, declarations]) => selector.includes('body.avito-accounts-mode .sidebar') && declarations === 'display:none!important');
  assert.ok(hiddenPanels, 'accounts-only rule hides the surrounding workspace panels');
  for (const selector of hiddenPanels[0].split(',')) assert.ok(selector.startsWith('body.avito-accounts-mode '));
  assert.ok(hiddenPanels[0].includes('body.avito-accounts-mode #taskPanelWrap'));
  assert.ok(hiddenPanels[0].includes('body.avito-accounts-mode #chatFloat'));
  assert.ok(css.includes('body.avito-accounts-mode .layout{grid-template-columns:minmax(0,1fr)!important}'));
  assert.ok(css.includes('body.avito-accounts-mode .content-wrap{min-width:0;min-height:0;margin-right:0!important}'));
  assert.ok(!rules.some(([selector]) => /^\s*\.layout\s*$/.test(selector) || /^\s*\.content-wrap\s*$/.test(selector)), 'normal business layout is not overridden');
});

test('direct close and hiding the accounts tab each restore the native active marker once', async () => {
  let updates = 0;
  function nativeUpdateTopRowButtons() {
    updates += 1;
    this.document.getElementById('btnGoals').classList.add('is-on');
    return 'native-active-marker';
  }
  const harness = await boot({ globals: { updateTopRowButtons: nativeUpdateTopRowButtons } });
  const wrapped = harness.window.updateTopRowButtons;
  assert.notStrictEqual(wrapped, nativeUpdateTopRowButtons);
  assert.strictEqual(wrapped.__avitologMainMenuOriginal, nativeUpdateTopRowButtons);
  harness.api.openAccounts();
  assert.strictEqual(harness.document.getElementById('btnGoals').classList.contains('is-on'), false);
  assert.strictEqual(harness.api.closeAccounts(), true);
  assert.strictEqual(updates, 1, 'direct close calls the underlying updater once, without wrapper recursion');
  assert.strictEqual(harness.document.getElementById('btnGoals').classList.contains('is-on'), true);
  assert.strictEqual(harness.api.closeAccounts(), false);
  assert.strictEqual(updates, 1, 'closing an already-closed embed does not call the updater');
  harness.api.openAccounts();
  assert.strictEqual(await harness.api.setTabVisible('accounts', false), true);
  assert.strictEqual(harness.api.getState().accountsOpen, false);
  assert.strictEqual(updates, 2, 'hiding the open accounts tab restores legacy selection once');
  assert.strictEqual(harness.document.getElementById('btnGoals').classList.contains('is-on'), true);
  assert.strictEqual(harness.document.getElementById('btnAvitoAccounts').hidden, true);
});

test('legacy tab order is completed without reshuffling existing keys and Accounts starts last', async () => {
  const localStorage = storage({ av_top_tab_order: JSON.stringify(['projects', 'goals', 'analytics']) });
  const harness = await boot({ localStorage, coreTabOrder: true });
  const order = Array.from(harness.window._topTabOrder);
  assert.deepStrictEqual(order.slice(0, 3), ['projects', 'goals', 'analytics']);
  for (const key of ['goals', 'analytics', 'projects', 'assets', 'tasks', 'ads', 'accounts']) {
    assert.strictEqual(order.filter(value => value === key).length, 1, 'normalized order contains one ' + key);
  }
  const visible = harness.tabs.children.filter(isShown).map(button => button.dataset.tab);
  assert.strictEqual(visible.at(-1), 'accounts');
  assert.strictEqual(order.at(-1), 'protection');
});

test('an existing custom Accounts position is respected on init and repeated init', async () => {
  const customOrder = ['ads', 'accounts', 'projects', 'goals', 'analytics', 'assets', 'tasks'];
  const harness = await boot({ localStorage: storage({ av_top_tab_order: JSON.stringify(customOrder) }), coreTabOrder: true });
  assert.deepStrictEqual(Array.from(harness.window._topTabOrder), customOrder.concat('protection'));
  assert.deepStrictEqual(harness.tabs.children.filter(isShown).map(button => button.dataset.tab), customOrder);
  await harness.api.init();
  assert.deepStrictEqual(Array.from(harness.window._topTabOrder), customOrder.concat('protection'));
});

test('existing core drag-and-drop reorders Accounts with all legacy keys and persists after reload', async () => {
  const localStorage = storage({ av_top_tab_order: JSON.stringify(['projects', 'goals', 'analytics']) });
  const harness = await boot({ localStorage, coreTabOrder: true });
  const { values, dataTransfer } = dragTab(harness, 'accounts', 'goals');
  assert.strictEqual(values.get('text/plain'), 'accounts');
  assert.strictEqual(dataTransfer.effectAllowed, 'move');
  await settle(harness);
  const saved = JSON.parse(localStorage.getItem('av_top_tab_order'));
  assert.ok(saved.indexOf('accounts') < saved.indexOf('goals'));
  assert.strictEqual(saved.filter(key => key === 'accounts').length, 1);
  for (const key of ['projects', 'goals', 'analytics', 'assets', 'tasks', 'ads']) assert.ok(saved.includes(key));
  const visible = harness.tabs.children.filter(isShown).map(button => button.dataset.tab);
  assert.ok(visible.indexOf('accounts') < visible.indexOf('goals'));
  const reloaded = await boot({ localStorage, coreTabOrder: true });
  assert.deepStrictEqual(Array.from(reloaded.window._topTabOrder), saved);
  assert.deepStrictEqual(reloaded.tabs.children.filter(isShown).map(button => button.dataset.tab), visible);
  assert.strictEqual(harness.sentinel.value, 'Unsaved project note: must survive navigation');
});

test('IndexedDB preserves dragged tab order when the legacy localStorage write exceeds quota', async () => {
  const indexedDB = indexedDatabase();
  const localStorage = storage({ av_top_tab_order: JSON.stringify(['projects', 'goals', 'analytics']) });
  const options = { globals: { indexedDB }, localStorage, coreTabOrder: true };
  const harness = await boot(options);
  const legacyBeforeDrag = localStorage.getItem('av_top_tab_order');
  localStorage.failWrites = true;
  dragTab(harness, 'accounts', 'goals');
  await settle(harness);
  const reordered = Array.from(harness.window._topTabOrder);
  assert.ok(reordered.indexOf('accounts') < reordered.indexOf('goals'));
  assert.strictEqual(localStorage.getItem('av_top_tab_order'), legacyBeforeDrag);
  assert.deepStrictEqual(indexedDB.records.get('fil').order, reordered);
  assert.strictEqual(harness.api.getState().storageMode, 'indexeddb');
  assert.strictEqual(await harness.api.setTabVisible('ads', false), true);
  assert.deepStrictEqual(indexedDB.records.get('fil').order, reordered, 'a visibility save does not discard drag order');
  const reloaded = await boot(options);
  assert.deepStrictEqual(Array.from(reloaded.window._topTabOrder), reordered);
  assert.deepStrictEqual(Array.from(reloaded.api.getState().order), reordered);
  assert.strictEqual(reloaded.api.getState().visible.ads, false);
  const sasha = await boot({ ...options, profile: 'sasha' });
  assert.ok(sasha.window._topTabOrder.indexOf('accounts') > sasha.window._topTabOrder.indexOf('goals'), 'Fil IndexedDB order does not leak to Sasha');
  assert.strictEqual(sasha.api.getState().visible.ads, true);
});

test('a late IndexedDB read cannot roll back a newer drag order', async () => {
  const indexedDB = indexedDatabase();
  const originalOrder = ['goals', 'analytics', 'projects', 'assets', 'tasks', 'ads', 'accounts'];
  indexedDB.records.set('fil', { profile: 'fil', visible: Object.fromEntries(originalOrder.map(key => [key, true])), order: originalOrder });
  indexedDB.holdReads = true;
  const harness = createHarness({ globals: { indexedDB }, coreTabOrder: true });
  harness.api = harness.window.AVITOLOG_MAIN_MENU_SETTINGS;
  for (let index = 0; index < 10 && !indexedDB.pendingReadCount; index += 1) await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(indexedDB.pendingReadCount, 1);
  const before = Array.from(harness.window._topTabOrder);
  dragTab(harness, 'accounts', 'goals');
  await settle(harness);
  const reordered = Array.from(harness.window._topTabOrder);
  assert.notDeepStrictEqual(reordered, before);
  indexedDB.releaseReads();
  await harness.api.init();
  await settle(harness);
  assert.deepStrictEqual(Array.from(harness.window._topTabOrder), reordered);
  assert.deepStrictEqual(Array.from(harness.api.getState().order), reordered);
  assert.deepStrictEqual(indexedDB.records.get('fil').order, reordered);
});

test('tab-drop wrapper preserves the original receiver, arguments and return value while saving order', async () => {
  const order = ['goals', 'analytics', 'projects', 'assets', 'tasks', 'ads', 'accounts'];
  const returned = { marker: 'original-drop-return' };
  let call;
  function originalDrop(...args) {
    call = { receiver: this, args };
    order.splice(order.indexOf('accounts'), 1);
    order.unshift('accounts');
    return returned;
  }
  const harness = await boot({ globals: { _topTabOrder: order, topTabDrop: originalDrop } });
  const receiver = { marker: 'original-drop-context' };
  const event = new FakeEvent('drop');
  const result = harness.window.topTabDrop.call(receiver, event, 'goals', 'extra-original-argument');
  assert.strictEqual(result, returned);
  assert.strictEqual(call.receiver, receiver);
  assert.strictEqual(call.args[0], event);
  assert.strictEqual(call.args[1], 'goals');
  assert.strictEqual(call.args[2], 'extra-original-argument');
  await settle(harness);
  assert.deepStrictEqual(Array.from(harness.api.getState().order), order);
  assert.ok(harness.localStorage.writes.every(key => key.startsWith('avitolog_main_menu_visibility_v1:')));
});

test('range previews tab font and strip size, saves on change, and resets without changing business content', async () => {
  const harness = await boot();
  const { document, api, tabs, sentinel } = harness;
  const range = document.getElementById('mainMenuTabScale');
  assert.equal(range.type, 'range');
  assert.equal(range.min, '80');
  assert.equal(range.max, '140');
  assert.equal(range.step, '5');
  assert.equal(range.getAttribute('aria-labelledby'), 'mainMenuTabScaleLabel');
  assert.equal(document.getElementById('mainMenuTabScaleLabel').getAttribute('for'), range.id);
  assert.equal(api.getState().tabScale, 100);
  const savedBefore = harness.localStorage.snapshot();
  range.value = '125';
  range.dispatchEvent(new FakeEvent('input', { bubbles: true }));
  assert.equal(api.getState().tabScale, 125);
  assert.equal(tabs.style.getPropertyValue('--main-menu-tab-scale'), '1.25');
  assert.equal(document.getElementById('mainMenuTabScaleValue').textContent, '125%');
  assert.equal(range.getAttribute('aria-valuetext'), '125%');
  assert.deepEqual(harness.localStorage.snapshot(), savedBefore, 'dragging previews without writing on every pointer movement');
  range.dispatchEvent(new FakeEvent('change', { bubbles: true }));
  await settle(harness);
  const reloaded = await boot({ localStorage: harness.localStorage });
  assert.equal(reloaded.api.getState().tabScale, 125);
  assert.equal(reloaded.tabs.style.getPropertyValue('--main-menu-tab-scale'), '1.25');
  document.getElementById('mainMenuTabScaleReset').click();
  await settle(harness);
  assert.equal(api.getState().tabScale, 100);
  assert.equal(range.value, '100');
  assert.equal(JSON.parse(harness.localStorage.getItem('avitolog_main_menu_visibility_v1:fil')).tabScale, 100);
  assert.equal(sentinel.value, 'Unsaved project note: must survive navigation');
  assert.equal(document.body.style.getPropertyValue('--main-menu-tab-scale'), '', 'scale is scoped to the tab strip only');
});

test('tab size is durable in IndexedDB, isolated per profile, and retained by drag and visibility saves', async () => {
  const indexedDB = indexedDatabase();
  const options = { globals: { indexedDB }, coreTabOrder: true };
  const harness = await boot(options);
  assert.equal(await harness.api.setTabScale(135), true);
  dragTab(harness, 'accounts', 'goals');
  await settle(harness);
  assert.equal(await harness.api.setTabVisible('ads', false), true);
  assert.equal(indexedDB.records.get('fil').tabScale, 135);
  const reloaded = await boot(options);
  assert.equal(reloaded.api.getState().tabScale, 135);
  assert.equal(reloaded.api.getState().visible.ads, false);
  assert.ok(reloaded.api.getState().order.indexOf('accounts') < reloaded.api.getState().order.indexOf('goals'));
  reloaded.window.AVITOLOG_USER = 'sasha';
  reloaded.window.AVITOLOG_KEY_SUFFIX = '_sasha';
  await reloaded.api.refreshProfile();
  assert.equal(reloaded.api.getState().tabScale, 100);
  assert.equal(reloaded.tabs.style.getPropertyValue('--main-menu-tab-scale'), '1');
  await reloaded.api.setTabScale(85);
  assert.equal(indexedDB.records.get('sasha').tabScale, 85);
  assert.equal(indexedDB.records.get('fil').tabScale, 135);
});

test('old preferences keep their tabs and use 100% size; invalid size stays bounded', async () => {
  const legacy = { visible: { ads: false }, order: ['projects', 'goals'] };
  const localStorage = storage({ 'avitolog_main_menu_visibility_v1:fil': JSON.stringify(legacy) });
  const harness = await boot({ localStorage });
  assert.equal(harness.api.getState().visible.ads, false);
  assert.equal(harness.api.getState().tabScale, 100);
  assert.equal(harness.api.getState().order[0], 'projects');
  for (const [value, expected] of [[-100, 80], [500, 140], [126, 125], [NaN, 100], [Infinity, 100], ['bad', 100]]) {
    await harness.api.setTabScale(value);
    assert.equal(harness.api.getState().tabScale, expected);
  }
});

test('a late saved size cannot undo an active slider edit', async () => {
  const indexedDB = indexedDatabase();
  indexedDB.records.set('fil', { profile: 'fil', visible: { ads: false }, tabScale: 85 });
  indexedDB.holdReads = true;
  const harness = createHarness({ globals: { indexedDB } });
  harness.api = harness.window.AVITOLOG_MAIN_MENU_SETTINGS;
  for (let index = 0; index < 10 && !indexedDB.pendingReadCount; index += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(indexedDB.pendingReadCount, 1);
  const range = harness.document.getElementById('mainMenuTabScale');
  range.value = '130';
  range.dispatchEvent(new FakeEvent('input', { bubbles: true }));
  indexedDB.releaseReads();
  await harness.api.init();
  await settle(harness);
  assert.equal(harness.api.getState().tabScale, 130);
  assert.equal(indexedDB.records.get('fil').tabScale, 130);
});


