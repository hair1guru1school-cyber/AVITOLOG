/**
 * Вкладка «КП»: шаблоны Canva (товары / услуги), черновик, превью картинки.
 */
(function () {
  var KP_TEMPLATES_STORE = 'avitolog_kp_templates_v1';
  var MAX_B64 = 420000;

  var KP_DEFAULTS = {
    goods: [
      {
        id: 'metal',
        label: 'Металлоконструкции',
        emoji: '🏗️',
        editUrl: 'https://www.canva.com/design/DAHE0zwvYQ8/HGRsoHJvJkeWz9JTTfiqbA/edit'
      },
      {
        id: 'houses',
        label: 'Готовые дома',
        emoji: '🏠',
        editUrl: 'https://www.canva.com/design/DAHEanek-dk/PvjGaJqz7RiRztCRlaBp9A/edit'
      },
      {
        id: 'loft',
        label: 'Лофт мебель',
        emoji: '🛋️',
        editUrl: 'https://www.canva.com/design/DAHEGrzdfk8/BZN5ypGcEw9Nf5IUGtnAGw/edit'
      },
      {
        id: 'eva',
        label: 'EVA коврики',
        emoji: '🚗',
        editUrl: 'https://www.canva.com/design/DAHDqEjitiw/xKZVCkBBSlsMy9aQ0OSO_w/edit'
      },
      {
        id: 'stroymat',
        label: 'Стройматериалы',
        emoji: '🧱',
        editUrl: 'https://www.canva.com/design/DAHC5vnvfls/cVLZMm8L_Z89cEzzXWRJ1g/edit'
      },
      {
        id: 'okna',
        label: 'Окна',
        emoji: '🪟',
        editUrl: 'https://www.canva.com/design/DAHEXqdVnGY/b7Hza1YdE2gXqz0h__iWww/edit'
      },
      {
        id: 'beds',
        label: 'Детские кровати',
        emoji: '🛏️',
        editUrl: 'https://www.canva.com/design/DAHCTgOb_Q0/WI45xuieHuDPUi5JLOSrOQ/edit'
      },
      {
        id: 'bytovki',
        label: 'Бытовки',
        emoji: '🏢',
        editUrl: 'https://www.canva.com/design/DAHDnRFv_yY/9XFZv4Q3AkjDodwc_YgVbw/edit'
      }
    ],
    services: [
      {
        id: 'video',
        label: 'Видеонаблюдение',
        emoji: '📹',
        editUrl: 'https://www.canva.com/design/DAHD2aZP0Xk/DjVxgM1ZIN4aNdSt98rX0g/edit'
      },
      {
        id: 'elektrik',
        label: 'Электрик',
        emoji: '⚡',
        editUrl: 'https://www.canva.com/design/DAHAQAZLh8w/EWld6t9aXYmfXVRZ-a3LzQ/edit'
      },
      {
        id: 'zabory',
        label: 'Заборы под ключ',
        emoji: '🛡️',
        editUrl: 'https://www.canva.com/design/DAHCaTkRTDQ/_uNSttEZVvtno6FeqBPHVA/edit'
      }
    ]
  };

  var KP_EMOJI_PICK = [
    '📦','🏠','🏢','🏗️','🧱','🪵','🪟','🚗','🛻','🏍️','🔧','⚡','🛠️','🛋️','🛏️','🪑','💻','📱','📹','📸','🎯','🔥','⭐','💎','🛡️',
    '🧱','🪜','🔩','⚙️','🧰','🚪','🪟','🧴','💡','🔌','📋','📊','🏭','🏬','🛒','🧸','🎨','🖼️','🚿','🛁','🪚','🔨','⛓️','🔗',
    '🌲','🪵','🧱','🏘️','🏚️','🏡','🌇','🚧','🦺','👷','🤝','✨','💼','📈','🎁','🧾','💰','🏦','🐕','🌿','☀️','❄️','🌧️'
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deepClone(o) {
    try {
      return JSON.parse(JSON.stringify(o));
    } catch (e) {
      return o;
    }
  }

  function getMergedTemplates() {
    try {
      var s = localStorage.getItem(KP_TEMPLATES_STORE);
      if (s) {
        var d = JSON.parse(s);
        if (d && Array.isArray(d.goods) && Array.isArray(d.services) && d.goods.length + d.services.length > 0) {
          return d;
        }
      }
    } catch (e1) {}
    return deepClone(KP_DEFAULTS);
  }

  function saveTemplatesState(T) {
    try {
      localStorage.setItem(KP_TEMPLATES_STORE, JSON.stringify(T));
    } catch (e) {
      if (typeof alert === 'function') alert('Не удалось сохранить шаблоны.');
    }
  }

  function findTemplateById(id) {
    var T = getMergedTemplates();
    var i;
    for (i = 0; i < T.goods.length; i++) {
      if (T.goods[i].id === id) return { item: T.goods[i], cat: 'goods', T: T };
    }
    for (i = 0; i < T.services.length; i++) {
      if (T.services[i].id === id) return { item: T.services[i], cat: 'services', T: T };
    }
    return null;
  }

  function getFirstTemplateId() {
    var T = getMergedTemplates();
    if (T.goods && T.goods[0]) return T.goods[0].id;
    if (T.services && T.services[0]) return T.services[0].id;
    return 'metal';
  }

  function moveTemplateBetweenCategories(id, fromCat, toCat) {
    if (fromCat === toCat) return;
    var T = deepClone(getMergedTemplates());
    var from = T[fromCat];
    var to = T[toCat];
    if (!from || !to) return;
    var idx = -1;
    var k;
    for (k = 0; k < from.length; k++) {
      if (from[k].id === id) {
        idx = k;
        break;
      }
    }
    if (idx < 0) return;
    var item = from.splice(idx, 1)[0];
    to.push(item);
    saveTemplatesState(T);
  }

  function getAc() {
    try {
      if (typeof window._activeClient !== 'undefined' && window._activeClient) return window._activeClient;
      if (typeof getActiveClient === 'function') return getActiveClient();
    } catch (e) {}
    return null;
  }

  function kpStorageKey() {
    var ac = getAc();
    var fid = ac && ac.folderId ? String(ac.folderId) : 'global';
    return 'avitolog_kp_draft_v1_' + fid;
  }

  function loadDraft() {
    try {
      var s = localStorage.getItem(kpStorageKey());
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }

  function saveDraft(d) {
    try {
      localStorage.setItem(kpStorageKey(), JSON.stringify(d));
    } catch (e) {
      if (typeof alert === 'function') alert('Не удалось сохранить (возможно, картинка слишком большая для хранилища).');
    }
  }

  function templateForDraft(id) {
    var f = findTemplateById(id);
    if (f && f.item) return f.item;
    var f2 = findTemplateById(getFirstTemplateId());
    if (f2 && f2.item) return f2.item;
    return { label: 'Шаблон', editUrl: '#', emoji: '📋' };
  }

  function buildClipboardText(d) {
    var t = templateForDraft(d.templateId || getFirstTemplateId());
    var lines = [
      'КП — ' + (t.label || ''),
      'Заголовок: ' + (d.headline || ''),
      'Подзаголовок / слоган: ' + (d.subline || ''),
      'Ниша / примечание: ' + (d.niche || ''),
      'Картинка вверху: ' + (d.heroDataUrl ? '[файл сохранён в Avitolog]' : d.heroUrl ? d.heroUrl : '(не задана)'),
      '',
      'Шаблон Canva (редактор): ' + (t.editUrl || '')
    ];
    return lines.join('\n');
  }

  function syncOpenButton(mc, templateId) {
    var a = mc.querySelector('#kpOpenCanva');
    if (!a) return;
    var t = templateForDraft(templateId);
    a.href = t.editUrl || '#';
  }

  function buildTemplateZonesHtml(d) {
    var T = getMergedTemplates();
    function cardsHtml(list, cat) {
      return (list || [])
        .map(function (t) {
          var on = d.templateId === t.id ? ' kp-tpl-on' : '';
          return (
            '<button type="button" class="kp-tpl-card' +
            on +
            '" data-id="' +
            esc(t.id) +
            '" data-cat="' +
            cat +
            '" draggable="true" title="ЛКМ — выбрать · ПКМ — изменить · перетащить в другую колонку">' +
            '<span class="kp-tpl-emoji">' +
            esc(t.emoji || '📋') +
            '</span>' +
            '<span class="kp-tpl-name">' +
            esc(t.label || '') +
            '</span></button>'
          );
        })
        .join('');
    }
    return (
      '<div class="kp-tpl-zones">' +
      '<div class="kp-tpl-zone kp-tpl-zone-goods" data-kp-cat="goods" ondragover="window.__kpTplZoneDragOver&&window.__kpTplZoneDragOver(event)" ondragleave="window.__kpTplZoneDragLeave&&window.__kpTplZoneDragLeave(event)" ondrop="window.__kpTplZoneDrop&&window.__kpTplZoneDrop(event)">' +
      '<div class="kp-tpl-zone-label">Товары</div>' +
      '<div class="kp-tpl-grid">' +
      cardsHtml(T.goods, 'goods') +
      '</div></div>' +
      '<div class="kp-tpl-zone kp-tpl-zone-services" data-kp-cat="services" ondragover="window.__kpTplZoneDragOver&&window.__kpTplZoneDragOver(event)" ondragleave="window.__kpTplZoneDragLeave&&window.__kpTplZoneDragLeave(event)" ondrop="window.__kpTplZoneDrop&&window.__kpTplZoneDrop(event)">' +
      '<div class="kp-tpl-zone-label">Услуги</div>' +
      '<div class="kp-tpl-grid">' +
      cardsHtml(T.services, 'services') +
      '</div></div></div>'
    );
  }

  function closeKpTplModal() {
    var m = document.getElementById('kpTplEditModal');
    if (m && m._kpEsc) {
      document.removeEventListener('keydown', m._kpEsc);
      m._kpEsc = null;
    }
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function openKpTemplateEditor(id, cat, mc) {
    closeKpTplModal();
    var found = findTemplateById(id);
    if (!found) return;
    var item = found.item;
    var wrap = document.createElement('div');
    wrap.id = 'kpTplEditModal';
    wrap.className = 'kp-tpl-modal';
    var emojiGrid = KP_EMOJI_PICK.map(function (em) {
      return (
        '<button type="button" class="kp-emoji-cell" data-emoji="' +
        esc(em) +
        '" title="' +
        esc(em) +
        '">' +
        esc(em) +
        '</button>'
      );
    }).join('');
    wrap.innerHTML =
      '<div class="kp-tpl-modal-backdrop"></div>' +
      '<div class="kp-tpl-modal-panel">' +
      '<div class="kp-tpl-modal-title">Шаблон: правка</div>' +
      '<p class="kp-tpl-modal-hint">Эмодзи, название и ссылка на редактирование в Canva</p>' +
      '<label class="kp-tpl-modal-lbl">Эмодзи</label>' +
      '<div class="kp-emoji-grid" id="kpEmojiGrid">' +
      emojiGrid +
      '</div>' +
      '<label class="kp-tpl-modal-lbl">Название</label>' +
      '<input type="text" class="kp-inp" id="kpTplEditLabel" value="' +
      esc(item.label || '') +
      '">' +
      '<label class="kp-tpl-modal-lbl">Ссылка Canva (edit)</label>' +
      '<input type="url" class="kp-inp" id="kpTplEditUrl" value="' +
      esc(item.editUrl || '') +
      '">' +
      '<div class="kp-tpl-modal-actions">' +
      '<button type="button" class="kp-btn kp-btn-secondary" id="kpTplEditCancel">Отмена</button>' +
      '<button type="button" class="kp-btn kp-btn-primary" id="kpTplEditSave">Сохранить</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    var selEmoji = item.emoji || '📋';
    function markSel() {
      wrap.querySelectorAll('.kp-emoji-cell').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-emoji') === selEmoji);
      });
    }
    markSel();
    wrap.querySelectorAll('.kp-emoji-cell').forEach(function (b) {
      b.onclick = function () {
        selEmoji = b.getAttribute('data-emoji') || '📋';
        markSel();
      };
    });
    wrap.querySelector('.kp-tpl-modal-backdrop').onclick = closeKpTplModal;
    wrap.querySelector('#kpTplEditCancel').onclick = closeKpTplModal;
    function onEsc(ev) {
      if (ev.key === 'Escape') closeKpTplModal();
    }
    wrap._kpEsc = onEsc;
    document.addEventListener('keydown', onEsc);
    wrap.querySelector('#kpTplEditSave').onclick = function () {
      var lbl = wrap.querySelector('#kpTplEditLabel');
      var url = wrap.querySelector('#kpTplEditUrl');
      var T = deepClone(getMergedTemplates());
      var arr = T[cat];
      var it = arr.find(function (x) {
        return x.id === id;
      });
      if (it) {
        it.label = lbl && lbl.value ? String(lbl.value).trim() : it.label;
        it.editUrl = url && url.value ? String(url.value).trim() : it.editUrl;
        it.emoji = selEmoji;
        saveTemplatesState(T);
      }
      closeKpTplModal();
      if (typeof window.__showKpGenerator === 'function' && mc) window.__showKpGenerator(mc);
    };
  }

  window.__kpTplDragStart = function (e) {
    var c = e.target.closest('.kp-tpl-card');
    if (!c) return;
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ id: c.getAttribute('data-id'), cat: c.getAttribute('data-cat') })
    );
    e.dataTransfer.effectAllowed = 'move';
    c.classList.add('kp-tpl-dragging');
  };

  window.__kpTplDragEnd = function (e) {
    var c = e.target.closest('.kp-tpl-card');
    if (c) c.classList.remove('kp-tpl-dragging');
    document.querySelectorAll('.kp-tpl-zone-dragover').forEach(function (z) {
      z.classList.remove('kp-tpl-zone-dragover');
    });
  };

  window.__kpTplZoneDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var z = e.currentTarget;
    if (z && z.classList) z.classList.add('kp-tpl-zone-dragover');
  };

  window.__kpTplZoneDragLeave = function (e) {
    var z = e.currentTarget;
    if (z && (!e.relatedTarget || !z.contains(e.relatedTarget))) z.classList.remove('kp-tpl-zone-dragover');
  };

  window.__kpTplZoneDrop = function (e) {
    e.preventDefault();
    var zone = e.currentTarget;
    if (zone) zone.classList.remove('kp-tpl-zone-dragover');
    var dropCat = zone.getAttribute('data-kp-cat');
    var json = e.dataTransfer.getData('application/json');
    if (!json || !dropCat) return;
    try {
      var payload = JSON.parse(json);
      if (!payload || !payload.id || !payload.cat) return;
      if (payload.cat === dropCat) return;
      moveTemplateBetweenCategories(payload.id, payload.cat, dropCat);
      var mc = document.getElementById('mainContent');
      if (mc && typeof window.__showKpGenerator === 'function') window.__showKpGenerator(mc);
    } catch (err) {}
  };

  function wire(mc) {
    var d = loadDraft();
    var cards = mc.querySelectorAll('.kp-tpl-card');
    var fileInp = mc.querySelector('#kpHeroFile');
    var urlInp = mc.querySelector('#kpHeroUrl');
    var headlineInp = mc.querySelector('#kpHeadline');
    var subInp = mc.querySelector('#kpSubline');
    var nicheTa = mc.querySelector('#kpNiche');

    function setTemplate(id) {
      cards.forEach(function (c) {
        c.classList.toggle('kp-tpl-on', c.getAttribute('data-id') === id);
      });
      d.templateId = id;
      syncOpenButton(mc, id);
      saveDraft(d);
    }

    cards.forEach(function (c) {
      c.onclick = function (ev) {
        if (ev.button !== 0) return;
        setTemplate(c.getAttribute('data-id'));
      };
      c.oncontextmenu = function (ev) {
        ev.preventDefault();
        openKpTemplateEditor(c.getAttribute('data-id'), c.getAttribute('data-cat'), mc);
      };
      c.ondragstart = function (e) {
        window.__kpTplDragStart(e);
      };
      c.ondragend = function (e) {
        window.__kpTplDragEnd(e);
      };
    });

    function persistFields() {
      d.headline = headlineInp ? headlineInp.value.trim() : '';
      d.subline = subInp ? subInp.value.trim() : '';
      d.niche = nicheTa ? nicheTa.value.trim() : '';
      d.heroUrl = urlInp ? urlInp.value.trim() : '';
      saveDraft(d);
    }

    if (headlineInp) {
      headlineInp.onchange = persistFields;
      headlineInp.onblur = persistFields;
    }
    if (subInp) {
      subInp.onchange = persistFields;
      subInp.onblur = persistFields;
    }
    if (nicheTa) {
      nicheTa.onchange = persistFields;
      nicheTa.onblur = persistFields;
    }
    if (urlInp) {
      urlInp.onchange = function () {
        d.heroUrl = urlInp.value.trim();
        if (d.heroUrl) d.heroDataUrl = '';
        saveDraft(d);
        window.__showKpGenerator(mc);
      };
    }

    if (fileInp) {
      fileInp.onchange = function () {
        var f = fileInp.files && fileInp.files[0];
        if (!f || !f.type || f.type.indexOf('image/') !== 0) return;
        var r = new FileReader();
        r.onload = function () {
          var b64 = String(r.result || '');
          if (b64.length > MAX_B64) {
            if (typeof alert === 'function') {
              alert('Файл слишком большой для сохранения в браузере. Уменьшите JPG или вставьте ссылку на картинку.');
            }
            d.heroDataUrl = '';
            saveDraft(d);
            window.__showKpGenerator(mc);
            return;
          }
          d.heroDataUrl = b64;
          d.heroUrl = '';
          if (urlInp) urlInp.value = '';
          saveDraft(d);
          window.__showKpGenerator(mc);
        };
        r.readAsDataURL(f);
      };
    }

    var clearBtn = mc.querySelector('#kpHeroClear');
    if (clearBtn) {
      clearBtn.onclick = function () {
        d.heroDataUrl = '';
        d.heroUrl = '';
        if (urlInp) urlInp.value = '';
        if (fileInp) fileInp.value = '';
        saveDraft(d);
        window.__showKpGenerator(mc);
      };
    }

    var copyBtn = mc.querySelector('#kpCopyBrief');
    if (copyBtn) {
      copyBtn.onclick = function () {
        persistFields();
        d = loadDraft();
        var txt = buildClipboardText(d);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () {
            copyBtn.textContent = 'Скопировано ✓';
            setTimeout(function () {
              copyBtn.textContent = 'Скопировать текст для вставки';
            }, 2000);
          }).catch(function () {
            prompt('Копирование:', txt);
          });
        } else {
          prompt('Копирование:', txt);
        }
      };
    }

    var aiBtn = mc.querySelector('#kpAiSuggest');
    if (aiBtn) {
      aiBtn.onclick = function () {
        var ac = getAc();
        var niche = (nicheTa && nicheTa.value.trim()) || (ac && ac.category) || '';
        var company = (ac && (ac.company || ac.contact_name)) || '';
        if (typeof callAPI !== 'function') {
          if (typeof alert === 'function') alert('AI недоступен: загрузите страницу полностью.');
          return;
        }
        aiBtn.disabled = true;
        var prompt =
          'Придумай один короткий заголовок для обложки коммерческого предложения по продвижению на Авито (русский). ' +
          'Компания/контекст: ' +
          (company || 'клиент') +
          '. Ниша: ' +
          (niche || 'не указана') +
          '. Ответь одной строкой до 80 символов, без кавычек.';
        callAPI(prompt, 120)
          .then(function (raw) {
            var line = String(raw || '')
              .replace(/\s+/g, ' ')
              .trim()
              .split('\n')[0]
              .slice(0, 120);
            if (headlineInp && line) headlineInp.value = line;
            persistFields();
          })
          .catch(function (e) {
            if (typeof alert === 'function') alert(String((e && e.message) || e));
          })
          .then(function () {
            aiBtn.disabled = false;
          });
      };
    }

    syncOpenButton(mc, d.templateId || getFirstTemplateId());
  }

  window.__showKpGenerator = function (mc) {
    if (!mc) return;
    var d = loadDraft();
    var firstId = getFirstTemplateId();
    if (!d.templateId || !findTemplateById(d.templateId)) d.templateId = firstId;
    if (!d.niche) {
      try {
        var catEl = document.getElementById('category');
        var cat = catEl && String(catEl.value || '').trim();
        if (cat) {
          d.niche = cat;
          saveDraft(d);
        }
      } catch (e1) {}
    }

    var heroInner;
    if (d.heroDataUrl) {
      heroInner = '<img src="' + esc(d.heroDataUrl) + '" alt="" class="kp-hero-preview-img">';
    } else if (d.heroUrl) {
      heroInner =
        '<img src="' +
        esc(d.heroUrl) +
        '" alt="" class="kp-hero-preview-img" onerror="this.parentNode.innerHTML=\'&lt;div class=\\\'kp-hero-placeholder\\\'&gt;Не удалось загрузить&lt;/div&gt;\'">';
    } else {
      heroInner = '<div class="kp-hero-placeholder">Превью</div>';
    }

    var tSel = templateForDraft(d.templateId);
    mc.innerHTML =
      '<div class="kp-generator">' +
      '<div class="kp-gen-head">' +
      '<div class="kp-gen-title">Коммерческое предложение</div>' +
      '</div>' +
      '<div class="kp-gen-section">' +
      '<div class="kp-gen-label">Шаблон</div>' +
      buildTemplateZonesHtml(d) +
      '</div>' +
      '<div class="kp-gen-section">' +
      '<div class="kp-gen-label">Картинка вверху</div>' +
      '<div class="kp-hero-row">' +
      '<div class="kp-hero-preview" id="kpHeroPreview">' +
      heroInner +
      '</div>' +
      '<div class="kp-hero-actions">' +
      '<label class="kp-btn kp-btn-secondary">Загрузить файл<input type="file" id="kpHeroFile" accept="image/*" style="display:none"></label>' +
      '<input type="url" id="kpHeroUrl" class="kp-inp" placeholder="Или URL картинки (https://…)" value="' +
      esc(d.heroUrl || '') +
      '">' +
      '<button type="button" class="kp-btn kp-btn-ghost" id="kpHeroClear">Сбросить</button>' +
      '</div></div></div>' +
      '<div class="kp-gen-section kp-gen-grid">' +
      '<div class="fg"><label>Заголовок</label><input type="text" id="kpHeadline" class="kp-inp" value="' +
      esc(d.headline || '') +
      '" placeholder="Например: СТРАТЕГИИ ПРОДВИЖЕНИЯ"></div>' +
      '<div class="fg"><label>Подзаголовок / слоган</label><input type="text" id="kpSubline" class="kp-inp" value="' +
      esc(d.subline || '') +
      '" placeholder="ВЫГОДНО / БЫСТРО / НАДЕЖНО"></div>' +
      '<div class="fg kp-span2"><label>Ниша / заметки для вставки</label><textarea id="kpNiche" class="kp-ta" rows="3" placeholder="Кратко: что важно отразить в КП">' +
      esc(d.niche || '') +
      '</textarea></div>' +
      '</div>' +
      '<div class="kp-gen-actions">' +
      '<a class="kp-btn kp-btn-primary" id="kpOpenCanva" target="_blank" rel="noopener" href="' +
      esc(tSel.editUrl || '#') +
      '">Открыть шаблон в Canva</a>' +
      '<button type="button" class="kp-btn kp-btn-secondary" id="kpCopyBrief">Скопировать текст для вставки</button>' +
      '<button type="button" class="kp-btn kp-btn-ghost" id="kpAiSuggest">Подсказать заголовок (AI)</button>' +
      '</div>' +
      '<p class="kp-gen-note">Автозапись макета в Canva без <a href="https://www.canva.com/developers/" target="_blank" rel="noopener">Canva Connect API</a> недоступна: дублируйте шаблон в Canva и подставьте поля вручную или через копирование текста выше.</p>' +
      '</div>';

    wire(mc);
  };
})();
