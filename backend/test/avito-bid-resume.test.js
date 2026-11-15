'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ORG='11111111-1111-4111-8111-111111111111',ACCOUNT='22222222-2222-4222-8222-222222222222',ACTOR='33333333-3333-4333-8333-333333333333';
async function fixture(options={}){
 const {createAvitoBidding}=await import('../../supabase/functions/_shared/avito-bidding.mjs');
 const calls=[],writes=[],queue=[];
 const context={row:{id:ACCOUNT,avito_user_id:'123',credential_version:'v1'},org:ORG,actor:ACTOR,token:'fixture',guard:async()=>{},reconcileBase:async current=>{calls.push(['reconcile',current?.mode||'base']);return options.reconciled!==false;}};
 const engine=createAvitoBidding({module:'personal',signingSecret:'fixture',now:()=>Date.parse('2026-11-15T12:00:00Z'),
  store:{reserve:async()=>true,begin:async()=>true,finish:async()=>true,queue:async(name,args)=>{queue.push([name,args]);return {id:args.p_id,status:'queued'};}},
  requestJson:async url=>{calls.push(['read',url]);if(url.includes('/core/v1/accounts/'))return {status:'active'};if(url.endsWith('/getPromotionsByItemIds'))return {items:options.base?[]:[{itemID:1234,actionTypeID:5,manualPromotion:{bidPenny:200,limitPenny:20000}}]};throw Error('Unexpected read');},
  fetch:async(url,init)=>{writes.push([url,init]);return new Response(null,{status:200});}});
 return {engine,context,calls,writes,queue};
}
const intent={mode:'base',action_type_id:5,bid_penny:null,limit_penny:null,budget_penny:null,budget_type:null};
test('base queue verifies provider state and skips an already disabled item without writing',async()=>{
 const f=await fixture({base:true});let submits=0;
 const r=await f.engine.runQueued(f.context,'1234',intent,async()=>{submits++;});
 assert.equal(r.status,'applied');assert.equal(r.error,'bidding_no_paid_promotion');assert.equal(f.writes.length,0);assert.equal(submits,0);assert.deepEqual(f.calls.at(-1),['reconcile','base']);
});
test('unresolved prior submission cannot be blindly retried',async()=>{
 const f=await fixture({reconciled:false});let submits=0;
 await assert.rejects(()=>f.engine.runQueued(f.context,'1234',intent,async()=>{submits++;}),{code:'bidding_reconciliation_pending'});
 assert.equal(f.writes.length,0);assert.equal(submits,0);assert.deepEqual(f.calls.at(-1),['reconcile','manual']);
});
test('fresh readback permits only one audited base submission',async()=>{
 const f=await fixture();let submits=0;
 await f.engine.runQueued(f.context,'1234',intent,async()=>{submits++;assert.deepEqual(f.calls.at(-1),['reconcile','manual']);});
 assert.equal(submits,1);assert.equal(f.writes.length,1);
});
test('resume is scoped to the authenticated account and requires edit permission',async()=>{
 const f=await fixture(),{requireBiddingScope,biddingRoute}=await import('../../supabase/functions/_shared/avito-bidding.mjs');
 const id='44444444-4444-4444-8444-444444444444';
 await f.engine.handle({context:f.context,route:{action:'queue-resume'},method:'POST',body:{job_id:id}});
 assert.deepEqual(f.queue,[['resume',{p_module:'personal',p_org:ORG,p_account:ACCOUNT,p_actor:ACTOR,p_id:id}]]);
 assert.throws(()=>requireBiddingScope({status:'connected',scopes:['items:info','cpxpromo:read']},'queue-resume',true),{code:'bidding_scope_required'});
 assert.equal(biddingRoute('/accounts/'+ACCOUNT+'/bidding/queue-resume','/accounts').action,'queue-resume');
 await assert.rejects(()=>f.engine.handle({context:f.context,route:{action:'queue-resume'},method:'POST',body:{job_id:id,p_actor:ACCOUNT}}),{code:'invalid_request'});
});
