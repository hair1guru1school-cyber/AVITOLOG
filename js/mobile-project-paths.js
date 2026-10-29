(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root, root.document);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function collapsedWidth(win, record) {
    if (!win.getComputedStyle) return 0;
    function box(node) {
      var css = win.getComputedStyle(node);
      if (css.display === 'none') return 0;
      return node.offsetWidth + (parseFloat(css.marginLeft) || 0) + (parseFloat(css.marginRight) || 0);
    }
    function gap(node, count) { return Math.max(0, count - 1) * (parseFloat(win.getComputedStyle(node).columnGap) || 0); }
    var sticky = record.cell.closest('.projects-sticky');
    if (!sticky) return 0;
    var buttons = Array.from(record.line.children).filter(function (node) { return node !== record.path && win.getComputedStyle(node).display !== 'none'; });
    var lineWidth = buttons.reduce(function (sum, node) { return sum + box(node); }, 0) + gap(record.line, buttons.length);
    var cellParts = Array.from(record.cell.children).filter(function (node) { return win.getComputedStyle(node).display !== 'none'; });
    var cellCss = win.getComputedStyle(record.cell);
    var cellWidth = cellParts.reduce(function (sum, node) { return sum + (node === record.line ? lineWidth : box(node)); }, 0) + gap(record.cell, cellParts.length) + (parseFloat(cellCss.paddingLeft) || 0) + (parseFloat(cellCss.paddingRight) || 0);
    var siblings = Array.from(sticky.children);
    return Math.ceil(siblings.reduce(function (sum, node) { return sum + (node === record.cell ? cellWidth : box(node)); }, 0) + gap(sticky, siblings.length) + 2);
  }

  function install(win, doc) {
    if (!win || !doc || !doc.body || win.__avitologMobileProjectPaths) return null;
    var records = new Map(), opened = new Set(), frame = null, observer = null, destroyed = false, lastScope = null, widthBoard = null;

    function clearWidth() {
      if (widthBoard && widthBoard.style) widthBoard.style.removeProperty('--projects-mobile-closed-width');
      widthBoard = null;
    }
    function fitClosedWidth() {
      var board = doc.querySelector('.projects-board'), width = 0;
      if (widthBoard !== board) clearWidth();
      if (!board || !board.style) return;
      widthBoard = board;
      records.forEach(function (record) { width = Math.max(width, collapsedWidth(win, record)); });
      var table = board.querySelector('.projects-table'), css = table && win.getComputedStyle && win.getComputedStyle(table);
      var preferred = css && css.getPropertyValue && parseFloat(css.getPropertyValue('--projects-sticky-width'));
      if (preferred > 0) width = Math.min(width, preferred);
      if (width > 0 && board.style.getPropertyValue('--projects-mobile-closed-width') !== width + 'px') board.style.setProperty('--projects-mobile-closed-width', width + 'px');
    }

    function restore(path, record) {
      path.classList.remove('projects-mobile-path-open');
      record.cell.classList.remove('projects-mobile-path-cell');
      if (record.button.parentNode) record.button.parentNode.removeChild(record.button);
      records.delete(path);
    }
    function expanded(record, on) {
      if (record.path.classList.contains('projects-mobile-path-open') !== on) record.path.classList.toggle('projects-mobile-path-open', on);
      var value = on ? 'true' : 'false', label = on ? 'Скрыть этапы проекта' : 'Показать этапы проекта';
      if (record.button.getAttribute('aria-expanded') !== value) record.button.setAttribute('aria-expanded', value);
      if (record.button.getAttribute('aria-label') !== label) record.button.setAttribute('aria-label', label);
      if (record.button.title !== label) record.button.title = label;
      if (record.button.textContent !== (on ? '‹' : '›')) record.button.textContent = on ? '‹' : '›';
    }
    function expansion() {
      var on = false;
      records.forEach(function (record) {
        if (record.path.isConnected !== false && opened.has(record.key)) on = true;
      });
      if (doc.body.classList.contains('projects-mobile-path-expanded') !== on) doc.body.classList.toggle('projects-mobile-path-expanded', on);
    }
    function add(path, cell, line, key) {
      var button = doc.createElement('button');
      button.type = 'button';
      button.className = 'projects-mobile-path-toggle';
      var record = { path: path, cell: cell, line: line, button: button, key: key };
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var on = !opened.has(record.key);
        if (on) opened.add(record.key); else opened.delete(record.key);
        expanded(record, on);
        expansion();
        line.scrollLeft = 0;
      });
      // The arrow stays outside the scrollable line; all original stage buttons stay in place.
      cell.insertBefore(button, line.nextSibling);
      cell.classList.add('projects-mobile-path-cell');
      records.set(path, record);
      return record;
    }
    function sync() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      if (destroyed) return;
      var body = doc.body;
      var active = body.classList.contains('mobile-client-ui') && body.classList.contains('projects-mode') && !body.classList.contains('avito-accounts-mode') && !!doc.querySelector('.projects-board');
      if (body.classList.contains('projects-mobile-paths') !== active) body.classList.toggle('projects-mobile-paths', active);
      if (!active) {
        clearWidth();
        records.forEach(function (record, path) { restore(path, record); });
        opened.clear();
        expansion();
        return;
      }
      var scope = typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY('avitolog_projects_zoom') : '';
      if (scope !== lastScope) opened.clear();
      lastScope = scope;
      records.forEach(function (record, path) {
        if (path.isConnected === false || path.closest('.proj-cell-editable') !== record.cell || record.line.parentNode !== record.cell) restore(path, record);
      });
      doc.querySelectorAll('.projects-board .proj-main-line > .project-path').forEach(function (path) {
        var line = path.parentNode, cell = line.closest('.proj-cell-editable');
        if (!cell || line.parentNode !== cell) return;
        var key = cell.getAttribute('data-id') || path;
        var record = records.get(path) || add(path, cell, line, key);
        record.key = key;
        expanded(record, opened.has(key));
      });
      expansion();
      fitClosedWidth();
    }
    function schedule() {
      if (!destroyed && frame === null) frame = win.requestAnimationFrame(sync);
    }
    function projectTree(node) {
      return !!(node && ((node.closest && node.closest('.projects-board')) || (node.querySelector && node.querySelector('.projects-board'))));
    }
    if (win.MutationObserver) {
      observer = new win.MutationObserver(function (changes) {
        if (changes.some(function (change) {
          return (change.type === 'attributes' && (change.target === doc.body || change.target.classList && change.target.classList.contains('projects-table'))) || (change.type === 'childList' && (projectTree(change.target) || Array.from(change.addedNodes || []).concat(Array.from(change.removedNodes || [])).some(projectTree)));
        })) schedule();
      });
      observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
    win.addEventListener('resize', schedule);
    sync();
    var controller = { sync: sync, destroy: function () {
      destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      win.removeEventListener('resize', schedule);
      records.forEach(function (record, path) { restore(path, record); });
      opened.clear();
      clearWidth();
      doc.body.classList.remove('projects-mobile-paths');
      doc.body.classList.remove('projects-mobile-path-expanded');
      delete win.__avitologMobileProjectPaths;
    } };
    win.__avitologMobileProjectPaths = controller;
    return controller;
  }
  return { install: install, collapsedWidth: collapsedWidth };
}));
