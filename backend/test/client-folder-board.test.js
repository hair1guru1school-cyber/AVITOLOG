'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/client-folder-board.js'),'utf8'),sandbox={module:{exports:{}},URLSearchParams,AbortController};vm.runInNewContext(source,sandbox);const api=sandbox.module.exports;
const clone=v=>JSON.parse(JSON.stringify(v)),root='root_folder_123',cat='category_12345',other='category_67890',fid='project_folder1',fid2='project_folder2';
test('direction headings and folder counts are prominent without changing project row typography',()=>{
 const css=fs.readFileSync(path.resolve(__dirname,'../../assets/css/client-folder-board.css'),'utf8');
 assert.match(css,/\.cfb-column-head strong\{[^}]*font-size:14px;[^}]*font-weight:800/);
 assert.match(css,/\.cfb-column-head small\{[^}]*flex-shrink:0;[^}]*font-size:16px;[^}]*font-weight:800;[^}]*opacity:1/);
 assert.match(css,/\.cfb-project-text strong\{font-size:12px;/);
});
test('new view defaults on; only safe Drive folder links and bounded settings are accepted',()=>{
 assert.equal(api.cleanSettings().enabled,true);assert.equal(api.cleanSettings({enabled:false}).enabled,false);
 assert.equal(api.folderId('https://drive.google.com/drive/folders/'+fid+'?usp=sharing'),fid);
 assert.equal(api.folderId('https://drive.google.com/drive/u/0/folders/'+fid),fid);
 for(const v of ['javascript:alert(1)','https://evil.test/drive/folders/'+fid,'https://drive.google.com.evil.test/drive/folders/'+fid,'abc'])assert.equal(api.folderId(v),'');
 assert.equal(api.cleanSettings({directions:[{id:'bad id',name:'Name',folderId:cat}]}).directions.length,0);
});
test('groups by actual category and real parents, newest Drive-created folders first; no recent-generation timestamps',()=>{
 const context={rootFolderId:root,categories:[{v:cat,n:'Мебель'}],clients:[{client_id:'1',company:'Old',folderId:fid,categoryFolderId:cat,createdAt:'28.10.2026'},{client_id:'2',company:'New',folderId:fid2,categoryFolderId:other}],projects:[]};
 const cache={folders:[{id:cat,name:'Мебель',parents:[root]},{id:fid,name:'Old folder',parents:[cat],createdTime:'2025-01-01T10:00:00Z'},{id:fid2,name:'New folder',parents:[cat],createdTime:'2026-10-20T10:00:00Z'}]};
 const before=JSON.stringify({context,cache}),board=api.buildBoard(context,cache,{}),column=board.columns.find(c=>c.folderId===cat);
 assert.deepEqual(Array.from(column.projects,p=>p.company),['New','Old']);assert.equal(column.projects[1].addedAtMs,Date.parse('2025-01-01T10:00:00Z'));
 assert.equal(JSON.stringify({context,cache}),before);
});
test('same-name folders remain distinct; exact folder or explicit client identity deduplicates CRM/project/Drive',()=>{
 const c={categories:[{v:cat,n:'A'}],clients:[{client_id:'c1',company:'Same',folderId:fid,categoryFolderId:cat},{client_id:'c2',company:'Same',folderId:fid2,categoryFolderId:cat}],projects:[{id:'p1',title:'Same',crmClientId:'c1',zone:'second_chance',manualPaymentsV1:{totalPaid:123}}]};
 const before=JSON.stringify(c),board=api.buildBoard(c,{},{});assert.equal(board.projects.length,2);assert.equal(board.projects.find(p=>p.folderId===fid).projectRecordId,'p1');assert.equal(JSON.stringify(c),before);
});
test('Drive-only directories and project folders appear without creating CRM or calendar records',()=>{
 const c={rootFolderId:root,clients:[],projects:[]},cache={folders:[{id:cat,name:'Направление',parents:[root]},{id:fid,name:'Новый клиент',parents:[cat],createdTime:'2026-10-20T10:00:00Z'}]};
 const board=api.buildBoard(c,cache,{});assert.equal(board.projects.length,1);assert.equal(board.columns[0].name,'Направление');assert.equal(board.projects[0].folderId,fid);assert.equal(c.projects.length,0);assert.equal(c.clients.length,0);
});
test('technical Drive folders are not mistaken for client directions or projects',()=>{
 const cache={folders:[{id:cat,name:'Brains',parents:[root]},{id:fid,name:'project-avatars',parents:[cat]},{id:other,name:'OLD',parents:[root]}]};
 const board=api.buildBoard({rootFolderId:root},cache,{showEmpty:true});assert.equal(board.columns.length,0);assert.equal(board.projects.length,0);
});
test('direction rename and nested folder binding are presentation-only and do not alter project zones, tasks or money',()=>{
 const c={rootFolderId:root,categories:[{v:cat,n:'Main'}],projects:[{id:'x',folderId:fid,title:'One',categoryFolderId:cat,zone:'archive',paymentJournalV1:{entries:[{amount:42}]}},{id:'y',title:'No folder',tasks:[{id:'t1'}]}]};
 const before=JSON.stringify(c),cache={folders:[{id:cat,name:'Main',parents:[root]},{id:other,name:'Вложенная',parents:[cat]},{id:fid,name:'One',parents:[other],createdTime:'2026-10-01T00:00:00Z'}]},settings={directions:[{id:'custom_sub',name:'Подгруппа',folderId:other},{id:'drive_'+cat,name:'Новое имя',folderId:cat}]};
 const board=api.buildBoard(c,cache,settings);assert.equal(board.columns.find(col=>col.id==='custom_sub').projects[0].folderId,fid);assert.equal(board.columns.find(col=>col.id==='unbound').projects[0].company,'No folder');assert.equal(JSON.stringify(c),before);
});
test('unknown dates stay last and sorting is stable across opens',()=>{
 const c={clients:[{client_id:'a',company:'Unknown',folderId:fid},{client_id:'b',company:'Known',folderId:fid2,createdAt:'01.10.2026'}]};
 const one=clone(api.buildBoard(c,{},{}));assert.deepEqual(one,clone(api.buildBoard(c,{},{})));assert.deepEqual(one.columns[0].projects.map(p=>p.company),['Known','Unknown']);assert.equal(api.created({ts:Date.now()}),0);
});
test('Drive reading paginates to completion using read-only folder queries and no credentials in URLs',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>calls.length===1?{files:[{id:fid}],nextPageToken:'page2'}:{files:[{id:fid2}]}};};
 const result=await api.listDriveFolders(fetcher,'private-token',cat);assert.equal(result.length,2);assert.equal(calls.length,2);
 assert.equal(new URL(calls[1][0]).searchParams.get('pageToken'),'page2');for(const [url,opts]of calls){assert.equal(url.includes('private-token'),false);assert.equal(opts.method,undefined);assert.equal(opts.headers.Authorization,'Bearer private-token');assert.match(new URL(url).searchParams.get('q'),/trashed=false/);}
});
test('Drive errors and incomplete/repeating pages fail without treating partial data as authoritative',async()=>{
 await assert.rejects(api.listDriveFolders(async()=>({ok:false,status:403}),'t',cat),/Нет доступа/);
 await assert.rejects(api.listDriveFolders(async()=>({ok:true,json:async()=>({})}),'t',cat),/неполный список/);
 await assert.rejects(api.listDriveFolders(async()=>({ok:true,json:async()=>({files:[],nextPageToken:'same'})}),'t',cat),/повторил страницу/);
});
test('integration guards profile/read-only state, existing document editors and late folder responses',()=>{
 const main=fs.readFileSync(path.resolve(__dirname,'../../js/main.js'),'utf8');
 assert.match(main,/scope: String\(identity && identity.id \|\| 'local'\) \+ '\|' \+ _ck\('avitolog_clients'\)/);
 assert.match(main,/rootFolderId: window.AVITOLOG_KEY_SUFFIX === '_sasha' \? '' : CRM_ROOT/);assert.match(main,/canDrive: ready && !readOnly/);
 assert.match(source,/if\(!s.ready\|\|!c.ready\)/);
 const refresh=main.slice(main.indexOf('async function refreshClientContents('));assert.ok(refresh.indexOf('!forceFolder && docReady && currentHtml')<refresh.indexOf('ClientFolderBoard.renderHome(tab)'));
 assert.match(refresh,/_analyticsRecentSelectedProjectId !== selectedKey/);assert.match(source,/verified.id!==c.actorId/);assert.doesNotMatch(source,/saveProjectsData|saveCrmClients|driveUpload|method:\s*['"](?:POST|PATCH|DELETE)/);
});
test('opening a directory row changes exact selection, never leaves a prior calendar project as a save target',()=>{
 const main=fs.readFileSync(path.resolve(__dirname,'../../js/main.js'),'utf8'),start=main.indexOf('function openClientFolderBoardProject('),end=main.indexOf('function markAnalyticsFolderOpened(',start),h={_selectedProjectId:'previous',_analyticsRecentSelectedProjectId:'',_analyticsOpenedFolderByProject:{},getCrmClients:()=>[{client_id:'c1',company:'Same',folderId:fid},{client_id:'c2',company:'Same',folderId:fid2}],fillClientForm:c=>{h.form=c;},setActiveClient:c=>{h.active=c;},refreshClientContents:()=>{h.refreshes=(h.refreshes||0)+1;}};
 vm.runInNewContext(main.slice(start,end),h);
 h.openClientFolderBoardProject({projectId:'folder_'+fid2,folderId:fid2,projectRecordId:'p2',company:'Same'});
 assert.equal(h._selectedProjectId,'p2');assert.equal(h.active.client_id,'c2');assert.equal(h._analyticsRecentSelectedProjectId,'folder_'+fid2);
 h.openClientFolderBoardProject({projectId:'folder_'+fid,folderId:fid,company:'Same'});assert.equal(h._selectedProjectId,null);assert.equal(h.active.client_id,'c1');
 h.openClientFolderBoardProject({projectId:'project_new',projectRecordId:'new',company:'No folder'});assert.equal(h._analyticsRecentSelectedProjectId,'');assert.equal(h._selectedProjectId,'new');
});
