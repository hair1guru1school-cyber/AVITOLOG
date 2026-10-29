'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../js/'+name),'utf8');
const dh={module:{exports:{}}};vm.runInNewContext(read('avito-bidding-dashboard.js'),dh);const dashboard=dh.module.exports;
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.open=false;this.value='';this.style={setProperty(){}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,f){(this.events[k]||=[]).push(f);}fire(k){for(const f of this.events[k]||[])f({});}showModal(){this.open=true;}close(){this.open=false;this.fire('close');}remove(){}
}
function all(node){return [node,...node.children.flatMap(all)];}
async function settle(state){for(let i=0;i<300;i++){await new Promise(r=>setImmediate(r));if(!state.busy&&!state.loading&&!state.loadingAll&&!state.detailLoading)return;}throw Error('Did not settle');}
function harness(options={}){
 let clock=Date.now(),current=true;class Clock extends Date{static now(){return clock;}}
 const h={module:{exports:{}},Date:Clock};vm.runInNewContext(read('avito-bidding.js'),h);
 const saved=new Map(),calls=[],bids=new Map(),body=new Element('body');
 const win={document:{body,createElement:t=>new Element(t)},crypto:{randomUUID:()=> 'new-group'},Option:function(t,v){const e=new Element('option');e.textContent=t;e.value=v;return e;},setTimeout(f,ms){if(ms!==400)clock+=ms;queueMicrotask(f);return 1;},clearTimeout(){},AvitoBiddingDashboard:{...dashboard,createStorage:()=>({read:async key=>{await options.restoreWait;return options.restore||saved.get(key);},write:async(key,value)=>{saved.set(key,value);}})}};
 const groups=[{id:'group-a',name:'Group A',item_ids:Array.from({length:21},(_,i)=>String(i+1))},{id:'group-b',name:'Group B',item_ids:Array.from({length:21},(_,i)=>String(i+11))}];
 const items=Array.from({length:31},(_,i)=>{const id=String(i+1);bids.set(id,1500);return {item_id:id,title:'Item '+id,status:'active',promotion:{mode:'manual',action_type_id:5,bid_penny:1500,limit_penny:100000}};});
 const detail=id=>({item_id:id,action_type_id:5,current:{mode:'manual',action_type_id:5,bid_penny:bids.get(id),limit_penny:100000},manual:{min_bid_penny:100,max_bid_penny:10000,min_limit_penny:1000,max_limit_penny:500000,recommended_bid_penny:2300,ladder:[]}});
 const ctx={key:'actor|org|account',organizationId:'org',account:{id:'account',source:'personal',credential_version:'v1'},canManage:true,isCurrent:()=>current,api:async(url,opts)=>{calls.push([url,opts]);const action=url.split('?')[0].split('/').pop();if(url.includes('/items?'))return {items,statistics_period:null,next_offset:options.partial?99:null};if(action==='groups')return {groups,revision:1};if(action==='preview'){if(options.switchAfterPreview)current=false;return {quote:String(opts.body.item_id),before:detail(String(opts.body.item_id)).current,after:{mode:opts.body.mode,bid_penny:opts.body.bid_penny,limit_penny:opts.body.limit_penny,action_type_id:options.wrongAction?7:5},expires_at:new Date(clock+900000).toISOString()};}if(action==='apply'){const id=opts.body.quote;if(options.unknownId===id)return {status:'unknown'};const preview=calls.filter(c=>c[0].split('?')[0].endsWith('/preview')&&String(c[1].body.item_id)===id).pop();bids.set(id,preview[1].body.bid_penny);return {status:'applied'};}return {bidding:detail(action)};}};
 ctx.serverQueue=false; // Retain regression coverage for the previous signed per-item client.
 const api=h.module.exports.install(win),host=new Element('div'),state=api.mount(host,ctx);
 return {state,api,host,calls,bids,saved,body,ctx,current:v=>{current=v;},open:async()=>{await settle(state);host.children[0].children.find(e=>e.tagName==='BUTTON').fire('click');await settle(state);},group:async name=>{all(state.parts.toolbar).find(e=>e.className==='avb-group-bar'&&e.children[0].textContent.includes(name)).fire('click');await settle(state);},prepare:(bid='25')=>{state.form={mode:'manual',bid,limit:'1000',period:'1d',budget:''};all(state.parts.controls).find(e=>e.tagName==='BUTTON'&&e.textContent.startsWith('Рассчитать')).fire('click');},confirm:()=>{const consent=all(state.parts.preview).find(e=>e.className==='avb-risk-confirm').children[0];consent.checked=true;consent.fire('change');all(state.parts.preview).find(e=>e.tagName==='BUTTON'&&e.textContent.startsWith('Применить ко всей')).fire('click');}};
}
test('whole groups require one explicit consent; overlapping groups use the last confirmed action for each item',async()=>{
 const h=harness();await h.open();await h.group('Group A');assert.equal(h.state.selected.size,21);h.prepare('25');assert.equal(h.calls.filter(c=>c[0].endsWith('/apply')).length,0);h.confirm();await settle(h.state);assert.equal(h.state.results.filter(r=>r.status==='applied').length,21);
 await h.group('Group B');assert.equal(h.state.selected.has('1'),false);assert.equal(h.state.selected.has('31'),true);h.prepare('35');h.confirm();await settle(h.state);
 assert.equal(h.bids.get('1'),2500);assert.equal(h.bids.get('11'),3500);assert.equal(h.bids.get('31'),3500);assert.equal(h.state.items.find(i=>i.item_id==='11').promotion.bid_penny,3500);
 assert.equal(h.calls.filter(c=>c[0].endsWith('/apply')).length,42);assert.equal(JSON.stringify([...h.saved.values()]).includes('APPLY_BIDS'),false,'paid action consent is not persisted for automatic replay');
});
test('unknown submission stops the whole remaining queue without retrying the item',async()=>{
 const h=harness({unknownId:'3'});await h.open();await h.group('Group A');h.prepare();h.confirm();await settle(h.state);
 assert.deepEqual(h.calls.filter(c=>c[0].endsWith('/apply')).map(c=>c[1].body.quote),['1','2','3']);assert.equal(h.state.results.find(r=>r.id==='4').status,'not_sent');assert.equal(h.state.items.find(i=>i.item_id==='3').promotion.bid_penny,1500);
});
test('changed billing target or account never reaches the paid endpoint',async()=>{
 for(const options of [{wrongAction:true},{switchAfterPreview:true}]){const h=harness(options);await h.open();await h.group('Group A');h.prepare();h.confirm();await settle(h.state);assert.equal(h.calls.filter(c=>c[0].endsWith('/apply')).length,0);}
});
test('editing a confirmed queue draft invalidates consent instead of applying old monetary parameters',async()=>{
 const h=harness();await h.open();await h.group('Group A');h.prepare();h.state.form.bid='90';h.confirm();await settle(h.state);assert.equal(h.calls.filter(c=>c[0].endsWith('/apply')).length,0);
});

