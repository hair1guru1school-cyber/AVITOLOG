(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root, root.document);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var KEY = '__avitologMobileClientUI';
  var MODES = ['projects-mode', 'goals-mode', 'agency-mode', 'strategy-mode', 'assets-mode', 'ads-mode', 'tasks-mode', 'avito-accounts-mode'];
  var TOOLS = ['tab-kp', 'tab-analysis', 'tab-presale', 'tab-avito1', 'tab-contract', 'tab-scripts'];

  function isMobile(width, height) {
    return width > 0 && height > 0 && (width <= 768 || (width <= 980 && height <= 560 && width > height));
  }

  function isClient(classes) {
    return !MODES.some(function (name) { return classes.contains(name); });
  }

  function install(win, doc) {
    if (win[KEY]) return win[KEY];
    var account = null, tools = [], rail = null, observer = null, frame = null, stopped = false;
    var zoom = null, zoomApp = null;
    var request = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : win.setTimeout.bind(win);
    var cancel = win.cancelAnimationFrame ? win.cancelAnimationFrame.bind(win) : win.clearTimeout.bind(win);

    function setClass(name, enabled) {
      if (doc.body.classList.contains(name) !== enabled) doc.body.classList.toggle(name, enabled);
    }

    function remember(node) {
      var anchor = doc.createComment('mobile client original position');
      node.parentNode.insertBefore(anchor, node);
      return { node: node, anchor: anchor };
    }

    function restore(record) {
      if (!record) return;
      // A remounted profile owns its new controls; never bring detached old nodes back.
      var current = record.node.id ? doc.getElementById(record.node.id) : doc.querySelector('.project-card-account-field');
      if (record.anchor.isConnected && (!current || current === record.node) && record.anchor.nextSibling !== record.node) {
        record.anchor.parentNode.insertBefore(record.node, record.anchor.nextSibling);
      }
      if (record.anchor.parentNode) record.anchor.parentNode.removeChild(record.anchor);
    }

    function restoreTools() {
      tools.forEach(restore);
      tools = [];
      if (rail && rail.hidden !== true) rail.hidden = true;
    }

    function syncZoom(mobile) {
      var app = doc.getElementById('mainApp');
      if (observer && app && app !== zoomApp) {
        observer.observe(app, { attributes: true, attributeFilter: ['style', 'hidden'] });
        zoomApp = app;
      }
      var node = doc.getElementById('mobileWebviewControls');
      if (zoom && (zoom.node !== node || !zoom.anchor.isConnected)) {
        if (!zoom.anchor.isConnected && zoom.node.parentNode === doc.body) doc.body.removeChild(zoom.node);
        restore(zoom);
        zoom = null;
        node = doc.getElementById('mobileWebviewControls');
      }
      if (mobile && app && !app.hidden && app.style.display !== 'none' && node) {
        if (!zoom) zoom = remember(node);
        if (node.parentNode !== doc.body) doc.body.appendChild(node);
      } else if (zoom) {
        restore(zoom);
        zoom = null;
      }
    }

    function update() {
      frame = null;
      if (stopped || !doc.body) return;
      var mobile = isMobile(win.innerWidth, win.innerHeight);
      syncZoom(mobile);
      setClass('mobile-client-ui', mobile);
      var client = isClient(doc.body.classList);
      var kp = client && doc.body.classList.contains('kp-tab');
      setClass('kp-client-view', kp);

      var field = doc.querySelector('.project-card-account-field');
      if (account && (account.node !== field || !account.anchor.isConnected)) {
        restore(account);
        account = null;
      }
      var crm = doc.querySelector('.crm-row');
      if (mobile && field && crm && field.parentNode === crm.parentNode) {
        if (!account) account = remember(field);
        if (field.nextSibling !== crm) crm.parentNode.insertBefore(field, crm);
      } else if (account) {
        restore(account);
        account = null;
      }

      if (rail && !rail.isConnected) restoreTools();
      var top = doc.getElementById('analyticsTopRow');
      var panel = doc.getElementById('rightPanelWrap');
      var buttons = TOOLS.map(function (id, i) {
        var original = panel && panel.querySelector('#' + id);
        return original || (tools[i] && tools[i].anchor.isConnected && tools[i].node.isConnected ? tools[i].node : null);
      });
      if (tools.length && tools.some(function (record, i) { return record.node !== buttons[i] || !record.anchor.isConnected; })) {
        tools.forEach(function (record, i) {
          if (!record.anchor.isConnected && record.node.parentNode === rail) rail.removeChild(record.node);
        });
        restoreTools();
      }
      var enabled = mobile && client && !!top && buttons.every(function (button) { return !!button; });
      if (enabled) {
        if (!rail || !rail.isConnected) {
          restoreTools();
          rail = doc.createElement('nav');
          rail.id = 'mobileClientTools';
          rail.setAttribute('aria-label', '\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b \u043a\u043b\u0438\u0435\u043d\u0442\u0430');
        }
        var parent = kp ? doc.body : top.parentNode;
        if (rail.parentNode !== parent || (!kp && top.nextSibling !== rail)) parent.insertBefore(rail, kp ? null : top.nextSibling);
        if (!tools.length) tools = buttons.map(remember);
        buttons.forEach(function (button, i) {
          if (rail.children[i] !== button) rail.insertBefore(button, rail.children[i] || null);
        });
        if (rail.hidden) rail.hidden = false;
      } else restoreTools();
      setClass('mobile-client-tools-on', enabled);
    }

    function schedule() {
      if (!stopped && frame === null) frame = request(update);
    }

    function start() {
      if (stopped || !doc.body) return;
      if (win.MutationObserver && !observer) {
        observer = new win.MutationObserver(function (records) {
          if (records.some(function (record) { return record.type === 'childList' || record.target === doc.body || record.target === zoomApp; })) schedule();
        });
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }
      update();
    }

    function destroy() {
      stopped = true;
      if (observer) observer.disconnect();
      if (frame !== null) cancel(frame);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('orientationchange', schedule);
      doc.removeEventListener('DOMContentLoaded', start);
      restoreTools();
      restore(account);
      restore(zoom);
      if (rail && rail.parentNode) rail.parentNode.removeChild(rail);
      if (doc.body) {
        setClass('mobile-client-ui', false);
        setClass('mobile-client-tools-on', false);
        setClass('kp-client-view', false);
      }
      delete win[KEY];
    }

    var controller = { update: update, destroy: destroy };
    win[KEY] = controller;
    win.addEventListener('resize', schedule);
    win.addEventListener('orientationchange', schedule);
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
    return controller;
  }

  return { isMobile: isMobile, isClient: isClient, install: install };
});
