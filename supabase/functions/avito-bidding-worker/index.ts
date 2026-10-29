import { createAvitoAccountsHandler } from '../_shared/avito-accounts-core.mjs';
import { createAvitoInvitesHandler } from '../_shared/avito-invites-core.mjs';
import { createAvitoFetch } from '../_shared/avito-fetch.mjs';
import { createAvitoProviderReadFetch } from '../_shared/avito-provider-read.mjs';

const handlers = new Map();
const registry = { register: (module, handler) => handlers.set(module, handler) };
const avitoFetch = createAvitoProviderReadFetch({ fetch: createAvitoFetch({}), relaySecret: Deno.env.get('AVITO_RELAY_SECRET') });
createAvitoAccountsHandler({ env: Deno.env, fetch: avitoFetch, biddingWorkerRegistry: registry });
createAvitoInvitesHandler({ env: Deno.env, fetch: avitoFetch, biddingWorkerRegistry: registry });
async function rpc(name, payload = {}) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/avito_bid_' + name, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  if (!response.ok) { await response.body?.cancel(); throw Error('queue_storage'); }
  return response.json();
}
Deno.serve(async request => {
  try {
    if (request.method !== 'POST' || Number(request.headers.get('content-length')) > 16) return new Response(null, { status: 405 });
    const ts = request.headers.get('x-bid-time') || '', nonce = request.headers.get('x-bid-nonce') || '', hex = request.headers.get('x-bid-signature') || '';
    if (!/^\d{10}$/.test(ts) || Math.abs(Date.now()/1000 - Number(ts)) > 60 || !/^[a-f0-9-]{36}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(hex)) return new Response(null, { status: 403 });
    const reader=request.body?.getReader();let size=0;
    if(reader){try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16){await reader.cancel();return new Response(null,{status:413});}}}finally{reader.releaseLock();}}
    const secret = await rpc('worker_key');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(ts + '|' + nonce)) || await rpc('worker_nonce', { p_nonce: nonce }) !== true) return new Response(null, { status: 403 });
    const started = Date.now(); let processed = 0;
    while (processed < 3 && Date.now() - started < 40000) {
      const claim = await rpc('claim'); if (!claim) break;
      const handler = handlers.get(claim.module); if (!handler) throw Error('queue_module');
      await handler(claim); processed++;
      if (processed < 3) await new Promise(resolve => setTimeout(resolve, 7000));
    }
    return Response.json({ ok: true, processed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (_) { return Response.json({ ok: false, error: 'queue_worker_unavailable' }, { status: 503 }); }
});
