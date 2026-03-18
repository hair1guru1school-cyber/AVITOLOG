/**
 * Contract Generator — генерация договоров в разделе CLIENT
 * Модули: ContractGenerator (main), ContractForm, ContractPreview, generateContract
 */
(function() {
  'use strict';

  // Исполнитель (фиксированные реквизиты)
  var EXECUTOR = {
    name: 'ИП Шинков Филипп Аркадьевич',
    inn: '500915387195',
    ogrn: '322508100110311',
    account: '40802810400003078140',
    bank: 'АО Т-БАНК',
    phone: '+7 985 332 55 41'
  };

  function numberToWordsRu(num) {
    var n = Math.max(0, parseInt(num, 10) || 0);
    if (!n) return 'ноль';
    var unitsMale = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    var unitsFemale = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    var teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    var tens = ['', 'десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    var hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    function morph(x, f1, f2, f5) {
      var n100 = x % 100;
      if (n100 >= 11 && n100 <= 19) return f5;
      var n10 = x % 10;
      if (n10 === 1) return f1;
      if (n10 >= 2 && n10 <= 4) return f2;
      return f5;
    }
    function triadToWords(x, female) {
      var out = [];
      var h = Math.floor(x / 100);
      var t = Math.floor((x % 100) / 10);
      var u = x % 10;
      if (h) out.push(hundreds[h]);
      if (t > 1) {
        out.push(tens[t]);
        if (u) out.push((female ? unitsFemale : unitsMale)[u]);
      } else if (t === 1) {
        out.push(teens[u]);
      } else if (u) {
        out.push((female ? unitsFemale : unitsMale)[u]);
      }
      return out.join(' ');
    }
    var parts = [];
    var millions = Math.floor(n / 1000000);
    var thousands = Math.floor((n % 1000000) / 1000);
    var rest = n % 1000;
    if (millions) parts.push(triadToWords(millions, false) + ' ' + morph(millions, 'миллион', 'миллиона', 'миллионов'));
    if (thousands) parts.push(triadToWords(thousands, true) + ' ' + morph(thousands, 'тысяча', 'тысячи', 'тысяч'));
    if (rest) parts.push(triadToWords(rest, false));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  function normalizeMoneyValue(v) {
    var n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  // Шаблоны договора (на основе документов пользователя)
  function getContractMainTemplate(data) {
    var clientName = data.companyName || data.fio || 'Заказчик';
    var contractDate = data.contractDate || data.startDate || '—';
    var startDate = data.startDate || '—';
    var endDate = data.endDate || '—';
    var daysCreate = data.daysCreate || '—';
    var daysManage = data.daysManage || '—';
    var costNum = normalizeMoneyValue(data.cost);
    var costFmt = String(costNum || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var costWords = numberToWordsRu(costNum);

    return '' +
      '<h2 style="text-align:center;font-size:15pt;margin:8px 0 10px;letter-spacing:.2px">ДОГОВОР ВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ</h2>' +
      '<p style="text-align:center;font-size:10.5pt;margin:0 0 14px">от ' + contractDate + '</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">Я, ' + EXECUTOR.name + ' именуемый в дальнейшем "Исполнитель", с одной стороны, и ' + clientName + '</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>1. ПРЕДМЕТ ДОГОВОРА. СРОКИ ОКАЗАНИЯ УСЛУГ</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 6px">1.1. Исполнитель обязуется, по заданию Заказчика, оказывать услуги по созданию и ведению рекламной кампании на сайте Avito.ru (далее — «Авито»), а Заказчик обязуется оплатить эти услуги в полном объеме.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">1.2. Сроки оказания услуг:</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">1.2.1. Начало оказания услуг: ' + startDate + '</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">1.2.2. Окончание оказания услуг: ' + endDate + '</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">1.2.3. Порядок услуг: ' + daysCreate + ' дней создание рекламы + ' + daysManage + ' дней ведения аккаунта</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>2. ПРАВА И ОБЯЗАННОСТИ СТОРОН</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 6px">2.1. Исполнитель обязуется: 2.1.1. Оказать услуги, предусмотренные п. 1.1 настоящего Договора, лично. 2.1.2. Оказать услуги в сроки, установленные п. 1.2 настоящего Договора. 2.1.3. Исполнять указания Заказчика относительно порядка оказания услуг, при условии, что они не противоречат настоящему Договору и законодательству.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 6px">2.2. Заказчик обязуется: 2.2.1. Предоставить Исполнителю необходимые материалы и документы для оказания услуг не позднее [7] календарных дней с момента заключения Договора. 2.2.2. Оплатить услуги Исполнителя в соответствии с разделом 3 настоящего Договора. 2.2.3. Оказывать содействие Исполнителю в оказании услуг по настоящему Договору.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 6px">2.3. Заказчик вправе отказаться от исполнения настоящего Договора, предупредив об этом Исполнителя в письменной форме не менее, чем за двадцать четыре часа до начала рекламной кампании, при условии оплаты Исполнителю фактически понесенных им расходов.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">2.4. Исполнитель вправе отказаться от исполнения настоящего Договора, предупредив об этом Заказчика не менее чем за двадцать четыре часа до начала рекламной кампании, при условии полного возмещения Заказчику материальных затрат в размере <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong>.</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>3. ЦЕНА ДОГОВОРА И ПОРЯДОК РАСЧЕТОВ</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 6px">3.1. Стоимость услуг по настоящему Договору составляет <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong> и является фиксированной.<br>Указанная стоимость не включает расходы на размещение и продвижение объявлений на платформе Авито, которые при необходимости оплачиваются Заказчиком самостоятельно напрямую платформе Авито.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">3.2. Оплата услуг осуществляется в следующем порядке:</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">3.2.1. Заказчик производит <strong>100% предоплату</strong> в размере <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong> до начала оказания услуг.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">3.2.2. Дополнительных платежей за услуги Исполнителя по настоящему Договору не предусмотрено.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">3.3. В случае непредоставления Заказчиком необходимых материалов либо неисполнения иных обязательств, препятствующих оказанию услуг, Исполнитель вправе приостановить оказание услуг без возврата уплаченных денежных средств.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">3.4. Возврат денежных средств возможен исключительно в случае существенного и документально подтверждённого невыполнения условий Договора Исполнителем.</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>4. ОТВЕТСТВЕННОСТЬ СТОРОН И УСЛОВИЯ ИСПОЛНЕНИЯ</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.1. Стороны несут ответственность за нарушение условий настоящего договора в соответствии с законодательством Российской Федерации.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.2. Исполнитель несёт ответственность за качество оказанных услуг, при условии их полного выполнения на основании предоставленных Заказчиком данных, а также соблюдения Заказчиком всех требований, предусмотренных стратегией продвижения.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.3. Исполнитель оказывает услуги согласно согласованному объёму работ, включая разработку объявлений, инфографики, настройку автозагрузки и иных инструментов. При условии запуска всех компонентов (отзывы, тариф, бюджет), отклик от аудитории может быть ожидаем в течение 7 (семи) рабочих дней, однако конкретные показатели (заявки, обращения и т.п.) не подлежат гарантийному обеспечению ввиду внешних факторов.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.4. Исполнитель вправе по собственному усмотрению продлить срок ведения рекламной кампании до 30 календарных дней без дополнительной оплаты, если это необходимо для достижения наилучшего результата.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.5. Заказчик вправе требовать уменьшения стоимости услуг только при наличии существенных недостатков в выполненной работе, подтвержденных документально.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.6. Заказчик подтверждает, что неисполнение им части условий (в том числе неиспользование рекламного бюджета, отсутствие отзывов, неполная реализация стратегии) освобождает Исполнителя от ответственности за итоговую результативность.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">4.7. Обстоятельства непреодолимой силы освобождают обе стороны от ответственности. В таком случае сроки исполнения обязательств отодвигаются на период действия соответствующих обстоятельств.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">4.8. Отзывы, касающиеся оказанных услуг, могут быть оставлены не ранее чем через 30 календарных дней с начала работы по договору. В случае несоблюдения данного условия Сторона, допустившая нарушение, обязана возместить другой Стороне понесённые ею репутационные или иные убытки.</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>5. ПРОЧИЕ УСЛОВИЯ</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">5.1. Настоящий Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств по нему.<br>Факт оплаты Заказчиком услуг, указанных в разделе 3 настоящего Договора, в том числе посредством банковского перевода или оплаты по реквизитам Исполнителя, считается полным и безусловным принятием условий настоящего Договора и имеет юридическую силу, равную подписанию документа обеими Сторонами.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">5.2. Во всем, что не урегулировано настоящим Договором, подлежит применению действующее законодательство Российской Федерации.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">5.3. Все изменения и дополнения к настоящему Договору должны быть составлены в письменной форме и подписаны обеими Сторонами.</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">5.4. Настоящий Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному экземпляру для каждой из Сторон.</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:10px 0 8px">Стороны.</p>' +

      '<p style="font-size:10.5pt;line-height:1.55;margin:8px 0 6px"><strong>6. АДРЕСА И БАНКОВСКИЕ РЕКВИЗИТЫ СТОРОН</strong></p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">Заказчик:</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 10px">' + clientName + '</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 2px">Исполнитель:</p>' +
      '<p style="font-size:10.5pt;line-height:1.55;margin:0 0 14px">ИП Шинков Филипп Аркадьевич<br>ИНН ' + EXECUTOR.inn + '<br>ОГРН ' + EXECUTOR.ogrn + '<br>РС ' + EXECUTOR.account + '<br>' + EXECUTOR.bank + '</p>';
  }

  function getAppendix1Template(data) {
    var costFmt = String(data.cost || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var clientName = data.fio || data.companyName || 'Заказчик';
    var startDate = data.startDate || '—';
    var endDate = data.endDate || '—';
    return '<h3 style="font-size:12pt;margin:24px 0 12px">Приложение № 1 к договору с ' + clientName + ' оказания услуг по размещению рекламы</h3>' +
      '<p style="font-size:10pt;margin-bottom:12px">от ' + (data.startDate || '') + '</p>' +
      '<p style="font-size:11pt;font-weight:700;margin-bottom:12px">Перечень услуг и сроки реализации:</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:10pt;margin:12px 0">' +
      '<tr style="background:#f5f5f5"><th style="border:1px solid #ddd;padding:8px;text-align:left">№</th><th style="border:1px solid #ddd;padding:8px">Наименование услуги</th><th style="border:1px solid #ddd;padding:8px">Дата начала</th><th style="border:1px solid #ddd;padding:8px">Дата окончания</th><th style="border:1px solid #ddd;padding:8px">Кол-во дней</th><th style="border:1px solid #ddd;padding:8px">Стоимость, руб.</th></tr>' +
      '<tr><td style="border:1px solid #ddd;padding:8px">1</td><td style="border:1px solid #ddd;padding:8px">Создание объявлений (фото, тексты, офферы, СЕО-анализ)</td><td style="border:1px solid #ddd;padding:8px">' + startDate + '</td><td style="border:1px solid #ddd;padding:8px">' + endDate + '</td><td style="border:1px solid #ddd;padding:8px">' + (data.daysCreate || '') + '</td><td style="border:1px solid #ddd;padding:8px">часть суммы</td></tr>' +
      '<tr><td style="border:1px solid #ddd;padding:8px">2</td><td style="border:1px solid #ddd;padding:8px">Постинг и продвижение объявлений</td><td style="border:1px solid #ddd;padding:8px">' + startDate + '</td><td style="border:1px solid #ddd;padding:8px">' + endDate + '</td><td style="border:1px solid #ddd;padding:8px">' + (data.daysManage || '') + '</td><td style="border:1px solid #ddd;padding:8px">часть суммы</td></tr>' +
      '</table>' +
      '<p style="font-size:11pt;font-weight:700;margin:16px 0">Общая стоимость услуг по договору: ' + costFmt + ' руб.</p>' +
      '<p style="font-size:10pt;margin-top:12px">Исполнитель: ИП Шинков Филипп Аркадьевич</p>' +
      '<p style="font-size:10pt">Заказчик: ' + clientName + '</p>';
  }

  function getAppendix2Template(data) {
    var clientName = data.fio || data.companyName || 'Заказчик';
    return '<h3 style="font-size:12pt;margin:24px 0 12px">ПРИЛОЖЕНИЕ № 2 к Договору возмездного оказания услуг</h3>' +
      '<p style="font-size:10pt;margin-bottom:12px">от ' + (data.startDate || '') + '</p>' +
      '<p style="font-size:11pt;font-weight:700;margin-bottom:12px">Техническое задание и описание оказываемых услуг</p>' +
      '<p style="font-size:10pt;margin-bottom:8px">Исполнитель: ИП Шинков Филипп Аркадьевич</p>' +
      '<p style="font-size:10pt;margin-bottom:16px">Заказчик: ' + clientName + '</p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-bottom:8px"><strong>Содержание:</strong></p>' +
      '<ol style="font-size:10pt;line-height:1.6;margin:0 0 16px 20px">' +
      '<li><strong>Предмет рекламной кампании</strong> — создание и ведение рекламной кампании на Avito для продвижения товаров/услуг заказчика.</li>' +
      '<li><strong>Этапы работ:</strong> анализ ниши и конкурентов; подготовка объявлений (заголовки, тексты, офферы, SEO); визуалы (инфографика, оформление карточек); размещение объявлений на Avito.</li>' +
      '<li><strong>Ведение кампании</strong> — мониторинг, правки текстов, заголовков и визуалов, тестирование формулировок.</li>' +
      '<li><strong>Действия при слабом отклике</strong> — изменение заголовков, текстов, изображений и структуры размещения.</li>' +
      '<li><strong>Обязанности заказчика</strong> — описание товаров/услуг, фотографии, контакты, доступ к аккаунту Avito.</li>' +
      '<li><strong>Оговорки</strong> — исполнитель не гарантирует конкретные показатели отклика, результат зависит от рынка, цен, сезона, бюджета и рейтинга аккаунта.</li>' +
      '</ol>';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function generateContract(data) {
    if (!data) data = {};
    var today = new Date();
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    if (!data.contractDate) data.contractDate = pad(today.getDate()) + '.' + pad(today.getMonth() + 1) + '.' + today.getFullYear();
    var gender = String(data.headerGender || 'm').toLowerCase() === 'f' ? 'f' : 'm';
    var headerImg = gender === 'f' ? 'assets/contract_header_f.png' : 'assets/contract_header_m.png';
    var headerFallbackImg = 'assets/contract_header.png';
    try {
      headerImg = new URL('assets/contract_header.png', window.location.href).href;
      headerImg = new URL(gender === 'f' ? 'assets/contract_header_f.png' : 'assets/contract_header_m.png', window.location.href).href;
      headerFallbackImg = new URL('assets/contract_header.png', window.location.href).href;
    } catch (e) {}
    var headerHtml = '<div class="contract-doc-header"><img src="' + esc(headerImg) + '" alt="" onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src=\'' + esc(headerFallbackImg) + '\';}else{this.style.display=\'none\';}" style="max-width:100%;height:auto"></div>';
    var body = headerHtml + '<div class="contract-doc-body">' + getContractMainTemplate(data) + '</div>';
    var footerImg = 'assets/contract_footer.png';
    try { footerImg = new URL('assets/contract_footer.png', window.location.href).href; } catch (e) {}
    var footerHtml =
      '<div class="contract-doc-footer">' +
        '<img src="' + esc(footerImg) + '" alt="" onerror="this.style.display=\'none\'" style="display:block;width:100%;max-width:100%;height:auto">' +
      '</div>';
    return '<div class="contract-document">' + body + footerHtml + '</div>';
  }

  function detectClientType(data) {
    var inn = (data.inn || '').replace(/\s/g, '');
    return inn.length > 0 ? 'company' : 'person';
  }

  function parseRequisitesFromText(text) {
    var t = String(text || '');
    var out = {};
    var pairs = [];
    function normKey(s) {
      return String(s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[«»"']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    function setIfEmpty(field, value) {
      if (!value) return;
      if (!out[field]) out[field] = String(value).trim();
    }
    function extractEmail(v) {
      var m = String(v || '').match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/ig);
      return m && m.length ? m[0] : '';
    }
    function extractPhone(v) {
      var m = String(v || '').match(/\+?\d[\d\s\-()]{7,}\d/g);
      return m && m.length ? m[0].replace(/\s+/g, ' ').trim() : '';
    }

    t.split(/\r?\n/).forEach(function(lineRaw) {
      var line = String(lineRaw || '').trim();
      if (!line) return;
      var mTab = line.match(/^([^\t]+)\t+(.+)$/);
      var mColon = line.match(/^([^:]{2,}?):\s*(.+)$/);
      var m2sp = line.match(/^(.+?)\s{2,}(.+)$/);
      var left = '', right = '';
      if (mTab) { left = mTab[1]; right = mTab[2]; }
      else if (mColon) { left = mColon[1]; right = mColon[2]; }
      else if (m2sp) { left = m2sp[1]; right = m2sp[2]; }
      if (!left || !right) return;
      pairs.push({ key: left.trim(), value: right.trim() });
    });

    var rules = [
      { field: 'fio', rx: /^(фио|ф\.?\s*и\.?\s*о\.?|фамилия имя отчество|заказчик)$/ },
      { field: 'fullName', rx: /(полное наименование|наименование организации|официальное наименование)/ },
      { field: 'shortName', rx: /(сокращенн(ое|ое) наименование|краткое наименование|сокр\.? наименование)/ },
      { field: 'legalAddress', rx: /(юридическ(ий|ого) адрес|адрес регистрации|юр\.? адрес)/ },
      { field: 'postalAddress', rx: /(почтов(ый|ого) адрес)/ },
      { field: 'actualAddress', rx: /(фактическ(ий|ого) адрес|факт\.? адрес|адрес компании)/ },
      { field: 'ceo', rx: /(генеральн(ый|ого) директор|директор|руководитель)/ },
      { field: 'accountingContacts', rx: /(бухгалтер|бухгалтерия|телефон.*бухгалтер)/ },
      { field: 'contacts', rx: /(телефон|эл\.?\s*почта|email|e-mail|контакт)/ },
      { field: 'innKpp', rx: /(инн\s*\/\s*кпп|инн кпп)/ },
      { field: 'inn', rx: /\bинн\b/ },
      { field: 'kpp', rx: /\bкпп\b/ },
      { field: 'ogrn', rx: /(огрн|огрнип)/ },
      { field: 'account', rx: /(расчетн(ый|ого) счет|расч[её]тн(ый|ого) сч[её]т|р\/с)/ },
      { field: 'corrAccount', rx: /(корреспондентск(ий|ого) счет|корреспондентск(ий|ого) сч[её]т|к\/с|кор\.?\s*сч)/ },
      { field: 'bik', rx: /(бик|бик банка)/ },
      { field: 'bank', rx: /^банк$|^банк\s/ },
      { field: 'edoGuid', rx: /(идентификатор участника эдо|guid|эдо)/ }
    ];

    function isLabelLine(line) {
      var k = normKey(line);
      return rules.some(function(r) { return r.rx.test(k); });
    }

    function applyFieldValue(field, rawValue) {
      var v = String(rawValue || '').trim();
      if (!v) return;
      if (field === 'fio') {
        setIfEmpty('fio', v);
        return;
      }
      if (field === 'innKpp') {
        var innKpp = v.match(/(\d{10,12})\s*\/\s*(\d{9})/);
        if (innKpp) {
          setIfEmpty('inn', innKpp[1]);
          setIfEmpty('kpp', innKpp[2]);
        } else setIfEmpty('innKpp', v);
        return;
      }
      if (field === 'inn') { setIfEmpty('inn', (v.match(/\d{10,12}/) || [v])[0]); return; }
      if (field === 'kpp') { setIfEmpty('kpp', (v.match(/\d{9}/) || [v])[0]); return; }
      if (field === 'ogrn') { setIfEmpty('ogrn', (v.match(/\d{13,15}/) || [v])[0]); return; }
      if (field === 'account') { setIfEmpty('account', (v.match(/\d{20}/) || [v])[0]); return; }
      if (field === 'corrAccount') { setIfEmpty('corrAccount', (v.match(/\d{20}/) || [v])[0]); return; }
      if (field === 'bik') { setIfEmpty('bik', (v.match(/\d{9}/) || [v])[0]); return; }
      if (field === 'contacts') {
        setIfEmpty('contacts', v);
        setIfEmpty('phone', extractPhone(v));
        setIfEmpty('email', extractEmail(v));
        return;
      }
      if (field === 'accountingContacts') {
        setIfEmpty('accountingContacts', v);
        setIfEmpty('accountingPhone', extractPhone(v));
        setIfEmpty('accountingEmail', extractEmail(v));
        return;
      }
      if (field === 'bank') {
        var vv = v.replace(/^БИК\s*Банка$/i, '').trim();
        if (vv) setIfEmpty('bank', vv);
        return;
      }
      setIfEmpty(field, v);
    }

    pairs.forEach(function(p) {
      var k = normKey(p.key);
      var v = String(p.value || '').trim();
      if (!v) return;
      var rule = rules.find(function(r) { return r.rx.test(k); });
      if (!rule) return;
      applyFieldValue(rule.field, v);
    });

    // 2nd pass: for DOCX tables that become "key line" + "value line"
    var lines = t.split(/\r?\n/).map(function(s) { return String(s || '').trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length - 1; i++) {
      var keyNorm = normKey(lines[i]);
      var rule2 = rules.find(function(r) { return r.rx.test(keyNorm); });
      if (!rule2) continue;
      var next = String(lines[i + 1] || '').trim();
      if (!next) continue;
      if (isLabelLine(next)) continue;
      applyFieldValue(rule2.field, next);
    }

    var m;
    m = t.match(/\bИНН[\s:]*(\d{10,12})/i); if (m) setIfEmpty('inn', m[1]);
    m = t.match(/\bКПП[\s:]*(\d{9})/i); if (m) setIfEmpty('kpp', m[1]);
    m = t.match(/\bОГРН[\s:]*(\d{13,15})/i); if (m) setIfEmpty('ogrn', m[1]);
    m = t.match(/\bОГРНИП[\s:]*(\d{13,15})/i); if (m) setIfEmpty('ogrn', m[1]);
    m = t.match(/\b[р\/\s]*сч[её]т[\s:]*(\d{20})/i) || t.match(/\bр\/с[\s:]*(\d{20})/i) || t.match(/\b(\d{20})\b/); if (m) setIfEmpty('account', m[1]);
    m = t.match(/\bБИК[\s:]*(\d{9})/i); if (m) setIfEmpty('bik', m[1]);
    m = t.match(/\bк[оа]р[.\s]*сч[её]т[\s:]*(\d{20})/i) || t.match(/\bк\/с[\s:]*(\d{20})/i); if (m) setIfEmpty('corrAccount', m[1]);
    m = t.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/ig); if (m && m.length) setIfEmpty('email', m[0]);
    m = t.match(/\+?\d[\d\s\-()]{7,}\d/g); if (m && m.length) setIfEmpty('phone', m[0].replace(/\s+/g, ' ').trim());
    m = t.match(/(?:ООО|АО|ПАО)\s*[«\"].+?[»\"]/i) || t.match(/(?:ИП)\s+[А-Яа-яЁё\s\-]+/i); if (m) setIfEmpty('shortName', m[0]);
    m = t.match(/(?:ФИО|Ф\.?\s*И\.?\s*О\.?)\s*[:\-]?\s*([А-ЯЁ][а-яё-]{1,32}\s+[А-ЯЁ][а-яё-]{1,32}\s+[А-ЯЁ][а-яё-]{1,32})/i);
    if (m) setIfEmpty('fio', m[1]);
    if (!out.fio) {
      var fioGuess = t.match(/\b([А-ЯЁ][а-яё-]{1,32}\s+[А-ЯЁ][а-яё-]{1,32}\s+[А-ЯЁ][а-яё-]{1,32})\b/);
      if (fioGuess && !/(ООО|АО|ПАО|ИП|БАНК)/i.test(fioGuess[1])) setIfEmpty('fio', fioGuess[1]);
    }
    if (!out.fullName) {
      m = t.match(/Общество с ограниченной ответственностью\s+[«\"].+?[»\"]/i);
      if (m) setIfEmpty('fullName', m[0]);
    }
    var bankMatch = t.match(/\b(ПАО СБЕРБАНК|СБЕРБАНК|Т-БАНК|ТБАНК|ВТБ|АЛЬФА-БАНК|[А-Яа-яЁё\s\-]+БАНК[а-яё]*)/i);
    if (bankMatch) setIfEmpty('bank', bankMatch[1].trim());
    if (!out.actualAddress) {
      var addr = t.match(/\d{6}\s*,?\s*РОССИЯ[^,\n]*(?:,\s*[^,\n]+){2,}/i);
      if (addr) setIfEmpty('actualAddress', addr[0]);
    }
    if (!out.legalAddress && out.actualAddress) setIfEmpty('legalAddress', out.actualAddress);
    if (!out.postalAddress && out.actualAddress) setIfEmpty('postalAddress', out.actualAddress);
    if (!out.contacts && (out.phone || out.email)) setIfEmpty('contacts', [out.phone, out.email].filter(Boolean).join(' / '));
    if (!out.accountingContacts && (out.accountingPhone || out.accountingEmail)) setIfEmpty('accountingContacts', [out.accountingPhone, out.accountingEmail].filter(Boolean).join(' / '));
    out.__pairs = pairs;
    return out;
  }

  var MAMMOTH_CDNS = [
    'https://unpkg.com/mammoth@1.6.0/mammoth.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.min.js'
  ];
  var HTML2PDF_CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
    'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'
  ];

  function getMammoth(cb) {
    var m = (typeof window !== 'undefined' && window.mammoth) || (typeof mammoth !== 'undefined' ? mammoth : null);
    if (m && typeof m.extractRawText === 'function') {
      cb(null, m);
      return;
    }
    var idx = 0;
    var done = false;
    function finish(err, mm) {
      if (done) return;
      done = true;
      cb(err, mm || null);
    }
    function tryNext() {
      if (idx >= MAMMOTH_CDNS.length) {
        finish(new Error('Не удалось загрузить mammoth. Проверьте интернет или используйте .txt файл.'), null);
        return;
      }
      var src = MAMMOTH_CDNS[idx++];
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function() {
        var mm = window.mammoth;
        if (mm && typeof mm.extractRawText === 'function') finish(null, mm);
        else tryNext();
      };
      s.onerror = function() { tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  }

  function readFileAsText(file, callback) {
    var reader = new FileReader();
    reader.onload = function() { callback(null, reader.result); };
    reader.onerror = function() { callback(new Error('Не удалось прочитать файл')); };
    if (file.name.toLowerCase().endsWith('.txt')) {
      reader.readAsText(file, 'UTF-8');
    } else if (file.name.toLowerCase().endsWith('.docx')) {
      getMammoth(function(err, mammoth) {
        if (err || !mammoth) {
          callback(err || new Error('Библиотека mammoth недоступна. Обновите страницу.'));
          return;
        }
        reader.onload = function() {
          mammoth.extractRawText({ arrayBuffer: reader.result }).then(function(r) {
            callback(null, r.value);
          }).catch(function(e) { callback(e); });
        };
        reader.readAsArrayBuffer(file);
      });
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      callback(new Error('PDF пока не поддерживается. Используйте .txt или .docx'));
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  }
  function getHtml2Pdf(cb) {
    var h = (typeof window !== 'undefined' && window.html2pdf) || (typeof html2pdf !== 'undefined' ? html2pdf : null);
    if (typeof h === 'function') {
      cb(null, h);
      return;
    }
    var idx = 0;
    var done = false;
    function finish(err, fn) {
      if (done) return;
      done = true;
      cb(err, fn || null);
    }
    function tryNext() {
      if (idx >= HTML2PDF_CDNS.length) {
        finish(new Error('Не удалось загрузить модуль PDF. Проверьте интернет.'), null);
        return;
      }
      var src = HTML2PDF_CDNS[idx++];
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function() {
        var fn = window.html2pdf;
        if (typeof fn === 'function') finish(null, fn);
        else tryNext();
      };
      s.onerror = function() { tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  }

  function renderContractForm(container, onGenerate, onClear) {
    var state = {
      fio: '',
      companyName: '',
      inn: '',
      ogrn: '',
      account: '',
      bank: '',
      bik: '',
      corrAccount: '',
      passport: '',
      startDate: '',
      endDate: '',
      daysCreate: '',
      daysManage: '',
      cost: '',
      headerGender: 'm'
    };

    var _contractScreenshots = [];

    function getFormData() {
      var d = {};
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost', 'soldCount', 'extraServices', 'headerGender'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        d[k] = el ? el.value.trim() : '';
      });
      if (!d.headerGender) d.headerGender = 'm';
      d.cost = String(normalizeMoneyValue(d.cost || '50000') || 0);
      d.companyName = d.fio;
      d.clientType = detectClientType(d);
      d.screenshots = (_contractScreenshots || []).slice();
      return d;
    }

    function setFormData(d) {
      if (!d) return;
      Object.keys(d).forEach(function(k) {
        if (k === 'screenshots') {
          _contractScreenshots = Array.isArray(d[k]) ? d[k].slice() : [];
          renderContractScreenshots();
          return;
        }
        var el = document.getElementById('contract-' + k);
        if (el && d[k] !== undefined) el.value = d[k];
      });
    }

    function applyParsed(parsed) {
      var fioEl = document.getElementById('contract-fio');
      var fioVal = parsed.fio || parsed.shortName || parsed.fullName || '';
      if (fioEl && fioVal) fioEl.value = fioVal;
      if (parsed.inn) document.getElementById('contract-inn').value = parsed.inn;
      if (parsed.ogrn) document.getElementById('contract-ogrn').value = parsed.ogrn;
      if (parsed.account) document.getElementById('contract-account').value = parsed.account;
      if (parsed.bank) document.getElementById('contract-bank').value = parsed.bank;
      if (parsed.bik) document.getElementById('contract-bik').value = parsed.bik;
      if (parsed.corrAccount) document.getElementById('contract-corrAccount').value = parsed.corrAccount;
      if (parsed.passport) document.getElementById('contract-passport').value = parsed.passport;
    }

    function escHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderParsedRequisites(parsed) {
      var box = document.getElementById('contractParsedRequisites');
      if (!box) return;
      var valueToLabels = {};
      var valueOrder = [];
      var normalizedValueToDisplayValue = {};
      function normContactValue(v) {
        return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
      }
      function normValue(v) {
        return String(v || '')
          .toLowerCase()
          .replace(/ё/g, 'е')
          .replace(/\s*,\s*/g, ', ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      function add(label, val) {
        var value = String(val || '').trim();
        if (!value) return;
        var valueNorm = normValue(value);
        var displayValue = normalizedValueToDisplayValue[valueNorm] || value;
        if (!normalizedValueToDisplayValue[valueNorm]) {
          normalizedValueToDisplayValue[valueNorm] = displayValue;
        }
        if (!valueToLabels[displayValue]) {
          valueToLabels[displayValue] = [];
          valueOrder.push(displayValue);
        }
        if (valueToLabels[displayValue].indexOf(label) < 0) valueToLabels[displayValue].push(label);
      }

      add('Полное наименование', parsed.fullName);
      add('Сокращенное наименование', parsed.shortName || parsed.fio);
      add('Юридический адрес', parsed.legalAddress);
      add('Почтовый адрес', parsed.postalAddress);
      add('Фактический адрес', parsed.actualAddress);
      add('Генеральный директор', parsed.ceo);
      var contactsMerged = String(parsed.contacts || '').trim() || [parsed.phone, parsed.email].filter(Boolean).join(' / ').trim();
      var accountingMerged = String(parsed.accountingContacts || '').trim() || [parsed.accountingPhone, parsed.accountingEmail].filter(Boolean).join(' / ').trim();
      add('Телефон / эл. почта', contactsMerged);
      if (accountingMerged && normContactValue(accountingMerged) !== normContactValue(contactsMerged)) {
        add('Телефон / эл. почта бухгалтерия', accountingMerged);
      }
      add('ИНН', parsed.inn);
      add('КПП', parsed.kpp);
      add('ИНН/КПП', parsed.innKpp);
      add('ОГРН', parsed.ogrn);
      add('Расчетный счет', parsed.account);
      add('Корреспондентский счет', parsed.corrAccount);
      add('БИК Банка', parsed.bik);
      add('Банк', parsed.bank);
      add('GUID (ЭДО)', parsed.edoGuid);

      var rows = valueOrder.map(function(value) {
        var labels = valueToLabels[value].slice();
        var hasLegal = labels.indexOf('Юридический адрес') >= 0;
        var hasPostal = labels.indexOf('Почтовый адрес') >= 0;
        var hasActual = labels.indexOf('Фактический адрес') >= 0;
        if (hasLegal || hasPostal || hasActual) {
          labels = labels.filter(function(l) {
            return l !== 'Юридический адрес' && l !== 'Почтовый адрес' && l !== 'Фактический адрес';
          });
          var addrParts = [];
          if (hasLegal) addrParts.push('Юридический');
          if (hasPostal) addrParts.push('Почтовый');
          if (hasActual) addrParts.push('Фактический');
          labels.unshift(addrParts.join(', ') + ' адрес');
        }
        if (labels.indexOf('Телефон / эл. почта') >= 0) {
          labels = labels.filter(function(l) {
            var ll = String(l || '').toLowerCase();
            return ll !== 'телефон' && ll !== 'e-mail' && ll !== 'email' && ll !== 'эл. почта' && ll !== 'эл почта';
          });
        }
        if (labels.indexOf('Телефон / эл. почта бухгалтерия') >= 0) {
          labels = labels.filter(function(l) {
            var ll = String(l || '').toLowerCase();
            return ll !== 'телефон бухгалтерии' && ll !== 'e-mail бухгалтерии' && ll !== 'email бухгалтерии' && ll !== 'эл. почта бухгалтерии';
          });
        }
        return { label: labels.join(', '), value: value };
      }).filter(function(row) {
        return String(row.label || '').trim().length > 0;
      });

      if (!rows.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      box.style.display = 'block';
      box.innerHTML = '<table class="contract-parsed-table"><tbody>' +
        rows.map(function(r) { return '<tr><td>' + escHtml(r.label) + '</td><td>' + escHtml(r.value) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }

    var html = '<div class="contract-form-wrap">' +
      '<div class="contract-toolbar">' +
      '<div class="contract-ai-line">' +
      '<textarea id="contract-ai-text" class="contract-ai-input" rows="2" placeholder="ИИ-строка: вставьте реквизиты текстом и нажмите Отправить (Ctrl+Enter)"></textarea>' +
      '<button type="button" class="contract-toolbar-btn contract-ai-send-btn" id="contractAiSendBtn">✦ Отправить</button>' +
      '</div>' +
      '<div class="contract-client-caption" id="contractClientCaption">ФИО: —</div>' +
      '<div class="contract-toolbar-row contract-toolbar-row-secondary" id="contractToolbarSecondary" style="display:none">' +
      '<button type="button" class="btn-gen contract-toolbar-btn" style="width:auto;min-width:0;flex:0 0 auto;display:inline-flex;padding:6px 12px;margin:0;border-radius:8px" onclick="window.__contractGenerate&&window.__contractGenerate()"><span>&#9889;</span> Сгенерировать договор</button>' +
      '<div class="contract-gender-switch" id="contractGenderSwitch" title="Выбор картинки в шапке">' +
      '<button type="button" class="contract-gender-btn on" data-gender="m">👨 M</button>' +
      '<button type="button" class="contract-gender-btn" data-gender="f">👩 Ж</button>' +
      '</div>' +
      '<input type="hidden" id="contract-headerGender" value="m">' +
      '<button type="button" class="contract-toolbar-btn contract-btn-savew" id="contractSaveWBtn" style="display:none" onclick="window.__contractSaveW&&window.__contractSaveW()">🟦 Сохранить в W</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-pdf" id="contractSavePdfBtn" onclick="window.__contractSavePdf&&window.__contractSavePdf()">📕 Сохранить PDF</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-clear" onclick="window.__contractClear&&window.__contractClear()">Очистить</button>' +
      '<span class="contract-save-status" id="contractSaveStatus"></span>' +
      '</div>' +
      '</div>' +
      '<div class="contract-form">' +
      '<div class="contract-form-section contract-requisites-section">' +
      '<input type="hidden" id="contract-fio">' +
      '<input type="hidden" id="contract-inn">' +
      '<input type="hidden" id="contract-ogrn">' +
      '<input type="hidden" id="contract-account">' +
      '<input type="hidden" id="contract-bank">' +
      '<input type="hidden" id="contract-bik">' +
      '<input type="hidden" id="contract-corrAccount">' +
      '<input type="hidden" id="contract-passport">' +
      '<div class="contract-parsed-wrap" id="contractParsedRequisites" style="display:none"></div>' +
      '</div>' +
      '<div class="contract-extra-panel">' +
      '<h4 class="contract-form-title">Дополнительные параметры договора</h4>' +
      '<p class="contract-extra-hint">Стратегия продажи, скриншоты, кол-во объявлений и доп. услуги для приложения</p>' +
      '<div class="contract-form-grid">' +
      '<div class="fg"><label>Дата начала работ</label><input type="date" id="contract-startDate"></div>' +
      '<div class="fg"><label>Дата окончания работ</label><input type="date" id="contract-endDate"></div>' +
      '<div class="fg"><label>Дней на создание рекламы</label><input type="number" id="contract-daysCreate" placeholder="12" min="1"></div>' +
      '<div class="fg"><label>Дней ведения рекламы</label><input type="number" id="contract-daysManage" placeholder="30" min="1"></div>' +
      '<div class="fg"><label>Стоимость договора, руб.</label><input type="number" id="contract-cost" placeholder="50000" min="0"></div>' +
      '<div class="fg"><label>Кол-во проданных объявлений</label><input type="number" id="contract-soldCount" placeholder="5" min="0"></div>' +
      '</div>' +
      '<div class="fg contract-extra-services-wrap"><label>Доп. услуги для приложения</label><textarea id="contract-extraServices" placeholder="Фотосъёмка, инфографика, доп. продвижение..." rows="2"></textarea></div>' +
      '<div class="contract-screenshots-zone">' +
      '<div class="contract-screenshots-drop" id="contract-screenshots-drop">' +
      '<span class="contract-screenshots-drop-icon">📷</span>' +
      '<span>Перетащите скриншоты стратегии (png, jpg)</span>' +
      '</div>' +
      '<input type="file" id="contract-screenshots-inp" accept="image/png,image/jpeg,image/jpg,image/webp" multiple style="display:none">' +
      '<div class="contract-screenshots-list" id="contract-screenshots-list"></div>' +
      '</div></div></div></div>';

    container.innerHTML = html;

    var today = new Date();
    var pad2 = function(n) { return (n < 10 ? '0' : '') + n; };
    var todayStr = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
    var startEl = document.getElementById('contract-startDate');
    if (startEl) startEl.value = todayStr;
    var daysCreateEl = document.getElementById('contract-daysCreate');
    var daysManageEl = document.getElementById('contract-daysManage');
    var endEl = document.getElementById('contract-endDate');
    var costEl = document.getElementById('contract-cost');
    if (daysCreateEl && !daysCreateEl.value) daysCreateEl.value = '12';
    if (daysManageEl && !daysManageEl.value) daysManageEl.value = '30';
    if (costEl && !costEl.value) costEl.value = '50000';
    function recalcEndDate() {
      if (!startEl || !endEl) return;
      var s = String(startEl.value || '').trim();
      if (!s) return;
      var d1 = parseInt((daysCreateEl && daysCreateEl.value) || '12', 10);
      var d2 = parseInt((daysManageEl && daysManageEl.value) || '30', 10);
      if (!Number.isFinite(d1) || d1 < 0) d1 = 12;
      if (!Number.isFinite(d2) || d2 < 0) d2 = 30;
      var base = new Date(s + 'T00:00:00');
      if (isNaN(base.getTime())) return;
      base.setDate(base.getDate() + d1 + d2);
      endEl.value = base.getFullYear() + '-' + pad2(base.getMonth() + 1) + '-' + pad2(base.getDate());
    }
    if (startEl) startEl.addEventListener('input', recalcEndDate);
    if (daysCreateEl) daysCreateEl.addEventListener('input', recalcEndDate);
    if (daysManageEl) daysManageEl.addEventListener('input', recalcEndDate);
    recalcEndDate();
    var secondaryToolbar = document.getElementById('contractToolbarSecondary');
    var fioEl = document.getElementById('contract-fio');
    var captionEl = document.getElementById('contractClientCaption');
    function setSecondaryVisible(v) {
      if (secondaryToolbar) secondaryToolbar.style.display = v ? 'flex' : 'none';
    }
    function refreshClientCaption() {
      if (!captionEl) return;
      var fio = fioEl ? String(fioEl.value || '').trim() : '';
      captionEl.textContent = 'ФИО: ' + (fio || '—');
      if (fio) setSecondaryVisible(true);
    }
    if (fioEl) fioEl.addEventListener('input', refreshClientCaption);
    refreshClientCaption();
    var genderInp = document.getElementById('contract-headerGender');
    var genderSwitch = document.getElementById('contractGenderSwitch');
    function setHeaderGender(val) {
      var v = (String(val || '').toLowerCase() === 'f') ? 'f' : 'm';
      if (genderInp) genderInp.value = v;
      if (genderSwitch) {
        genderSwitch.querySelectorAll('.contract-gender-btn').forEach(function(btn) {
          btn.classList.toggle('on', btn.getAttribute('data-gender') === v);
        });
      }
    }
    if (genderSwitch) {
      genderSwitch.querySelectorAll('.contract-gender-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          setHeaderGender(btn.getAttribute('data-gender'));
        });
      });
    }
    setHeaderGender('m');

    window.__contractGenerate = function() {
      var d = getFormData();
      var fmt = function(x) {
        if (!x) return '';
        var parts = String(x).split('-');
        if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
        return x;
      };
      d.startDate = fmt(d.startDate) || d.startDate;
      d.endDate = fmt(d.endDate) || d.endDate;
      onGenerate(d);
    };

    window.__contractClear = function() {
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost', 'soldCount', 'extraServices'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        if (el) el.value = '';
      });
      setHeaderGender('m');
      if (daysCreateEl) daysCreateEl.value = '12';
      if (daysManageEl) daysManageEl.value = '30';
      if (costEl) costEl.value = '50000';
      refreshClientCaption();
      setSecondaryVisible(false);
      _contractScreenshots = [];
      renderContractScreenshots();
      var startEl = document.getElementById('contract-startDate');
      if (startEl) startEl.value = todayStr;
      recalcEndDate();
      onClear && onClear();
    };

    function renderContractScreenshots() {
      var list = document.getElementById('contract-screenshots-list');
      if (!list) return;
      if (!_contractScreenshots.length) {
        list.innerHTML = '';
        list.style.display = 'none';
        return;
      }
      list.style.display = 'flex';
      list.innerHTML = _contractScreenshots.map(function(dataUrl, i) {
        return '<div class="contract-screenshot-thumb" data-i="' + i + '">' +
          '<img src="' + dataUrl + '" alt="Скрин ' + (i + 1) + '">' +
          '<button type="button" class="contract-screenshot-rm" onclick="window.__contractRemoveScreenshot&&window.__contractRemoveScreenshot(' + i + ')" title="Удалить">×</button>' +
          '</div>';
      }).join('');
    }

    window.__contractRemoveScreenshot = function(i) {
      _contractScreenshots.splice(i, 1);
      renderContractScreenshots();
    };

    function addContractScreenshot(file) {
      if (!file || !file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) return;
      var reader = new FileReader();
      reader.onload = function() {
        _contractScreenshots.push(reader.result);
        renderContractScreenshots();
      };
      reader.readAsDataURL(file);
    }

    var aiInp = document.getElementById('contract-ai-text');
    var aiSendBtn = document.getElementById('contractAiSendBtn');

    function processRequisitesText(text, sourceLabel) {
      var raw = String(text || '').trim();
      if (!raw) {
        if (typeof window.__showToast === 'function') window.__showToast('Пустой текст в ' + sourceLabel);
        else alert('Пустой текст в ' + sourceLabel);
        return;
      }
      var parsed = parseRequisitesFromText(raw);
      applyParsed(parsed);
      renderParsedRequisites(parsed);
      refreshClientCaption();
      setSecondaryVisible(true);
      if (typeof window.__showToast === 'function') window.__showToast('Реквизиты обработаны из ' + sourceLabel);
      else alert('Реквизиты извлечены и заполнены');
    }
    if (aiSendBtn) aiSendBtn.addEventListener('click', function() {
      processRequisitesText(aiInp && aiInp.value, 'ИИ-строки');
    });
    if (aiInp) {
      aiInp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          processRequisitesText(aiInp.value, 'ИИ-строки');
        }
      });
    }

    var screenshotsDrop = document.getElementById('contract-screenshots-drop');
    var screenshotsInp = document.getElementById('contract-screenshots-inp');
    if (screenshotsDrop) {
      screenshotsDrop.addEventListener('click', function() { screenshotsInp && screenshotsInp.click(); });
      screenshotsDrop.addEventListener('dragover', function(e) { e.preventDefault(); screenshotsDrop.classList.add('contract-drop-over'); });
      screenshotsDrop.addEventListener('dragleave', function() { screenshotsDrop.classList.remove('contract-drop-over'); });
      screenshotsDrop.addEventListener('drop', function(e) {
        e.preventDefault();
        screenshotsDrop.classList.remove('contract-drop-over');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files) for (var i = 0; i < files.length; i++) addContractScreenshot(files[i]);
      });
    }
    if (screenshotsInp) {
      screenshotsInp.addEventListener('change', function() {
        var files = screenshotsInp.files;
        if (files) for (var i = 0; i < files.length; i++) addContractScreenshot(files[i]);
        screenshotsInp.value = '';
      });
    }

    return { getFormData: getFormData, setFormData: setFormData };
  }

  function renderContractPreview(container, html) {
    var inner = html || '<div class="contract-preview-placeholder" style="padding:40px;text-align:center;color:var(--muted);font-size:13px">Договор появится здесь после нажатия «Сгенерировать договор»</div>';
    container.innerHTML = '<div class="contract-preview-wrap"><div class="contract-preview-inner">' + inner + '</div></div>';
  }

  function renderContractGenerator(mainContentEl) {
    var lastGeneratedHtml = '';
    var lastGeneratedData = null;

    function folderIdFromLink(link) {
      var m = String(link || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
      return m ? m[1] : '';
    }
    function getTargetFolderCtx() {
      var selected = (typeof getSelectedAnalyticsRecentProject === 'function') ? getSelectedAnalyticsRecentProject() : null;
      if (selected && (selected.folderId || selected.folderLink)) {
        var selectedFid = String(selected.folderId || folderIdFromLink(selected.folderLink) || '').trim();
        if (selectedFid) return {
          folderId: selectedFid,
          name: selected.company || selected.title || selected.projectTitle || 'Клиент',
          source: 'selected'
        };
      }
      var ac = null;
      if (typeof getActiveClient === 'function') ac = getActiveClient();
      if (!ac && typeof window.__goalsGetActiveClient === 'function') ac = window.__goalsGetActiveClient();
      if (ac && (ac.folderId || ac.folderLink)) {
        var fid = String(ac.folderId || folderIdFromLink(ac.folderLink) || '').trim();
        if (fid) return { folderId: fid, name: ac.company || ac.contact_name || 'Клиент', source: 'active' };
      }
      return null;
    }
    function updateSaveButtonState() {
      var btn = document.getElementById('contractSaveWBtn');
      var st = document.getElementById('contractSaveStatus');
      if (!btn) return;
      var ctx = getTargetFolderCtx();
      if (!ctx || !ctx.folderId) {
        btn.style.display = 'inline-flex';
        btn.disabled = false;
        btn.title = 'Скачать .doc (локально)';
        if (st) st.textContent = '';
        return;
      }
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      btn.title = 'Сохранить договор в Google Docs';
      if (st && !st.textContent) st.textContent = 'Папка: ' + String(ctx.name || 'Клиент');
    }
    function wrapContractHtml(innerHtml) {
      return '<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#fff;color:#111;font-family:Golos Text,Arial,sans-serif">' +
        String(innerHtml || '') +
        '</body></html>';
    }

    var wrap = document.createElement('div');
    wrap.className = 'contract-generator';
    wrap.innerHTML = '<div class="contract-generator-preview" id="contractPreviewArea"></div><div class="contract-generator-form" id="contractFormArea"></div>';
    mainContentEl.innerHTML = '';
    mainContentEl.appendChild(wrap);
    mainContentEl.scrollTop = 0;
    var wrapEl = mainContentEl.closest('.content-wrap');
    if (wrapEl) wrapEl.scrollTop = 0;

    var formArea = document.getElementById('contractFormArea');
    var previewArea = document.getElementById('contractPreviewArea');
    if (previewArea) previewArea.style.display = 'none';

    renderContractForm(formArea, function(data) {
      var html = generateContract(data);
      lastGeneratedHtml = html;
      lastGeneratedData = data || null;
      if (previewArea) previewArea.style.display = '';
      renderContractPreview(previewArea, html);
      updateSaveButtonState();
    }, function() {
      lastGeneratedHtml = '';
      lastGeneratedData = null;
      if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.style.display = 'none';
      }
      updateSaveButtonState();
    });

    window.__contractSaveW = async function() {
      var st = document.getElementById('contractSaveStatus');
      var btn = document.getElementById('contractSaveWBtn');
      var ctx = getTargetFolderCtx();
      if (!lastGeneratedHtml) {
        if (typeof window.__contractGenerate === 'function') window.__contractGenerate();
      }
      if (!lastGeneratedHtml) {
        if (st) st.textContent = 'Сначала сгенерируйте договор';
        return;
      }
      function downloadDocLocal(name, htmlStr) {
        var blob = new Blob([wrapContractHtml(htmlStr)], { type: 'application/msword' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (name || 'Договор') + '.doc';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          URL.revokeObjectURL(a.href);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 0);
      }
      try {
        if (btn) btn.disabled = true;
        var who = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || ctx.name || 'Клиент';
        var docName = '📜 Договор — ' + String(who);
        var canDrive = !!(ctx && ctx.folderId && typeof driveCreateGoogleDoc === 'function' && typeof getDriveToken === 'function');
        if (canDrive) {
          if (st) st.textContent = 'Сохраняю в Google Docs...';
          await getDriveToken();
          var res = await driveCreateGoogleDoc(docName, wrapContractHtml(lastGeneratedHtml), ctx.folderId);
          if (st) {
            var link = res && res.webViewLink ? String(res.webViewLink) : '';
            st.innerHTML = link
              ? '✓ Сохранено в Drive · <a href="' + link + '" target="_blank" rel="noopener" style="color:#7cf5ff;text-decoration:underline">Открыть</a>'
              : '✓ Сохранено в папку';
          }
        } else {
          downloadDocLocal(docName, lastGeneratedHtml);
          if (st) st.textContent = '✓ Скачан .doc файл';
        }
      } catch (e) {
        try {
          var who2 = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || 'Клиент';
          downloadDocLocal('📜 Договор — ' + String(who2), lastGeneratedHtml);
          if (st) st.textContent = 'Drive недоступен, скачан .doc файл';
        } catch (e2) {
          if (st) st.textContent = 'Ошибка сохранения: ' + String((e2 && e2.message) || e2 || e);
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    };

    window.__contractSavePdf = async function() {
      var st = document.getElementById('contractSaveStatus');
      if (!lastGeneratedHtml) {
        if (typeof window.__contractGenerate === 'function') window.__contractGenerate();
      }
      if (!lastGeneratedHtml) {
        if (st) st.textContent = 'Сначала сгенерируйте договор';
        return;
      }
      var wrapTmp = document.createElement('div');
      wrapTmp.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#fff;color:#000;padding:20px;box-sizing:border-box;';
      wrapTmp.innerHTML = lastGeneratedHtml;
      document.body.appendChild(wrapTmp);
      try {
        if (st) st.textContent = 'Готовлю PDF...';
        var who = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || 'Клиент';
        var html2pdfFn = await new Promise(function(resolve, reject) {
          getHtml2Pdf(function(err, fn) {
            if (err || typeof fn !== 'function') reject(err || new Error('PDF модуль недоступен'));
            else resolve(fn);
          });
        });
        await html2pdfFn().set({
          margin: [8, 8, 8, 8],
          filename: 'Договор — ' + String(who) + '.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 1.8, useCORS: true, allowTaint: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        }).from(wrapTmp).save();
        if (st) st.textContent = '✓ PDF сохранен';
      } catch (e) {
        try {
          var win = window.open('', '_blank');
          if (win) {
            win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Договор</title></head><body>' + lastGeneratedHtml + '</body></html>');
            win.document.close();
            win.focus();
            win.print();
            if (st) st.textContent = 'Открыт режим печати (Сохранить как PDF)';
          } else if (st) st.textContent = 'Ошибка PDF: ' + String((e && e.message) || e);
        } catch (e2) {
          if (st) st.textContent = 'Ошибка PDF: ' + String((e2 && e2.message) || e2 || e);
        }
      } finally {
        document.body.removeChild(wrapTmp);
      }
    };

    window.__contractRefreshSaveButton = updateSaveButtonState;
    updateSaveButtonState();
  }

  window.ContractGenerator = {
    render: renderContractGenerator,
    generateContract: generateContract,
    parseRequisitesFromText: parseRequisitesFromText
  };
  window.__showContractGenerator = renderContractGenerator;
})();
