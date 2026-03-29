import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldHtml = `    <div class="vk-col vk-col-text">
      <div class="sec-lbl">Сообщество ВКонтакте</div>
      <h2 class="sec-title vk-title">Получи в ВК план<br>продвижения бизнеса<br><span class="vk-title-accent">на Авито</span></h2>
      <p class="sec-desc vk-desc">Чек-листы, разборы ниш и пошаговые материалы.<br>Подпишись — забирай план развития магазина.</p>
    </div>`;

const newHtml = `    <div class="vk-col vk-col-text">
      <div class="sec-lbl">Сообщество ВКонтакте</div>
      <h2 class="sec-title vk-title">Получи в ВК план<br>продвижения бизнеса<br>на Авито</h2>
      <p class="sec-desc vk-desc">Чек-листы, разборы ниш и пошаговые материалы</p>
      <p class="sec-desc vk-desc vk-desc-last">Забирайте план развития магазина</p>
    </div>`;

if (!s.includes(oldHtml)) {
  console.error("VK text block not found");
  process.exit(1);
}
s = s.replace(oldHtml, newHtml);

s = s.replace(
  `src="vk-gift-gold.png?v=20260329-gift1"`,
  `src="vk-gift-gold.png?v=20260329-gift2"`
);

const oldCss = `.vk-title{font-family:'Oswald',sans-serif;font-size:clamp(26px,5vw,48px);font-weight:700;line-height:1.12;letter-spacing:.02em;text-transform:none;color:#f2f6ff;text-wrap:balance;max-width:min(16ch,100%)}
.vk-title .vk-title-accent{color:var(--gold);text-shadow:0 2px 28px rgba(0,0,0,.95),0 0 24px rgba(255,201,60,.2)}
.vk-desc{font-size:clamp(14px,1.65vw,17px);line-height:1.55;max-width:min(36em,100%);margin-top:clamp(12px,2vw,20px);color:rgba(235,242,255,.94)}`;

// If max-width was 16ch without min() - try flexible replace
let newCss = `.vk-title{font-family:'Oswald',sans-serif;font-size:clamp(26px,5vw,48px);font-weight:700;line-height:1.18;letter-spacing:.02em;text-transform:none;color:#f2f6ff;text-wrap:balance;max-width:min(22em,100%);margin:0 0 clamp(18px,2.8vw,32px)}
.vk-desc{font-size:clamp(14px,1.65vw,17px);line-height:1.6;max-width:min(36em,100%);margin:0;color:rgba(235,242,255,.94)}
.vk-desc-last{margin-top:clamp(16px,2.2vw,26px)!important}`;

if (s.includes(oldCss)) {
  s = s.replace(oldCss, newCss);
} else {
  const alt = `.vk-title{font-family:'Oswald',sans-serif;font-size:clamp(26px,5vw,48px);font-weight:700;line-height:1.12;letter-spacing:.02em;text-transform:none;color:#f2f6ff;text-wrap:balance;max-width:16ch}
.vk-title .vk-title-accent{color:var(--gold);text-shadow:0 2px 28px rgba(0,0,0,.95),0 0 24px rgba(255,201,60,.2)}
.vk-desc{font-size:clamp(14px,1.65vw,17px);line-height:1.55;max-width:min(36em,100%);margin-top:clamp(12px,2vw,20px);color:rgba(235,242,255,.94)}`;
  if (!s.includes(alt)) {
    console.error("vk-title CSS variant not found");
    process.exit(1);
  }
  s = s.replace(alt, newCss);
}

fs.writeFileSync(path, s, "utf8");
console.log("OK");
