# -*- coding: utf-8 -*-
"""Cases block: sort columns by count, taller wrap, cat header grid + icon, emoji heuristic, row spacing."""
from pathlib import Path

P = Path(r"C:\Users\shink\Desktop\AVITOLOG-CLAUDE\AOA-Land\index.html")
s = P.read_text(encoding="utf-8")

REPLACEMENTS = [
    (
        ".cases-cols-wrap{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;gap:12px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scroll-padding:0 12px;padding:6px 6px 14px;max-width:100%;height:min(460px,58vh);min-height:320px;scrollbar-width:thin;scrollbar-color:var(--red) transparent}",
        ".cases-cols-wrap{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;gap:14px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scroll-padding:0 12px;padding:8px 8px 16px;max-width:100%;height:min(90vh,980px);min-height:420px;scrollbar-width:thin;scrollbar-color:var(--red) transparent}",
    ),
    (
        ".cat-hd{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;background:var(--surface);border:none;border-bottom:1px solid var(--border);margin-bottom:0;flex-shrink:0}\n.cat-ico{font-size:18px;line-height:1;filter:drop-shadow(0 1px 6px rgba(232,0,29,.25))}\n.cat-nm{font-family:'Oswald',sans-serif;font-size:15px;font-weight:700;color:var(--text);letter-spacing:.4px;line-height:1.2;max-width:100%;text-shadow:0 0 20px rgba(255,255,255,.06),0 1px 0 rgba(0,0,0,.35)}\n.cat-cnt{margin-left:0;font-size:8px;color:var(--red);background:var(--red-dim);border:1px solid var(--border-r);padding:2px 6px;font-weight:700;border-radius:4px}",
        ".cat-hd{display:grid;grid-template-columns:52px 1fr;column-gap:12px;row-gap:6px;padding:12px 14px;background:linear-gradient(180deg,rgba(232,0,29,.1),transparent 52%),var(--surface);border:none;border-bottom:1px solid var(--border);margin-bottom:0;flex-shrink:0;border-radius:12px 12px 0 0;align-items:center}\n.cat-ico{grid-column:1;grid-row:1/span 2;align-self:center;justify-self:center;display:flex;align-items:center;justify-content:center;width:48px;height:48px;font-size:26px;line-height:1;border-radius:14px;background:radial-gradient(ellipse 80% 80% at 30% 20%,rgba(255,255,255,.12),rgba(232,0,29,.22) 45%,rgba(8,11,18,.92) 100%);border:1px solid var(--border-r);box-shadow:0 6px 22px rgba(232,0,29,.28),inset 0 1px 0 rgba(255,255,255,.12),inset 0 -1px 0 rgba(0,0,0,.35);filter:none}\n.cat-nm{grid-column:2;grid-row:1;font-family:'Oswald',sans-serif;font-size:15px;font-weight:700;color:var(--text);letter-spacing:.4px;line-height:1.25;max-width:100%;text-shadow:0 0 24px rgba(255,255,255,.07),0 2px 8px rgba(0,0,0,.45)}\n.cat-cnt{grid-column:2;grid-row:2;margin-left:0;font-size:9px;color:var(--red);background:var(--red-dim);border:1px solid var(--border-r);padding:3px 8px;font-weight:700;border-radius:6px;justify-self:start}",
    ),
    (
        ".cat-hd{padding:10px 12px;margin-bottom:0}",
        ".cat-hd{padding:12px 14px;margin-bottom:0}",
    ),
    (
        ".ccard{background:var(--bg2);padding:9px 10px 9px 10px;text-decoration:none;color:inherit;display:flex;flex-direction:row;align-items:flex-start;gap:10px;transition:all .22s;position:relative;overflow:hidden;border:1px solid var(--border);border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.2)}",
        ".ccard{background:var(--bg2);padding:11px 12px 11px 11px;text-decoration:none;color:inherit;display:flex;flex-direction:row;align-items:center;gap:11px;transition:all .22s;position:relative;overflow:hidden;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.2);min-height:52px}",
    ),
    (
        ".cc-title{font-size:11px;font-weight:600;color:var(--text);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;overflow-wrap:anywhere}",
        ".cc-title{font-size:11px;font-weight:600;color:var(--text);line-height:1.42;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;overflow-wrap:anywhere;padding:1px 0;min-height:2.85em}",
    ),
    (
        ".cc-thumb-wrap{width:40px;height:40px;border-radius:9px;overflow:hidden;flex-shrink:0;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;position:relative;box-shadow:inset 0 1px 4px rgba(0,0,0,.35)}",
        ".cc-thumb-wrap{width:44px;height:44px;border-radius:10px;overflow:visible;flex-shrink:0;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;position:relative;box-shadow:inset 0 1px 4px rgba(0,0,0,.35)}",
    ),
    (
        ".cc-emoji-fb{font-size:18px;line-height:1;opacity:.9}",
        ".cc-emoji-fb{font-size:21px;line-height:1;opacity:.95}",
    ),
    (
        ".cards-grid{display:flex;flex-direction:column;gap:7px;background:transparent;border:none;flex:1;min-height:0;overflow-y:auto;overflow-x:visible;padding:8px 8px 8px 10px;scrollbar-width:thin;scrollbar-color:rgba(232,0,29,.35) transparent}",
        ".cards-grid{display:flex;flex-direction:column;gap:9px;background:transparent;border:none;flex:1;min-height:0;overflow-y:auto;overflow-x:visible;padding:10px 10px 10px 12px;scrollbar-width:thin;scrollbar-color:rgba(232,0,29,.35) transparent}",
    ),
]

