import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const imgV = "20260328-ps5";

const oldHtml = `    <div class="p-steps">
      <div class="pstep rev"><div class="p-num">01</div><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div>
      <div class="pstep rev"><div class="p-num">02</div><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div>
      <div class="pstep rev"><div class="p-num">03</div><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div>
      <div class="pstep rev"><div class="p-num">04</div><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div>
      <div class="pstep rev"><div class="p-num">05</div><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div>
    </div>`;

const newHtml = `    <div class="p-steps">
      <div class="pstep"><div class="p-step-card"><div class="p-num">01</div><div class="p-step-body"><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">02</div><div class="p-step-body"><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">03</div><div class="p-step-body"><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">04</div><div class="p-step-body"><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">05</div><div class="p-step-body"><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div></div></div>
    </div>`;

if (!s.includes(oldHtml)) {
  console.error("HTML block not found");
  process.exit(1);
}
s = s.replace(oldHtml, newHtml);

const start = s.indexOf(".sec.process-section{");
const turn = s.indexOf("/* CASES", start);
if (start < 0 || turn < 0) {
  console.error("CSS markers");
  process.exit(1);
}

const newCss = `.sec.process-section{padding-top:clamp(16px,2.5vw,32px);padding-bottom:clamp(8px,1.2vw,16px)}
.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;display:block;margin:0 auto;width:100%;max-width:min(1920px,100%);min-width:0;box-sizing:border-box;border-radius:clamp(10px,1.2vw,16px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 16px 48px rgba(0,0,0,.45);background:#05080f;line-height:0;width:100%;aspect-ratio:21/9;max-height:min(32vw,420px)}
.process-visual-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;display:block}
.process-visual-overlay{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.12) 45%,rgba(0,0,0,.75) 78%,rgba(0,0,0,.94) 100%)}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:3;padding:clamp(12px,2.5vw,28px) clamp(12px,2.5vw,24px) 6px;text-align:left;box-sizing:border-box;pointer-events:none;line-height:normal}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 12px rgba(0,0,0,.95)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 16px rgba(0,0,0,.9);margin-bottom:0;font-size:clamp(22px,3.6vw,44px)}
.process-title-on-img span{color:var(--red)}
.process-visual-wrap .pstep{opacity:1!important;transform:none!important}
.process-visual-wrap .p-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(5px,1vw,10px);position:absolute;left:0;right:0;bottom:0;z-index:4;margin:0;padding:0 clamp(6px,1.4vw,18px) clamp(10px,1.8vw,20px);align-items:stretch;box-sizing:border-box;pointer-events:none;line-height:normal}
.process-visual-wrap .p-steps::before{display:none}
.process-visual-wrap .p-step-card{pointer-events:auto;height:100%;display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:clamp(8px,1.2vw,12px) clamp(6px,1vw,10px) clamp(8px,1.2vw,12px);border-radius:10px;border:1px solid rgba(232,0,29,.45);background:rgba(4,6,10,.88);box-shadow:0 4px 20px rgba(0,0,0,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.process-visual-wrap .p-num{align-self:flex-start;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(32px,5vw,56px);height:clamp(32px,5vw,56px);font-size:clamp(14px,2.2vw,22px);margin:0 0 2px 0;background:rgba(10,12,18,.95);border:2px solid var(--red);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);flex-shrink:0}
.process-visual-wrap .p-step-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:4px}
.process-visual-wrap .p-title{font-size:clamp(8px,0.95vw,12px);font-weight:600;color:#fff;line-height:1.2;margin:0}
.process-visual-wrap .p-desc{font-size:clamp(7px,0.82vw,10px);color:rgba(230,236,248,.95);line-height:1.35;margin:0}
@media(max-width:900px){
.process-visual-wrap{aspect-ratio:4/3;max-height:none;max-width:100%}
.process-visual-img{object-position:center 25%}
.process-visual-wrap .p-steps{grid-template-columns:1fr 1fr;row-gap:8px;padding:8px 8px 12px;column-gap:6px}
.process-title-on-img{font-size:clamp(18px,5vw,28px)}
}
@media(max-width:520px){
.process-visual-wrap .p-steps{grid-template-columns:1fr}
}`;

s = s.slice(0, start) + newCss + "\n\n" + s.slice(turn);

s = s.replace(/process-steps-panorama\.png\?v=[^"']+/, `process-steps-panorama.png?v=${imgV}`);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
