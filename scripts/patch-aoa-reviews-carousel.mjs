import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const cssOld = `/* REVIEWS — окно как браузер + живой профиль Авито */
.reviews-sec{padding:80px 80px 100px}
.rv-cta{margin-bottom:18px}
.rv-avito-window{margin-top:12px;border-radius:14px;overflow:hidden;border:1px solid var(--border);background:linear-gradient(180deg,#151a24,#0a0e14);box-shadow:0 0 0 1px rgba(255,255,255,.06),0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);max-width:1100px;margin-left:auto;margin-right:auto}
.rv-avito-winbar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(180deg,#1c1f28,#12151c);border-bottom:1px solid rgba(255,255,255,.08)}
.rv-avito-dots{display:flex;gap:6px;flex-shrink:0}
.rv-avito-dots i{width:10px;height:10px;border-radius:50%;background:#444;display:block}
.rv-avito-dots i:first-child{background:#ff5f57}
.rv-avito-dots i:nth-child(2){background:#febc2e}
.rv-avito-dots i:nth-child(3){background:#28c840}
.rv-avito-win-title{font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:rgba(240,244,255,.75);text-transform:uppercase;flex:1;text-align:center}
.rv-avito-win-spacer{width:48px;flex-shrink:0}
.rv-avito-urlbar{display:flex;align-items:center;gap:8px;padding:8px 12px 10px;background:#0d1018;border-bottom:1px solid rgba(255,255,255,.06)}
.rv-avito-lock{opacity:.6;font-size:12px;line-height:1}
.rv-avito-url-text{font-size:12px;color:rgba(180,200,230,.9);font-family:ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.rv-avito-frame-wrap{position:relative;width:100%;min-height:min(72vh,720px);height:72vh;max-height:720px;background:#0a0a0c;--rv-iframe-pull:0px;overflow:hidden}
.rv-avito-iframe{position:absolute;left:0;width:100%;height:calc(100% + var(--rv-iframe-pull));top:calc(-1 * var(--rv-iframe-pull));border:0;display:block;background:#fff}
.rv-avito-note{margin-top:16px;font-size:12px;color:var(--muted);text-align:center;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.5}
.rv-avito-note a{color:var(--cyan);text-decoration:none;border-bottom:1px dashed rgba(0,207,255,.35)}
.rv-avito-note a:hover{color:#fff;border-bottom-color:var(--cyan)}
@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px}
.rv-avito-frame-wrap{height:65vh;min-height:min(65vh,560px)}
.rv-avito-win-title{font-size:10px;letter-spacing:1px}
}`;

const cssNew = `/* REVIEWS — карусель скриншотов отзывов с Авито */
.reviews-sec{padding:80px 80px 100px}
.rv-cta{margin-bottom:18px}
.rv-carousel-wrap{margin-top:16px;border-radius:16px;overflow:hidden;border:1px solid var(--border);background:linear-gradient(180deg,#151a24,#0a0e14);box-shadow:0 0 0 1px rgba(255,255,255,.06),0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);max-width:1100px;margin-left:auto;margin-right:auto}
.rv-carousel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:linear-gradient(180deg,#1c1f28,#12151c);border-bottom:1px solid rgba(255,255,255,.08)}
.rv-carousel-title{font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:rgba(240,244,255,.85);text-transform:uppercase}
.rv-carousel-nav{display:flex;gap:8px}
.rv-carousel-btn{width:42px;height:42px;border-radius:10px;border:1px solid var(--border-r);background:rgba(232,0,29,.2);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s,opacity .2s}
.rv-carousel-btn:hover:not(:disabled){background:var(--red);border-color:var(--red)}
.rv-carousel-btn:disabled{opacity:.35;cursor:default}
.rv-carousel-viewport{position:relative;width:100%;overflow:hidden;background:#eceff4}
.rv-carousel-track{display:flex;transition:transform .45s cubic-bezier(.25,.8,.25,1);will-change:transform}
.rv-carousel-slide{flex:0 0 100%;width:100%;min-width:100%;box-sizing:border-box}
.rv-carousel-slide img{width:100%;height:auto;display:block;vertical-align:middle}
.rv-carousel-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:14px 12px;background:#0d1018;border-top:1px solid rgba(255,255,255,.06)}
.rv-carousel-dot{width:9px;height:9px;border-radius:50%;border:1px solid var(--border);background:transparent;cursor:pointer;padding:0;transition:all .2s}
.rv-carousel-dot.active{background:var(--red);border-color:var(--red);box-shadow:0 0 10px var(--red-glow)}
.rv-avito-note{margin-top:16px;font-size:12px;color:var(--muted);text-align:center;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.5}
.rv-avito-note a{color:var(--cyan);text-decoration:none;border-bottom:1px dashed rgba(0,207,255,.35)}
.rv-avito-note a:hover{color:#fff;border-bottom-color:var(--cyan)}
@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}`;

