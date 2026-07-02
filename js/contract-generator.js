/**
 * Contract Generator — генерация договоров в разделе CLIENT
 * Модули: ContractGenerator (main), ContractForm, ContractPreview, generateContract
 */
(function() {
  'use strict';

  // Исполнители для договора
  var EXECUTORS = {
    filipp: {
      key: 'filipp',
      name: 'ИП Шинков Филипп Аркадьевич',
      fullName: 'ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ШИНКОВ ФИЛИПП АРКАДЬЕВИЧ',
      legalAddress: '142000, РОССИЯ, МОСКОВСКАЯ ОБЛ, Г ДОМОДЕДОВО, МКР ЗАПАДНЫЙ, УЛ СЕМЕНОВСКАЯ, Д 23/13',
      inn: '500915387195',
      ogrn: '322508100110311',
      account: '40802810400003078140',
      bank: 'АО «ТБанк»',
      bankInn: '7710140679',
      bik: '044525974',
      corrAccount: '30101810145250000974',
      bankAddress: '127287, г. Москва, ул. Хуторская 2-я, д. 38А, стр. 26',
      phone: '+7 985 332 55 41'
    },
    regina: {
      key: 'regina',
      name: 'ИП Константинова Регина Владимировна',
      fullName: 'ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ КОНСТАНТИНОВА РЕГИНА ВЛАДИМИРОВНА',
      legalAddress: '665714, РОССИЯ, ИРКУТСКАЯ ОБЛ, Г БРАТСК, ЖИЛРАЙОН ГИДРОСТРОИТЕЛЬ, УЛ СОСНОВАЯ, Д 5А, КВ 33',
      inn: '380583881830',
      ogrn: '325385000091613',
      account: '40802810600008615971',
      bank: 'АО «ТБанк»',
      bankInn: '7710140679',
      bik: '044525974',
      corrAccount: '30101810145250000974',
      bankAddress: '127287, г. Москва, ул. Хуторская 2-я, д. 38А, стр. 26',
      phone: ''
    }
  };
  var EXECUTOR = EXECUTORS.filipp;

  function getExecutor(data) {
    var key = data && data.executorKey ? String(data.executorKey) : 'filipp';
    return EXECUTORS[key] || EXECUTORS.filipp;
  }

  function executorLine(label, value, br) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return '';
    return (br === false ? '' : '<br>') + (label ? label + ' ' : '') + v;
  }

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
    var executor = getExecutor(data);
    var clientName = data.companyName || data.fio || 'Заказчик';
    var contractDate = data.contractDate || data.startDate || '—';
    var startDate = data.startDate || '—';
    var endDate = data.endDate || '—';
    var daysCreate = data.daysCreate || '—';
    var daysManage = data.daysManage || '—';
    var includeExtraManage = String(data.extraManageEnabled || '').toLowerCase() === '1';
    var extraManageDays = parseInt(String(data.extraManageDays || '').trim(), 10);
    if (!isFinite(extraManageDays) || extraManageDays < 0) extraManageDays = 0;
    var manageOrderText = daysManage + ' дней ведения аккаунта';
    if (includeExtraManage && extraManageDays > 0) {
      var baseManageDays = parseInt(String(daysManage).replace(/[^\d]/g, ''), 10);
      var totalManageText = isFinite(baseManageDays) && baseManageDays > 0
        ? ' (итого ' + (baseManageDays + extraManageDays) + ' дней ведения)'
        : '';
      manageOrderText += ' + ' + extraManageDays + ' дней дополнительного ведения аккаунта' + totalManageText;
    }
    var costNum = normalizeMoneyValue(data.cost);
    var costFmt = String(costNum || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var costWords = numberToWordsRu(costNum);
    var clientInn = data.inn || '';
    var clientOgrn = data.ogrn || '';
    var clientAccount = data.account || '';
    var clientBank = data.bank || '';
    var clientBik = data.bik || '';
    var clientCorr = data.corrAccount || '';
    var clientPhone = data.phone || data.contacts || '';
    function hasClientValue(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return false;
      return s !== '—' && s !== '-';
    }
    function clientRow(label, value) {
      if (!hasClientValue(value)) return '';
      return '◆ ' + (label ? (label + ' ') : '') + value + '<br>';
    }
    var leftBullets =
      '<div style="font-size:8.7pt;line-height:1.24">' +
      '◆ ' + executor.name + '<br>' +
      '◆ ИНН ' + executor.inn + '<br>' +
      '◆ ОГРНИП ' + executor.ogrn + '<br>' +
      '◆ Р/С ' + executor.account + '<br>' +
      '◆ ' + executor.bank + '<br>' +
      '◆ БИК ' + executor.bik + '<br>' +
      '◆ К/С ' + executor.corrAccount +
      executorLine('◆ Тел.', executor.phone) +
      '</div>';
    var rightRows =
      '◆ ' + clientName + '<br>' +
      clientRow('ИНН', clientInn) +
      clientRow('ОГРН', clientOgrn) +
      clientRow('Р/С', clientAccount) +
      clientRow('', clientBank) +
      clientRow('БИК', clientBik) +
      clientRow('К/С', clientCorr) +
      clientRow('Тел.', clientPhone);
    if (rightRows.endsWith('<br>')) rightRows = rightRows.slice(0, -4);
    var rightBullets = '<div style="font-size:8.7pt;line-height:1.24">' + rightRows + '</div>';
    var clientLegalRows =
      clientRow('ИНН', clientInn) +
      clientRow('ОГРН', clientOgrn) +
      clientRow('Р/С', clientAccount) +
      clientRow('Банк', clientBank) +
      clientRow('БИК', clientBik) +
      clientRow('К/С', clientCorr);

    return '' +
      '<h2 style="text-align:center;font-size:15.2pt;line-height:1.14;margin:2px 0 4px;letter-spacing:.15px;font-weight:800">Договор Возмездного<br>Оказания Услуг от ' + contractDate + '</h2>' +
      '<div style="text-align:center;font-size:10pt;line-height:1.28;margin:0 0 6px">' +
        '<div style="white-space:nowrap"><strong>' + executor.name + '</strong> именуемый в дальнейшем "Исполнитель", с одной стороны, и</div>' +
        '<div style="white-space:nowrap"><strong>' + clientName + '</strong> именуемый в дальнейшем "Заказчик"</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin:3px 0 6px;border:1px solid #2d2d2d">' +
        '<tr>' +
          '<td style="width:50%;vertical-align:top;padding:6px 8px;border-right:1px solid #2d2d2d">' + leftBullets + '</td>' +
          '<td style="width:50%;vertical-align:top;padding:6px 8px">' + rightBullets + '</td>' +
        '</tr>' +
      '</table>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>1. ПРЕДМЕТ ДОГОВОРА. СРОКИ ОКАЗАНИЯ УСЛУГ</strong></p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 3px">1.1. Исполнитель обязуется, по заданию Заказчика, оказывать услуги по созданию и ведению рекламной кампании на сайте Avito.ru (далее — «Авито»), а Заказчик обязуется оплатить эти услуги в полном объеме.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">1.2. Сроки оказания услуг:</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">1.2.1. Начало оказания услуг: ' + startDate + '</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">1.2.2. Окончание оказания услуг: ' + endDate + '</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 4px">1.2.3. Порядок услуг: ' + daysCreate + ' дней создание рекламы + ' + manageOrderText + '</p>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>2. ПРАВА И ОБЯЗАННОСТИ СТОРОН</strong></p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 3px">2.1. Исполнитель обязуется: 2.1.1. Оказать услуги, предусмотренные п. 1.1 настоящего Договора, лично. 2.1.2. Оказать услуги в сроки, установленные п. 1.2 настоящего Договора. 2.1.3. Исполнять указания Заказчика относительно порядка оказания услуг, при условии, что они не противоречат настоящему Договору и законодательству.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 3px">2.2. Заказчик обязуется: 2.2.1. Предоставить Исполнителю необходимые материалы и документы для оказания услуг не позднее [7] календарных дней с момента заключения Договора. 2.2.2. Оплатить услуги Исполнителя в соответствии с разделом 3 настоящего Договора. 2.2.3. Оказывать содействие Исполнителю в оказании услуг по настоящему Договору.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 3px">2.3. Заказчик вправе отказаться от исполнения настоящего Договора, предупредив об этом Исполнителя в письменной форме не менее, чем за двадцать четыре часа до начала рекламной кампании, при условии оплаты Исполнителю фактически понесенных им расходов.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 4px">2.4. Исполнитель вправе отказаться от исполнения настоящего Договора, предупредив об этом Заказчика не менее чем за двадцать четыре часа до начала рекламной кампании, при условии полного возмещения Заказчику материальных затрат в размере <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong>.</p>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>3. ЦЕНА ДОГОВОРА И ПОРЯДОК РАСЧЕТОВ</strong></p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 3px">3.1. Стоимость услуг по настоящему Договору составляет <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong> и является фиксированной.<br>Указанная стоимость не включает расходы на размещение и продвижение объявлений на платформе Авито, которые при необходимости оплачиваются Заказчиком самостоятельно напрямую платформе Авито.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">3.2. Оплата услуг осуществляется в следующем порядке:</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">3.2.1. Заказчик производит <strong>100% предоплату</strong> в размере <strong>' + costWords + ' (' + costFmt + ') рублей 00 копеек</strong> до начала оказания услуг.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">3.2.2. Дополнительных платежей за услуги Исполнителя по настоящему Договору не предусмотрено.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">3.3. В случае непредоставления Заказчиком необходимых материалов либо неисполнения иных обязательств, препятствующих оказанию услуг, Исполнитель вправе приостановить оказание услуг без возврата уплаченных денежных средств.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 4px">3.4. Возврат денежных средств возможен исключительно в случае существенного и документально подтверждённого невыполнения условий Договора Исполнителем.</p>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>4. ОТВЕТСТВЕННОСТЬ СТОРОН И УСЛОВИЯ ИСПОЛНЕНИЯ</strong></p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.1. Стороны несут ответственность за нарушение условий настоящего договора в соответствии с законодательством Российской Федерации.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.2. Исполнитель несёт ответственность за качество оказанных услуг, при условии их полного выполнения на основании предоставленных Заказчиком данных, а также соблюдения Заказчиком всех требований, предусмотренных стратегией продвижения.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.3. Исполнитель оказывает услуги согласно согласованному объёму работ, включая разработку объявлений, инфографики, настройку автозагрузки и иных инструментов. При условии запуска всех компонентов (отзывы, тариф, бюджет), отклик от аудитории может быть ожидаем в течение 7 (семи) рабочих дней, однако конкретные показатели (заявки, обращения и т.п.) не подлежат гарантийному обеспечению ввиду внешних факторов.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.4. Исполнитель вправе по собственному усмотрению продлить срок ведения рекламной кампании до 30 календарных дней без дополнительной оплаты, если это необходимо для достижения наилучшего результата.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.5. Заказчик вправе требовать уменьшения стоимости услуг только при наличии существенных недостатков в выполненной работе, подтвержденных документально.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.6. Заказчик подтверждает, что неисполнение им части условий (в том числе неиспользование рекламного бюджета, отсутствие отзывов, неполная реализация стратегии) освобождает Исполнителя от ответственности за итоговую результативность.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">4.7. Обстоятельства непреодолимой силы освобождают обе стороны от ответственности. В таком случае сроки исполнения обязательств отодвигаются на период действия соответствующих обстоятельств.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 4px">4.8. Отзывы, касающиеся оказанных услуг, могут быть оставлены не ранее чем через 30 календарных дней с начала работы по договору. В случае несоблюдения данного условия Сторона, допустившая нарушение, обязана возместить другой Стороне понесённые ею репутационные или иные убытки.</p>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>5. ПРОЧИЕ УСЛОВИЯ</strong></p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">5.1. Настоящий Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств по нему.<br>Факт оплаты Заказчиком услуг, указанных в разделе 3 настоящего Договора, в том числе посредством банковского перевода или оплаты по реквизитам Исполнителя, считается полным и безусловным принятием условий настоящего Договора и имеет юридическую силу, равную подписанию документа обеими Сторонами.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">5.2. Во всем, что не урегулировано настоящим Договором, подлежит применению действующее законодательство Российской Федерации.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 1px">5.3. Все изменения и дополнения к настоящему Договору должны быть составлены в письменной форме и подписаны обеими Сторонами.</p>' +
      '<p style="font-size:8.35pt;line-height:1.18;margin:0 0 4px">5.4. Настоящий Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному экземпляру для каждой из Сторон.</p>' +

      '<p style="font-size:8.8pt;line-height:1.2;margin:4px 0 3px">Стороны.</p>' +

      '<p style="font-size:9.2pt;line-height:1.2;margin:4px 0 3px"><strong>6. АДРЕСА И БАНКОВСКИЕ РЕКВИЗИТЫ СТОРОН</strong></p>' +
      '<table style="width:100%;border-collapse:collapse;margin:0 0 8px;font-size:8.35pt;line-height:1.18">' +
        '<tr>' +
          '<td style="width:50%;vertical-align:top;padding:0 8px 0 0">' +
            '<div style="font-weight:700;margin:0 0 4px">Заказчик:</div>' +
            '<div>' + clientName + '</div>' +
            clientLegalRows.replace(/◆\s*/g, '<div>').replace(/<br>/g, '</div>') +
          '</td>' +
          '<td style="width:50%;vertical-align:top;padding:0 0 0 8px">' +
            '<div style="font-weight:700;margin:0 0 4px">Исполнитель:</div>' +
            '<div>' + executor.fullName + '</div>' +
            '<div>Юр. адрес: ' + executor.legalAddress + '</div>' +
            '<div>ИНН ' + executor.inn + '</div>' +
            '<div>ОГРНИП ' + executor.ogrn + '</div>' +
            '<div>Р/С ' + executor.account + '</div>' +
            '<div>Банк ' + executor.bank + '</div>' +
            '<div>ИНН банка ' + executor.bankInn + '</div>' +
            '<div>БИК ' + executor.bik + '</div>' +
            '<div>К/С ' + executor.corrAccount + '</div>' +
            '<div>Адрес банка: ' + executor.bankAddress + '</div>' +
          '</td>' +
        '</tr>' +
      '</table>';
  }

  function getAppendix1Template(data) {
    var executor = getExecutor(data);
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
      '<p style="font-size:10pt;margin-top:12px">Исполнитель: ' + executor.name + '</p>' +
      '<p style="font-size:10pt">Заказчик: ' + clientName + '</p>';
  }

  function getAppendix2Template(data) {
    var executor = getExecutor(data);
    var clientName = data.fio || data.companyName || 'Заказчик';
    return '<h3 style="font-size:12pt;margin:24px 0 12px">ПРИЛОЖЕНИЕ № 2 к Договору возмездного оказания услуг</h3>' +
      '<p style="font-size:10pt;margin-bottom:12px">от ' + (data.startDate || '') + '</p>' +
      '<p style="font-size:11pt;font-weight:700;margin-bottom:12px">Техническое задание и описание оказываемых услуг</p>' +
      '<p style="font-size:10pt;margin-bottom:8px">Исполнитель: ' + executor.name + '</p>' +
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
  function getServiceAppendixTemplate(data) {
    var executor = getExecutor(data);
    var appendixEnabled = String(data.appendixEnabled || '').toLowerCase() === '1';
    if (!appendixEnabled) return '';
    var selected = [];
    var infographicEnabled = String(data.infographicEnabled || '').toLowerCase() === '1';
    var botEnabled = String(data.botEnabled || '').toLowerCase() === '1';
    var scriptsEnabled = String(data.scriptsEnabled || '').toLowerCase() === '1';
    var includePackaging = String(data.packagingEnabled || '').toLowerCase() === '1';
    var includeExtraManage = String(data.extraManageEnabled || '').toLowerCase() === '1';
    var infographicPower = String(data.infographicPower || '').trim();
    var extraManageDays = parseInt(String(data.extraManageDays || '').trim(), 10);
    if (!isFinite(extraManageDays) || extraManageDays < 0) extraManageDays = 0;

    var startDate = shortRuDate(data.startDate);
    var endDate = shortRuDate(data.endDate);
    var soldCount = esc(data.soldCount || '');
    var costNum = normalizeMoneyValue(data.cost);
    var costFmt = String(costNum || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var clientName = esc(data.fio || data.companyName || 'Заказчик');
    var packageName = esc(data.packageName || '');
    function row(icon, name, qty, price) {
      return '<tr>' +
        '<td class="app-icon">' + icon + '</td>' +
        '<td colspan="2" class="app-name">' + name + '</td>' +
        '<td>' + startDate + '</td><td>' + endDate + '</td>' +
        '<td>' + (qty || '') + '</td><td>' + (price || '') + '</td>' +
      '</tr>';
    }
    selected.push(row('📈', 'Создание Excel-файлов с объявлениями<br><span>(фото, тексты, офферы, SEO-анализ, обход блоков)</span>', soldCount, costFmt));
    selected.push(row('📊', 'Постинг объявлений и их продвижение с помощью платных услуг, гибкое изменение рекламы под рынок', soldCount, 'включено'));
    if (infographicEnabled) selected.push(row('🖼', 'Инфографика на все карточки' + (packageName ? ' — тариф «' + packageName + '»' : '') + (infographicPower ? '<br><span>Уровень: ' + esc(infographicPower) + '</span>' : ''), '', '🎁'));
    if (includePackaging) selected.push(row('🎨', 'Дизайн магазина для бизнес-тарифа: баннеры ПК и мобильной версии', '6', '🎁'));
    if (botEnabled) selected.push(row('🤖', 'Автоответ с воронкой в Telegram-бот / канал и бонусный закреп', '1', '🎁'));
    if (includeExtraManage && extraManageDays > 0) selected.push(row('⏱', 'Дополнительное ведение и активность в аккаунте', extraManageDays + ' дн.', '🎁'));
    if (scriptsEnabled) selected.push(row('📘', 'Скрипты продаж, анализ целевой аудитории и ресерч в PDF', '1', '🎁'));
    String(data.extraServices || '').split(/\r?\n/).map(function(v) { return v.trim(); }).filter(Boolean).forEach(function(service) {
      selected.push(row('✦', esc(service.replace(/^🎁\s*/, '')), '', '🎁'));
    });

    return '' +
      '<div class="appendix-doc" style="font-family:Arial,sans-serif;color:#111">' +
        '<div style="text-align:right;font-size:11pt;line-height:1.35;margin:0 0 24px">' +
          '<div>Приложение № 1</div>' +
          '<div>к договору с <strong>' + clientName + '</strong></div>' +
          '<div>оказания услуг по размещению рекламы от <strong>' + esc(data.startDate || '') + '</strong></div>' +
        '</div>' +
        '<h2 style="font-family:Arial,sans-serif;text-align:center;font-size:18pt;margin:0 0 20px">Перечень услуг и сроки реализации</h2>' +
        '<table class="appendix-services-table" style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Arial,sans-serif;font-size:8pt">' +
          '<colgroup><col style="width:8%"><col style="width:13%"><col style="width:27%"><col style="width:12%"><col style="width:12%"><col style="width:10%"><col style="width:18%"></colgroup>' +
          '<thead><tr><th>№ п/п</th><th colspan="2">Наименование услуги</th><th>Начало работ</th><th>Конец работ</th><th>Количество (шт.)</th><th>Стоимость услуги, руб.</th></tr></thead>' +
          '<tbody>' + selected.join('') + '<tr class="app-total-row"><td></td><td colspan="5"></td><td><strong>' + costFmt + '</strong></td></tr></tbody>' +
        '</table>' +
        '<p style="font-size:13pt;font-weight:700;margin:18px 0 14px">Общая стоимость услуг, оказываемых по Договору: <span style="color:#165dff">' + costFmt + '</span> руб.</p>' +
        '<div style="font-size:11pt;font-weight:700;line-height:1.6"><div>Исполнитель: ' + esc(executor.name) + '</div><div>Заказчик: ' + clientName + '</div></div>' +
      '</div>';
  }

  function shortRuDate(value) {
    var parts = String(value || '').split('.');
    if (parts.length === 3) return esc(parts[0] + '.' + parts[1] + '.' + parts[2].slice(-2));
    return esc(value || '');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function generateContractDocuments(data) {
    if (!data) data = {};
    var today = new Date();
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    if (!data.contractDate) data.contractDate = pad(today.getDate()) + '.' + pad(today.getMonth() + 1) + '.' + today.getFullYear();
    var gender = String(data.headerGender || 'm').toLowerCase() === 'f' ? 'f' : 'm';
    var headerImg = gender === 'f' ? 'assets/contract_header_women.png' : 'assets/contract_header_m.png';
    var headerFallbackImg = 'assets/contract_header_m.png';
    try {
      headerImg = new URL(gender === 'f' ? 'assets/contract_header_women.png' : 'assets/contract_header_m.png', window.location.href).href;
      headerFallbackImg = new URL('assets/contract_header_m.png', window.location.href).href;
    } catch (e) {}
    var headerHtml =
      '<div class="contract-doc-header" style="text-align:center;margin:0 auto 4px">' +
        '<img src="' + esc(headerImg) + '" width="621" height="398" alt="" onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src=\'' + esc(headerFallbackImg) + '\';}else{this.style.display=\'none\';}" style="display:block;margin:0 auto;width:16.44cm;height:10.54cm;max-width:100%;object-fit:cover;object-position:center 42%">' +
      '</div>';
    var appendixHtml = getServiceAppendixTemplate(data).replace('<div style="page-break-before:always"></div>', '');
    var body = headerHtml + '<div class="contract-doc-body">' + getContractMainTemplate(data) + '</div>';
    var footerImg = 'assets/contract_footer.png';
    try { footerImg = new URL('assets/contract_footer.png', window.location.href).href; } catch (e) {}
    var footerHtml =
      '<div class="contract-doc-footer" style="text-align:center;margin:4px auto 0">' +
        '<img src="' + esc(footerImg) + '" width="621" height="285" alt="" onerror="this.style.display=\'none\'" style="display:block;margin:0 auto;width:16.44cm;height:7.54cm;max-width:100%;object-fit:contain">' +
      '</div>';
    var contract = '<div class="contract-document">' + body + footerHtml + '</div>';
    var appendix = appendixHtml
      ? '<div class="contract-document contract-appendix-document"><div class="contract-doc-body">' + appendixHtml + '</div>' + footerHtml + '</div>'
      : '';
    return { contract: contract, appendix: appendix };
  }

  function generateContract(data) {
    var docs = generateContractDocuments(data);
    return docs.contract + (docs.appendix || '');
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
  var HTML2CANVAS_CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
  ];
  var JSPDF_CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
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
  function loadScriptFromList(urls, isReady, errorText, cb) {
    if (isReady()) {
      cb(null);
      return;
    }
    var idx = 0;
    var done = false;
    function finish(err) {
      if (done) return;
      done = true;
      cb(err || null);
    }
    function tryNext() {
      if (isReady()) {
        finish(null);
        return;
      }
      if (idx >= urls.length) {
        finish(new Error(errorText));
        return;
      }
      var src = urls[idx++];
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function() {
        if (isReady()) finish(null);
        else tryNext();
      };
      s.onerror = function() { tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  }
  function getPdfRenderDeps(cb) {
    function html2canvasReady() {
      return !!((typeof window !== 'undefined' && window.html2canvas) || (typeof html2canvas !== 'undefined' ? html2canvas : null));
    }
    function jsPdfReady() {
      return !!((typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ||
        (typeof window !== 'undefined' && window.jsPDF) ||
        (typeof jsPDF !== 'undefined' ? jsPDF : null));
    }
    function finish() {
      var html2canvasFn = (typeof window !== 'undefined' && window.html2canvas) || (typeof html2canvas !== 'undefined' ? html2canvas : null);
      var jsPdfCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ||
        (typeof window !== 'undefined' && window.jsPDF) ||
        (typeof jsPDF !== 'undefined' ? jsPDF : null);
      if (typeof html2canvasFn === 'function' && typeof jsPdfCtor === 'function') cb(null, html2canvasFn, jsPdfCtor);
      else cb(new Error('Модуль PDF недоступен'));
    }
    loadScriptFromList(HTML2CANVAS_CDNS, html2canvasReady, 'Не удалось загрузить html2canvas для PDF', function(errCanvas) {
      if (errCanvas) {
        cb(errCanvas);
        return;
      }
      loadScriptFromList(JSPDF_CDNS, jsPdfReady, 'Не удалось загрузить jsPDF для PDF', function(errPdf) {
        if (errPdf) {
          cb(errPdf);
          return;
        }
        finish();
      });
    });
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
      executorKey: 'filipp',
      headerGender: 'm'
    };

    var _contractScreenshots = [];

    function getFormData() {
      var d = {};
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost', 'soldCount', 'extraServices', 'packageName', 'executorKey', 'headerGender', 'appendixEnabled', 'packagingEnabled', 'infographicEnabled', 'infographicPower', 'botEnabled', 'extraManageEnabled', 'extraManageDays', 'scriptsEnabled'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        if (!el) { d[k] = ''; return; }
        if (el.type === 'checkbox') d[k] = el.checked ? '1' : '0';
        else d[k] = (el.value || '').trim();
      });
      if (!d.headerGender) d.headerGender = 'm';
      if (!d.executorKey) d.executorKey = 'filipp';
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
        if (!el || d[k] === undefined) return;
        if (el.type === 'checkbox') el.checked = String(d[k]) === '1' || d[k] === true;
        else el.value = d[k];
      });
      var manualFioEl = document.getElementById('contract-manual-fio');
      var hiddenFioEl = document.getElementById('contract-fio');
      if (manualFioEl && hiddenFioEl) manualFioEl.value = hiddenFioEl.value || '';
    }

    function applyParsed(parsed) {
      var fioEl = document.getElementById('contract-fio');
      var manualFioEl = document.getElementById('contract-manual-fio');
      var fioVal = parsed.fio || parsed.shortName || parsed.fullName || '';
      if (fioEl && fioVal) fioEl.value = fioVal;
      if (manualFioEl && fioVal) manualFioEl.value = fioVal;
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
      '<button type="button" class="contract-toolbar-btn contract-ai-upload-btn" onclick="document.getElementById(\'contract-file-inp\').click()">📄 Загрузить реквизиты</button>' +
      '<input type="file" id="contract-file-inp" accept=".txt,.docx,.pdf" style="display:none">' +
      '<input type="text" id="contract-manual-fio" class="contract-ai-input contract-manual-fio" autocomplete="name" placeholder="ФИО заказчика">' +
      '</div>' +
      '<div class="contract-toolbar-row contract-toolbar-row-secondary" id="contractToolbarSecondary" style="display:none">' +
      '<button type="button" class="btn-gen contract-toolbar-btn" style="width:auto;min-width:0;flex:0 0 auto;display:inline-flex;padding:6px 12px;margin:0;border-radius:8px" onclick="window.__contractGenerate&&window.__contractGenerate()"><span>&#9889;</span> Сгенерировать договор</button>' +
      '<div class="contract-mobile-tools" title="Мобильный зум и точное касание">' +
      '<button type="button" class="contract-mobile-tool-btn" onclick="window.__contractPreviewZoom&&window.__contractPreviewZoom(-0.1)">−</button>' +
      '<button type="button" class="contract-mobile-tool-btn contract-mobile-zoom-label" onclick="window.__contractPreviewZoom&&window.__contractPreviewZoom(0,true)" id="contractPreviewZoomLabel">100%</button>' +
      '<button type="button" class="contract-mobile-tool-btn" onclick="window.__contractPreviewZoom&&window.__contractPreviewZoom(0.1)">+</button>' +
      '<button type="button" class="contract-mobile-tool-btn" onclick="window.__contractToggleTouchLens&&window.__contractToggleTouchLens()" id="contractTouchLensBtn">🎯</button>' +
      '</div>' +
      '<div class="contract-gender-switch" id="contractGenderSwitch" title="Выбор картинки в шапке">' +
      '<button type="button" class="contract-gender-btn on" data-gender="m">👨 M</button>' +
      '<button type="button" class="contract-gender-btn" data-gender="f">👩 Ж</button>' +
      '</div>' +
      '<input type="hidden" id="contract-headerGender" value="m">' +
      '<button type="button" class="contract-toolbar-btn contract-btn-savew" id="contractDownloadLocalBtn" onclick="window.__contractDownloadLocal&&window.__contractDownloadLocal()">⬇ Скачать договор + приложение</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-savew" id="contractSaveWBtn" style="display:none" onclick="window.__contractSaveW&&window.__contractSaveW()">🟦 Сохранить в W</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-pdf" id="contractSavePdfBtn" onclick="window.__contractSavePdf&&window.__contractSavePdf()">📕 Сохранить 2 PDF</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-pdf" id="contractDownloadPdfBtn" style="display:none" onclick="window.__contractDownloadPdf&&window.__contractDownloadPdf()">⬇ Скачать PDF</button>' +
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
      '<input type="hidden" id="contract-packageName">' +
      '<div class="contract-parsed-wrap" id="contractParsedRequisites" style="display:none"></div>' +
      '</div>' +
      '<div class="contract-extra-panel">' +
      '<h4 class="contract-form-title">Дополнительные параметры договора</h4>' +
      '<p class="contract-extra-hint">Стратегия продажи, скриншоты, кол-во объявлений и доп. услуги для приложения</p>' +
      '<div class="contract-form-grid">' +
      '<div class="fg" style="grid-column:1/-1"><label>Исполнитель по договору</label><select id="contract-executorKey"><option value="filipp" selected>ИП Шинков Филипп</option><option value="regina">ИП Константинова Регина</option></select></div>' +
      '<div class="fg" style="grid-column:1/-1"><label>Пакет из сохраненного КП</label><select id="contract-kpPackage"><option value="">Не выбран</option></select></div>' +
      '<div class="fg"><label>Дата начала работ</label><input type="date" id="contract-startDate"></div>' +
      '<div class="fg"><label>Дата окончания работ</label><input type="date" id="contract-endDate"></div>' +
      '<div class="fg"><label>Дней на создание рекламы</label><input type="number" id="contract-daysCreate" placeholder="12" min="1"></div>' +
      '<div class="fg"><label>Дней ведения рекламы</label><input type="number" id="contract-daysManage" placeholder="30" min="1"></div>' +
      '<div class="fg"><label>Стоимость договора, руб.</label><input type="number" id="contract-cost" placeholder="50000" min="0"></div>' +
      '<div class="fg"><label>Кол-во проданных объявлений</label><input type="number" id="contract-soldCount" placeholder="5" min="0"></div>' +
      '</div>' +
      '<div class="contract-appendix-toggle">' +
      '<label class="contract-appendix-main-label"><input type="checkbox" id="contract-appendixEnabled" checked> 📎 Добавить Приложение к договору</label>' +
      '</div>' +
      '<div class="contract-form-grid contract-appendix-grid" style="margin-top:8px">' +
      '<div class="fg contract-appendix-item"><label class="contract-appendix-item-label"><input type="checkbox" id="contract-packagingEnabled" checked> 🎁 Упаковка</label><div class="contract-appendix-sub">MAX + Расширенный тарифы</div></div>' +
      '<div class="fg contract-appendix-item"><label class="contract-appendix-item-label"><input type="checkbox" id="contract-infographicEnabled" checked> 🖼️ Инфографика</label><div class="contract-appendix-row"><span class="contract-appendix-sub">Сила:</span><select id="contract-infographicPower"><option value="1-я картинка">1-я картинка</option><option value="3/10" selected>3/10</option><option value="5/10">5/10</option><option value="10/10">10/10</option></select></div></div>' +
      '<div class="fg contract-appendix-item"><label class="contract-appendix-item-label"><input type="checkbox" id="contract-botEnabled" checked> 🤖 Бот</label><div class="contract-appendix-sub">Воронка + бонус закреп</div></div>' +
      '<div class="fg contract-appendix-item"><label class="contract-appendix-item-label"><input type="checkbox" id="contract-extraManageEnabled" checked> ⏱️ Доп. время ведения</label><div class="contract-appendix-row"><span class="contract-appendix-sub">Дней:</span><input type="number" id="contract-extraManageDays" placeholder="0" min="0" value="0"></div></div>' +
      '<div class="fg contract-appendix-item"><label class="contract-appendix-item-label"><input type="checkbox" id="contract-scriptsEnabled" checked> 📘 Скрипты + анализ ЦА + ресерч</label><div class="contract-appendix-sub">Готовый PDF-блок</div></div>' +
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

    var kpPackageSelect = document.getElementById('contract-kpPackage');
    var savedKpRecords = [];
    function activeClientFolderId() {
      try {
        var ac = typeof getActiveClient === 'function' ? getActiveClient() : null;
        return ac && ac.folderId ? String(ac.folderId) : '';
      } catch (e) {
        return '';
      }
    }
    function packagePrice(pkg) {
      var values = String((pkg && pkg.work) || '').match(/\d[\d\s]*/g) || [];
      return values.length ? normalizeMoneyValue(values[0]) : 0;
    }
    function packageLimit(pkg) {
      var m = String((pkg && pkg.limit) || '').match(/\d[\d\s]*/);
      return m ? normalizeMoneyValue(m[0]) : 0;
    }
    function applySavedKpPackage(pkg) {
      if (!pkg) return;
      var items = Array.isArray(pkg.items) ? pkg.items : [];
      var packageNameEl = document.getElementById('contract-packageName');
      if (packageNameEl) packageNameEl.value = pkg.name || '';
      var joined = items.join('\n').toLowerCase();
      if (costEl) costEl.value = String(packagePrice(pkg) || costEl.value || '');
      var soldEl = document.getElementById('contract-soldCount');
      if (soldEl) soldEl.value = String(packageLimit(pkg) || '');
      if (packagingEnabledEl) packagingEnabledEl.checked = /(дизайн магазина|упаковк|баннер)/i.test(joined);
      if (infographicEnabledEl) infographicEnabledEl.checked = /инфограф/i.test(joined);
      if (botEnabledEl) botEnabledEl.checked = /(бот|автоответ|воронк)/i.test(joined);
      if (scriptsEnabledEl) scriptsEnabledEl.checked = /(скрипт|анализ.*ца|ресерч)/i.test(joined);
      var extraDays = joined.match(/\+(\d+)\s*дн/);
      if (extraManageEnabledEl) extraManageEnabledEl.checked = !!extraDays;
      if (extraManageDaysEl) extraManageDaysEl.value = extraDays ? extraDays[1] : '0';
      var extraEl = document.getElementById('contract-extraServices');
      if (extraEl) extraEl.value = items.filter(function(line) {
        var text = String(line || '');
        return /^\s*🎁/.test(text) && !/(инфограф|дизайн магазина|автоответ|бот|дн(?:ей|я) ведения|скрипт|анализ.*ца|ресерч)/i.test(text);
      }).join('\n');
      syncAppendixOptionsState();
    }
    function loadSavedKpPackages() {
      if (!kpPackageSelect) return;
      var folderId = activeClientFolderId();
      try {
        savedKpRecords = typeof window.__getSavedKpPackagesForClient === 'function'
          ? window.__getSavedKpPackagesForClient(folderId)
          : [];
      } catch (e) {
        savedKpRecords = [];
      }
      var options = ['<option value="">Не выбран</option>'];
      savedKpRecords.forEach(function(record, recordIndex) {
        (record.packages || []).forEach(function(pkg, packageIndex) {
          var label = (pkg.name || ('Пакет ' + (packageIndex + 1))) + ' · ' + (pkg.limit || '') + ' · ' + (pkg.work || '');
          options.push('<option value="' + recordIndex + ':' + packageIndex + '">' + escHtml(label) + '</option>');
        });
      });
      kpPackageSelect.innerHTML = options.join('');
    }
    if (kpPackageSelect) {
      kpPackageSelect.addEventListener('change', function() {
        var parts = String(kpPackageSelect.value || '').split(':');
        if (parts.length !== 2) return;
        var record = savedKpRecords[parseInt(parts[0], 10)];
        var pkg = record && record.packages ? record.packages[parseInt(parts[1], 10)] : null;
        applySavedKpPackage(pkg);
      });
    }
    loadSavedKpPackages();

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
    var appendixEnabledEl = document.getElementById('contract-appendixEnabled');
    var packagingEnabledEl = document.getElementById('contract-packagingEnabled');
    var infographicEnabledEl = document.getElementById('contract-infographicEnabled');
    var infographicPowerEl = document.getElementById('contract-infographicPower');
    var botEnabledEl = document.getElementById('contract-botEnabled');
    var extraManageEnabledEl = document.getElementById('contract-extraManageEnabled');
    var extraManageDaysEl = document.getElementById('contract-extraManageDays');
    var scriptsEnabledEl = document.getElementById('contract-scriptsEnabled');
    function setDisabled(el, disabled) {
      if (!el) return;
      el.disabled = !!disabled;
      el.style.opacity = disabled ? '0.55' : '';
      el.style.pointerEvents = disabled ? 'none' : '';
    }
    function syncAppendixOptionsState() {
      var on = appendixEnabledEl ? appendixEnabledEl.checked : true;
      setDisabled(packagingEnabledEl, !on);
      setDisabled(infographicEnabledEl, !on);
      setDisabled(botEnabledEl, !on);
      setDisabled(extraManageEnabledEl, !on);
      setDisabled(scriptsEnabledEl, !on);
      var infoOn = on && infographicEnabledEl && infographicEnabledEl.checked;
      setDisabled(infographicPowerEl, !infoOn);
      var extraOn = on && extraManageEnabledEl && extraManageEnabledEl.checked;
      setDisabled(extraManageDaysEl, !extraOn);
    }
    [appendixEnabledEl, infographicEnabledEl, extraManageEnabledEl].forEach(function(el) {
      if (el) el.addEventListener('change', syncAppendixOptionsState);
    });
    syncAppendixOptionsState();
    var secondaryToolbar = document.getElementById('contractToolbarSecondary');
    var fioEl = document.getElementById('contract-fio');
    var manualFioEl = document.getElementById('contract-manual-fio');
    function setSecondaryVisible(v) {
      if (secondaryToolbar) secondaryToolbar.style.display = v ? 'flex' : 'none';
    }
    function refreshClientCaption() {
      var fio = fioEl ? String(fioEl.value || '').trim() : '';
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
      if (manualFioEl) manualFioEl.value = '';
      setHeaderGender('m');
      if (daysCreateEl) daysCreateEl.value = '12';
      if (daysManageEl) daysManageEl.value = '30';
      if (costEl) costEl.value = '50000';
      var executorKeyEl = document.getElementById('contract-executorKey');
      if (executorKeyEl) executorKeyEl.value = 'filipp';
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

    var fileInp = document.getElementById('contract-file-inp');
    function clearClientRequisitesForManualName() {
      ['inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        if (el) el.value = '';
      });
      var parsedBox = document.getElementById('contractParsedRequisites');
      if (parsedBox) {
        parsedBox.innerHTML = '';
        parsedBox.style.display = 'none';
      }
    }
    if (manualFioEl) {
      manualFioEl.addEventListener('input', function() {
        if (fioEl) fioEl.value = manualFioEl.value.trim();
        clearClientRequisitesForManualName();
        refreshClientCaption();
        if (!manualFioEl.value.trim()) setSecondaryVisible(false);
      });
    }

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
    function handleFile(file) {
      if (!file) return;
      var ext = (file.name || '').toLowerCase();
      if (!ext.endsWith('.txt') && !ext.endsWith('.docx') && !ext.endsWith('.pdf')) {
        alert('Поддерживаются файлы .txt, .docx, .pdf');
        return;
      }
      readFileAsText(file, function(err, text) {
        if (err) {
          alert(err.message || 'Ошибка чтения файла');
          return;
        }
        processRequisitesText(text, 'файла');
      });
    }
    if (fileInp) fileInp.addEventListener('change', function() {
      var f = fileInp.files && fileInp.files[0];
      handleFile(f);
      fileInp.value = '';
    });

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

    var livePreviewTimer = null;
    function scheduleLivePreview() {
      clearTimeout(livePreviewTimer);
      livePreviewTimer = setTimeout(function() {
        if (typeof window.__contractGenerate === 'function') window.__contractGenerate();
      }, 180);
    }
    container.addEventListener('input', scheduleLivePreview);
    container.addEventListener('change', scheduleLivePreview);

    return { getFormData: getFormData, setFormData: setFormData };
  }

  function renderContractPreview(container, docs) {
    docs = docs || {};
    var pages = [];
    if (docs.contract) pages.push('<div class="contract-preview-page-label">Договор</div><div class="contract-preview-page"><div class="contract-preview-inner">' + docs.contract + '</div></div>');
    if (docs.appendix) pages.push('<div class="contract-preview-page-label">Приложение</div><div class="contract-preview-page"><div class="contract-preview-inner">' + docs.appendix + '</div></div>');
    if (!pages.length) pages.push('<div class="contract-preview-placeholder" style="padding:40px;text-align:center;color:var(--muted);font-size:13px">Заполните реквизиты и параметры, затем нажмите «Сгенерировать договор»</div>');
    container.innerHTML = '<div class="contract-preview-wrap">' + pages.join('') + '</div>';
  }

  function renderContractGenerator(mainContentEl) {
    var lastGeneratedHtml = '';
    var lastGeneratedDocs = null;
    var lastGeneratedData = null;
    var lastDrivePdfDoc = null;

    function folderIdFromLink(link) {
      var m = String(link || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
      return m ? m[1] : '';
    }
    function getTargetFolderCtx() {
      var selected = (typeof getSelectedAnalyticsRecentProject === 'function') ? getSelectedAnalyticsRecentProject() : null;
      if (selected) {
        var selectedFid = String(selected.folderId || folderIdFromLink(selected.folderLink) || '').trim();
        return {
          folderId: selectedFid,
          name: selected.company || selected.title || selected.projectTitle || 'Клиент',
          source: 'selected'
        };
      }
      var ac = null;
      if (typeof getActiveClient === 'function') ac = getActiveClient();
      if (!ac && typeof window.__goalsGetActiveClient === 'function') ac = window.__goalsGetActiveClient();
      if (ac) {
        var fid = String(ac.folderId || folderIdFromLink(ac.folderLink) || '').trim();
        return { folderId: fid, name: ac.company || ac.contact_name || 'Клиент', source: 'active' };
      }
      return null;
    }
    function updateSaveButtonState() {
      var btn = document.getElementById('contractSaveWBtn');
      var st = document.getElementById('contractSaveStatus');
      var pdfDownloadBtn = document.getElementById('contractDownloadPdfBtn');
      if (!btn) return;
      var ctx = getTargetFolderCtx();
      if (pdfDownloadBtn && !lastDrivePdfDoc) pdfDownloadBtn.style.display = 'none';
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
    function triggerBlobDownload(blob, filename) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = String(filename || 'document.pdf');
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        try { URL.revokeObjectURL(a.href); } catch (e) {}
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 0);
    }
    function setPdfDownloadReady(docMeta) {
      lastDrivePdfDoc = docMeta || null;
      var btn = document.getElementById('contractDownloadPdfBtn');
      if (!btn) return;
      btn.style.display = lastDrivePdfDoc ? 'inline-flex' : 'none';
      btn.disabled = false;
      if (lastDrivePdfDoc && lastDrivePdfDoc.downloadUrl) {
        btn.title = 'Скачать PDF из Google Docs';
      } else {
        btn.title = '';
      }
    }
    function wrapContractHtml(innerHtml) {
      return '<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#fff;color:#111;font-family:Golos Text,Arial,sans-serif">' +
        String(innerHtml || '') +
        '</body></html>';
    }
    function splitBase64Lines(s, lineLen) {
      var src = String(s || '');
      var out = [];
      var n = Math.max(32, lineLen || 76);
      for (var i = 0; i < src.length; i += n) out.push(src.slice(i, i + n));
      return out.join('\r\n');
    }
    function toBase64Utf8(s) {
      try {
        return btoa(unescape(encodeURIComponent(String(s || ''))));
      } catch (e) {
        return btoa(String(s || ''));
      }
    }
    function buildWordMhtml(htmlStr) {
      var boundary = '----=_NextPart_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
      var imageParts = [];
      var idx = 0;
      var html = String(htmlStr || '').replace(/(<img\b[^>]*\bsrc=["'])(data:image\/[^"']+)(["'][^>]*>)/gi, function(full, a, src, c) {
        var m = String(src || '').match(/^data:([^;]+);base64,(.+)$/i);
        if (!m) return full;
        var mime = String(m[1] || 'image/png').toLowerCase();
        var ext = (mime.split('/')[1] || 'png').replace(/[^\w]/g, '') || 'png';
        var contentLocation = 'file:///C:/contract/image_' + (++idx) + '.' + ext;
        imageParts.push({
          mime: mime,
          base64: m[2],
          location: contentLocation
        });
        return a + contentLocation + c;
      });
      var htmlDoc = wrapContractHtml(html);
      var lines = [
        'MIME-Version: 1.0',
        'Content-Type: multipart/related; boundary="' + boundary + '"; type="text/html"',
        '',
        '--' + boundary,
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        'Content-Location: file:///C:/contract/document.html',
        '',
        splitBase64Lines(toBase64Utf8(htmlDoc), 76),
        ''
      ];
      imageParts.forEach(function(p) {
        lines.push('--' + boundary);
        lines.push('Content-Type: ' + p.mime);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('Content-Location: ' + p.location);
        lines.push('');
        lines.push(splitBase64Lines(p.base64, 76));
        lines.push('');
      });
      lines.push('--' + boundary + '--');
      return lines.join('\r\n');
    }
    function waitForImagesLoaded(rootEl) {
      var imgs = Array.prototype.slice.call((rootEl || document).querySelectorAll('img'));
      if (!imgs.length) return Promise.resolve();
      return Promise.all(imgs.map(function(img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function(resolve) {
          img.onload = function() { resolve(); };
          img.onerror = function() { resolve(); };
        });
      }));
    }
    function blobToDataUrl(blob) {
      return new Promise(function(resolve, reject) {
        try {
          var r = new FileReader();
          r.onload = function() { resolve(String(r.result || '')); };
          r.onerror = function() { reject(new Error('Не удалось прочитать изображение')); };
          r.readAsDataURL(blob);
        } catch (e) {
          reject(e);
        }
      });
    }
    async function inlineExportImages(htmlStr) {
      var html = String(htmlStr || '');
      var srcMap = {};
      var jobs = [];
      var imgRx = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi;
      html.replace(imgRx, function(_, _a, src) {
        var key = String(src || '').trim();
        if (!key || /^data:|^blob:/i.test(key) || srcMap[key]) return _;
        jobs.push((async function() {
          try {
            var abs = new URL(key, window.location.href).href;
            var resp = await fetch(abs, { cache: 'no-store' });
            if (!resp || !resp.ok) return;
            var blob = await resp.blob();
            srcMap[key] = await blobToDataUrl(blob);
          } catch (e) {}
        })());
        return _;
      });
      if (jobs.length) await Promise.all(jobs);
      if (!Object.keys(srcMap).length) return html;
      return html.replace(imgRx, function(full, a, src, c) {
        var key = String(src || '').trim();
        return srcMap[key] ? (a + srcMap[key] + c) : full;
      });
    }

    function htmlToPdfBlob(htmlStr, fileName) {
      return new Promise(function(resolve, reject) {
        getPdfRenderDeps(function(err, html2canvasFn, jsPdfCtor) {
          if (err || typeof html2canvasFn !== 'function' || typeof jsPdfCtor !== 'function') {
            reject(err || new Error('Модуль PDF недоступен'));
            return;
          }
          var host = document.createElement('div');
          function cleanup() {
            if (host.parentNode) host.parentNode.removeChild(host);
          }
          host.className = 'contract-pdf-export-host';
          host.style.position = 'fixed';
          host.style.left = '0';
          host.style.top = '0';
          host.style.width = '210mm';
          host.style.minWidth = '210mm';
          host.style.maxWidth = '210mm';
          host.style.background = '#fff';
          host.style.overflow = 'visible';
          host.style.transform = 'none';
          host.style.zoom = '1';
          host.style.pointerEvents = 'none';
          host.style.zIndex = '-1';
          host.innerHTML =
            '<style>' +
            '.contract-pdf-export-host,.contract-pdf-export-host *{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}' +
            '.contract-pdf-export-host{contain:layout style!important}' +
            '.contract-pdf-export-host .contract-document{width:210mm!important;min-width:210mm!important;max-width:210mm!important;min-height:297mm!important;margin:0!important;box-sizing:border-box!important;transform:none!important;zoom:1!important;background:#fff!important;overflow:visible!important}' +
            '.contract-pdf-export-host .contract-doc-body{min-width:0!important}' +
            '.contract-pdf-export-host .contract-doc-header img,.contract-pdf-export-host .contract-doc-footer img{max-width:100%!important}' +
            '.contract-pdf-export-host table{break-inside:avoid!important;page-break-inside:avoid!important}' +
            '</style>' +
            String(htmlStr || '');
          document.body.appendChild(host);
          var source = host.querySelector('.contract-document') || host;
          source.style.width = '210mm';
          source.style.minWidth = '210mm';
          source.style.maxWidth = 'none';
          source.style.minHeight = '297mm';
          source.style.boxSizing = 'border-box';
          waitForImagesLoaded(host).then(function() {
            var rect = source.getBoundingClientRect();
            var sourceWidth = Math.ceil(source.scrollWidth || rect.width || 794);
            var sourceHeight = Math.ceil(source.scrollHeight || rect.height || 1123);
            html2canvasFn(source, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
              width: sourceWidth,
              height: sourceHeight,
              windowWidth: sourceWidth,
              windowHeight: sourceHeight,
              scrollX: 0,
              scrollY: 0,
              x: 0,
              y: 0
            }).then(function(canvas) {
              var pdf = new jsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
              var pageWmm = 210;
              var pageHmm = 297;
              var pageHpx = Math.floor(canvas.width * pageHmm / pageWmm);
              var y = 0;
              var page = 0;
              while (y < canvas.height) {
                var sliceH = Math.min(pageHpx, canvas.height - y);
                var pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = sliceH;
                var ctx = pageCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                if (page > 0) pdf.addPage();
                pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, pageWmm, sliceH * pageWmm / canvas.width);
                y += sliceH;
                page++;
              }
              cleanup();
              resolve(pdf.output('blob'));
            }).catch(function(error) {
              cleanup();
              reject(error);
            });
          }).catch(function(error) {
            cleanup();
            reject(error);
          });
        });
      });
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
    if (previewArea) renderContractPreview(previewArea, null);
    var contractPreviewScale = 1;
    try {
      contractPreviewScale = Math.max(0.55, Math.min(1.35, parseFloat(localStorage.getItem('avitolog_contract_preview_scale') || '1') || 1));
    } catch (e) {}
    var contractTouchLensEnabled = false;
    var contractTouchLensEl = null;

    function applyContractPreviewScale() {
      var wrapPreview = previewArea && previewArea.querySelector('.contract-preview-wrap');
      var label = document.getElementById('contractPreviewZoomLabel');
      if (label) label.textContent = Math.round(contractPreviewScale * 100) + '%';
      if (!wrapPreview) return;
      var page = wrapPreview.querySelector('.contract-preview-page');
      wrapPreview.style.zoom = '1';
      wrapPreview.style.transform = 'none';
      var pageWidth = page ? page.offsetWidth : 0;
      var availableWidth = previewArea ? Math.max(240, previewArea.clientWidth - 8) : pageWidth;
      var fitScale = pageWidth > 0 ? Math.min(1, availableWidth / (pageWidth + 36)) : 1;
      var effectiveScale = Math.max(0.45, Math.min(1.35, fitScale * contractPreviewScale));
      wrapPreview.style.zoom = String(effectiveScale);
      wrapPreview.style.transformOrigin = 'top left';
      wrapPreview.classList.toggle('contract-preview-zoomed', effectiveScale !== 1);
      if (previewArea) previewArea.scrollLeft = 0;
    }

    window.__contractPreviewZoom = function(delta, reset) {
      contractPreviewScale = reset ? 1 : Math.max(0.55, Math.min(1.35, Math.round((contractPreviewScale + Number(delta || 0)) * 100) / 100));
      try { localStorage.setItem('avitolog_contract_preview_scale', String(contractPreviewScale)); } catch (e) {}
      applyContractPreviewScale();
    };

    function ensureContractTouchLens() {
      if (contractTouchLensEl) return contractTouchLensEl;
      contractTouchLensEl = document.createElement('div');
      contractTouchLensEl.className = 'contract-touch-lens';
      contractTouchLensEl.innerHTML = '<div class="contract-touch-lens-cross">+</div><div class="contract-touch-lens-text">Точное касание</div>';
      document.body.appendChild(contractTouchLensEl);
      return contractTouchLensEl;
    }
    function describeContractTouchTarget(el) {
      if (!el) return 'Пустая зона';
      var hit = el.closest && el.closest('button,input,select,textarea,label,.contract-appendix-item,.contract-gender-switch');
      if (!hit) return 'Прокрутка / предпросмотр';
      if (hit.tagName === 'INPUT' || hit.tagName === 'TEXTAREA') return hit.value || hit.placeholder || 'Поле ввода';
      if (hit.tagName === 'SELECT') return (hit.options && hit.options[hit.selectedIndex] ? hit.options[hit.selectedIndex].text : '') || 'Список';
      return String(hit.textContent || hit.getAttribute('title') || 'Кнопка').replace(/\s+/g, ' ').trim().slice(0, 70);
    }
    function moveContractTouchLens(ev) {
      if (!contractTouchLensEnabled || !ev) return;
      var lens = ensureContractTouchLens();
      var x = ev.clientX || 0;
      var y = ev.clientY || 0;
      lens.style.left = Math.max(10, Math.min(window.innerWidth - 156, x - 74)) + 'px';
      lens.style.top = Math.max(10, y - 134) + 'px';
      var label = lens.querySelector('.contract-touch-lens-text');
      if (label) label.textContent = describeContractTouchTarget(document.elementFromPoint(x, y));
      lens.classList.add('on');
    }
    function hideContractTouchLensSoon() {
      if (!contractTouchLensEl) return;
      setTimeout(function() {
        if (contractTouchLensEl) contractTouchLensEl.classList.remove('on');
      }, 420);
    }
    window.__contractToggleTouchLens = function() {
      contractTouchLensEnabled = !contractTouchLensEnabled;
      var btn = document.getElementById('contractTouchLensBtn');
      if (btn) btn.classList.toggle('on', contractTouchLensEnabled);
      if (!contractTouchLensEnabled && contractTouchLensEl) contractTouchLensEl.classList.remove('on');
    };
    if (wrap && !wrap.__contractTouchLensBound) {
      wrap.__contractTouchLensBound = true;
      wrap.addEventListener('pointerdown', function(ev) {
        if (!contractTouchLensEnabled) return;
        if (ev.target && ev.target.closest && ev.target.closest('.contract-mobile-tools')) return;
        moveContractTouchLens(ev);
      }, { passive: true });
      wrap.addEventListener('pointermove', function(ev) {
        if (!contractTouchLensEnabled) return;
        moveContractTouchLens(ev);
      }, { passive: true });
      wrap.addEventListener('pointerup', hideContractTouchLensSoon, { passive: true });
      wrap.addEventListener('pointercancel', hideContractTouchLensSoon, { passive: true });
    }
    applyContractPreviewScale();

    renderContractForm(formArea, function(data) {
      var docs = generateContractDocuments(data);
      lastGeneratedDocs = docs;
      lastGeneratedHtml = docs.contract + (docs.appendix || '');
      lastGeneratedData = data || null;
      setPdfDownloadReady(null);
      renderContractPreview(previewArea, docs);
      applyContractPreviewScale();
      updateSaveButtonState();
    }, function() {
      lastGeneratedHtml = '';
      lastGeneratedDocs = null;
      lastGeneratedData = null;
      setPdfDownloadReady(null);
      if (previewArea) {
        renderContractPreview(previewArea, null);
        applyContractPreviewScale();
      }
      updateSaveButtonState();
    });

    if (typeof window.__contractGenerate === 'function') window.__contractGenerate();

    window.__contractDownloadLocal = async function() {
      var st = document.getElementById('contractSaveStatus');
      var btn = document.getElementById('contractDownloadLocalBtn');
      if (!lastGeneratedHtml && typeof window.__contractGenerate === 'function') window.__contractGenerate();
      if (!lastGeneratedHtml) {
        if (st) st.textContent = 'Сначала сгенерируйте договор';
        return;
      }
      var oldText = btn ? btn.textContent : '';
      try {
        if (btn) { btn.disabled = true; btn.textContent = 'Готовлю файл...'; }
        var who = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || 'Клиент';
        var safeWho = String(who).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Клиент';
        var hasAppendix = !!(lastGeneratedDocs && lastGeneratedDocs.appendix);
        var fileName = (hasAppendix ? 'Договор и приложение - ' : 'Договор - ') + safeWho + '.doc';
        var htmlForExport = await inlineExportImages(lastGeneratedHtml);
        var mhtml = buildWordMhtml(htmlForExport);
        triggerBlobDownload(new Blob([mhtml], { type: 'application/msword;charset=utf-8' }), fileName);
        if (st) st.textContent = '✓ Скачан файл: ' + fileName;
      } catch (error) {
        if (st) st.textContent = 'Ошибка скачивания: ' + String((error && error.message) || error);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = oldText || '⬇ Скачать договор + приложение'; }
      }
    };

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
        var mhtml = buildWordMhtml(htmlStr);
        var blob = new Blob([mhtml], { type: 'application/msword;charset=utf-8' });
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
        var who = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || (ctx && ctx.name) || 'Клиент';
        if (typeof window.resolveWritableDriveFolder === 'function') {
          var resolvedFolderId = await window.resolveWritableDriveFolder(ctx && ctx.folderId, who);
          if (resolvedFolderId) ctx = { folderId: resolvedFolderId, name: who, source: (ctx && ctx.source) || 'personal' };
        }
        var docName = '📜 Договор — ' + String(who);
        var htmlForExport = await inlineExportImages(lastGeneratedHtml);
        var canDrive = !!(ctx && ctx.folderId && typeof driveCreateGoogleDoc === 'function' && typeof getDriveToken === 'function');
        if (canDrive) {
          if (st) st.textContent = 'Сохраняю в Google Docs...';
          await getDriveToken();
          var res = await driveCreateGoogleDoc(docName, wrapContractHtml(htmlForExport), ctx.folderId);
          if (st) {
            var link = res && res.webViewLink ? String(res.webViewLink) : '';
            st.innerHTML = link
              ? '✓ Сохранено в Drive · <a href="' + link + '" target="_blank" rel="noopener" style="color:#7cf5ff;text-decoration:underline">Открыть</a>'
              : '✓ Сохранено в папку';
          }
        } else {
          downloadDocLocal(docName, htmlForExport);
          if (st) st.textContent = '✓ Скачан .doc файл';
        }
      } catch (e) {
        try {
          var who2 = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || 'Клиент';
          var htmlForExportFallback = await inlineExportImages(lastGeneratedHtml);
          downloadDocLocal('📜 Договор — ' + String(who2), htmlForExportFallback);
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
      var btn = document.getElementById('contractSavePdfBtn');
      setPdfDownloadReady(null);
      if (!lastGeneratedHtml) {
        if (typeof window.__contractGenerate === 'function') window.__contractGenerate();
      }
      if (!lastGeneratedHtml) {
        if (st) st.textContent = 'Сначала сгенерируйте договор';
        return;
      }
      var ctx = getTargetFolderCtx();
      var canDrive = !!(typeof driveUploadBlob === 'function' && typeof getDriveToken === 'function');
      if (!canDrive) {
        if (st) st.textContent = 'Подключите Google Drive и повторите.';
        return;
      }
      try {
        if (btn) btn.disabled = true;
        if (st) st.textContent = 'Сохраняю в Google Drive...';
        var who = (lastGeneratedData && (lastGeneratedData.fio || lastGeneratedData.companyName)) || (ctx && ctx.name) || 'Клиент';
        if (typeof window.resolveWritableDriveFolder === 'function') {
          var resolvedPdfFolderId = await window.resolveWritableDriveFolder(ctx && ctx.folderId, who);
          if (resolvedPdfFolderId) ctx = { folderId: resolvedPdfFolderId, name: who, source: (ctx && ctx.source) || 'personal' };
        }
        canDrive = !!(ctx && ctx.folderId && typeof driveUploadBlob === 'function' && typeof getDriveToken === 'function');
        if (!canDrive) throw new Error('Не удалось выбрать доступную папку Google Drive.');
        await getDriveToken();
        var safeWho = String(who).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Клиент';
        var contractName = 'Договор - ' + safeWho + '.pdf';
        var appendixName = 'Приложение - ' + safeWho + '.pdf';
        var contractHtml = await inlineExportImages(lastGeneratedDocs && lastGeneratedDocs.contract ? lastGeneratedDocs.contract : lastGeneratedHtml);
        var contractBlob = await htmlToPdfBlob(contractHtml, contractName);
        var contractResult = await driveUploadBlob(contractName, contractBlob, 'application/pdf', ctx.folderId);
        var appendixResult = null;
        if (lastGeneratedDocs && lastGeneratedDocs.appendix) {
          var appendixHtml = await inlineExportImages(lastGeneratedDocs.appendix);
          var appendixBlob = await htmlToPdfBlob(appendixHtml, appendixName);
          appendixResult = await driveUploadBlob(appendixName, appendixBlob, 'application/pdf', ctx.folderId);
        }
        setPdfDownloadReady(null);
        if (st) {
          var contractLink = contractResult && contractResult.webViewLink ? String(contractResult.webViewLink) : '';
          var appendixLink = appendixResult && appendixResult.webViewLink ? String(appendixResult.webViewLink) : '';
          st.innerHTML = '✓ PDF сохранены в папку клиента' +
            (contractLink ? ' · <a href="' + contractLink + '" target="_blank" rel="noopener" style="color:#7cf5ff;text-decoration:underline">Договор</a>' : '') +
            (appendixLink ? ' · <a href="' + appendixLink + '" target="_blank" rel="noopener" style="color:#7cf5ff;text-decoration:underline">Приложение</a>' : '');
        }
      } catch (e) {
        setPdfDownloadReady(null);
        if (st) st.textContent = 'Ошибка сохранения в Drive: ' + String((e && e.message) || e);
      } finally {
        if (btn) btn.disabled = false;
      }
    };
    window.__contractDownloadPdf = async function() {
      var st = document.getElementById('contractSaveStatus');
      var btn = document.getElementById('contractDownloadPdfBtn');
      if (!lastDrivePdfDoc || !lastDrivePdfDoc.id) {
        if (st) st.textContent = 'Сначала сохраните PDF в Drive.';
        return;
      }
      try {
        if (btn) btn.disabled = true;
        if (st) st.textContent = 'Открываю скачивание PDF...';
        var directUrl = String(lastDrivePdfDoc.downloadUrl || '');
        if (directUrl) {
          window.open(directUrl, '_blank', 'noopener');
          if (st) st.textContent = '✓ Скачивание PDF запущено';
          return;
        }
        var token = await getDriveToken();
        var exportUrl = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(lastDrivePdfDoc.id) + '/export?mimeType=application/pdf';
        var resp = await fetch(exportUrl, { headers: { Authorization: 'Bearer ' + token } });
        if (!resp.ok) throw new Error('Drive export HTTP ' + resp.status);
        triggerBlobDownload(await resp.blob(), (lastDrivePdfDoc.name || 'Договор') + '.pdf');
        if (st) st.textContent = '✓ PDF скачан';
      } catch (e) {
        if (st) st.textContent = 'Ошибка скачивания PDF: ' + String((e && e.message) || e);
      } finally {
        if (btn) btn.disabled = false;
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
