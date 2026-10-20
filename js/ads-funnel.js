(function(root) {
  'use strict';

  var METRICS = ['earned', 'earnedOwn', 'earnedSasha', 'contacts', 'phones', 'messages', 'crm', 'kp', 'bought', 'spending', 'cpl', 'cpv', 'views'];
  var API_METRICS = ['contacts', 'phones', 'messages', 'spending', 'views'];
  var DAY = 86400000;
  function map() { return Object.create(null); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch(e) { return null; } }
  function dayStamp(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(stamp).toISOString().slice(0, 10) === value ? stamp : null;
  }
  function moscowDate(value) {
    var date = value === undefined ? new Date() : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid analytics date');
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var out = map();
    parts.forEach(function(part) { out[part.type] = part.value; });
    return out.year + '-' + out.month + '-' + out.day;
  }
  function dateValue(value) {
    var raw = String(value || '').trim();
    if (dayStamp(raw) !== null) return raw;
    var ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
    if (ru) {
      var iso = ru[3] + '-' + ru[2].padStart(2, '0') + '-' + ru[1].padStart(2, '0');
      return dayStamp(iso) !== null ? iso : '';
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
      try { return moscowDate(raw); } catch(e) {}
    }
    return '';
  }
  function range(now) {
    var today = moscowDate(now), end = dayStamp(today), days = [], months = [];
    for (var i = 29; i >= 0; i--) {
      var day = new Date(end - i * DAY).toISOString().slice(0, 10);
      days.push(day);
      if (months.indexOf(day.slice(0, 7)) < 0) months.push(day.slice(0, 7));
    }
    return { today: today, dateFrom: days[0], days: days, months: months };
  }
  function readSources(months) {
    return {
      goals: typeof root.__avitologAdsGoalsRead === 'function' ? clone(root.__avitologAdsGoalsRead(months)) : { live: null, months: {} },
      cash: typeof root.__avitologAdsCashRead === 'function' ? clone(root.__avitologAdsCashRead(months)) : { live: null, months: {} }
    };
  }
  function money(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    var text = String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    var number = Number(text);
    return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : null;
  }
  function metric(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null; }
  function numericId(value) { var id = String(value == null ? '' : value); return /^[1-9]\d*$/.test(id) ? id : ''; }
  function ratio(numerator, denominator) { return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null; }
  function emptyDay(date) {
    return { date: date, earned: 0, earnedOwn: 0, earnedSasha: 0, contacts: null, phones: null, messages: null, crm: 0, kp: 0, bought: 0, spending: null, cpl: null, cpv: null, views: null };
  }
  function compute(input) {
    input = input || {};
    var span = range(input.now), days = span.days.map(emptyDay), byDay = map(), warningSet = map(), sources = map(), sourceAccounts = [], registry = map();
    days.forEach(function(day) { byDay[day.date] = day; });
    function warn(code) { warningSet[code] = true; }
    var goals = object(input.goals) ? input.goals : {}, snapshots = object(goals.months) ? goals.months : {};
    var datasets = [], knownGoals = false, rows = map(), deleted = map();
    span.months.forEach(function(ym) { if (object(snapshots[ym]) && Array.isArray(snapshots[ym].projects)) datasets.push(snapshots[ym]); });
    if (object(goals.live) && Array.isArray(goals.live.projects)) datasets.push(goals.live);
    datasets.forEach(function(data) {
      knownGoals = true;
      (Array.isArray(data.sourceAccounts) ? data.sourceAccounts : []).forEach(function(account) {
        if (!account || !account.id) return;
        registry[String(account.id)] = { id: String(account.id), name: String(account.name || 'Аккаунт'), icon: String(account.icon || '') };
      });
      (Array.isArray(data.deletedProjectIds) ? data.deletedProjectIds : []).forEach(function(id) { if (id) deleted[String(id)] = true; });
      data.projects.forEach(function(row) {
        if (!object(row)) return;
        var id = String(row.id || '');
        if (!id) { warn('В CRM есть строки без идентификатора; они не включены в воронку.'); return; }
        rows[id] = row;
      });
    });
    Object.keys(deleted).forEach(function(id) { delete rows[id]; });
    sourceAccounts = Object.keys(registry).map(function(id) { return registry[id]; });
    function source(id) {
      id = String(id || '');
      if (!sources[id]) {
        sources[id] = { sourceId: id, name: registry[id] ? registry[id].name : id ? 'Аккаунт не найден: ' + id : 'Аккаунт не указан', crm: 0, kp: 0, bought: 0, earned: 0, clients: [], today: { crm: 0, kp: 0, bought: 0, earned: 0, clients: [] } };
        var mapped = object(input.sourceMap) && Object.prototype.hasOwnProperty.call(input.sourceMap, id) ? numericId(input.sourceMap[id]) : '';
        if (mapped) sources[id].avitoUserId = mapped;
      }
      return sources[id];
    }
    sourceAccounts.forEach(function(account) { source(account.id); });
    function todayClient(bucket, group, event) {
      var client = bucket.today.clients.filter(function(item) { return item.id === group.id; })[0];
      if (!client) { client = { id: group.id, name: group.name, date: span.today, events: [] }; bucket.today.clients.push(client); }
      if (client.events.indexOf(event) < 0) client.events.push(event);
    }
    function parentId(row) { return String(row.soldFromId || row.workCopyOfWeekId || row.archiveCopyOfWeekId || ''); }
    function rootId(id) {
      var visited = map(), current = id;
      while (rows[current] && parentId(rows[current])) {
        if (visited[current]) { warn('В CRM обнаружена циклическая связь копий; строки объединены по идентификатору.'); return Object.keys(visited).sort()[0]; }
        visited[current] = true;
        var parent = parentId(rows[current]);
        if (deleted[parent]) return '';
        current = parent;
      }
      return current;
    }
    var groups = map(), linkMap = map();
    Object.keys(rows).forEach(function(id) {
      var key = rootId(id);
      if (!key) return;
      if (!groups[key]) groups[key] = { id: key, rows: [], sourceId: '', name: '', created: '', kp: '', paid: '', sold: false };
      groups[key].rows.push(rows[id]);
    });
    function earliest(values) { return values.filter(Boolean).sort()[0] || ''; }
    Object.keys(groups).forEach(function(id) {
      var group = groups[id], original = rows[id], relevant = group.rows;
      var chosen = original || relevant[0];
      group.name = String(chosen.name || chosen.company || 'Проект');
      group.sourceId = String(chosen.sourceAccountId || chosen.source_account_id || '');
      if (!group.sourceId) relevant.some(function(row) { group.sourceId = String(row.sourceAccountId || row.source_account_id || ''); return !!group.sourceId; });
      var created = relevant.map(function(row) { return dateValue(row.createdAt || row.createdDate || row.created_at); });
      if (original && original.stage !== 'sold') created.push(dateValue(original.date));
      group.created = earliest(created);
      group.kp = earliest(relevant.map(function(row) { return dateValue(row.statusDates && (row.statusDates.kp || row.statusDates.kp_sent)); }));
      var sold = relevant.filter(function(row) { return row.stage === 'sold'; });
      group.sold = sold.length > 0;
      group.paid = earliest(sold.map(function(row) { return dateValue(row.statusDates && row.statusDates.paid || row.paidDate); }));
      if (!group.created) warn('У части CRM-проектов нет сохранённой даты создания; дата оплаты не считается созданием.');
      if (sold.length && !group.paid) warn('У части продаж нет даты оплаты; они не распределены по дням.');
      relevant.forEach(function(row) {
        [row.id, row.crmClientId, row.folderId, row.crmClientRecordId, row.client_id].forEach(function(link) {
          if (!link) return;
          link = String(link);
          if (!Object.prototype.hasOwnProperty.call(linkMap, link)) linkMap[link] = id;
          else if (linkMap[link] !== id) linkMap[link] = null;
        });
      });
      var bucket = source(group.sourceId), touched = false;
      [['crm', group.created], ['kp', group.kp], ['bought', group.paid]].forEach(function(pair) {
        if (!byDay[pair[1]]) return;
        byDay[pair[1]][pair[0]]++;
        bucket[pair[0]]++;
        if (pair[1] === span.today) { bucket.today[pair[0]]++; todayClient(bucket, group, pair[0]); }
        touched = true;
      });
      if (touched) bucket.clients.push({ name: group.name, date: group.created || group.kp || group.paid, stage: group.sold ? 'sold' : String(chosen.stage || 'weekly') });
    });
    if (!knownGoals) {
      days.forEach(function(day) { day.crm = day.kp = day.bought = null; });
      warn('Данные CRM ещё не загружены.');
    }
    var cash = object(input.cash) ? input.cash : {}, cashMonths = object(cash.months) ? cash.months : {};
    span.months.forEach(function(ym) {
      var ledger = Array.isArray(cashMonths[ym]) ? cashMonths[ym] : Array.isArray(cash.live) ? cash.live : null;
      if (!ledger) {
        days.forEach(function(day) { if (day.date.slice(0, 7) === ym) day.earnedOwn = null; });
        warn('Часть данных кассы ещё не загружена.');
        return;
      }
      ledger.forEach(function(row) {
        if (!object(row)) return;
        var linked = [row.goalProjectId, row.crmClientId].map(function(id) { return id ? linkMap[String(id)] : null; }).filter(Boolean);
        var groupId = linked[0];
        if (linked.some(function(id) { return id !== groupId; })) groupId = null;
        var payments = Array.isArray(row.paymentHistory) && row.paymentHistory.length ? row.paymentHistory : [{ date: row.paymentDate, amount: row.paid }];
        payments.forEach(function(payment) {
          if (!object(payment)) return;
          var amount = money(payment.amount), date = dateValue(payment.date);
          if (amount === null) {
            if (String(payment.amount == null ? '' : payment.amount).trim()) warn('В кассе есть некорректные суммы оплат; они не включены в заработанное.');
            return;
          }
          if (amount === 0) return;
          if (!date) { warn('В кассе есть оплаты без достоверной даты; они не включены в заработанное.'); return; }
          if (date.slice(0, 7) !== ym || !byDay[date]) return;
          if (!groupId || !groups[groupId]) { warn('В кассе есть оплаты без однозначной связи с CRM; они не включены в заработанное.'); return; }
          var group = groups[groupId], bucket = source(group.sourceId);
          byDay[date].earnedOwn += amount;
          bucket.earned += amount;
          if (date === span.today) { bucket.today.earned += amount; todayClient(bucket, group, 'earned'); }
          if (!bucket.clients.some(function(client) { return client.name === group.name && client.date === (group.created || group.kp || group.paid); })) {
            bucket.clients.push({ name: group.name, date: group.created || group.kp || group.paid, stage: group.sold ? 'sold' : String((rows[group.id] || group.rows[0]).stage || 'weekly') });
          }
        });
      });
    });
    var sashaCash = object(cash.sasha) ? cash.sasha : null;
    if (sashaCash) span.months.forEach(function(ym) {
      var snapshots = object(sashaCash.months) ? sashaCash.months : {};
      var ledger = Array.isArray(snapshots[ym]) ? snapshots[ym] : Array.isArray(sashaCash.live) ? sashaCash.live : null;
      if (!ledger) {
        days.forEach(function(day) { if (day.date.slice(0, 7) === ym) day.earnedSasha = null; });
        warn('Часть данных агентской прибыли Саши ещё не загружена.');
        return;
      }
      ledger.forEach(function(row) {
        if (!object(row)) return;
        var amount = money(row.aoaPercent);
        if (amount === null) {
          if (String(row.aoaPercent == null ? '' : row.aoaPercent).trim()) warn('В кассе Саши есть некорректные суммы агентству; они не включены в выручку.');
          return;
        }
        if (amount === 0) return;
        // aoaPercent is the agency's ruble share; payment history contains gross sales, not this share.
        var date = dateValue(row.paymentDate);
        if (!String(row.paymentDate == null ? '' : row.paymentDate).trim() && Array.isArray(row.paymentHistory)) {
          var paymentDates = [];
          var datedHistory = row.paymentHistory.every(function(payment) {
            if (!object(payment)) return false;
            var paid = money(payment.amount);
            if (paid === null) return false;
            if (paid === 0) return true;
            var paidDate = dateValue(payment.date);
            if (!paidDate) return false;
            if (paymentDates.indexOf(paidDate) < 0) paymentDates.push(paidDate);
            return true;
          });
          if (datedHistory && paymentDates.length === 1) date = paymentDates[0];
        }
        if (!date) { warn('В кассе Саши есть прибыль агентству без достоверной даты; она не включена в выручку.'); return; }
        if (date.slice(0, 7) !== ym || !byDay[date]) return;
        byDay[date].earnedSasha += amount;
      });
    });
    days.forEach(function(day) { day.earned = day.earnedOwn === null || day.earnedSasha === null ? null : day.earnedOwn + day.earnedSasha; });
    var selected = [], accountStats = map(), duplicateStats = map();
    (Array.isArray(input.selectedAccountIds) ? input.selectedAccountIds : []).forEach(function(value) { var id = numericId(value); if (id && selected.indexOf(id) < 0) selected.push(id); });
    (Array.isArray(input.statistics) ? input.statistics : []).forEach(function(stat) {
      if (!object(stat)) return;
      var id = numericId(stat.avitoUserId);
      if (!id) return;
      if (accountStats[id]) duplicateStats[id] = true;
      else accountStats[id] = stat;
    });
    function accountDay(stat, date) {
      if (!stat) return null;
      if (date === span.today && object(stat.today) && stat.today.available === true && stat.today.date === date) return stat.today;
      var history = stat.history;
      if (!object(history) || history.available !== true || history.dateTo !== span.today || !Array.isArray(history.days)) return null;
      var matching = history.days.filter(function(day) { return day && day.date === date; });
      return matching.length === 1 ? matching[0] : null;
    }
    days.forEach(function(day) {
      API_METRICS.forEach(function(key) {
        if (!selected.length) return;
        var sum = 0, known = true;
        selected.forEach(function(id) {
          var data = !duplicateStats[id] && accountDay(accountStats[id], day.date);
          var value = data && data[key];
          if (data && value === undefined && key === 'phones') value = data.contactsShowPhone;
          if (data && value === undefined && key === 'messages') value = data.contactsMessenger;
          value = metric(value);
          if (value === null) known = false;
          else sum += value;
        });
        day[key] = known && Number.isFinite(sum) && sum <= Number.MAX_SAFE_INTEGER ? sum : null;
      });
      day.cpl = ratio(day.spending, day.contacts);
      day.cpv = ratio(day.spending, day.views);
    });
    if (!selected.length) warn('Выберите рекламные Avito-аккаунты: клиентские аккаунты не включаются автоматически.');
    else if (days.some(function(day) { return API_METRICS.some(function(key) { return day[key] === null; }); })) warn('Часть статистики Avito недоступна или устарела; пропуски не заменяются нулём.');
    if (selected.some(function(id) { return duplicateStats[id]; })) warn('Получено несколько снимков одного Avito-аккаунта; повторные данные не суммируются.');
    var totals = {};
    METRICS.forEach(function(key) {
      if (key === 'cpl' || key === 'cpv') return;
      totals[key] = days.every(function(day) { return day[key] !== null; }) ? days.reduce(function(sum, day) { return sum + day[key]; }, 0) : null;
    });
    totals.cpl = ratio(totals.spending, totals.contacts);
    totals.cpv = ratio(totals.spending, totals.views);
    return { range: span, days: days, today: Object.assign({}, days[days.length - 1]), month: totals, sources: Object.keys(sources).map(function(id) { return sources[id]; }), sourceAccounts: sourceAccounts, warnings: Object.keys(warningSet) };
  }
  var api = { range: range, readSources: readSources, compute: compute };
  root.AVITOLOG_ADS_FUNNEL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
