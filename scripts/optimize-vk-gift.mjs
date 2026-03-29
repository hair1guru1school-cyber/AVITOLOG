import sharp from "sharp";
import fs from "fs";

const src  = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/vk-gift-gold.png";
const tmp  = src + ".opt.tmp.png";

await sharp(src)
  .resize(520, 390, { fit: "inside", withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: false })
  .toFile(tmp);

fs.renameSync(tmp, src);
const kb = (fs.statSync(src).size / 1024).toFixed(1);
console.log("optimized → 520×390 max, size:", kb, "KB");
