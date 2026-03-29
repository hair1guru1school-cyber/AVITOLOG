import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldHtml = `<section class="sec vk-promo" id="vk">
  <div class="vk-inner">
    <div class="vk-col vk-col-text">
      <div class="sec-lbl">Сообщество ВКонтакте</div>
      <h2 class="sec-title">ПОЛУЧИ В ВК<br><span>ПЛАН ПРОДВИЖЕНИЯ БИЗНЕСА НА АВИТО</span></h2>
      <p class="sec-desc">Чек-листы, разборы ниш и пошаговые материалы — подпишись и забирай план развития магазина на Авито.</p>
    </div>
    <div class="vk-col vk-col-cta">
      <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="vk-plan-box" aria-label="Забрать план в ВКонтакте">
        <span class="vk-plan-box__media">
          <img src="vk-plan-briefcase.png?v=20260329-vkplan1" width="640" height="480" alt="" loading="lazy" decoding="async" />
        </span>
      </a>
      <div class="vk-actions">
        <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="btn btn-red vk-btn">Забрать План</a>
      </div>
    </div>
  </div>
</section>`;

const newHtml = `<section class="sec vk-promo" id="vk">
  <div class="vk-inner">
    <div class="vk-col vk-col-text">
      <div class="sec-lbl">Сообщество ВКонтакте</div>
      <h2 class="sec-title vk-title">Получи в ВК план<br>продвижения бизнеса<br><span class="vk-title-accent">на Авито</span></h2>
      <p class="sec-desc vk-desc">Чек-листы, разборы ниш и пошаговые материалы.<br>Подпишись — забирай план развития магазина.</p>
    </div>
    <div class="vk-col vk-col-cta">
      <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="vk-plan-box vk-gift-box" aria-label="Забрать план в ВКонтакте">
        <span class="vk-plan-box__media vk-gift-media">
          <img src="vk-gift-gold.png?v=20260329-gift1" width="512" height="512" alt="" loading="lazy" decoding="async" />
        </span>
      </a>
      <div class="vk-actions">
        <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="btn btn-red vk-btn">Забрать План</a>
      </div>
    </div>
  </div>
</section>`;

if (!s.includes(oldHtml)) {
  console.error("VK HTML block not found (whitespace?)");
  process.exit(1);
}
s = s.replace(oldHtml, newHtml);

