import { createAdsHistoryHandler } from './core.mjs';
import { createAvitoFetch } from '../_shared/avito-fetch.mjs';
import { createAvitoProviderReadFetch } from '../_shared/avito-provider-read.mjs';
const direct = createAvitoFetch({});
const provider = createAvitoProviderReadFetch({ fetch:direct, relaySecret:Deno.env.get('AVITO_RELAY_SECRET') });
Deno.serve(createAdsHistoryHandler({env:Deno.env,fetch:provider,diagnostic:record=>console.warn('ads_history_read',JSON.stringify(record))}));
