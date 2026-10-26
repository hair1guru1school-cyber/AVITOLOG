(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(!root.AVITOLOG_EDIT_HISTORY)root.AVITOLOG_EDIT_HISTORY=api.install(root);
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var ALLOWED=/^(avitolog_(projects|clients)(_sasha)?|crm_tasks_v1(_sasha)?|avitolog_goals_v1(_sasha)?(_month_\d{4}-\d{2})?)$/;
  var IGNORED=/^(updatedAt|updated_at|lastModified|zoneIntentV1|taskLog|paymentJournalV1|intakeContextV1|recoveredProjectSnapshotsV1|projectsViewV1)$/;
  var FINANCE=/paid|payment|financial|saleAmount|soldFor|toAgent|aoaPercent|invoice|oplacheno/i;
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
  function pack(o,k){return own(o,k)?{exists:true,value:copy(o[k])}:{exists:false};}
  function idField(a){return ['id','client_id','task_id','uuid'].find(function(k){var seen=Object.create(null);return a.length&&a.every(function(v){var id=object(v)&&v[k];if(id===undefined||id===null||String(id)===''||seen[String(id)])return false;seen[String(id)]=true;return true;});});}
  function unsafe(v){
    if(!v||typeof v!=='object')return false;
    if(/^(sold|paid|payment|оплачено)$/i.test(String(v.stage||v.status||v.type||'')))return true;
    return Object.keys(v).some(function(k){var journal=/^(paymentJournalV1|intakeContextV1)$/.test(k);return /^(?:__proto__|constructor|prototype)$/.test(k)||journal&&!!v[k]&&(!Array.isArray(v[k].entries)||v[k].entries.length>0)||!journal&&FINANCE.test(k)&&!!v[k]||unsafe(v[k]);});
  }
  function diff(before,after){
    // Stable IDs keep each patch local to the edited record, not the whole snapshot.
    var ops=[],blocked=false,visited=0;
    function walk(a,b,path){
      if(++visited>30000)throw new Error('history_too_large');
      if(same(a,b))return;
      if(Array.isArray(a)&&Array.isArray(b)){
        var field=idField(a.length?a:b);
        if(field&&(!a.length||idField(a)===field)&&(!b.length||idField(b)===field)){
          var am=Object.create(null),bm=Object.create(null);a.forEach(function(v){am[String(v[field])]=v;});b.forEach(function(v){bm[String(v[field])]=v;});
          Object.keys(am).concat(Object.keys(bm).filter(function(id){return !own(am,id);})).forEach(function(id){
            var next=path.concat({field:field,id:id});
            if(!own(am,id)||!own(bm,id)){
              var value=am[id]||bm[id];if(unsafe(value)){blocked=true;return;}
              ops.push({path:next,before:pack(am,id),after:pack(bm,id),beforeIndex:a.indexOf(am[id]),afterIndex:b.indexOf(bm[id])});
            }else walk(am[id],bm[id],next);
          });
          var ai=a.map(function(v){return String(v[field]);}),bi=b.map(function(v){return String(v[field]);});
          if(ai.length===bi.length&&ai.every(function(id){return own(bm,id);})&&!same(ai,bi))ops.push({path:path,order:field,before:{exists:true,value:ai},after:{exists:true,value:bi}});
          return;
        }
      }
      if(object(a)&&object(b)){
        Object.keys(a).concat(Object.keys(b).filter(function(k){return !own(a,k);})).forEach(function(k){
          if(/^(?:__proto__|constructor|prototype)$/.test(k))throw new Error('unsafe_history_path');
          if(IGNORED.test(k)||same(a[k],b[k]))return;
          if(FINANCE.test(k)||/^(stage|status)$/.test(k)&&/^(sold|paid|оплачено)$/i.test(String(a[k]))||/^(stage|status)$/.test(k)&&/^(sold|paid|оплачено)$/i.test(String(b[k]))||k==='mainPrice'&&(a.stage==='sold'||b.stage==='sold')){blocked=true;return;}
          if(!own(a,k)||!own(b,k)){
            if(unsafe(a[k])||unsafe(b[k])){blocked=true;return;}
            ops.push({path:path.concat(k),before:pack(a,k),after:pack(b,k)});
          }else walk(a[k],b[k],path.concat(k));
        });return;
      }
      if(unsafe(a)||unsafe(b)){blocked=true;return;}
      ops.push({path:path,before:{exists:true,value:copy(a)},after:{exists:true,value:copy(b)}});
    }
    walk(before,after,[]);return {ops:ops,blocked:blocked};
  }
  function locate(root,path){
    var value=root,parent=null,key=null;
    path.forEach(function(part,index){
      parent=value;key=part;
      if(object(part)){
        if(!Array.isArray(parent))throw new Error('history_conflict');
        var matches=[];parent.forEach(function(v,i){if(v&&String(v[part.field])===part.id)matches.push(i);});
        if(matches.length>1)throw new Error('history_conflict');key=matches.length?matches[0]:-1;
        value=key<0?undefined:parent[key];
      }else{
        if(!parent||typeof parent!=='object'||/^(?:__proto__|constructor|prototype)$/.test(part))throw new Error('history_conflict');
        value=own(parent,key)?parent[key]:undefined;
      }
      if(index<path.length-1&&value===undefined)throw new Error('history_conflict');
    });
    return {parent:parent,key:key,value:value,exists:path.length===0||key!==-1&&own(parent,key)};
  }
  function apply(current,ops,direction){
    // Check every expectation before changing any part of the fresh server state.
    var expected=direction==='redo'?'before':'after',desired=direction==='redo'?'after':'before',out=copy(current);
    ops.forEach(function(op){
      var at=locate(out,op.path),value=op.order?at.value.map(function(v){return String(v[op.order]);}):at.value;
      if(at.exists!==op[expected].exists||at.exists&&!same(value,op[expected].value))throw new Error('history_conflict');
    });
    ops.forEach(function(op){
      var at=locate(out,op.path),target=op[desired];
      if(op.order){var byId=Object.create(null);at.value.forEach(function(v){byId[String(v[op.order])]=v;});var ordered=target.value.map(function(id){return byId[id];});if(op.path.length)at.parent[at.key]=ordered;else out=ordered;}
      else if(!op.path.length)out=copy(target.value);
      else if(object(op.path[op.path.length-1])){
        if(!target.exists){if(at.key>=0)at.parent.splice(at.key,1);}
        else if(at.key>=0)at.parent[at.key]=copy(target.value);
        else at.parent.splice(Math.max(0,op[desired+'Index']||0),0,copy(target.value));
      }else if(target.exists)at.parent[at.key]=copy(target.value);else delete at.parent[at.key];
    });return out;
  }
  function install(win){
    var doc=win.document,undo=[],redo=[],group=null,timer=null,applying=false,currentScope='',tail=Promise.resolve(),generation=0;
    function scope(){var id=typeof win.__avitologBackendIdentity==='function'&&win.__avitologBackendIdentity();return id&&id.id?id.id+'|'+(win.AVITOLOG_KEY_SUFFIX||''):'';}
    function reset(){undo=[];redo=[];group=null;clearTimeout(timer);currentScope=scope();generation++;}
    function sync(){if(currentScope!==scope())reset();return !!currentScope&&!win.__avitologBackendReadOnly?.();}
    function notice(message){var node=doc.getElementById('editHistoryNotice');if(!node){node=doc.createElement('div');node.id='editHistoryNotice';node.setAttribute('role','status');node.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;max-width:90vw;padding:10px 16px;border:1px solid var(--border,#355);border-radius:10px;background:var(--surface,#142132);color:var(--text,#fff);font:13px sans-serif;pointer-events:none';doc.body.appendChild(node);}node.textContent=message;clearTimeout(node.hideTimer);node.hidden=false;node.hideTimer=setTimeout(function(){node.hidden=true;},3500);}
    function flush(){clearTimeout(timer);if(!group)return;var edits=[];
      try{Object.keys(group.values).forEach(function(key){var v=group.values[key],change=diff(JSON.parse(v.before),JSON.parse(v.after));if(change.blocked)throw new Error('excluded');if(change.ops.length)edits.push({key:key,ops:change.ops});});}catch(e){edits=[];}
      if(edits.length){undo.push({scope:currentScope,edits:edits});redo=[];while(undo.length>30||JSON.stringify(undo).length>3000000)undo.shift();}group=null;
    }
    function arm(event){if(!event.isTrusted||applying||!sync())return;
      if(/^(input|change|click)$/.test(event.type)&&group&&group.target===event.target){group.at=Date.now();return;}
      if(event.type==='drop'&&group){group.at=Date.now();return;}
      flush();group={target:event.target,at:Date.now(),values:Object.create(null)};
    }
    function record(key,before,after){
      if(applying||!sync()||!group||Date.now()-group.at>5000||!ALLOWED.test(key)||!before||before===after)return;
      if(before.length+after.length>6000000){group=null;return;}
      var entry=group.values[key];if(entry)entry.after=after;else group.values[key]={before:before,after:after};
      clearTimeout(timer);timer=setTimeout(flush,650);
    }
    async function performMove(direction){
      if(applying||!sync())return false;flush();var stack=direction==='redo'?redo:undo,other=direction==='redo'?undo:redo,item=stack[stack.length-1];
      if(!item){notice(direction==='redo'?'Нет действий для повтора':'Нет действий для отмены');return false;}
      var expectedScope=currentScope;applying=true;
      try{
        if(typeof win.__avitologApplyEditHistory!=='function')throw new Error('history_unavailable');
        await win.__avitologApplyEditHistory(item.edits,direction);
        if(scope()!==expectedScope){reset();return false;}
        stack.pop();other.push(item);notice((direction==='redo'?'Повторено':'Отменено')+' · назад: '+undo.length+' · вперёд: '+redo.length);return true;
      }catch(e){notice(/conflict|changed/i.test(e.message)?'Эти данные уже изменились. Отмена не применена.':/pending/i.test(e.message)?'Дождитесь сохранения и повторите.':'Сервер не подтвердил отмену. Проверьте данные и повторите.');return false;}
      finally{applying=false;}
    }
    function move(direction){var expected=scope(),version=generation;var task=tail.then(function(){return scope()===expected&&generation===version?performMove(direction):false;});tail=task.catch(function(){return false;});return task;}
    ['pointerdown','click','input','change','drop'].forEach(function(name){doc.addEventListener(name,arm,true);});
    doc.addEventListener('keydown',function(event){
      var modifier=event.ctrlKey||event.metaKey,key=event.code||String(event.key).toLowerCase(),isUndo=key==='KeyZ'||key==='z'||key==='я',isRedo=key==='KeyY'||key==='y'||key==='н'||isUndo&&event.shiftKey;
      if(!modifier||event.altKey||(!isUndo&&!isRedo))return;
      var target=event.target,field=target&&target.closest&&target.closest('input');
      if(target&&target.closest&&(target.closest('textarea,[contenteditable]:not([contenteditable="false"])')||field&&!/^(checkbox|radio|button|submit|reset|range|file)$/i.test(field.type||'text')))return;
      event.preventDefault();event.stopPropagation();if(!event.repeat)move(isRedo?'redo':'undo');
    },true);
    doc.addEventListener('avitolog:workspace-reset',reset);reset();
    return {record:record,undo:function(){return move('undo');},redo:function(){return move('redo');},reset:reset,apply:apply,allowed:function(key){return ALLOWED.test(key);}};
  }
  return {diff:diff,apply:apply,install:install};
});
