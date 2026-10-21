(function () {
  'use strict';
  if (window.AvitoChatReplies) return;
  var PREFIX = 'avitolog_chat_replies_v1:';
  var DEFAULTS = [
    { label: 'Приветствие', text: 'Здравствуйте! Чем можем помочь?' },
    { label: 'Уточнить задачу', text: 'Подскажите, пожалуйста, какая задача у вас сейчас?' },
    { label: 'Связаться', text: 'Как удобнее с вами связаться?' }
  ];

  function copy(items) { return items.map(function (item) { return { label: item.label, text: item.text }; }); }
  function valid(items) {
    return Array.isArray(items) && items.length <= 20 && items.every(function (item) {
      return item && typeof item === 'object' && typeof item.label === 'string' && typeof item.text === 'string' &&
        item.label.trim().length > 0 && item.label.length <= 40 && item.text.trim().length > 0 && item.text.length <= 1000 &&
        !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(item.label + item.text);
    });
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function button(text, label, action) {
    var node = el('button', '', text); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', action); return node;
  }
  function styles() {
    if (document.getElementById('avitoChatReplyStyles')) return;
    var style = el('style'); style.id = 'avitoChatReplyStyles';
    style.textContent = '.avchat-replies{flex:0 0 auto;padding:8px;border-top:1px solid #29485e;background:#0b1d2a;max-height:min(320px,45dvh);overflow:auto}.avchat-replies[hidden],.avchat-replies [hidden]{display:none!important}.avchat-replies-head,.avchat-replies-bar,.avchat-replies-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.avchat-replies-head strong{flex:1}.avchat-replies-head{margin-bottom:7px}.avchat-replies-bar button{background:#14524c;border-color:#247e70}.avchat-replies-hint,.avchat-replies-status{font-size:11px;color:#a3bfd2;margin:6px 0}.avchat-replies-status[data-error=true]{color:#ffb0a8}.avchat-replies-editor{display:grid;gap:8px}.avchat-replies-entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:7px;border:1px solid #29485e;border-radius:7px}.avchat-replies-entry input,.avchat-replies-entry textarea{min-width:0;box-sizing:border-box;width:100%}.avchat-replies-entry textarea{grid-column:1 / -1;min-height:65px;resize:vertical}.avchat-replies-actions button[data-action=save]{background:#155a48;border-color:#26836a}.avchat-replies-entry button{color:#ffb7ac}';
    document.head.appendChild(style);
  }

  function create(options) {
    if (!options || !options.container || typeof options.context !== 'function' || typeof options.send !== 'function') throw new TypeError('reply_options_required');
    styles();
    var host = options.container, root = el('section', 'avchat-replies'), head = el('div', 'avchat-replies-head');
    var bar = el('div', 'avchat-replies-bar'), editor = el('div', 'avchat-replies-editor'), status = el('p', 'avchat-replies-status');
    var activeScope = '', items = [], draft = [], draftScope = '', editing = false, sending = false, saving = false, viewGeneration = 0, enabled = true, destroyed = false;
    root.hidden = true; root.setAttribute('aria-label', 'Быстрые ответы Avito'); status.setAttribute('role', 'status');
    var editButton = button('✎ Изменить', 'Изменить быстрые ответы', beginEdit);
    head.appendChild(el('strong', '', '⚡ Быстрые ответы')); head.appendChild(editButton);
    head.appendChild(button('⌄', 'Закрыть быстрые ответы', function () { toggle(false); }));
    root.appendChild(head); root.appendChild(bar); root.appendChild(editor); root.appendChild(status); host.appendChild(root);

    function scope() { try { var value = options.context(); return typeof value === 'string' && value.trim() && value.length <= 2048 ? value : ''; } catch (_) { return ''; } }
    function notice(text, error) { status.textContent = text || ''; status.dataset.error = error ? 'true' : 'false'; }
    function key(value) { return PREFIX + encodeURIComponent(value); }
    function read(value) {
      if (!value) return [];
      try {
        var storage = window.AvitoChatStore;
        var raw = storage ? storage.getItem(key(value)) : localStorage.getItem(key(value));
        if (raw === null) return copy(DEFAULTS);
        if (raw.length > 32000) return copy(DEFAULTS);
        var saved = JSON.parse(raw);
        return saved && saved.version === 1 && valid(saved.items) ? copy(saved.items) : copy(DEFAULTS);
      } catch (_) { return copy(DEFAULTS); }
    }
    function canSend() {
      if (!enabled || sending || saving || destroyed || !activeScope || activeScope !== scope()) return false;
      try { return typeof options.canSend !== 'function' || options.canSend() === true; } catch (_) { return false; }
    }
    function controls() {
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (node) { node.disabled = !canSend(); });
      editButton.disabled = !activeScope || sending || saving;
      ['input', 'textarea', 'button'].forEach(function (tag) {
        Array.prototype.forEach.call(editor.querySelectorAll(tag), function (node) {
          node.disabled = saving || (node.dataset.action === 'add' && draft.length >= 20);
          if (node.dataset.action === 'save') node.textContent = saving ? 'Сохраняем…' : '💾 Сохранить';
        });
      });
    }
    function renderBar() {
      clear(bar);
      items.forEach(function (item) {
        var reply = button(item.label, 'Отправить быстрый ответ: ' + item.label, function () { sendReply(item); });
        reply.title = item.text; bar.appendChild(reply);
      });
      if (!items.length) bar.appendChild(el('span', 'avchat-replies-hint', activeScope ? 'Добавьте свои быстрые ответы.' : 'Войдите и выберите переписку.'));
      bar.hidden = editing; editor.hidden = !editing; controls();
    }
    function refresh() {
      if (destroyed) return;
      var next = scope();
      if (next !== activeScope) {
        viewGeneration += 1;
        activeScope = next; items = read(next); draft = []; draftScope = ''; editing = false; clear(editor); notice(''); renderBar();
      } else controls();
    }
    function toggle(force) {
      if (destroyed) return false;
      refresh(); root.hidden = typeof force === 'boolean' ? !force : !root.hidden;
      if (root.hidden && editing && !saving) { editing = false; draft = []; draftScope = ''; clear(editor); renderBar(); }
      return !root.hidden;
    }
    function expand(text) {
      var values = typeof options.variables === 'function' ? options.variables() : {};
      values = values && typeof values === 'object' ? values : {};
      return text.replace(/\{(имя|аккаунт|объявление)\}/g, function (_, name) {
        var value = values[name];
        return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 200) : '';
      });
    }
    async function sendReply(item) {
      if (activeScope !== scope()) { refresh(); return; }
      if (!canSend()) return;
      var capturedScope = activeScope, text;
      try { text = expand(item.text); } catch (_) { notice('Не удалось подготовить ответ.', true); return; }
      if (!text.trim() || text.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || capturedScope !== scope()) { notice('Проверьте текст и выбранную переписку (не более 1000 знаков).', true); return; }
      sending = true; controls(); notice('Отправляем…');
      try {
        // The caller must capture and validate the current chat before its first await.
        await options.send(text, { scope: capturedScope });
        if (!destroyed && capturedScope === scope() && activeScope === capturedScope) notice('Ответ отправлен.');
      } catch (error) {
        if (!destroyed && capturedScope === scope() && activeScope === capturedScope) {
          notice('Отправка не подтверждена. Сначала проверьте историю, прежде чем повторять.', true);
          if (typeof options.onError === 'function') { try { options.onError(error); } catch (_) {} }
        }
      } finally { sending = false; refresh(); }
    }
    function beginEdit() {
      refresh();
      if (!activeScope || sending || saving) return;
      draft = copy(items); draftScope = activeScope; editing = true; notice(''); renderEditor(); renderBar();
    }
    function renderEditor() {
      clear(editor);
      draft.forEach(function (item, index) {
        var row = el('div', 'avchat-replies-entry'), label = el('input'), text = el('textarea');
        label.value = item.label; label.maxLength = 40; label.placeholder = 'Название кнопки'; label.setAttribute('aria-label', 'Название ответа ' + (index + 1));
        text.value = item.text; text.maxLength = 1000; text.placeholder = 'Текст ответа'; text.setAttribute('aria-label', 'Текст ответа ' + (index + 1));
        label.addEventListener('input', function () { if (!saving) item.label = label.value; }); text.addEventListener('input', function () { if (!saving) item.text = text.value; });
        row.appendChild(label); row.appendChild(button('×', 'Удалить ответ ' + (index + 1), function () { if (!saving) { draft.splice(index, 1); renderEditor(); } })); row.appendChild(text); editor.appendChild(row);
      });
      editor.appendChild(el('p', 'avchat-replies-hint', 'Нажатие кнопки сразу отправляет ответ. Можно использовать {имя}, {аккаунт}, {объявление}. Изменения сохраняются только кнопкой «Сохранить».'));
      var actions = el('div', 'avchat-replies-actions');
      var add = button('＋ Добавить', 'Добавить быстрый ответ', function () { if (!saving && draft.length < 20) { draft.push({ label: '', text: '' }); renderEditor(); } }); add.dataset.action = 'add'; add.disabled = draft.length >= 20;
      var save = button('💾 Сохранить', 'Сохранить быстрые ответы', saveDraft); save.dataset.action = 'save';
      actions.appendChild(add); actions.appendChild(save); actions.appendChild(button('Отмена', 'Отменить изменения быстрых ответов', function () { if (!saving) { editing = false; draft = []; draftScope = ''; clear(editor); notice(''); renderBar(); } })); editor.appendChild(actions); controls();
    }
    async function saveDraft() {
      if (saving) return;
      if (destroyed || !draftScope || draftScope !== activeScope || draftScope !== scope()) { refresh(); return; }
      if (!valid(draft)) { notice('Не более 20 ответов. Название: 1–40 знаков, текст: 1–1000 знаков.', true); return; }
      var normalized = draft.map(function (item) { return { label: item.label.trim(), text: item.text.trim() }; });
      var capturedScope = draftScope, capturedGeneration = viewGeneration, committed = false;
      saving = true; controls(); notice('Сохраняем…');
      try {
        var storage = window.AvitoChatStore, raw = JSON.stringify({ version: 1, items: normalized });
        if (storage) await storage.setItem(key(capturedScope), raw);
        else localStorage.setItem(key(capturedScope), raw);
        committed = true;
        if (!destroyed && capturedGeneration === viewGeneration && capturedScope === activeScope && capturedScope === scope()) {
          items = normalized; draft = []; draftScope = ''; editing = false; clear(editor); renderBar(); notice('Быстрые ответы сохранены.');
        }
      } catch (_) {
        if (!destroyed && capturedGeneration === viewGeneration && capturedScope === activeScope && capturedScope === scope()) notice('Браузер не сохранил ответы. Проверьте доступ к хранилищу.', true);
      } finally {
        saving = false;
        if (!destroyed) {
          refresh();
          if (committed && capturedGeneration !== viewGeneration && capturedScope === activeScope && capturedScope === scope() && !editing) { items = read(activeScope); renderBar(); }
        }
      }
    }
    function reset() {
      viewGeneration += 1;
      root.hidden = true; activeScope = ''; items = []; draft = []; draftScope = ''; editing = false; clear(editor); notice(''); renderBar();
    }
    refresh();
    return {
      toggle: toggle, refresh: refresh, reset: reset,
      setEnabled: function (value) { enabled = value === true; refresh(); },
      destroy: function () { destroyed = true; if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  window.AvitoChatReplies = Object.freeze({ create: create });
})();
