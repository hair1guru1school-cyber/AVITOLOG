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
    var m;
    m = t.match(/\bИНН[\s:]*(\d{10,12})/i); if (m) out.inn = m[1];
    m = t.match(/\bОГРН[\s:]*(\d{13,15})/i); if (m) out.ogrn = m[1];
    m = t.match(/\bОГРНИП[\s:]*(\d{13,15})/i); if (m) out.ogrn = m[1];
    m = t.match(/\b[р\/\s]*счёт[\s:]*(\d{20})/i) || t.match(/\bр\/с[\s:]*(\d{20})/i) || t.match(/\b(\d{20})\b/); if (m) out.account = m[1];
    m = t.match(/\bБИК[\s:]*(\d{9})/i); if (m) out.bik = m[1];
    m = t.match(/\bк[оа]р[.\s]*счёт[\s:]*(\d{20})/i) || t.match(/\bк\/с[\s:]*(\d{20})/i); if (m) out.corrAccount = m[1];
    m = t.match(/\bпаспорт[\s:]*(\d{4}\s*\d{6})/i) || t.match(/\b(\d{4}\s\d{6})\b/); if (m) out.passport = m[1].replace(/\s/g, ' ');
    var nameMatch = t.match(/(?:ИП|ООО|АО|ПАО)\s+([А-Яа-яЁё\s\-]+?)(?:\s+ИНН|\s*\d|$)/) ||
      t.match(/(?:Заказчик|Клиент)[\s:]+([А-Яа-яЁё\s\-]+)/i) ||
      t.match(/([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/);
    if (nameMatch) out.fio = nameMatch[1].trim();
    var bankMatch = t.match(/\b(ПАО СБЕРБАНК|СБЕРБАНК|Т-БАНК|ВТБ|АЛЬФА-БАНК|[А-Яа-яЁё\s\-]+БАНК[а-яё]*)/i);
    if (bankMatch) out.bank = bankMatch[1].trim();
    return out;
  }

  function getMammoth(cb) {
    var m = (typeof window !== 'undefined' && window.mammoth) || (typeof mammoth !== 'undefined' ? mammoth : null);
    if (m && typeof m.extractRawText === 'function') {
      cb(null, m);
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/mammoth@1.6.0/mammoth.min.js';
    s.onload = function() {
      var mm = window.mammoth;
      cb(mm && typeof mm.extractRawText === 'function' ? null : new Error('mammoth не инициализировалась'), mm);
    };
    s.onerror = function() {
      cb(new Error('Не удалось загрузить mammoth. Проверьте подключение к интернету и обновите страницу.'), null);
    };
    document.head.appendChild(s);
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

    function getFormData() {
      var d = {};
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        d[k] = el ? el.value.trim() : '';
      });
      d.companyName = d.fio;
      d.clientType = detectClientType(d);
      return d;
    }

    function setFormData(d) {
      if (!d) return;
      Object.keys(d).forEach(function(k) {
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
      if (parsed.fio) document.getElementById('contract-fio').value = parsed.fio;
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
      '</div>' +
      '<div class="contract-form-section"><h4 class="contract-form-title">Дополнительные параметры договора</h4>' +
      '<div class="contract-form-grid">' +
      '<div class="fg"><label>Дата начала работ</label><input type="date" id="contract-startDate"></div>' +
      '<div class="fg"><label>Дата окончания работ</label><input type="date" id="contract-endDate"></div>' +
      '<div class="fg"><label>Дней на создание рекламы</label><input type="number" id="contract-daysCreate" placeholder="14" min="1"></div>' +
      '<div class="fg"><label>Дней ведения рекламы</label><input type="number" id="contract-daysManage" placeholder="30" min="1"></div>' +
      '<div class="fg"><label>Стоимость договора, руб.</label><input type="number" id="contract-cost" placeholder="50000" min="0"></div>' +
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
      ['fio', 'inn', 'ogrn', 'account', 'bank', 'bik', 'corrAccount', 'passport', 'startDate', 'endDate', 'daysCreate', 'daysManage', 'cost'].forEach(function(k) {
        var el = document.getElementById('contract-' + k);
        if (el) el.value = '';
      });
      var startEl = document.getElementById('contract-startDate');
      if (startEl) startEl.value = todayStr;
      onClear && onClear();
    };

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
