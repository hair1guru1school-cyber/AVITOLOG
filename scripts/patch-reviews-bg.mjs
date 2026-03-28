import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldStart = `/* REVIEWS — карусель скриншотов отзывов с Авито */
.reviews-sec{padding:80px 80px 100px}
.rv-cta{margin-bottom:18px}`;

const newStart = `/* REVIEWS — карусель скриншотов отзывов с Авито */
.reviews-sec{padding:80px 80px 100px;position:relative;isolation:isolate;overflow:hidden;background-color:#050a12;background-image:url('reviews-section-bg-wide.png?v=20260328-rvbg');background-size:cover;background-position:center;background-repeat:no-repeat}
.reviews-sec::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,14,.4) 0%,rgba(5,8,14,.62) 50%,rgba(5,8,14,.9) 100%);z-index:0;pointer-events:none}
.reviews-sec > *{position:relative;z-index:1}
.reviews-sec .sec-title{color:#f0f4ff}
.reviews-sec .sec-desc{color:rgba(200,210,230,.88)}
.reviews-sec .rv-avito-note{color:rgba(175,190,215,.78)}
.rv-cta{margin-bottom:18px}`;

const oldMq = `@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}
/* TURNKEY BANNER`;

const newMq = `@media(max-width:768px){
.reviews-sec{padding:48px 24px 60px;background-image:url('reviews-section-bg.png?v=20260328-rvbg');background-position:center top}
.rv-carousel-btn{width:38px;height:38px;font-size:18px}
}
/* TURNKEY BANNER`;

if (!s.includes(oldStart)) {
  console.error("oldStart not found");
  process.exit(1);
}
if (!s.includes(oldMq)) {
  console.error("oldMq not found");
  process.exit(1);
}
s = s.replace(oldStart, newStart);
s = s.replace(oldMq, newMq);
fs.writeFileSync(path, s, "utf8");
console.log("OK");
