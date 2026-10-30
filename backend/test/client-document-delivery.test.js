'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'../..'),source=fs.readFileSync(root+'/js/client-generators.js','utf8'),sandbox={module:{exports:{}}};
vm.runInNewContext(source,sandbox);const G=sandbox.module.exports,tick=()=>new Promise(r=>setImmediate(r));
const pdf=()=>new Blob(['%PDF-1.4\nTest document\n%%EOF'],{type:'application/pdf'});
const batch=()=>({snapshot:{scope:'owner|google-a',folderId:'Folder_A',clientId:'A',title:'Тестовый проект A'},jobs:[]});
const job=()=>({title:'Аналитика',type:'analysis',state:'saved',html:'<h1>Test</h1>',file:{id:'doc-a'}});
function fixture(extra={}){
 let current='owner|google-a';const renders=[],downloads=[],shares=[],changed=[];
 const env={isCurrent:s=>s.scope===current,render:async(s,j)=>{renders.push([s,j]);return pdf();},file:(b,n)=>new File([b],n,{type:'application/pdf'}),download:f=>downloads.push(f),canShare:d=>d.files.every(f=>f instanceof File&&f.type==='application/pdf'),share:d=>{shares.push(d);return Promise.resolve();},changed:()=>changed.push(true),...extra};
 return {service:G.createPdfDelivery(env),env,renders,downloads,shares,changed,actor:s=>{current=s;}};
}
test('PDF filenames use captured project and safe filenames, never HTML',()=>{
 assert.equal(G.pdfName(batch().snapshot,job()),'Аналитика - Тестовый проект A.pdf');
 const name=G.pdfName({title:'a/b:c*?"<>|\u0000'},{title:'x\ny'});assert.ok(name.endsWith('.pdf'));assert.equal(/[\\/:*?"<>|\u0000-\u001f]/.test(name),false);assert.ok(G.pdfName({title:'a'.repeat(250)},job()).length<=164);
});
test('binary validation rejects HTML, empty and oversized files',async()=>{
 assert.equal(await G.validatePdf(pdf()) instanceof Blob,true);
 for(const blob of [new Blob([]),new Blob(['<html>not PDF</html>']),new Blob([new Uint8Array(26*1024*1024)])])await assert.rejects(G.validatePdf(blob));
});
test('unfinished documents cannot trigger export, download or share',async()=>{
 const h=fixture(),b=batch(),j={state:'generating'};await assert.rejects(h.service.get(b,j),/создаётся/);assert.throws(()=>h.service.download(b,[j]),/подготовки/);assert.throws(()=>h.service.share(b,[j]));assert.equal(h.renders.length,0);assert.equal(h.downloads.length,0);assert.equal(h.shares.length,0);
});
test('concurrent PDF preparation coalesces and ready files are reused',async()=>{
 let release,calls=0;const h=fixture({render:()=>{calls++;return new Promise(r=>{release=r;});}}),b=batch(),j=job();
 const one=h.service.get(b,j),two=h.service.get(b,j);assert.equal(one,two);await tick();assert.equal(calls,1);release(pdf());const file=await one;assert.equal(await two,file);assert.equal(await h.service.get(b,j),file);assert.equal(h.service.peek(b,j),file);assert.equal(j.pdfState,'ready');assert.equal(calls,1);
});
test('large PDF renderers run serially, not concurrently',async()=>{
 const releases=[],starts=[];const h=fixture({render:(s,j)=>{starts.push(j.title);return new Promise(r=>{releases.push(r);});}}),b=batch(),a=job(),c={...job(),title:'Скрипты'};
 const one=h.service.get(b,a),two=h.service.get(b,c);await tick();assert.deepEqual(starts,['Аналитика']);releases.shift()(pdf());await one;await tick();assert.deepEqual(starts,['Аналитика','Скрипты']);releases.shift()(pdf());await two;
});
test('switching selected project or tab does not reroute captured filenames',async()=>{
 const h=fixture(),b=batch(),j=job();let selected={folderId:'B',title:'Other project'};await h.service.get(b,j);selected.title='C';h.service.download(b,[j]);assert.equal(h.renders[0][0].folderId,'Folder_A');assert.match(h.downloads[0].name,/Тестовый проект A/);
});
test('changing actor before or during preparation blocks all delivery',async()=>{
 for(const during of [false,true]){
  let release;const h=fixture({render:()=>new Promise(r=>{release=r;})}),b=batch(),j=job();
  if(!during)h.actor('other');const pending=h.service.get(b,j);if(during){await tick();h.actor('other');release(pdf());}
  await assert.rejects(pending,/изменился/);assert.equal(h.service.peek(b,j),null);assert.throws(()=>h.service.download(b,[j]),/изменился/);assert.throws(()=>h.service.share(b,[j]),/изменился/);assert.equal(h.downloads.length,0);assert.equal(h.shares.length,0);
 }
});
test('ready PDF cannot be reused with another project or changed content',async()=>{
 const h=fixture(),b=batch(),j=job();await h.service.get(b,j);const other=batch();other.snapshot.folderId='Folder_B';assert.equal(h.service.peek(other,j),null);await assert.rejects(h.service.get(other,j),/другому проекту/);j.html='<h1>Changed</h1>';assert.equal(h.service.peek(b,j),null);await h.service.get(b,j);assert.equal(h.renders.length,2);
});
test('failed PDF preparation is retriable without touching generated document state',async()=>{
 let fail=true,calls=0;const h=fixture({render:async()=>{calls++;if(fail)throw Error('Export failed');return pdf();}}),b=batch(),j={...job(),state:'save_failed',error:'Drive save uncertain'};
 await assert.rejects(h.service.get(b,j),/Export failed/);assert.equal(j.pdfState,'failed');assert.equal(j.state,'save_failed');assert.equal(j.error,'Drive save uncertain');assert.ok(j.html);assert.equal(calls,1);fail=false;await h.service.get(b,j);assert.equal(calls,2);assert.equal(j.state,'save_failed');
});
test('download all waits for all PDFs and only schedules actual PDF files',async()=>{
 const h=fixture(),b=batch(),jobs=[job(),{...job(),title:'Скрипты'},{...job(),title:'Нужно сейчас'},{...job(),title:'Авито №1'}];await h.service.get(b,jobs[0]);assert.throws(()=>h.service.download(b,jobs),/подготовки/);assert.equal(h.downloads.length,0);await Promise.all(jobs.map(j=>h.service.get(b,j)));assert.equal(h.service.download(b,jobs),4);for(const f of h.downloads){assert.equal(f.type,'application/pdf');assert.ok(f.name.endsWith('.pdf'));assert.equal(await f.slice(0,5).text(),'%PDF-');}
});
test('native file share is invoked synchronously with prepared files, no links or text upload',async()=>{
 const h=fixture(),b=batch(),j=job();await h.service.get(b,j);const promise=h.service.share(b,[j]);assert.equal(h.shares.length,1);assert.equal(h.shares[0].files[0] instanceof File,true);assert.equal('url' in h.shares[0],false);assert.equal('text' in h.shares[0],false);await promise;
});
test('unsupported browser or cancellation never silently sends or retries',async()=>{
 const b=batch(),j=job(),h=fixture({canShare:()=>false});await h.service.get(b,j);assert.equal(h.service.canShare(b,[j]),false);assert.throws(()=>h.service.share(b,[j]),/не поддерживает/);assert.equal(h.shares.length,0);
 let calls=0;const cancel=fixture({share:()=>{calls++;return Promise.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));}});await cancel.service.get(b,j);await assert.rejects(cancel.service.share(b,[j]),{name:'AbortError'});await tick();assert.equal(calls,1);
});
test('UI exposes compact PDF controls, bulk after completion and honest Telegram fallback',()=>{
 assert.match(source,/button\('↓ PDF'/);assert.equal(source.includes('Скачать HTML'),false);assert.match(source,/if\(batch.running\|\|jobs.length<2\)return null/);assert.match(source,/Скачать всё · PDF/);assert.match(source,/https:\/\/web.telegram.org\/k\//);assert.match(source,/прикрепите файлы/);assert.match(source,/error.name==='AbortError'/);assert.equal(/t\.me\/share|tg:\/\/msg_url/.test(source),false);assert.equal(source.includes('permissions.create'),false);
});
