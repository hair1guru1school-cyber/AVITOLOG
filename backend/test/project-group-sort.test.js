const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/projects.js'),'utf8');
const block=source.slice(source.indexOf('function getProjectGroupId('),source.indexOf('function showProjectsGroupPicker('));
function harness(){
 const storage=new Map(),styles=new Map(),state={scope:'fil',renders:0,writes:0};
 const ctx={_projectsGroupSortOn:true,_projectsGroupSortScope:'',projectsInteractionScope:()=>state.scope,rerenderProjectsImmediate:()=>state.renders++,escAttr:v=>String(v).replace(/"/g,'&quot;'),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v);state.writes++;}},document:{getElementById:id=>styles.get(id),createElement:()=>({}),head:{appendChild:style=>styles.set(style.id,style)}},window:{ProjectGroups:{forProject:(p,groups)=>groups.find(g=>g.id===p.projectGroupId)}}};vm.createContext(ctx);vm.runInContext(block,ctx);return {ctx,state,storage,styles};
}
test('group sorting retains all 31 projects, their calendar data and stable order within each group',()=>{
 const h=harness(),groups=[{id:'furniture'},{id:'fences'},{id:'houses'}],projects=Array.from({length:31},(_,i)=>({id:'p'+i,projectGroupId:groups[(i*7)%3].id,sortOrder:i,events:[{type:'active_range',startDate:'2026-11-01',endDate:'2026-12-01'}],mustLaunchRequired:i%2===0})),before=JSON.stringify(projects);
 const sorted=h.ctx.arrangeProjectsByGroup(projects,groups);assert.equal(sorted.length,31);assert.equal(new Set(sorted.map(p=>p.id)).size,31);assert.equal(JSON.stringify(projects),before);for(const g of groups)assert.deepEqual(Array.from(sorted.filter(p=>p.projectGroupId===g.id),p=>p.id),projects.filter(p=>p.projectGroupId===g.id).map(p=>p.id));assert.deepEqual(Array.from(sorted,p=>groups.findIndex(g=>g.id===p.projectGroupId)),[...sorted].map(p=>groups.findIndex(g=>g.id===p.projectGroupId)).sort((a,b)=>a-b));assert.equal(h.state.writes,0);
});
test('ungrouped projects remain visible at the end; missing catalog preserves the full ordinary order',()=>{
 const h=harness(),projects=[{id:'unknown'},{id:'b',projectGroupId:'b'},{id:'none',projectGroupId:''},{id:'a',projectGroupId:'a'}];assert.deepEqual(Array.from(h.ctx.arrangeProjectsByGroup(projects,[{id:'a'},{id:'b'}]),p=>p.id),['a','b','unknown','none']);assert.deepEqual(Array.from(h.ctx.arrangeProjectsByGroup(projects,[]),p=>p.id),projects.map(p=>p.id));
});
test('grouping is enabled by default, toggle is remembered separately for each user mode',()=>{
 const h=harness();h.ctx.syncProjectsGroupSortPreference();assert.equal(h.ctx._projectsGroupSortOn,true);h.ctx.toggleProjectsGroupSort();assert.equal(h.ctx._projectsGroupSortOn,false);assert.equal(h.state.renders,1);h.state.scope='sasha';h.ctx.syncProjectsGroupSortPreference();assert.equal(h.ctx._projectsGroupSortOn,true);h.state.scope='fil';h.ctx.syncProjectsGroupSortPreference();assert.equal(h.ctx._projectsGroupSortOn,false);assert.equal(h.storage.size,1);
});
test('group colors affect only the sticky project cells, not calendar cells, and are installed once',()=>{
 const h=harness();h.ctx.ensureProjectsGroupRowStyle();h.ctx.ensureProjectsGroupRowStyle();assert.equal(h.styles.size,1);const css=[...h.styles.values()][0].textContent;assert.match(css,/>\.projects-sticky/);assert.doesNotMatch(css,/projects-scroll|cal-day|projects-cal/);assert.match(h.ctx.getProjectsGroupRowAttrs({id:'furniture',color:'#e0b856'}),/--projects-niche-tint:#e0b85618/);assert.doesNotMatch(h.ctx.getProjectsGroupRowAttrs({id:'bad',color:'red;display:none'}),/display:none/);
});
test('the header groups button sorts all rows rather than selecting a group filter',()=>{
 assert.doesNotMatch(source,/_projectsGroupFilter/);assert.match(source,/onclick="event\.stopPropagation\(\);toggleProjectsGroupSort\(\)"/);assert.match(source,/visibleProjects = arrangeProjectsByGroup/);assert.match(source,/setProjectsGroupSort\(false\);setProjectsTypeSortPriority\(null\)/);assert.match(source,/showProjEmojiPicker\(this/);
});
