(function (root) {
  'use strict';
  var MAX_AGE = 14 * 86400000, MAX_BYTES = 6000000;
  function createStore(env) {
    var opening;
    function database() {
      if (!opening) opening = new Promise(function (resolve) {
        var settled = false, timer = env.setTimeout(function () { settled = true; resolve(null); }, 700);
        try {
          var request = env.indexedDB.open('avitolog_read_cache_v1', 1);
          request.onupgradeneeded = function () { request.result.createObjectStore('views'); };
          request.onerror = request.onblocked = function () { settled=true;env.clearTimeout(timer); resolve(null); };
          request.onsuccess = function () { env.clearTimeout(timer); if (settled) request.result.close(); else resolve(request.result); };
        } catch (_) { env.clearTimeout(timer); resolve(null); }
      });
      return opening;
    }
    async function run(key, record, guard) {
      if (typeof key !== 'string' || key.length > 700 || guard && !guard()) return null;
      var db = await database(); if (!db || guard && !guard()) return null;
      return new Promise(function (resolve) {
        var tx, value = null, done = false;
        var timer = env.setTimeout(function () { try { if (tx) tx.abort(); } catch (_) {} finish(null); }, 1000);
        function finish(result) { if (done) return; done = true; env.clearTimeout(timer); resolve(result); }
        try {
          tx = db.transaction('views', record === undefined ? 'readonly' : 'readwrite');
          var request = record === undefined ? tx.objectStore('views').get(key) : tx.objectStore('views').put(record, key);
          request.onsuccess = function () { value = request.result; };
          tx.oncomplete = function () { finish(guard && !guard() ? null : record === undefined ? value : true); };
          tx.onerror = tx.onabort = function () { finish(null); };
        } catch (_) { finish(null); }
      });
    }
    return {
      read: async function (key, guard) {
        var record = await run(key, undefined, guard), now = Date.now();
        return record && record.version === 1 && record.at <= now + 5000 && now - record.at <= MAX_AGE ? record.value : null;
      },
      write: function (key, value, guard) {
        try { var packed = JSON.stringify(value); if (packed.length > MAX_BYTES) return Promise.resolve(null); }
        catch (_) { return Promise.resolve(null); }
        return run(key, { version: 1, at: Date.now(), value: value }, guard);
      }
    };
  }
  function validProjects(value) { return !!value && Array.isArray(value.projects) && value.projects.length <= 10000 && (!value.tasks || Array.isArray(value.tasks)); }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { createStore: createStore, validProjects: validProjects }; return; }
  if (!root || root.AVBStartupCache) return;
  var pdfTask;
  root.__avitologEnsurePdf=function(){
    if(typeof root.html2pdf==='function')return Promise.resolve(root.html2pdf);
    if(pdfTask)return pdfTask;
    pdfTask=new Promise(function(resolve,reject){
      var script=root.document.querySelector('script[data-pdf-runtime]'),timer,done=false,fallback;
      function finish(error){if(done)return;done=true;root.clearTimeout(timer);if(script){script.removeEventListener('load',loaded);script.removeEventListener('error',loadFallback);}error?reject(error):resolve(root.html2pdf);}
      function loaded(){if(typeof root.html2pdf==='function')finish();else loadFallback();}
      function loadFallback(){if(fallback||done)return;fallback=root.document.createElement('script');fallback.src='https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';fallback.async=true;fallback.onload=loaded;fallback.onerror=function(){finish(Error('Не удалось загрузить модуль PDF. Повторите загрузку документа.'));};root.document.head.appendChild(fallback);}
      if(script){script.addEventListener('load',loaded);script.addEventListener('error',loadFallback);root.setTimeout(loadFallback,5000);}else loadFallback();
      timer=root.setTimeout(function(){finish(Error('Модуль PDF пока недоступен. Повторите загрузку документа.'));},20000);
    }).catch(function(error){pdfTask=null;throw error;});return pdfTask;
  };
  var store = createStore(root), preview = null, previewOwner = '', readOwner = '', latest = 0, navigationUsed = false, touched = false;
  if (!root.AVITOLOG_BACKEND_MODE) { root.AVBStartupCache={read:store.read,write:store.write};return; }
  function context() { try { return root.__avitologBackendCachedViewScope && root.__avitologBackendCachedViewScope() || ''; } catch (_) { return ''; } }
  function navKey(owner) { return 'avitolog_last_view_v1:' + owner; }
  function nav() { try { var value = JSON.parse(root.localStorage.getItem(navKey(context())) || 'null'); return value && ['projects','accounts','goals','analytics','assets','tasks','ads'].indexOf(value.tab) >= 0 ? value : null; } catch (_) { return null; } }
  function tab() {
    var body = root.document.body; if (!body) return '';
    if (body.classList.contains('avito-accounts-mode')) return 'accounts';
    return ['projects','goals','assets','tasks','ads'].find(function (key) { return body.classList.contains(key + '-mode'); }) || 'analytics';
  }
  function positions() {
    return Array.from(root.document.querySelectorAll('#mainContent .projects-table-wrap,#mainContent .projects-scroll,#mainContent')).slice(0,1000).map(function (el) { return [el.scrollLeft,el.scrollTop]; });
  }
  function restoreScroll(value) {
    value=value&&value.projects||value;
    if (!value || !Array.isArray(value.scroll)) return;
    root.requestAnimationFrame(function () { Array.from(root.document.querySelectorAll('#mainContent .projects-table-wrap,#mainContent .projects-scroll,#mainContent')).forEach(function (el,i) { var p=value.scroll[i]; if (p && p.length===2) { el.scrollLeft=Number(p[0])||0;el.scrollTop=Number(p[1])||0; } }); });
  }
  function rememberNavigation() {
    var owner=context(); if (!owner || !root.document.body) return;
    try { var previous=nav()||{},current=tab();root.localStorage.setItem(navKey(owner),JSON.stringify({tab:current,projects:current==='projects'?{zone:root._projectsZoneTab||'active',scroll:positions()}:previous.projects})); } catch (_) {}
  }
  function restoreNavigation() {
    if (navigationUsed || touched) return true;
    var value=nav(); if (!value) return false;
    navigationUsed=true;
    if (value.tab==='accounts' && root.AVITOLOG_MAIN_MENU_SETTINGS) { root.AVITOLOG_MAIN_MENU_SETTINGS.init(); root.AVITOLOG_MAIN_MENU_SETTINGS.openAccounts(); }
    else {
      var name={projects:'openProjectsTab',goals:'openGoalsTab',analytics:'openAnalyticsTab',assets:'openAssetsTab',tasks:'openTasksTab',ads:'openAdsTab'}[value.tab];
      if (typeof root[name]!=='function') return false; root[name]();
      if (value.tab==='projects' && value.projects && ['active','second_chance','archive'].indexOf(value.projects.zone)>=0) { root._projectsZoneTab=value.projects.zone;root.renderProjectsScreen();restoreScroll(value); }
    }
    return true;
  }
  function refreshPreview() {
    var owner=context(), pending=root.AVITOLOG_BACKEND_SERVER_ONLY && root.AVITOLOG_BACKEND_INITIAL_SYNC_READY!==true;
    if (owner!==previewOwner) { var hadPreview=!!preview;preview=null;previewOwner=owner;if(hadPreview&&pending&&root.projectsMode){var oldMain=root.document.getElementById('mainContent');if(oldMain)oldMain.replaceChildren();if(root.renderProjectsScreen)root.renderProjectsScreen();} }
    var main=root.document.getElementById('mainContent');
    if (main) main.inert=!!(pending && tab()==='projects');
    var badge=root.document.getElementById('startupCacheStatus');
    if (!pending || !owner || tab()!=='projects') { if(badge)badge.remove(); }
    else if (!badge) { badge=root.document.createElement('div');badge.id='startupCacheStatus';badge.style.cssText='position:fixed;right:14px;bottom:10px;z-index:20000;padding:5px 9px;border:1px solid #4f8ba266;border-radius:8px;background:#12232bee;color:#dcecf3;font:11px sans-serif;pointer-events:none';badge.textContent='Предыдущие данные · обновляем · пока только просмотр';root.document.body.appendChild(badge); }
    if (!pending || !owner || readOwner===owner) return;
    readOwner=owner; var revision=latest;
    store.read('projects:'+owner,function(){return context()===owner;}).then(function(value){
      if(context()!==owner||latest!==revision||root.AVITOLOG_BACKEND_INITIAL_SYNC_READY===true||!value||!validProjects(value.data))return;
      preview=value.data;previewOwner=owner;
      if(root.projectsMode&&typeof root.rerenderProjectsPreserveScroll==='function'){root.rerenderProjectsPreserveScroll();restoreScroll(nav());}
    });
  }
  root.AVBStartupCache={
    read:store.read,write:store.write,restoreNavigation:restoreNavigation,
    projects:function(){return preview&&previewOwner===context()?JSON.parse(JSON.stringify(preview)):null;},
    rememberProjects:function(owner,key,raw){
      if(!owner||owner!==context())return;var data;try{data=JSON.parse(raw);}catch(_){return;}if(!validProjects(data))return;
      latest++;store.write('projects:'+owner,{key:key,data:data},function(){return context()===owner;});
    }
  };
  root.addEventListener('pagehide',rememberNavigation);
  root.addEventListener('storage',refreshPreview);
  root.document.addEventListener('visibilitychange',function(){if(root.document.hidden)rememberNavigation();});
  root.document.addEventListener('click',function(event){if(event.isTrusted&&event.target.closest&&event.target.closest('#analyticsTopRow button')){rememberNavigation();touched=true;root.setTimeout(rememberNavigation,0);}},true);
  root.document.addEventListener('avitolog:backend-initial-ready',function(){refreshPreview();root.setTimeout(function(){if(root.projectsMode&&root.renderProjectsScreen){root.renderProjectsScreen();restoreScroll(nav());}},0);});
  function init(){
    var original=root.openProjectsTab;
    if(typeof original==='function')root.openProjectsTab=function(){var saved=nav(),value=original.apply(this,arguments);if(saved&&saved.projects&&['active','second_chance','archive'].indexOf(saved.projects.zone)>=0){root._projectsZoneTab=saved.projects.zone;if(root.renderProjectsScreen)root.renderProjectsScreen();restoreScroll(saved);}return value;};
    var scrollTimer;root.document.addEventListener('scroll',function(){if(tab()!=='projects'||scrollTimer)return;scrollTimer=root.setTimeout(function(){scrollTimer=null;rememberNavigation();},200);},true);
    refreshPreview();root.setTimeout(restoreNavigation,0);
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init);else init();
  root.setInterval(refreshPreview,700);
})(typeof window!=='undefined'?window:null);
