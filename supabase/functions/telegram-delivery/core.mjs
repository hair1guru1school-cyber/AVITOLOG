const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT=/^-[1-9][0-9]{4,19}$/, TYPES=['kp','analysis','presale','avito1','contract','appendix','other','scripts'];
const enc=new TextEncoder(),fail=(status,code)=>Object.assign(Error(code),{status,code});
const ORIGINS=['https://hair1guru1school-cyber.github.io','https://avitoboss.online'];
export function normalizeTelegramTemplate(value={}){
 const text=(key,max,otherwise='')=>typeof value[key]==='string'?value[key].trim().slice(0,max):otherwise;
 const defaults={kp:'🤝 Направляю подробное коммерческое предложение по проекту «{project}»: варианты продвижения, состав работ и стоимость. Посмотрите подходящий пакет — обсудим детали и следующий шаг.',analysis:'💡 Прикладываю анализ проекта «{project}»: рынок, целевую аудиторию, ключевые позиции и рекомендации по запуску. Он поможет оценить возможности продвижения и выбрать приоритеты.',presale:'⏰ Здесь — почему стоит рассмотреть запуск сейчас: текущая ситуация, подготовка и первые шаги для проекта «{project}».',avito1:'🏆 Почему Авито №1: собрал возможности площадки для проекта «{project}», её преимущества и моменты, которые важно учесть перед стартом. Посмотрите вместе с КП — так проще выбрать формат продвижения.',contract:'📜 Договор по проекту «{project}». Проверьте реквизиты, состав работ, сроки и стоимость. Напишите, если нужны уточнения.',appendix:'📎 Приложение к договору по проекту «{project}»: перечень работ и согласованные условия.',other:'Документ по проекту «{project}». Посмотрите, пожалуйста; готов обсудить вопросы.',scripts:'🌀 Подготовил скрипты для проекта «{project}»: ответы клиентам, уточнение задачи, предложение и работа с возражениями.'};
 const captions={},enabled={};for(const type of TYPES){const caption=value.captions?.[type];captions[type]=typeof caption==='string'&&!(value.version!==2&&caption==='{document}')?caption.slice(0,800):defaults[type];enabled[type]=value.enabled?.[type]!==false;}
 let order=Array.isArray(value.order)?value.order.filter((x,i,a)=>TYPES.includes(x)&&a.indexOf(x)===i):[];
 if(value.version!==2)order=['kp',...order.filter(x=>x!=='kp'&&x!=='scripts')];order=order.concat(TYPES.filter(x=>!order.includes(x)));if(value.version!==2)order=order.filter(x=>x!=='scripts').concat('scripts');
 return {version:2,heading:text('heading',200,'{project}'),intro:text('intro',800),footer:text('footer',800,'{date}'),captions,enabled,order,silent:value.silent!==false};
}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||required&&!value.trim())throw fail(400,'invalid_request');return value.trim();}
export function richPdfMessage(manifest,files){
 if(!manifest||!Array.isArray(manifest.documents)||manifest.documents.length<1||manifest.documents.length>10||files.length!==manifest.documents.length)throw fail(400,'invalid_files');
 const blocks=[],names=new Set(),documents=[];
 const heading=text(manifest.heading,200),intro=text(manifest.intro,800),footer=text(manifest.footer,800);
 if(heading)blocks.push({type:'heading',size:3,text:heading});if(intro)blocks.push({type:'paragraph',text:intro});
 manifest.documents.forEach((item,index)=>{
  if(!item||!TYPES.includes(item.type)||names.has(item.name)||typeof item.name!=='string'||item.name.length>180||!item.name.endsWith('.pdf')||/[\\/\u0000-\u001f]/.test(item.name)||files[index].name!==item.name)throw fail(400,'invalid_files');names.add(item.name);
  const caption=text(item.caption,800);documents.push({type:item.type,name:item.name,caption});
  blocks.push({type:'document',document:{type:'document',media:'attach://pdf'+index,disable_content_type_detection:true}});
  if(caption)blocks.push({type:'paragraph',text:caption});
 });if(footer)blocks.push({type:'footer',text:footer});
 return {rich:{blocks,skip_entity_detection:true},content:{heading,intro,footer,documents,silent:manifest.silent!==false}};
}
async function bounded(response,maximum){
 if(Number(response.headers.get('content-length'))>maximum){await response.body?.cancel();throw fail(413,'request_too_large');}
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>maximum){await reader.cancel();throw fail(413,'request_too_large');}parts.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
async function readJson(response,max=1024*1024){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(response,max)));}catch(error){if(error.code)throw error;throw fail(502,'invalid_response');}}
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
const base64=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
async function keyFor(master,owner){
 let bytes;try{bytes=/^[a-f0-9]{64}$/i.test(master)?Uint8Array.from(master.match(/../g),x=>parseInt(x,16)):Uint8Array.from(atob(master.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}catch(_){throw fail(503,'configuration');}
 if(bytes.length!==32)throw fail(503,'configuration');
 const key=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('AVITOBOSS telegram delivery v1'),info:enc.encode(owner)},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealTelegramToken(token,master,owner){const iv=crypto.getRandomValues(new Uint8Array(12)),ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},await keyFor(master,owner),enc.encode(token));return {v:1,iv:base64(iv),ciphertext:base64(new Uint8Array(ciphertext))};}
