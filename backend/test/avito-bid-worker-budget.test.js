'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('a cron invocation yields after eight items, keeping the remaining queue durable',async()=>{
 let serve,handled=0,claims=0;
 const code=fs.readFileSync(require('node:path').join(__dirname,'../../supabase/functions/avito-bidding-worker/index.ts'),'utf8').replace(/^import .*;\r?\n/gm,'');
 const context={Request,Response,TextEncoder,Uint8Array,AbortSignal,Date,Map,Number,Error,JSON,
  Deno:{env:{get:()=> 'fixture'},serve:handler=>{serve=handler;}},
  crypto:{subtle:{importKey:async()=>({}),verify:async()=>true}},
  createAvitoFetch:()=>()=>{},createAvitoProviderReadFetch:()=>()=>{},
  createAvitoAccountsHandler:({biddingWorkerRegistry})=>biddingWorkerRegistry.register('personal',async()=>{handled++;}),createAvitoInvitesHandler:()=>{},
  fetch:async url=>{const action=url.split('_').pop();if(action==='claim'){claims++;if(claims>8)throw Error('Unbounded invocation');return Response.json({module:'personal'});}return Response.json(action==='key'?'fixture':true);}};
 vm.runInNewContext(code,context);
 const result=await serve(new Request('https://fixture.invalid/',{method:'POST',headers:{'x-bid-time':String(Math.floor(Date.now()/1000)),'x-bid-nonce':'11111111-1111-4111-8111-111111111111','x-bid-signature':'0'.repeat(64)},body:'{}'}));
 assert.equal(result.status,200);assert.equal((await result.json()).processed,8);assert.equal(claims,8);assert.equal(handled,8);
});
