'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(root+'/js/client-generators.js','utf8'),sandbox);const G=sandbox.module.exports;
const snapshot=()=>({scope:'actor|profile',folderId:'Drive_A',clientId:'project-a',title:'Project A',data:{company:'Project A',category:'Furniture',city:'City',positions:['Kitchens'],notes:'Specific facts'}});
const make=(snap=snapshot(),selected=['scripts','analysis','presale','avito1'],comments={})=>G.plan(snap,selected,comments,(type,data,comment)=>JSON.stringify({type,data,comment}));
const tick=()=>new Promise(r=>setImmediate(r));

test('exactly four generators capture immutable project, folder, selection, facts and optional comments',()=>{
 const snap=snapshot(),comments={analysis:'My comment'},batch=make(snap,['analysis','avito1'],comments);snap.folderId='Drive_B';snap.data.company='B';comments.analysis='changed';
 assert.equal(G.TYPES.length,4);assert.equal(batch.snapshot.folderId,'Drive_A');assert.equal(batch.jobs.length,2);assert.equal(batch.jobs[0].comment,'My comment');assert.equal(JSON.parse(batch.jobs[0].prompt).data.company,'Project A');assert.equal(batch.jobs[1].comment,'');
 assert.throws(()=>make(snapshot(),[]),/Выберите/);assert.throws(()=>make({...snapshot(),folderId:'../wrong'}),/папку/);
});
test('suggestions are explicit choices, never silently appended to comments',()=>{
 const snap=snapshot(),suggestions=G.suggestions(snap.data),batch=make(snap,['analysis']);assert.equal(suggestions.length,4);assert.equal(batch.jobs[0].comment,'');
});
test('switching tabs and selecting another project cannot redirect any queued file',async()=>{
 let selected=snapshot(),tab='scripts',calls=[],release;
 const runner=G.createRunner({isCurrent:s=>s.scope==='actor|profile',prepare:async()=>{},generate:()=>new Promise(r=>{release=r;}),parse:raw=>raw,save:async(s,j,guard)=>{guard();calls.push([s.folderId,j.type,selected.folderId,tab]);return {id:j.type};}});
 const batch=make(selected,['analysis','presale']),running=runner.run(batch);await tick();selected={...snapshot(),folderId:'Drive_B'};tab='projects';release('<h1>A</h1>');await tick();assert.equal(calls.length,1);tab='crm';release('<h1>B</h1>');await running;
 assert.deepEqual(calls.map(c=>c[0]),['Drive_A','Drive_A']);assert.equal(batch.jobs.every(j=>j.state==='saved'),true);
});
test('scope change or explicit cancellation after AI reply blocks all Drive writes and later API calls',async()=>{
 for(const cancel of [false,true]){let valid=true,release,writes=0,reads=0;const runner=G.createRunner({isCurrent:()=>valid,prepare:async()=>{},generate:()=>{reads++;return new Promise(r=>{release=r;});},parse:r=>r,save:async()=>{writes++;return{id:'x'};}});const batch=make(),run=runner.run(batch);await tick();if(cancel)runner.cancel();else valid=false;release('<h1>result</h1>');await run;assert.equal(writes,0);assert.equal(reads,1);assert.equal(batch.jobs.slice(1).every(j=>j.state==='not_started'),true);}
});
test('failed save retains generated HTML and never silently retries or resubmits AI',async()=>{
 let ai=0,writes=0;const runner=G.createRunner({isCurrent:()=>true,prepare:async()=>{},generate:async()=>{ai++;return '<h1>A</h1>';},parse:r=>r,save:async()=>{writes++;throw Error('Uncertain Drive result');}}),batch=make(snapshot(),['analysis']);await runner.run(batch);assert.equal(ai,1);assert.equal(writes,1);assert.equal(batch.jobs[0].state,'save_failed');assert.equal(batch.jobs[0].html,'<h1>A</h1>');
});
test('folder permission failure happens before AI; duplicate concurrent queue is refused',async()=>{
 let count=0;const runner=G.createRunner({isCurrent:()=>true,prepare:async()=>{throw Error('No folder permission');},generate:async()=>{count++;},onChange(){}}),batch=make();const running=runner.run(batch);await assert.rejects(runner.run(make()),/ещё выполняется/);await running;assert.equal(count,0);assert.match(batch.error,/No folder/);assert.equal(batch.jobs.every(j=>j.state==='not_started'),true);
});
test('generated normalized fields cannot overwrite CRM; malformed and empty answers fail closed',()=>{
 let cleaned=0;const result=G.parseResult('```json\n{"html":"<h1>A</h1>","normalized":{"company":"MUTATED"}}\n```',s=>{cleaned++;return s;});assert.equal(result,'<h1>A</h1>');assert.equal(cleaned,1);assert.throws(()=>G.parseResult('{"html":""}',s=>s));assert.throws(()=>G.parseResult('not-json',s=>s));assert.throws(()=>G.parseResult('{"html":"<script>x</script>"}',()=>''));
});
test('Drive upload guard rechecks identity after asynchronous token refresh, before transmission',async()=>{
 const source=fs.readFileSync(root+'/js/main.js','utf8'),start=source.indexOf('async function driveCreateGoogleDoc('),end=source.indexOf('\nasync function generatePDF',start),fn=source.slice(start,end);let sent=0,guardCalls=0;
 const env={getDriveToken:async()=>{return 'different-token';},fetch:async()=>{sent++;},Blob,Date,readDriveUploadResult(){}};vm.runInNewContext(fn+';this.save=driveCreateGoogleDoc;',env);await assert.rejects(env.save('Document','html','Drive_A',token=>{guardCalls++;if(token)throw Error('Actor changed');}),/Actor changed/);assert.equal(sent,0);assert.equal(guardCalls,2);
});
test('UI retains old template library, keyboard comments, global progress and no localStorage result eviction',()=>{
 const source=fs.readFileSync(root+'/js/client-generators.js','utf8'),css=fs.readFileSync(root+'/assets/css/client-generators.css','utf8');assert.ok(source.includes('library(libraryHost)'));assert.ok(source.includes("event.key === 'F2'"));assert.ok(source.includes("doc.body.append(progress)"));assert.ok(source.includes("event.returnValue = ''"));assert.equal(source.includes('saveNorm('),false);assert.equal(source.includes('localStorage'),false);assert.match(css,/#tab-analysis/);assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/prefers-reduced-motion/);
});
