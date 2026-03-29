import fs from "fs";
const p = "c:/Users/shink/Desktop/AVITOLOG-CLAUDE/AOA-Land/index.html";
let s = fs.readFileSync(p, "utf8");

// Update HTML attrs to match new 520×390 transparent PNG
s = s.replace(
  /vk-gift-gold\.png\?v=[^"]+/g,
  "vk-gift-gold.png?v=20260329-gift6"
);

// Fix the wrong width/height attrs
s = s.replace(
  'width="882" height="708"',
  'width="520" height="390"'
);

// Remove border-radius from img (no background box needed now)
s = s.replace(
  `.vk-gift-img{width:clamp(220px,34vw,380px);height:auto;display:block;border-radius:12px}`,
  `.vk-gift-img{width:clamp(220px,34vw,380px);height:auto;display:block}`
);

fs.writeFileSync(p, s, "utf8");
console.log("OK");
