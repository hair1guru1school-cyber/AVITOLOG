'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const cssPath = path.join(root, 'assets/css/accounts-mobile-compact.css');
const readCss = () => fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function splitSelectors(value) {
  let depth = 0;
  let start = 0;
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(' || value[index] === '[') depth += 1;
    if (value[index] === ')' || value[index] === ']') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result;
}
const rules = css => Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), match => ({
  selectors: splitSelectors(match[1].trim()),
  body: match[2]
}));
function declarations(css, selector) {
  return rules(css).filter(rule => rule.selectors.some(value => selector.test(value))).map(rule => rule.body).join('\n');
}

test('compact Accounts styling is mobile-only and does not leak into other tabs', () => {
  const css = readCss();
  assert.match(css, /@media[^{}]*max-width:\s*768px/);
  assert.match(css, /@media[^{}]*orientation:\s*landscape[^{}]*max-width:\s*980px[^{}]*max-height:\s*560px/);
  for (const rule of rules(css)) {
    for (const selector of rule.selectors) {
      if (selector === '.accounts-mobile-name') {
        assert.match(rule.body, /^\s*display:\s*none;?\s*$/);
        continue;
      }
      assert.match(selector, /^(?::root\[data-theme=['"]light['"]\]\s+)?body\.(?:avito-accounts-mode|accounts-mobile-compact)\b/, selector);
    }
  }
  assert.doesNotMatch(css, /#avitoAccountsFrame\b[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /user-scalable|pointer-events:\s*none[^}]*#avitoAccountsFrame/);
});

test('Accounts does not introduce a different global header or navigation geometry', () => {
  const css = readCss();
  assert.doesNotMatch(css, /body\.avito-accounts-mode #mainApp\s*>\s*header|body\.avito-accounts-mode #analyticsTopRow/);
  assert.match(declarations(css, /^body\.avito-accounts-mode \.avito-main-accounts-head$/), /display:\s*none/);
});

test('child zoom buttons stay fixed and compact without hiding storage failures', () => {
  const css = readCss();
  const controls = declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-scale$/);
  assert.match(controls, /display:\s*inline-flex;[^}]*position:\s*fixed/);
  assert.match(controls, /bottom:\s*max\(8px, env\(safe-area-inset-bottom/);
  assert.doesNotMatch(controls, /display:\s*none/);
  const button = declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-scale > \.button$/);
  assert.match(button, /width:\s*44px;[^}]*min-width:\s*44px;[^}]*height:\s*44px;[^}]*min-height:\s*44px/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-scale > \.button:nth-of-type\(2\)$/), /display:\s*none/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-scale-status:not\(\.visually-hidden\)$/), /position:\s*absolute;[^}]*white-space:\s*normal/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.account-section > \.table-scroll$/), /padding-bottom:\s*62px/);
});

test('compact overrides load after the height correction and earlier mobile presentation', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const compact = index.indexOf('assets/css/accounts-mobile-compact.css?');
  assert.ok(compact > index.indexOf('assets/css/accounts-viewport.css?'));
  assert.ok(compact > index.indexOf('assets/css/mobile-landscape.css?'));
  assert.ok(compact > index.indexOf('assets/css/mobile-client-ui.css?'));
  const heightCss = fs.readFileSync(path.join(root, 'assets/css/accounts-viewport.css'), 'utf8');
  assert.match(heightCss, /#mainApp\s*\{[^}]*height:\s*100dvh;/);
  assert.doesNotMatch(heightCss, /transform:\s*none/);
  assert.match(heightCss, /#avitoAccountsFrameHost\s*\{[^}]*flex:\s*1\s+1\s+0;[^}]*min-height:\s*0/);
});

test('only populated account lists lock the viewport while authentication forms remain reachable', () => {
  const css = readCss();
  const populatedBody = declarations(css, /^body\.accounts-mobile-compact:has\(#accountsGrid > \.account-row\)$/);
  assert.match(populatedBody, /height:\s*100dvh/);
  assert.match(populatedBody, /overflow:\s*hidden/);
  assert.doesNotMatch(declarations(css, /^body\.accounts-mobile-compact$/), /overflow:\s*hidden|height:\s*100dvh/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact:has\(#accountsGrid > \.account-row\) main$/), /display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact:has\(#accountsGrid > \.account-row\) \.account-section$/), /flex:\s*1\s+1\s+0;[^}]*min-height:\s*0/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.account-section > \.table-scroll$/), /flex:\s*1\s+1\s+0;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*touch-action:\s*pan-x\s+pan-y\s+pinch-zoom/);
});

test('account names wrap at a readable size and remain pinned beside horizontally browsable metrics', () => {
  const css = readCss();
  const name = declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-name$/);
  assert.match(name, /font-size:\s*16px/);
  assert.match(name, /white-space:\s*normal/);
  assert.match(name, /overflow-wrap:\s*anywhere/);
  const identity = declarations(css, /^body\.accounts-mobile-compact \.accounts-table \.account-row td\.account-identity$/);
  assert.match(identity, /position:\s*sticky/);
  assert.match(identity, /left:\s*0/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.accounts-table thead th$/), /position:\s*sticky;[^}]*top:\s*0/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.accounts-mobile-scale$/), /display:\s*inline-flex/);
  assert.match(declarations(css, /^body\.accounts-mobile-compact \.accounts-header \.table-settings-content$/), /position:\s*fixed;[^}]*max-height:\s*calc\(100dvh - \d+px\);[^}]*overflow-y:\s*auto/);
});

