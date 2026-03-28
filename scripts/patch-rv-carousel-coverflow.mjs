import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldCss = `.rv-carousel-wrap{margin-top:16px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(8,10,16,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.06),0 28px 64px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.06);max-width:1100px;margin-left:auto;margin-right:auto}
.rv-carousel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:linear-gradient(180deg,rgba(20,24,32,.95),rgba(10,12,18,.92));border-bottom:1px solid rgba(255,255,255,.1)}
.rv-carousel-title{font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:rgba(240,244,255,.9);text-transform:uppercase}
.rv-carousel-nav{display:flex;gap:8px}
.rv-carousel-btn{width:42px;height:42px;border-radius:10px;border:1px solid var(--border-r);background:rgba(232,0,29,.22);color:#fff;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s,opacity .2s}
.rv-carousel-btn:hover:not(:disabled){background:var(--red);border-color:var(--red)}
.rv-carousel-btn:disabled{opacity:.35;cursor:default}
.rv-carousel-viewport{position:relative;width:100%;overflow:hidden;background:#e8ecf2}
.rv-carousel-track{display:flex;transition:transform .45s cubic-bezier(.25,.8,.25,1);will-change:transform}
.rv-carousel-slide{flex:0 0 100%;width:100%;min-width:100%;box-sizing:border-box}
.rv-carousel-slide img{width:100%;height:auto;display:block;vertical-align:middle}
.rv-carousel-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:14px 12px;background:rgba(6,8,12,.88);border-top:1px solid rgba(255,255,255,.08)}
.rv-carousel-dot{width:9px;height:9px;border-radius:50%;border:1px solid var(--border);background:transparent;cursor:pointer;padding:0;transition:all .2s}
.rv-carousel-dot.active{background:var(--red);border-color:var(--red);box-shadow:0 0 10px var(--red-glow)}`;

const newCss = `.rv-carousel-wrap{margin-top:16px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(8,10,16,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.06),0 28px 64px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.06);max-width:1100px;margin-left:auto;margin-right:auto}
.rv-carousel-head{display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 16px;background:linear-gradient(180deg,rgba(20,24,32,.95),rgba(10,12,18,.92));border-bottom:1px solid rgba(255,255,255,.1)}
.rv-carousel-title{font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:rgba(240,244,255,.9);text-transform:uppercase;text-align:center}
.rv-carousel-viewport{position:relative;width:100%;overflow:hidden;background:linear-gradient(180deg,#dfe5ee,#e8ecf2);padding:28px 44px 20px;min-height:min(580px,72vh)}
.rv-carousel-edge{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:46px;height:86px;border:1px solid rgba(255,255,255,.12);background:rgba(6,8,14,.38);color:rgba(255,255,255,.92);font-size:30px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s,opacity .2s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rv-carousel-edge-prev{left:6px;border-radius:0 14px 14px 0}
.rv-carousel-edge-next{right:6px;border-radius:14px 0 0 14px}
.rv-carousel-edge:hover:not(:disabled){background:rgba(232,0,29,.32);border-color:rgba(232,0,29,.45)}
.rv-carousel-edge:disabled{opacity:.28;cursor:default}
.rv-carousel-track{display:flex;flex-direction:row;align-items:center;gap:clamp(10px,2vw,18px);transition:transform .5s cubic-bezier(.25,.82,.2,1);will-change:transform;padding:0 4px}
.rv-carousel-slide{flex:0 0 auto;width:clamp(150px,26vw,280px);height:clamp(200px,30vh,300px);min-height:200px;border-radius:18px;overflow:hidden;box-sizing:border-box;opacity:.72;transition:width .5s cubic-bezier(.25,.82,.2,1),height .5s cubic-bezier(.25,.82,.2,1),opacity .45s,box-shadow .45s,border-radius .45s;box-shadow:0 10px 28px rgba(0,0,0,.28)}
.rv-carousel-slide.is-active{width:clamp(260px,48vw,620px);height:clamp(340px,64vh,560px);min-height:320px;opacity:1;z-index:2;border-radius:24px;box-shadow:0 22px 56px rgba(0,0,0,.45)}
.rv-carousel-slide-inner{width:100%;height:100%;border-radius:inherit;overflow:hidden;background:#111;position:relative}
.rv-carousel-slide img{width:100%;height:100%;display:block;object-fit:cover;object-position:center 18%;vertical-align:middle}
.rv-carousel-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:14px 12px;background:rgba(6,8,12,.88);border-top:1px solid rgba(255,255,255,.08)}
.rv-carousel-dot{width:9px;height:9px;border-radius:50%;border:1px solid var(--border);background:transparent;cursor:pointer;padding:0;transition:all .2s}
.rv-carousel-dot.active{background:var(--red);border-color:var(--red);box-shadow:0 0 10px var(--red-glow)}
@media(max-width:768px){
.rv-carousel-viewport{padding:22px 38px 16px;min-height:min(480px,68vh)}
.rv-carousel-edge{width:40px;height:72px;font-size:24px}
.rv-carousel-slide{width:clamp(120px,62vw,220px);height:clamp(160px,28vh,240px);min-height:160px;border-radius:14px}
.rv-carousel-slide.is-active{width:clamp(220px,84vw,100%);height:clamp(280px,52vh,440px);min-height:260px;border-radius:20px}
}`;

