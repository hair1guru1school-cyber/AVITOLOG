import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const old =
  ".process-visual-wrap .p-num{width:clamp(44px,7vw,78px);height:clamp(44px,7vw,78px);font-size:clamp(18px,3.2vw,30px);margin-bottom:clamp(8px,1.5vw,16px);background:rgba(10,14,22,.88);backdrop-filter:blur(6px);border:2px solid var(--red);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}";

const neu =
  ".process-visual-wrap .p-num{display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(44px,7vw,78px);height:clamp(44px,7vw,78px);font-size:clamp(18px,3.2vw,30px);margin-bottom:clamp(8px,1.5vw,16px);background:rgba(10,14,22,.88);backdrop-filter:blur(6px);border:2px solid var(--red);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}";

if (!s.includes(old)) {
  console.error("block not found");
  process.exit(1);
}
s = s.replace(old, neu);
fs.writeFileSync(path, s, "utf8");
console.log("OK");
