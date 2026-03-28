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
        id: 'mebel_krovati',
        label: 'Мебель — Кровати',
        emoji: '🛋️',
        editUrl: 'https://www.canva.com/design/DAG_6XnMUIo/lSFOhOeCN-2ApBxgBOCiqw/edit'
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
      },
      {
        id: 'gruzoperevozki',
        label: 'Грузоперевозки',
        emoji: '🚚',
        editUrl: 'https://www.canva.com/design/DAHFHnGbvq0/Rw2adI-I6A8xS74vhKkasg/edit'
      },
      {
        id: 'dorozhnye',
        label: 'Дорожные работы',
        emoji: '🛣️',
        editUrl: 'https://www.canva.com/design/DAHDpWoN04w/N_bLLLPn7QRQ-N1O4t6jlQ/edit'
      },
      {
        id: 'stroyka_krym',
        label: 'Стройка Крым',
        emoji: '🏗️',
        editUrl: 'https://www.canva.com/design/DAHAMA1yjhk/LUP0lWwOzmHW3uqDbUMItg/edit'
      }
    ]
  };

  var KP_EMOJI_PICK = [
    '📦','🏠','🏢','🏗️','🧱','🪵','🪟','🚗','🛻','🏍️','🔧','⚡','🛠️','🛋️','🛏️','🪑','💻','📱','📹','📸','🎯','🔥','⭐','💎','🛡️',
    '🧱','🪜','🔩','⚙️','🧰','🚪','🪟','🧴','💡','🔌','📋','📊','🏭','🏬','🛒','🧸','🎨','🖼️','🚿','🛁','🪚','🔨','⛓️','🔗',
    '🌲','🪵','🧱','🏘️','🏚️','🏡','🌇','🚧','🦺','👷','🤝','✨','💼','📈','🎁','🧾','💰','🏦','🐕','🌿','☀️','❄️','🌧️'
  ];

  var KP_BLOCK2_NICHES = [
    { id: 'mebel_kitchen', kind: 'goods', label: 'Мебель кухни' },
    { id: 'services_generic', kind: 'services', label: 'Услуги (шаблон)' }
  ];

  var KP_START_BULLETS_TAIL =
    '- Создание  ТОP текстов: заголовков, оферов, призывов, SEO, до 7000 символов (max)\n' +
    '- Создание  дизайна: упаковки аккаунты, логотипа, инфографики в карточках\n' +
    '- Запуск рекламы, модерирование в теч 1 месяца, общение с тех поддержкой\n' +
    '- Анализ данных и оптимизация  дальнейшего продвижения';

  var KP_MEEBEL_PRESET = [
    {
      key: 'start',
      emoji: '🎯',
      name: 'СТАРТ',
      adsCount: '500',
      priceRub: '35000',
      headerLine: '🎯 До 500 объявлений "СТАРТ"',
      priceLine: '🔹 35 000 ₽ = работа Авитолога (оплачивается сразу)',
      bullets:
        '- Создание файла автозагрузки / ручной постинг на 500 карточек на 30 дней\n' +
        KP_START_BULLETS_TAIL,
      bonuses: '🎁 Дизайн магазина для РАСШИР бизнес тарифа Авито : 1 ПК и 1 Моб баннеры'
    },
    {
      key: 'launch',
      emoji: '🚀',
      name: 'ЗАПУСК',
      adsCount: '1500',
      priceRub: '42000',
      headerLine: '🚀 До 1500 объявлений "ЗАПУСК"',
      priceLine: '🔹 42 000 ₽ = работа Авитолога (оплачивается сразу)',
      bullets: '',
      bonuses:
        '🎁 Дизайн магазина для MAX. бизнес тарифа Авито : 6 баннеров ПК+Моб версии\n' +
        '🎁 Полная инфографика на все карточки до 5 картинки в карточке\n' +
        '🎁 Подключение автоответа с воронкой в Ваш ТГ - БОТ / Канал\n' +
        '🎁 3 отзыва с продающими текстами'
    },
    {
      key: 'mid',
      emoji: 'Ⓜ️',
      name: 'МИДЛ',
      adsCount: '3000',
      priceRub: '59000',
      headerLine: 'Ⓜ️ До 3000 объявлений "МИДЛ"',
      priceLine: '🔹 59 000 ₽ = работа Авитолога (оплачивается сразу)',
      bullets: '',
      bonuses:
        '🎁 Дизайн магазина для MAX. бизнес тарифа Авито : 6 баннеров ПК+Моб версии\n' +
        '🎁 Полная инфографика на все карточки до 8 картинки в карточке\n' +
        '🎁 Подключение автоответа с воронкой в Ваш ТГ - БОТ / Канал\n' +
        '🎁 5 отзывов с продающими текстами\n' +
        '🎁 + 16 дней ведения рекламы и актива в аккаунте'
    },
    {
      key: 'alpha',
      emoji: '🅰️',
      name: 'АЛЬФА',
      priceRub: '84000',
      headerLine: '🅰️ Без ограничений кол-во объявлений = "АЛЬФА"',
      priceLine: '🔹 84 000 ₽ = работа Авитолога',
      bullets: '',
      bonuses:
        '🎁 Дизайн магазина для MAX. бизнес тарифа: 3 баннера  ПК и 3 баннера Моб версии\n' +
        '🎁 Полная инфографика на все карточки с глубокой проработкой до 10 / 15\n' +
        '🎁 Скрипты продаж для вашей ниши + анализ аватаров ЦА и ресерч в PDF\n' +
        '🎁 Подключение автоответа с воронкой в Ваш ✈️ТГ - БОТ / Канал + 🧲 Бонус Закреп в ТГ\n' +
        '🎁 10 отзывов с продающими текстами\n' +
        '🎁 + 30 дней ведения рекламы и актива в аккаунте'
    }
  ];

  var KP_SERVICES_EMPTY_PRESET = [
    { key: 'start', emoji: '🎯', name: 'СТАРТ', headerLine: '', priceLine: '', bullets: '', bonuses: '' },
    { key: 'launch', emoji: '🚀', name: 'ЗАПУСК', headerLine: '', priceLine: '', bullets: '', bonuses: '' },
    { key: 'mid', emoji: 'Ⓜ️', name: 'МИДЛ', headerLine: '', priceLine: '', bullets: '', bonuses: '' },
    { key: 'alpha', emoji: '🅰️', name: 'АЛЬФА', headerLine: '', priceLine: '', bullets: '', bonuses: '' }
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

  function mergeMissingFromDefaults(stored, defaults) {
    var defs = defaults || KP_DEFAULTS;
    var goods = Array.isArray(stored.goods) ? stored.goods.slice() : [];
    var seenG = {};
    goods.forEach(function (x) {
      if (x && x.id) seenG[x.id] = 1;
    });
    (defs.goods || []).forEach(function (d) {
      if (d && d.id && !seenG[d.id]) {
        goods.push(deepClone(d));
        seenG[d.id] = 1;
      }
    });
    var services = Array.isArray(stored.services) ? stored.services.slice() : [];
    var seenS = {};
    services.forEach(function (x) {
      if (x && x.id) seenS[x.id] = 1;
    });
    (defs.services || []).forEach(function (d) {
      if (d && d.id && !seenS[d.id]) {
        services.push(deepClone(d));
        seenS[d.id] = 1;
      }
    });
    return { goods: goods, services: services };
  }

  function getMergedTemplates() {
    try {
      var s = localStorage.getItem(KP_TEMPLATES_STORE);
      if (s) {
        var d = JSON.parse(s);
        if (d && Array.isArray(d.goods) && Array.isArray(d.services) && d.goods.length + d.services.length > 0) {
          return mergeMissingFromDefaults(d, KP_DEFAULTS);
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

  function ensureBlock2(d) {
    if (!d.block2 || typeof d.block2 !== 'object') d.block2 = {};
    if (!d.block2.kind) d.block2.kind = 'goods';
    if (d.block2.nicheId === undefined) d.block2.nicheId = '';
    if (!Array.isArray(d.block2.packages)) d.block2.packages = [];
    return d;
  }

  function fmtKpRub(n) {
    var x = Math.round(Number(n));
    if (!isFinite(x) || x < 0) return '0';
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function ensurePackageKey(p, idx) {
    if (p && p.key) return;
    var keys = ['start', 'launch', 'mid', 'alpha'];
    if (p) p.key = keys[idx] || 'start';
  }

  function normalizePkgNumbersFromLegacy(p) {
    if (!p || !p.key) return;
    if (p.key === 'alpha') {
      if (p.priceRub === undefined || p.priceRub === '') {
        var pm = String(p.priceLine || '').match(/🔹\s*([\d\s]+)/);
        if (pm) p.priceRub = String(pm[1]).replace(/\s/g, '');
      }
      return;
    }
    if (p.adsCount === undefined || p.adsCount === '') {
      var hm = String(p.headerLine || '').match(/До\s+(\d+)/i);
      if (hm) p.adsCount = hm[1];
    }
    if (p.priceRub === undefined || p.priceRub === '') {
      var xm = String(p.priceLine || '').match(/🔹\s*([\d\s]+)/);
      if (xm) p.priceRub = String(xm[1]).replace(/\s/g, '');
    }
  }

  function syncMeebelPackage(p) {
    if (!p || !p.key) return;
    var name = String(p.name || '').trim();
    var em = p.emoji || '📦';
    var ads = parseInt(String(p.adsCount || '').replace(/\s/g, ''), 10);
    var price = parseInt(String(p.priceRub || '').replace(/\s/g, ''), 10);
    var fmt = fmtKpRub;

    if (p.key === 'start') {
      if (!isFinite(ads) || ads <= 0) ads = 500;
      if (!isFinite(price) || price <= 0) price = 35000;
      p.adsCount = String(ads);
      p.priceRub = String(price);
      p.headerLine = em + ' До ' + ads + ' объявлений "' + name + '"';
      p.priceLine = '🔹 ' + fmt(price) + ' ₽ = работа Авитолога (оплачивается сразу)';
      var line1 = '- Создание файла автозагрузки / ручной постинг на ' + ads + ' карточек на 30 дней';
      var lines = String(p.bullets || '').split(/\r?\n/);
      if (lines.length && String(lines[0] || '').trim()) {
        lines[0] = line1;
        p.bullets = lines.join('\n');
      } else {
        p.bullets = line1 + '\n' + KP_START_BULLETS_TAIL;
      }
    } else if (p.key === 'launch') {
      if (!isFinite(ads) || ads <= 0) ads = 1500;
      if (!isFinite(price) || price <= 0) price = 42000;
      p.adsCount = String(ads);
      p.priceRub = String(price);
      p.headerLine = em + ' До ' + ads + ' объявлений "' + name + '"';
      p.priceLine = '🔹 ' + fmt(price) + ' ₽ = работа Авитолога (оплачивается сразу)';
    } else if (p.key === 'mid') {
      if (!isFinite(ads) || ads <= 0) ads = 3000;
      if (!isFinite(price) || price <= 0) price = 59000;
      p.adsCount = String(ads);
      p.priceRub = String(price);
      p.headerLine = em + ' До ' + ads + ' объявлений "' + name + '"';
      p.priceLine = '🔹 ' + fmt(price) + ' ₽ = работа Авитолога (оплачивается сразу)';
    } else if (p.key === 'alpha') {
      if (!isFinite(price) || price <= 0) price = 84000;
      p.priceRub = String(price);
      p.headerLine = em + ' Без ограничений кол-во объявлений = "' + name + '"';
      p.priceLine = '🔹 ' + fmt(price) + ' ₽ = работа Авитолога';
    }
  }

  function getPackagesForNiche(kind, nicheId) {
    if (nicheId === 'mebel_kitchen' && kind === 'goods') return deepClone(KP_MEEBEL_PRESET);
    if (nicheId === 'services_generic' && kind === 'services') return deepClone(KP_SERVICES_EMPTY_PRESET);
    return [];
  }

  function kpResizePkgTextarea(ta) {
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(40, ta.scrollHeight) + 'px';
  }

  /** Один input на строку; последняя пустая — для добавления новой строки */
  function buildCompactLineInputsHtml(text, placeholder) {
    var lines = String(text || '').split(/\r?\n/);
    if (!lines.length) lines = [''];
    lines.push('');
    return lines
      .map(function (line, i) {
        return (
          '<input type="text" class="kp-pkg-line-inp" data-kp-line="' +
          i +
          '" value="' +
          esc(line) +
          '" placeholder="' +
          esc(placeholder || '') +
          '">'
        );
      })
      .join('');
  }

  function buildBlock2PackagesPreviewHtml(packages, nicheId, kind) {
    if (!packages || !packages.length) {
      return '<div class="kp-b2-empty">Выберите нишу — появятся 4 пакета (СТАРТ · ЗАПУСК · МИДЛ · АЛЬФА)</div>';
    }
    var compact = nicheId === 'mebel_kitchen' && kind === 'goods';
    return (
      '<div class="kp-b2-stack' + (compact ? ' kp-b2-stack--compact' : '') + '">' +
      packages
        .map(function (p, idx) {
          ensurePackageKey(p, idx);
          var headRow =
            '<div class="kp-pkg-head-row">' +
            '<input type="text" class="kp-pkg-inline-emoji" data-kp-field="emoji" value="' +
            esc(p.emoji || '📦') +
            '" maxlength="16" title="Эмодзи" aria-label="Эмодзи">' +
            '<input type="text" class="kp-pkg-inline-name" data-kp-field="name" value="' +
            esc(p.name || '') +
            '" placeholder="СТАРТ · ЗАПУСК …" aria-label="Название пакета">' +
            '</div>';
          if (compact) {
            var numsAlpha =
              p.key === 'alpha'
                ? '<div class="kp-pkg-nums-row">' +
                  '<label class="kp-pkg-num-lbl">Цена ₽</label>' +
                  '<input type="text" class="kp-pkg-num-inp" inputmode="numeric" data-kp-field="priceRub" value="' +
                  esc(p.priceRub || '') +
                  '" autocomplete="off">' +
                  '</div>'
                : '<div class="kp-pkg-nums-row">' +
                  '<label class="kp-pkg-num-lbl">До</label>' +
                  '<input type="text" class="kp-pkg-num-inp" inputmode="numeric" data-kp-field="adsCount" value="' +
                  esc(p.adsCount || '') +
                  '" autocomplete="off" title="Число объявлений">' +
                  '<span class="kp-pkg-num-hint">объявл.</span>' +
                  '<span class="kp-pkg-nums-sep" aria-hidden="true"></span>' +
                  '<label class="kp-pkg-num-lbl">₽</label>' +
                  '<input type="text" class="kp-pkg-num-inp kp-pkg-num-price" inputmode="numeric" data-kp-field="priceRub" value="' +
                  esc(p.priceRub || '') +
                  '" autocomplete="off" title="Цена">' +
                  '</div>';
            return (
              '<div class="kp-pkg-strip kp-pkg-strip--compact" data-kp-pkg-idx="' +
              idx +
              '" data-kp-key="' +
              esc(p.key || '') +
              '">' +
              headRow +
              numsAlpha +
              '<input type="text" class="kp-pkg-line-inp kp-pkg-line-inp--header" data-kp-field="header" value="' +
              esc(p.headerLine || '') +
              '" placeholder="Строка заголовка (объём, кавычки)">' +
              '<input type="text" class="kp-pkg-line-inp kp-pkg-line-inp--price" data-kp-field="price" value="' +
              esc(p.priceLine || '') +
              '" placeholder="Строка с ценой (🔹)">' +
              '<div class="kp-pkg-lines-wrap" data-kp-lines="bullets">' +
              buildCompactLineInputsHtml(
                p.bullets || '',
                p.key === 'start' ? 'Выгода (1-я строка — от числа объявлений)' : 'Выгода по строке'
              ) +
              '</div>' +
              '<div class="kp-pkg-lines-wrap kp-pkg-lines-wrap--bonuses" data-kp-lines="bonuses">' +
              buildCompactLineInputsHtml(p.bonuses || '', 'Бонус (🎁), по одной строке') +
              '</div>' +
              '</div>'
            );
          }
          return (
            '<div class="kp-pkg-strip" data-kp-pkg-idx="' +
            idx +
            '">' +
            headRow +
            '<textarea class="kp-ta kp-pkg-edit-ta kp-pkg-edit-header" data-kp-field="header" rows="2" placeholder="Заголовок (объём, кавычки)">' +
            esc(p.headerLine || '') +
            '</textarea>' +
            '<textarea class="kp-ta kp-pkg-edit-ta kp-pkg-edit-price" data-kp-field="price" rows="2" placeholder="Строка с ценой (🔹)">' +
            esc(p.priceLine || '') +
            '</textarea>' +
            '<textarea class="kp-ta kp-pkg-edit-ta kp-pkg-edit-bullets" data-kp-field="bullets" rows="4" placeholder="Основной список (строки с -)">' +
            esc(p.bullets || '') +
            '</textarea>' +
            '<textarea class="kp-ta kp-pkg-edit-ta kp-pkg-edit-bonuses" data-kp-field="bonuses" rows="4" placeholder="Бонусы (строки с 🎁)">' +
            esc(p.bonuses || '') +
            '</textarea>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function buildBlock2SectionHtml(d) {
    ensureBlock2(d);
    var kind = d.block2.kind === 'services' ? 'services' : 'goods';
    var nicheId = d.block2.nicheId || '';
    var kindGoodsCls = kind === 'goods' ? ' on' : '';
    var kindServCls = kind === 'services' ? ' on' : '';
    var nicheOpts = KP_BLOCK2_NICHES.filter(function (n) {
      return n.kind === kind;
    })
      .map(function (n) {
        var sel = nicheId === n.id ? ' selected' : '';
        return '<option value="' + esc(n.id) + '"' + sel + '>' + esc(n.label) + '</option>';
      })
      .join('');
    var pkgs = d.block2.packages && d.block2.packages.length ? d.block2.packages : [];
    return (
      '<div class="kp-gen-section kp-b2-section">' +
      '<div class="kp-gen-label">Пакеты в КП</div>' +
      '<div class="kp-b2-kind-row">' +
      '<span class="kp-b2-kind-label">Тип:</span>' +
      '<div class="kp-b2-seg">' +
      '<button type="button" class="kp-b2-seg-btn' +
      kindGoodsCls +
      '" id="kpB2KindGoods" data-b2-kind="goods">Товар</button>' +
      '<button type="button" class="kp-b2-seg-btn' +
      kindServCls +
      '" id="kpB2KindServices" data-b2-kind="services">Услуга</button>' +
      '</div></div>' +
      '<div class="kp-b2-niche-row">' +
      '<label class="kp-b2-niche-lbl" for="kpB2Niche">Ниша</label>' +
      '<select id="kpB2Niche" class="kp-inp kp-b2-select">' +
      '<option value="">— выберите —</option>' +
      nicheOpts +
      '</select></div>' +
      '<div class="kp-b2-preview-wrap">' +
      buildBlock2PackagesPreviewHtml(pkgs, nicheId, kind) +
      '</div></div>'
    );
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
    ensureBlock2(d);
    if (d.block2.nicheId && d.block2.packages && d.block2.packages.length) {
      lines.push('');
      lines.push('—— Пакеты ——');
      d.block2.packages.forEach(function (p, i) {
        lines.push('');
        lines.push('[' + (p.name || 'Пакет ' + (i + 1)) + ']');
        if (p.headerLine) lines.push(p.headerLine);
        if (p.priceLine) lines.push(p.priceLine);
        if (p.bullets) lines.push(p.bullets);
        if (p.bonuses) lines.push(p.bonuses);
      });
    }
    return lines.join('\n');
  }

  function syncOpenButton(mc, templateId) {
    var a = mc.querySelector('#kpOpenCanva');
    if (!a) return;
    var t = templateForDraft(templateId);
    a.href = t.editUrl || '#';
  }

  /** Одна строка: уменьшаем шрифт, пока текст помещается в ширину карточки */
  function fitKpTplCardLabels(root) {
    if (!root || !root.querySelectorAll) return;
    function run() {
      var nodes = root.querySelectorAll('.kp-tpl-card .kp-tpl-name');
      if (!nodes.length) return;
      nodes.forEach(function (el) {
        el.style.whiteSpace = 'nowrap';
        el.style.wordBreak = 'keep-all';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'clip';
        var maxPx = 11;
        var minPx = 5.5;
        el.style.fontSize = maxPx + 'px';
        el.style.lineHeight = '1.08';
        var px = maxPx;
        var iter = 0;
        while (el.scrollWidth > el.clientWidth && px > minPx && iter++ < 48) {
          px -= 0.35;
          el.style.fontSize = px.toFixed(2) + 'px';
        }
        if (el.scrollWidth > el.clientWidth) el.style.textOverflow = 'ellipsis';
        else el.style.textOverflow = 'clip';
      });
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(run);
      });
    } else {
      setTimeout(run, 0);
    }
    setTimeout(run, 60);
  }

  if (!window._kpTplFitResizeBound) {
    window._kpTplFitResizeBound = true;
    var _kpTplResizeT = null;
    window.addEventListener('resize', function () {
      clearTimeout(_kpTplResizeT);
      _kpTplResizeT = setTimeout(function () {
        var mc = document.getElementById('mainContent');
        if (mc && mc.querySelector('.kp-tpl-zones')) fitKpTplCardLabels(mc);
      }, 120);
    });
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
    wireBlock2(mc);
  }

  function wireBlock2(mc) {
    var goodsBtn = mc.querySelector('#kpB2KindGoods');
    var servBtn = mc.querySelector('#kpB2KindServices');
    var nicheSel = mc.querySelector('#kpB2Niche');
    function rerender() {
      if (typeof window.__showKpGenerator === 'function') window.__showKpGenerator(mc);
    }
    if (goodsBtn) {
      goodsBtn.onclick = function () {
        var dd = loadDraft();
        ensureBlock2(dd);
        if (dd.block2.kind === 'goods') return;
        dd.block2.kind = 'goods';
        dd.block2.nicheId = '';
        dd.block2.packages = [];
        saveDraft(dd);
        rerender();
      };
    }
    if (servBtn) {
      servBtn.onclick = function () {
        var dd = loadDraft();
        ensureBlock2(dd);
        if (dd.block2.kind === 'services') return;
        dd.block2.kind = 'services';
        dd.block2.nicheId = '';
        dd.block2.packages = [];
        saveDraft(dd);
        rerender();
      };
    }
    if (nicheSel) {
      nicheSel.onchange = function () {
        var dd = loadDraft();
        ensureBlock2(dd);
        var nid = String(nicheSel.value || '').trim();
        dd.block2.nicheId = nid;
        dd.block2.packages = nid ? getPackagesForNiche(dd.block2.kind, nid) : [];
        saveDraft(dd);
        rerender();
      };
    }
    function persistBlock2PkgField(idx, fieldKey, raw) {
      var d = loadDraft();
      ensureBlock2(d);
      var p = d.block2.packages[idx];
      if (!p) return;
      var v = String(raw || '');
      if (fieldKey === 'emoji') p.emoji = v.trim().slice(0, 16) || '📦';
      else if (fieldKey === 'name') p.name = v.trim();
      else if (fieldKey === 'header') p.headerLine = v.trim();
      else if (fieldKey === 'price') p.priceLine = v.trim();
      else if (fieldKey === 'bullets') p.bullets = v.trim();
      else if (fieldKey === 'bonuses') p.bonuses = v.trim();
      else if (fieldKey === 'adsCount') p.adsCount = v.trim();
      else if (fieldKey === 'priceRub') p.priceRub = v.trim();
      saveDraft(d);
    }
    function updateCompactStripPreview(idx) {
      var d = loadDraft();
      ensureBlock2(d);
      var p = d.block2.packages[idx];
      if (!p || !p.key) return;
      normalizePkgNumbersFromLegacy(p);
      syncMeebelPackage(p);
      saveDraft(d);
      var strip = mc.querySelector('.kp-pkg-strip[data-kp-pkg-idx="' + idx + '"]');
      if (!strip) return;
      var hi = strip.querySelector('[data-kp-field="header"]');
      var pi = strip.querySelector('[data-kp-field="price"]');
      if (hi) hi.value = p.headerLine || '';
      if (pi) pi.value = p.priceLine || '';
      var wrap = strip.querySelector('.kp-pkg-lines-wrap[data-kp-lines="bullets"]');
      if (wrap) {
        var lines = String(p.bullets || '').split(/\r?\n/);
        if (!lines.length) lines = [''];
        var inputs = wrap.querySelectorAll('input');
        var needed = lines.length + 1;
        var phB =
          p.key === 'start' ? 'Выгода (1-я строка — от числа объявлений)' : 'Выгода по строке';
        if (inputs.length !== needed) {
          wrap.innerHTML = buildCompactLineInputsHtml(p.bullets || '', phB);
        } else {
          for (var i = 0; i < lines.length; i++) {
            if (inputs[i]) inputs[i].value = lines[i];
          }
        }
      }
    }
    mc.querySelectorAll('.kp-pkg-strip').forEach(function (strip) {
      var idx = parseInt(strip.getAttribute('data-kp-pkg-idx'), 10);
      if (!isFinite(idx)) return;
      var compact = strip.classList.contains('kp-pkg-strip--compact');
      strip.querySelectorAll('[data-kp-field]').forEach(function (inp) {
        var key = inp.getAttribute('data-kp-field');
        if (!key) return;
        inp.addEventListener('blur', function () {
          persistBlock2PkgField(idx, key, inp.value);
          if (compact && (key === 'name' || key === 'emoji' || key === 'adsCount' || key === 'priceRub')) {
            updateCompactStripPreview(idx);
          }
        });
        if (compact && (key === 'adsCount' || key === 'priceRub')) {
          inp.addEventListener('input', function () {
            persistBlock2PkgField(idx, key, inp.value);
            updateCompactStripPreview(idx);
          });
        }
        if (inp.tagName === 'TEXTAREA') {
          inp.addEventListener('input', function () {
            kpResizePkgTextarea(inp);
          });
        }
      });
    });
    mc.addEventListener(
      'focusout',
      function (e) {
        var t = e.target;
        if (!t.matches || !t.matches('.kp-pkg-lines-wrap input')) return;
        var wrap = t.closest('.kp-pkg-lines-wrap');
        if (!wrap) return;
        var fieldName = wrap.getAttribute('data-kp-lines');
        if (fieldName !== 'bullets' && fieldName !== 'bonuses') return;
        var strip = t.closest('.kp-pkg-strip');
        if (!strip || !strip.classList.contains('kp-pkg-strip--compact')) return;
        var idx = parseInt(strip.getAttribute('data-kp-pkg-idx'), 10);
        if (!isFinite(idx)) return;
        var lines = [];
        wrap.querySelectorAll('input').forEach(function (inp) {
          lines.push(inp.value);
        });
        while (lines.length > 1 && !String(lines[lines.length - 1] || '').trim()) lines.pop();
        persistBlock2PkgField(idx, fieldName, lines.join('\n'));
      },
      true
    );
    mc.querySelectorAll('.kp-pkg-edit-ta').forEach(function (ta) {
      kpResizePkgTextarea(ta);
    });
  }

  window.__showKpGenerator = function (mc) {
    if (!mc) return;
    var d = loadDraft();
    ensureBlock2(d);
    if (d.block2.nicheId && (!d.block2.packages || !d.block2.packages.length)) {
      d.block2.packages = getPackagesForNiche(d.block2.kind, d.block2.nicheId);
      saveDraft(d);
    }
    if (d.block2.nicheId === 'mebel_kitchen' && d.block2.kind === 'goods' && d.block2.packages && d.block2.packages.length) {
      d.block2.packages.forEach(function (p, i) {
        ensurePackageKey(p, i);
        normalizePkgNumbersFromLegacy(p);
        syncMeebelPackage(p);
      });
      saveDraft(d);
    }
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
      buildBlock2SectionHtml(d) +
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
    fitKpTplCardLabels(mc);
  };
  window.__fitKpTplCardLabels = fitKpTplCardLabels;
})();
