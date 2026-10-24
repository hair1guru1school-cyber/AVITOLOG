(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) {
    root.AvitoMobileAccountsView = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.install(root, root.document); }, { once: true });
    else api.install(root, root.document);
  }
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'accounts_mobile_scale_v1';
  var QUERY = '(max-width: 768px), (max-width: 980px) and (max-height: 560px) and (orientation: landscape)';
  var MIN_SCALE = .2;
  var MAX_SCALE = 1.25;

  function normalize(value) {
    var number = value == null || value === '' ? 1 : Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, number)) * 20) / 20;
  }

  function zoomFor(base, startDistance, nextDistance) {
    if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(nextDistance) || nextDistance < 0) return normalize(base);
    return normalize(normalize(base) * nextDistance / startDistance);
  }

  function read(storage) {
    try { return normalize(storage && storage.getItem(KEY)); }
    catch (_) { return 1; }
  }

  function write(storage, value) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(KEY, String(normalize(value)));
      return true;
    } catch (_) { return false; }
  }

  function installPinch(win, doc, view) {
    if (!doc.addEventListener || !doc.body || !doc.body.classList || !view) return null;
    var gesture = null, blocked = false, frame = null, suppressedWrap = null, suppressUntil = 0;
    var options = { capture: true, passive: false };
    var tableSelector = '.account-section > .table-scroll';
    var interactiveSelector = 'input:not([readonly]), textarea, select, button, a, summary, [contenteditable="true"], .account-row-handle, [role="separator"], .avb-dialog';
    function prevent(event) { if (event.cancelable) event.preventDefault(); }
    function eligible(target) { return target && typeof target.closest === 'function' && !target.closest(interactiveSelector); }
    function centerOf(touches) {
      var a = touches[0], b = touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    }
    function valid(g) { return g && g.wrap.isConnected !== false && view.enabled(); }
    function apply(g, scale, center) {
      view.paint(scale, false);
      var rect = g.wrap.getBoundingClientRect();
      var physicalScale = rect.width / g.wrap.offsetWidth || 1;
      // CSS zoom scales the content, not its scroll container; keep the touched point anchored.
      g.wrap.scrollLeft = Math.max(0, g.anchorX * scale - (center.x - rect.left) / physicalScale);
      g.wrap.scrollTop = Math.max(0, g.anchorY * scale - (center.y - rect.top) / physicalScale);
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
      if (blocked || !view.enabled() || !event.touches || event.touches.length !== 2 || !eligible(event.target)) return;
      var wrap = event.target.closest(tableSelector);
      if (!wrap) return;
      for (var i = 0; i < 2; i++) {
        var origin = event.touches[i].target;
        if (origin && (!eligible(origin) || origin.closest(tableSelector) !== wrap)) return;
      }
      var center = centerOf(event.touches);
      if (center.distance < 8) return;
      var rect = wrap.getBoundingClientRect(), base = view.getScale();
      var physicalScale = rect.width / wrap.offsetWidth || 1;
      gesture = { wrap: wrap, base: base, scale: base, distance: center.distance, left: wrap.scrollLeft, top: wrap.scrollTop,
        anchorX: (wrap.scrollLeft + (center.x - rect.left) / physicalScale) / base,
        anchorY: (wrap.scrollTop + (center.y - rect.top) / physicalScale) / base };
      suppressedWrap = wrap;
      blocked = true;
      prevent(event);
    }
    function move(event) {
      if (!blocked) return;
      prevent(event);
      if (!valid(gesture) || !event.touches || event.touches.length !== 2) return;
      var center = centerOf(event.touches);
      gesture.next = { scale: zoomFor(gesture.base, gesture.distance, center.distance), center: center };
      if (frame === null) {
        if (typeof win.requestAnimationFrame === 'function') frame = win.requestAnimationFrame(function () { frame = null; flush(); });
        else flush();
      }
    }
    function end(event) {
      if (!blocked) return;
      prevent(event);
      if (gesture && (event.type === 'touchcancel' || !event.touches || event.touches.length < 2)) {
        flush();
        var g = gesture;
        if (valid(g)) {
          if (event.type === 'touchcancel') {
            view.paint(g.base, false);
            g.wrap.scrollLeft = g.left;
            g.wrap.scrollTop = g.top;
          } else view.paint(g.scale, true);
        }
        suppressedWrap = g.wrap;
        gesture = null;
      }
      suppressUntil = Date.now() + 400;
      if (!event.touches || event.touches.length === 0) blocked = false;
    }
    function click(event) {
      if ((blocked || Date.now() < suppressUntil) && event.target && event.target.closest && event.target.closest(tableSelector) === suppressedWrap) {
        prevent(event);
        event.stopImmediatePropagation();
      }
    }
    doc.body.classList.toggle('accounts-table-pinch-on', true);
    doc.addEventListener('touchstart', start, options);
    doc.addEventListener('touchmove', move, options);
    doc.addEventListener('touchend', end, options);
    doc.addEventListener('touchcancel', end, options);
    doc.addEventListener('click', click, true);
    return { destroy: function () {
      if (frame !== null) win.cancelAnimationFrame(frame);
      doc.body.classList.toggle('accounts-table-pinch-on', false);
      doc.removeEventListener('touchstart', start, options);
      doc.removeEventListener('touchmove', move, options);
      doc.removeEventListener('touchend', end, options);
      doc.removeEventListener('touchcancel', end, options);
      doc.removeEventListener('click', click, true);
    } };
  }

  function install(win, doc) {
    var strip = doc.querySelector('.accounts-status-strip');
    var settings = doc.querySelector('#accountTableSettings .table-settings-content');
    if (!strip || !settings || doc.getElementById('accountsMobileScaleControls')) return null;
    var storage;
    try { storage = win.localStorage; } catch (_) { storage = null; }
    var value = read(storage);
    var query = typeof win.matchMedia === 'function' ? win.matchMedia(QUERY) : null;

    function syncNames() {
      if (typeof doc.querySelectorAll !== 'function') return;
      doc.querySelectorAll('.account-name-input').forEach(function (input) {
        var parent = input.parentElement;
        if (!parent) return;
        var mirror = parent.querySelector('.accounts-mobile-name');
        if (!mirror) {
          mirror = doc.createElement('span');
          mirror.className = 'accounts-mobile-name';
          mirror.setAttribute('aria-hidden', 'true');
          parent.appendChild(mirror);
        }
        if (mirror.textContent !== input.value) mirror.textContent = input.value;
      });
    }
    var grid = doc.getElementById('accountsGrid');
    if (grid) {
      grid.addEventListener('input', syncNames);
      if (win.MutationObserver) {
        var namesObserver = new win.MutationObserver(syncNames);
        namesObserver.observe(grid, { childList: true, subtree: true });
      }
    }
    syncNames();

    function node(tag, className, text) {
      var result = doc.createElement(tag);
      if (className) result.className = className;
      if (text) result.textContent = text;
      return result;
    }

    var controls = node('span', 'accounts-mobile-scale');
    controls.id = 'accountsMobileScaleControls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Масштаб таблицы аккаунтов');
    function button(label, text) {
      var result = node('button', 'button', text);
      result.type = 'button';
      result.setAttribute('aria-label', label);
      result.title = label;
      controls.appendChild(result);
      return result;
    }
    var smaller = button('Уменьшить таблицу аккаунтов', '-');
    var reset = button('Сбросить масштаб таблицы до 100%', '100%');
    var larger = button('Увеличить таблицу аккаунтов', '+');
    var status = node('span', 'accounts-mobile-scale-status visually-hidden');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    controls.appendChild(status);
    strip.appendChild(controls);

    var scaleSettings = node('div', 'accounts-mobile-scale-settings');
    var label = node('label');
    var caption = node('span', '', 'Масштаб таблицы');
    var output = node('output');
    caption.appendChild(output);
    label.appendChild(caption);
    var range = node('input');
    range.type = 'range';
    range.min = String(MIN_SCALE * 100);
    range.max = '125';
    range.step = '5';
    range.setAttribute('aria-label', 'Масштаб таблицы аккаунтов, проценты');
    label.appendChild(range);
    scaleSettings.appendChild(label);
    scaleSettings.appendChild(node('p', 'small', '20–125%. Таблица листается пальцем в обе стороны; двумя пальцами меняется только её масштаб.'));
    settings.appendChild(scaleSettings);

    function paint(next, persist) {
      value = normalize(next);
      var percent = Math.round(value * 100);
      doc.documentElement.style.setProperty('--accounts-table-scale', String(value));
      range.value = String(percent);
      range.setAttribute('aria-valuetext', percent + '%');
      output.textContent = percent + '%';
      reset.textContent = percent + '%';
      smaller.disabled = value <= MIN_SCALE;
      larger.disabled = value >= MAX_SCALE;
      if (persist) {
        var saved = write(storage, value);
        status.textContent = saved ? 'Масштаб сохранён: ' + percent + '%' : 'Масштаб изменён, но не сохранён: хранилище браузера недоступно или заполнено.';
        status.classList.toggle('visually-hidden', saved);
        status.dataset.tone = saved ? 'ready' : 'warning';
      }
    }

    function applyVisibility() {
      var enabled = query ? query.matches : win.innerWidth <= 768 || win.innerWidth <= 980 && win.innerHeight <= 560 && win.innerWidth > win.innerHeight;
      if (doc.body && doc.body.classList.contains('mobile-webview-on')) enabled = false;
      if (doc.body && typeof doc.body.classList.toggle === 'function') doc.body.classList.toggle('accounts-mobile-compact', enabled);
      controls.hidden = !enabled;
      scaleSettings.hidden = !enabled;
    }
    smaller.addEventListener('click', function () { paint(value - .05, true); });
    larger.addEventListener('click', function () { paint(value + .05, true); });
    reset.addEventListener('click', function () { paint(1, true); });
    range.addEventListener('input', function () { paint(Number(range.value) / 100, false); });
    range.addEventListener('change', function () { paint(Number(range.value) / 100, true); });
    if (query && query.addEventListener) query.addEventListener('change', applyVisibility);
    else if (query && query.addListener) query.addListener(applyVisibility);
    else win.addEventListener('resize', applyVisibility);
    paint(value, false);
    applyVisibility();
    installPinch(win, doc, { enabled: function () { return !controls.hidden; }, getScale: function () { return value; }, paint: paint });
    return { setScale: function (next) { paint(next, true); }, getScale: function () { return value; } };
  }

  return { key: KEY, query: QUERY, normalize: normalize, zoomFor: zoomFor, read: read, write: write, installPinch: installPinch, install: install };
}));