for old, new in REPLACEMENTS:
    if old not in s:
        raise SystemExit(f"MISSING:\n{old[:120]}...")
    s = s.replace(old, new, 1)

# Mobile media: taller min-height
old_m = ".cases-cols-wrap{height:min(400px,54vh);min-height:280px;gap:10px}\n.cat-group{flex-basis:200px;min-width:190px;max-width:92vw}"
new_m = ".cases-cols-wrap{height:min(78vh,880px);min-height:360px;gap:12px}\n.cat-group{flex-basis:200px;min-width:190px;max-width:92vw}"
if old_m in s:
    s = s.replace(old_m, new_m, 1)

JS_BLOCK = r"""
function sortCasesColumns(){
  var container=document.getElementById('casesContainer');
  if(!container)return;
  var groups=Array.prototype.slice.call(container.querySelectorAll(':scope > .cat-group'));
  var noRes=container.querySelector(':scope > .no-res');
  groups.sort(function(a,b){
    return b.querySelectorAll('.ccard').length-a.querySelectorAll('.ccard').length;
  });
  groups.forEach(function(g){container.appendChild(g)});
  if(noRes)container.appendChild(noRes);
}
function applyCaseEmojis(){
  function inferEmoji(title){
    var t=(title||'').toLowerCase();
    var rules=[
      [/строит|фундамент|кровл|монолит|газоблок|стяжк|коттедж|каркас|коробк|фундамент/, '\U0001f3d7'],
      [/пиломат|доск|брус|лес|пилорам|бревн/, '\U0001fab5'],
      [/авто|машин|шин|двигател|тормоз|авто/, '\U0001f697'],
      [/вентиляц|овик|климат|кондицион|вентиля/, '\U0001f4a8'],
      [/электрик|электромонтаж|кабел|электро/, '\u26a1'],
      [/сантехн|водопров|отоплен|канализац/, '\U0001f527'],
      [/мебель|диван|кухн|орландо|мебел/, '\U0001fa91'],
      [/китай|поставк|представител|китайск/, '\U0001f1e8\U0001f1f3'],
      [/авито|реклам|маркетинг|лид|заявк|рекорд|контакт|лиды/, '\U0001f4c8'],
      [/жатк|сельхоз|поле|урожай|комбайн/, '\U0001f33e'],
      [/диск|бдм|сельхозтех|трактор/, '\u2699\ufe0f'],
      [/дизайн|баннер|макет|оформлен/, '\U0001f3a8'],
      [/юрид|документ|счет|договор/, '\U0001f4cb'],
      [/сварк|металл|труб|профил/, '\U0001f6e0'],
      [/вентиляц|увлажн/, '\U0001f4a7'],
      [/пластик|окон|стеклопакет/, '\U0001fa9f'],
      [/доск|опт|москва/, '\U0001fab5'],
    ];
    for(var i=0;i<rules.length;i++) if(rules[i][0].test(t)) return rules[i][1];
    return '\U0001f4cc';
  }
  document.querySelectorAll('a.ccard').forEach(function(a){
    var t=a.querySelector('.cc-title'); var em=a.querySelector('.cc-emoji-fb');
    if(!t||!em)return;
    em.textContent=inferEmoji(t.textContent);
  });
}

"""

needle = "function filterCases(){\n  const q=document.getElementById('searchInput').value.toLowerCase();"
if needle not in s:
    raise SystemExit("filterCases needle not found")

s = s.replace(
    needle,
    JS_BLOCK.strip() + "\n\n" + needle,
    1,
)

# After filterCases closing }, add sort call — actually we need sort on load only; insert before Link preview
marker = "\n\n/* Link preview thumbnails for case cards (Microlink) */"
if marker not in s:
    raise SystemExit("microlink marker missing")

inject = """

sortCasesColumns();
applyCaseEmojis();
"""
s = s.replace(marker, inject + marker, 1)

P.write_text(s, encoding="utf-8", newline="\n")
print("OK: cases patch applied")
