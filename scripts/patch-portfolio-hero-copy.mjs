import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/portfolio.html";
if (!fs.existsSync(path)) {
  console.error("missing", path);
  process.exit(1);
}
let s = fs.readFileSync(path, "utf8");

const pairs = [
  ["Не скриншоты магазинов — инфографика объявлений", "Продающая инфографика объявлений"],
  ["ДИЗАЙНОМ + ИНФОГРАФИКА УВЕЛИЧИВАЮТ КОНВЕРСИЮ ДО 60%", "ИНФОГРАФИКА ОБЪЯВЛЕНИЙ УВЕЛИЧИВАЮТ КОНВЕРСИЮ ДО 58%"],
  ["+ АКТИВНЕЕ ФОРМИРУЕТСЯ ВАША БАЗА В ♥️ «ИЗБРАННОЕ»", "ТАКЖЕ АКТИВНО ФОРМИРУЕТСЯ ВАША БАЗА ДОБАВЛЕНИЯ В ♥️ «ИЗБРАННОЕ»"],
];

let n = 0;
for (const [a, b] of pairs) {
  if (s.includes(a)) {
    s = s.split(a).join(b);
    n++;
  }
}
fs.writeFileSync(path, s, "utf8");
console.log("replaced", n, "chunks");