export async function openTelegramToken(box,master,owner){
 try{if(box?.v!==1)throw Error();const iv=Uint8Array.from(atob(box.iv),x=>x.charCodeAt(0)),bytes=Uint8Array.from(atob(box.ciphertext),x=>x.charCodeAt(0));if(iv.length!==12||bytes.length>512)throw Error();return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},await keyFor(master,owner),bytes));}catch(_){throw fail(503,'credential_unavailable');}
}
export function discoverTelegramTargets(updates){
 const rows=new Map();for(const update of updates||[]){for(const chat of [update.my_chat_member?.chat,update.channel_post?.chat,update.message?.forward_origin?.chat,update.message?.forward_from_chat]){
  if(chat&&CHAT.test(String(chat.id))&&['channel','group','supergroup'].includes(chat.type)&&typeof chat.title==='string')rows.set(String(chat.id),{id:String(chat.id),title:chat.title.slice(0,200),type:chat.type});
 }}return Array.from(rows.values()).slice(0,50);
}
export function createTelegramHandler(options={}){
 const env=options.env||{},read=name=>String(typeof env.get==='function'?env.get(name)||'':env[name]||''),fetcher=options.fetch||fetch;
 const url=read('SUPABASE_URL').replace(/\/+$/,''),service=read('SUPABASE_SERVICE_ROLE_KEY'),anon=read('SUPABASE_ANON_KEY'),master=read('AVITO_TOKEN_ENCRYPTION_KEY');
 const json=(value,status,origin)=>Response.json(value,{status,headers:{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 async function serviceRequest(route,body,method){
  let response;try{response=await fetcher(url+'/rest/v1/'+route,{method:method||(body===undefined?'GET':'POST'),headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});}catch(_){throw fail(503,'storage_unavailable');}
  if(response.ok&&route==='rpc/telegram_delivery_require_actor'){await response.body?.cancel();return null;}
  const value=await readJson(response);if(!response.ok){const code=['settings_conflict','delivery_busy','request_conflict','try_later','telegram_forbidden','bot_required'].find(x=>String(value.message||'').includes(x));throw fail(code==='telegram_forbidden'?403:409,code||'storage_unavailable');}return value;
 }
 const rpc=(name,body)=>serviceRequest('rpc/telegram_delivery_'+name,body);
 async function auth(request){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!service||!anon||!master)throw fail(503,'configuration');
  const authorization=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))throw fail(401,'authentication_required');
  let response;try{response=await fetcher(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(12000),redirect:'error'});}catch(_){throw fail(503,'authentication_unavailable');}
  if(!response.ok)throw fail(response.status===401||response.status===403?401:503,'authentication_required');const user=await readJson(response,65536);if(!UUID.test(user.id||''))throw fail(401,'authentication_required');
  const params=new URL(request.url).searchParams,org=params.get('organization_id'),profile=params.get('profile');if(!UUID.test(org||'')||!['fil','sasha'].includes(profile))throw fail(400,'invalid_context');
  const actor={p_owner:user.id.toLowerCase(),p_org:org.toLowerCase(),p_profile:profile};await rpc('require_actor',actor);return actor;
 }
 const filter=actor=>'owner_id=eq.'+actor.p_owner+'&organization_id=eq.'+actor.p_org+'&profile=eq.'+actor.p_profile;
 const owner=actor=>actor.p_owner+'|'+actor.p_org+'|'+actor.p_profile;
 async function connection(actor){const rows=await serviceRequest('telegram_delivery_connections?select=*&'+filter(actor)+'&limit=1');return rows?.[0]||null;}
 function publicConfig(row){return {connected:!!row,bot:row?{id:String(row.bot_id),username:row.bot_username}:null,revision:row?.revision||null,destination:row?.destination_id?{id:row.destination_id,title:row.destination_title,type:row.destination_type}:null,template:normalizeTelegramTemplate(row?.template)};}
 async function telegram(token,method,payload,form=false,sending=false){
  let response;try{response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:form?undefined:{'Content-Type':'application/json'},body:form?payload:JSON.stringify(payload||{}),redirect:'error',signal:AbortSignal.timeout(sending?90000:20000)});}catch(_){throw fail(502,sending?'send_unknown':'telegram_unavailable');}
  let result;try{result=await readJson(response,2*1024*1024);}catch(_){throw fail(502,sending?'send_unknown':'telegram_unavailable');}
  if(!response.ok||result.ok!==true){if(sending&&response.status>=500)throw fail(502,'send_unknown');throw fail(422,result.error_code===429?'try_later':sending?'telegram_rejected':'telegram_access_denied');}
  return result.result;
 }
 async function target(token,bot,id){
  if(!CHAT.test(String(id||'')))throw fail(400,'invalid_destination');const chat=await telegram(token,'getChat',{chat_id:id});
  if(String(chat?.id)!==id||!['channel','group','supergroup'].includes(chat.type)||typeof chat.title!=='string')throw fail(400,'invalid_destination');
  const member=await telegram(token,'getChatMember',{chat_id:id,user_id:bot});
  if(member?.user?.id!==bot||!['administrator','creator'].includes(member.status)||chat.type==='channel'&&member.can_post_messages!==true)throw fail(403,'posting_rights_required');
  return {id,title:chat.title.slice(0,200),type:chat.type};
 }
 return async function(request){
  const origin=request.headers.get('origin')||'';if(!ORIGINS.includes(origin))return json({ok:false,error:'origin_forbidden'},403,'null');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Max-Age':'600','Vary':'Origin'}});
  try{
   const path=new URL(request.url).pathname.replace(/^.*\/telegram-delivery/,'');
   if(![['GET','/config'],['POST','/connect'],['POST','/targets'],['PUT','/settings'],['POST','/send'],['GET','/jobs']].some(([m,p])=>request.method===m&&path===p))throw fail(404,'not_found');
   const actor=await auth(request),row=await connection(actor);
   if(path==='/config')return json({ok:true,...publicConfig(row)},200,origin);
   if(path==='/jobs'){
    const records=await serviceRequest('telegram_delivery_jobs?select=request_id,state,message_id,destination_id,destination_title,project_title,file_count,created_at&'+filter(actor)+'&order=created_at.desc&limit=10');return json({ok:true,jobs:records.map(x=>({...x,state:x.state==='sending'&&Date.now()-Date.parse(x.created_at)>300000?'unknown':x.state}))},200,origin);
   }
   if(path==='/send'){
    if(!row?.destination_id)throw fail(409,'destination_required');
    if(!/^multipart\/form-data;\s*boundary=/.test(request.headers.get('content-type')||''))throw fail(400,'invalid_files');
    const bytes=await bounded(request,25*1024*1024+65536),form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();let manifest;try{manifest=JSON.parse(String(form.get('manifest')||''));}catch(_){throw fail(400,'invalid_request');}
    if(!UUID.test(manifest.request_id||'')||manifest.revision!==row.revision||manifest.destination_id!==row.destination_id)throw fail(409,'settings_conflict');
    const project=text(manifest.project,200,true),items=manifest.documents;if(!Array.isArray(items)||!items.length||items.length>10||Array.from(form.keys()).length!==items.length+1)throw fail(400,'invalid_files');
    const files=items.map((_,i)=>form.get('pdf'+i));let total=0;const digests=[];
    for(const file of files){if(!file||typeof file.arrayBuffer!=='function'||file.type!=='application/pdf'||file.size<8||file.size>10*1024*1024||(total+=file.size)>25*1024*1024||await file.slice(0,5).text()!=='%PDF-')throw fail(400,'invalid_files');digests.push(await hash(await file.arrayBuffer()));}
    const message=richPdfMessage(manifest,files),payloadHash=await hash(enc.encode(JSON.stringify({project,content:message.content,digests}))),token=await openTelegramToken(row.encrypted_token,master,owner(actor));
    await target(token,row.bot_id,row.destination_id);
    const claim=await rpc('begin',{...actor,p_request:manifest.request_id,p_revision:row.revision,p_target:row.destination_id,p_hash:payloadHash,p_project:project,p_count:files.length});
    if(!claim.claimed)return json({ok:true,request_id:manifest.request_id,state:claim.state,message_id:claim.message_id||null,destination:publicConfig(row).destination},200,origin);
    const outgoing=new FormData();outgoing.set('chat_id',row.destination_id);outgoing.set('rich_message',JSON.stringify(message.rich));outgoing.set('disable_notification',String(message.content.silent));files.forEach((file,i)=>outgoing.set('pdf'+i,file,file.name));
    let sent;try{sent=await telegram(token,'sendRichMessage',outgoing,true,true);if(!Number.isSafeInteger(sent?.message_id)||sent.message_id<1||String(sent?.chat?.id)!==row.destination_id)throw fail(502,'send_unknown');}
    catch(error){const state=error.code==='send_unknown'?'unknown':'failed';await rpc('finish',{...actor,p_request:manifest.request_id,p_hash:payloadHash,p_state:state,p_message:null}).catch(()=>{});throw error;}
    const receipt=await rpc('finish',{...actor,p_request:manifest.request_id,p_hash:payloadHash,p_state:'sent',p_message:sent.message_id}).catch(()=>false);
    return json({ok:true,request_id:manifest.request_id,state:'sent',message_id:sent.message_id,receipt_saved:receipt===true,destination:publicConfig(row).destination},200,origin);
   }
   const body=await readJson(request,32768);
   if(path==='/connect'){
    if(body.revision!==(row?.revision||null))throw fail(409,'settings_conflict');
    const token=typeof body.token==='string'?body.token.trim():'';if(!/^[1-9][0-9]{4,19}:[A-Za-z0-9_-]{30,100}$/.test(token))throw fail(400,'invalid_token');
    const me=await telegram(token,'getMe',{});if(me?.is_bot!==true||String(me.username||'').toLowerCase()!=='avbssbot'||!Number.isSafeInteger(me.id))throw fail(400,'wrong_bot');
    const encrypted=await sealTelegramToken(token,master,owner(actor));await rpc('save',{...actor,p_expected:body.revision,p_connect:true,p_value:{bot_id:me.id,bot_username:'avbssbot',encrypted_token:encrypted}});return json({ok:true,...publicConfig(await connection(actor))},200,origin);
   }
   if(!row)throw fail(409,'bot_required');const token=await openTelegramToken(row.encrypted_token,master,owner(actor));
   if(path==='/targets'){
    const webhook=await telegram(token,'getWebhookInfo',{});if(webhook?.url)return json({ok:true,targets:[],webhook:true},200,origin);
    const updates=await telegram(token,'getUpdates',{limit:100,timeout:0});return json({ok:true,targets:discoverTelegramTargets(updates),webhook:false},200,origin);
   }
   if(body.revision!==row.revision)throw fail(409,'settings_conflict');const destination=await target(token,row.bot_id,body.destination_id);
   await rpc('save',{...actor,p_expected:body.revision,p_connect:false,p_value:{destination_id:destination.id,destination_title:destination.title,destination_type:destination.type,template:normalizeTelegramTemplate(body.template)}});
   return json({ok:true,...publicConfig(await connection(actor))},200,origin);
  }catch(error){return json({ok:false,error:error.code||'unavailable'},error.status||503,origin);}
 };
}
