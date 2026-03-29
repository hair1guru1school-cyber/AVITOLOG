import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const heroFrom = `<a href="https://t.me/Aces_Of_Ads_bot" target="_blank" class="btn btn-red btn-cta-pulse" data-cta-primary>🤖 <span class="cta-default">Оставить заявку</span><span class="cta-ab">Получить расчёт за 15 минут</span></a>`;
const heroTo = `<a href="https://t.me/Aces_Of_Ads_bot" target="_blank" class="btn btn-red btn-cta-pulse" data-cta-primary><img class="btn-cta-avatar" src="hero-cta-avatar.png?v=20260329-a1" width="40" height="40" alt="" loading="eager" decoding="async" /> <span class="cta-default">Оставить заявку</span><span class="cta-ab">Получить расчёт за 15 минут</span></a>`;

if (!s.includes(heroFrom)) {
  console.error("hero CTA string not found");
  process.exit(1);
}
s = s.replace(heroFrom, heroTo);

const floatRe = /<img class="floating-cta-ico" src="float-cta-robot\.png[^"]*" width="\d+" height="\d+" alt="" loading="lazy" decoding="async" \/>/;
const floatTo = `<img class="floating-cta-ico btn-cta-avatar floating-cta-avatar" src="hero-cta-avatar.png?v=20260329-a1" width="32" height="32" alt="" loading="lazy" decoding="async" />`;
if (!floatRe.test(s)) {
  console.error("floating CTA img not found");
  process.exit(1);
}
s = s.replace(floatRe, floatTo);

const cssAnchor = `.btn-red{background:var(--red);color:#fff}`;
const avatarCss = `.btn-cta-avatar{width:clamp(32px,5vw,40px);height:clamp(32px,5vw,40px);border-radius:50%;object-fit:cover;flex-shrink:0;display:block;border:2px solid rgba(255,255,255,.4);box-shadow:0 2px 10px rgba(0,0,0,.35)}.floating-cta-avatar{width:32px;height:32px}`;

if (!s.includes(cssAnchor)) {
  console.error("css anchor not found");
  process.exit(1);
}
if (s.includes(".btn-cta-avatar{")) {
  console.log("avatar css already present, skip");
} else {
  s = s.replace(cssAnchor, avatarCss + "\n" + cssAnchor);
}

fs.writeFileSync(path, s, "utf8");
console.log("OK");
