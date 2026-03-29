import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const v = "20260329-s5";
const steps = [
  ["01", "1", "01"],
  ["02", "2", "02"],
  ["03", "3", "03"],
  ["04", "4", "04"],
  ["05", "5", "05"],
];
for (const [label, step, file] of steps) {
  const from = `<div class="p-num" data-step="${step}"><span class="p-num-ico" aria-hidden="true"></span><span class="p-num-txt">${label}</span></div>`;
  const to = `<div class="p-num" data-step="${step}"><span class="p-num-ico" aria-hidden="true"><img src="process-step-icon-${file}.png?v=${v}" width="204" height="682" alt="" loading="lazy" decoding="async" /></span><span class="p-num-txt">${label}</span></div>`;
  if (!s.includes(from)) {
    console.error("missing block", label);
    process.exit(1);
  }
  s = s.replace(from, to);
}

const oldCss = `.process-visual-wrap .p-num-ico{width:clamp(28px,4.2vw,44px);height:clamp(28px,4.2vw,44px);background:url('process-step-icons-strip.png?v=20260329-ico1') no-repeat 0 50%;background-size:500% 100%;filter:drop-shadow(0 0 6px rgba(0,207,255,.5)) drop-shadow(0 0 2px rgba(255,140,0,.35))}.process-visual-wrap .p-num[data-step="1"] .p-num-ico{background-position:0% 50%}.process-visual-wrap .p-num[data-step="2"] .p-num-ico{background-position:25% 50%}.process-visual-wrap .p-num[data-step="3"] .p-num-ico{background-position:50% 50%}.process-visual-wrap .p-num[data-step="4"] .p-num-ico{background-position:75% 50%}.process-visual-wrap .p-num[data-step="5"] .p-num-ico{background-position:100% 50%}`;

const newCss = `.process-visual-wrap .p-num-ico{display:flex;align-items:center;justify-content:center;width:clamp(30px,4.5vw,48px);height:clamp(30px,4.5vw,48px);flex-shrink:0}.process-visual-wrap .p-num-ico img{width:100%;height:100%;object-fit:contain;object-position:center;display:block;filter:drop-shadow(0 0 5px rgba(0,93,160,.55)) drop-shadow(0 0 2px rgba(243,112,33,.4))}`;

if (!s.includes(oldCss)) {
  console.error("CSS sprite block not found");
  process.exit(1);
}
s = s.replace(oldCss, newCss);

s = s.replace(
  /process-steps-panorama\.png\?v=[^"']+/,
  "process-steps-panorama.png?v=20260329-ps12"
);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
