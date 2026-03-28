/**
 * Создаёт облегчённые JPEG в AOA-Land/portfolio-images-thumbs/
 * (зеркало portfolio-images/, max ширина ~960px, quality ~82).
 * Требуется: npm install (sharp).
 *
 * Запуск из корня репозитория:
 *   node generate-portfolio-thumbnails.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Установите sharp: npm install");
  process.exit(1);
}

const ROOT = path.join(__dirname, "AOA-Land");
const SRC = path.join(ROOT, "portfolio-images");
const DST = path.join(ROOT, "portfolio-images-thumbs");

const MAX_W = 960;
const JPEG_Q = 82;

function outPathForSource(absSrc, baseDir) {
  const rel = path.relative(baseDir, absSrc);
  const withJpg = rel.replace(/\.(png|webp|jpe?g)$/i, ".jpg");
  return path.join(DST, withJpg);
}

async function processFile(absSrc, baseDir) {
  const outPath = outPathForSource(absSrc, baseDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const stSrc = fs.statSync(absSrc);
  if (fs.existsSync(outPath)) {
    const stOut = fs.statSync(outPath);
    if (stOut.mtimeMs >= stSrc.mtimeMs && stOut.size > 0) return;
  }
  await sharp(absSrc)
    .rotate()
    .resize(MAX_W, null, { withoutEnlargement: true, fit: "inside" })
    .jpeg({ quality: JPEG_Q, mozjpeg: true })
    .toFile(outPath);
  console.log("OK", path.relative(ROOT, outPath));
}

async function walk(dir, baseDir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, baseDir);
    else if (/\.(jpe?g|png|webp)$/i.test(e.name)) await processFile(full, baseDir);
  }
}

if (!fs.existsSync(SRC)) {
  console.error("Нет папки:", SRC);
  process.exit(1);
}

await walk(SRC, SRC);
console.log("Готово. Миниатюры:", DST);
