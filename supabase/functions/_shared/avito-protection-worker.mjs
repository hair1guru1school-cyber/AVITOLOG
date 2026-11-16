import { normalizeRules } from '../../../js/avito-protection-model.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const id=value=>{const s=String(value);if(!/^[1-9][0-9]{0,15}$/.test(s))throw fail('invalid_item');return s;};
export function registerProtectionWorker(registry,module,{service,getRow,activeToken,requestJson,cloudProcess,now=Date.now}) {
 if(!registry)return;
 const rpc=(name,p)=>service('rpc/avito_guard_'+name,'POST',p);
 registry.register(module,async claim=>{
  const lease={p_id:claim.id,p_lease:claim.lease};
  try{
   let c=await rpc('validate',lease);normalizeRules(c.rules);
   const row=await getRow(c.organization_id,c.account_id);
   if(!row||row.status!=='connected'||String(row.credential_version)!==c.credential_version)throw fail('account_changed');
   if(module==='oauth'&&(!row.scopes?.includes('items:info')||!row.scopes?.includes('stats:read')))throw fail('statistics_scope_required');
   const previous=String(row.credential_version),token=await activeToken(row,c.organization_id,{user:{id:c.actor_id}});
   if(String(row.credential_version)!==previous&&await rpc('rotate',{...lease,p_old:previous,p_next:String(row.credential_version)})!==true)throw fail('account_changed');
   c=await rpc('validate',lease);
   const page=await requestJson('https://api.avito.ru/core/v1/items?page='+c.page+'&per_page=99&status=active',{headers:{Authorization:'Bearer '+token}},'guard_items_unavailable',262144);
   if(!Array.isArray(page?.resources)||page.resources.length>99||page.meta?.page!==c.page||page.meta?.per_page!==99||page.resources.some(item=>item?.status!=='active'))throw fail('invalid_items_response');
   const ids=page.resources.map(item=>id(item.id));if(new Set(ids).size!==ids.length||c.page===1011&&ids.length===99)throw fail('inventory_limit');
   const date=new Date(now()+10800000).toISOString().slice(0,10),values=new Map();
   if(ids.length){
    const data=await requestJson('https://api.avito.ru/stats/v1/accounts/'+id(row.avito_user_id)+'/items',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({itemIds:ids.map(Number),dateFrom:date,dateTo:date,fields:['uniqContacts','uniqViews','uniqFavorites'],periodGrouping:'day'})},'guard_statistics_unavailable',524288);
    if(!Array.isArray(data?.result?.items)||data.result.items.length>ids.length)throw fail('invalid_statistics_response');
    for(const item of data.result.items){const key=id(item.itemId);if(!ids.includes(key)||values.has(key)||!Array.isArray(item.stats))throw fail('invalid_statistics_response');const days=item.stats.filter(d=>d.date===date);if(days.length>1)throw fail('invalid_statistics_response');const d=days[0],counter=v=>Number.isSafeInteger(v)&&v>=0?v:null;values.set(key,{views:counter(d?.uniqViews),contacts:counter(d?.uniqContacts)});}
   }
   const pricing=new Map(),viewed=ids.filter(key=>values.get(key)?.views>0);
   if(viewed.length&&(module!=='oauth'||row.scopes?.includes('cpxpromo:read'))){
    try{
     const data=await requestJson('https://api.avito.ru/cpxpromo/1/getPromotionsByItemIds',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({itemIDs:viewed.map(Number)})},'guard_pricing_unavailable',262144);
     if(!Array.isArray(data?.items)||data.items.length>viewed.length)throw fail('invalid_pricing_response');
     for(const p of data.items){const key=id(p.itemID),manual=p.manualPromotion,auto=p.autoPromotion;if(!viewed.includes(key)||pricing.has(key)||!Number.isSafeInteger(p.actionTypeID)||p.actionTypeID<=0||manual!=null&&auto!=null)throw fail('invalid_pricing_response');
      const amount=manual?.bidPenny;if(manual!=null&&(!Number.isSafeInteger(amount)||amount<0||amount>100000000000))throw fail('invalid_pricing_response');
      pricing.set(key,{mode:manual!=null?'manual':auto!=null?'auto':'base',action_type_id:p.actionTypeID,bid_penny:manual!=null?amount:null});
     }
    }catch(_){pricing.clear();}
   }
   await rpc('validate',lease);
   const rows=page.resources.map(item=>({id:id(item.id),title:String(item.title||'').slice(0,300),url:typeof item.url==='string'?item.url:null,date,...(values.get(id(item.id))||{views:null,contacts:null}),...(pricing.has(id(item.id))?{pricing:pricing.get(id(item.id))}:{})}));
   if(await rpc('record',{...lease,p_revision:c.revision,p_rows:rows,p_more:ids.length===99,p_error:rows.some(r=>r.views===null||r.contacts===null)?'statistics_partial':null})!==true)throw fail('guard_store_failed');
   if(cloudProcess)await cloudProcess.observe({context:{...c,id:claim.id},token,userId:row.avito_user_id,requestJson});
  }catch(error){
   console.warn('avito_guard_failure',JSON.stringify({code:/^[a-z_]{1,80}$/.test(error.code||'')?error.code:'guard_worker_failed',http_status:Number.isInteger(error.providerStatus)?error.providerStatus:null}));
   await rpc('failed',{...lease,p_error:/^[a-z_]{1,80}$/.test(error.code||'')?error.code:'guard_worker_failed'});
  }
 });
}
