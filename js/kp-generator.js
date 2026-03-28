/**
 * Вкладка «КП»: шаблоны Canva + черновик текста и превью картинки (localStorage на папку клиента).
 */
(function () {
  var KP_CANVA_TEMPLATES = [
    {
      id: 'metal',
      label: 'Металлоконструкции',
      editUrl: 'https://www.canva.com/design/DAHE0zwvYQ8/HGRsoHJvJkeWz9JTTfiqbA/edit'
    },
    {
      id: 'houses',
      label: 'Готовые дома',
      editUrl: 'https://www.canva.com/design/DAHEanek-dk/PvjGaJqz7RiRztCRlaBp9A/edit'
    },
    {
      id: 'loft',
      label: 'Лофт мебель',
      editUrl: 'https://www.canva.com/design/DAHEGrzdfk8/BZN5ypGcEw9Nf5IUGtnAGw/edit'
    }
  ];
  var MAX_B64 = 420000;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function templateById(id) {
    var tid = id || 'metal';
    for (var i = 0; i < KP_CANVA_TEMPLATES.length; i++) {
      if (KP_CANVA_TEMPLATES[i].id === tid) return KP_CANVA_TEMPLATES[i];
    }
    return KP_CANVA_TEMPLATES[0];
  }

  function buildClipboardText(d) {
    var t = templateById(d.templateId);
    var lines = [
      'КП — ' + t.label,
      'Заголовок: ' + (d.headline || ''),
      'Подзаголовок / слоган: ' + (d.subline || ''),
      'Ниша / примечание: ' + (d.niche || ''),
      'Картинка вверху: ' + (d.heroDataUrl ? '[файл сохранён в Avitolog]' : d.heroUrl ? d.heroUrl : '(не задана)'),
      '',
      'Шаблон Canva (редактор): ' + t.editUrl
    ];
    return lines.join('\n');
  }

  function syncOpenButton(mc, templateId) {
    var a = mc.querySelector('#kpOpenCanva');
    if (!a) return;
    var t = templateById(templateId);
    a.href = t.editUrl;
  }

  function wire(mc) {
    var d = loadDraft();
    var cards = mc.querySelectorAll('.kp-tpl-card');
    var fileInp = mc.querySelector('#kpHeroFile');
    var urlInp = mc.querySelector('#kpHeroUrl');
    var prev = mc.querySelector('#kpHeroPreview');
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
      c.onclick = function () {
        setTemplate(c.getAttribute('data-id'));
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

    syncOpenButton(mc, d.templateId || 'metal');
  }

  window.__showKpGenerator = function (mc) {
    if (!mc) return;
    var d = loadDraft();
    if (!d.templateId) d.templateId = 'metal';
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

    var tplHtml = KP_CANVA_TEMPLATES.map(function (t) {
      var on = d.templateId === t.id ? ' kp-tpl-on' : '';
      return (
        '<button type="button" class="kp-tpl-card' +
        on +
        '" data-id="' +
        esc(t.id) +
        '">' +
        '<span class="kp-tpl-name">' +
        esc(t.label) +
        '</span>' +
        '<span class="kp-tpl-hint">Canva</span></button>'
      );
    }).join('');

    var heroInner;
    if (d.heroDataUrl) {
      heroInner = '<img src="' + esc(d.heroDataUrl) + '" alt="" class="kp-hero-preview-img">';
    } else if (d.heroUrl) {
      heroInner = '<img src="' + esc(d.heroUrl) + '" alt="" class="kp-hero-preview-img" onerror="this.parentNode.innerHTML=\'&lt;div class=\\\'kp-hero-placeholder\\\'&gt;Не удалось загрузить&lt;/div&gt;\'">';
    } else {
      heroInner = '<div class="kp-hero-placeholder">Превью</div>';
    }

    mc.innerHTML =
      '<div class="kp-generator">' +
      '<div class="kp-gen-head">' +
      '<div class="kp-gen-title">Коммерческое предложение</div>' +
      '<p class="kp-gen-lead">Готовые шаблоны Canva по нише — откройте дизайн, замените верхнее фото и текст. Черновик полей сохраняется для выбранного клиента в этом браузере.</p>' +
      '</div>' +
      '<div class="kp-gen-section">' +
      '<div class="kp-gen-label">Шаблон</div>' +
      '<div class="kp-tpl-grid">' +
      tplHtml +
      '</div></div>' +
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
      esc(templateById(d.templateId).editUrl) +
      '">Открыть шаблон в Canva</a>' +
      '<button type="button" class="kp-btn kp-btn-secondary" id="kpCopyBrief">Скопировать текст для вставки</button>' +
      '<button type="button" class="kp-btn kp-btn-ghost" id="kpAiSuggest">Подсказать заголовок (AI)</button>' +
      '</div>' +
      '<p class="kp-gen-note">Автозапись макета в Canva без <a href="https://www.canva.com/developers/" target="_blank" rel="noopener">Canva Connect API</a> недоступна: дублируйте шаблон в Canva и подставьте поля вручную или через копирование текста выше.</p>' +
      '</div>';

    wire(mc);
  };
})();
