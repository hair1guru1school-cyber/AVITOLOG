import { cloudLocation, cloudHash, createCloudStorage, cloudBytes } from './avito-cloud-storage.mjs';
import { prepareFeed } from './avito-feed-xlsx.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const safeError=e=>/^[a-z_]{1,80}$/.test(e?.code||'')?e.code:'cloud_processing_failed';
export function createCloudFeedProcessor({rpc,fetch:fetcher=fetch,now=Date.now}){
 const storage=createCloudStorage({fetch:fetcher,now});
 async function run(claim,provider){
  if(!claim)return;const {config:c,keys,rules}=claim,lease={p_id:c.settings_id,p_lease:c.lease,p_revision:c.revision};
  const valid=()=>rpc('validate',lease),finish=(error=null,meta={})=>rpc('finish',{...lease,p_error:error,p_meta:meta});
  let location;const prefix='_avb_versions/'+c.organization_id+'/'+c.settings_id+'/';
  async function cleanup(){if(!keys)return;for(const version of claim.expired||[]){if(!version.object_key.startsWith(prefix)||version.object_key===location.key||!/^[-a-f0-9]+\.xlsx$/.test(version.object_key.slice(prefix.length)))throw fail('invalid_backup_key');await valid();const r=await storage('DELETE',location,keys,{key:version.object_key,allowMissing:true});await r?.body?.cancel();await rpc('deleted',{...lease,p_version:version.id});}}
  try{
   location=cloudLocation(c.source_url);
   if(!provider){await cleanup();await finish();return;}
   let feeds=[],enabled=null;
   try{
    const profile=await provider.requestJson('https://api.avito.ru/autoload/v2/profile',{headers:{Authorization:'Bearer '+provider.token}},'autoload_profile_unavailable',65536,15000);
    if(typeof profile?.autoload_enabled!=='boolean'||profile.feeds_data!==null&&!Array.isArray(profile.feeds_data)||profile.feeds_data?.length>30)throw fail('invalid_autoload_profile');
    feeds=(profile.feeds_data||[]).map(f=>{if(typeof f.feed_url!=='string'||typeof f.feed_name!=='string'||f.feed_url.length>2048||f.feed_name.length>300)throw fail('invalid_autoload_profile');return {feed_url:f.feed_url,feed_name:f.feed_name};});enabled=profile.autoload_enabled;
    await rpc('profile',{...lease,p_enabled:enabled,p_feeds:feeds,p_error:null});
   }catch(error){await rpc('profile',{...lease,p_enabled:null,p_feeds:[],p_error:safeError(error)});await cleanup();await finish(safeError(error));return;}
   if(!claim.pending&&!(claim.events||[]).length&&Date.parse(c.file_checked_at)>now()-300000){await cleanup();await finish();return;}
   const current=await storage('GET',location,keys),etag=current.headers.get('etag'),nativeVersion=current.headers.get('x-amz-version-id');
   const bytes=await cloudBytes(current),prepared=prepareFeed(bytes),inventory=prepared.inventory,sha=await cloudHash(bytes),meta={file_items:inventory.items,file_sheets:inventory.sheets,file_etag:etag};
   if(!feeds.some(f=>f.feed_url===c.source_url)){await cleanup();await finish('autoload_url_mismatch',meta);return;}
   if(!keys||!c.auto_edit||!claim.enabled){await cleanup();await finish(null,meta);return;}
   if(nativeVersion&&nativeVersion!=='null')throw fail('cloud_native_versioning_requires_setup');
   let batch=claim.pending,updated;
   if(batch){
    if(sha===batch.new_sha){await rpc('batch',{...lease,p_batch:batch.id,p_state:'applied'});await cleanup();await finish(null,meta);return;}
    if(sha!==batch.base_sha){await rpc('batch',{...lease,p_batch:batch.id,p_state:'conflict'});await finish('cloud_conflict',meta);return;}
    updated=prepared.patch(batch.changes);if(await cloudHash(updated)!==batch.new_sha)throw fail('feed_recovery_mismatch');
   }else{
    const changes=[];
    for(const event of claim.events||[]){
     const rows=inventory.records.filter(i=>i.item_id===event.item_id);if(rows.length!==1)continue;
     const title=(rules.titles||[]).find(t=>t!==rows[0].title);if(!title)continue;
     const item=await provider.requestJson('https://api.avito.ru/core/v1/accounts/'+provider.userId+'/items/'+event.item_id+'/',{headers:{Authorization:'Bearer '+provider.token}},'feed_item_ownership_unavailable',65536,10000);
     if(String(item?.id)!==event.item_id)throw fail('feed_item_ownership_unavailable');
     changes.push({event_id:event.id,item_id:event.item_id,feed_id:rows[0].feed_id,sheet:rows[0].sheet,old_title:rows[0].title,new_title:title});
    }
    if(!changes.length){await cleanup();await finish((claim.events||[]).length?'feed_titles_or_mapping_required':null,meta);return;}
    if(!etag||!/^"[^"\r\n]{1,128}"$/.test(etag))throw fail('cloud_etag_required');
    updated=prepared.patch(changes);batch=await rpc('plan',{...lease,p_etag:etag,p_before:sha,p_after:await cloudHash(updated),p_bytes:bytes.length,p_changes:changes});
   }
   const backupKey=prefix+batch.backup_id+'.xlsx';
   let backup=await storage('GET',location,keys,{key:backupKey,allowMissing:true});
   if(backup){if(await cloudHash(await cloudBytes(backup))!==batch.base_sha)throw fail('backup_verification_failed');}
   else{await valid();const written=await storage('PUT',location,keys,{key:backupKey,body:bytes,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','If-None-Match':'*'}});await written.body?.cancel();backup=await storage('GET',location,keys,{key:backupKey});if(await cloudHash(await cloudBytes(backup))!==batch.base_sha)throw fail('backup_verification_failed');}
   await valid();await rpc('batch',{...lease,p_batch:batch.id,p_state:'publishing'});await valid();
   const published=await storage('PUT',location,keys,{body:updated,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','If-Match':etag}});await published.body?.cancel();
   const verified=await storage('GET',location,keys);if(await cloudHash(await cloudBytes(verified))!==batch.new_sha)throw fail('cloud_write_unconfirmed');
   await rpc('batch',{...lease,p_batch:batch.id,p_state:'applied'});await cleanup();await finish(null,meta);
  }catch(error){try{await finish(safeError(error));}catch(_){} }
 }
 return {
  async observe(provider){let claim;try{claim=await rpc('claim',{p_id:provider.context.id});}catch(_){return;}await run(claim,provider);},
  async cleanup(){let claim;try{claim=await rpc('claim',{p_id:null});}catch(_){return;}await run(claim,null);}
 };
}
