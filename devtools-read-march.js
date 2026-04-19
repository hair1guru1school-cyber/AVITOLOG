// === ВСТАВЬ В КОНСОЛЬ БРАУЗЕРА (F12 → Console) когда открыт сайт: ===
// https://hair1guru1school-cyber.github.io/AVITOLOG/index.html?u=sasha
// =====================================================================

(function() {
  var results = {};
  var marchKeys = [];
  var allGoalsKeys = [];

  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (!k) continue;

    // Все ключи с целями
    if (k.indexOf('avitolog_goals') === 0 || k.indexOf('avitolog_assets') === 0 || k.indexOf('crm_ads_expenses') === 0) {
      try {
        var v = localStorage.getItem(k);
        var parsed = JSON.parse(v || 'null');
        var count = parsed && Array.isArray(parsed.projects) ? parsed.projects.length :
                    Array.isArray(parsed) ? parsed.length : '?';
        allGoalsKeys.push({ key: k, count: count, raw: v ? v.substring(0, 100) : '' });
        results[k] = v;

        if (k.indexOf('2026-03') >= 0) marchKeys.push(k);
      } catch(e) {}
    }
  }

  console.group('%c📊 AVITOLOG — Все ключи данных', 'color:#35d0ff;font-size:16px;font-weight:bold');
  console.table(allGoalsKeys.map(function(x) { return { key: x.key, записей: x.count }; }));

  console.group('%c📁 Ключи за МАРТ 2026', 'color:#ffa500;font-size:14px;font-weight:bold');
  if (marchKeys.length === 0) {
    console.log('%c❌ Мартовских ключей не найдено', 'color:#ff6b6b');
  } else {
    marchKeys.forEach(function(k) {
      var v = localStorage.getItem(k);
      var parsed;
      try { parsed = JSON.parse(v); } catch(e) {}
      console.group('%c' + k, 'color:#35d0ff');
      if (parsed && parsed.projects) {
        console.log('Проектов/сделок:', parsed.projects.length);
        if (parsed.projects.length > 0) {
          console.table(parsed.projects.map(function(p) {
            return {
              name: p.name,
              price: p.mainPrice || p.saleAmount,
              week: p.weekIndex,
              stage: p.stage,
              date: p.date,
              status: (p.status || []).join(', ')
            };
          }));
        }
      } else if (Array.isArray(parsed)) {
        console.log('Записей:', parsed.length);
        console.table(parsed.map(function(p) {
          return { name: p.name, paid: p.paid, expected: p.expected, date: p.paymentDate || p.startDate };
        }));
      } else {
        console.log('Raw:', v ? v.substring(0, 500) : 'ПУСТО');
      }
      console.groupEnd();
    });
  }
  console.groupEnd();

  // Скачиваем JSON со всеми данными
  var blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'avitolog-all-data-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { a.remove(); URL.revokeObjectURL(a.href); }, 1000);

  console.log('%c✅ JSON файл скачан на компьютер', 'color:#00d97e;font-weight:bold');
  console.groupEnd();

  return results;
})();
