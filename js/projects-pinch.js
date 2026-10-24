(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root, root.document);
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function bounded(value) { var n = Number(value); return Math.max(.25, Math.min(2, Number.isFinite(n) ? n : 1)); }
  function zoomFor(base, startDistance, nextDistance) {
    return Number.isFinite(startDistance) && startDistance > 0 && Number.isFinite(nextDistance) && nextDistance >= 0 ? bounded(bounded(base) * nextDistance / startDistance) : bounded(base);
  }
  function sizeFor(scale) {
    var size = (scale < 1 ? 100 / bounded(scale) : 100) + '%';
    return { width: size, height: size };
  }
  function point(touches) {
    var a = touches[0], b = touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  }

  function transformScale(node) {
    var transform = String(node && node.style && node.style.transform || '');
    var scale = transform.match(/scale(?:3d)?\(\s*([\d.]+)/);
    var matrix = transform.match(/matrix\(\s*([\d.]+)/);
    var value = Number(scale ? scale[1] : matrix ? matrix[1] : 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  function effectiveScale(app, board) {
    return Math.max(.05, Math.min(4, transformScale(app) * transformScale(board)));
  }
  function phoneViewport(win) {
    return win.innerWidth <= 768 || (win.innerWidth <= 980 && win.innerWidth > win.innerHeight && win.innerHeight <= 560);
  }

  // These are only mirrors and layout wrappers; original inputs and action nodes keep their handlers.
  function installReadability(win, doc) {
    if (!doc.querySelector || !doc.querySelectorAll || !win.addEventListener || !doc.body.classList.toggle) return null;
    var records = new Map(), frame = null, observer = null, destroyed = false;
    function restore(input, record) {
      if (record.actions.parentNode) {
        while (record.actions.firstChild) record.parent.insertBefore(record.actions.firstChild, record.actions);
        record.actions.parentNode.removeChild(record.actions);
      }
      if (record.mirror.parentNode) record.mirror.parentNode.removeChild(record.mirror);
      records.delete(input);
    }
    function sync() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      if (destroyed) return;
      var body = doc.body, board = doc.querySelector('.projects-board');
      var active = phoneViewport(win) && body.classList.contains('projects-mode') && !body.classList.contains('avito-accounts-mode') && !!board;
      if (body.classList.contains('projects-mobile-readable') !== active) body.classList.toggle('projects-mobile-readable', active);
      if (!active) {
        records.forEach(function (record, input) { restore(input, record); });
        if (body.style.getPropertyValue('--projects-mobile-scale')) body.style.removeProperty('--projects-mobile-scale');
        if (body.style.getPropertyValue('--projects-mobile-app-scale')) body.style.removeProperty('--projects-mobile-app-scale');
        if (body.style.getPropertyValue('--projects-mobile-day-width')) body.style.removeProperty('--projects-mobile-day-width');
        return;
      }
      var app = doc.querySelector('#mainApp'), scale = String(effectiveScale(app, board));
      if (body.style.getPropertyValue('--projects-mobile-scale') !== scale) body.style.setProperty('--projects-mobile-scale', scale);
      var appScale = String(transformScale(app));
      if (body.style.getPropertyValue('--projects-mobile-app-scale') !== appScale) body.style.setProperty('--projects-mobile-app-scale', appScale);
      var firstDay = board.querySelector('.projects-cal-day'), dayWidth = parseFloat(firstDay && firstDay.style.width) || 28;
      var dayValue = Math.max(1, dayWidth) + 'px';
      if (body.style.getPropertyValue('--projects-mobile-day-width') !== dayValue) body.style.setProperty('--projects-mobile-day-width', dayValue);
      records.forEach(function (record, input) {
        if (input.isConnected === false || input.parentNode !== record.parent) restore(input, record);
      });
      board.querySelectorAll('.proj-main-line > input').forEach(function (input) {
        var parent = input.parentNode, record = records.get(input);
        if (!record) {
          var mirror = doc.createElement('span'), actions = doc.createElement('div');
          mirror.className = 'projects-mobile-title'; mirror.setAttribute('aria-hidden', 'true');
          actions.className = 'projects-mobile-actions';
          var buttons = Array.from(parent.children).filter(function (node) {
            return node !== input && !node.classList.contains('proj-emoji-btn') && !node.classList.contains('field-expand-btn');
          });
          parent.insertBefore(mirror, input.nextSibling);
          parent.appendChild(actions);
          buttons.forEach(function (node) { actions.appendChild(node); });
          record = { parent: parent, mirror: mirror, actions: actions };
          records.set(input, record);
        }
        var name = String(input.value || '');
        if (record.mirror.textContent !== name) record.mirror.textContent = name;
        if (record.mirror.title !== name) record.mirror.title = name;
      });
    }
    function schedule() {
      if (!destroyed && frame === null) frame = win.requestAnimationFrame(sync);
    }
    function projectTree(node) {
      return !!(node && ((node.closest && node.closest('.projects-board')) || (node.querySelector && node.querySelector('.projects-board'))));
    }
    function mutations(changes) {
      if (changes.some(function (change) {
        if (change.target === doc.body && change.type === 'attributes') return change.attributeName === 'class';
        if (change.target && change.target.id === 'mainApp' && change.type === 'attributes') return true;
        if (change.target && change.target.closest && change.target.closest('.projects-board')) return true;
        return change.type === 'childList' && Array.from(change.addedNodes || []).concat(Array.from(change.removedNodes || [])).some(projectTree);
      })) schedule();
    }
    if (win.MutationObserver) {
      observer = new win.MutationObserver(mutations);
      observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'readonly', 'value'] });
    }
    win.addEventListener('resize', schedule);
    doc.addEventListener('input', schedule, true);
    doc.addEventListener('change', schedule, true);
    sync();
    return { sync: sync, destroy: function () {
      destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      win.removeEventListener('resize', schedule);
      doc.removeEventListener('input', schedule, true); doc.removeEventListener('change', schedule, true);
      records.forEach(function (record, input) { restore(input, record); });
      doc.body.classList.toggle('projects-mobile-readable', false);
      doc.body.style.removeProperty('--projects-mobile-scale');
      doc.body.style.removeProperty('--projects-mobile-app-scale');
      doc.body.style.removeProperty('--projects-mobile-day-width');
    } };
  }

  function install(win, doc) {
    if (!win || !doc || win.__avitologProjectsPinch) return null;
    var gesture = null, blocked = false, suppressUntil = 0, frame = null, status = null, statusTimer = null;
    var readability = installReadability(win, doc);
    var options = { capture: true, passive: false };
    function scope() { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY('avitolog_projects_zoom') : 'avitolog_projects_zoom'; }
    function projectMode() { return doc.body && doc.body.classList.contains('projects-mode') && !doc.body.classList.contains('avito-accounts-mode'); }
    function scaleOf(board) {
      var match = String(board.style.transform || '').match(/scale\(\s*([\d.]+)/);
      return bounded(match ? Number(match[1]) : typeof win.getSavedProjectsZoom === 'function' ? win.getSavedProjectsZoom() : 1);
    }
    function prevent(event) { if (event.cancelable) event.preventDefault(); }
    function eligible(target) {
      return target && typeof target.closest === 'function' &&
        !target.closest('input:not([readonly]),textarea,select,[contenteditable="true"],.proj-row-drag-handle,.projects-sticky-resize-grip,.projects-account-resize');
    }
    function valid(g) { return g && g.board.isConnected !== false && projectMode() && g.scope === scope(); }
    function feedback(scale, saved) {
      if (!status) {
        status = doc.createElement('output'); status.className = 'projects-pinch-status';
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        doc.body.appendChild(status);
      }
      if (statusTimer !== null) win.clearTimeout(statusTimer);
      status.hidden = false;
      status.textContent = 'Масштаб ' + Math.round(scale * 100) + '%' + (saved === false ? ' · только в этой вкладке' : '');
      statusTimer = win.setTimeout(function () { status.hidden = true; }, saved === false ? 5000 : 1600);
    }
    function apply(g, scale, center) {
      var size = sizeFor(scale);
      g.board.style.transform = 'scale(' + scale + ')';
      g.board.style.width = size.width; g.board.style.height = size.height;
      g.board.classList.toggle('projects-fit-rows', scale < 1);
      if (readability) readability.sync();
      var rect = g.wrap.getBoundingClientRect();
      var physicalScale = rect.width / g.wrap.offsetWidth || scale;
      g.wrap.scrollLeft = Math.max(0, g.anchorX - (center.x - rect.left) / physicalScale);
      g.wrap.scrollTop = Math.max(0, g.anchorY - (center.y - rect.top) / physicalScale);
      g.scale = scale;
    }
    function flush() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      if (valid(gesture) && gesture.next) {
        apply(gesture, gesture.next.scale, gesture.next.center);
        gesture.next = null;
      }
    }
    function start(event) {
      if (blocked || !projectMode() || !event.touches || event.touches.length !== 2 || !eligible(event.target)) return;
      if (win._ptrRowDrag || win._calendarPaintMode) return;
      var board = event.target.closest('.projects-board');
      if (!board) return;
      for (var i = 0; i < 2; i++) {
        var origin = event.touches[i].target;
        if (origin && (!eligible(origin) || origin.closest('.projects-board') !== board)) return;
      }
      var wrap = board.querySelector('.projects-table-wrap'), center = point(event.touches);
      if (!wrap || center.distance < 8) return;
      var rect = wrap.getBoundingClientRect(), scale = scaleOf(board);
      var physicalScale = rect.width / wrap.offsetWidth || scale;
      gesture = { board: board, wrap: wrap, base: scale, scale: scale, scope: scope(), distance: center.distance,
        left: wrap.scrollLeft, top: wrap.scrollTop, center: center,
        anchorX: wrap.scrollLeft + (center.x - rect.left) / physicalScale,
        anchorY: wrap.scrollTop + (center.y - rect.top) / physicalScale,
        original: { transform: board.style.transform, width: board.style.width, height: board.style.height, fit: board.classList.contains('projects-fit-rows') } };
      blocked = true; prevent(event);
    }
    function move(event) {
      if (!blocked) return;
      prevent(event);
      if (!valid(gesture) || !event.touches || event.touches.length !== 2) return;
      var center = point(event.touches);
      gesture.next = { scale: zoomFor(gesture.base, gesture.distance, center.distance), center: center };
      if (frame === null) frame = win.requestAnimationFrame(function () { frame = null; flush(); });
    }
    function end(event) {
      if (!blocked) return;
      prevent(event);
      if (gesture && (event.type === 'touchcancel' || !event.touches || event.touches.length < 2)) {
        flush();
        var g = gesture;
        if (valid(g)) {
          if (event.type === 'touchcancel') {
            g.board.style.transform = g.original.transform; g.board.style.width = g.original.width; g.board.style.height = g.original.height;
            g.board.classList.toggle('projects-fit-rows', g.original.fit);
            g.wrap.scrollLeft = g.left; g.wrap.scrollTop = g.top;
          } else {
            var saved = false;
            try {
              if (typeof win.saveProjectsZoom === 'function' && (!win.PROJECTS_ZOOM_KEY || win.PROJECTS_ZOOM_KEY === g.scope)) {
                saved = win.saveProjectsZoom(g.scale) !== false;
              }
            } catch (_) {}
            // Keep the expanded rail even when persistence is unavailable.
            var size = sizeFor(g.scale); g.board.style.width = size.width; g.board.style.height = size.height;
            feedback(g.scale, saved);
          }
        }
        gesture = null;
      }
      suppressUntil = Date.now() + 400;
      if (!event.touches || event.touches.length === 0) blocked = false;
    }
    function click(event) {
      if ((blocked || Date.now() < suppressUntil) && event.target && event.target.closest && event.target.closest('.projects-board')) {
        prevent(event); event.stopImmediatePropagation();
      }
    }
    doc.addEventListener('touchstart', start, options); doc.addEventListener('touchmove', move, options);
    doc.addEventListener('touchend', end, options); doc.addEventListener('touchcancel', end, options);
    doc.addEventListener('click', click, true);
    var controller = { destroy: function () {
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (statusTimer !== null) win.clearTimeout(statusTimer);
      if (status && status.parentNode) status.parentNode.removeChild(status);
      if (readability) readability.destroy();
      doc.removeEventListener('touchstart', start, options); doc.removeEventListener('touchmove', move, options);
      doc.removeEventListener('touchend', end, options); doc.removeEventListener('touchcancel', end, options);
      doc.removeEventListener('click', click, true);
      delete win.__avitologProjectsPinch;
    } };
    win.__avitologProjectsPinch = controller;
    return controller;
  }
  return { zoomFor: zoomFor, sizeFor: sizeFor, effectiveScale: effectiveScale, installReadability: installReadability, install: install };
}));
