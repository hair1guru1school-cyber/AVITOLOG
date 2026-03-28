import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const remove = `.p-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative;margin-top:clamp(32px,5vw,56px)}
.p-steps::before{content:'';position:absolute;top:40px;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--red),rgba(232,0,29,.15));z-index:0}
.pstep{padding:0 22px;position:relative;z-index:1}
.p-num{width:78px;height:78px;display:flex;align-items:center;justify-content:center;background:var(--s2);border:2px solid var(--red);font-family:'Oswald',sans-serif;font-size:30px;font-weight:700;color:var(--red);text-shadow:0 0 16px var(--red-glow);margin-bottom:20px;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.p-title{font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;color:var(--text);letter-spacing:.5px;margin-bottom:8px}
.p-desc{font-size:12px;color:var(--muted);line-height:1.6}



`;

if (!s.includes(remove)) {
  console.error("dup block not found");
  process.exit(1);
}
s = s.split(remove).join("");
fs.writeFileSync(path, s, "utf8");
console.log("OK");
