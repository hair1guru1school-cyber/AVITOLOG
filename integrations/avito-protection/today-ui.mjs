const $=id=>document.getElementById(id),dateNow=()=>new Date(Date.now()+10800000).toISOString().slice(0,10);
const time=value=>value?new Date(value).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}):'нет данных';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const safeUrl=value=>/^https:\/\/(?:[a-z0-9-]+\.)?avito\.ru\//i.test(value||'');
export function createTodayUI({rpc,setting,events}){
 const cache=new Map();let epoch=0,scope='',shown='',loading=false;
 function clear(){epoch++;scope='';shown='';loading=false;cache.clear();$('today-items').replaceChildren();$('today-summary').textContent='Нет данных';$('today-empty').textContent='Войдите для просмотра статистики.';if($('today-detail').open)$('today-detail').close();}
 function render(){
  const id=setting()?.id||'';if(scope!==id){scope=id;epoch++;shown='';if($('today-detail').open)$('today-detail').close();}
  const data=cache.get(id),current=data?.date===dateNow()?data:null;
  if(!current){$('today-items').replaceChildren();$('today-summary').textContent=loading?'Загружаем…':'Сегодня · Москва';$('today-empty').textContent=id?'Ожидаем статистику Авито за сегодня.':'Подключите аккаунт.';return;}
  const summary=current.summary,partial=summary.known_views<summary.checked;
  $('today-summary').textContent=current.items.length+' объявлений · '+summary.views+' просмотров · '+time(summary.last_views_at);
  $('today-empty').textContent=(current.error?'Обновление не подтверждено; показан предыдущий срез. ':current.complete?'':'Загружаем остальные объявления… ')+(partial?'Просмотры получены для '+summary.known_views+' из '+summary.checked+' проверенных карточек. Неизвестные значения не считаются нулём.':!current.items.length?'Объявлений с подтверждёнными просмотрами за сегодня пока нет.':'По последним полученным счётчикам Авито.');
  const signals=new Map();for(const e of events()){if(new Date(Date.parse(e.created_at)+10800000).toISOString().slice(0,10)!==current.date)continue;const old=signals.get(e.item_id);if(!old||e.severity==='quarantine')signals.set(e.item_id,e.severity);}
  const signature=JSON.stringify([current.items,Array.from(signals)]);if(shown===signature)return;shown=signature;
  const fragment=document.createDocumentFragment();for(const item of [...current.items].sort((a,b)=>b.views-a.views||a.item_id.localeCompare(b.item_id))){
   const button=node('button');button.type='button';button.className='today-tile';button.dataset.severity=signals.get(item.item_id)||'normal';button.title=(item.title||'Объявление')+' · ID '+item.item_id+' · '+item.views+' просмотров за сегодня';button.setAttribute('aria-label',button.title);button.append(node('strong',String(item.views)),node('small',item.item_id.slice(-6)));button.addEventListener('click',()=>{
    $('today-item-title').textContent=item.title||'Объявление';$('today-item-data').textContent='ID '+item.item_id+' · просмотры за сегодня: '+item.views+' · контакты: '+(item.contacts??'нет данных')+' · срез просмотров: '+time(item.views_observed_at);const link=$('today-item-link');link.hidden=!safeUrl(item.item_url);if(!link.hidden)link.href=item.item_url;else link.removeAttribute('href');$('today-detail').showModal();
   });fragment.append(button);
  }$('today-items').replaceChildren(fragment);
 }
 async function load(){
  render();const id=scope;if(!id)return;const turn=++epoch,old=cache.get(id);let cursor=null,date='',items=[];loading=true;
  try{
   do{const result=await rpc('avito_guard_today',{p_id:id,p_after:cursor});if(turn!==epoch||setting()?.id!==id)return;
    if(!result||!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||!Array.isArray(result.items)||!result.summary||date&&date!==result.date||result.date!==dateNow())throw Error('invalid_today_response');
    if(result.items.some(item=>!/^\d{1,16}$/.test(item.item_id)||!Number.isSafeInteger(item.views)||item.views<=0)||result.next_cursor&&(!result.items.length||result.next_cursor!==result.items.at(-1).item_id||result.next_cursor===cursor))throw Error('invalid_today_response');
    date=result.date;items.push(...result.items);cursor=result.next_cursor;
    if(!old||!cursor){cache.set(id,{date,summary:result.summary,items:[...items],complete:!cursor});render();}
    if(items.length>100089)throw Error('invalid_today_response');
   }while(cursor);
  }catch(error){if(turn!==epoch)return;if(['auth_required','subject_mismatch','permission_denied'].includes(error.code)){clear();throw error;}if(old?.date===dateNow()){cache.set(id,{...old,error:true});render();}else $('today-empty').textContent='Не удалось обновить статистику за сегодня. Повторим автоматически.';
  }finally{if(turn===epoch)loading=false;}
 }
 $('close-today').addEventListener('click',()=>$('today-detail').close());
 return {load,render,clear};
}
