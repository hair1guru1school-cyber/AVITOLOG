/**
 * ADS page: expenses, links, API panel
 */
(function() {
  "use strict";

  var EXPENSES_KEY = "crm_ads_expenses_v1";
  var POSTS_PLAN_KEY = "crm_ads_posts_plan_v1";
  var LINKS_KEY = "crm_ads_links_v1";
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

  var DEFAULT_LINKS = [
    { id: "channel_clients", icon: "📣", label: "Канал для клиентов", url: "", snippet: "", avatar: "" },
    { id: "bot_clients", icon: "🤖", label: "Бот для клиентов", url: "", snippet: "", avatar: "" },
    { id: "channel_learn", icon: "🎓", label: "Канал обучения", url: "", snippet: "", avatar: "" },
    { id: "channel_vk_blog", icon: "🟦", label: "Личный блог ВК", url: "https://vk.com/fil_the_bizz", snippet: "VK блог", avatar: "" },
    { id: "bot_learn", icon: "🤖", label: "Бот обучения", url: "", snippet: "", avatar: "" },
    { id: "site", icon: "🌐", label: "Сайт агентства", url: "", snippet: "", avatar: "" },
    { id: "avito1", icon: "🛒", label: "Авито аккаунт 1", url: "", snippet: "", avatar: "" },
    { id: "avito2", icon: "🛒", label: "Авито аккаунт 2", url: "", snippet: "", avatar: "" }
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
    } catch (e) {}
  }

  function getPostCellKey(projectKey, day) {
    return projectKey + "_" + day;
  }

  function loadPostsPlan() {
    try {
      var raw = localStorage.getItem(POSTS_PLAN_KEY);
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

  function savePostsPlan(state) {
    try {
      localStorage.setItem(POSTS_PLAN_KEY, JSON.stringify({
        y: state.year,
        m: state.month,
        cells: state.data
      }));
    } catch (e) {}
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
          return merged;
        }
      }
    } catch (e) {}
    return DEFAULT_LINKS.map(function(x) { return Object.assign({}, x); });
  }

  function saveLinks(links) {
    try { localStorage.setItem(LINKS_KEY, JSON.stringify(links)); } catch (e) {}
  }

  function getTodayDayForState(state) {
    var now = new Date();
    if (!state) return 0;
    if (String(state.year) !== String(now.getFullYear())) return 0;
    if (String(state.month) !== String(now.getMonth() + 1)) return 0;
    return now.getDate();
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

  function renderExpensesTable(container, state, onChange) {
    recomputeBothRow(state);
    saveExpenses(state);
    var days = 31;
    var todayDay = getTodayDayForState(state);
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
        if (rowKey === "both") {
          html += '<td class="ads-td-cell ads-td-cell-auto' + clsToday + '" title="Авто: Основной + Новый">' + (displayVal || "") + "</td>";
        } else {
          html += '<td class="ads-td-cell ads-td-cell-editable' + clsToday + '" data-row="' + rowKey + '" data-day="' + day + '" title="ПКМ: добавить сумму к этому дню">' + (displayVal || "") + "</td>";
        }
      }
      html += '<td class="ads-td-row-total" data-row="' + rowKey + '">' + (total ? total.toLocaleString("ru") : "0") + "</td></tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;

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

  function renderPostsPlanTable(container, postsState) {
    var days = 30;
    var todayDay = getTodayDayForState(postsState);
    var html =
      '<div class="ads-posts-planner-head">Календарь постов на 30 дней (каналы)</div>' +
      '<div class="ads-posts-wrap"><table class="ads-posts-table"><thead><tr><th class="ads-th-label">Проект</th>';
    for (var d = 1; d <= days; d++) {
      html += '<th class="ads-th-day' + (d === todayDay ? " ads-day-today" : "") + '">' + d + "</th>";
    }
    html += "</tr></thead><tbody>";
    POST_ROWS.forEach(function(row) {
      html += '<tr><td class="ads-td-label">' + row.label + "</td>";
      for (var day = 1; day <= days; day++) {
        var key = getPostCellKey(row.key, day);
        var val = String(postsState.data[key] || "");
        var shortText = val.length > 10 ? (val.slice(0, 10) + "…") : val;
        var hasVal = !!val.trim();
        html +=
          '<td class="ads-post-td' + (day === todayDay ? " ads-day-today" : "") + '">' +
            '<button type="button" class="ads-post-cell' + (hasVal ? " is-filled" : "") + '" data-row="' + row.key + '" data-day="' + day + '" title="' + escapeHtml(val || "Нажмите, чтобы добавить пост") + '">' +
              escapeHtml(hasVal ? shortText : "Пост") +
            "</button>" +
          "</td>";
      }
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;
    container.querySelectorAll(".ads-post-cell").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var row = btn.getAttribute("data-row");
        var day = parseInt(btn.getAttribute("data-day"), 10);
        if (!row || !day) return;
        openPostCellEditor(btn, postsState, row, day, function() {
          renderPostsPlanTable(container, postsState);
        });
      });
    });
  }

  function openPostCellEditor(anchorEl, postsState, row, day, onSaved) {
    closePostCellEditor();
    var key = getPostCellKey(row, day);
    var currentVal = String(postsState.data[key] || "");
    var panel = document.createElement("div");
    panel.className = "ads-post-editor-pop";
    panel.innerHTML =
      '<div class="ads-post-editor-title">День ' + day + " · " + (row === "learn" ? "Обучение" : "Агентство") + "</div>" +
      '<textarea class="ads-post-editor-text" placeholder="Впишите текст поста..."></textarea>' +
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
      if (!value) delete postsState.data[key];
      else postsState.data[key] = value;
      savePostsPlan(postsState);
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
    btnClear.addEventListener("click", function() { doSave(""); });
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

  function getLinksCategory(item) {
    var id = String(item.id || "").toLowerCase();
    var label = String(item.label || "").toLowerCase();
    if (id.indexOf("channel") >= 0 || label.indexOf("канал") >= 0) return "channels";
    if (id.indexOf("bot") >= 0 || label.indexOf("бот") >= 0) return "bots";
    if (id.indexOf("site") >= 0 || label.indexOf("сайт") >= 0) return "sites";
    if (id.indexOf("avito") >= 0 || label.indexOf("авито") >= 0) return "avito";
    return "other";
  }

  function renderLinksPanel(container, links) {
    var groups = [
      { id: "channels", title: "📚 Каналы" },
      { id: "bots", title: "🤖 Боты" },
      { id: "sites", title: "🌐 Сайты" },
      { id: "avito", title: "🛒 Avito аккаунты" },
      { id: "other", title: "🔗 Прочее" }
    ];
    var grouped = { channels: [], bots: [], sites: [], avito: [], other: [] };
    links.forEach(function(item, idx) { grouped[getLinksCategory(item)].push({ item: item, idx: idx }); });

    var html = '<div class="ads-links-title">🔗 Быстрые ссылки</div>';
    groups.forEach(function(g) {
      if (!grouped[g.id].length) return;
      html += '<div class="ads-snippet-group"><div class="ads-snippet-group-title">' + g.title + '</div><div class="ads-snippet-grid">';
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
    container.innerHTML = html;
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
    var state = loadExpenses();
    var postsState = loadPostsPlan();
    var links = loadLinks();
    var wrap = document.createElement("div");
    wrap.className = "ads-page";
    wrap.innerHTML =
      '<div class="ads-header">📢 РЕКЛАМА ПРОЕКТА</div>' +
      '<div class="ads-subtabs">' +
        '<button type="button" class="ads-subtab-btn on" data-ads-subtab="expenses">Расходы</button>' +
      "</div>" +
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
            '<div class="ads-card ads-posts-card"><div id="adsPostsPlanContainer"></div></div>' +
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
    renderExpensesTable(expensesContainer, state, refreshTotals);
    renderPostsPlanTable(postsPlanContainer, postsState);
    updateTotalsPanel(totalsContainer, state);
    updateTopSummary(wrap.querySelector("#adsTopSummary"), state);
    renderLinksPanel(linksContainer, links);
    setupAdsSubtabs(wrap);
  }

  window.__showAdsPage = renderAdsPage;
})();
