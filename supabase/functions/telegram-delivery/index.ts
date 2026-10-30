import { createTelegramHandler } from './core.mjs';
Deno.serve(createTelegramHandler({env:Deno.env}));
