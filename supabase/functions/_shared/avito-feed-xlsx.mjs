import { unzipSync, zipSync, strFromU8, strToU8 } from 'npm:fflate@0.8.3';
import { DOMParser, XMLSerializer } from 'npm:@xmldom/xmldom@0.9.12';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const fail=code=>Object.assign(new Error(code),{code});
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS(NS,name));
function xml(bytes){const text=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw fail('unsafe_workbook');const d=new DOMParser({onError:()=>{throw fail('invalid_workbook_xml');}}).parseFromString(text,'application/xml');if(!d.documentElement)throw fail('invalid_workbook_xml');return d;}
function load(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>10485760)throw fail('cloud_file_too_large');let expanded=0,count=0;
 const parts=unzipSync(bytes,{filter:e=>{expanded+=e.originalSize;count++;if(count>256||expanded>33554432||e.name.includes('..')||e.name.includes('\\')||e.name.startsWith('/'))throw fail('unsafe_workbook');return true;}});
 for(const p of ['xl/workbook.xml','xl/_rels/workbook.xml.rels'])if(!parts[p])throw fail('invalid_workbook');
 const shared=parts['xl/sharedStrings.xml']?elements(xml(parts['xl/sharedStrings.xml']),'si').map(s=>elements(s,'t').map(t=>t.textContent).join('')):[];
 const value=c=>{if(!c)return '';if(c.getAttribute('t')==='s'){const index=Number(elements(c,'v')[0]?.textContent);if(!Number.isSafeInteger(index)||!Object.hasOwn(shared,index))throw fail('invalid_workbook');return shared[index];}if(c.getAttribute('t')==='inlineStr')return elements(c,'t').map(t=>t.textContent).join('');return elements(c,'v')[0]?.textContent||'';};
 const rels=Array.from(xml(parts['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship'));
 const sheets=[];for(const sheet of elements(xml(parts['xl/workbook.xml']),'sheet')){
  const rel=rels.find(r=>r.getAttribute('Id')===sheet.getAttributeNS(REL,'id'));if(!rel||rel.getAttribute('TargetMode')==='External')throw fail('unsafe_workbook');
  const target=new URL(rel.getAttribute('Target'),'https://xlsx.invalid/xl/').pathname.slice(1);if(!/^xl\/worksheets\/[^/]+\.xml$/.test(target)||!parts[target])throw fail('invalid_workbook');
  const doc=xml(parts[target]),rows=elements(doc,'row'),headers=new Map();for(const cell of elements(rows[0],'c')){const name=value(cell);if(['AvitoId','Id','Title'].includes(name)){if(headers.has(name))throw fail('ambiguous_workbook_headers');headers.set(name,cell.getAttribute('r').replace(/\d+$/,''));}}
  if(!headers.has('AvitoId')||!headers.has('Id')||!headers.has('Title'))continue;
  const items=[];for(const row of rows.slice(1)){const cells=elements(row,'c'),cell=col=>cells.find(c=>c.getAttribute('r').replace(/\d+$/,'')===col),id=value(cell(headers.get('AvitoId')));if(!id)continue;if(!/^[1-9][0-9]{0,15}$/.test(id))throw fail('invalid_feed_item_id');const title=cell(headers.get('Title'));items.push({item_id:id,feed_id:value(cell(headers.get('Id'))),title:value(title),cell:title,sheet:sheet.getAttribute('name')});}
  sheets.push({name:sheet.getAttribute('name'),target,doc,items});
 }
 if(!sheets.length)throw fail('feed_headers_missing');return {parts,sheets};
}
function inventory({sheets}){return {items:sheets.reduce((n,s)=>n+s.items.length,0),sheets:sheets.map(s=>({name:s.name,items:s.items.length})),records:sheets.flatMap(s=>s.items.map(i=>({item_id:i.item_id,feed_id:i.feed_id,title:i.title,sheet:i.sheet})))};}
export function inspectFeed(bytes){return inventory(load(bytes));}
function write(model,changes){
 if(!Array.isArray(changes)||!changes.length||changes.length>20||new Set(changes.map(c=>c.item_id)).size!==changes.length)throw fail('invalid_feed_changes');
 const {parts,sheets}=model,dirty=new Set();for(const change of changes){
  if(typeof change.new_title!=='string'||!change.new_title.trim()||Array.from(change.new_title).length>50||/[\p{Cc}\p{Cs}]/u.test(change.new_title)||/^[=+@]/.test(change.new_title))throw fail('invalid_feed_title');
  const matches=sheets.flatMap(s=>s.items.filter(i=>i.item_id===String(change.item_id)).map(i=>({s,i})));if(matches.length!==1)throw fail(matches.length?'ambiguous_feed_item':'feed_item_missing');
  const {s,i}=matches[0];if(i.title!==change.old_title||!i.cell||elements(i.cell,'f').length||i.title===change.new_title)throw fail('feed_title_changed');
  while(i.cell.firstChild)i.cell.removeChild(i.cell.firstChild);i.cell.setAttribute('t','inlineStr');const inline=s.doc.createElementNS(NS,'is'),text=s.doc.createElementNS(NS,'t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.appendChild(s.doc.createTextNode(change.new_title));inline.appendChild(text);i.cell.appendChild(inline);dirty.add(s);
 }
 for(const s of dirty)parts[s.target]=strToU8(new XMLSerializer().serializeToString(s.doc));
 return zipSync(parts,{level:1,mtime:new Date('1980-01-01T00:00:00Z')});
}
export function patchFeed(bytes,changes){return write(load(bytes),changes);}
export function prepareFeed(bytes){const model=load(bytes);let used=false;return {inventory:inventory(model),patch:changes=>{if(used)throw fail('feed_already_changed');used=true;return write(model,changes);}};}
