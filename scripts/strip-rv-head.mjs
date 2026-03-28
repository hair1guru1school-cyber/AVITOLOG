import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

s = s.replace(
  /\s*<div class="rv-carousel-head">[\s\S]*?<\/div>\s*/,
  "\n  "
);

fs.writeFileSync(path, s, "utf8");
console.log("OK", !s.includes("rv-carousel-title"));
