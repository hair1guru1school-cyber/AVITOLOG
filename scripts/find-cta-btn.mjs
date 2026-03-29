import fs from "fs";
const c = fs.readFileSync(
  "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html",
  "utf8"
);
for (const n of ["ПОЛУЧИТЬ", "15 мин", "float-cta", "hero-cta", "btn-red-strip"]) {
  const i = c.indexOf(n);
  if (i >= 0) {
    console.log("===", n, "at", i);
    console.log(c.slice(Math.max(0, i - 120), i + 400));
  } else console.log("===", n, "NOT FOUND");
}
