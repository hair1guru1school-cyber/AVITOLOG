import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const nums = [
  ["01", "1"],
  ["02", "2"],
  ["03", "3"],
  ["04", "4"],
  ["05", "5"],
];
for (const [label, step] of nums) {
  const from = `<div class="p-num">${label}</div>`;
  const to = `<div class="p-num" data-step="${step}"><span class="p-num-ico" aria-hidden="true"></span><span class="p-num-txt">${label}</span></div>`;
  if (!s.includes(from)) {
    console.error("missing p-num", label);
    process.exit(1);
  }
  s = s.replace(from, to);
}

const oldNumCss = `.process-visual-wrap .p-num{align-self:flex-start;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(32px,5vw,56px);height:clamp(32px,5vw,56px);font-size:clamp(14px,2.2vw,22px);margin:0;background:rgba(10,12,18,.95);border:2px solid var(--red);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);flex-shrink:0;position:relative;z-index:2}`;

const newNumCss = `.process-visual-wrap .p-num{align-self:flex-start;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:clamp(38px,5.5vw,58px);min-height:clamp(48px,7vw,76px);padding:5px 4px 6px;margin:0;background:rgba(6,10,18,.92);border:1px solid rgba(0,207,255,.42);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);flex-shrink:0;position:relative;z-index:2;box-shadow:0 0 14px rgba(0,160,255,.12),inset 0 0 0 1px rgba(255,255,255,.04)}.process-visual-wrap .p-num-ico{width:clamp(28px,4.2vw,44px);height:clamp(28px,4.2vw,44px);background:url('process-step-icons-strip.png?v=20260329-ico1') no-repeat 0 50%;background-size:500% 100%;filter:drop-shadow(0 0 6px rgba(0,207,255,.5)) drop-shadow(0 0 2px rgba(255,140,0,.35))}.process-visual-wrap .p-num[data-step="1"] .p-num-ico{background-position:0% 50%}.process-visual-wrap .p-num[data-step="2"] .p-num-ico{background-position:25% 50%}.process-visual-wrap .p-num[data-step="3"] .p-num-ico{background-position:50% 50%}.process-visual-wrap .p-num[data-step="4"] .p-num-ico{background-position:75% 50%}.process-visual-wrap .p-num[data-step="5"] .p-num-ico{background-position:100% 50%}.process-visual-wrap .p-num-txt{font-family:'Oswald',sans-serif;font-size:clamp(8px,1vw,10px);font-weight:700;color:rgba(235,242,255,.92);line-height:1;letter-spacing:.3px}`;

if (!s.includes(oldNumCss)) {
  console.error("p-num CSS block not found");
  process.exit(1);
}
s = s.replace(oldNumCss, newNumCss);

// Bump panorama cache so background refresh if needed
s = s.replace(
  /process-steps-panorama\.png\?v=[^"']+/,
  "process-steps-panorama.png?v=20260329-ps11"
);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
