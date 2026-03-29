import fs from "fs";
const p = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(p, "utf8");

// Fix wrong width/height attrs (were 420×420 square, image is 882×708 after crop)
s = s.replace(
  `<img src="vk-gift-gold.png?v=20260329-gift4" width="420" height="420" alt="VK подарочный план" loading="lazy" decoding="async" class="vk-gift-img" />`,
  `<img src="vk-gift-gold.png?v=20260329-gift5" width="882" height="708" alt="VK подарочный план" loading="lazy" decoding="async" class="vk-gift-img" />`
);

// Fix CSS: correct aspect-ratio so image never distorts
s = s.replace(
  `.vk-gift-img{width:clamp(200px,32vw,360px);height:auto;display:block;object-fit:contain}`,
  `.vk-gift-img{width:clamp(220px,34vw,380px);height:auto;display:block;border-radius:12px}`
);

fs.writeFileSync(p, s, "utf8");
console.log("OK");
