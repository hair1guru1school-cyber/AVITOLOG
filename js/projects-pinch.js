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

  function install(win, doc) {
    if (!win || !doc || win.__avitologProjectsPinch) return null;
    var gesture = null, blocked = false, suppressUntil = 0, frame = null, status = null, statusTimer = null;
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
      doc.removeEventListener('touchstart', start, options); doc.removeEventListener('touchmove', move, options);
      doc.removeEventListener('touchend', end, options); doc.removeEventListener('touchcancel', end, options);
      doc.removeEventListener('click', click, true);
      delete win.__avitologProjectsPinch;
    } };
    win.__avitologProjectsPinch = controller;
    return controller;
  }
  return { zoomFor: zoomFor, sizeFor: sizeFor, install: install };
}));
