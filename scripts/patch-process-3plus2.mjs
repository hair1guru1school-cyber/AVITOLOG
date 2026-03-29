import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldSteps = `    <div class="p-steps">
      <div class="pstep"><div class="p-step-card"><div class="p-num">01</div><div class="p-step-body"><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">02</div><div class="p-step-body"><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">03</div><div class="p-step-body"><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">04</div><div class="p-step-body"><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div></div></div>
      <div class="pstep"><div class="p-step-card"><div class="p-num">05</div><div class="p-step-body"><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div></div></div>
    </div>`;

const newSteps = `    <div class="p-steps">
      <div class="p-steps-grid">
        <div class="p-steps-row p-steps-row-top">
          <div class="pstep"><div class="p-step-card"><div class="p-num">01</div><div class="p-step-body"><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div></div></div>
          <div class="pstep"><div class="p-step-card"><div class="p-num">02</div><div class="p-step-body"><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div></div></div>
          <div class="pstep"><div class="p-step-card"><div class="p-num">03</div><div class="p-step-body"><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div></div></div>
        </div>
        <div class="p-steps-row p-steps-row-bottom">
          <div class="pstep"><div class="p-step-card"><div class="p-num">04</div><div class="p-step-body"><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div></div></div>
          <div class="pstep"><div class="p-step-card"><div class="p-num">05</div><div class="p-step-body"><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div></div></div>
        </div>
      </div>
    </div>`;

if (!s.includes(oldSteps)) {
  console.error("p-steps HTML not found");
  process.exit(1);
}
s = s.replace(oldSteps, newSteps);

const start = s.indexOf(".process-visual-wrap .pstep{opacity:1!important");
const turn = s.indexOf("/* CASES", start);
if (start < 0 || turn < 0) {
  console.error("CSS markers");
  process.exit(1);
}

const newCss = `.process-visual-wrap .pstep{opacity:1!important;transform:none!important}
.process-visual-wrap .p-steps{position:absolute;left:0;right:0;top:0;bottom:0;z-index:4;margin:0;padding:clamp(12px,3vw,36px) clamp(10px,3vw,40px);display:flex;align-items:center;justify-content:center;box-sizing:border-box;pointer-events:none;line-height:normal}
.process-visual-wrap .p-steps-grid{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2.2vw,22px);width:100%;max-width:min(1240px,96%)}
.process-visual-wrap .p-steps-row{display:grid;gap:clamp(8px,1.4vw,18px);width:100%;position:relative;align-items:stretch}
.process-visual-wrap .p-steps-row-top{grid-template-columns:repeat(3,minmax(0,1fr))}
.process-visual-wrap .p-steps-row-bottom{grid-template-columns:repeat(2,minmax(0,1fr));max-width:min(820px,88%);margin:0 auto}
.process-visual-wrap .p-steps-row::before{content:'';position:absolute;left:8%;right:8%;top:clamp(18px,3.2vw,30px);height:2px;z-index:0;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(232,0,29,.25) 6%,rgba(232,0,29,.75) 50%,rgba(232,0,29,.25) 94%,transparent);box-shadow:0 0 12px rgba(232,0,29,.25)}
.process-visual-wrap .p-steps-row .pstep{position:relative;z-index:1;min-width:0}
.process-visual-wrap .p-step-card{pointer-events:auto;height:100%;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:6px;padding:clamp(8px,1.2vw,12px) clamp(6px,1vw,10px) clamp(8px,1.2vw,12px);border-radius:10px;border:1px solid rgba(232,0,29,.5);background:rgba(4,6,10,.82);box-shadow:0 6px 28px rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.process-visual-wrap .p-num{align-self:flex-start;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(32px,5vw,56px);height:clamp(32px,5vw,56px);font-size:clamp(14px,2.2vw,22px);margin:0;background:rgba(10,12,18,.95);border:2px solid var(--red);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);flex-shrink:0;position:relative;z-index:2}
.process-visual-wrap .p-step-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:4px}
.process-visual-wrap .p-title{font-size:clamp(8px,0.95vw,12px);font-weight:600;color:#fff;line-height:1.2;margin:0}
.process-visual-wrap .p-desc{font-size:clamp(7px,0.82vw,10px);color:rgba(230,236,248,.95);line-height:1.35;margin:0}
@media(max-width:900px){
.process-visual-wrap{aspect-ratio:4/3;max-height:none;min-height:0;max-width:100%}
.process-visual-img{object-position:center 58%}
.process-title-on-img{font-size:clamp(18px,5vw,28px)}
.process-visual-wrap .p-steps{padding:clamp(8px,2vw,16px) 10px}
.process-visual-wrap .p-steps-row-top{grid-template-columns:1fr;gap:8px}
.process-visual-wrap .p-steps-row-bottom{grid-template-columns:1fr;max-width:100%}
.process-visual-wrap .p-steps-row::before{display:none}
}
@media(max-width:520px){
.process-visual-wrap .p-steps-grid{gap:10px}
}`;

const oldChunk = s.slice(start, turn);
if (!oldChunk.includes(".process-visual-wrap .p-steps{display:grid")) {
  console.error("unexpected process p-steps css");
  process.exit(1);
}

const prefix = s.slice(0, start);
const suffix = s.slice(turn);
s = prefix + newCss + "\n\n" + suffix;

s = s.replace(
  /process-steps-panorama\.png\?v=[^"']+/,
  "process-steps-panorama.png?v=20260329-ps10"
);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
