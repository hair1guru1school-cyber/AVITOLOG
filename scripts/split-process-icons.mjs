/**
 * Splits a horizontal 5-icon strip into process-step-icon-01.png … 05.png in AOA-Land.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const src = path.join(
  process.env.SRC ||
    "C:/Users/shink/.cursor/projects/c-Users-shink-Desktop-AVITOLOG-CLAUDE/assets/c__Users_shink_AppData_Roaming_Cursor_User_workspaceStorage_23a9e1d834889458c0f40b73d0a55634_images_ChatGPT_Image_29____._2026__.__11_03_28-c8a8b509-762a-49da-a437-27994d882d65.png"
);

const outDir = path.join(root, "AOA-Land");
const meta = await sharp(src).metadata();
const w = meta.width;
const h = meta.height;
if (!w || !h) throw new Error("bad image size");
const sliceW = Math.floor(w / 5);
for (let i = 0; i < 5; i++) {
  const left = i * sliceW;
  const num = String(i + 1).padStart(2, "0");
  const dest = path.join(outDir, `process-step-icon-${num}.png`);
  await sharp(src)
    .extract({ left, top: 0, width: sliceW, height: h })
    .png()
    .toFile(dest);
  console.log("wrote", dest, sliceW, "x", h);
}
