'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../js/client-folder-board.js'),'utf8'),sandbox);const api=sandbox.module.exports;
class Target{
 constructor(){this.events=new Map();}
 addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
 removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
 fire(name,event={}){for(const fn of this.events.get(name)||[])fn(event);}
 closest(){return null;}
}
function harness(){
 const doc=new Target(),win=new Target(),columns=new Target(),root=new Target(),pending=[],observers=[];
 const slider=new Target();slider.setAttribute=()=>{};slider.remove=()=>{slider.removed=true;};
 Object.assign(columns,{scrollLeft:0,scrollWidth:1200,clientWidth:300,querySelector:()=>({offsetWidth:230}),before:node=>{root.slider=node;}});
 Object.assign(root,{isConnected:true,getClientRects:()=>root.visible===false?[]:[{}],parentNode:{},querySelector:selector=>selector==='.cfb-columns'?columns:null});
 Object.assign(doc,{body:new Target(),documentElement:new Target(),activeElement:null,dialogs:[],querySelectorAll:()=>doc.dialogs,createElement:()=>slider});doc.activeElement=doc.body;
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 Object.assign(win,{document:doc,requestAnimationFrame:fn=>{pending.push(fn);return pending.length;},cancelAnimationFrame(){},getComputedStyle:()=>({columnGap:'12px'}),ResizeObserver:Observer,MutationObserver:Observer});
 let active=true;const binding=api.bindBoardNavigation(win,root,()=>active);
 function key(name,extra={}){const event={key:name,target:doc.body,preventDefault(){this.defaultPrevented=true;},...extra};doc.fire('keydown',event);return event;}
 return {doc,win,columns,root,slider,binding,observers,key,flush(){while(pending.length)pending.shift()();},active(value){active=value;}};
}
test('arrows move one direction, key repeat is controlled, and both ends are clamped',()=>{
 const h=harness();assert.equal(h.slider.max,'900');assert.equal(h.slider.hidden,false);
 assert.equal(h.key('ArrowRight').defaultPrevented,true);assert.equal(h.columns.scrollLeft,242);assert.equal(h.slider.value,'242');
 h.key('ArrowRight',{repeat:true});assert.equal(h.columns.scrollLeft,306);h.key('ArrowLeft');assert.equal(h.columns.scrollLeft,64);
 h.key('ArrowLeft');assert.equal(h.columns.scrollLeft,0);for(let i=0;i<10;i++)h.key('ArrowRight');assert.equal(h.columns.scrollLeft,900);
});
test('the top slider and native horizontal scroll stay synchronized in both directions',()=>{
 const h=harness();h.slider.value='550';h.slider.fire('input');assert.equal(h.columns.scrollLeft,550);
 h.columns.scrollLeft=77;h.columns.fire('scroll');h.flush();assert.equal(h.slider.value,'77');
 h.doc.activeElement=h.slider;h.key('ArrowRight',{target:h.slider});assert.equal(h.columns.scrollLeft,319);
});
test('text editing, other sliders, modifiers, handled keys, and open dialogs retain their keyboard behavior',()=>{
 const h=harness(),editor=new Target();editor.closest=()=>editor;
 for(const extra of [{target:editor},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{defaultPrevented:true}]){h.key('ArrowRight',extra);assert.equal(h.columns.scrollLeft,0);}
 h.doc.activeElement=editor;h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);h.doc.activeElement=h.doc.body;
 h.doc.dialogs=[{getClientRects:()=>[{}]}];h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);
 h.doc.dialogs=[];assert.equal(h.key('ArrowDown').defaultPrevented,undefined);assert.equal(h.columns.scrollLeft,0);
});
test('navigation stays confined to the visible active client board',()=>{
 const h=harness();h.active(false);h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);
 h.active(true);h.root.visible=false;h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);
 h.root.visible=true;h.root.isConnected=false;h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);
});
test('resizing updates the range and hides it when the columns fit',()=>{
 const h=harness();h.columns.clientWidth=600;h.observers[0].callback();h.flush();assert.equal(h.slider.max,'600');
 h.columns.scrollWidth=600;h.win.fire('resize');h.flush();assert.equal(h.slider.max,'0');assert.equal(h.slider.hidden,true);
});
test('replacement or removal releases listeners and observers, preventing duplicate keyboard handling',()=>{
 const h=harness();h.root.isConnected=false;h.observers[1].callback();
 assert.equal(h.doc.events.get('keydown').size,0);assert.equal(h.columns.events.get('scroll').size,0);assert.equal(h.win.events.get('resize').size,0);assert.equal(h.slider.removed,true);assert.ok(h.observers.every(o=>o.disconnected));
 h.binding.dispose();h.key('ArrowRight');assert.equal(h.columns.scrollLeft,0);
});
