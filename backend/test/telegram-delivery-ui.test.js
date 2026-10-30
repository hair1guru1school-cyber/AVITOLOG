'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'../..'),source=fs.readFileSync(root+'/js/telegram-delivery.js','utf8'),sandbox={module:{exports:{}}};vm.runInNewContext(source,sandbox);const G=sandbox.module.exports;
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.dataset={};this.attributes={};this.value='';this.disabled=false;this.className='';}
 get textContent(){return (this.text||'')+this.children.map(x=>x.textContent).join('');}set textContent(t){this.text=String(t);this.replaceChildren();}
 append(...nodes){for(const n of nodes){if(n===this)throw Error('DOM cycle');n.remove();n.parent=this;this.children.push(n);}}prepend(n){this.append(n);this.children.unshift(this.children.pop());}replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){(this.events[k]||=[]).push(fn);}async fire(k){for(const fn of this.events[k]||[])await fn.call(this,{target:this});}showModal(){this.open=true;}close(){this.open=false;this.fire('close');}querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(x=>x.type==='password');}
}
const all=n=>[n,...n.children.flatMap(all)],tick=()=>new Promise(r=>setImmediate(r));
function harness(){
 const doc={body:new Element('body'),createElement:t=>new Element(t)},calls=[];let owner='actor',config={connected:true,revision:'r1',destination:{id:'-1001234567890',title:'NOTES',type:'channel'},template:{heading:'{project}',intro:'',footer:'{date}',captions:{analysis:'{document}',scripts:'Hello'},order:['analysis','scripts','presale','avito1']}};
 const win={document:doc,AvitoWorkspaceBridge:{context:()=>owner},crypto:require('node:crypto'),FormData,setInterval(){},addEventListener(){},alert(){throw Error('Unexpected alert');},__avitologTelegramRequest:async(action,body)=>{calls.push({action,body});if(action==='config')return config;if(action==='jobs')return {jobs:[]};if(action==='settings'){config={...config,revision:'r2',template:body.template};return config;}if(action==='send')return {state:'sent',message_id:1,destination:config.destination};throw Error('Unexpected action');}};
 const api=G.install(win),nodes=()=>all(doc.body),find=(tag,text)=>{const n=nodes().find(x=>x.tagName===tag&&x.textContent===text);assert.ok(n,'Missing '+text);return n;};
 const options={snapshot:{title:'Test Project'},documents:[{type:'analysis',name:'Analysis.pdf'},{type:'scripts',name:'Scripts.pdf'}],prepare:async()=>[new File(['%PDF-1.4 test'],'Analysis.pdf',{type:'application/pdf'}),new File(['%PDF-1.4 test'],'Scripts.pdf',{type:'application/pdf'})]};
 return {doc,win,api,options,calls,nodes,find,actor:x=>{owner=x;}};
}
test('composer builds, prepares PDF files and submits exactly the previewed message',async()=>{
 const h=harness();await h.api.openComposer(h.options);await tick();assert.equal(h.nodes().filter(x=>x.tagName==='DIALOG').length,1);assert.ok(h.nodes().some(x=>x.textContent.includes('Получатель: NOTES')));const send=h.nodes().find(x=>x.tagName==='BUTTON'&&x.textContent.startsWith('Отправить одним сообщением'));assert.ok(send);assert.equal(send.disabled,false);await send.fire('click');const submit=h.calls.find(x=>x.action==='send');assert.ok(submit);assert.equal(JSON.parse(submit.body.get('manifest')).documents.length,2);assert.equal(h.calls.filter(x=>x.action==='send').length,1);assert.equal(send.disabled,true);
});
test('settings has protected token entry, explicit recipient and preview',async()=>{
 const h=harness();await h.api.openSettings({});await tick();assert.equal(h.nodes().filter(x=>x.type==='password').length,1);assert.ok(h.nodes().some(x=>x.tagName==='H4'&&x.textContent.includes('одно сообщение')));assert.equal(h.calls.some(x=>x.action==='send'),false);
});
test('placeholder expansion uses explicit project, document and date only',()=>{assert.equal(G.expand('{project} | {document} | {date} | {unknown}','P','D','01.02.2026'),'P | D | 01.02.2026 | {unknown}');});
