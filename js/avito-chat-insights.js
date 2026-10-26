(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvitoChatInsights = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function text(value) { return value == null ? '' : String(value); }
  function blank(value) { return !text(value).trim(); }
  function normalized(value) { return text(value).toLowerCase().replace(/\u0451/g, '\u0435').replace(/[^a-z\u0430-\u044f0-9]+/g, ' ').trim(); }
  function identity(value) { return /^[1-9]\d{0,24}$/.test(text(value)) ? text(value) : ''; }
  function clean(value, maximum) {
    var out = text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().replace(/^(?:[-\u2013\u2014\u2022*]\s*|\d+[.)]\s+)/, '').replace(/[;,.\s]+$/, '');
    if (!out || out.length > maximum || /https?:\/\/|www\.|[<>]|\b(?:system|prompt|password|api[_ -]?key)\b|\u0438\u0433\u043d\u043e\u0440\u0438\u0440\u0443\u0439|\u043f\u0435\u0440\u0435\u0437\u0430\u043f\u0438\u0448\u0438|\u0443\u0434\u0430\u043b\u0438|\u043f\u0430\u0440\u043e\u043b\u044c/i.test(out)) return '';
    return /[a-z\u0430-\u044f\u0451]/i.test(out) ? out : '';
  }
  function add(list, value, source, limit) {
    if (!value || list.length >= (limit || 20) || list.some(function (item) { return normalized(item.value) === normalized(value); })) return;
    list.push(Object.assign({ value: value }, source || {}));
  }
  function emptyFacts() { return { positions: [], cities: [], legalTypes: [] }; }
  function incoming(message, account, counterpartyId) {
    return message && message.direction === 'in' && message.type === 'text' && message.id && identity(message.author_id) &&
      text(message.author_id) !== text(account.avito_user_id) && (!counterpartyId || text(message.author_id) === text(counterpartyId));
  }
  function sourceFor(message) { return { messageId: text(message.id).slice(0, 200), authorId: text(message.author_id), source: 'chat' }; }
  function splitValues(value) { return text(value).split(/\s*[,;\n]\s*/).map(function (part) { return clean(part, 240); }).filter(Boolean); }
  function positionLines(value) {
    var lines = text(value).replace(/\r\n?/g, '\n').split('\n'), result = [];
    var label = /^(?:(?:\u043d\u0430\u0448\u0438|\u043c\u043e\u0438)\s+)?(?:\u0443\u0441\u043b\u0443\u0433\u0438|\u0442\u043e\u0432\u0430\u0440\u044b|\u043f\u043e\u0437\u0438\u0446\u0438\u0438(?:\s+(?:\u0442\u043e\u0432\u0430\u0440\u043e\u0432|\u0443\u0441\u043b\u0443\u0433))?|\u0430\u0441\u0441\u043e\u0440\u0442\u0438\u043c\u0435\u043d\u0442|\u0432\u0438\u0434\u044b\s+\u0443\u0441\u043b\u0443\u0433)\s*[:\u2014\u2013-]\s*(.*)$/i;
    var declaration = /^(?:(?:\u043c\u044b|\u044f)\s+)?(?:\u0437\u0430\u043d\u0438\u043c\u0430(?:\u0435\u043c\u0441\u044f|\u044e\u0441\u044c)|\u043f\u0440\u043e\u0434\u0430(?:\u0451\u043c|\u0435\u043c|\u044e)|\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u043c|\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0436\u0443|\u043e\u043a\u0430\u0437\u044b\u0432\u0430(?:\u0435\u043c|\u044e)\s+\u0443\u0441\u043b\u0443\u0433\u0438)\s+(.+)$/i;
    for (var i = 0; i < lines.length && result.length < 20; i++) {
      var line = lines[i].trim(), match = label.exec(line), declarative = !match && declaration.exec(line);
      if (/\?/.test(line) || line.length > 1000 || (!match && !declarative)) continue;
      var body = match ? match[1] : declarative[1];
      if (body.trim()) result = result.concat(splitValues(body));
      else for (var j = i + 1; j < lines.length && j <= i + 12; j++) {
        if (!/^\s*(?:[-\u2022*]|\d+[.)])\s+/.test(lines[j])) break;
        result = result.concat(splitValues(lines[j]));
      }
    }
    return result.slice(0, 20);
  }
  function cityValues(value) {
    var match = /(?:^|\n)\s*(?:(?:\u043d\u0430\u0448|\u043e\u0441\u043d\u043e\u0432\u043d\u043e\u0439)\s+)?(?:\u0433\u043e\u0440\u043e\u0434\u0430?|\u0433\u0435\u043e(?:\u0433\u0440\u0430\u0444\u0438\u044f)?)\s*[:\u2014\u2013-]\s*([^\n?]+)/ig, found = [], item;
    while ((item = match.exec(text(value)))) found = found.concat(splitValues(item[1]));
    return found.filter(function (city) { return city.length <= 120 && !/\d|@/.test(city); }).slice(0, 12);
  }
  function legalValues(value) {
    var out = [], pattern = /(?:^|[^\u0410-\u042f\u0430-\u044f\u0401\u0451A-Za-z\d_])(\u0418\u041f|\u041e\u041e\u041e)(?=$|[^\u0410-\u042f\u0430-\u044f\u0401\u0451A-Za-z\d_])/gi, match;
    while ((match = pattern.exec(text(value)))) if (out.indexOf(match[1].toUpperCase()) < 0) out.push(match[1].toUpperCase());
    return out;
  }
  function extractFacts(list, account, counterpartyId, options) {
    var result = emptyFacts(), settings = options || {};
    if (!account || !identity(account.avito_user_id)) return result;
    var ordered = (Array.isArray(list) ? list : []).filter(Boolean).slice().sort(function (a, b) { return (Number(b.created) || 0) - (Number(a.created) || 0); });
    ordered.slice(0, 100).forEach(function (message) {
      if (!incoming(message, account, counterpartyId) || text(message.text).length > 10000) return;
      var source = sourceFor(message);
      if (settings.autoChatPositions === true) positionLines(message.text).forEach(function (value) { add(result.positions, value, source); });
      if (settings.autoAccountDetails === true) {
        cityValues(message.text).forEach(function (value) { add(result.cities, value, source, 12); });
        var declaration = /(?:^|\n)\s*(?:(?:\u043c\u044b|\u044f|\u043d\u0430\u0448\u0430\s+\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f|\u043c\u043e\u044f\s+\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f|\u0440\u0430\u0431\u043e\u0442\u0430\u0435\u043c\s+\u043a\u0430\u043a)\s*[:\u2014\u2013-]?\s*)?(\u0418\u041f|\u041e\u041e\u041e)(?:\s|[\u00ab\u0022])/gi, match;
        while ((match = declaration.exec(text(message.text)))) {
          var line = text(message.text).slice(match.index).split('\n')[0];
          if (!/\?|\u0438\u043b\u0438|\u043b\u0438\u0431\u043e/i.test(line)) add(result.legalTypes, match[1].toUpperCase(), source, 2);
        }
      }
    });
    return result;
  }
  function cityFromMetadata(value) {
    var candidate = value && typeof value === 'object' ? value.name : value;
    var cleaned = clean(candidate, 120);
    return cleaned && !/\d|@/.test(cleaned) ? cleaned : '';
  }
  function extractAccountFacts(profile, advertisements, ownerId) {
    var result = emptyFacts(), id = identity(ownerId);
    if (!id || !profile || identity(profile.id) !== id) return result;
    var source = { source: 'account', ownerId: id };
    var forms = legalValues([profile.name, profile.company_name, profile.legal_form].map(text).join(' '));
    forms.forEach(function (value) { add(result.legalTypes, value, source, 2); });
    add(result.cities, cityFromMetadata(profile.city), source, 12);
    (Array.isArray(advertisements) ? advertisements : []).slice(0, 1000).forEach(function (ad) {
      if (!ad || identity(ad.owner_id || ad.user_id || ad.owner && ad.owner.id) !== id) return;
      var evidence = Object.assign({}, source, { itemId: text(ad.id) });
      add(result.cities, cityFromMetadata(ad.city || ad.address && ad.address.city || ad.location && ad.location.city), evidence, 12);
    });
    return result;
  }
  function extractNameFacts(value) {
    var result = emptyFacts();
    legalValues(value).forEach(function (form) { add(result.legalTypes, form, { source: 'client_name' }, 2); });
    return result;
  }
  function values(facts, field) {
    var out = [];
    (facts && Array.isArray(facts[field]) ? facts[field] : []).forEach(function (entry) { add(out, clean(entry && entry.value, field === 'positions' ? 240 : 120), null, field === 'positions' ? 20 : 12); });
    return out.map(function (item) { return item.value; });
  }
  function buildPatch(client, facts) {
    client = client || {};
    var patch = {}, positions = values(facts, 'positions'), cities = values(facts, 'cities'), forms = values(facts, 'legalTypes').filter(function (value) { return value === '\u0418\u041f' || value === '\u041e\u041e\u041e'; });
    if (positions.length && blank(client.positions)) patch.positions = positions.join(', ');
    if (cities.length && blank(client.city) && blank(client.geo) && blank(client.geography)) patch.city = cities.join(', ');
    if (forms.length === 1 && blank(client.client_type) && blank(client.clientType)) patch.client_type = forms[0];
    var notes = text(client.notes), haystack = normalized(notes), fresh = positions.filter(function (position) { return haystack.indexOf(normalized(position)) < 0; });
    if (fresh.length) {
      var appended = notes + (notes && !/\n$/.test(notes) ? '\n' : '') + '\u0418\u0437 \u0447\u0430\u0442\u0430 \u00b7 \u041f\u043e\u0437\u0438\u0446\u0438\u0438: ' + fresh.join('; ');
      if (appended.length <= 20000) patch.notes = appended;
    }
    return patch;
  }
  return { extractFacts: extractFacts, extractAccountFacts: extractAccountFacts, extractNameFacts: extractNameFacts, buildPatch: buildPatch };
});
