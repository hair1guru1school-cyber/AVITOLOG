(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProjectGroups=api.install(root);})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var DEFAULTS=[['construction','Строительство','🏗','#54b8ff'],['furniture','Мебель','🪑','#e0b856'],['special','Спецуслуги','🛠','#4acbd2'],['materials','Стройматериалы','🧱','#de9370'],['online','Online услуги','🌐','#56cf9d'],['equipment','Оборудование','⚙','#b58adb'],['auto','Авто / мото','🚙','#7eb8d4'],['avitolog','Авитологи','🅰️','#aebac7'],['fences','Ворота / заборы','📐','#b39cdc'],['houses','Дома','🏡','#6dbd92'],['other','Другое','📦','#96a6bb']];
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function text(v){return String(v==null?'':v);}
  function escape(v){return text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function catalog(data){if(data&&data.projectGroupsV1){var stored=data.projectGroupsV1;if(stored.version!==1||!Array.isArray(stored.groups))throw Error('Версия групп недоступна. Обновите систему.');return copy(stored);}return {version:1,groups:DEFAULTS.map(function(v){return {id:v[0],name:v[1],emoji:v[2],color:v[3],deleted:false};})};}
  function clean(group){
    var name=text(group.name).trim(),emoji=text(group.emoji).trim()||'📦',color=text(group.color);
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(text(group.id))||/^(?:__proto__|constructor|prototype)$/.test(group.id)||!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name+emoji)||Array.from(emoji).length>12||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Укажите название (до 80 символов), эмоджи и цвет группы.');
    return {id:group.id,name:name,emoji:emoji,color:color,deleted:group.deleted===true};
  }
  function suggest(project,groups){
    var crm=project&&project.crmData||{},name=text(project&&(project.title||project.company)||crm.company).toLowerCase().replace(/ё/g,'е');
    var value=(name+' '+text(crm.category)+' '+text(crm.positions)).toLowerCase().replace(/ё/g,'е');
    var rules=[['avitolog',/авитолог|фил.*(?:про|pro|маркет)|fil.*(?:ai|market)/.test(name)],['fences',/забор|ворот|калит|огражд|рабица/.test(value)],['furniture',/мебел|кухн|шкаф|диван|столешниц|кроват/.test(value)],['auto',/авто(?:сервис|моб|запчаст|разбор|салон)|детейл|шиномонтаж|кузов|(?:^|[^а-я])авто(?:$|[^а-я])|мото/.test(value)],['materials',/термопанел|газоблок|кирпич|пиломатер|стройматериал|щебен|металлопрокат|плитк|теплоблок/.test(value)],['houses',/каркас|модуль|ангар|строительств[оа] дом|(?:^|[^а-я])дом(?:$|[^а-я])|дома|бан[яию]/.test(value)],['construction',/ремонт.*квартир|отделк|потол|стяжк|свай|строител|фундамент|бетон|фасад|кровл/.test(value)],['equipment',/оборудован|генератор|станок|насос|компрессор|подшипник/.test(value)],['online',/сайт|дизайн|онлайн|online|таргет|маркетинг|seo|smm/.test(value)],['special',/клининг|перевоз|вывоз|бурени|эвакуатор|кондицион|уборк|очистк|вырубк/.test(value)],['other',true]];
    var found=rules.find(function(rule){return rule[1]&&groups.some(function(g){return g.id===rule[0]&&!g.deleted;});});return found?found[0]:'';
  }
  function autoPlan(data){
    var out=copy(data),c=catalog(data),changed=!data.projectGroupsV1;
    out.projectGroupsV1=c;
    (out.projects||[]).forEach(function(p){
      if(Object.prototype.hasOwnProperty.call(p,'projectGroupId'))return;
      var crm=p.crmData||{};p.projectGroupId=Object.prototype.hasOwnProperty.call(crm,'project_group_id')?text(crm.project_group_id):suggest(p,c.groups);p.projectGroupSource=Object.prototype.hasOwnProperty.call(crm,'project_group_id')?'manual':'auto';changed=true;
    });return {data:out,changed:changed};
  }
  function mutate(data,action,group){
    var out=copy(data),c=catalog(data),index=c.groups.findIndex(function(g){return g.id===group.id;});
    if(action==='add'){if(index!==-1||c.groups.length>=100)throw Error('Такая группа уже существует или достигнут предел 100 групп.');c.groups.push(clean(group));}
    else if(index<0||c.groups[index].deleted)throw Error('Группа уже изменена или удалена. Обновите список.');
    else if(action==='update')c.groups[index]=clean(Object.assign({},c.groups[index],group));
    else if(action==='delete'){
      c.groups[index].deleted=true;
      (out.projects||[]).forEach(function(p){if(p.projectGroupId===group.id){p.projectGroupId='';p.projectGroupSource='manual';}});
    }else throw Error('Неизвестное действие группы.');
    out.projectGroupsV1=c;return out;
  }
  function install(win){
    var doc=win.document,manager=null,autoTimer=null;
    function data(){return typeof win.loadProjectsData==='function'?win.loadProjectsData():{projects:[]};}
    function ready(){return !win.AVITOLOG_BACKEND_MODE||win.AVITOLOG_BACKEND_INITIAL_SYNC_READY===true;}
    function readonly(){return typeof win.__avitologBackendReadOnly==='function'&&win.__avitologBackendReadOnly();}
    function scope(){var identity=typeof win.__avitologBackendIdentity==='function'&&win.__avitologBackendIdentity();return (identity&&identity.id||'')+'|'+(win.AVITOLOG_KEY_SUFFIX||'');}
    function list(){return catalog(data()).groups.filter(function(g){return !g.deleted;});}
    function has(id){return !id||list().some(function(g){return g.id===id;});}
    function selected(project,client){
      var id;if(project&&Object.prototype.hasOwnProperty.call(project,'projectGroupId'))id=project.projectGroupId;
      else if(client&&Object.prototype.hasOwnProperty.call(client,'project_group_id'))id=client.project_group_id;
      else return suggest(project||client,list());
      return has(text(id))?text(id):'';
    }
    function options(id){return '<option value="">Без группы</option>'+list().map(function(g){return '<option value="'+escape(g.id)+'"'+(g.id===id?' selected':'')+'>'+escape(g.emoji+' '+g.name)+'</option>';}).join('');}
    function fieldHtml(id){return '<label class="project-card-field project-card-field-wide">Группа проекта<span style="display:flex;gap:6px"><select name="project_group_id" data-project-group-select>'+options(id)+'</select><button type="button" class="project-card-tool" data-project-groups-manage title="Добавить, изменить или удалить группы" aria-label="Управление группами проектов">⚙</button></span></label>';}
    function commit(next){
      if(!ready()||readonly())throw Error('В этом режиме группы доступны только для просмотра.');
      if(typeof win.saveProjectsData!=='function'||win.saveProjectsData(next)===false)throw Error('Не удалось сохранить группы.');
      doc.dispatchEvent(new win.CustomEvent('avitolog:project-groups-changed'));
    }
    function ensureAuto(){if(!ready()||readonly())return;var plan=autoPlan(data());if(plan.changed)commit(plan.data);}
    function scheduleAuto(){clearTimeout(autoTimer);autoTimer=setTimeout(function(){try{ensureAuto();}catch(e){/* The existing save status retains any unsaved draft. */}},100);}
    function close(){if(manager){var focus=manager.focus;manager.node.remove();manager=null;if(focus&&focus.isConnected)focus.focus();}}
    function openManager(onChange){
      if(!ready()||readonly())return;close();var owner=scope(),node=doc.createElement('div');node.className='project-groups-overlay';node.style.cssText='position:fixed;inset:0;z-index:18500;display:grid;place-items:center;background:#0008;padding:16px';
      node.innerHTML='<section role="dialog" aria-modal="true" aria-label="Группы проектов" style="box-sizing:border-box;width:min(780px,96vw);max-height:90dvh;overflow:auto;padding:18px;border:1px solid var(--border,#345);border-radius:14px;background:var(--surface,#142132);color:var(--text,#fff)"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Группы проектов</h3><button type="button" data-close aria-label="Закрыть группы">×</button></div><p style="font-size:12px;color:var(--muted,#abc)">Группы общие для карт в текущем режиме. Удаление группы оставляет проекты без группы; сами проекты и оплаты сохраняются.</p><div data-group-list></div><form data-group-add style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px"><input name="emoji" aria-label="Эмоджи новой группы" value="📦" maxlength="24" style="width:54px"><input name="name" aria-label="Название новой группы" placeholder="Новая группа" maxlength="80" required style="flex:1;min-width:130px"><input name="color" aria-label="Цвет новой группы" type="color" value="#54b8ff"><button type="submit">Добавить</button></form><p data-status role="status" style="font-size:12px"></p></section>';
      manager={node:node,scope:owner,focus:doc.activeElement};doc.body.appendChild(node);
      var style=doc.createElement('style');style.textContent='.project-groups-overlay input,.project-groups-overlay button{box-sizing:border-box;min-height:34px;padding:6px 9px;border:1px solid var(--border,#345);border-radius:6px;background:var(--surface2,#1b2b3e);color:var(--text,#fff);font:inherit}.project-groups-overlay input[type=color]{width:42px;padding:3px}.project-groups-overlay button{cursor:pointer}.project-groups-overlay h3{margin:0 0 8px}';node.appendChild(style);
      function perform(action,item){try{if(scope()!==owner)throw Error('Режим изменился. Откройте группы заново.');commit(mutate(data(),action,item));render();if(onChange)onChange();node.querySelector('[data-status]').textContent='Изменения отправлены на сохранение.';return true;}catch(e){node.querySelector('[data-status]').textContent=e.message;return false;}}
      function render(){var host=node.querySelector('[data-group-list]');host.replaceChildren();list().forEach(function(g){
        var row=doc.createElement('form');row.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;border-bottom:1px solid var(--border,#345)';
        row.innerHTML='<input name="emoji" aria-label="Эмоджи группы '+escape(g.name)+'" value="'+escape(g.emoji)+'" maxlength="24" style="width:54px"><input name="name" aria-label="Название группы '+escape(g.name)+'" value="'+escape(g.name)+'" maxlength="80" required style="flex:1;min-width:130px"><input name="color" aria-label="Цвет группы '+escape(g.name)+'" type="color" value="'+escape(g.color)+'"><button type="submit">Сохранить</button><button type="button" data-delete>Удалить</button>';
        row.onsubmit=function(e){e.preventDefault();perform('update',{id:g.id,name:row.elements.name.value,emoji:row.elements.emoji.value,color:row.elements.color.value});};
        row.querySelector('[data-delete]').onclick=function(e){var b=e.currentTarget;if(b.dataset.confirm!=='yes'){b.dataset.confirm='yes';b.textContent='Подтвердить удаление';return;}perform('delete',{id:g.id});};host.appendChild(row);
      });}
      node.querySelector('[data-close]').onclick=close;node.querySelector('[data-group-add]').onsubmit=function(e){e.preventDefault();var f=e.currentTarget;if(perform('add',{id:'custom_'+win.crypto.randomUUID(),name:f.elements.name.value,emoji:f.elements.emoji.value,color:f.elements.color.value}))f.elements.name.value='';};
      node.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){var els=Array.from(node.querySelectorAll('button,input')).filter(function(el){return !el.disabled;});if(e.shiftKey&&doc.activeElement===els[0]){e.preventDefault();els[els.length-1].focus();}else if(!e.shiftKey&&doc.activeElement===els[els.length-1]){e.preventDefault();els[0].focus();}}});render();node.querySelector('[data-close]').focus();
    }
    if(doc){['avitolog:backend-initial-ready','avitolog:backend-remote-applied'].forEach(function(event){doc.addEventListener(event,scheduleAuto);});doc.addEventListener('avitolog:workspace-reset',function(){if(manager&&manager.scope!==scope())close();scheduleAuto();});if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',scheduleAuto);else scheduleAuto();}
    return {list:list,has:has,selected:selected,options:options,fieldHtml:fieldHtml,openManager:openManager,ensureAuto:ensureAuto,close:close};
  }
  return {catalog:catalog,suggest:suggest,autoPlan:autoPlan,mutate:mutate,clean:clean,install:install};
});
