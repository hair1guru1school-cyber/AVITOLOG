import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldHtml = `    <figcaption class="process-visual-caption">
      <div class="sec-lbl process-caption-lbl">Как работаем</div>
      <h2 class="sec-title process-title-on-img">5 ШАГОВ ДО<br><span>ПОТОКА ЗАЯВОК</span></h2>
    </figcaption>
  </figure>
  <div class="p-steps">
    <div class="pstep rev"><div class="p-num">01</div><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div>
    <div class="pstep rev"><div class="p-num">02</div><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div>
    <div class="pstep rev"><div class="p-num">03</div><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div>
    <div class="pstep rev"><div class="p-num">04</div><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div>
    <div class="pstep rev"><div class="p-num">05</div><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div>
  </div>
</section>`;

const newHtml = `    <figcaption class="process-visual-caption">
      <div class="sec-lbl process-caption-lbl">Как работаем</div>
      <h2 class="sec-title process-title-on-img">5 ШАГОВ ДО<br><span>ПОТОКА ЗАЯВОК</span></h2>
    </figcaption>
    <div class="p-steps">
      <div class="pstep rev"><div class="p-num">01</div><div class="p-title">Консультация и аудит</div><div class="p-desc">Разбираем нишу, анализируем конкурентов, считаем потенциал. КП и анализ рынка — бесплатно.</div></div>
      <div class="pstep rev"><div class="p-num">02</div><div class="p-title">Стратегия и договор</div><div class="p-desc">Прописываем план, фиксируем KPI в договоре с ИП. Никаких устных договорённостей.</div></div>
      <div class="pstep rev"><div class="p-num">03</div><div class="p-title">Упаковка магазина</div><div class="p-desc">Дизайн, тексты, фото, инфографика — магазин, которому доверяют покупатели.</div></div>
      <div class="pstep rev"><div class="p-num">04</div><div class="p-title">Запуск и масштаб</div><div class="p-desc">Автозагрузка, бот, реклама — первые заявки в течение 7 дней с гарантией.</div></div>
      <div class="pstep rev"><div class="p-num">05</div><div class="p-title">Рост и отчётность</div><div class="p-desc">24/7 мониторинг, еженедельные отчёты, постоянная оптимизация — заявки только растут.</div></div>
    </div>
  </figure>
</section>`;

const oldCss = `.process-section .process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;margin:clamp(12px,2.5vw,24px) auto clamp(20px,3.5vw,36px);width:100%;max-width:100%;min-width:0;box-sizing:border-box;border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:#0a0e14}
.process-visual-img{width:100%;max-width:100%;height:auto;display:block;vertical-align:middle}
.process-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.5) 0%,rgba(4,6,10,.72) 35%,rgba(2,4,8,.88) 100%);pointer-events:none;z-index:1}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:2;padding:clamp(18px,4vw,40px) clamp(16px,4vw,36px) clamp(12px,2vw,20px);text-align:left;box-sizing:border-box}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 28px rgba(0,0,0,.92),0 0 40px rgba(0,0,0,.5);margin-bottom:0}
.process-title-on-img span{color:var(--red)}
@media(max-width:700px){.process-visual-wrap{margin-left:0;margin-right:0;width:100%;border-radius:12px}.process-visual-caption{padding:16px 14px 10px}.process-title-on-img{font-size:clamp(22px,6.5vw,36px)}}
.p-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative;margin-top:clamp(32px,5vw,56px)}
.p-steps::before{content:'';position:absolute;top:40px;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),rgba(232,0,29,.15));z-index:0}
.pstep{padding:0 22px;position:relative;z-index:1}
.p-num{width:78px;height:78px;display:flex;align-items:center;justify-content:center;background:var(--s2);border:2px solid var(--red);font-family:'Oswald',sans-serif;font-size:30px;font-weight:700;color:var(--red);text-shadow:0 0 16px var(--red-glow);margin-bottom:20px;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.p-title{font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;color:var(--text);letter-spacing:.5px;margin-bottom:8px}
.p-desc{font-size:12px;color:var(--muted);line-height:1.6}`;

