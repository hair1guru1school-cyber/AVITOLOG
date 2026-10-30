'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=require('node:path').resolve(__dirname,'../..'),moduleReady=import(require('node:url').pathToFileURL(root+'/supabase/functions/telegram-delivery/core.mjs').href);
const OWNER='22222222-2222-4222-8222-222222222222',ORG='11111111-1111-4111-8111-111111111111',TARGET='-1001234567890',MASTER='ab'.repeat(32),TOKEN='123456:'+ 'x'.repeat(35),ORIGIN='https://hair1guru1school-cyber.github.io';
async function fixture(){
 const G=await moduleReady,rows=new Map(),jobs=new Map(),calls=[];let actor=OWNER,rights=true,webhook=false,sendMode='ok',wrongBot=false;
 const key=a=>[a.p_owner,a.p_org,a.p_profile].join('|'),reply=(x,status=200)=>Response.json(x,{status});
 const fetcher=async(url,opts={})=>{
  const parsed=new URL(url),body=opts.body instanceof FormData?opts.body:opts.body?JSON.parse(opts.body):{};calls.push({url,body});
  if(parsed.pathname==='/auth/v1/user')return opts.headers.Authorization==='Bearer user-token'?reply({id:actor}):reply({error:'bad'},401);
  if(parsed.pathname.includes('/rest/v1/')){
   const route=parsed.pathname.split('/rest/v1/')[1];
   if(route==='rpc/telegram_delivery_require_actor'){if(body.p_owner!==OWNER||body.p_profile==='fil'&&actor!==OWNER)return reply({message:'telegram_forbidden'},403);return reply(null);}
   if(route==='rpc/telegram_delivery_save'){
    const old=rows.get(key(body));if((old?.revision||null)!==body.p_expected)return reply({message:'settings_conflict'},400);
    rows.set(key(body),body.p_connect?{...old,revision:crypto.randomUUID(),bot_id:body.p_value.bot_id,bot_username:body.p_value.bot_username,encrypted_token:body.p_value.encrypted_token,destination_id:null,template:old?.template||{}}:{...old,...body.p_value,revision:crypto.randomUUID()});return reply(rows.get(key(body)).revision);
   }
   if(route==='rpc/telegram_delivery_begin'){
    const id=key(body)+'|'+body.p_request,old=jobs.get(id);if(old){if(old.payload_hash!==body.p_hash)return reply({message:'request_conflict'},400);return reply({claimed:false,...old});}
    const c=rows.get(key(body));if(c.revision!==body.p_revision||c.destination_id!==body.p_target)return reply({message:'settings_conflict'},400);
    jobs.set(id,{state:'sending',payload_hash:body.p_hash,request_id:body.p_request,project_title:body.p_project,file_count:body.p_count,destination_id:c.destination_id,destination_title:c.destination_title,created_at:new Date().toISOString()});return reply({claimed:true,state:'sending'});
   }
   if(route==='rpc/telegram_delivery_finish'){const r=jobs.get(key(body)+'|'+body.p_request);if(r?.state!=='sending'||r.payload_hash!==body.p_hash)return reply(false);r.state=body.p_state;r.message_id=body.p_message;return reply(true);}
   if(route==='telegram_delivery_connections'){return reply([rows.get([parsed.searchParams.get('owner_id').slice(3),parsed.searchParams.get('organization_id').slice(3),parsed.searchParams.get('profile').slice(3)].join('|'))].filter(Boolean));}
   if(route==='telegram_delivery_jobs')return reply(Array.from(jobs.values()).map(({payload_hash,...rest})=>rest));
   throw Error('Unexpected database request');
  }
  if(parsed.hostname!=='api.telegram.org')throw Error('Unexpected provider');
  const method=parsed.pathname.split('/').at(-1);
  if(method==='getMe')return reply({ok:true,result:{id:123456,is_bot:true,username:wrongBot?'otherbot':'avbssbot'}});
  if(method==='getWebhookInfo')return reply({ok:true,result:{url:webhook?'https://existing.example/webhook':''}});
  if(method==='getUpdates')return reply({ok:true,result:[{my_chat_member:{chat:{id:Number(TARGET),title:'🗒 NOTES',type:'channel'}}}]});
  if(method==='getChat')return reply({ok:true,result:{id:Number(body.chat_id),title:'🗒 NOTES',type:'channel'}});
  if(method==='getChatMember')return reply({ok:true,result:{user:{id:123456},status:'administrator',can_post_messages:rights}});
  if(method==='sendRichMessage'){
   if(sendMode==='timeout')throw Error('Private URL '+TOKEN);
   if(sendMode==='reject')return reply({ok:false,error_code:400,description:'Rejected '+TOKEN},400);
   if(sendMode==='malformed')return reply({ok:true,result:{message_id:70,chat:{id:-9999999999}}});
   return reply({ok:true,result:{message_id:70,chat:{id:Number(TARGET)}}});
  }
  throw Error('Unexpected Telegram method');
 };
 const handler=G.createTelegramHandler({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',AVITO_TOKEN_ENCRYPTION_KEY:MASTER},fetch:fetcher});
 async function request(route,body,opts={}){const method=opts.method||(body===undefined?'GET':'POST'),headers={origin:opts.origin||ORIGIN,Authorization:opts.authorization||'Bearer user-token'};if(!(body instanceof FormData)&&body!==undefined)headers['Content-Type']='application/json';const response=await handler(new Request('https://example.supabase.co/functions/v1/telegram-delivery/'+route+'?organization_id='+ORG+'&profile='+(opts.profile||'fil'),{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}));return {status:response.status,value:await response.json()};}
 async function connect(){return request('connect',{token:TOKEN,revision:null});}
 async function ready(){const connected=await connect();assert.equal(connected.status,200);const saved=await request('settings',{revision:connected.value.revision,destination_id:TARGET,template:{heading:'{project}'}},{method:'PUT'});assert.equal(saved.status,200);return saved.value;}
 function form(config,options={}){
  const documents=[{type:'analysis',name:'Аналитика.pdf',caption:'Первый текст'},{type:'scripts',name:'Скрипт.pdf',caption:'Второй текст'}];
  const manifest={request_id:options.id||crypto.randomUUID(),revision:config.revision,destination_id:options.target||TARGET,project:'Тестовый проект',heading:'Заголовок',intro:'Вступление',footer:'Конец',silent:true,documents};
  const data=new FormData();data.set('manifest',JSON.stringify({...manifest,...options.manifest}));documents.forEach((d,i)=>data.set('pdf'+i,new File([options.invalid?'not a PDF file':'%PDF-1.4\n'+(options.content||'Example')+'\n%%EOF'],d.name,{type:'application/pdf'})));return {data,id:manifest.request_id};
 }
 return {G,request,connect,ready,form,rows,jobs,calls,actor:v=>{actor=v;},rights:v=>{rights=v;},webhook:v=>{webhook=v;},mode:v=>{sendMode=v;},wrongBot:v=>{wrongBot=v;},sends:()=>calls.filter(c=>c.url.endsWith('/sendRichMessage'))};
}
test('encrypted bot tokens are bound to identity, organization and profile',async()=>{
 const {sealTelegramToken:seal,openTelegramToken:open}=await moduleReady,owner=OWNER+'|'+ORG+'|fil',box=await seal(TOKEN,MASTER,owner);assert.equal(JSON.stringify(box).includes(TOKEN),false);assert.equal(await open(box,MASTER,owner),TOKEN);await assert.rejects(open(box,MASTER,owner.replace('fil','sasha')),/credential_unavailable/);await assert.rejects(open(box,'cd'.repeat(32),owner),/credential_unavailable/);
});
test('authentication, origin and organization checks run before bot credentials or data access',async()=>{
 const h=await fixture();assert.equal((await h.request('config',undefined,{authorization:'Bearer bad'})).status,401);assert.equal((await h.request('config',undefined,{origin:'https://evil.example'})).status,403);h.actor('44444444-4444-4444-8444-444444444444');assert.equal((await h.request('config')).status,403);assert.equal(h.calls.some(c=>c.url.includes('api.telegram.org')),false);
});
test('only the intended bot can connect; public configuration never exposes secrets',async()=>{
 const h=await fixture();h.wrongBot(true);assert.equal((await h.connect()).value.error,'wrong_bot');assert.equal(h.rows.size,0);h.wrongBot(false);const config=await h.connect();assert.equal(config.value.bot.username,'avbssbot');const read=await h.request('config');assert.equal(read.value.connected,true);assert.equal(JSON.stringify(read.value).includes(TOKEN),false);assert.equal(JSON.stringify(read.value).includes('encrypted_token'),false);assert.notEqual(Array.from(h.rows.values())[0].encrypted_token.ciphertext,TOKEN);
});
test('a named private channel is never selected until its ID and posting rights are verified',async()=>{
 const h=await fixture(),connected=await h.connect();assert.equal(connected.value.destination,null);const targets=await h.request('targets',{});assert.equal(targets.value.targets[0].title,'🗒 NOTES');assert.equal((await h.request('config')).value.destination,null);h.rights(false);const denied=await h.request('settings',{revision:connected.value.revision,destination_id:TARGET,template:{}},{method:'PUT'});assert.equal(denied.value.error,'posting_rights_required');assert.equal((await h.request('config')).value.destination,null);
});
test('existing webhook is never removed or modified to discover channels',async()=>{
 const h=await fixture();await h.connect();h.webhook(true);const result=await h.request('targets',{});assert.equal(result.value.webhook,true);assert.equal(h.calls.some(c=>/getUpdates|deleteWebhook|setWebhook/.test(c.url)),false);
});
test('all PDFs and interleaved captions are sent in exactly one rich message, not an album',async()=>{
 const h=await fixture(),config=await h.ready(),form=h.form(config),sent=await h.request('send',form.data);assert.equal(sent.status,200);assert.equal(sent.value.state,'sent');assert.equal(sent.value.message_id,70);assert.equal(h.sends().length,1);
 const body=h.sends()[0].body;assert.equal(body.get('chat_id'),TARGET);const rich=JSON.parse(body.get('rich_message'));assert.deepEqual(rich.blocks.map(b=>b.type),['heading','paragraph','document','paragraph','document','paragraph','footer']);assert.equal(rich.blocks[3].text,'Первый текст');assert.equal(rich.blocks[5].text,'Второй текст');for(const key of ['pdf0','pdf1'])assert.equal(await body.get(key).slice(0,5).text(),'%PDF-');assert.equal(h.calls.some(c=>/sendDocument|sendMediaGroup|sendMessage$/.test(c.url)),false);
});
test('duplicate request returns its receipt without sending again; conflicting payload is rejected',async()=>{
 const h=await fixture(),config=await h.ready(),first=h.form(config);await h.request('send',first.data);const same=h.form(config,{id:first.id});const repeat=await h.request('send',same.data);assert.equal(repeat.value.state,'sent');const changed=h.form(config,{id:first.id,content:'Changed'});assert.equal((await h.request('send',changed.data)).value.error,'request_conflict');assert.equal(h.sends().length,1);
});
test('destination override, outdated settings, non-PDF data and filename injection fail before posting',async()=>{
 const h=await fixture(),config=await h.ready();for(const options of [{target:'-1009999999999'},{invalid:true},{manifest:{revision:crypto.randomUUID()}},{manifest:{documents:[{type:'analysis',name:'../bad.pdf',caption:''}]}}]){const {data}=h.form(config,options);const r=await h.request('send',data);assert.ok(r.status>=400);}assert.equal(h.sends().length,0);
});
test('unknown provider responses stop automatic retries and do not leak token URLs',async()=>{
 for(const mode of ['timeout','malformed']){const h=await fixture(),config=await h.ready(),first=h.form(config);h.mode(mode);const response=await h.request('send',first.data);assert.equal(response.value.error,'send_unknown');assert.equal(JSON.stringify(response).includes(TOKEN),false);assert.equal(Array.from(h.jobs.values())[0].state,'unknown');const again=await h.request('send',h.form(config,{id:first.id}).data);assert.equal(again.value.state,'unknown');assert.equal(h.sends().length,1);}
});
test('known provider rejection is recorded without format fallback or duplicate messages',async()=>{
 const h=await fixture(),config=await h.ready();h.mode('reject');const rejected=await h.request('send',h.form(config).data);assert.equal(rejected.value.error,'telegram_rejected');assert.equal(JSON.stringify(rejected).includes(TOKEN),false);assert.equal(Array.from(h.jobs.values())[0].state,'failed');assert.equal(h.sends().length,1);
});
test('settings cannot be silently overwritten by an old revision or another profile',async()=>{
 const h=await fixture(),config=await h.ready();const sasha=await h.request('config',undefined,{profile:'sasha'});assert.equal(sasha.value.connected,false);const stale=await h.request('settings',{revision:crypto.randomUUID(),destination_id:TARGET,template:{heading:'Wrong'}},{method:'PUT'});assert.equal(stale.value.error,'settings_conflict');assert.equal((await h.request('config')).value.revision,config.revision);
});
test('only supported template variables and plain text blocks are accepted',async()=>{
 const h=await fixture(),settings=h.G.normalizeTelegramTemplate({heading:'<b>{project}</b>',captions:{analysis:'{document}'},order:['analysis','analysis','invalid'],api_token:TOKEN});assert.equal(settings.heading,'<b>{project}</b>');assert.deepEqual(settings.order,['analysis','scripts','presale','avito1']);assert.equal('api_token' in settings,false);
 const rich=h.G.richPdfMessage({heading:'<script>x</script>',intro:'',footer:'',documents:[{type:'analysis',name:'a.pdf',caption:'<b>text</b>'}]},[{name:'a.pdf'}]);assert.equal(rich.rich.blocks[0].text,'<script>x</script>');assert.equal(rich.rich.skip_entity_detection,true);
});
