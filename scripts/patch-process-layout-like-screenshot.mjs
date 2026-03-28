import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const imgV = "20260328-ps4";

const newBlock = `.sec.process-section{padding-top:clamp(24px,3.5vw,48px);padding-bottom:clamp(8px,1.2vw,18px)}
.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;display:block;margin:0 auto;width:100%;max-width:min(1920px,100%);min-width:0;box-sizing:border-box;border-radius:clamp(12px,1.5vw,20px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 56px rgba(0,0,0,.5);background:#05080f;line-height:0;aspect-ratio:16/5;max-height:min(40vw,540px)}
.process-visual-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;display:block}
.process-visual-overlay{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.08) 38%,rgba(0,0,0,.55) 68%,rgba(0,0,0,.88) 88%,rgba(0,0,0,.96) 100%)}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:3;padding:clamp(16px,3.2vw,36px) clamp(14px,3vw,32px) clamp(8px,1.5vw,16px);text-align:left;box-sizing:border-box;pointer-events:none;line-height:normal}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 14px rgba(0,0,0,.9)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 20px rgba(0,0,0,.85);margin-bottom:0;font-size:clamp(26px,4.2vw,52px)}
.process-title-on-img span{color:var(--red)}
.process-visual-wrap .p-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(6px,1.2vw,14px);position:absolute;left:0;right:0;bottom:0;z-index:4;margin:0;padding:clamp(6px,1.2vw,12px) clamp(8px,1.8vw,24px) clamp(14px,2.5vw,28px);align-items:start;box-sizing:border-box;pointer-events:none;line-height:normal;overflow:visible}
.process-visual-wrap .p-steps::before{content:'';position:absolute;left:5%;right:5%;top:clamp(20px,3.2vw,34px);height:2px;background:linear-gradient(90deg,rgba(232,0,29,.35),var(--red) 15% 85%,rgba(232,0,29,.25));z-index:0;pointer-events:none}
.process-visual-wrap .pstep{padding:0 clamp(3px,0.7vw,10px);position:relative;z-index:1;pointer-events:auto}
.process-visual-wrap .p-num{display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(40px,6.5vw,72px);height:clamp(40px,6.5vw,72px);font-size:clamp(16px,2.8vw,28px);margin-bottom:clamp(6px,1.2vw,12px);background:rgba(8,10,16,.92);backdrop-filter:blur(4px);border:2px solid var(--red);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);position:relative;z-index:2}
.process-visual-wrap .p-title{font-size:clamp(9px,1.05vw,13px);font-weight:600;color:#f5f8ff;text-shadow:0 1px 10px rgba(0,0,0,.95);margin-bottom:3px;line-height:1.25}
.process-visual-wrap .p-desc{font-size:clamp(8px,0.9vw,11px);color:rgba(230,236,248,.95);line-height:1.4;text-shadow:0 1px 8px rgba(0,0,0,.9)}
@media(max-width:900px){
.process-visual-wrap{aspect-ratio:4/3;max-height:none;min-height:min(72vw,420px)}
.process-visual-img{object-position:center 30%}
.process-visual-wrap .p-steps{grid-template-columns:1fr 1fr;row-gap:10px;padding:10px 10px 16px;column-gap:8px}
.process-visual-wrap .p-steps::before{display:none}
.process-title-on-img{font-size:clamp(22px,5.5vw,34px)}
}
@media(max-width:520px){
.process-visual-wrap .p-steps{grid-template-columns:1fr}
}`;

const start = s.indexOf(".sec.process-section{");
const turn = s.indexOf("/* CASES", start);
if (start < 0 || turn < 0) {
  console.error("markers not found", start, turn);
  process.exit(1);
}
s = s.slice(0, start) + newBlock + "\n\n" + s.slice(turn);

s = s.replace(/process-steps-panorama\.png\?v=[^"']+/, `process-steps-panorama.png?v=${imgV}`);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
