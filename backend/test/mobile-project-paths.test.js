'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/mobile-project-paths.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../../assets/css/mobile-projects-readability.css'), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(source, sandbox);
const api = sandbox.module.exports;

function harness() {
  const frames = new Map(), listeners = new Map();
  let frameId = 0, observer = null, currentScope = 'owner:projects';
  function element(tag, classes = '') {
    const names = new Set(classes.split(/\s+/).filter(Boolean)), attrs = new Map(), events = new Map();
    const node = {
      tagName: tag.toUpperCase(), children: [], parentNode: null, textContent: '', title: '', scrollLeft: 0, offsetWidth: 100,
      rect: { left: 0, width: 100 },
      classList: { contains: name => names.has(name), add: name => names.add(name), remove: name => names.delete(name), toggle(name, on) { if (on) names.add(name); else names.delete(name); } },
      setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key) ?? null,
      appendChild(child) { return node.insertBefore(child, null); },
      insertBefore(child, next) {
        if (child.parentNode) child.parentNode.removeChild(child);
        const index = next ? node.children.indexOf(next) : -1;
        node.children.splice(index < 0 ? node.children.length : index, 0, child); child.parentNode = node; return child;
      },
      removeChild(child) { node.children.splice(node.children.indexOf(child), 1); child.parentNode = null; return child; },
      addEventListener: (name, callback) => events.set(name, callback),
      emit(name) { const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; events.get(name)?.(event); return event; },
      closest(selector) { return node.classList.contains(selector.slice(1)) ? node : node.parentNode?.closest(selector) || null; },
      querySelector(selector) { return descendants(node).find(child => child.classList.contains(selector.slice(1))) || null; },
      getBoundingClientRect: () => node.rect
    };
    Object.defineProperties(node, {
      className: { get: () => [...names].join(' '), set(value) { names.clear(); value.split(/\s+/).filter(Boolean).forEach(name => names.add(name)); } },
      isConnected: { get: () => node === body || !!node.parentNode?.isConnected },
      nextSibling: { get: () => node.parentNode?.children[node.parentNode.children.indexOf(node) + 1] || null }
    });
    return node;
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  const body = element('body', 'mobile-client-ui projects-mode'), board = element('div', 'projects-board'); body.appendChild(board);
  function row(id = 'p1') {
    const cell = element('div', 'proj-cell-editable'); cell.setAttribute('data-id', id);
    const line = element('div', 'proj-main-line'), input = element('input'), path = element('span', 'project-path'), status = element('button', 'project-status'), badge = element('div', 'proj-task-badge');
    input.value = 'Original project';
    path.rect = { left: 160, width: 110 };
    const stage = element('button', 'proj-path-btn on'); stage.handler = () => 'original-stage-action'; path.appendChild(stage);
    [input, path, status].forEach(child => line.appendChild(child)); [line, badge].forEach(child => cell.appendChild(child)); board.appendChild(cell);
    return { cell, line, input, path, status, badge, stage, originals: [...cell.children], originalLine: [...line.children] };
  }
  const first = row();
  const doc = { body, createElement: element,
    querySelector: selector => body.querySelector(selector),
    querySelectorAll(selector) {
      assert.equal(selector, '.projects-board .proj-main-line > .project-path');
      return descendants(body).filter(node => node.classList.contains('project-path') && node.parentNode?.classList.contains('proj-main-line'));
    }
  };
  const win = {
    AVITOLOG_KEY: () => currentScope,
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() { this.disconnected = true; } }
  };
  return { win, doc, body, board, row, first, frames, listeners, get observer() { return observer; },
    set scope(value) { currentScope = value; },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); }
  };
}

test('mobile arrow sits outside the overflowing line without moving or replacing original controls', () => {
  const h = harness(), controller = api.install(h.win, h.doc), { cell, line, path, stage, input, originals, originalLine } = h.first;
  const button = cell.querySelector('.projects-mobile-path-toggle');
  assert.equal(h.body.classList.contains('projects-mobile-paths'), true);
  assert.equal(button.parentNode, cell);
  assert.equal(line.nextSibling, button, 'arrow cannot scroll away with the stage strip');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
  assert.equal(path.classList.contains('projects-mobile-path-open'), false);
  assert.deepEqual(line.children, originalLine);
  assert.deepEqual(cell.children.filter(child => child !== button), originals);
  assert.equal(stage.handler(), 'original-stage-action');
  assert.equal(input.value, 'Original project');
  controller.destroy();
});