const newCss = `.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;margin:clamp(12px,2.5vw,24px) auto clamp(20px,3.5vw,36px);width:100%;max-width:100%;min-width:0;box-sizing:border-box;border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:#0a0e14}
.process-visual-wrap::after{content:'';position:absolute;left:0;right:0;bottom:0;height:min(52%,420px);background:linear-gradient(to top,rgba(1,2,6,.97) 0%,rgba(4,6,12,.82) 38%,rgba(6,10,18,.35) 72%,transparent 100%);pointer-events:none;z-index:2}
.process-visual-img{width:100%;max-width:100%;height:auto;display:block;vertical-align:middle}
.process-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.45) 0%,rgba(4,6,10,.55) 40%,rgba(2,4,8,.75) 100%);pointer-events:none;z-index:1}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:3;padding:clamp(18px,4vw,40px) clamp(16px,4vw,36px) clamp(12px,2vw,20px);text-align:left;box-sizing:border-box;pointer-events:none}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 28px rgba(0,0,0,.92),0 0 40px rgba(0,0,0,.5);margin-bottom:0}
.process-title-on-img span{color:var(--red)}
.process-visual-wrap .p-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(4px,1.2vw,14px);position:absolute;left:0;right:0;bottom:0;z-index:4;margin:0;padding:clamp(10px,2vw,22px) clamp(6px,1.5vw,16px) clamp(14px,2.5vw,28px);align-items:end;box-sizing:border-box;pointer-events:none}
.process-visual-wrap .p-steps::before{display:none}
.process-visual-wrap .pstep{padding:0 clamp(4px,0.8vw,12px);position:relative;pointer-events:auto}
.process-visual-wrap .p-num{width:clamp(44px,7vw,78px);height:clamp(44px,7vw,78px);font-size:clamp(18px,3.2vw,30px);margin-bottom:clamp(8px,1.5vw,16px);background:rgba(10,14,22,.88);backdrop-filter:blur(6px);border:2px solid var(--red)}
.process-visual-wrap .p-title{font-size:clamp(10px,1.15vw,14px);color:#f2f6ff;text-shadow:0 2px 12px rgba(0,0,0,.9);margin-bottom:4px}
.process-visual-wrap .p-desc{font-size:clamp(9px,0.95vw,12px);color:rgba(210,220,240,.92);line-height:1.45;text-shadow:0 1px 8px rgba(0,0,0,.85)}
@media(max-width:700px){.process-visual-wrap{margin-left:0;margin-right:0;width:100%;border-radius:12px}.process-visual-caption{padding:16px 14px 10px}.process-title-on-img{font-size:clamp(22px,6.5vw,36px)}.process-visual-wrap .p-steps{grid-template-columns:1fr 1fr;grid-template-rows:auto;align-items:stretch;max-height:min(62vh,520px);overflow-y:auto;overflow-x:hidden;padding-bottom:16px;gap:12px 8px}.process-visual-wrap .pstep{padding:0 6px}.process-visual-wrap::after{height:min(68%,480px)}}
.p-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative;margin-top:clamp(32px,5vw,56px)}
.p-steps::before{content:'';position:absolute;top:40px;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),rgba(232,0,29,.15));z-index:0}
.pstep{padding:0 22px;position:relative;z-index:1}
.p-num{width:78px;height:78px;display:flex;align-items:center;justify-content:center;background:var(--s2);border:2px solid var(--red);font-family:'Oswald',sans-serif;font-size:30px;font-weight:700;color:var(--red);text-shadow:0 0 16px var(--red-glow);margin-bottom:20px;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.p-title{font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;color:var(--text);letter-spacing:.5px;margin-bottom:8px}
.p-desc{font-size:12px;color:var(--muted);line-height:1.6}`;

if (!s.includes(oldHtml)) {
  console.error("HTML block not found");
  process.exit(1);
}
if (!s.includes(oldCss)) {
  console.error("CSS block not found");
  process.exit(1);
}

s = s.replace(oldHtml, newHtml);
s = s.replace(oldCss, newCss);

// Hide duplicate .p-steps rules when only inside figure - the trailing .p-steps without parent might still apply elsewhere - we have duplicate class names. Only .process-visual-wrap .p-steps exists in HTML now, so the generic .p-steps at bottom might affect nothing. But empty? Actually there's no standalone .p-steps anymore. The generic rules `.p-steps{...}` still apply to `.process-visual-wrap .p-steps` because of specificity - more specific rules win for properties defined. For properties only in generic .p-steps, they apply. The generic `.p-steps{margin-top...}` might add margin to our absolute positioned element - specificity: .process-visual-wrap .p-steps has margin:0 in newCss. Good.

// Conflict: two blocks `.p-steps` and `.process-visual-wrap .p-steps` - the second in newCss sets display grid etc. The later generic `.p-steps` might override margin-top on our element because same specificity for margin? .process-visual-wrap .p-steps is more specific. Good.

// But generic `.p-steps::before` - our inner has .process-visual-wrap .p-steps::before{display:none} in newCss first part - good.

// Remove orphaned duplicate `.p-steps{...}` block at end if it causes issues - actually it sets grid 5 columns for "other" p-steps - there are none. It could still match .process-visual-wrap .p-steps for properties not overridden - e.g. gap:0 from generic vs gap clamp from specific - specific wins.

// Remove the duplicate generic .p-steps block to avoid confusion - optional cleanup

fs.writeFileSync(path, s, "utf8");
console.log("OK");
