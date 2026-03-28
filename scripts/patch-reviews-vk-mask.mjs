import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const v = "20260328-rvbg3";

const oldCss = `/* REVIEWS — карусель поверх фона «этапы» + сильное затемнение */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#04060a;background-image:url('reviews-section-bg.png?v=20260328-rvbg2');background-size:cover;background-position:center;background-repeat:no-repeat}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.58) 0%,rgba(2,4,8,.76) 45%,rgba(0,0,0,.88) 100%);z-index:0;pointer-events:none}
.reviews-sec::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.32);z-index:0;pointer-events:none}
.reviews-sec > *{position:relative;z-index:1}`;

const newCss = `/* REVIEWS — карусель; фон без акцентов ВК (локальное затемнение брендинга на фото) */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#04060a;background-image:url('reviews-section-bg.png?v=${v}');background-size:cover;background-position:center;background-repeat:no-repeat}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.58) 0%,rgba(2,4,8,.76) 45%,rgba(0,0,0,.88) 100%);z-index:0;pointer-events:none}
.reviews-sec::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.32);z-index:0;pointer-events:none}
.reviews-bg-brand-mask{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 70% 48% at 50% 19%,rgba(2,4,9,.96) 0%,rgba(2,4,9,.55) 52%,transparent 74%),radial-gradient(ellipse 95% 50% at 14% 91%,rgba(0,0,0,.98) 0%,rgba(0,0,0,.62) 48%,transparent 76%),radial-gradient(ellipse 22% 16% at 46% 71%,rgba(3,5,10,.9) 0%,transparent 72%)}
.reviews-sec > *:not(.reviews-bg-brand-mask){position:relative;z-index:2}`;

const oldHtml = `<section class="sec reviews-sec" id="reviews">
  <div class="sec-lbl">ОТЗЫВЫ</div>`;

const newHtml = `<section class="sec reviews-sec" id="reviews">
  <div class="reviews-bg-brand-mask" aria-hidden="true"></div>
  <div class="sec-lbl">ОТЗЫВЫ</div>`;

if (!s.includes(oldCss)) {
  console.error("CSS block not found");
  process.exit(1);
}
if (!s.includes(oldHtml)) {
  console.error("HTML block not found");
  process.exit(1);
}

s = s.replace(oldCss, newCss);
s = s.replace(oldHtml, newHtml);
fs.writeFileSync(path, s, "utf8");
console.log("OK");
