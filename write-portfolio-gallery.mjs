import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>Галерея работ — Портфолио | Aces of Ads</title>
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600;700;800;900&family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#080b12;--bg2:#0d1219;--surface:#111821;--s2:#161f2e;--red:#e8001d;--red2:#ff2040;--red-dim:rgba(232,0,29,.12);--red-glow:rgba(232,0,29,.4);--cyan:#00cfff;--text:#f0f4ff;--muted:#7a9abb;--border:rgba(255,255,255,.1);--border-r:rgba(232,0,29,.3)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'Exo 2',sans-serif;font-size:15px;line-height:1.6;overflow-x:hidden;min-height:100vh;padding-top:60px}
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px);pointer-events:none;z-index:9999}
nav{position:fixed;top:0;left:0;right:0;z-index:500;height:60px;padding:0 24px 0 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(8,11,18,.92);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
nav::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--red),transparent);opacity:.6}
.nav-logo{font-family:'Oswald',sans-serif;font-size:22px;font-weight:700;color:var(--text);text-decoration:none;letter-spacing:3px;display:flex;align-items:center;gap:10px}
.logo-badge{background:var(--red);color:#fff;font-size:8px;font-weight:700;letter-spacing:2px;padding:3px 8px;text-transform:uppercase}
.nav-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.nav-back{color:var(--muted);text-decoration:none;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:9px 18px;border:1px solid var(--border);transition:all .2s}
.nav-back:hover{color:var(--red);border-color:var(--border-r);background:var(--red-dim)}
.nav-sec{color:var(--muted);text-decoration:none;font-size:10px;font-weight:700;letter-spacing:1px;padding:8px 12px;border:1px dashed var(--border)}
.nav-sec:hover{color:var(--cyan);border-color:var(--cyan)}
.portfolio-hero{padding:48px 48px 32px;max-width:1200px;margin:0 auto}
.hero-lbl{display:inline-flex;align-items:center;gap:12px;font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--cyan);margin-bottom:16px}
.hero-lbl::before{content:'';width:32px;height:1px;background:var(--cyan);box-shadow:0 0 8px var(--cyan)}
.portfolio-h1{font-family:'Oswald',sans-serif;font-size:clamp(36px,6vw,72px);font-weight:700;line-height:1.05;letter-spacing:-.5px;margin-bottom:12px}
.portfolio-h1 .accent{color:var(--red);text-shadow:0 0 40px rgba(232,0,29,.35)}
.portfolio-sub{font-family:'Oswald',sans-serif;font-size:clamp(18px,2.5vw,26px);font-weight:400;color:rgba(240,244,255,.65);letter-spacing:1px}
.filters-wrap{max-width:1200px;margin:0 auto;padding:0 48px 28px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.fbtn{padding:10px 18px;background:transparent;border:1px solid var(--border);color:var(--muted);font-family:'Exo 2',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;cursor:pointer;transition:all .2s;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))}
.fbtn:hover,.fbtn.active{background:var(--red-dim);border-color:var(--red);color:var(--red)}
.sec-pick{max-width:1200px;margin:0 auto;padding:0 48px 20px}
.sec-lbl{display:flex;align-items:center;gap:14px;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--red);margin-bottom:14px}
.sec-lbl::before{content:'';width:36px;height:2px;background:var(--red);box-shadow:0 0 8px var(--red)}
.pick-scroll{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 8px;padding:8px 4px 20px;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--red) transparent}
.pick-scroll::-webkit-scrollbar{height:6px}
.pick-scroll::-webkit-scrollbar-thumb{background:var(--red-dim);border-radius:3px}
.pick-card{flex:0 0 200px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);cursor:pointer;transition:all .25s;display:flex;flex-direction:column;overflow:hidden;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}
.pick-card:hover,.pick-card.is-active{border-color:var(--red);box-shadow:0 8px 32px rgba(0,0,0,.45),0 0 0 1px rgba(232,0,29,.2)}
.pick-card.is-active{background:rgba(232,0,29,.06)}
.pick-thumb{aspect-ratio:4/3;background:var(--surface);position:relative;overflow:hidden}
.pick-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.pick-thumb .ph-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:42px;opacity:.35;background:linear-gradient(145deg,var(--s2),var(--bg))}
.pick-meta{padding:12px 14px 14px;display:flex;gap:10px;align-items:flex-start}
.pick-emoji{font-size:22px;line-height:1;flex-shrink:0}
.pick-name{font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;letter-spacing:.3px;line-height:1.35;color:var(--text)}
.gallery-sec{min-height:40vh;padding:8px 48px 80px;max-width:1400px;margin:0 auto}
.gallery-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.gallery-title{font-family:'Oswald',sans-serif;font-size:20px;font-weight:600;letter-spacing:.5px}
.gallery-title span{color:var(--red)}
.gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
@media(min-width:900px){.gallery-grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}}
.g-item{position:relative;aspect-ratio:1;background:var(--surface);border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:border-color .2s,transform .2s}
.g-item:hover{border-color:var(--border-r);transform:scale(1.02);z-index:2}
.g-item img{width:100%;height:100%;object-fit:cover;display:block}
.g-item .ph-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;opacity:.3}
.empty-gallery{padding:48px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--border);background:rgba(0,0,0,.2)}
.lb-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,8,12,.94);display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px)}
.lb-overlay.is-open{display:flex}
.lb-inner{position:relative;width:100%;max-width:min(96vw,1200px);max-height:92vh;display:flex;align-items:center;justify-content:center}
.lb-inner img{max-width:100%;max-height:88vh;object-fit:contain;display:block;border:1px solid var(--border-r);box-shadow:0 20px 80px rgba(0,0,0,.6)}
.lb-close{position:absolute;top:-8px;right:0;width:48px;height:48px;border:1px solid var(--border);background:rgba(8,11,18,.9);color:var(--text);font-size:28px;line-height:1;cursor:pointer;z-index:2;transition:all .2s}
.lb-close:hover{border-color:var(--red);color:var(--red)}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;border:1px solid var(--border-r);background:rgba(232,0,29,.85);color:#fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:2}
.lb-nav:hover{background:var(--red);box-shadow:0 0 24px var(--red-glow)}
.lb-nav.prev{left:8px}
.lb-nav.next{right:8px}
.lb-cap{position:absolute;bottom:-40px;left:0;right:0;text-align:center;font-size:12px;color:var(--muted)}
@media(max-width:640px){.lb-nav{width:44px;height:44px;font-size:20px}.lb-nav.prev{left:4px}.lb-nav.next{right:4px}nav{padding:0 16px 0 20px}.portfolio-hero,.filters-wrap,.sec-pick,.gallery-sec{padding-left:20px;padding-right:20px}}
footer{background:var(--bg);border-top:1px solid var(--border);padding:28px 48px;text-align:center;font-size:11px;color:var(--muted);letter-spacing:1px}
footer a{color:var(--cyan);text-decoration:none}
</style>
</head>
<body>
<nav>
  <a class="nav-logo" href="index.html">ACES <span class="logo-badge">OF ADS</span></a>
  <div class="nav-tools">
    <a class="nav-sec" href="portfolio-showcase.html">Только макеты (без фото)</a>
    <a class="nav-back" href="index.html">← На главную</a>
  </div>
