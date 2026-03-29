/**
 * Remove black background from vk-gift-gold.png → transparent PNG.
 * Pixels with R<45 G<45 B<45 become fully transparent.
 * Pixels near the edge (transition) get soft alpha.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(
  "C:/Users/shink/.cursor/projects/c-Users-shink-Desktop-AVITOLOG-CLAUDE/assets",
  "c__Users_shink_AppData_Roaming_Cursor_User_workspaceStorage_23a9e1d834889458c0f40b73d0a55634_images__________________________1_-515d7fe2-e743-42c6-a7f1-9aa7a454556f.png"
);
const destPath = path.join(__dirname, "..", "AOA-Land", "vk-gift-gold.png");
const tmpPath  = destPath + ".tmp.png";

const img = sharp(srcPath);
const meta = await img.metadata();
const { width, height } = meta;
console.log("source:", width, "x", height);

// Get raw RGB buffer
const { data: rgb, info } = await img
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const rgba = Buffer.from(rgb); // already RGBA from ensureAlpha

const THRESH    = 38;   // pixels darker than this (all channels) = background
const SOFT_MAX  = 80;   // transition zone
const SOFT_KEEP = 16;   // min brightness to start keeping

for (let i = 0; i < rgba.length; i += 4) {
  const r = rgba[i], g = rgba[i+1], b = rgba[i+2];
  const brightness = Math.max(r, g, b);

  if (brightness < THRESH) {
    rgba[i + 3] = 0; // fully transparent
  } else if (brightness < SOFT_MAX) {
    // soft edge: ramp alpha from 0 → 255
    const t = (brightness - THRESH) / (SOFT_MAX - THRESH);
    rgba[i + 3] = Math.round(t * 255);
  }
  // else: fully opaque (alpha stays 255)
}

await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(tmpPath);

fs.renameSync(tmpPath, destPath);
console.log("done →", destPath);