test('one click reveals stages to the right, another closes them without opening a project editor', () => {
  const h = harness(), controller = api.install(h.win, h.doc), button = h.first.cell.querySelector('.projects-mobile-path-toggle');
  h.first.line.scrollLeft = 40;
  const event = button.emit('click');
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  assert.equal(h.first.path.classList.contains('projects-mobile-path-open'), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.textContent, '‹');
  assert.equal(h.first.line.scrollLeft, 0, 'opening widens the menu to the right without scrolling the name away');
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), true);
  button.emit('click');
  assert.equal(h.first.path.classList.contains('projects-mobile-path-open'), false);
  assert.equal(h.first.line.scrollLeft, 0);
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
  assert.equal(button.textContent, '›');
  controller.destroy();
});

test('rerenders keep only the same project visual state and profile changes reset it', () => {
  const h = harness(), controller = api.install(h.win, h.doc);
  h.first.cell.querySelector('.projects-mobile-path-toggle').emit('click');
  h.board.removeChild(h.first.cell);
  const replacement = h.row('p1'), other = h.row('p2'); controller.sync();
  assert.equal(replacement.path.classList.contains('projects-mobile-path-open'), true);
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), true);
  assert.equal(other.path.classList.contains('projects-mobile-path-open'), false);
  assert.equal(h.first.cell.querySelector('.projects-mobile-path-toggle'), null);
  h.scope = 'sasha:projects'; controller.sync();
  assert.equal(replacement.path.classList.contains('projects-mobile-path-open'), false);
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
  controller.destroy();
});

test('desktop, KP and Accounts restore original stages and remove only presentation additions', () => {
  for (const mode of ['desktop', 'kp', 'accounts']) {
    const h = harness(), controller = api.install(h.win, h.doc);
    h.first.cell.querySelector('.projects-mobile-path-toggle').emit('click');
    if (mode === 'desktop') h.body.classList.remove('mobile-client-ui');
    if (mode === 'kp') h.body.classList.remove('projects-mode');
    if (mode === 'accounts') h.body.classList.add('avito-accounts-mode');
    controller.sync();
    assert.equal(h.body.classList.contains('projects-mobile-paths'), false);
    assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
    assert.equal(h.first.cell.querySelector('.projects-mobile-path-toggle'), null);
    assert.equal(h.first.path.classList.contains('projects-mobile-path-open'), false);
    assert.deepEqual(h.first.cell.children, h.first.originals);
    assert.deepEqual(h.first.line.children, h.first.originalLine);
    assert.equal(h.first.stage.handler(), 'original-stage-action');
    controller.destroy();
  }
});

test('controller is singleton, rerender observation is bounded and destruction cancels own work', () => {
  const h = harness(), controller = api.install(h.win, h.doc);
  assert.equal(api.install(h.win, h.doc), null);
  h.observer.callback([{ type: 'childList', target: h.first.cell, addedNodes: [], removedNodes: [] }]);
  h.observer.callback([{ type: 'childList', target: h.first.cell, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.frames.size, 1); h.flush();
  assert.equal(h.first.cell.children.filter(node => node.classList.contains('projects-mobile-path-toggle')).length, 1);
  h.listeners.get('resize')(); assert.equal(h.frames.size, 1);
  h.flush();h.observer.callback([{type:'attributes',attributeName:'style',target:{classList:{contains:name=>name==='projects-table'}}}]);assert.equal(h.frames.size,1,'manual column resize updates the measured width');h.flush();
  h.observer.callback([{type:'attributes',attributeName:'style',target:h.board}]);assert.equal(h.frames.size,0,'own width style does not schedule a loop');
  controller.destroy();
  assert.equal(h.frames.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.observer.disconnected, true);
  assert.equal(h.win.__avitologMobileProjectPaths, undefined);
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
});

test('the shared menu width stays expanded until the last visible project menu closes', () => {
  const h = harness(), second = h.row('p2'), controller = api.install(h.win, h.doc);
  const firstButton = h.first.cell.querySelector('.projects-mobile-path-toggle'), secondButton = second.cell.querySelector('.projects-mobile-path-toggle');
  firstButton.emit('click'); secondButton.emit('click'); firstButton.emit('click');
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), true);
  secondButton.emit('click');
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false);
  firstButton.emit('click');
  h.board.removeChild(h.first.cell); controller.sync();
  assert.equal(h.body.classList.contains('projects-mobile-path-expanded'), false, 'a removed row cannot leave the calendar narrowed');
  controller.destroy();
});