const oldHtml = `    <div class="rv-carousel-head">
      <span class="rv-carousel-title">Отзывы на Авито — скриншоты</span>
      <div class="rv-carousel-nav">
        <button type="button" class="rv-carousel-btn" id="rvPrev" aria-label="Предыдущий слайд">‹</button>
        <button type="button" class="rv-carousel-btn" id="rvNext" aria-label="Следующий слайд">›</button>
      </div>
    </div>
    <div class="rv-carousel-viewport" id="rvViewport">
      <div class="rv-carousel-track" id="rvTrack">
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-01.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 1" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-02.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 2" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-03.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 3" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-04.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 4" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-05.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 5" loading="lazy" decoding="async" width="900" height="1200"></div>
        <div class="rv-carousel-slide"><img src="reviews-carousel/slide-06.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 6" loading="lazy" decoding="async" width="900" height="1200"></div>
      </div>
    </div>`;

const newHtml = `    <div class="rv-carousel-head">
      <span class="rv-carousel-title">Отзывы на Авито — скриншоты</span>
    </div>
    <div class="rv-carousel-viewport" id="rvViewport">
      <button type="button" class="rv-carousel-edge rv-carousel-edge-prev" id="rvPrev" aria-label="Предыдущий слайд">‹</button>
      <button type="button" class="rv-carousel-edge rv-carousel-edge-next" id="rvNext" aria-label="Следующий слайд">›</button>
      <div class="rv-carousel-track" id="rvTrack">
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-01.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 1" loading="lazy" decoding="async" width="900" height="1200"></div></div>
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-02.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 2" loading="lazy" decoding="async" width="900" height="1200"></div></div>
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-03.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 3" loading="lazy" decoding="async" width="900" height="1200"></div></div>
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-04.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 4" loading="lazy" decoding="async" width="900" height="1200"></div></div>
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-05.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 5" loading="lazy" decoding="async" width="900" height="1200"></div></div>
        <div class="rv-carousel-slide"><div class="rv-carousel-slide-inner"><img src="reviews-carousel/slide-06.png?v=20260328-rv1" alt="Отзывы клиентов на Авито, фрагмент 6" loading="lazy" decoding="async" width="900" height="1200"></div></div>
      </div>
    </div>`;

const oldJs = `<script>
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
</script>`;

const newJs = `<script>
(function(){
var vp=document.getElementById('rvViewport'),track=document.getElementById('rvTrack'),prev=document.getElementById('rvPrev'),next=document.getElementById('rvNext'),dotsEl=document.getElementById('rvDots');
if(!vp||!track||!prev||!next||!dotsEl)return;
var slides=track.querySelectorAll('.rv-carousel-slide'),n=slides.length,idx=0;
function align(){
  var el=slides[idx];
  if(!el)return;
  var off=el.offsetLeft-(vp.clientWidth-el.offsetWidth)/2;
  track.style.transform='translateX('+(-off)+'px)';
}
function go(i){
  idx=Math.max(0,Math.min(i,n-1));
  for(var k=0;k<n;k++){slides[k].classList.toggle('is-active',k===idx)}
  dotsEl.querySelectorAll('.rv-carousel-dot').forEach(function(d,k){d.classList.toggle('active',k===idx);d.setAttribute('aria-selected',k===idx?'true':'false')});
  prev.disabled=idx===0;
  next.disabled=idx===n-1;
  track.style.transition='transform .5s cubic-bezier(.25,.82,.2,1)';
  requestAnimationFrame(function(){
    requestAnimationFrame(align);
  });
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
function onResize(){
  track.style.transition='none';
  align();
  requestAnimationFrame(function(){track.style.transition=''});
}
window.addEventListener('resize',onResize);
window.addEventListener('load',function(){go(idx)});
track.querySelectorAll('img').forEach(function(im){
  im.addEventListener('load',function(){go(idx)});
});
go(0);
})();
</script>`;

if (!s.includes(oldCss)) {
  console.error("oldCss not found");
  process.exit(1);
}
if (!s.includes(oldHtml)) {
  console.error("oldHtml not found");
  process.exit(1);
}
if (!s.includes(oldJs)) {
  console.error("oldJs not found");
  process.exit(1);
}

s = s.replace(oldCss, newCss);
s = s.replace(oldHtml, newHtml);
s = s.replace(oldJs, newJs);

// Remove duplicate mobile rules for .rv-carousel-btn if orphaned
const orphan = `@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px;background-position:center top}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}`;
const orphanFix = `@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px;background-position:center top}
}`;
if (s.includes(orphan)) s = s.replace(orphan, orphanFix);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
