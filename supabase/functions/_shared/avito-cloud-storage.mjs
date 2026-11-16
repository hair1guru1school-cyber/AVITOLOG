const enc=new TextEncoder();
const fault=code=>Object.assign(new Error(code),{code});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function cloudHash(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
export function cloudLocation(value){
 let url;try{url=new URL(value);}catch(_){throw fault('invalid_cloud_url');}
 if(url.protocol!=='https:'||url.hostname!=='storage.yandexcloud.net'||url.port||url.username||url.password||url.search||url.hash||url.href!==value)throw fault('invalid_cloud_url');
 const [,bucket,...segments]=url.pathname.split('/');let key;try{key=segments.map(decodeURIComponent).join('/');}catch(_){throw fault('invalid_cloud_url');}
 if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)||!key.endsWith('.xlsx')||key.length>1024||/[\x00-\x1f\\]/.test(key)||key.split('/').some(p=>!p||p==='.'||p==='..'))throw fault('invalid_cloud_url');
 return {bucket,key};
}
const escaped=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const pathFor=(bucket,key)=>'/'+escaped(bucket)+'/'+key.split('/').map(escaped).join('/');
async function hmac(key,text){const k=await crypto.subtle.importKey('raw',typeof key==='string'?enc.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(text)));}
export async function cloudSignedRequest(method,bucket,key,keys,{body,headers={},at=Date.now()}={}){
 const path=pathFor(bucket,key),date=new Date(at).toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),payload=await cloudHash(body||new Uint8Array());
 const all={host:'storage.yandexcloud.net','x-amz-content-sha256':payload,'x-amz-date':date};
 for(const [name,value]of Object.entries(headers))all[name.toLowerCase()]=String(value).trim();
 const names=Object.keys(all).sort(),signed=names.join(';'),canonical=[method,path,'',names.map(n=>n+':'+all[n].replace(/\s+/g,' ')+'\n').join(''),signed,payload].join('\n');
 const scope=day+'/ru-central1/s3/aws4_request',stringToSign='AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+await cloudHash(enc.encode(canonical));
 const signing=await hmac(await hmac(await hmac(await hmac('AWS4'+keys.secret_key,day),'ru-central1'),'s3'),'aws4_request');
 const signature=hex(await hmac(signing,stringToSign));delete all.host;
 return {url:'https://storage.yandexcloud.net'+path,init:{method,headers:{...all,Authorization:'AWS4-HMAC-SHA256 Credential='+keys.access_key+'/'+scope+', SignedHeaders='+signed+', Signature='+signature},...(body?{body}:{}),redirect:'error',credentials:'omit'}};
}
export async function cloudBytes(response,maximum=10485760){
 if(Number(response.headers.get('content-length'))>maximum){await response.body?.cancel();throw fault('cloud_file_too_large');}
 const reader=response.body?.getReader();if(!reader)throw fault('cloud_empty_response');let size=0;const parts=[];
 try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>maximum){await reader.cancel();throw fault('cloud_file_too_large');}parts.push(v.value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
export function createCloudStorage({fetch:fetcher=fetch,now=Date.now}={}){
 return async function request(method,location,keys,{key=location.key,body,headers={},allowMissing=false}={}){
  let url='https://storage.yandexcloud.net'+pathFor(location.bucket,key),init={method,headers,redirect:'error',credentials:'omit'};
  if(keys){const signed=await cloudSignedRequest(method,location.bucket,key,keys,{body,headers,at:now()});url=signed.url;init=signed.init;}else if(method!=='GET')throw fault('cloud_keys_required');
  let response;try{response=await fetcher(url,{...init,signal:AbortSignal.timeout(25000)});}catch(_){throw fault(method==='PUT'?'cloud_write_unconfirmed':'cloud_unavailable');}
  if(allowMissing&&response.status===404){await response.body?.cancel();return null;}
  if(!response.ok){let providerCode='';if(response.status===403){try{const text=new TextDecoder().decode(await cloudBytes(response,8192));providerCode=/<Code>([A-Za-z]+)<\/Code>/.exec(text)?.[1]||'';}catch(_){}}else await response.body?.cancel();
   throw fault(({InvalidAccessKeyId:'cloud_invalid_access_key',SignatureDoesNotMatch:'cloud_signature_mismatch',RequestTimeTooSkewed:'cloud_clock_skew'})[providerCode]||(response.status===412?'cloud_conflict':response.status===403?'cloud_access_denied':response.status===429?'cloud_rate_limited':'cloud_unavailable'));}
  return response;
 };
}
