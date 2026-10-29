'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/projects-pinch.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../../assets/css/mobile-projects-readability.css'), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(source, sandbox);
const api = sandbox.module.exports;
const scope = 'body.mobile-client-ui.projects-mode:not(.avito-accounts-mode)';

function rule(suffix) {
  const selector = scope + (suffix ? ' ' + suffix : '');
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const found = blocks.find(block => block[1].trim() === selector);
  assert.ok(found, 'missing phone-only Projects rule: ' + selector);
  return found[2];
}

test('classic pinch installs only gesture listeners, without mirrors or reordered actions', () => {
  const listeners = new Map(), nodes = [{ id: 'emoji' }, { id: 'title', value: 'Existing project' }, { id: 'action', handler: () => 'original' }];
  const before = [...nodes];
  const doc = {
    body: { classList: { contains: () => false } },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
    createElement() { throw new Error('install must not create presentation wrappers'); },
    querySelectorAll() { throw new Error('install must not inspect or move project inputs'); }
  };
  const win = {};
  const controller = api.install(win, doc);
  assert.deepEqual([...listeners.keys()].sort(), ['click', 'touchcancel', 'touchend', 'touchmove', 'touchstart']);
  assert.deepEqual(nodes, before);
  assert.equal(nodes[1].value, 'Existing project');
  assert.equal(nodes[2].handler(), 'original');
  assert.equal(api.installReadability, undefined);
  assert.doesNotMatch(source, /projects-mobile-title|projects-mobile-actions|installReadability|MutationObserver/);
  controller.destroy();
  assert.equal(listeners.size, 0);
});

test('zoom changes the actual board scale and exposes more calendar without physical size floors', () => {
  assert.equal(api.zoomFor(1, 200, 100), .5);
  assert.equal(api.sizeFor(.5).width, '200%');
  assert.equal(api.sizeFor(.5).height, '200%');
  assert.equal(api.zoomFor(.5, 100, 200), 1);
  assert.equal(api.sizeFor(1).width, '100%');
  assert.equal(api.zoomFor(1, 100, 1), .25);
  assert.equal(api.zoomFor(1, 100, 1000), 2);
  assert.doesNotMatch(css, /font-size|projects-cal-day|--projects-mobile-scale|62px|projects-mobile-title|projects-mobile-actions/);
});

test('all stylesheet geometry is limited to mobile Projects, not KP, Accounts or desktop', () => {
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].map(match => match[1].trim());
  assert.ok(selectors.length >= 8);
  for (const selector of selectors) assert.ok(selector.startsWith(scope), selector);
  assert.doesNotMatch(css, /kp-editor|kp-generator|mainContent|\.sidebar|transform\s*:/);
});

test('viewport follows only the outer shell scale and does not write global zoom preferences', () => {
  assert.match(rule(''), /height: var\(--mobile-visual-height, 100dvh\)/);
  assert.match(rule(''), /overflow: clip/);
  assert.match(rule('#mainApp > .layout'), /height: calc\(\(var\(--mobile-visual-height, 100dvh\) - 42px\) \/ var\(--mobile-shell-scale, 1\)\) !important/);
  assert.match(rule('#mainApp > .layout'), /min-height: 0 !important/);
  assert.match(rule('.content-wrap'), /min-width: 0 !important/);
  assert.doesNotMatch(source, /MOBILE_WEBVIEW|setMobileWebview|setItem\(/);
});

test('phone fit-to-height mode keeps normal rows and native vertical and horizontal scrolling', () => {
  assert.match(rule('.projects-table-wrap'), /overflow: auto !important/);
  assert.match(rule('.projects-table-wrap'), /min-height: 0/);
  assert.match(rule('.projects-table-wrap'), /-webkit-overflow-scrolling: touch/);
  const table = rule('.projects-board.projects-fit-rows .projects-table');
  assert.match(table, /flex: 0 0 auto/);
  assert.match(table, /display: block/);
  assert.match(table, /height: auto/);
  const row = rule('.projects-table-row[data-id]');
  assert.match(row, /flex: 0 0 auto !important/);
  assert.match(row, /min-height: var\(--projects-row-height, 14px\) !important/);
});

test('sticky names leave calendar room and classic inline actions remain accessible', () => {
  const sticky = rule('.projects-table .projects-sticky');
  for (const property of ['width', 'min-width', 'max-width']) {
    assert.ok(sticky.includes(property + ': min(var(--projects-mobile-closed-width, var(--projects-sticky-width, 360px)), calc(48vw / var(--mobile-shell-scale, 1))) !important'));
  }
  assert.match(rule('.proj-main-line'), /overflow-x: auto/);
  assert.match(rule('.proj-main-line'), /overflow-y: hidden/);
  assert.doesNotMatch(css, /\.proj-main-line\s*\{[^}]*display: grid/);
});