const oldCss = `/* VK block */
.vk-promo{position:relative;overflow:hidden;border-top:none;border-bottom:none;padding-top:clamp(20px,3.2vw,44px);box-sizing:border-box;background-color:#060a12;background-image:linear-gradient(180deg,rgba(2,4,10,.32) 0%,rgba(4,8,18,.46) 48%,rgba(5,8,16,.72) 100%),url('vk-promo-art.png?v=20260328-vk13');background-position:center top;background-size:cover;background-repeat:no-repeat;scroll-margin-top:72px;min-height:min(74vh,900px)}
.vk-promo::before{content:'';position:absolute;left:0;right:0;top:0;height:clamp(56px,11vw,200px);z-index:1;pointer-events:none;background:linear-gradient(180deg,var(--bg) 0%,rgba(5,7,13,.52) 38%,rgba(5,7,13,.14) 72%,transparent 100%)}
.vk-promo::after{content:'';position:absolute;left:0;right:0;bottom:0;height:min(58%,520px);z-index:1;pointer-events:none;background:linear-gradient(0deg,var(--bg2) 0%,rgba(3,5,12,.72) 22%,rgba(6,10,18,.34) 52%,transparent 100%)}
.vk-inner{position:relative;z-index:2;max-width:min(1180px,94vw);margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:clamp(24px,4vw,56px);text-align:left;padding:clamp(32px,5vw,72px) clamp(20px,4vw,48px) clamp(104px,14vw,168px)}
.vk-col-text{flex:1;min-width:0;max-width:min(38em,100%)}
.vk-col-text .sec-lbl,.vk-col-text .sec-title,.vk-col-text .sec-desc{text-align:left}
.vk-col-text .sec-desc{margin-left:0;margin-right:0;max-width:100%}
.vk-col-cta{flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,2.2vw,24px);min-width:min(280px,100%)}
.vk-plan-box{display:block;width:min(100%,clamp(220px,38vw,360px));max-width:100%;line-height:0;text-decoration:none;border-radius:clamp(12px,2vw,16px);transition:transform .28s ease,filter .28s ease;filter:drop-shadow(0 10px 28px rgba(0,40,100,.5)) drop-shadow(0 0 22px rgba(0,180,255,.28));outline:none}
.vk-plan-box:hover{transform:translateY(-4px) scale(1.02);filter:drop-shadow(0 16px 42px rgba(0,80,180,.55)) drop-shadow(0 0 36px rgba(0,207,255,.42))}
.vk-plan-box:focus-visible{box-shadow:0 0 0 2px rgba(0,207,255,.65),0 0 28px rgba(0,140,255,.35)}
.vk-plan-box__media{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:clamp(12px,2vw,16px);border:1px solid rgba(0,207,255,.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 0 20px rgba(0,100,200,.2)}
.vk-plan-box__media img{width:100%;height:100%;object-fit:cover;object-position:center bottom;display:block}
.vk-inner .sec-lbl{color:rgba(0,207,255,.95);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.vk-inner .sec-title,.vk-inner .sec-title span{color:#f2f6ff;text-shadow:0 2px 24px rgba(0,0,0,.9),0 1px 3px rgba(0,0,0,.8)}
.vk-inner .sec-desc{color:rgba(235,242,255,.92);text-shadow:0 2px 14px rgba(0,0,0,.75)}
.vk-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:14px;margin:0}
.vk-btn{background:linear-gradient(180deg,#2787f5,#0077ff)!important;border-color:rgba(0,119,255,.5)!important;box-shadow:0 4px 24px rgba(0,119,255,.25)}
.vk-btn:hover{filter:brightness(1.08);box-shadow:0 6px 28px rgba(0,119,255,.35)}
@media(max-width:900px){
.vk-inner{flex-direction:column;align-items:center;text-align:center;padding-bottom:clamp(80px,14vw,110px)}
.vk-col-text .sec-lbl,.vk-col-text .sec-title,.vk-col-text .sec-desc{text-align:center}
.vk-col-text{max-width:42em}
}
@media(max-width:640px){.vk-promo{background-position:center top;min-height:min(72vh,720px)}.vk-inner{padding-left:16px;padding-right:16px}}`;

