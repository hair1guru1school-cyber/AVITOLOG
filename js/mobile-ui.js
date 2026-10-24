(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root, root.document);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function positive(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function metrics(viewport, fallbackHeight, headerHeight) {
    viewport = viewport || {};
    return {
      height: Math.round(positive(viewport.height, positive(fallbackHeight, 600))),
      top: Math.round(Math.max(0, Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0)),
      header: Math.round(Math.max(0, Number.isFinite(headerHeight) ? headerHeight : 0))
    };
  }

  function active(width, webMode) {
    return !webMode && typeof width === 'number' && width > 0 && width <= 768;
  }

  function keyboardTop(viewport, layoutHeight) {
    if (!viewport || positive(viewport.scale, 1) > 1.02 || positive(layoutHeight, 0) - positive(viewport.height, layoutHeight) < 120) return null;
    return Math.round(Math.max(0, Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0)) + 8;
  }

  function install(win, doc) {
    if (!win || !doc || win.__avitologMobileUI) return null;
    var frame = null, started = false, headerObserver = null, bodyObserver = null;
    var saveOriginal = null, saveBar = null, saveButton = null, saveObserver = null;
    var props = ['--mobile-visual-height', '--mobile-visual-offset-top', '--mobile-header-height', '--mobile-chat-keyboard-top'];
    var surface = doc.documentElement;

    function markKeyboard(visible) {
      if (surface && surface.classList) surface.classList.toggle('mobile-ui-keyboard-visible', visible);
    }

    function saveProxyClick() {
      if (!saveOriginal || !active(win.innerWidth, doc.body.classList.contains('mobile-webview-on')) || !doc.body.classList.contains('kp-mobile-editor') || saveOriginal.disabled || saveOriginal.isConnected === false) return;
      saveOriginal.click();
    }

    function syncSaveProxy() {
      var enabled = doc.body && doc.body.classList.contains('kp-mobile-editor') && active(win.innerWidth, doc.body.classList.contains('mobile-webview-on'));
      if (!saveBar && enabled && typeof doc.createElement === 'function' && typeof doc.getElementById === 'function' && typeof doc.body.appendChild === 'function') {
        saveOriginal = doc.getElementById('downloadBtn');
        if (!saveOriginal || typeof saveOriginal.click !== 'function') return;
        saveBar = doc.createElement('div');
        saveBar.className = 'mobile-kp-save-bar';
        saveButton = doc.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn gold mobile-kp-save-proxy';
        saveButton.addEventListener('click', saveProxyClick);
        saveBar.appendChild(saveButton);
        doc.body.appendChild(saveBar);
        if (win.MutationObserver) {
          saveObserver = new win.MutationObserver(syncSaveProxy);
          saveObserver.observe(saveOriginal, { attributes: true, attributeFilter: ['disabled', 'title'], childList: true, characterData: true, subtree: true });
        }
      }
      if (!saveBar || !saveButton) return;
      saveBar.hidden = !enabled;
      saveButton.disabled = !enabled || !!saveOriginal.disabled || saveOriginal.isConnected === false;
      var text = String(saveOriginal.textContent || '').trim() || 'Сохранить КП';
      if (saveButton.textContent !== text) saveButton.textContent = text;
      var title = String(saveOriginal.title || text);
      if (saveButton.title !== title) saveButton.title = title;
    }

    function update() {
      frame = null;
      if (!doc.body || !surface) return;
      syncSaveProxy();
      if (!active(win.innerWidth, doc.body.classList.contains('mobile-webview-on'))) {
        props.forEach(function (prop) { surface.style.removeProperty(prop); });
        markKeyboard(false);
        return;
      }
      var header = doc.querySelector('#mainApp > header');
      var values = metrics(win.visualViewport, win.innerHeight, header ? header.getBoundingClientRect().height : 0);
      surface.style.setProperty(props[0], values.height + 'px');
      surface.style.setProperty(props[1], values.top + 'px');
      surface.style.setProperty(props[2], values.header + 'px');
      var chatTop = keyboardTop(win.visualViewport, win.innerHeight);
      if (chatTop === null) surface.style.removeProperty(props[3]);
      else surface.style.setProperty(props[3], chatTop + 'px');
      markKeyboard(chatTop !== null);
    }

    function schedule() {
      if (frame !== null) return;
      frame = win.requestAnimationFrame(update);
    }

    function start() {
      if (started || !doc.body) return;
      started = true;
      var header = doc.querySelector('#mainApp > header');
      if (header && win.ResizeObserver) {
        headerObserver = new win.ResizeObserver(schedule);
        headerObserver.observe(header);
      }
      if (win.MutationObserver) {
        bodyObserver = new win.MutationObserver(schedule);
        bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
      }
      win.addEventListener('resize', schedule);
      win.addEventListener('orientationchange', schedule);
      if (win.visualViewport) {
        win.visualViewport.addEventListener('resize', schedule);
        win.visualViewport.addEventListener('scroll', schedule);
      }
      update();
    }

    function destroy() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      if (headerObserver) headerObserver.disconnect();
      if (bodyObserver) bodyObserver.disconnect();
      if (saveObserver) saveObserver.disconnect();
      if (saveButton) saveButton.removeEventListener('click', saveProxyClick);
      if (saveBar && saveBar.parentNode) saveBar.parentNode.removeChild(saveBar);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('orientationchange', schedule);
      if (win.visualViewport) {
        win.visualViewport.removeEventListener('resize', schedule);
        win.visualViewport.removeEventListener('scroll', schedule);
      }
      doc.removeEventListener('DOMContentLoaded', start);
      props.forEach(function (prop) { if (surface) surface.style.removeProperty(prop); });
      markKeyboard(false);
      delete win.__avitologMobileUI;
    }

    var controller = { update: schedule, destroy: destroy };
    win.__avitologMobileUI = controller;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    return controller;
  }

  return { active: active, metrics: metrics, keyboardTop: keyboardTop, install: install };
});
