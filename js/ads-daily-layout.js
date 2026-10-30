(function (root) {
  'use strict';
  if (root.AVITOLOG_ADS_DAILY_LAYOUT) return;

  var INFO = {
    contacts: { name: 'Контакты', color: '#45bfff' },
    crm: { name: 'В CRM', color: '#ad8aff' },
    kp: { name: 'КП', color: '#28d5d1' },
    bought: { name: 'Продажи', color: '#43dfad' },
    earned: { name: 'Выручка', color: '#43dfad', money: true },
    spending: { name: 'Расходы', color: '#ff9e83', money: true },
    cpl: { name: 'Цена за лид', color: '#ca9bff', money: true },
    views: { name: 'Просмотры', color: '#45bfff' },
    phones: { name: 'Показали телефон', color: '#ab94ff' },
    messages: { name: 'Написали в чат', color: '#e1a3ed' },
    cpv: { name: 'Средняя цена просмотра', color: '#79d5ff', money: true }
  };
  var CHARTS = ['contacts', 'spending', 'earned', 'bought', 'views'];
  var CRM = ['crm', 'kp', 'bought', 'earned'];
  function node(tag, cls, text) {
    var item = document.createElement(tag);
    if (cls) item.className = cls;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function finite(value) { return typeof value === 'number' && isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null; }
  function format(value, key) {
    value = finite(value);
    return value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: INFO[key] && INFO[key].money ? 2 : 0 }) + (INFO[key] && INFO[key].money ? ' ₽' : '');
  }
  function visible(settings, key) { return !settings || settings[key] !== false; }
  function ratio(a, b) { a = finite(a); b = finite(b); return a !== null && b !== null && b > 0 ? a / b : null; }
  function percent(value) { return value === null ? '—' : (value * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%'; }
  function dateLabel(date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date.slice(8, 10) + '.' + date.slice(5, 7) : String(date || ''); }
  function sum(values) { return values.length && values.every(function (value) { return finite(value) !== null; }) ? values.reduce(function (total, value) { return total + value; }, 0) : null; }
  function enabled(keys, settings) { return keys.filter(function (key) { return visible(settings, key); }); }
  function button(text, cls, callback) {
    var item = node('button', cls, text); item.type = 'button';
    if (callback) item.addEventListener('click', callback);
    return item;
  }
  function metricCard(key, value, cls) {
    var card = node('div', cls || 'ads-daily-finance-card');
    card.style.setProperty('--ads-daily-color', INFO[key].color);
    card.appendChild(node('span', 'ads-daily-label', INFO[key].name));
    card.appendChild(node('strong', 'ads-daily-value', format(value, key)));
    if (key === 'earned') card.title = 'Датированные оплаты из кассы и доля агентства от Саши; не сумма выставленных КП и не личная доля Саши.';
    if (key === 'phones') card.title = 'Показали телефон / нажали кнопку звонка. Это не число подтверждённых разговоров.';
    return card;
  }
  function funnel(model, totals, settings) {
    var panel = node('section', 'ads-daily-panel ads-daily-funnel');
    panel.setAttribute('aria-label', 'Воронка за выбранный период');
    var keys = ['contacts', 'crm', 'kp', 'bought'];
    keys.forEach(function (key, index) {
      if (!visible(settings, key)) return;
      var stage = metricCard(key, totals[key], 'ads-daily-stage');
      if (key === 'bought') stage.firstChild.textContent = 'Купили';
      panel.appendChild(stage);
      var next = keys[index + 1];
      if (next && visible(settings, next)) {
        var conversion = node('div', 'ads-daily-conversion');
        conversion.appendChild(node('strong', '', percent(ratio(totals[next], totals[key]))));
        conversion.appendChild(node('span', '', '→'));
        conversion.title = 'Отношение числа событий за период, не когортная конверсия. Контакты API и события CRM могут относиться к разным заявкам.';
        panel.appendChild(conversion);
      }
    });
    return panel;
  }
  function accountSeries(options) {
    var selected = [], names = Object.create(null), stats = Object.create(null), duplicate = Object.create(null), used = Object.create(null);
    (Array.isArray(options.selectedAccountIds) ? options.selectedAccountIds : []).forEach(function (value) {
      var id = String(value); if (/^[1-9]\d{0,19}$/.test(id) && selected.indexOf(id) < 0) selected.push(id);
    });
    (Array.isArray(options.accounts) ? options.accounts : []).forEach(function (account) { if (account) names[String(account.avitoUserId)] = String(account.name || ''); });
    (Array.isArray(options.statistics) ? options.statistics : []).forEach(function (stat) {
      if (!stat) return; var id = String(stat.avitoUserId);
      if (stats[id]) duplicate[id] = true; else stats[id] = stat;
    });
    return selected.sort().map(function (id) {
      var hash = 2166136261;
      for (var index = 0; index < id.length; index++) { hash ^= id.charCodeAt(index); hash = Math.imul(hash, 16777619); }
      var hue = (hash >>> 0) % 360;
      while (used[hue] || selected.length === 2 && Object.keys(used).some(function (other) { var distance = Math.abs(Number(other) - hue); return Math.min(distance, 360 - distance) < 60; })) hue = (hue + 137) % 360;
      used[hue] = true;
      return { id: id, name: names[id] || stats[id] && String(stats[id].name || '') || 'Avito ID ' + id, color: 'hsl(' + hue + ', 82%, 65%)', statistic: duplicate[id] ? null : stats[id] };
    });
  }
  function chartLegend(series) {
    var legend = node('div', 'ads-daily-chart-legend'); legend.setAttribute('aria-label', 'Цвета аккаунтов на графике');
    legend.style.display = 'flex'; legend.style.flexWrap = 'wrap'; legend.style.gap = '8px 20px'; legend.style.margin = '6px 0 12px'; legend.style.fontSize = '12px';
    series.forEach(function (entry) {
      var label = node('span', 'ads-daily-chart-account', entry.name); label.style.color = entry.color;
      label.style.borderLeft = '8px solid ' + entry.color; label.style.paddingLeft = '7px'; legend.appendChild(label);
    });
    return legend;
  }
  function chart(days, metric, options, series) {
    var container = node('div', 'ads-daily-chart');
    container.setAttribute('aria-label', INFO[metric].name + ' по дням');
    container.style.setProperty('--ads-daily-color', INFO[metric].color);
    var max = Math.max.apply(Math, [0].concat(days.map(function (day) { return finite(day[metric]) || 0; })));
    days.forEach(function (day) {
      var value = finite(day[metric]);
      var column = node('div', 'ads-daily-column');
      column.tabIndex = 0;
      var label = dateLabel(day.date) + ' · ' + INFO[metric].name + ': ' + format(value, metric);
      var parts = series.map(function (entry) {
        var date = accountDay(entry.statistic, day.date, options.model.range && options.model.range.today);
        var contribution = date ? finite(date[metric]) : null;
        label += '\n' + entry.name + ': ' + format(contribution, metric);
        return { color: entry.color, value: contribution };
      });
      var partTotal = sum(parts.map(function (part) { return part.value; }));
      var complete = parts.length && value !== null && partTotal !== null && Math.abs(partTotal - value) <= Math.max(0.0000001, value * 0.000000001);
      if (parts.length && !complete) label += '\nРазбивка по аккаунтам неполная; показан общий итог.';
      column.setAttribute('aria-label', label);
      column.title = label;
      var bar = node('span', 'ads-daily-bar' + (value === null ? ' is-missing' : ''));
      bar.style.height = value === null ? '3px' : (max > 0 ? 100 * value / max : 0) + '%';
      if (complete && value > 0) {
        var segments = parts.filter(function (part) { return part.value > 0; }), stops = [], offset = 0;
        segments.forEach(function (part, index) {
          var start = offset; offset += 100 * part.value / value;
          var fade = Math.min(2, (offset - start) / 4);
          stops.push(part.color + ' ' + (index ? start + fade : 0) + '%');
          stops.push(part.color + ' ' + (index < segments.length - 1 ? offset - fade : 100) + '%');
        });
        bar.style.background = 'linear-gradient(to top, ' + stops.join(', ') + ')';
        bar.setAttribute('data-account-count', String(segments.length));
      }
      var track = node('div', 'ads-daily-track'); track.appendChild(bar);
      column.appendChild(track);
      column.appendChild(node('span', 'ads-daily-date', dateLabel(day.date)));
      column.appendChild(node('span', 'ads-daily-tooltip', label));
      container.appendChild(column);
    });
    return container;
  }
  function accountDay(stat, date, today) {
    if (!stat) return null;
    if (date === today && stat.today && stat.today.available === true && stat.today.date === date) return stat.today;
    var history = stat.history;
    if (!history || history.available !== true || history.dateTo !== today || !Array.isArray(history.days)) return null;
    var matching = history.days.filter(function (day) { return day && day.date === date; });
    return matching.length === 1 ? matching[0] : null;
  }
  function sourceMetrics(source, period) {
    if (period === 'today') return source.today && typeof source.today === 'object' ? source.today : null;
    return source.month && typeof source.month === 'object' ? source.month : source;
  }
  function sourceValue(source, options, key) {
    var totals = options.period === 'today' ? options.model.today : options.model.month;
    var values = sourceMetrics(source, options.period);
    return totals && finite(totals[key]) !== null && values ? finite(values[key]) : null;
  }
  function accountRows(options) {
    var model = options.model || {}, selected = [], stats = Object.create(null), duplicate = Object.create(null), names = Object.create(null);
    (Array.isArray(options.selectedAccountIds) ? options.selectedAccountIds : []).forEach(function (value) {
      var id = String(value); if (/^[1-9]\d{0,19}$/.test(id) && selected.indexOf(id) < 0) selected.push(id);
    });
    (Array.isArray(options.accounts) ? options.accounts : []).forEach(function (account) { if (account) names[String(account.avitoUserId)] = String(account.name || ''); });
    (Array.isArray(options.statistics) ? options.statistics : []).forEach(function (stat) {
      if (!stat) return; var id = String(stat.avitoUserId);
      if (stats[id]) duplicate[id] = true;
      else stats[id] = stat;
    });
    var dates = options.period === 'today' ? [model.range && model.range.today] : model.range && model.range.days || [];
    var rows = selected.map(function (id) {
      var stat = !duplicate[id] && stats[id], row = { id: id, name: names[id] || stat && String(stat.name || '') || 'Avito ID ' + id, clients: [], mapped: [], api: true };
      ['contacts', 'spending'].forEach(function (key) {
        row[key] = sum(dates.map(function (date) { var day = accountDay(stat, date, model.range && model.range.today); return day ? finite(day[key]) : null; }));
      });
      CRM.forEach(function (key) { row[key] = null; });
      row.cpl = ratio(row.spending, row.contacts);
      return row;
    });
    var mapping = options.sourceMap && typeof options.sourceMap === 'object' ? options.sourceMap : {};
    (Array.isArray(model.sources) ? model.sources : []).forEach(function (source) {
      if (!source) return;
      var id = String(source.sourceId || ''), accountId = Object.prototype.hasOwnProperty.call(mapping, id) ? String(mapping[id]) : '';
      var target = rows.filter(function (row) { return row.id === accountId; })[0];
      if (target) target.mapped.push(source);
      else {
        var values = sourceMetrics(source, options.period);
        var row = { id: 'source:' + id, name: String(source.name || 'Аккаунт не указан') + ' · источник CRM', api: false, clients: Array.isArray(values && values.clients) ? values.clients : options.period === 'today' ? [] : Array.isArray(source.clients) ? source.clients : [], contacts: null, spending: null, cpl: null };
        CRM.forEach(function (key) { row[key] = sourceValue(source, options, key); });
        rows.push(row);
      }
    });
    rows.forEach(function (row) {
      if (!row.api || !row.mapped.length) return;
      CRM.forEach(function (key) { row[key] = sum(row.mapped.map(function (source) { return sourceValue(source, options, key); })); });
      row.mapped.forEach(function (source) {
        var values = sourceMetrics(source, options.period);
        var clients = Array.isArray(values && values.clients) ? values.clients : options.period === 'today' ? [] : Array.isArray(source.clients) ? source.clients : [];
        row.clients = row.clients.concat(clients);
      });
    });
    return rows;
  }
  function table(options) {
    var section = node('section', 'ads-daily-panel ads-daily-accounts');
    var heading = node('div', 'ads-daily-section-heading');
    heading.appendChild(node('h3', '', 'Аккаунты и результаты · ' + (options.period === 'today' ? 'сегодня' : options.model.range.days.length+' дн.')));
    var search = node('input', 'ads-daily-search'); search.type = 'search'; search.placeholder = 'Поиск по аккаунту…'; search.setAttribute('aria-label', 'Поиск по аккаунту');
    heading.appendChild(search); section.appendChild(heading);
    var wrap = node('div', 'ads-daily-table-scroll'), grid = node('table', 'ads-daily-table'), head = node('thead'), body = node('tbody');
    var keys = enabled(['contacts', 'crm', 'kp', 'bought', 'earned', 'spending', 'cpl'], options.metrics), rows = accountRows(options), sortKey = '', descending = true;
    var labels = { bought: 'Продажи' };
    var header = node('tr'); header.appendChild(node('th', '', 'Аккаунт'));
    keys.forEach(function (key) {
      var th = node('th');
      var sort = button(labels[key] || INFO[key].name, 'ads-daily-sort', function () {
        descending = sortKey === key ? !descending : true; sortKey = key;
        head.querySelectorAll('th').forEach(function (item) { item.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', descending ? 'descending' : 'ascending'); drawRows();
      });
      th.appendChild(sort); header.appendChild(th);
    });
    head.appendChild(header); grid.appendChild(head); grid.appendChild(body); wrap.appendChild(grid); section.appendChild(wrap);
    function drawRows() {
      while (body.firstChild) body.removeChild(body.firstChild);
      var query = String(search.value || '').trim().toLocaleLowerCase('ru-RU');
      var showing = rows.filter(function (row) { return !query || row.name.toLocaleLowerCase('ru-RU').indexOf(query) >= 0; });
      if (sortKey) showing.sort(function (a, b) {
        var av = finite(a[sortKey]), bv = finite(b[sortKey]);
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        return descending ? bv - av : av - bv;
      });
      showing.forEach(function (row) {
        var tr = node('tr', row.api ? '' : 'ads-daily-unmapped'), td = node('td'), detailRow = node('tr', 'ads-daily-detail-row'), detailCell = node('td');
        detailRow.hidden = true; detailCell.colSpan = keys.length + 1;
        var toggle = button('› ' + row.name, 'ads-daily-account-name', function () {
          detailRow.hidden = !detailRow.hidden; toggle.setAttribute('aria-expanded', String(!detailRow.hidden));
        });
        toggle.setAttribute('aria-expanded', 'false'); td.appendChild(toggle); tr.appendChild(td);
        keys.forEach(function (key) { var cell = node('td', 'ads-daily-table-value', format(row[key], key)); cell.style.setProperty('--ads-daily-color', INFO[key].color); tr.appendChild(cell); });
        if (!row.api) detailCell.appendChild(node('p', 'ads-daily-note', 'Источник CRM не сопоставлен с выбранным API-аккаунтом. Статистика Авито не приписывается по названию.'));
        else if (!row.mapped.length) detailCell.appendChild(node('p', 'ads-daily-note', 'Чтобы показать события CRM и оплаты этого аккаунта, сопоставьте источник CRM в настройках ADS.'));
        if (row.clients.length) {
          var list = node('ul', 'ads-daily-clients');
          row.clients.forEach(function (client) {
            if (!client) return;
            var stage = client.stage === 'sold' ? 'Купили' : client.stage === 'working' || client.stage === 'work' ? 'В работе' : 'В CRM';
            if (Array.isArray(client.events)) {
              var labels = { crm: 'В CRM', kp: 'КП', bought: 'Купили', earned: 'Оплата' };
              var events = client.events.filter(function (event, index, all) { return Object.prototype.hasOwnProperty.call(labels, event) && all.indexOf(event) === index; });
              stage = events.map(function (event) { return labels[event]; }).join(', ') || stage;
            }
            list.appendChild(node('li', '', String(client.name || 'Проект') + ' · ' + dateLabel(client.date) + ' · ' + stage));
          });
          detailCell.appendChild(list);
        } else detailCell.appendChild(node('p', 'ads-daily-note', options.period === 'today' ? 'Клиенты за сегодня с достоверной датой события не найдены.' : 'Связанные клиенты за период не найдены.'));
        detailRow.appendChild(detailCell); body.appendChild(tr); body.appendChild(detailRow);
      });
      if (!showing.length) { var empty = node('tr'), cell = node('td', 'ads-daily-note', rows.length ? 'Аккаунты не найдены.' : 'Выберите рекламные аккаунты в настройках ADS.'); cell.colSpan = keys.length + 1; empty.appendChild(cell); body.appendChild(empty); }
    }
    search.addEventListener('input', drawRows); drawRows();
    section.appendChild(node('p', 'ads-daily-note', 'API — только выбранные аккаунты. CRM и оплаты распределены только по явному сопоставлению источников; прочерк не означает ноль.'));
    if (options.period === 'today' && (options.model.sources || []).some(function (source) { return source && !source.today; })) section.appendChild(node('p', 'ads-daily-note', 'Дневное распределение событий CRM по аккаунтам пока недоступно. Итоги воронки за сегодня показаны выше.'));
    return section;
  }
  function render(options) {
    options = options || {}; var model = options.model || {}, totals = (options.period === 'today' ? model.today : model.month) || {}, settings = options.metrics;
    options = Object.assign({}, options, { model: model });
    var main = node('div', 'ads-daily-layout');
    if (enabled(['contacts', 'crm', 'kp', 'bought'], settings).length) {
      main.appendChild(funnel(model, totals, settings));
      main.appendChild(node('p', 'ads-daily-funnel-note', 'Проценты — отношение событий за выбранный период, не когортная конверсия.'));
    }
    var finance = node('section', 'ads-daily-finance'); finance.setAttribute('aria-label', 'Финансы за выбранный период');
    enabled(['earned', 'spending', 'cpl', 'bought'], settings).forEach(function (key) {
      var card = metricCard(key, totals[key]);
      if (key === 'earned' && options.showSashaRevenue && typeof totals.earnedSasha === 'number') card.appendChild(node('small', 'ads-daily-revenue-detail', 'От Саши агентству ' + (options.period === 'today' ? 'сегодня' : 'за месяц') + ': ' + format(totals.earnedSasha, 'earned')));
      finance.appendChild(card);
    });
    if (finance.firstChild) main.appendChild(finance);
    var available = enabled(CHARTS, settings), sides = enabled(['views', 'phones', 'messages', 'cpv'], settings), analytics = node('section', 'ads-daily-analytics');
    if (available.length) {
      var key = available.indexOf(options.metric) >= 0 ? options.metric : available[0];
      var panel = node('div', 'ads-daily-panel ads-daily-dynamics'), heading = node('div', 'ads-daily-section-heading');
      heading.appendChild(node('h3', '', 'Динамика продвижения'));
      var tabs = node('div', 'ads-daily-chart-tabs'); tabs.setAttribute('aria-label', 'Показатель графика');
      available.forEach(function (metric) {
        var tab = button(INFO[metric].name, 'ads-daily-chart-tab', function () { if (typeof options.onMetricChange === 'function') options.onMetricChange(metric); });
        tab.setAttribute('aria-pressed', String(key === metric)); tabs.appendChild(tab);
      });
      heading.appendChild(tabs); panel.appendChild(heading);
      var summary = node('div', 'ads-daily-chart-summary'); summary.appendChild(node('span', '', INFO[key].name)); summary.appendChild(node('strong', '', format(totals[key], key))); panel.appendChild(summary);
      var days = (Array.isArray(model.days) ? model.days : []).filter(function (day) { return day && (options.period !== 'today' || day.date === (model.range && model.range.today)); });
      var series = ['contacts', 'spending', 'views'].indexOf(key) !== -1 ? accountSeries(options) : [];
      if (series.length) panel.appendChild(chartLegend(series));
      panel.appendChild(chart(days, key, options, series));
      if (series.length) panel.appendChild(node('p', 'ads-daily-note', 'Цвета — вклад аккаунтов в общий итог. При неполной разбивке свеча остаётся одноцветной; значения доступны при наведении.'));
      if (!days.length) panel.appendChild(node('p', 'ads-daily-note', 'Дневные данные ещё не загружены.'));
      analytics.appendChild(panel);
    }
    if (sides.length) {
      var side = node('aside', 'ads-daily-panel ads-daily-side'); side.appendChild(node('h3', '', 'Дополнительная статистика'));
      sides.forEach(function (key) { side.appendChild(metricCard(key, totals[key], 'ads-daily-side-metric')); }); analytics.appendChild(side);
    }
    if (!available.length || !sides.length) analytics.className += ' is-single';
    if (analytics.firstChild) main.appendChild(analytics);
    main.appendChild(table(options)); return main;
  }
  root.AVITOLOG_ADS_DAILY_LAYOUT = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
