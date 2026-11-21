(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.install(root);})(typeof window==='object'?window:this,function(){
  'use strict';
  var KEY='avb_device_interface_scale_v1';
  function normalize(value){var number=Number(value);return Number.isFinite(number)&&number>0?Math.max(75,Math.min(125,Math.round(number/5)*5)):100;}
  function read(storage){try{return normalize(storage.getItem(KEY));}catch(_){return 100;}}
  function write(storage,value){try{storage.setItem(KEY,String(normalize(value)));return true;}catch(_){return false;}}
  function install(win){
    if(win.AVBInterfaceScale)return win.AVBInterfaceScale;
    var doc=win.document,value=100,media=win.matchMedia('(min-width:981px)'),box=null,input=null,output=null,status=null;
    try{value=read(win.localStorage);}catch(_){}
    function apply(){
      var enabled=media.matches&&value!==100;
      doc.body.style.setProperty('--interface-scale',String(value/100));doc.body.classList.toggle('interface-scaled',enabled);
      var header=doc.querySelector('#mainApp>header');if(header)doc.body.style.setProperty('--interface-header-height',(header.offsetHeight+3)+'px');
      if(box)box.hidden=!media.matches;if(input)input.value=String(value);if(output)output.textContent=value+'%';
    }
    function set(next,persist){value=normalize(next);apply();if(persist){var saved=false;try{saved=write(win.localStorage,value);}catch(_){}if(status)status.textContent=saved?'Сохранено только на этом компьютере.':'Не удалось сохранить в браузере. Масштаб действует до перезагрузки.';}}
    function node(tag,cls,text){var el=doc.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;}
    function mount(){
      if(box)return true;var menu=doc.getElementById('mainMenuSettingsMenu');if(!menu)return false;
      box=node('div','main-menu-tab-scale main-menu-interface-scale');box.id='interfaceScaleSettings';
      var head=node('div','main-menu-tab-scale-head'),label=node('label','','Масштаб интерфейса · ПК');label.htmlFor='interfaceScaleInput';output=node('output');output.htmlFor='interfaceScaleInput';head.append(label,output);
      input=node('input');input.id='interfaceScaleInput';input.type='range';input.min='75';input.max='125';input.step='5';input.setAttribute('aria-label','Масштаб интерфейса на этом компьютере');input.addEventListener('input',function(){set(input.value,false);});input.addEventListener('change',function(){set(input.value,true);});
      var reset=node('button','main-menu-tab-scale-reset','Сбросить до 100%');reset.type='button';reset.addEventListener('click',function(){set(100,true);});status=node('p','main-menu-settings-note','Личный масштаб этого браузера. Размеры у других пользователей не меняются.');status.setAttribute('role','status');box.append(head,input,reset,status);
      var tabs=menu.querySelector('.main-menu-tab-scale');if(tabs)tabs.after(box);else menu.append(box);apply();return true;
    }
    function start(){
      var style=node('style');style.id='interfaceScaleStyles';style.textContent='#interfaceScaleSettings input{width:100%;accent-color:var(--accent,#00d97e)}#interfaceScaleSettings[hidden]{display:none}@media(min-width:981px){body.interface-scaled #mainApp{zoom:var(--interface-scale);width:auto;height:calc(100dvh / var(--interface-scale))!important;min-height:0!important}body.interface-scaled #mainApp>.layout{height:calc(100dvh / var(--interface-scale) - var(--interface-header-height,55px))!important;min-height:0!important}}';doc.head.append(style);apply();
      if(!mount()){var observer=new win.MutationObserver(function(){if(mount())observer.disconnect();});observer.observe(doc.body,{childList:true,subtree:true});}
      if(media.addEventListener)media.addEventListener('change',apply);win.addEventListener('resize',apply);
    }
    var api=Object.freeze({get:function(){return value;},set:function(next){set(next,true);}});win.AVBInterfaceScale=api;
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();return api;
  }
  return {key:KEY,normalize:normalize,read:read,write:write,install:install};
});
