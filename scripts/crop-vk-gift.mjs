/**
 * Crop vk-gift-gold.png tight around the box (remove excess black borders).
 * Original: 1024×768, box roughly 65% centered.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "AOA-Land", "vk-gift-gold.png");
const tmp = path.join(__dirname, "..", "AOA-Land", "vk-gift-gold-tmp.png");
const meta = await sharp(src).metadata();
console.log("original:", meta.width, "x", meta.height);

// The box in the image is roughly centered; crop away ~10% sides and ~8% top/bottom
const margin_h = Math.floor(meta.width * 0.07);   // 7% left/right
const margin_v = Math.floor(meta.height * 0.04);  // 4% top/bottom
const left   = margin_h;
const top    = margin_v;
const width  = meta.width  - margin_h * 2;
const height = meta.height - margin_v * 2;

import fs from "fs";
await sharp(src)
  .extract({ left, top, width, height })
  .png({ compressionLevel: 9 })
  .toFile(tmp);

fs.renameSync(tmp, src);
console.log("cropped:", width, "x", height, "→ AOA-Land/vk-gift-gold.png");
