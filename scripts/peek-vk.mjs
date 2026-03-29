import fs from "fs";
const c = fs.readFileSync(
  "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html",
  "utf8"
);
const i = c.indexOf("sec vk-promo");
console.log(c.slice(i - 15, i + 1300));
const j = c.indexOf(".vk-plan-box__media");
console.log("\n---CSS tail---\n", c.slice(j, j + 800));
