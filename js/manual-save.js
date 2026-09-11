(function () {
  'use strict';

  var running = false;
  var resetTimer = null;

  function toast(text, isError) {
    var el = document.getElementById('avitologManualSaveToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'avitologManualSaveToast';
      el.style.cssText = 'position:fixed;right:16px;bottom:72px;z-index:2147483002;max-width:min(92vw,420px);padding:10px 14px;border-radius:11px;font-size:12px;font-weight:800;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.5);white-space:pre-wrap;text-align:center';
      document.body.appendChild(el);
    }
    el.style.background = isError ? 'rgba(85,18,26,.97)' : 'rgba(7,38,28,.97)';
    el.style.border = isError ? '1px solid rgba(255,90,90,.55)' : '1px solid rgba(0,217,126,.55)';
    el.style.color = isError ? '#ffd4d4' : '#c0ffe0';
    el.textContent = text;
  }

  window.__avitologManualSave = async function () {
    if (running) return;
    running = true;
    var btn = document.getElementById('manualSaveBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.remove('is-saved');
      btn.classList.add('is-saving');
      btn.textContent = '…';
    }

    var backendError = null;
    var driveError = null;
    var backendCount = 0;
    var driveResult = null;
    try {
      if (typeof window.__avitologBackendPushCurrentProfileNow !== 'function') {
        throw new Error('модуль Supabase не загружен');
      }
      var backendResult = await window.__avitologBackendPushCurrentProfileNow({ verify: true });
      backendCount = Number(backendResult && backendResult.count != null ? backendResult.count : backendResult) || 0;
    } catch (err) {
      backendError = err;
    }

    try {
      if (typeof window.__filManualBackupNow !== 'function') {
        throw new Error('модуль резервной копии Drive не загружен');
      }
      driveResult = await window.__filManualBackupNow();
    } catch (err) {
      driveError = err;
    }

    if (!backendError && !driveError && driveResult && driveResult.ok) {
      toast('Сохранено и проверено: Supabase (' + backendCount + ' ключей) и отдельный снимок Drive (' + driveResult.keyCount + ' ключей)', false);
      if (btn) btn.classList.add('is-saved');
    } else {
      var parts = [];
      parts.push(backendError ? 'Supabase: ' + (backendError.message || backendError) : 'Supabase сохранён');
      parts.push(driveError ? 'Drive: ' + (driveError.message || driveError) : 'Drive сохранён');
      toast(parts.join('\n'), true);
    }

    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-saving');
      btn.textContent = '💾';
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { btn.classList.remove('is-saved'); }, 3500);
    }
    running = false;
  };
}());