test('expanded account statistics compensate table zoom and keep two readable mobile columns', () => {
  const css=readCss();
  const detail=declarations(css,/^body\.accounts-mobile-compact \.account-detail-cell #accountDetail$/);
  assert.match(detail,/zoom:\s*calc\(1 \/ var\(--accounts-table-scale, 1\)\)/);
  assert.match(detail,/width:\s*calc\(100vw - 12px\)/);
  assert.match(declarations(css,/^body\.accounts-mobile-compact #accountDetail \.statistics-grid$/),/repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(declarations(css,/^body\.accounts-mobile-compact #accountDetail \.statistics-total$/),/font-size:\s*22px/);
});

test('only the open bidding overlay temporarily neutralizes the scaled outer shell', () => {
  const css=readCss();
  const overlay=declarations(css,/^body\.avito-accounts-mode\.avito-bid-overlay #mainApp$/);
  assert.match(overlay,/--accounts-host-scale:\s*1 !important/);
  assert.match(overlay,/width:\s*100vw !important/);
  assert.match(overlay,/transform:\s*scale\(1\) !important/);
  assert.doesNotMatch(declarations(css,/^body\.avito-accounts-mode #mainApp$/),/transform|width/);
  assert.match(declarations(css,/^body\.accounts-mobile-compact \.avb-layout$/),/flex-direction:\s*column;[^}]*min-height:\s*0/);
});

function mirrorHarness() {
  const ids = new Map(), classes = new Set(), inputs = [], writes = [], mutations = [];
  let observer;
  function element(tag) {
    let text = '';
    const result = {
      tag, children: [], attrs: {}, handlers: {}, dataset: {}, className: '', value: '',
      classList: { toggle() {} },
      appendChild(child) { child.parentElement = this; this.children.push(child); mutations.push(['append', this, child]); return child; },
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, callback) { this.handlers[name] = callback; },
      querySelector(selector) { return this.children.find(child => selector === '.' + child.className) || null; }
    };
    Object.defineProperty(result, 'id', { get() { return this._id; }, set(value) { this._id = value; ids.set(value, this); } });
    Object.defineProperty(result, 'textContent', { get() { return text; }, set(value) { text = value; mutations.push(['text', this, value]); } });
    return result;
  }
  const strip = element('div'), settings = element('div'), grid = element('tbody');
  grid.id = 'accountsGrid';
  function addInput(value) {
    const parent = element('div'), input = element('input');
    input.className = 'account-name-input'; input.value = value;
    parent.appendChild(input); grid.appendChild(parent); inputs.push(input);
    return input;
  }
  const query = { matches: true, addEventListener(name, callback) { this[name] = callback; } };
  const doc = {
    createElement: element, getElementById: id => ids.get(id),
    querySelector: selector => selector === '.accounts-status-strip' ? strip : settings,
    querySelectorAll: () => inputs,
    body: { classList: { contains: name => classes.has(name), toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } },
    documentElement: { style: { setProperty() {} } }
  };
  const win = {
    matchMedia: () => query,
    MutationObserver: class { constructor(callback) { observer = callback; } observe(target, options) { assert.equal(target, grid); assert.equal(options.childList, true); assert.equal(options.subtree, true); } },
    localStorage: { getItem: () => '.75', setItem(...args) { writes.push(args); } }
  };
  return { doc, win, writes, mutations, inputs, grid, query, classes, addInput, notify: () => observer() };
}

test('readable name mirrors preserve the original inputs and stop mutating once synchronized', () => {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/mobile-accounts-view.js'), 'utf8'), sandbox);
  const h = mirrorHarness();
  const original = h.addInput('Клиент с длинным названием проекта');
  let originalValue = original.value;
  Object.defineProperty(original, 'value', { get: () => originalValue, set() { assert.fail('presentation must not assign the account name'); } });
  const controller = sandbox.module.exports.install(h.win, h.doc);
  const mirror = original.parentElement.querySelector('.accounts-mobile-name');
  assert.equal(mirror.textContent, original.value);
  assert.equal(mirror.attrs['aria-hidden'], 'true');
  assert.equal(original.parentElement.children[0], original);
  assert.equal(h.writes.length, 0);
  assert.equal(controller.getScale(), .75);
  const settledMutations = h.mutations.length;
  h.notify(); h.notify();
  assert.equal(h.mutations.length, settledMutations, 'observer callback must settle, not redraw in a loop');
  originalValue = 'Обновлённое название';
  h.grid.handlers.input();
  assert.equal(mirror.textContent, originalValue);
  const added = h.addInput('Новый аккаунт');
  h.notify();
  assert.equal(added.parentElement.querySelector('.accounts-mobile-name').textContent, 'Новый аккаунт');
  assert.equal(original.parentElement.children.filter(node => node.className === 'accounts-mobile-name').length, 1);
  h.query.matches = false; h.query.change();
  assert.equal(h.classes.has('accounts-mobile-compact'), false);
  assert.equal(h.writes.length, 0, 'orientation and name refresh do not persist account data');
  assert.equal(sandbox.module.exports.install(h.win, h.doc), null, 'repeated initialization must not duplicate controls');
});
