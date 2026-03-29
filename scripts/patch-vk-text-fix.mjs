import fs from "fs";
const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

// 1. Bump image cache version
s = s.replace(
  /vk-gift-gold\.png\?v=[^"']+/g,
  "vk-gift-gold.png?v=20260329-gift4"
);

// 2. Fix text column: wider + remove bad word-break combo
s = s.replace(
  `.vk-col-text{flex:1 1 0;min-width:0;max-width:min(480px,56%)}`,
  `.vk-col-text{flex:1 1 0;min-width:0;max-width:min(600px,62%)}`
);

s = s.replace(
  `font-size:clamp(28px,4.8vw,54px);font-weight:700;line-height:1.16;letter-spacing:.01em;text-transform:none;color:#f2f6ff;margin:0 0 clamp(20px,3vw,36px);word-break:keep-all;overflow-wrap:normal`,
  `font-size:clamp(28px,4.8vw,54px);font-weight:700;line-height:1.16;letter-spacing:.01em;text-transform:none;color:#f2f6ff;margin:0 0 clamp(20px,3vw,36px)`
);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
