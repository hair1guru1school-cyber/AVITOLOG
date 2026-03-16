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

  // Шаблоны договора (на основе документов пользователя)
  function getContractMainTemplate(data) {
    var isCompany = !!(data.inn && String(data.inn).replace(/\s/g, '').length);
    var clientLabel = isCompany ? (data.companyName || data.fio || 'Заказчик') : (data.fio || 'Заказчик');
    var clientDetails = isCompany
      ? 'ИНН ' + (data.inn || '') + (data.ogrn ? ', ОГРН/ОГРНИП ' + data.ogrn : '') + ', р/с ' + (data.account || '') + ', ' + (data.bank || '') + (data.bik ? ', БИК ' + data.bik : '') + (data.corrAccount ? ', корсчёт ' + data.corrAccount : '')
      : (data.fio || '') + (data.passport ? ', паспорт ' + data.passport : '');
    var costFmt = String(data.cost || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    var startDate = data.startDate || '—';
    var endDate = data.endDate || '—';
    var daysCreate = data.daysCreate || '—';
    var daysManage = data.daysManage || '—';

    return '<h2 style="text-align:center;font-size:16pt;margin:24px 0 16px">Договор возмездного оказания услуг</h2>' +
      '<p style="text-align:center;font-size:11pt;color:#333;margin-bottom:20px">от ' + (data.contractDate || startDate) + '</p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-bottom:12px"><strong>Стороны:</strong></p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-bottom:8px;margin-left:20px"><strong>Исполнитель:</strong> ' + EXECUTOR.name + ', ИНН ' + EXECUTOR.inn + ', ОГРН ' + EXECUTOR.ogrn + ', РС ' + EXECUTOR.account + ', ' + EXECUTOR.bank + ', ' + EXECUTOR.phone + '</p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-bottom:16px;margin-left:20px"><strong>Заказчик:</strong> ' + clientLabel + ' — ' + clientDetails + '</p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-bottom:12px"><strong>Основные условия:</strong></p>' +
      '<ol style="font-size:11pt;line-height:1.7;margin:0 0 16px 20px;padding:0">' +
      '<li style="margin-bottom:8px"><strong>Предмет договора:</strong> услуги по созданию, размещению и ведению рекламной кампании на Avito.ru. Детали — в Приложении № 1 и № 2.</li>' +
      '<li style="margin-bottom:8px"><strong>Сроки:</strong> начало ' + startDate + ', окончание ' + endDate + '. ' + daysCreate + ' дней на создание рекламы + ' + daysManage + ' дней ведения аккаунта.</li>' +
      '<li style="margin-bottom:8px"><strong>Оплата:</strong> ' + costFmt + ' руб. (фиксированная стоимость), 100 % предоплата.</li>' +
      '<li style="margin-bottom:8px"><strong>Особенности:</strong> расходы на размещение и продвижение на Avito оплачиваются заказчиком отдельно.</li>' +
      '</ol>' +
      '<p style="font-size:11pt;line-height:1.6;margin-top:20px">Исполнитель: _____________________ / ИП Шинков Ф.А. /</p>' +
      '<p style="font-size:11pt;line-height:1.6;margin-top:8px">Заказчик: _____________________ / ' + (data.fio || clientLabel) + ' /</p>';
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
    var headerImg = 'assets/contract_header.png';
    try {
      headerImg = new URL('assets/contract_header.png', window.location.href).href;
    } catch (e) {}
    var headerHtml = '<div class="contract-doc-header"><img src="' + esc(headerImg) + '" alt="" onerror="this.style.display=\'none\'" style="max-width:100%;height:auto"></div>';
    var body = headerHtml + '<div class="contract-doc-body">' +
      getContractMainTemplate(data) +
      '<div style="page-break-before:always"></div>' +
      getAppendix1Template(data) +
      '<div style="page-break-before:always"></div>' +
      getAppendix2Template(data) +
      '</div>';
    var sigImg = 'assets/contract_sign.png';
    try { sigImg = new URL('assets/contract_sign.png', window.location.href).href; } catch (e) {}
    var sigHtml = '<div class="contract-doc-sign"><img src="' + esc(sigImg) + '" alt="" onerror="this.style.display=\'none\'" style="max-width:200px;height:auto;opacity:0.9"></div>';
    return '<div class="contract-document">' + body + sigHtml + '</div>';
  }

  function detectClientType(data) {
    var inn = (data.inn || '').replace(/\s/g, '');
    return inn.length > 0 ? 'company' : 'person';
  }

  function parseRequisitesFromText(text) {
    var t = String(text || '');
    var out = {};
    var pairs = [];
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

    function setIfEmpty(field, value) {
      if (!value) return;
      if (!out[field]) out[field] = String(value).trim();
    }

    pairs.forEach(function(p) {
      var k = p.key.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
      var v = p.value.trim();
      if (!v) return;
      if (k.indexOf('полное наименование') >= 0) setIfEmpty('fullName', v);
      else if (k.indexOf('сокращенное наименование') >= 0 || k.indexOf('сокращённое наименование') >= 0) setIfEmpty('shortName', v);
      else if (k.indexOf('юридический адрес') >= 0) setIfEmpty('legalAddress', v);
      else if (k.indexOf('почтовый адрес') >= 0) setIfEmpty('postalAddress', v);
      else if (k.indexOf('фактический адрес') >= 0) setIfEmpty('actualAddress', v);
      else if (k.indexOf('генеральный директор') >= 0 || k.indexOf('директор') >= 0) setIfEmpty('ceo', v);
      else if (k.indexOf('телефон/ эл.почта бухгалтерия') >= 0 || k.indexOf('телефон/эл.почта бухгалтерия') >= 0 || k.indexOf('бухгалтер') >= 0) setIfEmpty('accountingContacts', v);
      else if (k.indexOf('телефон / эл. почта') >= 0 || k.indexOf('телефон/ эл. почта') >= 0 || k.indexOf('телефон') >= 0) setIfEmpty('contacts', v);
      else if (k.indexOf('инн/кпп') >= 0 || k.indexOf('инн кпп') >= 0) {
        var innKpp = v.match(/(\d{10,12})\s*\/\s*(\d{9})/);
        if (innKpp) {
          setIfEmpty('inn', innKpp[1]);
          setIfEmpty('kpp', innKpp[2]);
        } else setIfEmpty('innKpp', v);
      }
      else if (k.indexOf('инн') >= 0) setIfEmpty('inn', (v.match(/\d{10,12}/) || [v])[0]);
      else if (k.indexOf('огрн') >= 0) setIfEmpty('ogrn', (v.match(/\d{13,15}/) || [v])[0]);
      else if (k.indexOf('расчетный счет') >= 0 || k.indexOf('расчётный счет') >= 0 || k.indexOf('расчетный счёт') >= 0 || k.indexOf('расчётный счёт') >= 0) setIfEmpty('account', (v.match(/\d{20}/) || [v])[0]);
      else if (k.indexOf('корреспондентский счет') >= 0 || k.indexOf('корреспондентский счёт') >= 0 || k.indexOf('кор. счет') >= 0 || k.indexOf('кор. счёт') >= 0) setIfEmpty('corrAccount', (v.match(/\d{20}/) || [v])[0]);
      else if (k.indexOf('бик') >= 0) setIfEmpty('bik', (v.match(/\d{9}/) || [v])[0]);
      else if (k === 'банк' || k.indexOf('банк') >= 0) setIfEmpty('bank', v);
      else if (k.indexOf('идентификатор участника эдо') >= 0 || k.indexOf('guid') >= 0) setIfEmpty('edoGuid', v);
    });

    var m;
    m = t.match(/\bИНН[\s:]*(\d{10,12})/i); if (m) setIfEmpty('inn', m[1]);
    m = t.match(/\bОГРН[\s:]*(\d{13,15})/i); if (m) setIfEmpty('ogrn', m[1]);
    m = t.match(/\bОГРНИП[\s:]*(\d{13,15})/i); if (m) setIfEmpty('ogrn', m[1]);
    m = t.match(/\b[р\/\s]*сч[её]т[\s:]*(\d{20})/i) || t.match(/\bр\/с[\s:]*(\d{20})/i) || t.match(/\b(\d{20})\b/); if (m) setIfEmpty('account', m[1]);
    m = t.match(/\bБИК[\s:]*(\d{9})/i); if (m) setIfEmpty('bik', m[1]);
    m = t.match(/\bк[оа]р[.\s]*сч[её]т[\s:]*(\d{20})/i) || t.match(/\bк\/с[\s:]*(\d{20})/i); if (m) setIfEmpty('corrAccount', m[1]);
    m = t.match(/\bпаспорт[\s:]*(\d{4}\s*\d{6})/i) || t.match(/\b(\d{4}\s\d{6})\b/); if (m) setIfEmpty('passport', m[1].replace(/\s/g, ' '));
    var nameMatch = t.match(/(?:ООО|АО|ПАО)\s*[«\"].+?[»\"]/i) ||
      t.match(/(?:ИП)\s+[А-Яа-яЁё\s\-]+/i) ||
      t.match(/(?:Заказчик|Клиент)[\s:]+([А-Яа-яЁё\s\-]+)/i) ||
      t.match(/([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/);
    if (nameMatch) {
      var nm = nameMatch[1] || nameMatch[0];
      setIfEmpty('fio', String(nm).trim());
    }
    var bankMatch = t.match(/\b(ПАО СБЕРБАНК|СБЕРБАНК|Т-БАНК|ТБАНК|ВТБ|АЛЬФА-БАНК|[А-Яа-яЁё\s\-]+БАНК[а-яё]*)/i);
    if (bankMatch) setIfEmpty('bank', bankMatch[1].trim());
    out.__pairs = pairs;
    return out;
  }

  var MAMMOTH_CDNS = [
    'https://unpkg.com/mammoth@1.6.0/mammoth.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.min.js'
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
      cost: ''
    };

    var _contractScreenshots = [];

    function getFormData() {
      var d = {};
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost', 'soldCount', 'extraServices'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        d[k] = el ? el.value.trim() : '';
      });
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
      if (parsed.inn) document.getElementById('contract-inn').value = parsed.inn;
      if (parsed.ogrn) document.getElementById('contract-ogrn').value = parsed.ogrn;
      if (parsed.account) document.getElementById('contract-account').value = parsed.account;
      if (parsed.bank) document.getElementById('contract-bank').value = parsed.bank;
      if (parsed.bik) document.getElementById('contract-bik').value = parsed.bik;
      if (parsed.corrAccount) document.getElementById('contract-corrAccount').value = parsed.corrAccount;
      if (parsed.passport) document.getElementById('contract-passport').value = parsed.passport;
      if (parsed.shortName) document.getElementById('contract-fio').value = parsed.shortName;
      else if (parsed.fullName) document.getElementById('contract-fio').value = parsed.fullName;
      else if (parsed.fio) document.getElementById('contract-fio').value = parsed.fio;
    }

    function escHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderParsedRequisites(parsed) {
      var box = document.getElementById('contractParsedRequisites');
      if (!box) return;
      var rows = [];
      function add(label, val) { if (val != null && String(val).trim()) rows.push({ label: label, value: String(val).trim() }); }
      add('Полное наименование', parsed.fullName);
      add('Сокращенное наименование', parsed.shortName || parsed.fio);
      add('Юридический адрес', parsed.legalAddress);
      add('Почтовый адрес', parsed.postalAddress);
      add('Фактический адрес', parsed.actualAddress);
      add('Генеральный директор', parsed.ceo);
      add('Телефон / эл. почта', parsed.contacts);
      add('Телефон / эл. почта бухгалтерия', parsed.accountingContacts);
      add('ИНН', parsed.inn);
      add('КПП', parsed.kpp);
      add('ОГРН', parsed.ogrn);
      add('Расчетный счет', parsed.account);
      add('Корреспондентский счет', parsed.corrAccount);
      add('БИК Банка', parsed.bik);
      add('Банк', parsed.bank);
      add('GUID (ЭДО)', parsed.edoGuid);
      if (!rows.length) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
      }
      box.style.display = 'block';
      box.innerHTML = '<div class="contract-parsed-title">Распознано из файла</div><table class="contract-parsed-table"><tbody>' +
        rows.map(function(r) { return '<tr><td>' + escHtml(r.label) + '</td><td>' + escHtml(r.value) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }

    var html = '<div class="contract-form-wrap">' +
      '<div class="contract-toolbar">' +
      '<button type="button" class="btn-gen contract-toolbar-btn" onclick="window.__contractGenerate&&window.__contractGenerate()"><span>&#9889;</span> Сгенерировать договор</button>' +
      '<button type="button" class="contract-toolbar-btn contract-btn-load" onclick="document.getElementById(\'contract-file-inp\').click()">📄 Загрузить реквизиты</button>' +
      '<input type="file" id="contract-file-inp" accept=".txt,.docx,.pdf" style="display:none">' +
      '<button type="button" class="contract-toolbar-btn contract-btn-clear" onclick="window.__contractClear&&window.__contractClear()">Очистить</button>' +
      '</div>' +
      '<div class="contract-form">' +
      '<div class="contract-form-section contract-requisites-section"><h4 class="contract-form-title">Реквизиты заказчика</h4>' +
      '<p class="contract-requisites-hint">Заполните вручную или загрузите файл с реквизитами ниже</p>' +
      '<div class="contract-form-grid">' +
      '<div class="fg"><label>ФИО / Название компании</label><input type="text" id="contract-fio" placeholder="Иванов Иван Иванович или ИП Иванов"></div>' +
      '<div class="fg"><label>ИНН</label><input type="text" id="contract-inn" placeholder="10 или 12 цифр"></div>' +
      '<div class="fg"><label>ОГРН / ОГРНИП</label><input type="text" id="contract-ogrn" placeholder="13-15 цифр"></div>' +
      '<div class="fg"><label>Расчётный счёт</label><input type="text" id="contract-account" placeholder="20 цифр"></div>' +
      '<div class="fg"><label>Банк</label><input type="text" id="contract-bank" placeholder="ПАО Сбербанк"></div>' +
      '<div class="fg"><label>БИК</label><input type="text" id="contract-bik" placeholder="9 цифр"></div>' +
      '<div class="fg"><label>Корр. счёт</label><input type="text" id="contract-corrAccount" placeholder="20 цифр"></div>' +
      '<div class="fg"><label>Паспорт (физлицо)</label><input type="text" id="contract-passport" placeholder="1234 567890"></div>' +
      '</div>' +
      '<div class="contract-drop-zone" id="contract-drop-zone">Перетащите файл реквизитов (docx, pdf, txt) сюда</div>' +
      '<div class="contract-parsed-wrap" id="contractParsedRequisites" style="display:none"></div>' +
      '</div>' +
      '<div class="contract-extra-panel">' +
      '<h4 class="contract-form-title">Дополнительные параметры договора</h4>' +
      '<p class="contract-extra-hint">Стратегия продажи, скриншоты, кол-во объявлений и доп. услуги для приложения</p>' +
      '<div class="contract-form-grid">' +
      '<div class="fg"><label>Дата начала работ</label><input type="date" id="contract-startDate"></div>' +
      '<div class="fg"><label>Дата окончания работ</label><input type="date" id="contract-endDate"></div>' +
      '<div class="fg"><label>Дней на создание рекламы</label><input type="number" id="contract-daysCreate" placeholder="14" min="1"></div>' +
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
      _contractScreenshots = [];
      renderContractScreenshots();
      var startEl = document.getElementById('contract-startDate');
      if (startEl) startEl.value = todayStr;
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
    var dropZone = document.getElementById('contract-drop-zone');

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
        var parsed = parseRequisitesFromText(text);
        applyParsed(parsed);
        renderParsedRequisites(parsed);
        if (typeof window.__showToast === 'function') window.__showToast('Реквизиты загружены');
        else alert('Реквизиты извлечены и заполнены');
      });
    }

    if (fileInp) fileInp.addEventListener('change', function() {
      var f = fileInp.files && fileInp.files[0];
      handleFile(f);
    });

    if (dropZone) {
      dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('contract-drop-over'); });
      dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('contract-drop-over'); });
      dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('contract-drop-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(f);
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
    var wrap = document.createElement('div');
    wrap.className = 'contract-generator';
    wrap.innerHTML = '<div class="contract-generator-form" id="contractFormArea"></div><div class="contract-generator-preview" id="contractPreviewArea"></div>';
    mainContentEl.innerHTML = '';
    mainContentEl.appendChild(wrap);
    mainContentEl.scrollTop = 0;
    var wrapEl = mainContentEl.closest('.content-wrap');
    if (wrapEl) wrapEl.scrollTop = 0;

    var formArea = document.getElementById('contractFormArea');
    var previewArea = document.getElementById('contractPreviewArea');

    renderContractForm(formArea, function(data) {
      var html = generateContract(data);
      renderContractPreview(previewArea, html);
    }, function() {
      renderContractPreview(previewArea, '');
    });
  }

  window.ContractGenerator = {
    render: renderContractGenerator,
    generateContract: generateContract,
    parseRequisitesFromText: parseRequisitesFromText
  };
  window.__showContractGenerator = renderContractGenerator;
})();