</nav>
<header class="portfolio-hero">
  <div class="hero-lbl">Реальные скриншоты магазинов</div>
  <h1 class="portfolio-h1"><span class="accent">ПОРТФОЛИО</span> ДИЗАЙНОВ</h1>
  <p class="portfolio-sub">Фото из папки проекта · фильтры · лайтбокс</p>
</header>
<section class="filters-wrap" aria-label="Фильтры"><div class="filters" id="filterBar"></div></section>
<section class="sec-pick">
  <div class="sec-lbl">Выбор проекта</div>
  <div class="pick-scroll" id="projectPicker" role="list"></div>
</section>
<section class="gallery-sec" id="gallerySection">
  <div class="gallery-head"><h2 class="gallery-title">Галерея: <span id="galleryProjectName">—</span></h2></div>
  <div class="gallery-grid" id="galleryGrid"></div>
  <div class="empty-gallery" id="galleryEmpty" hidden>Нет проектов в этой категории.</div>
</section>
<div class="lb-overlay" id="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр фото">
  <button type="button" class="lb-close" id="lbClose" aria-label="Закрыть">×</button>
  <button type="button" class="lb-nav prev" id="lbPrev" aria-label="Предыдущее">‹</button>
  <button type="button" class="lb-nav next" id="lbNext" aria-label="Следующее">›</button>
  <div class="lb-inner">
    <img src="" alt="" id="lbImg">
    <div class="lb-cap" id="lbCap"></div>
  </div>
