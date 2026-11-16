import { createAvitoAccountsHandler } from '../_shared/avito-accounts-core.mjs';
import { createAvitoInvitesHandler } from '../_shared/avito-invites-core.mjs';
import { createAvitoFetch } from '../_shared/avito-fetch.mjs';
import { createAvitoProviderReadFetch } from '../_shared/avito-provider-read.mjs';
import { createCloudFeedProcessor } from '../_shared/avito-cloud-feed.mjs';
const handlers=new Map(),registry={register:(module,handler)=>handlers.set(module,handler)};
const avitoFetch=createAvitoProviderReadFetch({fetch:createAvitoFetch({}),relaySecret:Deno.env.get('AVITO_RELAY_SECRET')});
const cloudProcess=createCloudFeedProcessor({rpc:(name,body)=>rpc('avito_guard_cloud_'+name,body),providerFetch:avitoFetch});
createAvitoAccountsHandler({env:Deno.env,fetch:avitoFetch,protectionWorkerRegistry:registry,protectionCloudProcess:cloudProcess});
createAvitoInvitesHandler({env:Deno.env,fetch:avitoFetch,protectionWorkerRegistry:registry,protectionCloudProcess:cloudProcess});
async function rpc(name,body={}){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok){await r.body?.cancel();throw Error('storage_unavailable');}return r.json();
}
Deno.serve(async request=>{
 try{
  if(request.method!=='POST'||Number(request.headers.get('content-length'))>16)return new Response(null,{status:405});
  const ts=request.headers.get('x-bid-time')||'',nonce=request.headers.get('x-bid-nonce')||'',signature=request.headers.get('x-bid-signature')||'';
  if(!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>60||!/^[a-f0-9-]{36}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))return new Response(null,{status:403});
  const reader=request.body?.getReader();let bytes=0;if(reader){try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16){await reader.cancel();return new Response(null,{status:413});}}}finally{reader.releaseLock();}}
  const secret=await rpc('avito_bid_worker_key'),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(ts+'|'+nonce))||await rpc('avito_bid_worker_nonce',{p_nonce:nonce})!==true)return new Response(null,{status:403});
  const claim=await rpc('avito_guard_claim');if(claim){const handler=handlers.get(claim.module);if(!handler)throw Error('invalid_module');await handler(claim);}
  await cloudProcess.cleanup();
  return Response.json({ok:true,processed:claim?1:0},{headers:{'Cache-Control':'no-store'}});
 }catch(_){return Response.json({ok:false,error:'guard_worker_unavailable'},{status:503});}
});