test('stage hiding is opt-in presentation only; CSS keeps proportional zoom and arrow outside the line', () => {
  assert.match(css, /\.projects-mobile-paths \.project-path:not\(\.projects-mobile-path-open\)\s*\{\s*display: none/);
  assert.match(css, /\.projects-mobile-path-toggle\s*\{[\s\S]*?flex: 0 0 20px/);
  assert.match(css, /48vw \/ var\(--mobile-shell-scale, 1\)/);
  assert.match(css, /\.projects-mobile-path-expanded \.projects-table \.projects-sticky\s*\{/);
  assert.match(css, /min\(calc\(var\(--projects-mobile-closed-width, var\(--projects-sticky-width, 360px\)\) \+ 240px\), calc\(78vw \/ var\(--mobile-shell-scale, 1\)\)\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|\.value\s*=|toggleProjectPath\(/);
  assert.doesNotMatch(css, /projects-mobile-title|projects-mobile-actions|--projects-mobile-scale|62px/);
});

test('closed width measures actual controls, not the empty saved column or hidden stage buttons', () => {
  const node=(width,css={})=>({offsetWidth:width,css,children:[]});
  const title=node(100),status=node(30),emoji=node(20),card=node(10),path=node(500,{display:'none'});
  const line=node(900,{columnGap:'4px'});line.children=[emoji,title,path,status,card];
  const cell=node(900,{columnGap:'4px',paddingLeft:'3px',paddingRight:'3px'});
  cell.children=[line,node(20),node(18,{marginLeft:'4px'})];
  const sticky=node(1000);sticky.children=[node(22),node(18),node(20),cell,node(18)];
  cell.closest=()=>sticky;
  const win={getComputedStyle:e=>({display:'block',...e.css})},record={cell,line,path};
  assert.equal(api.collapsedWidth(win,record),308);
  path.css.display='inline-flex';assert.equal(api.collapsedWidth(win,record),308,'opening stages must not inflate the collapsed width');
  title.offsetWidth=140;assert.equal(api.collapsedWidth(win,record),348,'title size is preserved');
  status.css.display='none';assert.equal(api.collapsedWidth(win,record),314,'hidden controls reserve no width or gap');
});

test('temporary width is removed when leaving mobile Projects or destroying the controller', () => {
  for(const destroy of [false,true]){
    const h=harness(),values=new Map();h.board.style={setProperty:(k,v)=>values.set(k,v),getPropertyValue:k=>values.get(k)||'',removeProperty:k=>values.delete(k)};
    const query=h.board.querySelector;h.board.querySelector=selector=>selector==='.projects-table'?{}:query(selector);
    h.win.getComputedStyle=()=>({display:'block',getPropertyValue:()=> '150px'});
    const closest=h.first.cell.closest;h.first.cell.closest=selector=>selector==='.projects-sticky'?{children:[h.first.cell]}:closest(selector);
    const controller=api.install(h.win,h.doc);assert.equal(values.get('--projects-mobile-closed-width'),'150px','manual narrow columns remain narrow');
    if(destroy)controller.destroy();else{h.body.classList.remove('projects-mode');controller.sync();}
    assert.equal(values.has('--projects-mobile-closed-width'),false);
  }
});
