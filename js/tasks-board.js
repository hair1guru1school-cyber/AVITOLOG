(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (!root.TasksBoard) root.TasksBoard = api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function text(value) { return value == null ? '' : String(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function taskKey(source, id) { return source + ':' + text(id); }
  function synthetic(name) { return name ? 'crm_' + encodeURIComponent(name.toLowerCase()).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16); }) : 'crm_no_project'; }
  function columnForCrm(task, projects) {
    if (task.projectId) return projects.some(function (p) { return text(p.id) === text(task.projectId); }) ? text(task.projectId) : synthetic(text(task.project).trim());
    var name = text(task.project).trim(), matches = projects.filter(function (p) { return text(p.title).trim().toLowerCase() === name.toLowerCase(); });
    return name && matches.length === 1 ? text(matches[0].id) : synthetic(name);
  }
  function normalizeSettings(value) {
    value = value || {};
    return { skin: value.skin !== false, opacity: Number.isFinite(Number(value.opacity)) && value.opacity !== null ? Math.max(8, Math.min(80, Math.round(Number(value.opacity)))) : 30, pattern: value.pattern !== false };
  }
  function emoji(value) {
    var raw = text(value).replace(/&#(x[0-9a-f]+|\d+);/gi, function (_, number) { var n = number.charAt(0).toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }).trim();
    if (!raw || raw.length > 32 || /[A-Za-zА-Яа-яЁё<>]/.test(raw) || !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(raw)) return '';
    return typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(raw))[0].segment : Array.from(raw).slice(0, 4).join('');
  }
  function emojiForTask(task) {
    var own = emoji(task && task.emoji); if (own) return own;
    var title = text(task && task.title) + ' ' + text(task && task.type);
    var rules = [['дизайн|баннер|визуал', '🎨'], ['текст|заголов|описан', '📝'], ['звон|созвон|телефон', '📞'], ['оплат|сч[её]т|money', '💰'], ['аналити|статист|отч[её]т', '📊'], ['автозагруз|excel|autoload', '📦'], ['бриф', '📋'], ['объявлен|публикац', '📣'], ['клиент|согласова|отправ', '💬'], ['сроч|urgent', '⚡']];
    return (rules.find(function (rule) { return new RegExp(rule[0], 'i').test(title); }) || ['', '📝'])[1];
  }
  function unique(list) { return Array.from(new Set(list)); }
  function reorder(order, from, to, after) {
    if (!Array.isArray(order) || order.indexOf(from) < 0 || to && order.indexOf(to) < 0) throw new Error('Порядок изменился. Повторите перенос.');
    if (from === to) return order.slice();
    var next = order.filter(function (id) { return id !== from; }), index = to ? next.indexOf(to) + (after ? 1 : 0) : next.length;
    next.splice(index, 0, from); return next;
  }
  function columnOf(task, source, projects) { return source === 'crm' ? columnForCrm(task, projects) : projects.some(function (p) { return text(p.id) === text(task.projectId); }) ? text(task.projectId) : '__other'; }
  function entries(data, crm, column) {
    return data.tasks.map(function (task) { return { task: task, source: 'projects' }; }).concat(crm.map(function (task) { return { task: task, source: 'crm' }; })).filter(function (row) { return columnOf(row.task, row.source, data.projects) === column; }).sort(function (a, b) {
      var ai = a.task.sortOrder, bi = b.task.sortOrder;
      if (typeof ai === 'number' && typeof bi === 'number' && ai !== bi) return ai - bi;
      var ad = text(a.task.dueDate || a.task.deadline) || '9999', bd = text(b.task.dueDate || b.task.deadline) || '9999'; return ad.localeCompare(bd);
    }).map(function (row) { return taskKey(row.source, row.task.id); });
  }
  function ordered(data, crm, column) {
    var actual = entries(data, crm, column), saved = data.tasksBoardV2 && data.tasksBoardV2.taskOrder && data.tasksBoardV2.taskOrder[column];
    return unique((Array.isArray(saved) ? saved.filter(function (id) { return actual.indexOf(id) >= 0; }) : []).concat(actual));
  }
  function moveTask(original, originalCrm, spec) {
    if (!original || !Array.isArray(original.projects) || !Array.isArray(original.tasks) || !Array.isArray(originalCrm) || !spec || !/^(projects|crm)$/.test(spec.source)) throw new Error('Данные задач ещё не готовы.');
    var data = clone(original), crm = clone(originalCrm), list = spec.source === 'crm' ? crm : data.tasks, matches = list.filter(function (task) { return text(task.id) === text(spec.id); });
    if (matches.length !== 1 || !text(spec.id) || columnOf(matches[0], spec.source, data.projects) !== spec.from) throw new Error('Задача изменилась или больше не найдена.');
    var target = data.projects.filter(function (project) { return text(project.id) === spec.to; }), group = crm.find(function (task) { return columnForCrm(task, data.projects) === spec.to; });
    if (target.length > 1 || !target.length && !(spec.source === 'crm' && group) && !(spec.source === 'projects' && spec.to === '__other')) throw new Error('Выберите существующий проект назначения.');
    var token = taskKey(spec.source, spec.id), sourceOrder = ordered(data, crm, spec.from), targetOrder = ordered(data, crm, spec.to);
    if (spec.before && (targetOrder.indexOf(spec.before) < 0 || entries(data, crm, spec.to).filter(function (id) { return id === spec.before; }).length !== 1)) throw new Error('Место вставки изменилось. Повторите перенос.');
    if (spec.before === token) return { data: data, crm: crm, crmChanged: false };
    var task = matches[0];
    if (spec.source === 'projects') task.projectId = target.length ? text(target[0].id) : '';
    else { task.projectId = target.length ? text(target[0].id) : ''; task.project = target.length ? text(target[0].title) : text(group.project); }
    var layout = data.tasksBoardV2 = Object.assign({}, data.tasksBoardV2 || {}), orders = layout.taskOrder = Object.assign({}, layout.taskOrder || {});
    orders[spec.from] = sourceOrder.filter(function (id) { return id !== token; });
    targetOrder = targetOrder.filter(function (id) { return id !== token; }); targetOrder.push(token);
    orders[spec.to] = reorder(targetOrder, token, spec.before || null, !!spec.after);
    data.tasks.forEach(function (item) { if (columnOf(item, 'projects', data.projects) === spec.to) item.sortOrder = orders[spec.to].indexOf(taskKey('projects', item.id)); });
    return { data: data, crm: crm, crmChanged: spec.source === 'crm' && JSON.stringify(crm) !== JSON.stringify(originalCrm) };
  }
  function install(win) {
    var doc = win.document, generation = 0, drag = null, dialog = null, pointer = null;
    function key(base) { return typeof win.AVITOLOG_KEY === 'function' ? win.AVITOLOG_KEY(base) : base; }
    function writable() {
      if (!(win.AVITOLOG_BACKEND_MODE || win.AVITOLOG_BACKEND_SERVER_ONLY)) return true;
      return win.AVITOLOG_BACKEND_INITIAL_SYNC_READY === true && typeof win.AVITOLOG_PROFILE_LOCKED === 'boolean' && (key('avitolog_projects').endsWith('_sasha') === win.AVITOLOG_PROFILE_LOCKED);
    }
    function scope() { var identity = typeof win.__avitologBackendIdentity === 'function' && win.__avitologBackendIdentity(); return [key('avitolog_projects'), key('crm_tasks_v1'), identity && identity.id || '', generation].join('|'); }
    function capture() { return scope(); }
    function guard(token) { if (!writable() || token !== scope()) throw new Error('Режим изменился или открыт только для просмотра.'); }
    function readData() { var data = typeof win.loadProjectsData === 'function' && win.loadProjectsData(); if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error('Проекты ещё загружаются.'); return clone(data); }
    function readCrmTasks() { var rows = JSON.parse(win.localStorage.getItem(key('crm_tasks_v1')) || '[]'); if (!Array.isArray(rows)) throw new Error('Данные CRM не распознаны.'); return rows; }
    function saveData(data, token) { guard(token); if (typeof win.saveProjectsData !== 'function') throw new Error('Сохранение проектов недоступно.'); win.saveProjectsData(data); guard(token); if (JSON.stringify(readData().tasksBoardV2 || null) !== JSON.stringify(data.tasksBoardV2 || null)) throw new Error('Запись порядка не подтверждена. Повторите сохранение.'); }
    function saveCrm(rows, token) {
      guard(token); var name = key('crm_tasks_v1'), previous = win.localStorage.getItem(name), raw = JSON.stringify(rows);
      if (typeof win.crmTaskSave === 'function' && win.CRM_TASKS_KEY === name) win.crmTaskSave(rows); else win.localStorage.setItem(name, raw);
      guard(token); if (win.localStorage.getItem(name) !== raw) throw new Error('Браузер не подтвердил запись CRM. Задачи не удалялись.');
      doc.dispatchEvent(new win.CustomEvent('avitolog:storage-write', { detail: { key: name, value: raw, previousValue: previous } }));
    }
    function status(message, bad) { var node = doc.querySelector('.tb-status'); if (node) { node.textContent = message; node.classList.toggle('is-error', !!bad); } }
    function render() {
      var mc = doc.getElementById('mainContent'), wrap = mc && mc.querySelector('.tasks-board-wrap'), menu = mc && mc.querySelector('.tb-settings');
      var left = wrap && wrap.scrollLeft || 0, top = wrap && wrap.scrollTop || 0, open = menu && menu.open;
      if (mc && typeof win.renderTasksBoardIntoMainContent === 'function') { win.renderTasksBoardIntoMainContent(mc); wrap = mc.querySelector('.tasks-board-wrap'); if (wrap) { wrap.scrollLeft = left; wrap.scrollTop = top; } menu = mc.querySelector('.tb-settings'); if (menu) menu.open = !!open; }
    }
    function move(spec, token) {
      token = token || capture(); guard(token);
      var result = moveTask(readData(), readCrmTasks(), spec);
      if (result.crmChanged) saveCrm(result.crm, token);
      saveData(result.data, token); render(); status('Порядок сохранён.'); return true;
    }
    function moveProject(from, to, after, token) {
      token = token || capture(); guard(token); var data = readData(), crm = readCrmTasks();
      var actual = unique(data.projects.map(function (p) { return text(p.id); }).concat(crm.map(function (task) { return columnForCrm(task, data.projects); }), data.tasks.some(function (task) { return columnOf(task, 'projects', data.projects) === '__other'; }) ? ['__other'] : []));
      if (actual.indexOf(from) < 0 || actual.indexOf(to) < 0) throw new Error('Проект больше не найден.');
      var saved = data.tasksBoardV2 && data.tasksBoardV2.projectOrder;
      var displayed = Array.from(doc.querySelectorAll('.tasks-col[data-project-id]')).map(function (col) { return col.dataset.projectId; });
      var order = unique((Array.isArray(saved) ? saved : displayed).filter(function (id) { return actual.indexOf(id) >= 0; }).concat(actual));
      data.tasksBoardV2 = Object.assign({}, data.tasksBoardV2 || {}, { projectOrder: reorder(order, from, to, !!after) }); saveData(data, token); render(); status('Порядок проектов сохранён.'); return true;
    }
    function setSettings(patch) { var token = capture(); guard(token); var data = readData(); data.tasksBoardV2 = Object.assign({}, data.tasksBoardV2 || {}); data.tasksBoardV2.settings = normalizeSettings(Object.assign({}, normalizeSettings(data.tasksBoardV2.settings), patch)); saveData(data, token); return data.tasksBoardV2.settings; }
    function setEmoji(source, id, value) {
      var token = capture(); guard(token); var picked = emoji(value); if (!picked) throw new Error('Введите один эмоджи.');
      var data = readData(), rows = source === 'crm' ? readCrmTasks() : data.tasks, found = rows.filter(function (task) { return text(task.id) === text(id); });
      if (!/^(projects|crm)$/.test(source) || found.length !== 1) throw new Error('Задача больше не найдена.');
      found[0].emoji = picked; if (source === 'crm') saveCrm(rows, token); else saveData(data, token); render(); status('Эмоджи сохранён.'); return picked;
    }
    function attempt(action) { try { return action(); } catch (error) { status(error.message || 'Не удалось сохранить. Задачи не удалялись.', true); return false; } }
    function element(tag, cls, label) { var node = doc.createElement(tag); if (cls) node.className = cls; if (label !== undefined) node.textContent = label; return node; }
    function button(cls, label, title, action) { var token = capture(), node = element('button', cls, label); node.type = 'button'; node.title = title; node.setAttribute('aria-label', title); node.addEventListener('click', function (event) { event.stopPropagation(); if (Date.now() < (node._tbClickAfter || 0)) { event.preventDefault(); return; } attempt(function () { if (token !== scope()) throw new Error('Режим изменился. Откройте задачи заново.'); return action(); }); }); return node; }
    function closeDialog() { if (dialog) { dialog.close(); dialog.remove(); dialog = null; } }
    function chooseEmoji(source, id, value, token) {
      guard(token); closeDialog(); dialog = element('dialog', 'tb-move-dialog');
      var form = element('form'), input = element('input'), palette = element('div', 'tb-emoji-palette'); input.type = 'text'; input.maxLength = 32; input.value = value; input.setAttribute('aria-label', 'Эмоджи задачи');
      ['📝', '🎨', '📊', '📦', '📞', '💬', '💰', '⚡', '🚀', '✅', '📋', '⭐'].forEach(function (icon) { palette.appendChild(button('', icon, 'Выбрать ' + icon, function () { guard(token); input.value = icon; input.focus(); })); });
      var actions = element('div', 'tb-move-actions'), submit = button('', 'Сохранить', 'Сохранить эмоджи', function () {}); submit.type = 'submit'; actions.append(submit, button('', 'Отмена', 'Отмена', closeDialog)); form.append(element('h3', '', 'Эмоджи задачи'), input, palette, actions);
      form.addEventListener('submit', function (event) { event.preventDefault(); if (attempt(function () { guard(token); setEmoji(source, id, input.value); return true; })) closeDialog(); }); dialog.appendChild(form); doc.body.appendChild(dialog); dialog.addEventListener('cancel', closeDialog); dialog.showModal(); input.focus();
    }
    function chooseMove(source, id, from) {
      var token = capture(); guard(token); closeDialog(); var data = readData(), crm = readCrmTasks();
      dialog = element('dialog', 'tb-move-dialog'); var form = element('form'), heading = element('h3', '', 'Переместить задачу'), select = element('select'); select.setAttribute('aria-label', 'Проект назначения');
      data.projects.forEach(function (project) { var option = element('option', '', (emoji(project.emoji) || '📁') + ' ' + text(project.title)); option.value = text(project.id); select.appendChild(option); });
      var groups = unique(crm.map(function (task) { return columnForCrm(task, data.projects); })).filter(function (column) { return column.indexOf('crm_') === 0; });
      if (source === 'crm') groups.forEach(function (column) { var row = crm.find(function (task) { return columnForCrm(task, data.projects) === column; }), option = element('option', '', text(row.project) || 'CRM без проекта'); option.value = column; select.appendChild(option); });
      if (source === 'projects') { var other = element('option', '', 'Без проекта'); other.value = '__other'; select.appendChild(other); }
      select.value = from; var actions = element('div', 'tb-move-actions'), submit = button('', 'Переместить', 'Переместить', function () {}); submit.type = 'submit';
      actions.append(submit, button('', 'Отмена', 'Отмена', closeDialog)); form.append(heading, select, actions);
      form.addEventListener('submit', function (event) { event.preventDefault(); if (attempt(function () { move({ source: source, id: id, from: from, to: select.value, before: null }, token); return true; })) closeDialog(); });
      dialog.appendChild(form); doc.body.appendChild(dialog); dialog.addEventListener('cancel', function () { closeDialog(); }); dialog.showModal();
    }
    function cleanDrag() { doc.querySelectorAll('.tb-dragging,.tb-drop-before,.tb-drop-after,.tb-column-before,.tb-column-after,.tb-drop-column').forEach(function (node) { node.classList.remove('tb-dragging', 'tb-drop-before', 'tb-drop-after', 'tb-column-before', 'tb-column-after', 'tb-drop-column'); }); }
    function startDrag(event, value, node) { if (!writable()) { event.preventDefault(); return; } event.stopPropagation(); drag = Object.assign({ scope: capture() }, value); if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-avitoboss-task-board', JSON.stringify(value)); } node.classList.add('tb-dragging'); }
    function paintDrop(page, target, x, y) {
      if (!drag || drag.scope !== scope() || !writable()) return;
      var col = target && target.closest('.tasks-col'); cleanDrag(); if (!col || !page.contains(col)) return;
      if (drag.kind === 'project') col.classList.add(x > col.getBoundingClientRect().left + col.getBoundingClientRect().width / 2 ? 'tb-column-after' : 'tb-column-before');
      else { var task = target.closest('.tasks-task'); if (task) task.classList.add(y > task.getBoundingClientRect().top + task.getBoundingClientRect().height / 2 ? 'tb-drop-after' : 'tb-drop-before'); else col.classList.add('tb-drop-column'); }
      var wrap = page.querySelector('.tasks-board-wrap'), rect = wrap.getBoundingClientRect(); if (x > rect.right - 48) wrap.scrollLeft += 24; if (x < rect.left + 48) wrap.scrollLeft -= 24; if (y > rect.bottom - 40) wrap.scrollTop += 18; if (y < rect.top + 40) wrap.scrollTop -= 18;
    }
    function dropOn(page, target, active) {
      var col = target && target.closest('.tasks-col'); if (!col || !page.contains(col)) { cleanDrag(); return; }
      attempt(function () { guard(active.scope); if (active.kind === 'project') moveProject(active.id, col.dataset.projectId, col.classList.contains('tb-column-after'), active.scope); else { var task = target.closest('.tasks-task'); move({ source: active.source, id: active.id, from: active.from, to: col.dataset.projectId, before: task && task.dataset.taskKey || null, after: !!(task && task.classList.contains('tb-drop-after')) }, active.scope); } }); cleanDrag();
    }
    function cancelPointer() {
      if (!pointer) return;
      var old = pointer; pointer = null; win.removeEventListener('pointermove', pointerMove); win.removeEventListener('pointerup', pointerUp); win.removeEventListener('pointercancel', pointerCancel); win.removeEventListener('keydown', pointerEscape);
      try { old.handle.releasePointerCapture(old.id); } catch (_) {}
      if (old.started) old.handle._tbClickAfter = Date.now() + 300;
      return old;
    }
    function pointerMove(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (pointer.scope !== scope() || !writable()) { pointerCancel(); return; }
      if (!pointer.started && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
      event.preventDefault(); pointer.started = true; drag = Object.assign({ scope: pointer.scope }, pointer.value);
      paintDrop(pointer.page, doc.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY); pointer.node.classList.add('tb-dragging');
    }
    function pointerUp(event) { if (!pointer || event.pointerId !== pointer.id) return; var old = cancelPointer(), active = drag, target = doc.elementFromPoint(event.clientX, event.clientY); if (old.started && active) { event.preventDefault(); paintDrop(old.page, target, event.clientX, event.clientY); drag = null; dropOn(old.page, target, active); } else { drag = null; cleanDrag(); } }
    function pointerCancel() { cancelPointer(); drag = null; cleanDrag(); }
    function pointerEscape(event) { if (event.key === 'Escape') { event.preventDefault(); pointerCancel(); } }
    function pointerHandle(handle, value, node, page, token) {
      handle.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.isPrimary === false || !writable() || token !== scope()) return;
        event.preventDefault(); event.stopPropagation(); pointerCancel(); handle.focus(); pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, handle: handle, value: value, node: node, page: page, scope: token, started: false };
        try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        win.addEventListener('pointermove', pointerMove, { passive: false }); win.addEventListener('pointerup', pointerUp); win.addEventListener('pointercancel', pointerCancel); win.addEventListener('keydown', pointerEscape);
      });
    }
    function color(column, project) { var raw = project && project.tasksBoardColor; if (/^#[0-9a-f]{6}$/i.test(raw || '')) return raw; var palette = ['#35a6d9', '#8265d8', '#25b89d', '#d78e43', '#d4689a', '#7994c8'], seed = Array.from(column).reduce(function (sum, c) { return sum + c.codePointAt(0); }, 0); return palette[seed % palette.length]; }
    function applySkin(page, settings) { page.dataset.skin = String(settings.skin); page.querySelectorAll('.tasks-col').forEach(function (col) { var hex = col.dataset.boardColor, rgb = [1, 3, 5].map(function (at) { return parseInt(hex.slice(at, at + 2), 16); }).join(','); col.style.setProperty('--tasks-col-accent', hex); col.style.setProperty('--tasks-rgb', rgb); col.style.setProperty('--tasks-tint', 'rgba(' + rgb + ',' + settings.opacity / 100 + ')'); var pattern = col.querySelector('.tasks-col-pattern'); if (pattern) pattern.hidden = !settings.skin || !settings.pattern; }); }
    function settingsMenu(page, data) {
      var viewScope = capture(), menu = element('details', 'tb-settings'), summary = element('summary', '', '⚙'); summary.setAttribute('aria-label', 'Настройки доски задач'); menu.appendChild(summary); var panel = element('div', 'tb-settings-panel'), settings = normalizeSettings(data.tasksBoardV2 && data.tasksBoardV2.settings);
      panel.appendChild(element('strong', '', 'Оформление задач'));
      [['skin', 'Цветные ленты проектов'], ['pattern', 'Фоновый узор из эмоджи']].forEach(function (field) { var label = element('label'), input = element('input'); input.type = 'checkbox'; input.checked = settings[field[0]]; input.disabled = !writable(); input.addEventListener('change', function () { attempt(function () { guard(viewScope); var patch = {}; patch[field[0]] = input.checked; settings = setSettings(patch); applySkin(page, settings); }); }); label.append(input, element('span', '', field[1])); panel.appendChild(label); });
      var label = element('label', 'tb-opacity-label'), slider = element('input'), output = element('output', '', settings.opacity + '%'); slider.type = 'range'; slider.min = '8'; slider.max = '80'; slider.step = '1'; slider.value = String(settings.opacity); slider.disabled = !writable(); slider.setAttribute('aria-label', 'Плотность цвета проектов'); label.append(element('span', '', 'Плотность цвета'), slider, output); panel.append(label, element('small', '', 'Порядок, эмоджи и оформление сохраняются в текущем режиме. Перетаскивайте за ⋮⋮; Alt + стрелки меняют порядок.'));
      slider.addEventListener('input', function () { if (viewScope !== scope()) return; output.textContent = slider.value + '%'; applySkin(page, Object.assign({}, settings, { opacity: Number(slider.value) })); }); slider.addEventListener('change', function () { attempt(function () { guard(viewScope); settings = setSettings({ opacity: Number(slider.value) }); applySkin(page, settings); }); });
      menu.appendChild(panel); (page.querySelector('.tasks-board-toolbar') || page.querySelector('.tasks-board-head')).appendChild(menu); return settings;
    }
    function enhance(mc) {
      var page = mc && mc.querySelector('.tasks-board-page'); if (!page || page.classList.contains('tasks-board-v2')) return;
      var viewScope = capture(), data, crm; try { data = readData(); crm = readCrmTasks(); } catch (_) { return; }
      page.classList.add('tasks-board-v2'); var note = element('div', 'tb-status'); note.setAttribute('role', 'status'); (page.querySelector('.tasks-board-head') || page).appendChild(note);
      var subtitle = page.querySelector('.tasks-board-sub'); if (subtitle) subtitle.textContent = 'Перетаскивайте проекты и задачи за ⋮⋮. Высота ленты зависит от числа задач; полный заголовок доступен при наведении.';
      var settings = settingsMenu(page, data), order = data.tasksBoardV2 && data.tasksBoardV2.projectOrder || [], columns = Array.from(page.querySelectorAll('.tasks-col'));
      if (Array.isArray(order)) columns.sort(function (a, b) { var ai = order.indexOf(a.dataset.projectId), bi = order.indexOf(b.dataset.projectId); return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi); }).forEach(function (col) { col.parentElement.appendChild(col); });
      columns.forEach(function (col) {
        var id = col.dataset.projectId, project = data.projects.find(function (p) { return text(p.id) === id; }), heading = col.querySelector('.tasks-col-title'), title = col.querySelector('.tasks-col-title-name b');
        ['draggable', 'ondragstart', 'ondragover', 'ondragenter', 'ondragleave', 'ondrop', 'ondragend'].forEach(function (name) { col.removeAttribute(name); });
        if (title) title.title = title.textContent;
        col.querySelectorAll('.tasks-col-color,.tasks-col-tag-btn,.tasks-col-project-tag-rm').forEach(function (control) { var type = control.tagName === 'INPUT' ? 'change' : 'click', oldHandler = type === 'change' ? control.onchange : control.onclick; control.removeAttribute('on' + type); control.disabled = !writable(); if (oldHandler) control.addEventListener(type, function (event) { event.stopPropagation(); attempt(function () { guard(viewScope); oldHandler.call(control, event); }); }); });
        var old = col.querySelector('.tasks-col-drag'); if (old) old.remove();
        var grip = button('tb-project-grip', '⋮⋮', 'Перетащить проект. Alt + влево / вправо: изменить порядок', function () {}); grip.draggable = writable(); grip.disabled = !writable(); heading.prepend(grip); grip.addEventListener('dragstart', function (event) { if (viewScope !== scope()) { event.preventDefault(); return; } startDrag(event, { kind: 'project', id: id }, col); });
        pointerHandle(grip, { kind: 'project', id: id }, col, page, viewScope);
        grip.addEventListener('keydown', function (event) { if (!event.altKey || !/^(ArrowLeft|ArrowRight)$/.test(event.key)) return; event.preventDefault(); var visible = Array.from(col.parentElement.children), index = visible.indexOf(col), target = visible[index + (event.key === 'ArrowRight' ? 1 : -1)]; if (target) attempt(function () { moveProject(id, target.dataset.projectId, event.key === 'ArrowRight', viewScope); }); });
        if (project && win.ProjectCard && typeof win.ProjectCard.open === 'function') col.querySelector('.tasks-col-tools').appendChild(button('tasks-col-open tb-project-card', '🗂️', 'Карта проекта', function () { win.ProjectCard.open(id); }));
        col.dataset.boardColor = color(id, project); var pattern = element('div', 'tasks-col-pattern'); pattern.setAttribute('aria-hidden', 'true'); for (var n = 0; n < 28; n++) pattern.appendChild(element('span', '', emoji(project && project.emoji) || '📁')); col.prepend(pattern);
        var list = col.querySelector('.tasks-col-list'), tokens = ordered(data, crm, id), nodes = Array.from(list.querySelectorAll('.tasks-task'));
        nodes.sort(function (a, b) { return tokens.indexOf(taskKey(a.dataset.taskSource, a.dataset.taskId)) - tokens.indexOf(taskKey(b.dataset.taskSource, b.dataset.taskId)); }).forEach(function (task) { list.appendChild(task); });
        nodes.forEach(function (task) {
          var source = task.dataset.taskSource, taskId = task.dataset.taskId, rows = source === 'crm' ? crm : data.tasks, record = rows.find(function (item) { return text(item.id) === taskId; }); if (!record) return;
          task.dataset.taskKey = taskKey(source, taskId); var top = task.querySelector('.tasks-task-top');
          var handle = button('tb-task-grip', '⋮⋮', 'Перетащить задачу. Alt + вверх / вниз: изменить порядок', function () { chooseMove(source, taskId, id); }); handle.draggable = writable(); handle.disabled = !writable(); top.prepend(handle);
          handle.addEventListener('dragstart', function (event) { if (viewScope !== scope()) { event.preventDefault(); return; } startDrag(event, { kind: 'task', source: source, id: taskId, from: id }, task); });
          pointerHandle(handle, { kind: 'task', source: source, id: taskId, from: id }, task, page, viewScope);
          handle.addEventListener('keydown', function (event) { if (!event.altKey || !/^(ArrowUp|ArrowDown)$/.test(event.key)) return; event.preventDefault(); var siblings = Array.from(list.querySelectorAll('.tasks-task')), index = siblings.indexOf(task), next = siblings[index + (event.key === 'ArrowDown' ? 1 : -1)]; if (next) attempt(function () { move({ source: source, id: taskId, from: id, to: id, before: next.dataset.taskKey, after: event.key === 'ArrowDown' }, viewScope); }); });
          var icon = button('tb-task-emoji', emojiForTask(record), 'Изменить эмоджи задачи', function () { chooseEmoji(source, taskId, emojiForTask(record), viewScope); }); icon.disabled = !writable(); top.insertBefore(icon, handle.nextSibling);
          var actions = task.querySelector('.tasks-task-actions'); actions.querySelectorAll('button').forEach(function (action) { var wasDone = /work/.test(action.textContent); action.removeAttribute('onclick'); action.disabled = !writable(); action.addEventListener('click', function (event) { event.stopPropagation(); attempt(function () { guard(viewScope); var latest = readData(), rows = source === 'crm' ? readCrmTasks() : latest.tasks, found = rows.filter(function (item) { return text(item.id) === taskId; }); if (found.length !== 1) throw new Error('Задача больше не найдена.'); found[0].status = source === 'crm' ? (wasDone ? 'active' : 'completed') : (wasDone ? 'work' : 'done'); if (source === 'crm') { found[0].completedAt = wasDone ? '' : new Date().toISOString(); saveCrm(rows, viewScope); } else saveData(latest, viewScope); render(); }); }); });
          var moveButton = button('tasks-task-act tb-task-move', '↗', 'Переместить задачу в другой проект', function () { chooseMove(source, taskId, id); }); moveButton.disabled = !writable(); actions.appendChild(moveButton);
        });
      });
      applySkin(page, settings);
      page.addEventListener('dragover', function (event) {
        if (!drag || drag.scope !== scope() || !writable()) return;
        var col = event.target.closest('.tasks-col'); if (!col || !page.contains(col)) return;
        event.preventDefault(); event.stopPropagation(); cleanDrag();
        paintDrop(page, event.target, event.clientX, event.clientY);
      });
      page.addEventListener('drop', function (event) {
        if (!drag) return; event.preventDefault(); event.stopPropagation(); var active = drag; paintDrop(page, event.target, event.clientX, event.clientY); drag = null; var col = event.target.closest('.tasks-col');
        if (col && page.contains(col)) dropOn(page, event.target, active); cleanDrag();
      });
      page.addEventListener('dragend', function () { drag = null; cleanDrag(); });
    }
    doc.addEventListener('avitolog:workspace-reset', function () { generation++; pointerCancel(); drag = null; closeDialog(); });
    return Object.freeze({ enhance: enhance, columnForCrm: columnForCrm, readCrmTasks: readCrmTasks, move: move, capture: capture, setSettings: setSettings, setEmoji: setEmoji, moveProject: moveProject });
  }
  return { taskKey: taskKey, columnForCrm: columnForCrm, normalizeSettings: normalizeSettings, emojiForTask: emojiForTask, reorder: reorder, moveTask: moveTask, install: install };
});
