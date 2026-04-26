(function () {
  'use strict';

  var LS_KEY = 'avitolog_scripts_v2';

  var SCRIPTS_DEFAULT = [
    // col 0 = left (teal)
    {
      id: 'kp-append', label: 'С КП приписка', col: 0, color: '#0d9488', emoji: '📎',
      text: '🤝 Вот подробное коммерческое предложение с выгодными стратегиями по продвижению вашего магазина! \n\nЖду от вас обратную связь\n\n1) Договор с моим ИП\n2) Каждые 3 дня до запуска даю отчет о работе\n3) Всегда на связи - всегда в ваших аккаунтах\n4) Имею большой опыт в данной категории. \n\nА мой опыт на Авито уже более 9 лет\nРезультат гарантирую'
    },
    {
      id: 'market', label: 'Анализ рынка', col: 0, color: '#0d9488', emoji: '💡',
      text: '💡 Также прикладываю подробный анализ по ключевым позициям, целевым аудиториям и стратегии запуска — в нём:\n✨ Чёткая картина рынка и сезонности\n👥 Подробное описание ЦА с их болями и потребностями\n📦 Продуктовая матрица и варианты апсейла\n🔑 Полное семантическое ядро и ключи для продвижения\n📍 Гео-сетка и структура карточек\n🚀 Пошаговый план масштабирования от первых запусков до полного охвата'
    },
    {
      id: 'packaging', label: 'Упаковка', col: 0, color: '#0d9488', emoji: '🎨',
      text: '+ Дополнительное портфолио именно по упаковке аккаунта - это дает особенно высокое качество рекламы и позиционирования, что в свою очередь дает до +40% конверсии'
    },
    {
      id: 'text-audit', label: 'Аудит текста', col: 0, color: '#0d9488', emoji: '📝',
      text: '📝 Также направляю подробный аудит вашего текста в объявлении с подсвечиванием всех слабых мест, где теряется конверсия \n\n+ Пример качественного текста объявления '
    },
    {
      id: 'why-now', label: 'Почему сейчас', col: 0, color: '#0d9488', emoji: '⏰',
      text: 'Также направляю - почему стоит запускаться уже сейчас'
    },
    {
      id: 'bot', label: 'БОТ автоответ', col: 0, color: '#0d9488', emoji: '🤖',
      text: '🤖 БОТ в Avito — он даёт до +20–30% к конверсии в диалог\n\n⚡️ Мгновенный ответ → заявка не «остывает» и не уходит конкуренту\n\n📈 Рост показателей аккаунта за счёт скорости реакции\n\n📞 Сбор контактов без давления — больше тёплых заявок\n\n🧭 Клиент сразу понимает, куда попал и что будет дальше'
    },
    {
      id: 'launch-map', label: 'Карта запуска', col: 0, color: '#0d9488', emoji: '🗺️',
      text: ''
    },
    // col 1 = right (various colors)
    {
      id: 'paid', label: 'Оплачено', col: 1, color: '#b07d10', emoji: '🤝',
      text: '🤝Благодарю за доверие - деньги пришли, начинаю работу. В течение 30 минут направлю вам бриф с доп. вопросами по проекту'
    },
    {
      id: 'brief-service', label: 'БРИФ услуга', col: 1, color: '#9a8300', emoji: '❓',
      text: '🖥️ почта/номер и пароль от аккаунта \n📲 Номер - звонков с Авито (может совпадать с логином)\n📷 Если есть - кидайте свои фото за работой. Кейсы услуги в фото. Если нет - беру из сети по услугам ( \n👤 опишите чуть подробнее вашего клиента: что для него важно? чего боится? что очень хочет? (я владею маркетинговыми данными, но всегда готов выслушать мнение клиента)\n✅ Расскажите ваши главные выгоды для клиента, исходя из качества услуги?\n📍 Есть ли у вас база  - по какому адресу?\n🚛 какие условия и время услуги, есть ли другие дополнительные услуги? \n🕘 Какие у вас рабочие часы?  \n💶 Какие услуги сколько стоят?\n⚙️ Какое оборудование используются в ваших услугах?'
    },
    {
      id: 'brief-goods', label: 'БРИФ товар', col: 1, color: '#9a8300', emoji: '❓',
      text: 'Направляю мини бриф\n\n🔐 Почта/номер и пароль от аккаунта \n📲 Номер - звонков с Авито \n📷 Если есть - направляйте свои фото. Если нет - беру из сети или обрисовываю (но нужны от вас рекомендации) \n👤 Опишите чуть подробнее вашего клиента: что для него важно? чего боится? чего хочет?\n✅ Расскажите ваши главные выгоды для клиента, исходя из качества товара?\n📍 Есть ли у вас склады / магазины - по какому адресу? Й\n🚛 какие условия и время доставки, есть ли монтаж или другие дополнительные услуги? \n🕘 Какие у вас рабочие часы? \n💶 Какие у вас позиции сколько стоят?\n⚙️ Какие материалы используются в ваших позициях? Какие характеристики у каждой позиции? (если известно - весь, габариты, состав, название и т.д. если удобно, можно таблицей)'
    },
    {
      id: 'not-responding', label: '❌ Не отвечает', col: 1, color: '#8b2020', emoji: '❌',
      isVariant: true,
      activeVariant: 0,
      variants: [
        'Приветствую! Напоминаю о нашем предложении по запуску рекламы на Авито 📈\n\n✅ Продвижение по вашей нише сейчас особенно актуально — сезон растёт, конкуренты уже начинают активные кампании.\n\nСкажите, удалось ли ознакомиться с коммерческим предложением?\nКакой из вариантов вам ближе — стартовый запуск или расширенное ведение?\n\n❌ Если пока не планируете запуск — тоже дайте обратную связь, чтобы я знал, как быть полезен в будущем.\n\n💬 Если остались вопросы по форматам работы, срокам, бюджету — напишите, я подскажу всё честно и без воды.\n\n📲 Удобные каналы для связи:\nhttps://t.me/+DO-Yx5_Zud05YjMy\nhttps://t.me/+qS7a4EtGpOw2ZjNi\n\nЖду вашего решения и готов выйти на результат — быстро и эффективно!',
        'Приветсую! Скажите, пожалуйста, для вас еще актуально продвижение на Авито? \n\nЖду от вас обратной связи, готов ответить на все вопросы + предложить гибкие условия оплаты\n\n⏸️ А если вы пока решили взять паузу\n\nТо не упускайте условия данного КП \n\nЗаходите в канал моей команды\nhttps://t.me/+DO-Yx5_Zud05YjMy  \n\n☑️ И данное предложение будет активно до 30 дней'
      ]
    },
    {
      id: 'installment', label: 'Рассрочка', col: 1, color: '#166534', emoji: '💰',
      text: 'Приветствую!\n\nЕсли запуск актуален, и вопрос только в бюджете\n\nТо есть хорошая новость по нашему проекту\n\n🤝 Сейчас появилась  возможность провести оплату в беспроцентную рассрочку — без первого платежа и без переплат\n\nМы можем начать работу сразу, а оплатить можно, по сути после одобрения и только со следующего месяца. \n\nПри желании — сможете закрыть её досрочно, когда получите оплату от своего клиента.\n\n📲 Все бонусы и условия из коммерческого я полностью сохраняю.\n\nЕсли вам интересно, я направлю ссылку на оформление рассрочки — ровно на ту сумму пакета, который вы выбрали.\n\nМожно просто проверить, одобрят или нет, а решение о покупке примете уже после одобрения.'
    },
    {
      id: 'cases', label: 'Кейсы', col: 1, color: '#1e3a8a', emoji: '💎',
      text: ''
    },
    {
      id: 'with-contract', label: 'С договором', col: 1, color: '#78533a', emoji: '📃',
      text: 'Направляю договор, приложение и реквизиты для оплаты (Счет / Qr код моего ИП)\n\n☑️  После оплаты, договор подписан - и далее я сформирую бриф c доп. вопросами для старта'
    }
  ];

  function loadData() {
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!saved || !Array.isArray(saved)) return deepCopy(SCRIPTS_DEFAULT);
      var byId = {};
      saved.forEach(function (s) { byId[s.id] = s; });
      return SCRIPTS_DEFAULT.map(function (def) {
        var s = byId[def.id];
        if (!s) return deepCopy(def);
        var out = deepCopy(def);
        if (def.isVariant) {
          if (Array.isArray(s.variants) && s.variants.length >= 2) out.variants = s.variants;
          if (typeof s.activeVariant === 'number') out.activeVariant = s.activeVariant;
        } else {
          if (typeof s.text === 'string') out.text = s.text;
        }
        return out;
      });
    } catch (e) {
      return deepCopy(SCRIPTS_DEFAULT);
    }
  }

  function saveData(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function flashBtn(btn, label) {
    var lbl = btn.querySelector('.sp-btn-label');
    if (!lbl) return;
    var orig = lbl.textContent;
    lbl.textContent = '✅ Скопировано!';
    btn.classList.add('sp-btn-copied');
    setTimeout(function () {
      lbl.textContent = label;
      btn.classList.remove('sp-btn-copied');
    }, 1500);
  }

  function openEditModal(scripts, idx, onSave) {
    var script = scripts[idx];
    var overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay';
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.className = 'sp-modal';
    overlay.appendChild(modal);

    var title = document.createElement('div');
    title.className = 'sp-modal-title';
    title.textContent = '✏️ Редактировать: ' + script.label;
    modal.appendChild(title);

    var currentTab = script.isVariant ? (script.activeVariant || 0) : 0;
    var varTexts = script.isVariant ? script.variants.slice() : [script.text];

    if (script.isVariant) {
      var tabsRow = document.createElement('div');
      tabsRow.className = 'sp-modal-tabs';
      ['Вариант 1', 'Вариант 2'].forEach(function (lbl, vi) {
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'sp-modal-tab' + (vi === currentTab ? ' active' : '');
        tab.textContent = lbl;
        tab.onclick = function () {
          varTexts[currentTab] = ta.value;
          currentTab = vi;
          tabsRow.querySelectorAll('.sp-modal-tab').forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          ta.value = varTexts[currentTab];
        };
        tabsRow.appendChild(tab);
      });
      modal.appendChild(tabsRow);
    }

    var ta = document.createElement('textarea');
    ta.className = 'sp-modal-textarea';
    ta.value = varTexts[currentTab];
    modal.appendChild(ta);

    var btnsRow = document.createElement('div');
    btnsRow.className = 'sp-modal-btns';
    modal.appendChild(btnsRow);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sp-modal-btn sp-modal-save';
    saveBtn.textContent = 'Сохранить';
    saveBtn.onclick = function () {
      varTexts[currentTab] = ta.value;
      if (script.isVariant) {
        scripts[idx].variants = varTexts;
      } else {
        scripts[idx].text = varTexts[0];
      }
      saveData(scripts);
      onSave();
      document.body.removeChild(overlay);
    };
    btnsRow.appendChild(saveBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sp-modal-btn sp-modal-cancel';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.onclick = function () { document.body.removeChild(overlay); };
    btnsRow.appendChild(cancelBtn);

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    setTimeout(function () { ta.focus(); }, 50);
  }

  function openVariantPicker(scripts, idx) {
    var script = scripts[idx];
    var overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay';
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.className = 'sp-modal sp-variant-modal';
    overlay.appendChild(modal);

    var title = document.createElement('div');
    title.className = 'sp-modal-title';
    title.textContent = '❌ Не отвечает — выберите вариант';
    modal.appendChild(title);

    var vbtns = document.createElement('div');
    vbtns.className = 'sp-variant-btns';
    modal.appendChild(vbtns);

    script.variants.forEach(function (text, vi) {
      var vbtn = document.createElement('button');
      vbtn.type = 'button';
      vbtn.className = 'sp-variant-pick-btn';
      vbtn.textContent = 'Вариант ' + (vi + 1);
      vbtn.onclick = function () {
        copyText(text);
        vbtn.textContent = '✅ Скопировано!';
        setTimeout(function () { document.body.removeChild(overlay); }, 900);
      };
      vbtns.appendChild(vbtn);
    });

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sp-modal-btn sp-modal-cancel';
    closeBtn.style.marginTop = '8px';
    closeBtn.textContent = 'Закрыть';
    closeBtn.onclick = function () { document.body.removeChild(overlay); };
    modal.appendChild(closeBtn);

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  function buildBtn(script, idx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-btn';
    btn.dataset.spIdx = idx;
    btn.style.background = script.color + '28';
    btn.style.borderColor = script.color + '80';

    var emojiEl = document.createElement('span');
    emojiEl.className = 'sp-btn-emoji';
    emojiEl.textContent = script.emoji || '';
    btn.appendChild(emojiEl);

    var labelEl = document.createElement('span');
    labelEl.className = 'sp-btn-label';
    labelEl.textContent = script.label;
    btn.appendChild(labelEl);

    if (script.isVariant) {
      var tag = document.createElement('span');
      tag.className = 'sp-btn-tag';
      tag.textContent = '2 вар.';
      btn.appendChild(tag);
    }

    return btn;
  }

  function renderPanel(container, scripts) {
    container.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'sp-panel';
    container.appendChild(wrap);

    var header = document.createElement('div');
    header.className = 'sp-panel-header';
    header.innerHTML = '<span class="sp-panel-title">📋 Скрипты</span><span class="sp-panel-hint">ЛКМ — скопировать · ПКМ — редактировать</span>';
    wrap.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'sp-grid';
    wrap.appendChild(grid);

    var leftScripts = scripts.filter(function (s) { return s.col === 0; });
    var rightScripts = scripts.filter(function (s) { return s.col === 1; });
    var rows = Math.max(leftScripts.length, rightScripts.length);

    for (var i = 0; i < rows; i++) {
      var l = leftScripts[i];
      var r = rightScripts[i];

      if (l) {
        var lIdx = scripts.indexOf(l);
        var lBtn = buildBtn(l, lIdx);
        grid.appendChild(lBtn);
        attachListeners(lBtn, scripts, lIdx, container);
      } else {
        grid.appendChild(document.createElement('div'));
      }

      if (r) {
        var rIdx = scripts.indexOf(r);
        var rBtn = buildBtn(r, rIdx);
        grid.appendChild(rBtn);
        attachListeners(rBtn, scripts, rIdx, container);
      } else {
        grid.appendChild(document.createElement('div'));
      }
    }
  }

  function attachListeners(btn, scripts, idx, container) {
    var script = scripts[idx];

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (script.isVariant) {
        openVariantPicker(scripts, idx);
      } else {
        copyText(script.text);
        flashBtn(btn, script.label);
      }
    });

    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      openEditModal(scripts, idx, function () {
        renderPanel(container, scripts);
      });
    });
  }

  window.__showScriptsPanel = function (container) {
    var scripts = loadData();
    renderPanel(container, scripts);
  };
})();
