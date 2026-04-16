/**
 * ADS page: expenses, links, API panel
 */
(function() {
  "use strict";

  var EXPENSES_KEY = "crm_ads_expenses_v1";
  var POSTS_PLAN_KEY = "crm_ads_posts_plan_v1";
  var POSTS_SOURCE_KEY = "crm_ads_posts_source_v1";
  var LINKS_KEY = "crm_ads_links_v1";
  var POSTS_SYNC_QUEUE_KEY = "crm_ads_posts_sync_queue_v1";
  var POSTS_SHEET_ID = "1q_2TJHIhFW1KjjjIjpxfGc_1zewpdPhrwXQ6awhVdwA";
  var POSTS_SHEET_LEARN = "Обучение";
  var POSTS_SHEET_AGENCY = "Агенство";
  var AVITO_KEY_LS = "crm_ads_avito_api_key_v1";
  var AVITO_CLIENT_ID_LS = "crm_ads_avito_client_id_v1";
  var AVITO_CLIENT_SECRET_LS = "crm_ads_avito_client_secret_v1";
  var AVITO_BASE_LS = "crm_ads_avito_backend_base_v1";
  var AVITO_PATH_LS = "crm_ads_avito_path_v1";

  var ROW_KEYS = ["main", "new", "both"];
  var ROW_LABELS = { main: "Основной", new: "Новый", both: "Оба" };
  var POST_ROWS = [
    { key: "learn", label: "Обучение" },
    { key: "agency", label: "Агентство" }
  ];
  var _adsPostEditorCleanup = null;
  var _adsPostSourceEditorCleanup = null;
  var _adsPostSourceModalCleanup = null;
  var _postsSheetInitCache = {};

  var ADS_MONTH_NAMES = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  var _adsViewMonth = null;
  var ADS_EXPENSES_MONTH_PREFIX = "crm_ads_expenses_month_";
  var ADS_LAST_MONTH_MARKER = "crm_ads_last_month_v2";

  function adsCurrentMonthKey() {
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0");
  }
  function adsExpensesMonthKey(ym) { return ADS_EXPENSES_MONTH_PREFIX + ym; }
  function adsSnapshotCurrentMonth() {
    try {
      var state = loadExpenses();
      localStorage.setItem(adsExpensesMonthKey(adsCurrentMonthKey()), JSON.stringify(state));
    } catch(e) {}
  }
  function adsLoadMonthSnapshot(ym) {
    try {
      var raw = localStorage.getItem(adsExpensesMonthKey(ym));
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
  }
  function adsFillMonthRange(monthsObj) {
    var keys = Object.keys(monthsObj).sort();
    if (keys.length < 1) return;
    var first = keys[0].split("-");
    var last = keys[keys.length - 1].split("-");
    var y = parseInt(first[0], 10), m = parseInt(first[1], 10);
    var ly = parseInt(last[0], 10), lm = parseInt(last[1], 10);
    while (y < ly || (y === ly && m <= lm)) {
      monthsObj[y + "-" + String(m).padStart(2, "0")] = true;
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  function adsGetAvailableMonths() {
    var months = {};
    var prefix = ADS_EXPENSES_MONTH_PREFIX;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        var ym = k.substring(prefix.length);
        if (/^\d{4}-\d{2}$/.test(ym)) months[ym] = true;
      }
    }
    var cur = adsCurrentMonthKey();
    months[cur] = true;
    var cp = cur.split("-");
    var py = parseInt(cp[0], 10), pm = parseInt(cp[1], 10) - 1;
    if (pm < 1) { pm = 12; py--; }
    months[py + "-" + String(pm).padStart(2, "0")] = true;
    adsFillMonthRange(months);
    return Object.keys(months).sort();
  }
  function adsShiftMonth(dir) {
    var months = adsGetAvailableMonths();
    var cur = _adsViewMonth || adsCurrentMonthKey();
    var idx = months.indexOf(cur);
    if (idx < 0) idx = months.length - 1;
    var next = idx + dir;
    if (next < 0) next = 0;
    if (next >= months.length) next = months.length - 1;
    _adsViewMonth = months[next] === adsCurrentMonthKey() ? null : months[next];
    if (typeof window.__showAdsPage === "function") {
      var mc = document.getElementById("mainContent");
      if (mc) window.__showAdsPage(mc);
    }
  }
  function adsFormatMonthLabel(ym) {
    var parts = ym.split("-");
    var mi = parseInt(parts[1], 10) - 1;
    return (ADS_MONTH_NAMES[mi] || "") + " " + parts[0];
  }
  function adsGetPrevMonthKey(ym) {
    var cp = ym.split("-");
    var py = parseInt(cp[0], 10), pm = parseInt(cp[1], 10) - 1;
    if (pm < 1) { pm = 12; py--; }
    return py + "-" + String(pm).padStart(2, "0");
  }
  function adsClearExpensesForNewMonth() {
    var now = new Date();
    saveExpenses({ data: {}, year: String(now.getFullYear()), month: String(now.getMonth() + 1) });
  }
  function adsCheckMonthTransition() {
    var currentYM = adsCurrentMonthKey();
    var lastYM = "";
    try { lastYM = localStorage.getItem(ADS_LAST_MONTH_MARKER) || ""; } catch(e) {}
    if (lastYM === currentYM) return;
    // First-time marker init (e.g. after marker key rename): never clear data
    if (!lastYM) {
      try { localStorage.setItem(ADS_LAST_MONTH_MARKER, currentYM); } catch(e) {}
      adsSnapshotCurrentMonth();
      return;
    }
    // Real month rollover
    if (lastYM < currentYM) {
      var prevYM = adsGetPrevMonthKey(currentYM);
      var hasPrevSnap = !!localStorage.getItem(adsExpensesMonthKey(prevYM));
      var currentState = loadExpenses();
      var hasData = Object.keys(currentState.data || {}).some(function(k) {
        return parseNum(currentState.data[k]) !== 0;
      });
      if (hasData && !hasPrevSnap) {
        try { localStorage.setItem(adsExpensesMonthKey(prevYM), JSON.stringify(currentState)); } catch(e) {}
        adsClearExpensesForNewMonth();
      } else {
        adsSnapshotCurrentMonth();
        adsClearExpensesForNewMonth();
      }
    }
    try { localStorage.setItem(ADS_LAST_MONTH_MARKER, currentYM); } catch(e) {}
    adsSnapshotCurrentMonth();
  }
  // Recovery flags
  var ADS_RECOVER_FLAG   = "crm_ads_recover_misarchive_v1";   // old flag (ran, may have moved wrong data)
  var ADS_RECOVER_FLAG2  = "crm_ads_recover_misarchive_v2";   // new flag: safe recovery already evaluated
  var ADS_UNDO_DONE_FLAG = "crm_ads_recover_undo_done_v1";    // undo was applied

  function adsExpensesTotal(cells) {
    return Object.keys(cells || {}).reduce(function(s, k) { return s + parseNum(cells[k]); }, 0);
  }

  // Undo the first (wrong) recovery that moved March data into April.
  // Called automatically once when the old v1 flag is present.
  function adsMaybeUndoWrongRecovery() {
    try {
      if (localStorage.getItem(ADS_UNDO_DONE_FLAG) === "1") return false;
      if (localStorage.getItem(ADS_RECOVER_FLAG) !== "1") return false; // old recovery never ran
      var currentYM = adsCurrentMonthKey();
      var prevYM = adsGetPrevMonthKey(currentYM);
      var currentState = loadExpenses();
      var hasCurrentData = adsExpensesTotal(currentState.data) !== 0;
      if (!hasCurrentData) {
        // Nothing to undo — April is already empty
        localStorage.setItem(ADS_UNDO_DONE_FLAG, "1");
        return false;
      }
      // Move what's in April back to the previous month archive (without overwriting April snapshot)
      var prevKey = adsExpensesMonthKey(prevYM);
      var prevParts = prevYM.split("-");
      try {
        localStorage.setItem(prevKey, JSON.stringify({
          data: currentState.data,
          year: prevParts[0],
          month: String(parseInt(prevParts[1], 10))
        }));
      } catch(e) {}
      // Clear April live key only — do NOT call saveExpenses (it would also nuke the month snapshot)
      try {
        var cp = currentYM.split("-");
        localStorage.setItem(EXPENSES_KEY, JSON.stringify({ y: cp[0], m: String(parseInt(cp[1], 10)), cells: {} }));
      } catch(e) {}
      localStorage.setItem(ADS_UNDO_DONE_FLAG, "1");
      return true; // signals caller to show "April cleared" notice
    } catch(e) {}
    return false;
  }

  // Safe one-time recovery (v2): only runs when v2 flag is absent AND undo-done flag is present
  // (meaning the undo ran → April is empty → now try to load the real April snapshot if it exists)
  function adsMaybeSafeRecover() {
    try {
      if (localStorage.getItem(ADS_RECOVER_FLAG2) === "1") return;
      if (localStorage.getItem(ADS_UNDO_DONE_FLAG) !== "1") return; // wait for undo first
      var currentYM = adsCurrentMonthKey();
      // Check current month's own snapshot — it may have been saved before the bug hit
      var snapKey = adsExpensesMonthKey(currentYM);
      var snapRaw = localStorage.getItem(snapKey);
      if (snapRaw) {
        var snap;
        try { snap = JSON.parse(snapRaw); } catch(e) { snap = null; }
        var snapTotal = snap ? adsExpensesTotal(snap.data) : 0;
        if (snapTotal !== 0) {
          // Restore live key from this snapshot (snapshot key stays intact)
          var cp = currentYM.split("-");
          try {
            localStorage.setItem(EXPENSES_KEY, JSON.stringify({ y: cp[0], m: String(parseInt(cp[1], 10)), cells: snap.data || {} }));
          } catch(e) {}
          localStorage.setItem(ADS_RECOVER_FLAG2, "1");
          return;
        }
      }
      localStorage.setItem(ADS_RECOVER_FLAG2, "1");
    } catch(e) {}
  }

  // Expose a console diagnostic so the real totals from every ads key are visible
  window.__adsDiagnose = function() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("crm_ads_expenses") !== 0) continue;
        try {
          var raw = localStorage.getItem(k) || "";
          var obj = JSON.parse(raw);
          var cells = obj.cells || obj.data || {};
          var total = adsExpensesTotal(cells);
          out[k] = "total=" + total + " cells=" + Object.keys(cells).length;
        } catch(e2) { out[k] = "parse-error"; }
      }
    } catch(e) {}
    console.table(out);
    return out;
  };

  function adsMaybeRecoverMisarchivedData() {
    var undid = adsMaybeUndoWrongRecovery();
    if (!undid) adsMaybeSafeRecover();
  }
  window.__adsMonthPrev = function() { adsShiftMonth(-1); };
  window.__adsMonthNext = function() { adsShiftMonth(1); };

  var DEFAULT_LINKS = [
    { id: "channel_clients", category: "telegram", icon: "📣", label: "Канал для клиентов", url: "", snippet: "", avatar: "" },
    { id: "bot_clients", category: "telegram", icon: "🤖", label: "Бот для клиентов", url: "", snippet: "", avatar: "" },
    { id: "channel_learn", category: "telegram", icon: "🎓", label: "Канал обучения", url: "", snippet: "", avatar: "" },
    { id: "channel_vk_blog", category: "vk", icon: "🟦", label: "Личный блог ВК", url: "https://vk.com/fil_the_bizz", snippet: "VK блог", avatar: "" },
    { id: "bot_learn", category: "telegram", icon: "🤖", label: "Бот обучения", url: "", snippet: "", avatar: "" },
    { id: "site", category: "sites", icon: "🌐", label: "Сайт агентства", url: "", snippet: "", avatar: "" },
    { id: "avito1", category: "avito", icon: "🛒", label: "Авито аккаунт 1", url: "", snippet: "", avatar: "" },
    { id: "avito2", category: "avito", icon: "🛒", label: "Авито аккаунт 2", url: "", snippet: "", avatar: "" }
  ];
  var LINKS_GROUPS = [
    { id: "telegram", title: "✈ Телеграмм", icon: "✈" },
    { id: "vk", title: "🟦 Вконтакте", icon: "🟦" },
    { id: "avito", title: "🛒 Авито", icon: "🛒" },
    { id: "sites", title: "🌐 Сайты", icon: "🌐" }
  ];

  function getCellKey(row, day) { return row + "_" + day; }

  function parseNum(val) {
    if (val == null || val === "") return 0;
    var n = parseFloat(String(val).replace(/\s/g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function formatNum(n) { return n === 0 ? "" : String(n); }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadExpenses() {
    try {
      var raw = localStorage.getItem(EXPENSES_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        return {
          data: data.cells || {},
          year: String(data.y || new Date().getFullYear()),
          month: String(data.m || (new Date().getMonth() + 1))
        };
      }
    } catch (e) {}
    var now = new Date();
    return { data: {}, year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
  }

  function saveExpenses(state) {
    try {
      localStorage.setItem(EXPENSES_KEY, JSON.stringify({
        y: state.year,
        m: state.month,
        cells: state.data
      }));
      localStorage.setItem(adsExpensesMonthKey(adsCurrentMonthKey()), JSON.stringify(state));
    } catch (e) {}
  }

  function getPostCellKey(projectKey, day) {
    return projectKey + "_" + day;
  }
  function getPostsMonthMeta(offset) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1 + (Number(offset) || 0);
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    var id = String(y) + "-" + (m < 10 ? ("0" + m) : String(m));
    return { year: String(y), month: String(m), monthId: id, offset: Number(offset) || 0 };
  }
  function getPostsMonthTitle(meta) {
    var map = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
    var mm = parseInt(String(meta && meta.month || "1"), 10);
    var idx = isNaN(mm) ? 0 : Math.max(1, Math.min(12, mm)) - 1;
    var title = map[idx] || "месяц";
    return title + " " + String((meta && meta.year) || "");
  }
  function normalizePostCellStatus(status) {
    var s = String(status || "").trim().toLowerCase();
    if (s === "published") return "published";
    if (s === "queued") return "queued";
    return "";
  }
  function normalizePostCellData(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return {
        text: String(raw.text || ""),
        status: normalizePostCellStatus(raw.status)
      };
    }
    return {
      text: String(raw || ""),
      status: ""
    };
  }
  function stringifyPostCellForSheet(cellData) {
    var text = String((cellData && cellData.text) || "").trim();
    return text;
  }
  function hasPostCellContent(cellData) {
    var text = String((cellData && cellData.text) || "").trim();
    return !!text || !!(cellData && cellData.status);
  }
  function hasAnyPostsInState(postsState) {
    var data = postsState && postsState.data ? postsState.data : {};
    var keys = Object.keys(data || {});
    for (var i = 0; i < keys.length; i++) {
      var cell = normalizePostCellData(data[keys[i]]);
      if (hasPostCellContent(cell)) return true;
    }
    return false;
  }
  function savePostCellData(postsState, key, cellData) {
    var text = String((cellData && cellData.text) || "").trim();
    var status = normalizePostCellStatus(cellData && cellData.status);
    if (!text && !status) {
      delete postsState.data[key];
      return;
    }
    if (status && text) {
      postsState.data[key] = { text: text, status: status };
      return;
    }
    if (status) {
      postsState.data[key] = { text: "", status: status };
      return;
    }
    postsState.data[key] = text;
  }

  function loadPostsPlan(offset) {
    var meta = getPostsMonthMeta(offset);
    try {
      var raw = localStorage.getItem(POSTS_PLAN_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        var months = data && data.months && typeof data.months === "object" ? data.months : null;
        if (months) {
          return {
            data: months[meta.monthId] || {},
            year: meta.year,
            month: meta.month,
            monthId: meta.monthId,
            offset: meta.offset
          };
        }
        // Legacy format migration fallback.
        var legacyYear = String(data.y || new Date().getFullYear());
        var legacyMonth = String(data.m || (new Date().getMonth() + 1));
        var legacyId = legacyYear + "-" + (Number(legacyMonth) < 10 ? ("0" + Number(legacyMonth)) : String(Number(legacyMonth)));
        var legacyCells = data.cells || {};
        return {
          data: (legacyId === meta.monthId) ? legacyCells : {},
          year: meta.year,
          month: meta.month,
          monthId: meta.monthId,
          offset: meta.offset
        };
      }
    } catch (e) {}
    return { data: {}, year: meta.year, month: meta.month, monthId: meta.monthId, offset: meta.offset };
  }

  function savePostsPlan(state) {
    try {
      var parsed = {};
      try { parsed = JSON.parse(localStorage.getItem(POSTS_PLAN_KEY) || "{}") || {}; } catch (e0) { parsed = {}; }
      var months = parsed.months && typeof parsed.months === "object" ? parsed.months : {};
      // Legacy one-time migration if old payload exists.
      if ((!parsed.months || typeof parsed.months !== "object") && parsed.cells && typeof parsed.cells === "object") {
        var ly = String(parsed.y || new Date().getFullYear());
        var lmNum = Number(parsed.m || (new Date().getMonth() + 1));
        var lm = lmNum < 10 ? ("0" + lmNum) : String(lmNum);
        months[ly + "-" + lm] = parsed.cells;
      }
      months[String(state.monthId || getPostsMonthMeta(0).monthId)] = state.data || {};
      localStorage.setItem(POSTS_PLAN_KEY, JSON.stringify({
        y: state.year,
        m: state.month,
        cells: state.data || {},
        months: months
      }));
    } catch (e) {}
  }
  function loadPostsSources() {
    try {
      var raw = localStorage.getItem(POSTS_SOURCE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        return {
          data: data.cells || {},
          year: String(data.y || new Date().getFullYear()),
          month: String(data.m || (new Date().getMonth() + 1))
        };
      }
    } catch (e) {}
    var now = new Date();
    return { data: {}, year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
  }
  function savePostsSources(state) {
    try {
      localStorage.setItem(POSTS_SOURCE_KEY, JSON.stringify({
        y: state.year,
        m: state.month,
        cells: state.data
      }));
    } catch (e) {}
  }
  function loadPostsSyncQueue() {
    try {
      var raw = localStorage.getItem(POSTS_SYNC_QUEUE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function savePostsSyncQueue(arr) {
    try { localStorage.setItem(POSTS_SYNC_QUEUE_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
  }
  function enqueuePostSync(rowKey, day, value, status, monthOffset) {
    var mo = Number(monthOffset) || 0;
    var key = String(rowKey) + "_" + String(day) + "_" + String(mo);
    var q = loadPostsSyncQueue().filter(function(x) { return String(x && x.key) !== key; });
    q.push({
      key: key,
      rowKey: rowKey,
      day: Number(day),
      value: String(value || ""),
      status: normalizePostCellStatus(status),
      monthOffset: mo,
      at: Date.now()
    });
    savePostsSyncQueue(q);
    return q.length;
  }
  async function flushPendingPostsSyncQueue() {
    var q = loadPostsSyncQueue();
    if (!q.length) return 0;
    var token = await getGoogleAccessTokenForSheets();
    var remain = [];
    for (var i = 0; i < q.length; i++) {
      var item = q[i];
      try {
        await syncPostToGoogleSheets(item.rowKey, item.day, item.value, item.status, item.monthOffset, token);
      } catch (e) {
        remain.push(item);
      }
    }
    savePostsSyncQueue(remain);
    return q.length - remain.length;
  }

  function loadLinks() {
    try {
      var raw = localStorage.getItem(LINKS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          var byId = {};
          arr.forEach(function(item) { if (item && item.id) byId[item.id] = item; });
          var merged = DEFAULT_LINKS.map(function(def) {
            return Object.assign({}, def, byId[def.id] || {});
          });
          arr.forEach(function(item) {
            if (!item || !item.id) return;
            if (!merged.some(function(m) { return m.id === item.id; })) merged.push(item);
          });
          return merged.map(function(item) {
            var cp = Object.assign({}, item);
            cp.category = getLinksCategory(cp);
            return cp;
          });
        }
      }
    } catch (e) {}
    return DEFAULT_LINKS.map(function(x) {
      var cp = Object.assign({}, x);
      cp.category = getLinksCategory(cp);
      return cp;
    });
  }

  function saveLinks(links) {
    try { localStorage.setItem(LINKS_KEY, JSON.stringify(links)); } catch (e) {}
  }

  function isVkLinkText(txt) {
    var s = String(txt || "").toLowerCase();
    return s.indexOf("vk.com") >= 0 || s.indexOf("vkontakte") >= 0 || s.indexOf("вк") >= 0 || s.indexOf("вконт") >= 0 || s.indexOf("vk_") >= 0;
  }

  function isTelegramLinkText(txt) {
    var s = String(txt || "").toLowerCase();
    return s.indexOf("t.me") >= 0 || s.indexOf("telegram.me") >= 0 || s.indexOf("telegram") >= 0 || s.indexOf("телеграм") >= 0 || s.indexOf("канал") >= 0 || s.indexOf("бот") >= 0;
  }

  function getTodayDayForState(state) {
    var now = new Date();
    if (!state) return 0;
    if (String(state.year) !== String(now.getFullYear())) return 0;
    if (String(state.month) !== String(now.getMonth() + 1)) return 0;
    return now.getDate();
  }
  function getPostDayMonthLabel(state, day) {
    var d = Math.max(1, Number(day) || 1);
    var m = Math.max(1, Math.min(12, Number(state && state.month) || 1));
    var dd = d < 10 ? ("0" + d) : String(d);
    var mm = m < 10 ? ("0" + m) : String(m);
    return dd + "." + mm;
  }
  function autoScrollPostsTableToToday(container) {
    if (!container) return;
    var wraps = container.querySelectorAll(".ads-posts-wrap");
    if (!wraps.length) return;
    var todayTh = wraps[0].querySelector("th.ads-th-day.ads-day-today");
    if (!todayTh) return;
    var desired = Math.max(0, todayTh.offsetLeft - 72);
    wraps.forEach(function(w) { w.scrollLeft = desired; });
  }

  function bindPostsScrollSync(container) {
    var wraps = container.querySelectorAll(".ads-posts-wrap");
    if (wraps.length < 2) return;
    var syncing = false;
    wraps.forEach(function(w) {
      w.addEventListener("scroll", function() {
        if (syncing) return;
        syncing = true;
        var left = w.scrollLeft;
        wraps.forEach(function(other) {
          if (other !== w) other.scrollLeft = left;
        });
        syncing = false;
      });
    });
  }

  function recomputeBothRow(state) {
    for (var d = 1; d <= 31; d++) {
      var m = parseNum(state.data[getCellKey("main", d)]);
      var n = parseNum(state.data[getCellKey("new", d)]);
      state.data[getCellKey("both", d)] = (m + n) || null;
    }
  }

  function computeTotals(state) {
    recomputeBothRow(state);
    var totals = { main: 0, new: 0, both: 0 };
    ROW_KEYS.forEach(function(rowKey) {
      for (var d = 1; d <= 31; d++) totals[rowKey] += parseNum(state.data[getCellKey(rowKey, d)]);
    });
    totals.all = totals.both;
    return totals;
  }

  function updateTotalsPanel(container, state) {
    var t = computeTotals(state);
    container.innerHTML =
      '<div class="ads-totals-title">Итоги</div>' +
      '<div class="ads-total-row"><span class="ads-total-label">Всего</span><span class="ads-total-val ads-total-all">' + (t.all ? t.all.toLocaleString("ru") : "0") + "</span></div>" +
      '<div class="ads-total-row"><span class="ads-total-label">Основной</span><span class="ads-total-val">' + (t.main ? t.main.toLocaleString("ru") : "0") + "</span></div>" +
      '<div class="ads-total-row"><span class="ads-total-label">Новый</span><span class="ads-total-val">' + (t.new ? t.new.toLocaleString("ru") : "0") + "</span></div>" +
      '<div class="ads-total-row"><span class="ads-total-label">Оба</span><span class="ads-total-val">' + (t.both ? t.both.toLocaleString("ru") : "0") + "</span></div>";
  }

  function updateTopSummary(container, state) {
    if (!container) return;
    var t = computeTotals(state);
    var fmt = function(n) { return n ? n.toLocaleString("ru") : "0"; };
    ["all", "main", "new", "both"].forEach(function(k) {
      var el = container.querySelector('[data-ads-val="' + k + '"]');
      if (el) el.textContent = fmt(t[k] || 0);
    });
  }

  function startCellAddMode(td, container, state, row, day, onChange) {
    var key = getCellKey(row, day);
    var baseVal = parseNum(state.data[key]);
    td.classList.add("ads-td-cell-editing");
    td.innerHTML =
      '<span class="ads-cell-base-val">' + (baseVal ? formatNum(baseVal) : "0") + "</span>" +
      '<span class="ads-cell-plus-sep">+</span>' +
      '<span class="ads-cell-inline-editor" contenteditable="true" inputmode="numeric"></span>';
    var editor = td.querySelector(".ads-cell-inline-editor");
    if (!editor) return;

    var close = function(apply) {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      td.classList.remove("ads-td-cell-editing");
      if (apply) {
        var raw = String(editor.textContent || "").trim();
        var addVal = parseNum(raw);
        if (raw && addVal !== 0) {
          state.data[key] = (baseVal + addVal) || null;
          recomputeBothRow(state);
          saveExpenses(state);
          renderExpensesTable(container, state, onChange);
          if (typeof onChange === "function") onChange();
          return;
        }
      }
      td.textContent = baseVal ? formatNum(baseVal) : "";
    };

    var onDocMouseDown = function(evt) {
      if (!td.contains(evt.target)) close(true);
    };

    editor.addEventListener("keydown", function(evt) {
      if (evt.key === "Enter") { evt.preventDefault(); close(true); }
      else if (evt.key === "Escape") { evt.preventDefault(); close(false); }
    });
    editor.addEventListener("blur", function() { close(true); });
    document.addEventListener("mousedown", onDocMouseDown, true);
    editor.focus();
  }

  function renderExpensesTable(container, state, onChange, readOnly) {
    recomputeBothRow(state);
    if (!readOnly) saveExpenses(state);
    var days = 31;
    var todayDay = readOnly ? 0 : getTodayDayForState(state);
    var html = '<div class="ads-expenses-wrap"><table class="ads-expenses-table"><thead><tr><th class="ads-th-label">Ряд</th>';
    for (var d = 1; d <= days; d++) {
      html += '<th class="ads-th-day' + (d === todayDay ? " ads-day-today" : "") + '">' + d + "</th>";
    }
    html += '<th class="ads-th-total">Итог</th></tr></thead><tbody>';
    ROW_KEYS.forEach(function(rowKey) {
      var total = 0;
      html += '<tr data-row="' + rowKey + '"><td class="ads-td-label">' + (ROW_LABELS[rowKey] || rowKey) + "</td>";
      for (var day = 1; day <= days; day++) {
        var key = getCellKey(rowKey, day);
        var val = state.data[key] != null ? state.data[key] : "";
        var displayVal = formatNum(parseNum(val));
        total += parseNum(val);
        var clsToday = day === todayDay ? " ads-day-today" : "";
        if (rowKey === "both" || readOnly) {
          html += '<td class="ads-td-cell ads-td-cell-auto' + clsToday + '" title="' + (readOnly ? 'Архив (только чтение)' : 'Авто: Основной + Новый') + '">' + (displayVal || "") + "</td>";
        } else {
          html += '<td class="ads-td-cell ads-td-cell-editable' + clsToday + '" data-row="' + rowKey + '" data-day="' + day + '" title="ПКМ: добавить сумму к этому дню">' + (displayVal || "") + "</td>";
        }
      }
      html += '<td class="ads-td-row-total" data-row="' + rowKey + '">' + (total ? total.toLocaleString("ru") : "0") + "</td></tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;

    if (!readOnly) {
      container.querySelectorAll(".ads-td-cell-editable").forEach(function(td) {
        td.addEventListener("contextmenu", function(e) {
          e.preventDefault();
          var row = td.getAttribute("data-row");
          var day = parseInt(td.getAttribute("data-day"), 10);
          if (!row || row === "both" || !day) return;
          startCellAddMode(td, container, state, row, day, onChange);
        });
      });
    }
  }

  function renderPostsPlanTable(container, postsState, sourcesState, viewOpts) {
    viewOpts = viewOpts || {};
    var days = Math.max(30, Math.min(90, Number(viewOpts.days) || 30));
    var todayDay = getTodayDayForState(postsState);
    var anchorDay = todayDay > 0 ? todayDay : 1;
    var monthTitle = getPostsMonthTitle(postsState) + " · " + days + " дней";
    var baseOffset = Math.max(0, Number(postsState.offset) || 0);
    var monthStateCache = {};
    function getMonthState(offset) {
      var key = String(offset);
      if (!monthStateCache[key]) monthStateCache[key] = loadPostsPlan(offset);
      return monthStateCache[key];
    }
    function getColumnMeta(col) {
      var z = Math.max(0, (anchorDay - 1) + (Number(col) - 1));
      var monthShift = Math.floor(z / 30);
      var day = (z % 30) + 1;
      var monthOffset = baseOffset + monthShift;
      return { monthOffset: monthOffset, day: day };
    }
    var theadHtml = '<thead><tr><th class="ads-th-label">Проект</th>';
    for (var d = 1; d <= days; d++) {
      var meta = getColumnMeta(d);
      var metaMonth = getPostsMonthMeta(meta.monthOffset);
      var headCls = "ads-th-day";
      if (meta.monthOffset === baseOffset && meta.day === anchorDay) headCls += " ads-day-today";
      else if (meta.monthOffset === baseOffset && todayDay && meta.day < anchorDay) headCls += " ads-day-past";
      else headCls += " ads-day-future";
      var dayLabel = getPostDayMonthLabel(metaMonth, meta.day);
      theadHtml += '<th class="' + headCls + '" title="' + dayLabel + '">' + dayLabel + "</th>";
    }
    theadHtml += "</tr></thead>";
    function postPlanRowHtml(row) {
      var r = "";
      r += '<tr class="ads-posts-data-row" data-post-row="' + row.key + '">';
      r += '<td class="ads-td-label">' + row.label + "</td>";
      for (var col = 1; col <= days; col++) {
        var cMeta = getColumnMeta(col);
        var monthState = getMonthState(cMeta.monthOffset);
        var key = getPostCellKey(row.key, cMeta.day);
        var cellData = normalizePostCellData(monthState.data[key]);
        var val = cellData.text;
        var shortText = val.length > 10 ? (val.slice(0, 10) + "…") : val;
        var hasVal = !!val.trim();
        var isPublished = cellData.status === "published";
        var isQueued = cellData.status === "queued";
        var cellTitle = val || (isPublished ? "Опубликовано" : (isQueued ? "В отложенных" : "Нажмите, чтобы добавить пост"));
        var cellLabel = hasVal ? shortText : (isPublished ? "✅" : (isQueued ? "⏳" : "Пост"));
        var className = "ads-post-cell" + (hasVal ? " is-filled" : "") + (isPublished ? " is-published" : "") + (isQueued ? " is-queued" : "");
        var tdDayCls = "ads-post-td";
        if (cMeta.monthOffset === baseOffset && cMeta.day === anchorDay) tdDayCls += " ads-day-today";
        else if (cMeta.monthOffset === baseOffset && todayDay && cMeta.day < anchorDay) tdDayCls += " ads-day-past";
        else tdDayCls += " ads-day-future";
        var dataDayTitle = getPostDayMonthLabel(getPostsMonthMeta(cMeta.monthOffset), cMeta.day);
        r +=
          '<td class="' + tdDayCls + '">' +
            '<button type="button" class="' + className + '" data-row="' + row.key + '" data-day="' + cMeta.day + '" data-month-offset="' + cMeta.monthOffset + '" title="' + escapeHtml(dataDayTitle + " · " + cellTitle) + '">' +
              escapeHtml(cellLabel) +
            "</button>" +
          "</td>";
      }
      r += "</tr>";
      return r;
    }
    function onePostsTable(row) {
      return (
        '<div class="ads-posts-wrap">' +
          '<table class="ads-posts-table">' +
          theadHtml +
          "<tbody>" +
          postPlanRowHtml(row) +
          "</tbody></table></div>"
      );
    }
    var html =
      '<div class="ads-content-calendar">' +
        '<div class="ads-posts-head-row ads-posts-head-row-tools">' +
          '<div class="ads-posts-head-actions">' +
            '<span class="ads-posts-month-chip">' + escapeHtml(monthTitle) + "</span>" +
            '<button type="button" class="ads-posts-source-btn" id="adsPostSourceBtn">Источник</button>' +
          "</div>" +
        "</div>" +
        '<div class="ads-posts-sync-status" id="adsPostsSyncStatus">Синк с Google Sheets: готово</div>' +
        '<div class="ads-posts-windows">' +
          '<div class="ads-posts-window ads-posts-window-learn">' +
            '<div class="ads-posts-window-head">Обучение</div>' +
            onePostsTable(POST_ROWS[0]) +
          "</div>";
    if (POST_ROWS[1]) {
      html +=
        '<div class="ads-posts-window ads-posts-window-agency">' +
          '<div class="ads-posts-window-head">Агентство</div>' +
          onePostsTable(POST_ROWS[1]) +
        "</div>";
    }
    html += "</div></div>";
    container.innerHTML = html;
    container.querySelectorAll(".ads-post-cell").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var row = btn.getAttribute("data-row");
        var day = parseInt(btn.getAttribute("data-day"), 10);
        var mo = parseInt(btn.getAttribute("data-month-offset"), 10);
        if (!row || !day || isNaN(mo)) return;
        var targetState = loadPostsPlan(mo);
        openPostCellEditor(btn, targetState, row, day, function() {
          if (typeof viewOpts.onRefresh === "function") viewOpts.onRefresh();
          else renderPostsPlanTable(container, postsState, sourcesState, viewOpts);
        });
      });
    });
    var sourceBtn = container.querySelector("#adsPostSourceBtn");
    if (sourceBtn) {
      sourceBtn.addEventListener("click", function() {
        openPostsSourceSheet();
      });
    }
    bindPostsScrollSync(container);
    autoScrollPostsTableToToday(container);
  }
  function openPostsSourceSheet() {
    var url = "https://docs.google.com/spreadsheets/d/" + POSTS_SHEET_ID + "/edit";
    try {
      var w = window.open(url, "_blank", "noopener");
      if (!w) throw new Error("popup-blocked");
    } catch (e) {
      alert("Не удалось открыть вкладку автоматически.\nОткрой вручную:\n" + url);
    }
  }

  function setPostsSyncStatus(text, isErr) {
    var el = document.getElementById("adsPostsSyncStatus");
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.toggle("is-error", !!isErr);
  }

  function quoteSheetRange(sheetName, a1Range) {
    var n = String(sheetName || "").replace(/'/g, "''");
    return "'" + n + "'!" + a1Range;
  }
  function resetDriveAuthOnUnauthorized() {
    try {
      if (typeof window !== "undefined") {
        window._driveToken = null;
      }
      if (typeof clearStoredDriveAuth === "function") clearStoredDriveAuth();
      if (typeof updateDriveUI === "function") updateDriveUI();
    } catch (e) {}
  }
  function throwFriendlySheetsError(prefix, resp, rawText) {
    var status = Number(resp && resp.status) || 0;
    if (status === 401 || status === 403) {
      resetDriveAuthOnUnauthorized();
      throw new Error("Сессия Google истекла. Нажмите 🔑 Drive и повторите.");
    }
    var txt = String(rawText || "").trim();
    var shortTxt = txt.length > 220 ? (txt.slice(0, 220) + "...") : txt;
    throw new Error(prefix + ": HTTP " + status + (shortTxt ? (" · " + shortTxt) : ""));
  }

  async function getGoogleAccessTokenForSheets() {
    var fn = (typeof getDriveToken === "function") ? getDriveToken : (window && typeof window.getDriveToken === "function" ? window.getDriveToken : null);
    if (!fn) throw new Error("Google Drive не подключен");
    return await fn();
  }

  async function createSheetIfMissing(token, sheetName) {
    var url = "https://sheets.googleapis.com/v4/spreadsheets/" + POSTS_SHEET_ID + ":batchUpdate";
    var body = {
      requests: [
        {
          addSheet: {
            properties: { title: sheetName }
          }
        }
      ]
    };
    var resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (resp.ok) return true;
    var t = await resp.text().catch(function() { return ""; });
    if (resp.status === 400 && /already exists/i.test(t)) return true;
    throwFriendlySheetsError("Не удалось создать лист " + sheetName, resp, t);
  }

  async function putSheetValues(token, range, values) {
    var url =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      POSTS_SHEET_ID +
      "/values/" +
      encodeURIComponent(range) +
      "?valueInputOption=USER_ENTERED";
    var resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        range: range,
        majorDimension: "ROWS",
        values: values
      })
    });
    if (!resp.ok) {
      var txt = await resp.text().catch(function() { return ""; });
      throwFriendlySheetsError("Sheets update failed", resp, txt);
    }
  }
  async function getSheetValues(token, range) {
    var url =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      POSTS_SHEET_ID +
      "/values/" +
      encodeURIComponent(range);
    var resp = await fetch(url, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!resp.ok) {
      var txt = await resp.text().catch(function() { return ""; });
      throwFriendlySheetsError("Sheets read failed", resp, txt);
    }
    return await resp.json();
  }

  async function ensurePostsSheetPrepared(token, sheetName) {
    if (_postsSheetInitCache[sheetName]) return;
    try {
      var checkRange = quoteSheetRange(sheetName, "A1:A1");
      var checkUrl =
        "https://sheets.googleapis.com/v4/spreadsheets/" +
        POSTS_SHEET_ID +
        "/values/" +
        encodeURIComponent(checkRange);
      var checkResp = await fetch(checkUrl, {
        headers: { Authorization: "Bearer " + token }
      });
      if (!checkResp.ok) {
        if (checkResp.status === 400 || checkResp.status === 404) {
          await createSheetIfMissing(token, sheetName);
        } else {
          var checkTxt = await checkResp.text().catch(function() { return ""; });
          throwFriendlySheetsError("Sheets check failed", checkResp, checkTxt);
        }
      }
      await putSheetValues(token, quoteSheetRange(sheetName, "A1:C1"), [["День", "Контент поста", "Опубликовано"]]);
      var dayRows = [];
      for (var d = 1; d <= 30; d++) dayRows.push([String(d)]);
      await putSheetValues(token, quoteSheetRange(sheetName, "A2:A31"), dayRows);
      _postsSheetInitCache[sheetName] = true;
    } catch (e) {
      throw e;
    }
  }
  function getDayRowsTemplate() {
    var dayRows = [];
    for (var d = 1; d <= 30; d++) dayRows.push([String(d)]);
    return dayRows;
  }
  function detectPostsMonthBlockStarts(colAValues) {
    var starts = [];
    var vals = Array.isArray(colAValues) ? colAValues : [];
    for (var i = 0; i < vals.length; i++) {
      var cell = String(((vals[i] || [])[0] || "")).trim();
      if (cell !== "1") continue;
      var ok = true;
      for (var day = 1; day <= 30; day++) {
        var row = vals[i + (day - 1)] || [];
        var v = String((row[0] || "")).trim();
        if (v !== String(day)) { ok = false; break; }
      }
      if (ok) starts.push(i + 1); // 1-based row
    }
    return starts;
  }
  async function getPostsSheetMonthBlockStartRow(token, sheetName, monthOffset, createIfMissing) {
    var offset = Math.max(0, Number(monthOffset) || 0);
    await ensurePostsSheetPrepared(token, sheetName);
    var readRange = quoteSheetRange(sheetName, "A1:A600");
    var payload = await getSheetValues(token, readRange).catch(function() { return { values: [] }; });
    var starts = detectPostsMonthBlockStarts(payload && payload.values);
    if (starts.length > offset) return starts[offset];
    if (!createIfMissing) return null;
    var dayRows = getDayRowsTemplate();
    while (starts.length <= offset) {
      var startRow = starts.length ? (starts[starts.length - 1] + 31) : 2; // +30 rows + 1 gap
      await putSheetValues(token, quoteSheetRange(sheetName, "A" + startRow + ":A" + (startRow + 29)), dayRows);
      starts.push(startRow);
    }
    return starts[offset] || null;
  }

  function getPostsSheetNameByRow(rowKey) {
    return rowKey === "learn" ? POSTS_SHEET_LEARN : POSTS_SHEET_AGENCY;
  }

  async function syncPostToGoogleSheets(rowKey, day, value, status, monthOffset, tokenOverride) {
    var sheetName = getPostsSheetNameByRow(rowKey);
    var token = tokenOverride || await getGoogleAccessTokenForSheets();
    var startRow = await getPostsSheetMonthBlockStartRow(token, sheetName, monthOffset, true);
    if (!startRow) throw new Error("Не найден блок месяца в таблице");
    var rowNum = Number(startRow) + Number(day) - 1; // day 1 -> startRow
    var targetRange = quoteSheetRange(sheetName, "B" + rowNum + ":C" + rowNum);
    var normalizedStatus = normalizePostCellStatus(status);
    var statusFlag = normalizedStatus === "published" ? "✅" : (normalizedStatus === "queued" ? "⏳" : "");
    await putSheetValues(token, targetRange, [[String(value || ""), statusFlag]]);
  }
  async function pullPostsPlanFromGoogleSheets(postsState, tokenOverride) {
    var token = tokenOverride || await getGoogleAccessTokenForSheets();
    var changed = false;
    var monthOffset = Math.max(0, Number(postsState && postsState.offset) || 0);
    for (var i = 0; i < POST_ROWS.length; i++) {
      var rowKey = POST_ROWS[i].key;
      var sheetName = getPostsSheetNameByRow(rowKey);
      var startRow = await getPostsSheetMonthBlockStartRow(token, sheetName, monthOffset, false);
      if (!startRow) continue;
      var range = quoteSheetRange(sheetName, "B" + startRow + ":C" + (startRow + 29));
      var payload = await getSheetValues(token, range);
      var rows = Array.isArray(payload.values) ? payload.values : [];
      for (var day = 1; day <= 30; day++) {
        var r = rows[day - 1] || [];
        var text = String(r[0] || "").trim();
        var flagCell = String(r[1] || "").trim();
        var flagRaw = flagCell.toLowerCase();
        var isPublished = flagCell === "✅" || /^(1|true|yes|да)$/i.test(flagRaw) || /опублик|published|done/.test(flagRaw);
        var isQueued = flagCell === "⏳" || /отлож|queued|pending|schedule/.test(flagRaw);
        var key = getPostCellKey(rowKey, day);
        var prev = normalizePostCellData(postsState.data[key]);
        if (!isPublished && !isQueued && !text) {
          if (prev.text || prev.status) {
            delete postsState.data[key];
            changed = true;
          }
          continue;
        }
        var nextText = text;
        var nextStatus = isPublished ? "published" : (isQueued ? "queued" : "");
        // legacy fallback: if old table stored "Опубликовано" in text only.
        if (!nextStatus && /^опубликовано$/i.test(text)) {
          nextText = "";
          nextStatus = "published";
        }
        if (!nextStatus && /^в\s*отложенн/i.test(text)) {
          nextText = "";
          nextStatus = "queued";
        }
        if (prev.text !== nextText || prev.status !== nextStatus) {
          savePostCellData(postsState, key, { text: nextText, status: nextStatus });
          changed = true;
        }
      }
    }
    if (changed) savePostsPlan(postsState);
    return changed;
  }

  function openPostCellEditor(anchorEl, postsState, row, day, onSaved) {
    closePostCellEditor();
    var key = getPostCellKey(row, day);
    var currentCell = normalizePostCellData(postsState.data[key]);
    var currentVal = currentCell.text;
    var currentStatus = currentCell.status;
    var panel = document.createElement("div");
    panel.className = "ads-post-editor-pop";
    panel.innerHTML =
      '<div class="ads-post-editor-title">День ' + day + " · " + (row === "learn" ? "Обучение" : "Агентство") + "</div>" +
      '<div class="ads-post-editor-status-row">' +
        '<label class="ads-post-editor-published"><input type="checkbox" id="adsPostPublishedChk"> Опубликовано</label>' +
        '<label class="ads-post-editor-published is-queued"><input type="checkbox" id="adsPostQueuedChk"> В отложенных</label>' +
      "</div>" +
      '<textarea class="ads-post-editor-text" placeholder="Впишите текст поста..."></textarea>' +
      '<div class="ads-post-editor-actions">' +
        '<button type="button" class="ads-post-editor-btn save">Сохранить</button>' +
        '<button type="button" class="ads-post-editor-btn clear">Очистить</button>' +
        '<button type="button" class="ads-post-editor-btn">Отмена</button>' +
      "</div>";
    document.body.appendChild(panel);
    var textarea = panel.querySelector(".ads-post-editor-text");
    var publishedChk = panel.querySelector("#adsPostPublishedChk");
    var queuedChk = panel.querySelector("#adsPostQueuedChk");
    var btnSave = panel.querySelector(".ads-post-editor-btn.save");
    var btnClear = panel.querySelector(".ads-post-editor-btn.clear");
    var btnCancel = panel.querySelectorAll(".ads-post-editor-btn")[2];
    if (textarea) {
      textarea.value = currentVal;
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }
    if (publishedChk) publishedChk.checked = currentStatus === "published";
    if (queuedChk) queuedChk.checked = currentStatus === "queued";
    if (publishedChk && queuedChk) {
      publishedChk.addEventListener("change", function() {
        if (publishedChk.checked) queuedChk.checked = false;
      });
      queuedChk.addEventListener("change", function() {
        if (queuedChk.checked) publishedChk.checked = false;
      });
    }
    var rect = anchorEl.getBoundingClientRect();
    var top = rect.bottom + 8;
    var left = rect.left;
    var maxLeft = Math.max(8, window.innerWidth - 360 - 8);
    if (left > maxLeft) left = maxLeft;
    if (top + 190 > window.innerHeight) top = Math.max(8, rect.top - 190 - 8);
    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";

    function doSave(nextValue, nextStatus) {
      var value = String(nextValue == null ? (textarea ? textarea.value : "") : nextValue).trim();
      var autoStatus = "";
      if (publishedChk && publishedChk.checked) autoStatus = "published";
      else if (queuedChk && queuedChk.checked) autoStatus = "queued";
      var status = normalizePostCellStatus(nextStatus == null ? autoStatus : nextStatus);
      var nextCell = { text: value, status: status };
      savePostCellData(postsState, key, nextCell);
      savePostsPlan(postsState);
      var valueForSheet = stringifyPostCellForSheet(nextCell);
      setPostsSyncStatus("Сохраняю в Google Sheets...", false);
      syncPostToGoogleSheets(row, day, valueForSheet, status, postsState.offset)
        .then(function() {
          flushPendingPostsSyncQueue()
            .then(function(flushedCount) {
              if (flushedCount > 0) {
                setPostsSyncStatus("Сохранено + досинхронизировано: " + flushedCount, false);
              } else {
                setPostsSyncStatus("Сохранено в Google Sheets: " + (row === "learn" ? "Обучение" : "Агенство") + ", день " + day, false);
              }
            })
            .catch(function() {
              setPostsSyncStatus("Сохранено в Google Sheets: " + (row === "learn" ? "Обучение" : "Агенство") + ", день " + day, false);
            });
        })
        .catch(function(err) {
          var msg = err && err.message ? err.message : String(err || "unknown error");
          var queued = enqueuePostSync(row, day, valueForSheet, status, postsState.offset);
          setPostsSyncStatus("Drive оффлайн, сохранено локально. В очереди: " + queued + " (" + msg + ")", true);
        });
      closePostCellEditor();
      if (typeof onSaved === "function") onSaved();
    }

    function onDocMouseDown(evt) {
      if (!panel.contains(evt.target) && evt.target !== anchorEl) closePostCellEditor();
    }
    function onEsc(evt) {
      if (evt.key === "Escape") closePostCellEditor();
      if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") doSave();
    }
    setTimeout(function() { document.addEventListener("mousedown", onDocMouseDown, true); }, 0);
    document.addEventListener("keydown", onEsc, true);

    btnSave.addEventListener("click", function() { doSave(); });
    btnClear.addEventListener("click", function() { doSave("", ""); });
    btnCancel.addEventListener("click", closePostCellEditor);

    _adsPostEditorCleanup = function() {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onEsc, true);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      _adsPostEditorCleanup = null;
    };
  }

  function closePostCellEditor() {
    if (typeof _adsPostEditorCleanup === "function") _adsPostEditorCleanup();
  }

  function getPostSourceCellKey(projectKey, day) {
    return "src_" + getPostCellKey(projectKey, day);
  }
  function closePostSourceCellEditor() {
    if (typeof _adsPostSourceEditorCleanup === "function") _adsPostSourceEditorCleanup();
  }
  function closePostsSourceModal() {
    closePostSourceCellEditor();
    if (typeof _adsPostSourceModalCleanup === "function") _adsPostSourceModalCleanup();
  }
  function openPostSourceCellEditor(anchorEl, sourcesState, row, day, onSaved) {
    closePostSourceCellEditor();
    var key = getPostSourceCellKey(row, day);
    var currentVal = String(sourcesState.data[key] || "");
    var panel = document.createElement("div");
    panel.className = "ads-post-editor-pop ads-source-editor-pop";
    panel.innerHTML =
      '<div class="ads-post-editor-title">Источник · День ' + day + " · " + (row === "learn" ? "Обучение" : "Агентство") + "</div>" +
      '<textarea class="ads-post-editor-text" placeholder="Укажи источник поста (канал, ссылка, идея...)"></textarea>' +
      '<div class="ads-post-editor-actions">' +
        '<button type="button" class="ads-post-editor-btn save">Сохранить</button>' +
        '<button type="button" class="ads-post-editor-btn clear">Очистить</button>' +
        '<button type="button" class="ads-post-editor-btn">Отмена</button>' +
      "</div>";
    document.body.appendChild(panel);
    var textarea = panel.querySelector(".ads-post-editor-text");
    var btnSave = panel.querySelector(".ads-post-editor-btn.save");
    var btnClear = panel.querySelector(".ads-post-editor-btn.clear");
    var btnCancel = panel.querySelectorAll(".ads-post-editor-btn")[2];
    if (textarea) {
      textarea.value = currentVal;
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }
    var rect = anchorEl.getBoundingClientRect();
    var top = rect.bottom + 8;
    var left = rect.left;
    var maxLeft = Math.max(8, window.innerWidth - 360 - 8);
    if (left > maxLeft) left = maxLeft;
    if (top + 190 > window.innerHeight) top = Math.max(8, rect.top - 190 - 8);
    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";

    function doSave(nextValue) {
      var value = String(nextValue == null ? (textarea ? textarea.value : "") : nextValue).trim();
      if (!value) delete sourcesState.data[key];
      else sourcesState.data[key] = value;
      savePostsSources(sourcesState);
      closePostSourceCellEditor();
      if (typeof onSaved === "function") onSaved();
    }
    function onDocMouseDown(evt) {
      if (!panel.contains(evt.target) && evt.target !== anchorEl) closePostSourceCellEditor();
    }
    function onEsc(evt) {
      if (evt.key === "Escape") closePostSourceCellEditor();
      if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") doSave();
    }
    setTimeout(function() { document.addEventListener("mousedown", onDocMouseDown, true); }, 0);
    document.addEventListener("keydown", onEsc, true);
    btnSave.addEventListener("click", function() { doSave(); });
    btnClear.addEventListener("click", function() { doSave(""); });
    btnCancel.addEventListener("click", closePostSourceCellEditor);
    _adsPostSourceEditorCleanup = function() {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onEsc, true);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      _adsPostSourceEditorCleanup = null;
    };
  }
  function renderPostsSourceTable(container, postsState, sourcesState, onSaved) {
    var days = 30;
    var theadHtml = '<thead><tr><th class="ads-th-label">Проект</th>';
    for (var d = 1; d <= days; d++) theadHtml += '<th class="ads-th-day">' + d + "</th>";
    theadHtml += "</tr></thead>";
    function sourceRowHtml(row) {
      var r = "";
      r += '<tr class="ads-posts-data-row" data-post-row="' + row.key + '">';
      r += '<td class="ads-td-label">' + row.label + "</td>";
      for (var day = 1; day <= days; day++) {
        var pKey = getPostCellKey(row.key, day);
        var sKey = getPostSourceCellKey(row.key, day);
        var postCell = normalizePostCellData(postsState.data[pKey]);
        var sourceVal = String(sourcesState.data[sKey] || "");
        var shortText = sourceVal ? (sourceVal.length > 10 ? sourceVal.slice(0, 10) + "…" : sourceVal) : "—";
        var cls = "ads-post-cell" + (sourceVal ? " is-filled" : "");
        var title = sourceVal || "Нажмите, чтобы добавить источник";
        var postHint = String(postCell.text || "").trim();
        r +=
          '<td class="ads-post-td">' +
            '<button type="button" class="' + cls + '" data-row="' + row.key + '" data-day="' + day + '" title="' + escapeHtml(title + (postHint ? (" | Пост: " + postHint) : "")) + '">' + escapeHtml(shortText) + "</button>" +
          "</td>";
      }
      r += "</tr>";
      return r;
    }
    function oneSourceTable(row) {
      return (
        '<div class="ads-posts-wrap">' +
          '<table class="ads-posts-table">' +
          theadHtml +
          "<tbody>" +
          sourceRowHtml(row) +
          "</tbody></table></div>"
      );
    }
    var html =
      '<div class="ads-source-table-wrap ads-content-calendar">' +
        '<div class="ads-posts-windows">' +
          '<div class="ads-posts-window ads-posts-window-learn">' +
            '<div class="ads-posts-window-head">Обучение</div>' +
            oneSourceTable(POST_ROWS[0]) +
          "</div>";
    if (POST_ROWS[1]) {
      html +=
        '<div class="ads-posts-window ads-posts-window-agency">' +
          '<div class="ads-posts-window-head">Агентство</div>' +
          oneSourceTable(POST_ROWS[1]) +
        "</div>";
    }
    html += "</div></div>";
    container.innerHTML = html;
    container.querySelectorAll(".ads-post-cell").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var row = btn.getAttribute("data-row");
        var day = parseInt(btn.getAttribute("data-day"), 10);
        if (!row || !day) return;
        openPostSourceCellEditor(btn, sourcesState, row, day, function() {
          renderPostsSourceTable(container, postsState, sourcesState, onSaved);
          if (typeof onSaved === "function") onSaved();
        });
      });
    });
    bindPostsScrollSync(container);
  }
  function openPostsSourceModal(postsState, sourcesState, onSaved) {
    closePostsSourceModal();
    var modal = document.createElement("div");
    modal.className = "ads-source-modal-overlay";
    modal.innerHTML =
      '<div class="ads-source-modal">' +
        '<div class="ads-source-modal-head">' +
          '<div class="ads-source-modal-title">Источник постов</div>' +
          '<button type="button" class="ads-source-modal-close" aria-label="Закрыть">×</button>' +
        "</div>" +
        '<div class="ads-source-modal-body" id="adsSourceModalBody"></div>' +
      "</div>";
    document.body.appendChild(modal);
    var body = modal.querySelector("#adsSourceModalBody");
    renderPostsSourceTable(body, postsState, sourcesState, onSaved);
    function closeModal() { closePostsSourceModal(); }
    var closeBtn = modal.querySelector(".ads-source-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("mousedown", function(evt) {
      if (evt.target === modal) closeModal();
    });
    document.addEventListener("keydown", onEsc, true);
    function onEsc(evt) { if (evt.key === "Escape") closeModal(); }
    _adsPostSourceModalCleanup = function() {
      document.removeEventListener("keydown", onEsc, true);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      _adsPostSourceModalCleanup = null;
    };
  }

  function getLinksCategory(item) {
    var explicit = String(item && item.category || "").toLowerCase().trim();
    if (explicit === "telegram" || explicit === "vk" || explicit === "avito" || explicit === "sites") return explicit;
    var id = String(item.id || "").toLowerCase();
    var label = String(item.label || "").toLowerCase();
    var url = String(item.url || "").toLowerCase();
    if (isVkLinkText(id) || isVkLinkText(label) || isVkLinkText(url)) return "vk";
    if (id.indexOf("avito") >= 0 || label.indexOf("авито") >= 0) return "avito";
    if (id.indexOf("site") >= 0 || label.indexOf("сайт") >= 0 || (url && !isTelegramLinkText(url) && !isVkLinkText(url))) return "sites";
    if (id.indexOf("channel") >= 0 || id.indexOf("bot") >= 0 || isTelegramLinkText(label) || isTelegramLinkText(url)) return "telegram";
    return "sites";
  }

  function getDefaultLinkIcon(categoryId) {
    if (categoryId === "telegram") return "✈";
    if (categoryId === "vk") return "🟦";
    if (categoryId === "avito") return "🛒";
    return "🌐";
  }

  function addLinkToCategory(categoryId, links, container) {
    var grp = LINKS_GROUPS.find(function(g) { return g.id === categoryId; });
    var human = grp ? grp.title.replace(/^[^\s]+\s+/, "") : "категория";
    var label = prompt("Название для " + human + ":", "");
    if (label === null) return;
    label = String(label || "").trim();
    if (!label) return;
    var url = prompt("Ссылка (можно оставить пусто):", "https://");
    if (url === null) return;
    var snippet = prompt("Подпись/сниппет (необязательно):", "");
    if (snippet === null) snippet = "";
    var icon = prompt("Иконка (эмоджи):", getDefaultLinkIcon(categoryId));
    if (icon === null) icon = getDefaultLinkIcon(categoryId);
    links.push({
      id: "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      category: categoryId,
      icon: String(icon || getDefaultLinkIcon(categoryId)).trim() || getDefaultLinkIcon(categoryId),
      label: label,
      url: String(url || "").trim(),
      snippet: String(snippet || "").trim(),
      avatar: ""
    });
    saveLinks(links);
    renderLinksPanel(container, links);
  }

  function renderLinksPanel(container, links) {
    var groups = LINKS_GROUPS.slice();
    var grouped = { telegram: [], vk: [], avito: [], sites: [] };
    links.forEach(function(item, idx) {
      var cat = getLinksCategory(item);
      if (!grouped[cat]) cat = "sites";
      grouped[cat].push({ item: item, idx: idx });
      if (links[idx]) links[idx].category = cat;
    });

    var html = '<div class="ads-links-title">🔗 Быстрые ссылки</div>';
    html += '<div class="ads-snippet-columns">';
    groups.forEach(function(g) {
      html += '<div class="ads-snippet-group ads-snippet-col"><div class="ads-snippet-group-head"><div class="ads-snippet-group-title">' + g.title + '</div><button type="button" class="ads-snippet-add-btn" data-add-cat="' + g.id + '">+ Добавить</button></div><div class="ads-snippet-grid">';
      if (!grouped[g.id].length) html += '<div class="ads-snippet-empty">Пока пусто</div>';
      grouped[g.id].forEach(function(w) {
        var item = w.item;
        var idx = w.idx;
        var hasUrl = item.url && String(item.url).trim().length;
        html += '<div class="ads-snippet-card" data-idx="' + idx + '">';
        html += '<button type="button" class="ads-snippet-main" data-open="' + idx + '"' + (hasUrl ? "" : ' title="Добавьте ссылку"') + ">";
        html += '<span class="ads-snippet-avatar ads-snippet-avatar-fallback">' + escapeHtml(item.icon || "🔗") + "</span>";
        html += '<span class="ads-snippet-meta"><span class="ads-snippet-name">' + escapeHtml(item.label || "") + '</span><span class="ads-snippet-sub">' + escapeHtml(item.snippet || "Добавьте сниппет") + "</span></span>";
        html += "</button>";
        html += "</div>";
      });
      html += "</div></div>";
    });
    html += "</div>";
    container.innerHTML = html;
    container.querySelectorAll("[data-add-cat]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var cat = String(btn.getAttribute("data-add-cat") || "");
        if (!cat) return;
        addLinkToCategory(cat, links, container);
      });
    });
    container.querySelectorAll("[data-open]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var idx = parseInt(btn.getAttribute("data-open"), 10);
        var url = links[idx] && links[idx].url ? String(links[idx].url).trim() : "";
        if (url) window.open(url, "_blank", "noopener");
      });
    });
    saveLinks(links);
  }

  function setupAdsSubtabs(root) {
    var btns = root.querySelectorAll("[data-ads-subtab]");
    var pages = root.querySelectorAll("[data-ads-page]");
    btns.forEach(function(btn) {
      btn.addEventListener("click", function() {
        var id = btn.getAttribute("data-ads-subtab");
        btns.forEach(function(b) { b.classList.toggle("on", b === btn); });
        pages.forEach(function(p) { p.classList.toggle("on", p.getAttribute("data-ads-page") === id); });
      });
    });
  }

  function setupAdsApiPanel(root) {
    var baseInp = root.querySelector("#adsApiBackendBase");
    var keyInp = root.querySelector("#adsApiKeyInput");
    var clientIdInp = root.querySelector("#adsApiClientIdInput");
    var clientSecretInp = root.querySelector("#adsApiClientSecretInput");
    var pathInp = root.querySelector("#adsApiPathInput");
    var saveBtn = root.querySelector("#adsApiSaveBtn");
    var loadBtn = root.querySelector("#adsApiLoadBtn");
    var st = root.querySelector("#adsApiStatus");
    var out = root.querySelector("#adsApiResult");
    if (!baseInp || !keyInp || !clientIdInp || !clientSecretInp || !pathInp || !saveBtn || !loadBtn || !st || !out) return;

    baseInp.value = localStorage.getItem(AVITO_BASE_LS) || "http://localhost:8787/api";
    keyInp.value = localStorage.getItem(AVITO_KEY_LS) || "";
    clientIdInp.value = localStorage.getItem(AVITO_CLIENT_ID_LS) || "";
    clientSecretInp.value = localStorage.getItem(AVITO_CLIENT_SECRET_LS) || "";
    pathInp.value = localStorage.getItem(AVITO_PATH_LS) || "/core/v1/accounts/self";

    function setStatus(text, isErr) {
      st.textContent = text;
      st.classList.toggle("is-error", !!isErr);
    }
    function saveSettings() {
      localStorage.setItem(AVITO_BASE_LS, String(baseInp.value || "").trim());
      localStorage.setItem(AVITO_KEY_LS, String(keyInp.value || "").trim());
      localStorage.setItem(AVITO_CLIENT_ID_LS, String(clientIdInp.value || "").trim());
      localStorage.setItem(AVITO_CLIENT_SECRET_LS, String(clientSecretInp.value || "").trim());
      localStorage.setItem(AVITO_PATH_LS, String(pathInp.value || "").trim());
      setStatus("Настройки сохранены локально.", false);
    }
    saveBtn.addEventListener("click", saveSettings);
    loadBtn.addEventListener("click", function() {
      var backendBase = String(baseInp.value || "").trim().replace(/\/+$/, "");
      var apiKey = String(keyInp.value || "").trim();
      var clientId = String(clientIdInp.value || "").trim();
      var clientSecret = String(clientSecretInp.value || "").trim();
      var apiPath = String(pathInp.value || "").trim();
      var hasToken = !!apiKey;
      var hasClientCreds = !!clientId && !!clientSecret;
      if (!backendBase || !apiPath || (!hasToken && !hasClientCreds)) {
        setStatus("Заполните Backend URL, API путь и (API ключ ИЛИ Client ID + Client Secret).", true);
        return;
      }
      saveSettings();
      setStatus("Загрузка данных из Avito...", false);
      out.textContent = "...";
      fetch(backendBase + "/avito/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey,
          clientId: clientId,
          clientSecret: clientSecret,
          path: apiPath,
          method: "GET"
        })
      })
      .then(function(res) {
        return res.json().catch(function() { return { ok: false, error: "Invalid JSON from backend" }; })
          .then(function(data) { return { status: res.status, data: data }; });
      })
      .then(function(payload) {
        if (payload.status >= 400 || payload.data.ok === false) {
          setStatus("Ошибка загрузки: " + (payload.data.error || ("HTTP " + payload.status)), true);
          out.textContent = JSON.stringify(payload.data, null, 2);
          return;
        }
        setStatus("Данные успешно получены.", false);
        out.textContent = JSON.stringify(payload.data, null, 2);
      })
      .catch(function(err) {
        setStatus("Сеть/сервер недоступен: " + (err && err.message ? err.message : "unknown error") + ". Запустите backend: cd backend && npm install && npm run dev", true);
        out.textContent = String(err && err.stack ? err.stack : err);
      });
    });
  }

  function renderAdsPage(mainContentEl) {
    adsMaybeRecoverMisarchivedData();
    adsCheckMonthTransition();
    var isAdsArchive = !!_adsViewMonth;
    var adsViewYM = _adsViewMonth || adsCurrentMonthKey();
    var state;
    if (isAdsArchive) {
      state = adsLoadMonthSnapshot(adsViewYM) || { data: {}, year: adsViewYM.split("-")[0], month: String(parseInt(adsViewYM.split("-")[1], 10)) };
    } else {
      state = loadExpenses();
      adsSnapshotCurrentMonth();
    }
    var monthLabel = adsFormatMonthLabel(adsViewYM);
    var postsMonthOffset = 0;
    if (isAdsArchive) {
      var curParts = adsCurrentMonthKey().split("-");
      var viewParts = adsViewYM.split("-");
      postsMonthOffset = (parseInt(viewParts[0], 10) - parseInt(curParts[0], 10)) * 12 + (parseInt(viewParts[1], 10) - parseInt(curParts[1], 10));
    }
    var postsState = loadPostsPlan(postsMonthOffset);
    var postsVisibleDays = 60;
    var sourcesState = loadPostsSources();
    var links = loadLinks();
    var archiveBanner = isAdsArchive ? '<div class="ads-archive-banner" style="text-align:center;padding:8px 16px;background:rgba(255,165,0,0.12);border:1px solid rgba(255,165,0,0.3);border-radius:8px;color:#ffa500;font-weight:700;font-size:13px;margin-bottom:8px">📁 Архив: ' + escapeHtml(monthLabel) + "</div>" : "";
    // Show a notice if the wrong-recovery undo ran (April was cleared — user needs to re-enter)
    var undoBanner = "";
    try {
      if (
        !isAdsArchive &&
        localStorage.getItem(ADS_UNDO_DONE_FLAG) === "1" &&
        adsExpensesTotal(loadExpenses().data) === 0
      ) {
        var prevYM2 = adsGetPrevMonthKey(adsCurrentMonthKey());
        undoBanner =
          '<div id="adsUndoBanner" style="padding:10px 16px;background:rgba(255,80,80,0.13);border:1px solid rgba(255,80,80,0.45);border-radius:8px;color:#ff9999;font-size:12px;font-weight:700;margin-bottom:8px">' +
          '⚠️ Апрель был очищен автоматически: предыдущие данные (" мартовские ") перемещены в архив ' + escapeHtml(adsFormatMonthLabel(prevYM2)) + '. ' +
          'Введи реальные данные апреля заново. ' +
          'Для диагностики всех ключей открой консоль браузера и выполни: <code style="background:rgba(0,0,0,0.4);padding:2px 6px;border-radius:4px;font-size:11px">window.__adsDiagnose()</code>' +
          '</div>';
      }
    } catch(e) {}
    var monthNavHtml = '<div class="ads-month-nav" style="display:inline-flex;align-items:center;gap:6px;margin-left:12px">' +
      '<button type="button" class="goal-month-nav-btn" onclick="window.__adsMonthPrev()" title="Предыдущий месяц" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;width:32px;height:32px;border-radius:6px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit">◀</button>' +
      '<span style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.85);min-width:110px;text-align:center;white-space:nowrap">' + escapeHtml(monthLabel) + '</span>' +
      '<button type="button" class="goal-month-nav-btn" onclick="window.__adsMonthNext()" title="Следующий месяц" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;width:32px;height:32px;border-radius:6px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit">▶</button>' +
      "</div>";
    var wrap = document.createElement("div");
    wrap.className = "ads-page";
    wrap.innerHTML =
      archiveBanner +
      undoBanner +
      '<div class="ads-header">📢 РЕКЛАМА ПРОЕКТА' + monthNavHtml + '</div>' +
      '<div class="ads-subtab-page on" data-ads-page="expenses">' +
        '<div class="ads-top-summary" id="adsTopSummary">' +
          '<div class="ads-summary-card ads-summary-all"><span class="ads-summary-label">Всего</span><span class="ads-summary-val" data-ads-val="all">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Основной</span><span class="ads-summary-val" data-ads-val="main">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Новый</span><span class="ads-summary-val" data-ads-val="new">0</span></div>' +
          '<div class="ads-summary-card"><span class="ads-summary-label">Оба</span><span class="ads-summary-val" data-ads-val="both">0</span></div>' +
        "</div>" +
        '<div class="ads-body">' +
          '<div class="ads-main">' +
            '<div class="ads-card ads-expenses-card"><div class="ads-card-title">Расходы по дням</div><div id="adsExpensesContainer"></div></div>' +
            '<div class="ads-card ads-posts-card"><div class="ads-card-title">Контент календарь</div><div id="adsPostsPlanContainer"></div></div>' +
            '<div class="ads-card ads-links-card"><div id="adsLinksContainer"></div></div>' +
          "</div>" +
          '<div class="ads-sidebar"><div class="ads-card ads-totals-card"><div id="adsTotalsContainer"></div></div></div>' +
        "</div>" +
      "</div>";

    mainContentEl.innerHTML = "";
    mainContentEl.appendChild(wrap);

    var expensesContainer = wrap.querySelector("#adsExpensesContainer");
    var postsPlanContainer = wrap.querySelector("#adsPostsPlanContainer");
    var totalsContainer = wrap.querySelector("#adsTotalsContainer");
    var linksContainer = wrap.querySelector("#adsLinksContainer");
    function refreshTotals() {
      updateTotalsPanel(totalsContainer, state);
      updateTopSummary(wrap.querySelector("#adsTopSummary"), state);
    }
    var postsSheetPulledByMonth = {};
    var postsSheetPullInFlight = false;
    function getVisibleMonthOffsets() {
      var today = getTodayDayForState(loadPostsPlan(postsMonthOffset));
      var anchor = today > 0 ? today : 1;
      var blocks = Math.ceil((Math.max(30, postsVisibleDays) + anchor - 1) / 30);
      var arr = [];
      for (var i = 0; i < blocks; i++) arr.push(postsMonthOffset + i);
      return arr;
    }
    function syncPostsFromSheetsIfNeeded() {
      var offsets = getVisibleMonthOffsets();
      var hasWork = false;
      for (var i = 0; i < offsets.length; i++) {
        var id = getPostsMonthMeta(offsets[i]).monthId;
        if (!postsSheetPulledByMonth[id]) { hasWork = true; break; }
      }
      if (!hasWork || postsSheetPullInFlight) return;
      postsSheetPullInFlight = true;
      setPostsSyncStatus("Синхронизирую из Google Sheets...", false);
      var chain = Promise.resolve();
      var changedAny = false;
      offsets.forEach(function(off) {
        chain = chain.then(function() {
          var st = loadPostsPlan(off);
          var id = String(st.monthId || getPostsMonthMeta(off).monthId);
          if (postsSheetPulledByMonth[id]) return;
          return pullPostsPlanFromGoogleSheets(st).then(function(changed) {
            postsSheetPulledByMonth[id] = true;
            if (changed) changedAny = true;
          });
        });
      });
      chain
        .then(function() {
          if (changedAny) {
            rerenderPostsPlan();
          } else {
            setPostsSyncStatus("Синк с Google Sheets: готово", false);
          }
        })
        .catch(function(err) {
          var msg = err && err.message ? err.message : "не удалось получить данные";
          setPostsSyncStatus("Синк из Sheets не выполнен: " + msg, true);
        })
        .finally(function() { postsSheetPullInFlight = false; });
    }
    function rerenderPostsPlan() {
      postsState = loadPostsPlan(postsMonthOffset);
      renderPostsPlanTable(postsPlanContainer, postsState, sourcesState, {
        onRefresh: rerenderPostsPlan,
        days: postsVisibleDays
      });
      syncPostsFromSheetsIfNeeded();
    }
    renderExpensesTable(expensesContainer, state, refreshTotals, isAdsArchive);
    rerenderPostsPlan();
    setTimeout(function() {
      var queued = loadPostsSyncQueue().length;
      if (queued > 0) {
        setPostsSyncStatus("Найдена очередь синка: " + queued + ". Пробую отправить...", false);
      }
      flushPendingPostsSyncQueue()
        .then(function(sent) {
          var left = loadPostsSyncQueue().length;
          if (sent > 0 && left === 0) setPostsSyncStatus("Очередь синка отправлена полностью (" + sent + ")", false);
          else if (left > 0) setPostsSyncStatus("Часть очереди еще не отправлена: " + left, true);
        })
        .catch(function() {
          var left = loadPostsSyncQueue().length;
          if (left > 0) setPostsSyncStatus("Drive недоступен. В очереди: " + left, true);
        });
    }, 250);
    updateTotalsPanel(totalsContainer, state);
    updateTopSummary(wrap.querySelector("#adsTopSummary"), state);
    renderLinksPanel(linksContainer, links);
    setupAdsSubtabs(wrap);
  }

  window.__showAdsPage = renderAdsPage;
})();
