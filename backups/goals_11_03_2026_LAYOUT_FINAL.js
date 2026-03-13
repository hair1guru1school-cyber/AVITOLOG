/**
 * Goals module — pre-project pipeline (ЦЕЛИ)
 * Tracks activity BEFORE a deal becomes a real project
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'avitolog_goals_v1';
  var STATUS_LEGACY = { kp_sent:'kp', invoice_sent:'invoice', contract_sent:'contract', instruction_sent:'instruction', deal_discussion:'negotiations' };
  const STATUS_OPTIONS = [
    { id: 'kp', label: 'КП', color: '#35d0ff' },
    { id: 'negotiations', label: 'Переговоры', color: '#7c6af7' },
    { id: 'invoice', label: 'Счет', color: '#00d97e' },
    { id: 'contract', label: 'Договор', color: '#00d97e' },
    { id: 'instruction', label: 'Инструкция', color: '#00d97e' },
    { id: 'paid', label: 'Оплачено', color: '#00ff88' },
    { id: 'reading', label: 'Читает', color: '#35d0ff' },
    { id: 'not_reading', label: 'Не читает', color: '#ff6b35' },
    { id: 'drain', label: 'Слив', color: '#ff4444' }
  ];
  const PROJECT_EMOJIS = ['📦', '🏠', '🚗', '👔', '🛒', '🏢', '📱', '💼', '⭐', '🔥', '💰', '📋'];
  const TOUCH_OPTIONS = [
    { id: 'sms_sent', label: 'SMS отправлено' },
    { id: 'sms_no_reply', label: 'SMS без ответа' },
    { id: 'reply_received', label: 'Ответ получен' },
    { id: 'call_scheduled', label: 'Созвон назначен' },
    { id: 'contract_sent_touch', label: 'Отправлен договор' },
    { id: 'invoice_sent_touch', label: 'Отправлен счет' },
    { id: 'touch', label: 'Касание' }
  ];

  function getWeekIndex(day) {
    if (day >= 1 && day <= 7) return 1;
    if (day >= 8 && day <= 14) return 2;
    if (day >= 15 && day <= 21) return 3;
    return 4;
  }

  function generateId() {
    return 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function loadData() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : { projects: [] };
    } catch (e) { return { projects: [] }; }
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.warn('Goals save failed', e); }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    var parts = String(dateStr).split('-');
    if (parts.length >= 3) {
      var d = parts[2], m = parts[1];
      return (d.length === 1 ? '0' + d : d) + '.' + (m.length === 1 ? '0' + m : m);
    }
    return dateStr;
  }

  function renderPricePopup(project) {
    var opts = project.priceOptions || [];
    if (opts.length <= 1) return null;
    return opts.map(function(p) { return esc(String(p)); }).join('<br>');
  }

  function renderWeekSection(weekNum, projects) {
    var rows = projects.map(function(p) {
      var mainPrice = (p.mainPrice || p.priceOptions && p.priceOptions[0]) ? String(p.mainPrice || p.priceOptions[0]) : '—';
      var statusBadges = (p.status || []).map(function(sId) {
        var id = STATUS_LEGACY[sId] || sId;
        var s = STATUS_OPTIONS.find(function(o) { return o.id === id; });
        return s ? '<span class="goal-status-badge" style="background:' + s.color + '22;border-color:' + s.color + ';color:' + s.color + '" title="' + esc(s.label) + '">' + esc(s.label) + '</span>' : '';
      }).filter(Boolean).join('');
      var touchBadges = (p.touchMarkers || []).map(function(tId) {
        var t = TOUCH_OPTIONS.find(function(o) { return o.id === tId; });
        return t ? '<span class="goal-touch-badge">' + esc(t.label) + '</span>' : '';
      }).filter(Boolean).join('');
      var hasOpts = (p.priceOptions || []).length > 1;
      var priceHtml = '<span class="goal-price' + (hasOpts ? ' goal-price-dd' : '') + '" onclick="event.stopPropagation();window.__goalsShowPricePopup&&window.__goalsShowPricePopup(\'' + esc(p.id) + '\')" title="Варианты КП">' + esc(mainPrice) + '</span>';
      var emoji = p.emoji || '📦';
      var folderIcon = (p.folderLink) ? '<a href="' + esc(p.folderLink) + '" target="_blank" rel="noopener" class="goal-folder-link" title="Открыть папку">💿</a>' : '';
      return '<div class="goal-row" data-id="' + esc(p.id) + '" onclick="window.__goalsSelectRow && window.__goalsSelectRow(\'' + esc(p.id) + '\')">' +
        '<span class="goal-date">' + esc(formatDateShort(p.date)) + '</span>' +
        '<span class="goal-name">' + emoji + ' ' + (folderIcon ? folderIcon + ' ' : '') + esc(p.name || '') + '</span>' +
        '<span class="goal-price-wrap">' + priceHtml + '</span>' +
        '<span class="goal-badges">' + statusBadges + '</span>' +
        '<span class="goal-touches">' + touchBadges + '</span>' +
        '<span class="goal-actions">' +
          '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'sold\')" title="В Продано">✓</button>' +
          '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'working\')" title="В работу">🔥</button>' +
          '<button type="button" class="goal-move-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'archive\')" title="В архив">🗂</button>' +
          '<button type="button" class="goal-del-btn" onclick="event.stopPropagation();window.__goalsDelete&&window.__goalsDelete(\'' + esc(p.id) + '\',' + weekNum + ')" title="Удалить из недели">×</button>' +
        '</span></div>';
    });
    var header = '<div class="goal-row goal-row-header">' +
      '<span class="goal-date">ДАТА</span>' +
      '<span class="goal-name">ПРОЕКТ</span>' +
      '<span class="goal-price-wrap">КП =</span>' +
      '<span class="goal-badges">СТАТУСЫ</span>' +
      '<span class="goal-touches">КАСАНИЯ</span>' +
      '<span class="goal-actions">X</span>' +
      '</div>';
    return '<div class="goal-week" data-week="' + weekNum + '">' +
      '<div class="goal-week-title">' + weekNum + ' НЕДЕЛЯ</div>' +
      '<div class="goal-week-rows">' + header + (rows.length ? rows.join('') : '<div class="goal-empty">Нет проектов</div>') + '</div>' +
      '<button type="button" class="goal-week-add" onclick="window.__goalsOpenModal && window.__goalsOpenModal()">+ Добавить проект</button>' +
      '</div>';
  }

  function renderSection(title, icon, projects, footerHtml, showBadges, showSum, blockType) {
    if (showSum === undefined) showSum = true;
    blockType = blockType || '';
    var rows = (projects || []).map(function(p) {
      var kpPrice = p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '';
      var salePrice = (blockType === 'sold' && p.saleAmount) ? String(p.saleAmount) : '';
      var sum = (blockType === 'sold' && salePrice) ? salePrice : kpPrice;
      var badges = (showBadges && (p.status || []).length) ? (p.status || []).map(function(sId) {
        var id = STATUS_LEGACY[sId] || sId;
        var s = STATUS_OPTIONS.find(function(o) { return o.id === id; });
        return s ? '<span class="goal-status-badge" style="background:' + s.color + '22;border-color:' + s.color + ';color:' + s.color + '">' + esc(s.label) + '</span>' : '';
      }).filter(Boolean).join('') : '';
      var sumClick = (blockType === 'sold' || blockType === 'work') ? ' onclick="event.stopPropagation();var e=event;window.__goalsEditSum&&window.__goalsEditSum(\'' + esc(p.id) + '\',\'' + esc(blockType) + '\',e.target)"' : '';
      var sumCell = showSum ? '<span class="goal-sum goal-sum-editable"' + sumClick + ' data-id="' + esc(p.id) + '" title="Нажмите для изменения">' + esc(String(sum)) + ' ₽</span>' : '';
      var rowClass = 'goal-row goal-row-alt' + (showSum ? '' : ' goal-row-alt-no-sum');
      var emoji = p.emoji || '📦';
      var folderIcon = (p.folderLink) ? '<a href="' + esc(p.folderLink) + '" target="_blank" rel="noopener" class="goal-folder-link" title="Открыть папку" onclick="event.stopPropagation()">💿</a>' : '';
      var archBtn = (blockType === 'archive') ? '<span class="goal-row-actions"><button type="button" class="goal-restore-btn" onclick="event.stopPropagation();window.__goalsSetStage&&window.__goalsSetStage(\'' + esc(p.id) + '\',\'weekly\')" title="Вернуть в неделю">&#8634;</button></span>' : '';
      var delBtn = (blockType === 'sold' || blockType === 'work') ? '<span class="goal-row-actions"><button type="button" class="goal-del-btn" onclick="event.stopPropagation();window.__goalsDeletePermanent&&window.__goalsDeletePermanent(\'' + esc(p.id) + '\')" title="Удалить">×</button></span>' : '';
      var avatarHtml = '<span class="goal-avatar">' + emoji + '</span>';
      var namePart = (folderIcon ? folderIcon + ' ' : '') + esc(p.name || '');
      return '<div class="' + rowClass + '" data-id="' + esc(p.id) + '" onclick="window.__goalsSelectRow&&window.__goalsSelectRow(\'' + esc(p.id) + '\')">' +
        '<span class="goal-date">' + esc(formatDateShort(p.date)) + '</span>' +
        avatarHtml +
        '<span class="goal-name">' + namePart + '</span>' +
        sumCell +
        (badges ? '<span class="goal-badges">' + badges + '</span>' : '') +
        archBtn +
        delBtn +
        '</div>';
    });
    return '<div class="goal-block goal-block-' + (blockType || '') + '">' +
      '<div class="goal-block-title">' + icon + ' ' + title + '</div>' +
      '<div class="goal-block-rows">' + (rows.length ? rows.join('') : '<div class="goal-empty">Пусто</div>') + '</div>' +
      (footerHtml || '') +
      '<button type="button" class="goal-block-add" onclick="window.__goalsOpenModal && window.__goalsOpenModal()">+ Добавить проект</button>' +
      '</div>';
  }

  function render() {
    var data = loadData();
    var projects = data.projects || [];
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var week1 = [], week2 = [], week3 = [], week4 = [];
    var sold = [], working = [], archive = [];

    projects.forEach(function(p) {
      if (p.stage === 'sold') sold.push(p);
      else if (p.stage === 'working') working.push(p);
      else if (p.stage === 'archive') archive.push(p);
      var d = p.date ? (function() {
        var parts = String(p.date).split('-');
        if (parts.length >= 3) return parseInt(parts[2], 10);
        return now.getDate();
      }()) : now.getDate();
      var wi = p.weekIndex || getWeekIndex(d);
      if (wi === 1) week1.push(p);
      else if (wi === 2) week2.push(p);
      else if (wi === 3) week3.push(p);
      else week4.push(p);
    });

    var totalRevenue = sold.reduce(function(sum, p) {
      var val = p.saleAmount || p.mainPrice || (p.priceOptions && p.priceOptions[0]);
      var v = parseFloat(String(val || '0').replace(/\s/g, '')) || 0;
      return sum + v;
    }, 0);
    var totalPotential = working.reduce(function(sum, p) {
      var v = parseFloat(String(p.mainPrice || p.priceOptions && p.priceOptions[0]).replace(/\s/g, '')) || 0;
      return sum + v;
    }, 0);
    var funnelTotal = totalRevenue + totalPotential;
    var totalCount = projects.length;
    var workingCount = working.length;
    var soldCount = sold.length;
    var newCount = week1.length + week2.length + week3.length + week4.length;

    function fmtNum(n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    var html = '<div class="goals-page">' +
      '<div class="goals-kpi-row">' +
        '<div class="goal-kpi-card goal-kpi-new"><span class="goal-kpi-num">' + newCount + '</span><span class="goal-kpi-label">НОВЫХ</span></div>' +
        '<div class="goal-kpi-card goal-kpi-work"><span class="goal-kpi-num">' + workingCount + '</span><span class="goal-kpi-label">В РАБОТЕ</span></div>' +
        '<div class="goal-kpi-card goal-kpi-sold"><span class="goal-kpi-num">' + soldCount + '</span><span class="goal-kpi-num-sub">' + fmtNum(totalRevenue) + ' ₽</span><span class="goal-kpi-label">ПРОДАНО</span></div>' +
        '<div class="goal-kpi-card goal-kpi-funnel"><span class="goal-kpi-funnel-ico">&#9660;</span><span class="goal-kpi-num-wrap"><span class="goal-kpi-num">' + fmtNum(funnelTotal) + '</span> <span class="goal-kpi-unit">P</span></span><span class="goal-kpi-label">ВОРОНКА</span></div>' +
      '</div>' +
      '<div class="goals-header">' +
        '<button type="button" class="goal-add-btn" onclick="window.__goalsOpenModal && window.__goalsOpenModal()">+ ПРОЕКТ</button>' +
        '<span class="goal-counters">' +
          '<span class="goal-counter goal-counter-total">&#9744; ВСЕГО <b>' + totalCount + '</b></span>' +
          '<span class="goal-counter goal-counter-sold">&#9650; ПРОДАНО <b>' + soldCount + '</b> <span class="goal-counter-sum">(' + fmtNum(totalRevenue) + ' ₽)</span></span>' +
        '</span>' +
      '</div>' +
      '<div class="goals-main-row">' +
        '<div class="goals-col goals-col-work">' +
          renderSection('В РАБОТЕ', '🔥', working, '<div class="goal-total">ОБЩИЙ ПОТЕНЦИАЛ: ' + esc(String(fmtNum(totalPotential))) + ' ₽</div>', true, true, 'work') +
        '</div>' +
        '<div class="goals-col goals-col-weeks">' +
          '<div class="goals-weeks">' +
            renderWeekSection(4, week4) +
            renderWeekSection(3, week3) +
            renderWeekSection(2, week2) +
            renderWeekSection(1, week1) +
          '</div>' +
        '</div>' +
        '<div class="goals-col goals-col-sold">' +
          renderSection('ПРОДАНО', '☑', sold, '<div class="goal-total">' + esc(fmtNum(totalRevenue)) + ' ₽</div>', false, true, 'sold') +
        '</div>' +
      '</div>' +
      '<div class="goals-archive-wrap">' +
        renderSection('АРХИВ', '📁', archive, '', false, false, 'archive') +
      '</div></div>';

    var main = document.getElementById('mainContent');
    if (main) main.innerHTML = html;

    window.__goalsDelete = deleteFromWeek;
    window.__goalsDeletePermanent = deletePermanent;
    window.__goalsSelectRow = selectGoalRow;
    window.__goalsEditSum = showSumEditPopup;
    window.__goalsShowPricePopup = showPricePopup;
    window.__goalsOpenModal = openModal;
    window.__goalsSetStage = setStage;
  }

  function setStage(projectId, stage) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    p.stage = stage;
    saveData(data);
    render();
  }

  function deletePermanent(projectId) {
    var data = loadData();
    data.projects = (data.projects || []).filter(function(x) { return x.id !== projectId; });
    saveData(data);
    render();
  }

  function selectGoalRow(projectId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    if (typeof window.fillClientFormFromGoal === 'function') {
      window.fillClientFormFromGoal({
        name: p.name || '',
        company: p.company || '',
        phone: p.phone || '',
        folderLink: p.folderLink || '',
        notes: p.note || '',
        category: p.category || '',
        city: p.city || '',
        kp_count: p.kp_count || '',
        positions: p.positions || ''
      });
    }
    openEditModal(p);
  }

  function openEditModal(p) {
    var existing = document.getElementById('goalEditModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'goalEditModal';
    modal.className = 'goal-modal-overlay';
    var statusChecks = STATUS_OPTIONS.map(function(s) {
      var checked = (p.status || []).indexOf(s.id) >= 0 ? ' checked' : '';
      return '<label class="goal-check"><input type="checkbox" data-status="' + s.id + '"' + checked + '><span>' + esc(s.label) + '</span></label>';
    }).join('');
    var touchChecks = TOUCH_OPTIONS.map(function(t) {
      var checked = (p.touchMarkers || []).indexOf(t.id) >= 0 ? ' checked' : '';
      return '<label class="goal-check"><input type="checkbox" data-touch="' + t.id + '"' + checked + '><span>' + esc(t.label) + '</span></label>';
    }).join('');
    var emojiBtns = PROJECT_EMOJIS.map(function(e) {
      var sel = (p.emoji || '📦') === e ? ' goal-emoji-sel' : '';
      return '<span class="goal-emoji-btn' + sel + '" data-emoji="' + esc(e) + '">' + e + '</span>';
    }).join('');
    modal.innerHTML = '<div class="goal-modal">' +
      '<div class="goal-modal-head">Редактировать проект</div>' +
      '<div class="goal-modal-body">' +
        '<div class="fg"><label>Эмодзи</label><div class="goal-emoji-picker">' + emojiBtns + '</div></div>' +
        '<div class="fg"><label>Название</label><input type="text" id="goalEditName" value="' + esc(p.name || '') + '"></div>' +
        '<div class="fg"><label>Компания / контакт</label><input type="text" id="goalEditCompany" placeholder="Компания" value="' + esc(p.company || '') + '"></div>' +
        '<div class="fg"><label>Телефон</label><input type="text" id="goalEditPhone" placeholder="+7..." value="' + esc(p.phone || '') + '"></div>' +
        '<div class="fg"><label>Ссылка на папку Google</label><input type="text" id="goalEditFolder" placeholder="https://drive.google.com/..." value="' + esc(p.folderLink || '') + '"></div>' +
        '<div class="fg"><label>Дата</label><input type="text" id="goalEditDate" value="' + esc(p.date || '') + '"></div>' +
        '<div class="fg"><label>От какой суммы КП</label><input type="number" id="goalEditPrice" value="' + esc(String(p.mainPrice || '')) + '"></div>' +
        '<div class="fg"><label>Сумма продажи итоговая</label><input type="number" id="goalEditSale" placeholder="Для проданных" value="' + esc(String(p.saleAmount || '')) + '"></div>' +
        '<div class="fg"><label>Статусы</label><div class="goal-checks">' + statusChecks + '</div></div>' +
        '<div class="fg"><label>Касания</label><div class="goal-checks">' + touchChecks + '</div></div>' +
      '</div>' +
      '<div class="goal-modal-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalEditModal\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalEditSave">Сохранить</button>' +
      '</div></div></div>';
    document.body.appendChild(modal);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.querySelectorAll('.goal-emoji-btn').forEach(function(btn) {
      btn.onclick = function() {
        modal.querySelectorAll('.goal-emoji-btn').forEach(function(b) { b.classList.remove('goal-emoji-sel'); });
        btn.classList.add('goal-emoji-sel');
      };
    });
    document.getElementById('goalEditSave').onclick = function() {
      var name = ((document.getElementById('goalEditName') || {}).value || '').trim();
      if (!name) { alert('Введите название'); return; }
      var selEmoji = modal.querySelector('.goal-emoji-btn.goal-emoji-sel');
      var emoji = selEmoji ? selEmoji.getAttribute('data-emoji') : (p.emoji || '📦');
      p.name = name;
      p.emoji = emoji;
      p.company = ((document.getElementById('goalEditCompany') || {}).value || '').trim();
      p.phone = ((document.getElementById('goalEditPhone') || {}).value || '').trim();
      p.folderLink = ((document.getElementById('goalEditFolder') || {}).value || '').trim();
      p.date = ((document.getElementById('goalEditDate') || {}).value || '').trim() || p.date;
      var priceVal = ((document.getElementById('goalEditPrice') || {}).value || '').trim();
      if (priceVal) {
        p.mainPrice = priceVal;
        if (!p.priceOptions || p.priceOptions.length === 0) p.priceOptions = [priceVal];
        else p.priceOptions[0] = priceVal;
      }
      var saleVal = ((document.getElementById('goalEditSale') || {}).value || '').trim();
      if (p.stage === 'sold') p.saleAmount = saleVal || '';
      var status = [];
      modal.querySelectorAll('input[data-status]:checked').forEach(function(cb) { status.push(cb.getAttribute('data-status')); });
      p.status = status;
      var touchMarkers = [];
      modal.querySelectorAll('input[data-touch]:checked').forEach(function(cb) { touchMarkers.push(cb.getAttribute('data-touch')); });
      p.touchMarkers = touchMarkers;
      var data = loadData();
      saveData(data);
      modal.remove();
      render();
    };
  }

  function deleteFromWeek(projectId, weekNum) {
    var data = loadData();
    var projects = data.projects || [];
    var p = projects.find(function(x) { return x.id === projectId; });
    if (!p) return;
    var day = p.date ? parseInt(String(p.date).split('-')[2], 10) : new Date().getDate();
    var wi = getWeekIndex(day);
    if (wi !== weekNum) return;
    data.projects = projects.filter(function(x) { return x.id !== projectId; });
    saveData(data);
    render();
  }

  function showSumEditPopup(projectId, blockType, anchorEl) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var existing = document.getElementById('goalSumPopup');
    if (existing) existing.remove();
    var kpVal = String(p.mainPrice || (p.priceOptions && p.priceOptions[0]) || '').trim();
    var saleVal = String(p.saleAmount || '').trim();
    var isSold = blockType === 'sold';
    var fieldsHtml = '<div class="fg"><label>От какой суммы КП</label><input type="text" id="goalSumKp" placeholder="35000" value="' + esc(kpVal) + '"></div>';
    if (isSold) {
      fieldsHtml += '<div class="fg"><label>Сумма продажи итоговая</label><input type="text" id="goalSumSale" placeholder="38000" value="' + esc(saleVal) + '"></div>';
    }
    var popup = document.createElement('div');
    popup.id = 'goalSumPopup';
    popup.className = 'goal-sum-popup';
    popup.innerHTML = '<div class="goal-sum-popup-inner">' +
      '<div class="goal-sum-popup-title">Изменить сумму</div>' +
      '<div class="goal-sum-popup-body">' + fieldsHtml + '</div>' +
      '<div class="goal-sum-popup-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalSumPopup\')&&document.getElementById(\'goalSumPopup\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalSumSave">Сохранить</button>' +
      '</div></div>';
    document.body.appendChild(popup);
    var saveBtn = document.getElementById('goalSumSave');
    if (saveBtn) {
      saveBtn.onclick = function() {
        var kp = ((document.getElementById('goalSumKp') || {}).value || '').trim();
        var sale = isSold ? ((document.getElementById('goalSumSale') || {}).value || '').trim() : '';
        if (kp) {
          p.mainPrice = kp;
          if (!p.priceOptions || p.priceOptions.length === 0) p.priceOptions = [kp];
          else p.priceOptions[0] = kp;
        } else {
          p.mainPrice = '';
          p.priceOptions = [];
        }
        if (isSold) p.saleAmount = sale || '';
        saveData(data);
        popup.remove();
        render();
      };
    }
    popup.onclick = function(e) { if (e.target === popup) popup.remove(); };
    var el = anchorEl || document.querySelector('.goal-sum[data-id="' + projectId + '"]');
    if (el) {
      var r = el.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + 'px';
      popup.style.top = (r.bottom + 4) + 'px';
    }
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (popup && !popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 10);
  }

  function showPricePopup(projectId) {
    var data = loadData();
    var p = (data.projects || []).find(function(x) { return x.id === projectId; });
    if (!p || !p.priceOptions || p.priceOptions.length <= 1) return;
    var existing = document.getElementById('goalPricePopup');
    if (existing) existing.remove();
    var popup = document.createElement('div');
    popup.id = 'goalPricePopup';
    popup.className = 'goal-price-popup';
    popup.innerHTML = '<div class="goal-price-popup-title">Варианты КП</div><div class="goal-price-popup-list">' +
      (p.priceOptions || []).map(function(pr) { return '<div>' + esc(String(pr)) + '</div>'; }).join('') +
      '</div>';
    document.body.appendChild(popup);
    var btn = document.querySelector('.goal-row[data-id="' + projectId + '"] .goal-price');
    if (btn) {
      var r = btn.getBoundingClientRect();
      popup.style.left = r.left + 'px';
      popup.style.top = (r.bottom + 4) + 'px';
    }
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (!popup.contains(e.target) && e.target !== btn) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 10);
  }

  function openModal() {
    var existing = document.getElementById('goalModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'goalModal';
    modal.className = 'goal-modal-overlay';
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var statusChecks = STATUS_OPTIONS.map(function(s) {
      return '<label class="goal-check"><input type="checkbox" data-status="' + s.id + '"><span>' + esc(s.label) + '</span></label>';
    }).join('');
    var touchChecks = TOUCH_OPTIONS.map(function(t) {
      return '<label class="goal-check"><input type="checkbox" data-touch="' + t.id + '"><span>' + esc(t.label) + '</span></label>';
    }).join('');
    var emojiBtns = PROJECT_EMOJIS.map(function(e) {
      return '<span class="goal-emoji-btn' + (e === '📦' ? ' goal-emoji-sel' : '') + '" data-emoji="' + esc(e) + '">' + e + '</span>';
    }).join('');
    modal.innerHTML = '<div class="goal-modal">' +
      '<div class="goal-modal-head">Новый проект</div>' +
      '<div class="goal-modal-body">' +
        '<div class="fg"><label>Эмодзи</label><div class="goal-emoji-picker">' + emojiBtns + '</div></div>' +
        '<div class="fg"><label>Название проекта</label><input type="text" id="goalInpName" placeholder="Проект"></div>' +
        '<div class="fg"><label>Ссылка на папку Google</label><input type="text" id="goalInpFolder" placeholder="https://drive.google.com/..."></div>' +
        '<div class="fg"><label>Дата</label><input type="text" id="goalInpDate" placeholder="YYYY-MM-DD" value="' + todayStr + '"></div>' +
        '<div class="fg"><label>Цена КП</label><input type="number" id="goalInpPrice" placeholder="35000"></div>' +
        '<div class="fg"><label>Дополнительные варианты КП</label><input type="text" id="goalInpPrices" placeholder="42000, 48000"></div>' +
        '<div class="fg"><label>Заметка</label><textarea id="goalInpNote" placeholder="Заметки"></textarea></div>' +
        '<div class="fg"><label>Статусы</label><div class="goal-checks">' + statusChecks + '</div></div>' +
        '<div class="fg"><label>Касания</label><div class="goal-checks">' + touchChecks + '</div></div>' +
      '</div>' +
      '<div class="goal-modal-foot">' +
        '<button type="button" class="goal-modal-btn" onclick="document.getElementById(\'goalModal\').remove()">Отмена</button>' +
        '<button type="button" class="goal-modal-btn primary" id="goalModalSave">Сохранить</button>' +
      '</div>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.querySelectorAll('.goal-emoji-btn').forEach(function(btn) {
      btn.onclick = function() {
        modal.querySelectorAll('.goal-emoji-btn').forEach(function(b) { b.classList.remove('goal-emoji-sel'); });
        btn.classList.add('goal-emoji-sel');
      };
    });
    document.getElementById('goalModalSave').onclick = function() {
      var name = ((document.getElementById('goalInpName') || {}).value || '').trim();
      if (!name) { alert('Введите название'); return; }
      var selEmoji = modal.querySelector('.goal-emoji-btn.goal-emoji-sel');
      var emoji = selEmoji ? selEmoji.getAttribute('data-emoji') : '📦';
      var folderLink = ((document.getElementById('goalInpFolder') || {}).value || '').trim();
      var dateVal = ((document.getElementById('goalInpDate') || {}).value || '').trim() || todayStr;
      var mainPrice = ((document.getElementById('goalInpPrice') || {}).value || '').trim();
      var pricesStr = ((document.getElementById('goalInpPrices') || {}).value || '').trim();
      var prices = mainPrice ? [mainPrice] : [];
      if (pricesStr) prices = prices.concat(pricesStr.split(/[,;]/).map(function(x) { return x.trim(); }).filter(Boolean));
      if (!prices.length) prices = ['—'];
      var day = parseInt(dateVal.split('-')[2], 10) || 1;
      var weekIndex = getWeekIndex(day);
      var status = [];
      modal.querySelectorAll('input[data-status]:checked').forEach(function(cb) { status.push(cb.getAttribute('data-status')); });
      var touchMarkers = [];
      modal.querySelectorAll('input[data-touch]:checked').forEach(function(cb) { touchMarkers.push(cb.getAttribute('data-touch')); });
      var project = {
        id: generateId(),
        name: name,
        emoji: emoji,
        folderLink: folderLink || '',
        date: dateVal,
        weekIndex: weekIndex,
        mainPrice: prices[0],
        priceOptions: prices,
        status: status,
        touchMarkers: touchMarkers,
        note: (document.getElementById('goalInpNote') || {}).value || '',
        stage: 'weekly'
      };
      var data = loadData();
      data.projects = data.projects || [];
      data.projects.unshift(project);
      saveData(data);
      modal.remove();
      render();
    };
  }

  window.AVITOLOG_GOALS = { render: render };
})();
