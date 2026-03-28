import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const bgV = "20260328-rvbg4";
const slideV = "20260328-rv2";

s = s.replace(
  /\s*<div class="reviews-bg-brand-mask" aria-hidden="true"><\/div>\s*\n?/,
  "\n"
);

const newCss = `/* REVIEWS — простая карусель отзывов, тёмный фон-картинка */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#020408;background-image:url('reviews-section-bg.png?v=${bgV}');background-size:cover;background-position:center 35%;background-repeat:no-repeat;background-attachment:scroll}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.82) 40%,rgba(0,0,0,.92) 100%);z-index:0;pointer-events:none}
.reviews-sec::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:0;pointer-events:none}
.reviews-sec > *{position:relative;z-index:1}
.reviews-sec .sec-title{color:#f0f4ff}
.reviews-sec .sec-desc{color:rgba(210,218,235,.92)}
.reviews-sec .rv-avito-note{color:rgba(190,200,220,.88)}
.rv-cta{margin-bottom:18px}
.rv-carousel-wrap{margin-top:16px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:rgba(6,8,12,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 16px 48px rgba(0,0,0,.55);max-width:900px;margin-left:auto;margin-right:auto}
.rv-carousel-head{display:none}
.rv-carousel-viewport{position:relative;width:100%;overflow:hidden;background:#0c0f16;padding:0;min-height:min(420px,62vh)}
.rv-carousel-edge{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:44px;height:80px;border:0;background:rgba(0,0,0,.35);color:rgba(255,255,255,.9);font-size:28px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,opacity .2s}
.rv-carousel-edge-prev{left:0;border-radius:0 12px 12px 0}
.rv-carousel-edge-next{right:0;border-radius:12px 0 0 12px}
.rv-carousel-edge:hover:not(:disabled){background:rgba(232,0,29,.4)}
.rv-carousel-edge:disabled{opacity:.25;cursor:default}
.rv-carousel-track{display:flex;transition:transform .45s cubic-bezier(.25,.8,.25,1);will-change:transform}
.rv-carousel-slide{flex:0 0 100%;width:100%;min-width:100%;box-sizing:border-box;padding:0 2px}
.rv-carousel-slide-inner{border-radius:10px;overflow:hidden;background:#e8ecf0;box-shadow:0 8px 32px rgba(0,0,0,.35)}
.rv-carousel-slide img{width:100%;height:auto;display:block;object-fit:contain;object-position:top center;vertical-align:middle}
.rv-carousel-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:12px 10px;background:rgba(0,0,0,.35);border-top:1px solid rgba(255,255,255,.08)}
.rv-carousel-dot{width:9px;height:9px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:transparent;cursor:pointer;padding:0;transition:all .2s}
.rv-carousel-dot.active{background:var(--red);border-color:var(--red);box-shadow:0 0 10px var(--red-glow)}
.rv-avito-note{margin-top:16px;font-size:12px;color:rgba(200,210,225,.85);text-align:center;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.5}
.rv-avito-note a{color:var(--cyan);text-decoration:none;border-bottom:1px dashed rgba(0,207,255,.35)}
.rv-avito-note a:hover{color:#fff;border-bottom-color:var(--cyan)}
@media(max-width:768px){
.reviews-sec{padding:48px 20px 56px;background-position:center top}
.rv-carousel-viewport{min-height:min(360px,58vh)}
.rv-carousel-edge{width:38px;height:68px;font-size:22px}
}`;

const start = s.indexOf("/* REVIEWS");
const turn = s.indexOf("/* TURNKEY", start);
if (start < 0 || turn < 0) {
  console.error("CSS markers not found");
  process.exit(1);
}
s = s.slice(0, start) + newCss + "\n\n" + s.slice(turn);

s = s.replace(/reviews-carousel\/slide-\d+\.png\?v=[^"']+/g, (m) =>
  m.replace(/\?v=[^"']+/, `?v=${slideV}`)
);

const oldJs = `(function(){
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
})();`;

const newJs = `(function(){
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
window.addEventListener('load',function(){go(idx)});
go(0);
})();`;

if (!s.includes(oldJs)) {
  console.error("carousel JS pattern not found");
  process.exit(1);
}
s = s.split(oldJs).join(newJs);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
