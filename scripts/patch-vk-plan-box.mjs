import fs from "fs";

const path = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(path, "utf8");

const oldHtml = `      <div class="vk-doc-icon" aria-hidden="true">
        <img src="vk-doc-3d.png?v=20260328-doc1" width="140" height="140" alt="" loading="lazy" decoding="async" />
      </div>
      <div class="vk-actions">
        <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="btn btn-red vk-btn">ВКонтакте — ai_avitolog</a>
      </div>`;

const newHtml = `      <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="vk-plan-box" aria-label="Забрать план в ВКонтакте">
        <span class="vk-plan-box__media">
          <img src="vk-plan-briefcase.png?v=20260329-vkplan1" width="640" height="480" alt="" loading="lazy" decoding="async" />
        </span>
      </a>
      <div class="vk-actions">
        <a href="https://vk.com/ai_avitolog" target="_blank" rel="noopener" class="btn btn-red vk-btn">Забрать План</a>
      </div>`;

if (!s.includes(oldHtml)) {
  console.error("HTML block not found");
  process.exit(1);
}
s = s.replace(oldHtml, newHtml);

const oldCss = `.vk-doc-icon{width:clamp(92px,13vw,148px);line-height:0;filter:drop-shadow(0 10px 32px rgba(0,0,0,.55))}
.vk-doc-icon img{width:100%;height:auto;display:block}`;

const newCss = `.vk-plan-box{display:block;width:min(100%,clamp(220px,38vw,360px));max-width:100%;line-height:0;text-decoration:none;border-radius:clamp(12px,2vw,16px);transition:transform .28s ease,filter .28s ease;filter:drop-shadow(0 10px 28px rgba(0,40,100,.5)) drop-shadow(0 0 22px rgba(0,180,255,.28));outline:none}
.vk-plan-box:hover{transform:translateY(-4px) scale(1.02);filter:drop-shadow(0 16px 42px rgba(0,80,180,.55)) drop-shadow(0 0 36px rgba(0,207,255,.42))}
.vk-plan-box:focus-visible{box-shadow:0 0 0 2px rgba(0,207,255,.65),0 0 28px rgba(0,140,255,.35)}
.vk-plan-box__media{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:clamp(12px,2vw,16px);border:1px solid rgba(0,207,255,.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 0 20px rgba(0,100,200,.2)}
.vk-plan-box__media img{width:100%;height:100%;object-fit:cover;object-position:center bottom;display:block}`;

if (!s.includes(oldCss)) {
  console.error("vk-doc-icon CSS not found");
  process.exit(1);
}
s = s.replace(oldCss, newCss);

fs.writeFileSync(path, s, "utf8");
console.log("OK");
