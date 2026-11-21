'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'../..'),box={module:{exports:{}},URL};
vm.runInNewContext(fs.readFileSync(root+'/js/kp-documents.js','utf8'),box);const G=box.module.exports;
function harness(){
  const records=new Map();let owner='fil',sequence=0,writeFailure=false,readGate=null;
  const options={Blob,id:()=>String(++sequence),guard(value){if(value!==owner)throw Error('context_changed');},async read(key){if(readGate)await readGate;return records.get(key);},async write(key,value){if(writeFailure)throw Error('commit_failed');records.set(key,structuredClone(value));}};
  return {records,options,library:G.coverLibrary(options),switch(value){owner=value;},fail(value){writeFailure=value;},gate(value){readGate=value;}};
}
const image=name=>({name,blob:new Blob(['test raster'],{type:'image/png'})});
test('uploaded covers persist across library reloads and remain profile scoped',async()=>{
  const h=harness();assert.equal((await h.library.load('fil')).items.length,0);
  const result=await h.library.add('fil',[image('Обложка.png'),image('Мебель')]);assert.equal(result.items.length,2);
  const reloaded=G.coverLibrary(h.options);assert.equal((await reloaded.load('fil')).items[0].name,'Обложка.png');
  h.switch('sasha');assert.equal((await reloaded.load('sasha')).items.length,0);await assert.rejects(()=>reloaded.load('fil'),/context_changed/);
});
test('built-in and custom deletions persist, retain image data and can be restored',async()=>{
  const h=harness(),added=await h.library.add('fil',[image('Своя')]),id=added.items[0].id;
  await h.library.remove('fil','stroyka');await h.library.remove('fil',id);
  const record=await G.coverLibrary(h.options).load('fil');assert.deepEqual(record.hidden,['stroyka',id]);assert.equal(record.items[0].blob.size,11);
  assert.deepEqual(Array.from((await h.library.restore('fil')).hidden),[]);await assert.rejects(()=>h.library.remove('fil','missing'),/не найдена/);
});
test('failed durable writes do not remove a cover or acknowledge a new upload',async()=>{
  const h=harness();await h.library.add('fil',[image('Сохранена')]);h.fail(true);
  await assert.rejects(()=>h.library.remove('fil','original'),/commit_failed/);
  await assert.rejects(()=>h.library.add('fil',[image('Не сохранена')]),/commit_failed/);
  const record=await h.library.load('fil');assert.equal(record.items.length,1);assert.deepEqual(record.hidden,[]);
  h.fail(false);assert.equal((await h.library.add('fil',[image('После ошибки')])).items.length,2);
});
test('concurrent library mutations preserve both uploads and the delete',async()=>{
  const h=harness();await Promise.all([h.library.add('fil',[image('Один')]),h.library.add('fil',[image('Два')]),h.library.remove('fil','mebel')]);
  const record=await h.library.load('fil');assert.equal(record.items.length,2);assert.deepEqual(record.hidden,['mebel']);
});
test('profile change during hydration blocks persistence; malformed images and records are not overwritten',async()=>{
  const h=harness();let release;h.gate(new Promise(resolve=>{release=resolve;}));const task=h.library.add('fil',[image('Не другая учётка')]);await Promise.resolve();h.switch('sasha');release();await assert.rejects(()=>task,/context_changed/);assert.equal(h.records.size,0);
  h.gate(null);await assert.rejects(()=>h.library.add('sasha',[{name:'svg',blob:new Blob(['svg'],{type:'image/svg+xml'})}]),/PNG/);
  h.records.set('sasha',{version:99,items:[]});await assert.rejects(()=>h.library.load('sasha'),/не изменены/);assert.equal(h.records.get('sasha').version,99);
});
test('cross-tab lock surrounds fresh read and durable write',async()=>{
  const h=harness(),calls=[];h.options.lock=async(owner,run)=>{calls.push('lock:'+owner);try{return await run();}finally{calls.push('unlock');}};
  await G.coverLibrary(h.options).add('fil',[image('Файл')]);assert.deepEqual(calls,['lock:fil','unlock']);
});