const newCss = `/* VK block */
.vk-promo{position:relative;overflow:hidden;border-top:none;border-bottom:none;padding-top:clamp(20px,3.2vw,44px);box-sizing:border-box;background-color:#030408;background-image:linear-gradient(180deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.58) 42%,rgba(0,0,0,.82) 100%),linear-gradient(180deg,rgba(2,4,10,.45) 0%,rgba(4,8,18,.55) 48%,rgba(5,8,16,.72) 100%),url('vk-promo-art.png?v=20260329-vk14');background-position:center top;background-size:cover;background-repeat:no-repeat;scroll-margin-top:72px;min-height:min(74vh,900px);box-shadow:inset 0 0 200px rgba(0,0,0,.72),inset 0 -80px 120px rgba(0,0,0,.45)}
.vk-promo::before{content:'';position:absolute;left:0;right:0;top:0;height:clamp(56px,11vw,200px);z-index:1;pointer-events:none;background:linear-gradient(180deg,var(--bg) 0%,rgba(5,7,13,.72) 42%,rgba(5,7,13,.28) 78%,transparent 100%)}
.vk-promo::after{content:'';position:absolute;left:0;right:0;bottom:0;height:min(62%,560px);z-index:1;pointer-events:none;background:linear-gradient(0deg,var(--bg2) 0%,rgba(1,2,8,.92) 18%,rgba(3,5,12,.78) 38%,rgba(6,10,18,.42) 62%,transparent 100%)}
.vk-inner{position:relative;z-index:2;max-width:min(1180px,94vw);margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:clamp(28px,4.5vw,64px);text-align:left;padding:clamp(36px,5vw,80px) clamp(20px,4vw,48px) clamp(104px,14vw,168px)}
.vk-col-text{flex:1;min-width:0;max-width:min(28rem,52%)}
.vk-col-text .sec-lbl,.vk-col-text .sec-title,.vk-col-text .sec-desc{text-align:left}
.vk-col-text .sec-desc{margin-left:0;margin-right:0;max-width:100%}
.vk-title{font-family:'Oswald',sans-serif;font-size:clamp(26px,5vw,48px);font-weight:700;line-height:1.12;letter-spacing:.02em;text-transform:none;color:#f2f6ff;text-wrap:balance;max-width:16ch}
.vk-title .vk-title-accent{color:var(--gold);text-shadow:0 2px 28px rgba(0,0,0,.95),0 0 24px rgba(255,201,60,.2)}
.vk-desc{font-size:clamp(14px,1.65vw,17px);line-height:1.55;max-width:min(36em,100%);margin-top:clamp(12px,2vw,20px);color:rgba(235,242,255,.94)}
.vk-col-cta{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:clamp(14px,2.4vw,26px);min-width:min(300px,100%)}
.vk-plan-box{display:block;width:min(100%,clamp(200px,34vw,320px));max-width:100%;line-height:0;text-decoration:none;border-radius:clamp(12px,2vw,18px);transition:transform .28s ease,filter .28s ease;filter:drop-shadow(0 12px 32px rgba(0,0,0,.65)) drop-shadow(0 0 28px rgba(255,190,80,.35)) drop-shadow(0 0 18px rgba(0,180,255,.25));outline:none}
.vk-plan-box:hover{transform:translateY(-4px) scale(1.02);filter:drop-shadow(0 18px 48px rgba(0,0,0,.55)) drop-shadow(0 0 40px rgba(255,200,90,.45)) drop-shadow(0 0 32px rgba(0,207,255,.4))}
.vk-plan-box:focus-visible{box-shadow:0 0 0 2px rgba(0,207,255,.65),0 0 28px rgba(0,140,255,.35)}
.vk-plan-box__media{display:block;aspect-ratio:1/1;overflow:hidden;border-radius:clamp(12px,2vw,18px);border:1px solid rgba(255,200,100,.35);background:radial-gradient(ellipse 80% 70% at 50% 45%,rgba(255,200,80,.12) 0%,transparent 55%),#0a0f18;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 0 28px rgba(255,180,0,.12)}
.vk-gift-media img{width:100%;height:100%;object-fit:contain;object-position:center bottom;display:block;filter:drop-shadow(0 6px 22px rgba(255,200,90,.35)) brightness(1.03) contrast(1.06)}
.vk-inner .sec-lbl{color:rgba(0,207,255,.95);text-shadow:0 2px 18px rgba(0,0,0,.95)}
.vk-inner .vk-title,.vk-inner .vk-title span{color:#f2f6ff;text-shadow:0 3px 28px rgba(0,0,0,.95),0 1px 4px rgba(0,0,0,.85)}
.vk-inner .sec-desc{color:rgba(235,242,255,.94);text-shadow:0 2px 18px rgba(0,0,0,.88)}
.vk-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:14px;margin:0;width:100%}
.vk-btn{background:linear-gradient(180deg,#2787f5,#0077ff)!important;border-color:rgba(0,119,255,.5)!important;box-shadow:0 4px 24px rgba(0,119,255,.25)}
.vk-btn:hover{filter:brightness(1.08);box-shadow:0 6px 28px rgba(0,119,255,.35)}
@media(max-width:900px){
.vk-inner{flex-direction:column;align-items:center;text-align:center;padding-bottom:clamp(80px,14vw,110px)}
.vk-col-text .sec-lbl,.vk-col-text .sec-title,.vk-col-text .sec-desc{text-align:center}
.vk-col-text{max-width:42em}
.vk-title{max-width:22ch;margin-left:auto;margin-right:auto}
.vk-col-cta{align-items:center}
.vk-actions{justify-content:center}
}
@media(max-width:640px){.vk-promo{background-position:center top;min-height:min(72vh,720px)}.vk-inner{padding-left:16px;padding-right:16px}}`;

if (!s.includes(oldCss)) {
  console.error("VK CSS block not found");
  process.exit(1);
}
s = s.replace(oldCss, newCss);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
