(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvitoChatSocials = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var reservedVk = /^(?:id0|im|feed|friends|groups|join|login|auth|away(?:\.php)?|search|share(?:\.php)?|settings|cc|apps|support|help|about|terms|privacy|music|(?:wall|videos?|clips?|photos?|docs?|topic|albums?|stor(?:y|ies)|market|product|app|write|board|page|audios?)(?:[-\d_].*)?|(?:club|public|event)\d+)$/i;
  var reservedTelegram = /^(?:share|proxy|socks|addstickers|addemoji|joinchat|login|confirmphone|iv|s|c|boost|giftcode|contact|contacts|account|username|nickname|telegram|message|please|hello|thanks|thankyou|https)$/i;
  var telegramLabel = '(?:t[ .]*g|telegram|\u0442\u0435\u043b\u0435\u0433\u0440\u0430\u043c(?:\u043c)?(?:\u0435|\u0430|\u0443)?|\u0442\u0435\u043b\u0435\u0433\u0430|\u0442\u0433)';

  function text(value) { return value == null ? '' : String(value); }
  function unique(values) { return values.filter(function (value, index) { return values.indexOf(value) === index; }); }
  function trimUrl(value) { return value.replace(/[.,!?;:)\]}\u2026]+$/g, ''); }
  function urls(value, hosts, accept) {
    var input = text(value), result = [], match;
    var pattern = new RegExp('(?:https?:\\/\\/)?(?:' + hosts + ')\\/[^\\s<>"\u0027`]+', 'gi');
    while ((match = pattern.exec(input))) {
      if (/[A-Za-z0-9_@.\/-]/.test(input.charAt(match.index - 1))) continue;
      try {
        var parsed = new URL(/^https?:\/\//i.test(match[0]) ? trimUrl(match[0]) : 'https://' + trimUrl(match[0]));
        var accepted = accept(parsed);
        if (accepted) result.push(accepted);
      } catch (_) {}
    }
    return unique(result);
  }
  function extractVk(value) {
    return urls(value, '(?:(?:m|www)\\.)?(?:vk\\.com|vk\\.ru|vkontakte\\.ru)', function (url) {
      if (!/^(?:(?:m|www)\.)?(?:vk\.com|vk\.ru|vkontakte\.ru)$/i.test(url.hostname) || url.username || url.password) return '';
      if (/^(?:wall|videos?|clips?|photos?|docs?|topic|albums?|stor(?:y|ies)|market|product|board|page|audios?)(?:[-\d_/]|$)/i.test(url.searchParams.get('w') || '') || /^(?:wall|videos?|clips?|photos?|docs?|topic|albums?|stor(?:y|ies)|market|product|board|page|audios?)(?:[-\d_/]|$)/i.test(url.searchParams.get('z') || '')) return '';
      var route = url.pathname.match(/^\/([A-Za-z0-9_][A-Za-z0-9_.]{1,63})\/?$/);
      if (!route || reservedVk.test(route[1])) return '';
      return 'https://vk.com/' + route[1].toLowerCase();
    });
  }
  function telegramUsername(value) {
    var username = text(value).replace(/^@/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) || reservedTelegram.test(username) || /bot$/i.test(username)) return '';
    return '@' + username.toLowerCase();
  }
  function extractTelegram(value, options) {
    var input = text(value), result = urls(input, '(?:t\\.me|telegram\\.me)', function (url) {
      if (!/^(?:t\.me|telegram\.me)$/i.test(url.hostname) || url.username || url.password) return '';
      var route = url.pathname.match(/^\/([A-Za-z][A-Za-z0-9_]{4,31})\/?$/);
      return route ? telegramUsername(route[1]) : '';
    });
    // Remove URLs and email addresses before examining mentions or plain nicknames.
    var prose = input.replace(/(?:https?:\/\/|www\.)\S+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|(?:t\.me|telegram\.me|(?:m\.)?vk\.(?:com|ru)|vkontakte\.ru)\/\S+|\[(?:id|club|public|event)\d+\|[^\]\r\n]+\]/gi, ' ');
    prose = prose.replace(/(?:^|[^A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\d_])(?:instagram|insta|\u0438\u043d\u0441\u0442\u0430\u0433\u0440\u0430\u043c|\u0438\u043d\u0441\u0442\u0430|\u0432\u043a|\u0432\u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0435|vk|vkontakte|email|e-mail|\u043f\u043e\u0447\u0442\u0430)\s*[:=-]?\s*@[A-Za-z][A-Za-z0-9_]{4,31}(?![A-Za-z0-9_])/gi, ' ');
    var mentions = /(^|[^A-Za-z0-9_.%+\/-])@([A-Za-z][A-Za-z0-9_]{4,31})(?![A-Za-z0-9_]|\.[A-Za-z])/g, match;
    while ((match = mentions.exec(prose))) {
      var mention = telegramUsername(match[2]);
      if (mention) result.push(mention);
    }
    var labelled = new RegExp('(?:^|[^A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\\d_])' + telegramLabel + '(?![A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\\d_])\\s*(?:(?:is|my|\u043c\u043e\u0439|\u043d\u0438\u043a|username|\u043b\u043e\u0433\u0438\u043d|\u044e\u0437\u0435\u0440\u043d\u0435\u0439\u043c)\\s*)*[:=@\u2014\u2013-]?\\s*@?([A-Za-z][A-Za-z0-9_]{4,31})(?![A-Za-z0-9_]|\\.[A-Za-z])', 'gi');
    while ((match = labelled.exec(prose))) {
      var labelledName = telegramUsername(match[1]);
      if (labelledName) result.push(labelledName);
    }
    var standalone = prose.trim().replace(/[.!;,]+$/, '');
    var bare = telegramUsername(standalone);
    if (bare && (options && options.telegramContext || /_/.test(standalone) || /[A-Za-z]/.test(standalone) && /\d/.test(standalone))) result.push(bare);
    return unique(result);
  }
  function isTelegramRequest(message, account, current) {
    var elapsed = Number(current.created) - Number(message && message.created);
    if (!message || message.direction !== 'out' || message.type !== 'text' || text(message.author_id) !== text(account.avito_user_id) || !isFinite(elapsed) || elapsed < 0 || elapsed > 900) return false;
    var value = text(message.text);
    return new RegExp('(?:^|[^A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\\d_])' + telegramLabel + '(?![A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451\\d_])', 'i').test(value) && /\?|username|handle|\u043d\u0438\u043a|\u043b\u043e\u0433\u0438\u043d|\u043f\u0440\u0438\u0448\u043b|\u043d\u0430\u043f\u0438\u0448|\u0434\u0430\u0439\u0442\u0435|\u0441\u043a\u0438\u043d|\u043a\u0430\u043a\u043e\u0439|\u0432\u0430\u0448/i.test(value);
  }
  function contactsFromMessages(list, account, counterpartyId) {
    var result = {};
    if (!account || !/^[1-9]\d{0,24}$/.test(text(account.avito_user_id))) return result;
    var ordered = (Array.isArray(list) ? list : []).filter(Boolean).slice().sort(function (a, b) { return (Number(b.created) || 0) - (Number(a.created) || 0); });
    for (var i = 0; i < ordered.length; i++) {
      var message = ordered[i];
      if (message.direction !== 'in' || message.type !== 'text' || !message.id || !/^[1-9]\d{0,24}$/.test(text(message.author_id)) || text(message.author_id) === text(account.avito_user_id) || counterpartyId && text(message.author_id) !== text(counterpartyId)) continue;
      var telegramContext = ordered.some(function (prior) { return isTelegramRequest(prior, account, message); });
      var candidates = { vk: extractVk(message.text), telegram: extractTelegram(message.text, { telegramContext: telegramContext }) };
      Object.keys(candidates).forEach(function (field) {
        if (!result[field] && candidates[field].length === 1) result[field] = { value: candidates[field][0], messageId: text(message.id), authorId: text(message.author_id) };
      });
      if (result.vk && result.telegram) break;
    }
    return result;
  }
  return { extractVk: extractVk, extractTelegram: extractTelegram, contactsFromMessages: contactsFromMessages };
});
