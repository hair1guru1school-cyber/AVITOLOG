import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const old =
  "url('vk-promo-art.png?v=20260328-vk5');background-position:center center;";
const neu =
  "url('vk-promo-art.png?v=20260328-vk6');background-position:center 28%;";

if (!s.includes(old)) {
  if (!s.includes("vk-promo-art.png")) {
    console.error("vk-promo url missing");
    process.exit(1);
  }
  s = s.replace(
    /vk-promo-art\.png\?v=[^')]+/,
    "vk-promo-art.png?v=20260328-vk6"
  );
  s = s.replace(
    /background-position:center center/,
    "background-position:center 28%"
  );
} else {
  s = s.replace(old, neu);
}

fs.writeFileSync(path, s, "utf8");
console.log("OK");
