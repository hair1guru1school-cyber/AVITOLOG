import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const v = "20260328-rvbg2";

const oldReviews = `/* REVIEWS — карусель скриншотов отзывов с Авито */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#050a12;background-image:url('reviews-section-bg-wide.png?v=20260328-rvbg');background-size:cover;background-position:center;background-repeat:no-repeat}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,14,.4) 0%,rgba(5,8,14,.62) 50%,rgba(5,8,14,.9) 100%);z-index:0;pointer-events:none}
.reviews-sec > *{position:relative;z-index:1}
.reviews-sec .sec-title{color:#f0f4ff}
.reviews-sec .sec-desc{color:rgba(200,210,230,.88)}
.reviews-sec .rv-avito-note{color:rgba(175,190,215,.78)}
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
.reviews-sec{padding:48px 24px 60px;background-image:url('reviews-section-bg.png?v=20260328-rvbg');background-position:center top}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}`;

const newReviews = `/* REVIEWS — карусель поверх фона «этапы» + сильное затемнение */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#04060a;background-image:url('reviews-section-bg.png?v=${v}');background-size:cover;background-position:center;background-repeat:no-repeat}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.58) 0%,rgba(2,4,8,.76) 45%,rgba(0,0,0,.88) 100%);z-index:0;pointer-events:none}
.reviews-sec::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.32);z-index:0;pointer-events:none}
.reviews-sec > *{position:relative;z-index:1}
.reviews-sec .sec-title{color:#f0f4ff}
.reviews-sec .sec-desc{color:rgba(200,210,230,.9)}
.reviews-sec .rv-avito-note{color:rgba(175,190,215,.82)}
.rv-cta{margin-bottom:18px}
.rv-carousel-wrap{margin-top:16px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(8,10,16,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.06),0 28px 64px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.06);max-width:1100px;margin-left:auto;margin-right:auto}
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
.rv-carousel-dot.active{background:var(--red);border-color:var(--red);box-shadow:0 0 10px var(--red-glow)}
.rv-avito-note{margin-top:16px;font-size:12px;color:var(--muted);text-align:center;max-width:640px;margin-left:auto;margin-right:auto;line-height:1.5}
.rv-avito-note a{color:var(--cyan);text-decoration:none;border-bottom:1px dashed rgba(0,207,255,.35)}
.rv-avito-note a:hover{color:#fff;border-bottom-color:var(--cyan)}
@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px;background-position:center top}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}`;

const oldRoot = `:root{
  /* WCAG AA: red #e8001d on #080b12 ~4.5:1, white on red >7:1 */
  --bg:#080b12;--bg2:#0d1219;--surface:#111821;--s2:#161f2e;
  --red:#e8001d;--red2:#ff2040;--red-dim:rgba(232,0,29,.12);--red-glow:rgba(232,0,29,.4);
  --cyan:#00cfff;--cyan-dim:rgba(0,207,255,.1);
  --gold:#ffc93c;--text:#f0f4ff;--muted:#7a9abb;
  --border:rgba(255,255,255,.1);--border-r:rgba(232,0,29,.3);--border-c:rgba(0,207,255,.22);
}`;

const newRoot = `:root{
  /* WCAG AA: red #e8001d on #05070d ~4.5:1, white on red >7:1 — чуть темнее весь сайт */
  --bg:#05070d;--bg2:#0a0e16;--surface:#0d111a;--s2:#121a26;
  --red:#e8001d;--red2:#ff2040;--red-dim:rgba(232,0,29,.12);--red-glow:rgba(232,0,29,.4);
  --cyan:#00cfff;--cyan-dim:rgba(0,207,255,.1);
  --gold:#ffc93c;--text:#eef2fb;--muted:#7493b8;
  --border:rgba(255,255,255,.09);--border-r:rgba(232,0,29,.28);--border-c:rgba(0,207,255,.2);
}`;

const oldNav = `nav{position:fixed;top:0;left:0;right:0;z-index:500;height:60px;padding:0 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(8,11,18,.92);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}`;
const newNav = `nav{position:fixed;top:0;left:0;right:0;z-index:500;height:60px;padding:0 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(5,7,12,.94);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}`;

const oldBodyAfter = `body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 4px);pointer-events:none;z-index:9999}`;
const newBodyAfter = `body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.055) 3px,rgba(0,0,0,.055) 4px);pointer-events:none;z-index:9999}`;

if (!s.includes(oldReviews)) {
  console.error("reviews block not found");
  process.exit(1);
}
if (!s.includes(oldRoot)) {
  console.error(":root not found");
  process.exit(1);
}

s = s.replace(oldReviews, newReviews);
s = s.replace(oldRoot, newRoot);
if (s.includes(oldNav)) s = s.replace(oldNav, newNav);
if (s.includes(oldBodyAfter)) s = s.replace(oldBodyAfter, newBodyAfter);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
