'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/goals.js'), 'utf8');

function environment() {
  let data = { projects: [{ id: 'g1', name: 'Original', saleAmount: '20000' }] }, writes = 0, renders = 0;
  const listeners = new Map(), main = { set innerHTML(value) { renders++; } };
  const window = { AVITOLOG_BACKEND_SERVER_ONLY: true, AVITOLOG_BACKEND_INITIAL_SYNC_READY: false, AVITOLOG_KEY: key => key };
  const cell = {
    children: [], classList: { contains: () => false, add() {}, remove() {} },
    querySelector: () => display,
    replaceChild(next, old) { this.children = [next]; old.parentNode = null; next.parentNode = this; }
  };
  const display = { textContent: 'Original', parentNode: cell, getAttribute: () => 'g1' };
  cell.children = [display];
  const document = {
    getElementById: id => id === 'mainContent' ? main : null,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    createElement() {
      return {
        setAttribute() {}, style: {}, parentNode: null,
        get isConnected() { return this.parentNode === cell; },
        contains(target) { return target === this; },
        focus() { document.activeElement = this; }, select() {}
      };
    }
  };
  const end = source.lastIndexOf('})();');
  const instrumented = source.slice(0, end) + `
    loadData = function() { return JSON.parse(JSON.stringify(window.__data())); };
    saveData = function(value) { window.__save(value); };
    window.__editTest = { render: render, edit: editGoalNameCell, month: function(value) { _goalsViewMonth = value; } };
  ` + source.slice(end);
  window.__data = () => data;
  window.__save = value => { data = value; writes++; };
  vm.runInNewContext(instrumented, { window, document, Date, JSON, Intl, console, setInterval() {}, setTimeout() {}, clearTimeout() {} });
  const api = window.__editTest;
  return {
    api, window, document, listeners, cell,
    begin() { api.edit(cell); return cell.children[0]; },
    data: () => data, writes: () => writes, renders: () => renders,
    remote(value) { data = value; },
    key(input, key, extra = {}) { input.onkeydown({ key, preventDefault() {}, stopPropagation() {}, ...extra }); }
  };
}

test('background refreshes never replace or save the focused CRM name draft', () => {
  const h = environment(), input = h.begin();
  for (let i = 0; i < 100; i++) { input.value = 'Draft ' + i; h.api.render(); }
  assert.equal(h.cell.children[0], input);
  assert.equal(h.document.activeElement, input);
  assert.equal(input.value, 'Draft 99');
  assert.equal(h.renders(), 0); assert.equal(h.writes(), 0);
  assert.equal(input.onblur, undefined, 'focus loss alone does not commit the draft');
});

test('Enter commits once against fresh data, retaining remote fields and projects', () => {
  const h = environment(), input = h.begin(); input.value = '  New   name  ';
  h.remote({ projects: [{ id: 'g1', name: 'Original', saleAmount: '40000', phone: '+70000000000' }, { id: 'g2', name: 'Remote' }] });
  h.key(input, 'Enter'); h.key(input, 'Enter');
  assert.equal(h.data().projects[0].name, 'New name');
  assert.equal(h.data().projects[0].saleAmount, '40000'); assert.equal(h.data().projects[0].phone, '+70000000000');
  assert.equal(h.data().projects[1].name, 'Remote'); assert.equal(h.writes(), 1);
  assert.equal(h.listeners.has('pointerdown'), false);
});

test('clicking inside keeps editing; clicking outside commits the title', () => {
  const h = environment(), input = h.begin(); input.value = 'Clicked name';
  h.listeners.get('pointerdown')({ target: input }); assert.equal(h.writes(), 0);
  h.listeners.get('pointerdown')({ target: {} });
  assert.equal(h.data().projects[0].name, 'Clicked name'); assert.equal(h.writes(), 1);
  assert.equal(h.cell.children[0].textContent, 'Clicked name');
  assert.equal(h.renders(), 0, 'the outside click target remains in place for its own click handler');
});

test('IME Enter is ignored and Escape cancels without writing', () => {
  const h = environment(), input = h.begin(); input.value = 'Unsaved';
  h.key(input, 'Enter', { isComposing: true }); h.key(input, 'Enter', { keyCode: 229 });
  assert.equal(h.writes(), 0); assert.equal(h.renders(), 0);
  h.key(input, 'Escape'); assert.equal(h.writes(), 0); assert.equal(h.data().projects[0].name, 'Original');
});

test('unchanged or blank input does not overwrite a concurrent rename', () => {
  for (const value of ['Original', '   ']) {
    const h = environment(), input = h.begin(); input.value = value;
    h.remote({ projects: [{ id: 'g1', name: 'Remote rename' }] });
    h.key(input, 'Enter'); assert.equal(h.writes(), 0); assert.equal(h.data().projects[0].name, 'Remote rename');
  }
});

test('profile changes, month changes and removed inputs never write to the wrong view', () => {
  for (const change of [h => { h.window.AVITOLOG_KEY = key => key + '_sasha'; }, h => h.api.month('2025-01'), (h, input) => { input.parentNode = null; }]) {
    const h = environment(), input = h.begin(); input.value = 'Stale draft'; change(h, input);
    h.api.render(); h.key(input, 'Enter');
    assert.equal(h.writes(), 0); assert.equal(h.listeners.has('pointerdown'), false);
    assert.equal(h.renders(), 1, 'a stale edit cannot block rendering another scope');
  }
});

test('a deleted project is not resurrected by finishing its stale name draft', () => {
  const h = environment(), input = h.begin(); input.value = 'Changed'; h.remote({ projects: [] });
  h.key(input, 'Enter'); assert.equal(h.writes(), 0); assert.deepEqual(h.data().projects, []);
});
