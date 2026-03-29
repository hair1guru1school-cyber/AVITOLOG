import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const needle = `.floating-cta-ico{width:clamp(24px,5vw,30px);height:clamp(24px,5vw,30px);object-fit:contain;flex-shrink:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}`;
const add = `.floating-cta-ico{width:clamp(24px,5vw,30px);height:clamp(24px,5vw,30px);object-fit:contain;flex-shrink:0;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}.floating-cta-ico.btn-cta-avatar{object-fit:cover;border-radius:50%;border:2px solid rgba(255,255,255,.45);filter:none}`;

if (!s.includes(needle)) {
  console.error("needle not found");
  process.exit(1);
}
if (s.includes(".floating-cta-ico.btn-cta-avatar{")) {
  console.log("already patched");
  process.exit(0);
}
s = s.replace(needle, add);
fs.writeFileSync(path, s, "utf8");
console.log("OK");
