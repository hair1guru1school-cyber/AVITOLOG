'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'../..'),source=fs.readFileSync(root+'/js/client-generators.js','utf8');
const renderer=source.slice(source.indexOf('    function renderTemplates('),source.indexOf('    function build('));
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.className='';this.value='';this.open=false;this.disabled=false;this.style={setProperty(){}};this.classList={add:n=>{this.className+=' '+n;},remove:n=>{this.className=this.className.split(' ').filter(x=>x!==n).join(' ');}};}
 get lastChild(){return this.children.at(-1);}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}
 get textContent(){return this.text||this.children.map(x=>x.textContent).join('');}set textContent(v){this.text=String(v);this.replaceChildren();}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}addEventListener(k,f){(this.events[k]||=[]).push(f);}
 async fire(type,event={}){if(this.disabled&&type==='click')return;for(const fn of this.events[type]||[])await fn({target:this,preventDefault(){},...event});}
 showModal(){this.open=true;}close(){this.open=false;this.fire('close');}focus(){this.focused=true;}
}
const all=node=>[node,...node.children.flatMap(all)],tick=()=>new Promise(r=>setImmediate(r));
function harness(options={}) {
 const doc={body:new Element('body'),createElement:tag=>new Element(tag)},target=new Element('section'),store=options.store||new Map(),writes=[],copied=[],timers=[],dialogs=new Map();doc.body.append(target);
 let actor='actor',fail=options.failWrite||false;
 const snapshot={scope:'actor',folderId:options.folder||'A',title:'Project '+(options.folder||'A'),data:{category:'Furniture'}};
 const base=[{id:'one',label:'One',emoji:'📎',color:'#0d9488',text:'First\nfull message'},{id:'many',label:'Many',emoji:'💡',text:'',variants:['Choice A\nfull text','Choice B\nfull text']},{id:'empty',label:'Empty',emoji:'📝',text:''}];
 const el=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls||'';if(text!=null)e.textContent=text;return e;},button=(label,fn,cls)=>{const e=el('button',cls,label);e.addEventListener('click',fn);return e;};
 const win={__getScriptsPanelData:()=>base,navigator:{clipboard:{writeText:async t=>{if(options.failCopy)throw Error('Clipboard denied');copied.push(t);}}},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){}};
 const prefs=async(id,value)=>{if(value===undefined){await options.readWait;return store.get(id);}if(fail)throw Error('Storage failed');store.set(id,JSON.parse(JSON.stringify(value)));writes.push([id,value]);return value;};
 const env={doc,win,el,button,prefs,scope:()=>actor,key:s=>s.scope+'|'+s.folderId,copy:v=>JSON.parse(JSON.stringify(v)),suggestions:()=>['Niche: Furniture'],message:e=>e.message,dialogs};
 vm.runInNewContext(renderer+'\nthis.render=renderTemplates;',env);env.render(snapshot,target);
 const nodes=()=>all(doc.body),find=predicate=>{const result=nodes().find(predicate);assert.ok(result,'Expected UI element');return result;};
 return {doc,target,store,writes,copied,timers,dialogs,nodes,snapshot,ready:tick,fail:v=>{fail=v;},actor:v=>{actor=v;},button:label=>find(e=>e.tagName==='BUTTON'&&e.textContent===label),template:label=>find(e=>e.className.split(' ').includes('cg-template-button')&&e.getAttribute('data-label')===label),input:()=>find(e=>e.tagName==='TEXTAREA'),modal:()=>nodes().find(e=>e.tagName==='DIALOG'),byAria:label=>find(e=>e.getAttribute('aria-label')===label)};
}
test('compact buttons have no text editor until requested; single click copies full text',async()=>{
 const h=harness();await h.ready();assert.equal(h.nodes().filter(e=>e.className==='cg-template-button').length,3);assert.equal(h.nodes().some(e=>e.tagName==='TEXTAREA'),false);await h.template('One').fire('click');assert.deepEqual(h.copied,['First\nfull message']);assert.equal(h.modal(),undefined);
});
test('multi-variant picker copies the complete chosen text, not its preview',async()=>{
 const h=harness();await h.ready();await h.template('Many').fire('click');assert.ok(h.modal());assert.equal(h.nodes().some(e=>e.tagName==='TEXTAREA'),false);await h.byAria('Скопировать вариант 2').fire('click');assert.deepEqual(h.copied,['Choice B\nfull text']);assert.equal(h.modal(),undefined);assert.equal(h.writes.length,0);
});
test('right click adds variants, commits only on Save and survives reload',async()=>{
 const h=harness();await h.ready();let prevented=false;await h.template('One').fire('contextmenu',{preventDefault(){prevented=true;}});assert.ok(prevented);h.input().value='Edited original';await h.button('+ Вариант').fire('click');h.input().value='Second version';assert.equal(h.writes.length,0);await h.button('Сохранить варианты').fire('click');assert.equal(h.modal(),undefined);assert.deepEqual(h.store.get('actor|A').variants.one,['Edited original','Second version']);assert.ok(h.template('One').textContent.includes('2'));
 const reloaded=harness({store:h.store});await reloaded.ready();await reloaded.template('One').fire('click');await reloaded.byAria('Скопировать вариант 2').fire('click');assert.deepEqual(reloaded.copied,['Second version']);
});
test('Cancel and Escape never save editor drafts',async()=>{
 for(const escape of [false,true]){const h=harness();await h.ready();await h.template('One').fire('contextmenu');h.input().value='Unsaved';if(escape)h.modal().close();else await h.button('Отмена').fire('click');assert.equal(h.writes.length,0);await h.template('One').fire('click');assert.deepEqual(h.copied,['First\nfull message']);}
});
test('storage error keeps draft open and retry preserves other variants',async()=>{
 const store=new Map([['actor|A',{auto:false,variants:{many:['Custom A','Custom B']}}]]),h=harness({store,failWrite:true});await h.ready();await h.template('One').fire('contextmenu');h.input().value='Keep my draft';await h.button('Сохранить варианты').fire('click');assert.ok(h.modal());assert.equal(h.input().value,'Keep my draft');assert.equal(h.writes.length,0);h.fail(false);await h.button('Сохранить варианты').fire('click');assert.deepEqual(store.get('actor|A').variants.many,['Custom A','Custom B']);
});
test('late initial read cannot overwrite saved variants after an early click',async()=>{
 let release;const readWait=new Promise(r=>{release=r;}),store=new Map([['actor|A',{auto:false,variants:{one:['Saved custom']}}]]),h=harness({readWait,store});assert.equal(h.template('One').disabled,true);await h.template('One').fire('click');assert.equal(h.copied.length,0);release();await h.ready();await h.template('One').fire('click');assert.deepEqual(h.copied,['Saved custom']);
});
test('project isolation and account-switch guard prevent cross-project edits',async()=>{
 const store=new Map([['actor|A',{auto:false,variants:{one:['Private A']}}]]),h=harness({store,folder:'B'});await h.ready();await h.template('One').fire('click');assert.deepEqual(h.copied,['First\nfull message']);await h.template('One').fire('contextmenu');h.input().value='Changed';h.actor('other');await h.button('Сохранить варианты').fire('click');assert.equal(h.writes.length,0);assert.deepEqual(store.get('actor|A').variants.one,['Private A']);
});
test('F2 and touch hold open settings without copying',async()=>{
 const h=harness();await h.ready();await h.template('One').fire('keydown',{key:'F2'});assert.ok(h.modal());h.modal().close();const control=h.template('One');await control.fire('pointerdown',{button:0,pointerType:'touch',clientX:0,clientY:0});h.timers.find(t=>t.ms===550).fn();await control.fire('click');assert.ok(h.modal());assert.equal(h.copied.length,0);
});
test('empty variants do not copy or report success',async()=>{
 const h=harness();await h.ready();await h.template('Empty').fire('click');assert.equal(h.copied.length,0);assert.ok(h.nodes().some(e=>e.textContent.includes('Вариант пустой')));
});
test('variant deletion stays a draft until saved',async()=>{
 const h=harness();await h.ready();await h.template('Many').fire('contextmenu');await h.button('Удалить вариант').fire('click');assert.equal(h.writes.length,0);await h.button('Сохранить варианты').fire('click');assert.deepEqual(h.store.get('actor|A').variants.many,['Choice B\nfull text']);
});