test('a resumed cached pagination tail cannot delete pages loaded before the reload',async()=>{
 const h=harness();await h.open();h.state.items=h.state.items.slice(0,2);h.state.next=99;h.state.refreshSeen=undefined;
 h.ctx.api=async()=>({items:[{item_id:'3',title:'New tail'}],next_offset:null});
 all(h.state.parts.toolbar).find(e=>e.textContent==='Выбрать всю группу').fire('click');await settle(h.state);
 assert.deepEqual(Array.from(h.state.items,i=>i.item_id),['1','2','3']);
});

test('overlay refresh keeps old rows until the full traversal confirms removed ads',async()=>{
 const h=harness();await h.open();const old=h.state.items.slice();
 h.ctx.api=async url=>({items:url.includes('offset=0&')?old.slice(0,2):old.slice(2,3),next_offset:url.includes('offset=0&')?99:null});
 all(h.state.parts.toolbar).find(e=>e.textContent==='Обновить список').fire('click');await settle(h.state);assert.equal(h.state.items.length,31);
 all(h.state.parts.toolbar).find(e=>e.textContent==='Ещё объявления').fire('click');await settle(h.state);assert.deepEqual(Array.from(h.state.items,i=>i.item_id),['1','2','3']);
});

test('choosing a group bar clears search instead of silently applying only its search matches',async()=>{
 const h=harness();await h.open();h.state.filter='Item 1';await h.group('Group A');assert.equal(h.state.filter,'');assert.equal(h.state.selected.size,21);
});

test('first network page waits for durable restoration and overlays its prior cached tail',async()=>{
 let resolve;const restoreWait=new Promise(r=>{resolve=r;}),restore={loaded:true,loadedAt:Date.now()-120000,items:[{item_id:'99',title:'Cached tail'}],details:[],groups:[],revision:0,next:null};
 const h=harness({restoreWait,restore,partial:true});await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,0,'network cannot overwrite a cache that is still opening');resolve();await h.open();assert.equal(h.state.items.some(i=>i.item_id==='99'),true);assert.equal(h.state.restored,true);
});