</div>
<footer>
  <a href="index.html">Aces of Ads</a> · галерея с фото · <a href="portfolio-showcase.html">страница с макетами</a>
</footer>
<script src="portfolio-manifest.js?v=20260328-7"></script>
<script>
const projects=[{id:'disk-bdm',name:'Диск БДМ АЛМАЗ',category:'selhhoz',emoji:'⚙️'},{id:'zhatka-zhvr',name:'Жатка ЖВР-5',category:'selhhoz',emoji:'🌾'},{id:'harmony-orlando',name:'ORLANDO Мебель',category:'mebel',emoji:'🛋'},{id:'sergey-stroy',name:'Фундамент под ключ',category:'stroika',emoji:'🏗'},{id:'swantrade',name:'Представитель в Китае',category:'uslugi',emoji:'🇨🇳'},{id:'santehnika',name:'Сантехника под ключ',category:'uslugi',emoji:'🔧'},{id:'monolit-dom',name:'Монолитный дом',category:'stroika',emoji:'🏠'},{id:'gazoblok-dom',name:'Коробка из газоблока',category:'stroika',emoji:'🧱'},{id:'elektromontazh',name:'Электромонтаж',category:'uslugi',emoji:'⚡'},{id:'styazhka-pola',name:'Стяжка пола',category:'stroika',emoji:'🏢'},{id:'karkasnyy-dom',name:'Каркасный дом A-Frame',category:'stroika',emoji:'🏡'}];
const FILTER_DEF=[{key:'all',label:'Все'},{key:'selhhoz',label:'Сельхозтехника'},{key:'stroika',label:'Строительство'},{key:'mebel',label:'Мебель'},{key:'uslugi',label:'Услуги'},{key:'oborudovanie',label:'Оборудование'}];
function padNum(n){return n<10?'0'+n:String(n)}
function encodeAssetPath(p){return p.split('/').map(function(s){return encodeURIComponent(s)}).join('/')}
function getProjectImageUrls(id){var r=(typeof window!=='undefined'&&window.PORTFOLIO_IMAGES&&window.PORTFOLIO_IMAGES[id])||[];if(!r.length)return[];return r.map(encodeAssetPath)}
let activeFilter='all',selectedProjectId=null,lbIndex=0,lbUrls=[];
function filteredProjects(){if(activeFilter==='all')return projects.slice();return projects.filter(function(p){return p.category===activeFilter})}
function renderFilters(){var bar=document.getElementById('filterBar');bar.innerHTML='';FILTER_DEF.forEach(function(f){var b=document.createElement('button');b.type='button';b.className='fbtn'+(f.key===activeFilter?' active':'');b.textContent=f.label;b.addEventListener('click',function(){activeFilter=f.key;renderFilters();renderPicker();var list=filteredProjects();if(list.length)selectProject(list[0].id,true);else{selectedProjectId=null;renderGallery()}});bar.appendChild(b)})}
function renderPicker(){var el=document.getElementById('projectPicker');el.innerHTML='';filteredProjects().forEach(function(p){var card=document.createElement('button');card.type='button';card.className='pick-card'+(p.id===selectedProjectId?' is-active':'');card.setAttribute('role','listitem');var thumb=document.createElement('div');thumb.className='pick-thumb';var img=document.createElement('img');img.alt='';img.loading='lazy';var thumbs=getProjectImageUrls(p.id);img.src=thumbs[0]||'';img.onerror=function(){img.style.display='none';if(!thumb.querySelector('.ph-fallback')){var fb=document.createElement('div');fb.className='ph-fallback';fb.textContent=p.emoji||'📷';thumb.appendChild(fb)}};thumb.appendChild(img);var meta=document.createElement('div');meta.className='pick-meta';var em=document.createElement('span');em.className='pick-emoji';em.textContent=p.emoji||'';var nm=document.createElement('span');nm.className='pick-name';nm.textContent=p.name;meta.appendChild(em);meta.appendChild(nm);card.appendChild(thumb);card.appendChild(meta);card.addEventListener('click',function(){selectProject(p.id,true)});el.appendChild(card)})}
function getProject(id){for(var i=0;i<projects.length;i++){if(projects[i].id===id)return projects[i]}return null}
function selectProject(id,sv){selectedProjectId=id;renderPicker();renderGallery();if(sv){var a=document.querySelector('.pick-card.is-active');if(a&&a.scrollIntoView)a.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})}}
function renderGallery(){var grid=document.getElementById('galleryGrid'),title=document.getElementById('galleryProjectName'),empty=document.getElementById('galleryEmpty');grid.innerHTML='';var p=selectedProjectId?getProject(selectedProjectId):null;if(!p){title.textContent='—';empty.hidden=filteredProjects().length!==0;if(filteredProjects().length===0)empty.hidden=false;return}empty.hidden=true;title.textContent=p.name;lbUrls=getProjectImageUrls(p.id);if(!lbUrls.length){var w=document.createElement('div');w.className='empty-gallery';w.style.cssText='grid-column:1/-1;border:none;padding:24px;text-align:left;font-size:13px';w.innerHTML='Нет manifest. Нужны portfolio-manifest.js и portfolio-images. Команда: node build-portfolio-manifest.js';grid.appendChild(w);return}lbUrls.forEach(function(url,idx){var cell=document.createElement('div');cell.className='g-item';var img=document.createElement('img');img.alt=p.name+' — '+(idx+1);img.loading='lazy';img.src=url;img.onerror=function(){img.style.display='none';if(!cell.querySelector('.ph-fallback')){var fb=document.createElement('div');fb.className='ph-fallback';fb.textContent=padNum(idx+1);cell.appendChild(fb)}};cell.appendChild(img);cell.addEventListener('click',function(){openLightbox(idx)});grid.appendChild(cell)})}
function openLightbox(i){if(!lbUrls.length)return;lbIndex=Math.max(0,Math.min(lbUrls.length-1,i));document.getElementById('lbImg').src=lbUrls[lbIndex];document.getElementById('lbCap').textContent=(lbIndex+1)+' / '+lbUrls.length;document.getElementById('lightbox').classList.add('is-open');document.body.style.overflow='hidden'}
function closeLightbox(){document.getElementById('lightbox').classList.remove('is-open');document.body.style.overflow=''}
function lbStep(d){if(!lbUrls.length)return;lbIndex=(lbIndex+d+lbUrls.length)%lbUrls.length;document.getElementById('lbImg').src=lbUrls[lbIndex];document.getElementById('lbCap').textContent=(lbIndex+1)+' / '+lbUrls.length}
document.getElementById('lbClose').addEventListener('click',closeLightbox);
document.getElementById('lbPrev').addEventListener('click',function(e){e.stopPropagation();lbStep(-1)});
document.getElementById('lbNext').addEventListener('click',function(e){e.stopPropagation();lbStep(1)});
document.getElementById('lightbox').addEventListener('click',function(e){if(e.target.id==='lightbox')closeLightbox()});
document.addEventListener('keydown',function(e){var o=document.getElementById('lightbox');if(!o.classList.contains('is-open'))return;if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')lbStep(-1);if(e.key==='ArrowRight')lbStep(1)});
(function(){renderFilters();var list=filteredProjects();if(list.length)selectProject(list[0].id,false);else renderGallery()})();
</script>
</body>
</html>`;

const targets = [
  path.join(__dirname, "AOA-Land", "portfolio.html"),
  path.join(__dirname, "..", "AOA-Land", "portfolio.html"),
];
for (const t of targets) {
  try {
    fs.writeFileSync(t, html, "utf8");
    console.log("OK", t, fs.statSync(t).size);
  } catch (e) {
    console.warn("skip", t, e.message);
  }
}