const htmlOld = `  <p class="sec-desc">Ниже — страница бренда с отзывами и услугами, как в окне Авито.</p>
  <a href="https://www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy?sellerId=8027d3f86387132e7d279156557bc0ab" target="_blank" rel="noopener" class="btn btn-red rv-cta">Открыть на avito.ru в новой вкладке</a>

  <div class="rv-avito-window">
    <div class="rv-avito-winbar">
      <span class="rv-avito-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="rv-avito-win-title">Отзывы на Авито</span>
      <span class="rv-avito-win-spacer"></span>
    </div>
    <div class="rv-avito-urlbar">
      <span class="rv-avito-lock" title="HTTPS">🔒</span>
      <span class="rv-avito-url-text">www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy — отзывы бренда</span>
    </div>
    <div class="rv-avito-frame-wrap">
      <iframe class="rv-avito-iframe" title="Отзывы и услуги на Авито" src="https://www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy?sellerId=8027d3f86387132e7d279156557bc0ab" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
    </div>
  </div>
  <p class="rv-avito-note">Если область выше пустая — Авито часто запрещает показ внутри чужих сайтов. Тогда откройте <a href="https://www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy?sellerId=8027d3f86387132e7d279156557bc0ab" target="_blank" rel="noopener">страницу бренда напрямую</a>.</p>`;

const v = "20260328-rv1";
const htmlNew = `  <p class="sec-desc">Скриншоты реальных отзывов с Авито — листайте карусель. Полный профиль откройте по ссылке.</p>
  <a href="https://www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy?sellerId=8027d3f86387132e7d279156557bc0ab" target="_blank" rel="noopener" class="btn btn-red rv-cta">Открыть на avito.ru в новой вкладке</a>

  <div class="rv-carousel-wrap" id="rvCarousel">
    <div class="rv-carousel-head">
      <span class="rv-carousel-title">Отзывы на Авито — скриншоты</span>
      <div class="rv-carousel-nav">
        <button type="button" class="rv-carousel-btn" id="rvPrev" aria-label="Предыдущий слайд">‹</button>
        <button type="button" class="rv-carousel-btn" id="rvNext" aria-label="Следующий слайд">›</button>
      </div>
    </div>
    <div class="rv-carousel-viewport" id="rvViewport">
      <div class="rv-carousel-track" id="rvTrack">
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-01.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 1" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-02.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 2" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-03.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 3" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-04.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 4" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-05.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 5" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-06.png?v=${v}" alt="Отзывы клиентов на Авито, фрагмент 6" loading="lazy" decoding="async" width="900" height="1200"></div>
      </div>
    </div>
    <div class="rv-carousel-dots" id="rvDots" role="tablist" aria-label="Слайды отзывов"></div>
  </div>
  <p class="rv-avito-note">Актуальные отзывы и рейтинг — на <a href="https://www.avito.ru/brands/ai_avitolog_fil_ai/all/otzyvy?sellerId=8027d3f86387132e7d279156557bc0ab" target="_blank" rel="noopener">странице бренда на Авито</a>.</p>`;

const scriptRv = `
<script>
(function(){
var vp=document.getElementById('rvViewport'),track=document.getElementById('rvTrack'),prev=document.getElementById('rvPrev'),next=document.getElementById('rvNext'),dotsEl=document.getElementById('rvDots');
if(!vp||!track||!prev||!next||!dotsEl)return;
var slides=track.querySelectorAll('.rv-carousel-slide'),n=slides.length,idx=0;
function slideW(){return vp.offsetWidth}
function go(i){
  idx=Math.max(0,Math.min(i,n-1));
  track.style.transform='translateX('+(-idx*slideW())+'px)';
  dotsEl.querySelectorAll('.rv-carousel-dot').forEach(function(d,k){d.classList.toggle('active',k===idx);d.setAttribute('aria-selected',k===idx?'true':'false')});
  prev.disabled=idx===0;
  next.disabled=idx===n-1;
}
for(var i=0;i<n;i++){
  var dot=document.createElement('button');
  dot.type='button';
  dot.className='rv-carousel-dot'+(i===0?' active':'');
  dot.setAttribute('role','tab');
  dot.setAttribute('aria-label','Слайд '+(i+1));
  dot.setAttribute('aria-selected',i===0?'true':'false');
  dot.addEventListener('click',(function(j){return function(){go(j)}})(i));
  dotsEl.appendChild(dot);
}
prev.addEventListener('click',function(){go(idx-1)});
next.addEventListener('click',function(){go(idx+1)});
window.addEventListener('resize',function(){track.style.transition='none';go(idx);requestAnimationFrame(function(){track.style.transition=''})});
go(0);
})();
</script>
`;

if (!s.includes(cssOld)) {
  console.error("css block not found");
  process.exit(1);
}
if (!s.includes(htmlOld)) {
  console.error("html block not found");
  process.exit(1);
}
s = s.split(cssOld).join(cssNew);
s = s.split(htmlOld).join(htmlNew);

const injectBefore = "</body>\n</html>";
if (!s.includes(injectBefore)) {
  console.error("body end not found");
  process.exit(1);
}
if (!s.includes("id=\"rvCarousel\"")) {
  console.error("carousel html missing after replace");
  process.exit(1);
}
s = s.replace(injectBefore, scriptRv + "\n</body>\n</html>");

fs.writeFileSync(path, s, "utf8");
console.log("OK", fs.statSync(path).size);
