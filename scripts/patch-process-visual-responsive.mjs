import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const v = "20260328-ps2";

const oldProcess = `<!-- PROCESS -->
<section class="sec process-section" style="background:var(--bg2)" id="process">
  <div class="sec-lbl">Как работаем</div>
  <h2 class="sec-title">5 ШАГОВ ДО<br><span>ПОТОКА ЗАЯВОК</span></h2>
  <figure class="process-visual-wrap">
    <img src="process-steps-panorama.png?v=20260328-ps1" alt="Пять этапов работы: консультация и аудит, стратегия и договор, упаковка магазина, запуск и масштаб, рост и отчётность" width="1920" height="640" loading="lazy" decoding="async" />
  </figure>
  <div class="p-steps">`;

const newProcess = `<!-- PROCESS -->
<section class="sec process-section" id="process">
  <figure class="process-visual-wrap">
    <img class="process-visual-img" src="process-steps-panorama.png?v=${v}" alt="Пять этапов работы: консультация и аудит, стратегия и договор, упаковка магазина, запуск и масштаб, рост и отчётность" width="1920" height="640" loading="lazy" decoding="async" sizes="(max-width:900px) 100vw, min(1200px, 100vw)" />
    <div class="process-visual-overlay" aria-hidden="true"></div>
    <figcaption class="process-visual-caption">
      <div class="sec-lbl process-caption-lbl">Как работаем</div>
      <h2 class="sec-title process-title-on-img">5 ШАГОВ ДО<br><span>ПОТОКА ЗАЯВОК</span></h2>
    </figcaption>
  </figure>
  <div class="p-steps">`;

const oldCss = `.process-visual-wrap{margin:clamp(12px,2.5vw,24px) 0 clamp(20px,3.5vw,36px);border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:radial-gradient(ellipse 90% 45% at 50% -10%,rgba(232,0,29,.08),transparent 55%),linear-gradient(180deg,rgba(18,22,32,.5) 0%,rgba(6,8,14,.96) 100%)}
.process-section .process-visual-wrap img{width:100%;height:auto;display:block;vertical-align:middle;object-fit:cover;object-position:center}
@media(max-width:700px){.process-section .process-visual-wrap{margin-left:-8px;margin-right:-8px;width:calc(100% + 16px);border-radius:12px}}`;

const newCss = `.process-section{background:var(--bg2);overflow-x:hidden}
.process-visual-wrap{position:relative;margin:clamp(12px,2.5vw,24px) auto clamp(20px,3.5vw,36px);width:100%;max-width:100%;min-width:0;box-sizing:border-box;border-radius:clamp(14px,2vw,22px);overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 64px rgba(0,0,0,.52),0 0 0 1px rgba(232,0,29,.1),inset 0 1px 0 rgba(255,255,255,.06);background:#0a0e14}
.process-visual-img{width:100%;max-width:100%;height:auto;display:block;vertical-align:middle}
.process-visual-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,6,10,.5) 0%,rgba(4,6,10,.72) 35%,rgba(2,4,8,.88) 100%);pointer-events:none;z-index:1}
.process-visual-caption{position:absolute;left:0;right:0;top:0;z-index:2;padding:clamp(18px,4vw,40px) clamp(16px,4vw,36px) clamp(12px,2vw,20px);text-align:left;box-sizing:border-box}
.process-caption-lbl{color:var(--cyan);text-shadow:0 2px 16px rgba(0,0,0,.85)}
.process-title-on-img{color:#f0f4ff;text-shadow:0 2px 28px rgba(0,0,0,.92),0 0 40px rgba(0,0,0,.5);margin-bottom:0}
.process-title-on-img span{color:var(--red)}
@media(max-width:700px){.process-visual-wrap{margin-left:0;margin-right:0;width:100%;border-radius:12px}.process-visual-caption{padding:16px 14px 10px}.process-title-on-img{font-size:clamp(22px,6.5vw,36px)}}`;

const oldNav = `    <li><a href="#avito">🏆 Авито №1</a></li>
    <li><a href="#vk">💙 ВКонтакте</a></li>
    <li><a href="portfolio.html">🎨 Дизайн</a></li>`;

const newNav = `    <li><a href="#avito">🏆 Авито №1</a></li>
    <li><a href="portfolio.html">🎨 Дизайн</a></li>`;

if (!s.includes(oldProcess)) {
  console.error("process block not found");
  process.exit(1);
}
if (!s.includes(oldCss)) {
  console.error("process css not found");
  process.exit(1);
}
if (!s.includes(oldNav)) {
  console.error("nav vk block not found");
  process.exit(1);
}

s = s.replace(oldProcess, newProcess);
s = s.replace(oldCss, newCss);
s = s.replace(oldNav, newNav);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
