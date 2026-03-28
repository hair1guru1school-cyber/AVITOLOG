/**
 * AOA-Land/index.html: section padding + avwhy/vk/cta spacing (text not stuck to block edges).
 */
import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const patches = [
  {
    from: `.sec-desc{font-size:16px;color:var(--muted);max-width:560px;line-height:1.8;margin-bottom:50px}`,
    to: `.sec-desc{font-size:16px;color:var(--muted);max-width:560px;line-height:1.8;margin-bottom:50px}
.sec{position:relative;padding:clamp(48px,5.5vw,88px) clamp(20px,4vw,80px)}
.sec .sec-lbl{margin-top:2px}`,
  },
  {
    from: `/* AVITO WHY */
.avwhy{position:relative;overflow:hidden;background:var(--bg)}`,
    to: `/* AVITO WHY */
.avwhy{position:relative;overflow:hidden;background:var(--bg);padding-bottom:clamp(40px,6vw,72px)}`,
  },
  {
    from: `.why-list{display:flex;flex-direction:column;gap:14px;margin-top:32px}`,
    to: `.why-list{display:flex;flex-direction:column;gap:14px;margin-top:32px;margin-bottom:clamp(8px,2vw,20px)}`,
  },
  {
    from: `/* VK block */
.vk-promo{position:relative;overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background-color:#060a12;background-image:linear-gradient(180deg,rgba(3,6,14,.48) 0%,rgba(5,10,20,.74) 48%,rgba(6,10,18,.9) 100%),url('vk-promo-art.png');background-position:center 22%;background-size:cover;background-repeat:no-repeat}
.vk-inner{position:relative;z-index:1;max-width:min(1280px,96vw);margin:0 auto;text-align:center;padding:clamp(40px,6vw,68px) clamp(20px,4vw,48px) clamp(88px,11vw,132px)}`,
    to: `/* VK block */
.vk-promo{position:relative;overflow:hidden;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);background-color:#060a12;background-image:linear-gradient(180deg,rgba(3,6,14,.48) 0%,rgba(5,10,20,.74) 48%,rgba(6,10,18,.9) 100%),url('vk-promo-art.png');background-position:center 22%;background-size:cover;background-repeat:no-repeat}
.vk-inner{position:relative;z-index:1;max-width:min(1280px,96vw);margin:0 auto;text-align:center;padding:clamp(52px,7vw,92px) clamp(20px,4vw,48px) clamp(96px,12vw,140px)}`,
  },
  {
    from: `/* CTA */
.cta-big{position:relative;padding:76px;text-align:center;overflow:hidden;background:var(--surface);border-top:1px solid var(--border-r);border-bottom:1px solid var(--border-r)}
.cta-big::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--red),var(--gold),transparent)}`,
    to: `/* CTA */
.cta-big{position:relative;padding:clamp(64px,8vw,96px) clamp(24px,5vw,80px);text-align:center;overflow:hidden;background:var(--surface);border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
.cta-big::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(232,0,29,.35),rgba(255,201,60,.2),transparent);opacity:.85}`,
  },
];

// Section after VK ("Действуйте сейчас"): extra top gap
const afterVk = `
.vk-promo + .sec{padding-top:clamp(56px,7vw,96px)}`;

if (!s.includes(".sec{position:relative;padding:clamp")) {
  let i = s.indexOf(".sec-desc{font-size:16px;color:var(--muted);max-width:560px;line-height:1.8;margin-bottom:50px}");
  if (i < 0) throw new Error("anchor 1 not found");
}

for (const { from, to } of patches) {
  if (!s.includes(from)) {
    console.error("MISSING:\n", from.slice(0, 120));
    process.exit(1);
  }
  s = s.split(from).join(to);
}

if (!s.includes(".vk-promo + .sec{")) {
  const j = s.indexOf("/* VK block */");
  if (j < 0) throw new Error("VK block comment not found");
  s = s.slice(0, j) + afterVk + "\n" + s.slice(j);
}

fs.writeFileSync(path, s, "utf8");
console.log("OK", path, fs.statSync(path).size);
