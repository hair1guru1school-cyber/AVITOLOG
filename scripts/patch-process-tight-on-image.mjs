import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const v = "20260328-ps3";

const oldCss = `.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;margin:clamp(12px,2.5vw,24px) auto clamp(20px,3.5vw,36px);width:100%;max-width:100%;min-width:0;box-sizing:border-box;border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:#0a0e14}
.process-visual-wrap::after{content:'';position:absolute;left:0;right:0;bottom:0;height:min(52%,420px);background:linear-gradient(to top,rgba(1,2,6,.97) 0%,rgba(4,6,12,.82) 38%,rgba(6,10,18,.35) 72%,transparent 100%);pointer-events:none;z-index:2}
.process-visual-img{width:100%;max-width:100%;height:auto;display:block;vertical-align:middle}
.process-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.45) 0%,rgba(4,6,10,.55) 40%,rgba(2,4,8,.75) 100%);pointer-events:none;z-index:1}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:3;padding:clamp(18px,4vw,40px) clamp(16px,4vw,36px) clamp(12px,2vw,20px);text-align:left;box-sizing:border-box;pointer-events:none}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 28px rgba(0,0,0,.92),0 0 40px rgba(0,0,0,.5);margin-bottom:0}
.process-title-on-img span{color:var(--red)}
.process-visual-wrap .p-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(4px,1.2vw,14px);position:absolute;left:0;right:0;bottom:0;z-index:4;margin:0;padding:clamp(10px,2vw,22px) clamp(6px,1.5vw,16px) clamp(14px,2.5vw,28px);align-items:end;box-sizing:border-box;pointer-events:none}
.process-visual-wrap .p-steps::before{display:none}
.process-visual-wrap .pstep{padding:0 clamp(4px,0.8vw,12px);position:relative;pointer-events:auto}
.process-visual-wrap .p-num{display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(44px,7vw,78px);height:clamp(44px,7vw,78px);font-size:clamp(18px,3.2vw,30px);margin-bottom:clamp(8px,1.5vw,16px);background:rgba(10,14,22,.88);backdrop-filter:blur(6px);border:2px solid var(--red);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.process-visual-wrap .p-title{font-size:clamp(10px,1.15vw,14px);color:#f2f6ff;text-shadow:0 2px 12px rgba(0,0,0,.9);margin-bottom:4px}
.process-visual-wrap .p-desc{font-size:clamp(9px,0.95vw,12px);color:rgba(210,220,240,.92);line-height:1.45;text-shadow:0 1px 8px rgba(0,0,0,.85)}
@media(max-width:700px){.process-visual-wrap{margin-left:0;margin-right:0;width:100%;border-radius:12px}.process-visual-caption{padding:16px 14px 10px}.process-title-on-img{font-size:clamp(22px,6.5vw,36px)}.process-visual-wrap .p-steps{grid-template-columns:1fr 1fr;grid-template-rows:auto;align-items:stretch;max-height:min(62vh,520px);overflow-y:auto;overflow-x:hidden;padding-bottom:16px;gap:12px 8px}.process-visual-wrap .pstep{padding:0 6px}.process-visual-wrap::after{height:min(68%,480px)}}`;

const newCss = `.sec.process-section{padding-top:clamp(36px,5vw,64px);padding-bottom:clamp(12px,2vw,24px)}
.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;display:block;margin:0 auto;width:100%;max-width:min(1920px,100%);min-width:0;box-sizing:border-box;border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:#0a0e14;line-height:0}
.process-visual-wrap::after{content:'';position:absolute;left:0;right:0;bottom:0;height:min(56%,440px);background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(4,6,14,.88) 35%,rgba(6,10,18,.45) 68%,transparent 100%);pointer-events:none;z-index:2}
.process-visual-img{width:100%;max-width:100%;height:auto;display:block;vertical-align:top}
.process-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,14,.62) 0%,rgba(4,6,12,.58) 42%,rgba(2,4,10,.82) 100%);pointer-events:none;z-index:1}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:3;padding:clamp(18px,4vw,40px) clamp(16px,4vw,36px) clamp(12px,2vw,20px);text-align:left;box-sizing:border-box;pointer-events:none;line-height:normal}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 28px rgba(0,0,0,.92),0 0 40px rgba(0,0,0,.5);margin-bottom:0}
.process-title-on-img span{color:var(--red)}
.process-visual-wrap .p-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(4px,1.2vw,14px);position:absolute;left:0;right:0;bottom:0;z-index:4;margin:0;padding:clamp(10px,2vw,20px) clamp(6px,1.5vw,16px) clamp(12px,2.2vw,24px);align-items:end;box-sizing:border-box;pointer-events:none;max-height:50%;overflow-y:auto;-webkit-overflow-scrolling:touch;line-height:normal}
.process-visual-wrap .p-steps::before{display:none}
.process-visual-wrap .pstep{padding:0 clamp(4px,0.8vw,12px);position:relative;pointer-events:auto}
.process-visual-wrap .p-num{display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-weight:700;width:clamp(44px,7vw,78px);height:clamp(44px,7vw,78px);font-size:clamp(18px,3.2vw,30px);margin-bottom:clamp(8px,1.5vw,16px);background:rgba(10,14,22,.88);backdrop-filter:blur(6px);border:2px solid var(--red);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.process-visual-wrap .p-title{font-size:clamp(10px,1.15vw,14px);color:#f2f6ff;text-shadow:0 2px 12px rgba(0,0,0,.9);margin-bottom:4px}
.process-visual-wrap .p-desc{font-size:clamp(9px,0.95vw,12px);color:rgba(210,220,240,.92);line-height:1.45;text-shadow:0 1px 8px rgba(0,0,0,.85)}
@media(max-width:700px){.process-visual-wrap{border-radius:12px}.process-visual-caption{padding:14px 12px 8px}.process-title-on-img{font-size:clamp(20px,6.2vw,34px)}.process-visual-wrap .p-steps{grid-template-columns:1fr 1fr;align-items:stretch;max-height:52%;padding:10px 8px 12px;gap:10px 6px}.process-visual-wrap .pstep{padding:0 6px}.process-visual-wrap::after{height:min(62%,460px)}}`;

if (!s.includes(oldCss)) {
  console.error("oldCss not found");
  process.exit(1);
}
s = s.replace(oldCss, newCss);
s = s.replace(/process-steps-panorama\.png\?v=[^"']+/, `process-steps-panorama.png?v=${v}`);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
