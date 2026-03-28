import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldGrad =
  "background-image:linear-gradient(180deg,rgba(3,6,14,.48) 0%,rgba(5,10,20,.74) 48%,rgba(6,10,18,.9) 100%),url('vk-promo-art.png?v=20260328-vk5');background-position:center 22%";
const newGrad =
  "background-image:linear-gradient(180deg,rgba(2,4,10,.58) 0%,rgba(4,8,18,.82) 45%,rgba(5,8,16,.94) 100%),url('vk-promo-art.png?v=20260328-vk5');background-position:center center";

if (!s.includes(oldGrad)) {
  console.error("grad block not found");
  process.exit(1);
}
s = s.replace(oldGrad, newGrad);
fs.writeFileSync(path, s, "utf8");
console.log("OK");

