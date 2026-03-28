/**
 * Сканирует portfolio-images/ и генерирует portfolio-manifest.js + .json
 * Запуск: node build-portfolio-manifest.js
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "portfolio-images");
const map = {
  "disk-bdm": "ДИСК АЛЛМАЗ",
  "zhatka-zhvr": "ЖАТКА",
  "harmony-orlando": "МягкаяМебель",
  "sergey-stroy": "фундамент",
  swantrade: "Китай-Роман",
  santehnika: "Сантехник",
  "monolit-dom": "Монолит дом под ключ",
  "gazoblok-dom": "Коробка из Газоблока",
  elektromontazh: "Электромонтаж",
  "styazhka-pola": "Стяжка-Полав",
  "karkasnyy-dom": "ВашДом",
};

const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const out = {};

for (const id of Object.keys(map)) {
  const folder = map[id];
  const dir = path.join(base, folder);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => exts.has(path.extname(f).toLowerCase()));
  } catch (e) {
    continue;
  }
  files.sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  out[id] = files.map((f) => "portfolio-images/" + folder + "/" + f);
}

const json = JSON.stringify(out);
fs.writeFileSync(path.join(__dirname, "portfolio-manifest.json"), JSON.stringify(out, null, 2), "utf8");
fs.writeFileSync(path.join(__dirname, "portfolio-manifest.js"), "window.PORTFOLIO_IMAGES = " + json + ";\n", "utf8");
console.log("OK:", Object.keys(out).length, "проектов");
