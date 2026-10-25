/* eslint-disable @typescript-eslint/no-require-imports -- Executes real TSX against isolated synthetic adapters. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let records=[{id:'n1',request_id:'r1',customer_name:'Synthetic Customer',request_type:'Repair',submitted_at:'2026-10-17T00:00:00Z',read_at:null}],role='owner',onAuth,tick,fail=false;
const supabase={auth:{getUser:async()=>({data:{user:{id:'u1'}}}),onAuthStateChange:cb=>{onAuth=cb;return{data:{subscription:{unsubscribe(){}}}}}},from:()=>{let update,head=false;const q={select:(_s,o)=>{head=!!o?.head;return q},eq:()=>q,is:()=>q,order:()=>q,range:()=>q,update:v=>{update=v;return q},then:(resolve,reject)=>Promise.resolve(fail?{error:{}}:update?(records[0].read_at?{data:[]}:(records[0].read_at=update.read_at,{data:[{id:'n1',read_at:update.read_at}]})):head?{count:records.filter(r=>!r.read_at).length}:{data:records.map(r=>({...r}))}).then(resolve,reject)};return q}};
global.window={setInterval:fn=>{tick=fn;return 1},addEventListener(){},removeEventListener(){}};global.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const filename=path.resolve('src/app/components/SchedulingNotifications.tsx');const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=module.paths;loaded.require=id=>id==='next/link'?{default:({children,...props})=>React.createElement('a',props,children)}:id==='../lib/supabase'?{supabase}:id==='../lib/workspaceAccess'?{loadWorkspaceAccess:async()=>[{businessSlug:'rnl-creations',businessId:'b1',role}]}:require(id);
loaded._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const Component=loaded.exports.default;const text=r=>JSON.stringify(r.toJSON());
(async()=>{let root;await act(async()=>{root=create(React.createElement(Component,{business:'rnl-creations'}));});assert.match(text(root),/1/);
await act(async()=>root.root.findByType('button').props.onClick());const link=root.root.findAllByType('a').find(a=>a.props.href.includes('/admin/service-requests?'));assert.ok(root.root.findAllByType('a').some(a=>a.props.href==='/admin/communications?business=rnl-creations'));assert.equal(link.props.href,'/admin/service-requests?business=rnl-creations&request=r1');assert.match(text(root),/Synthetic Customer/);
await act(async()=>root.root.findAllByType('button')[1].props.onClick());assert.ok(records[0].read_at);assert.equal(root.root.findAllByType('button').filter(b=>b.props.children==='Mark as read').length,0);
await act(async()=>root.unmount());await act(async()=>{root=create(React.createElement(Component,{business:'rnl-creations'}));});assert.match(text(root),/0/);
records.push({...records[0],id:'n2',request_id:'r2',read_at:null});await act(async()=>tick());assert.match(text(root),/1/);
await act(async()=>onAuth('SIGNED_OUT'));assert.equal(root.toJSON(),null);await act(async()=>root.unmount());
role='manager';await act(async()=>{root=create(React.createElement(Component,{business:'rnl-creations'}));});assert.equal(root.toJSON(),null);await act(async()=>root.unmount());
role='owner';fail=true;await act(async()=>{root=create(React.createElement(Component,{business:'rnl-creations'}));});assert.match(text(root),/Notifications unavailable/);assert.doesNotMatch(text(root),/Synthetic Customer/);await act(async()=>root.unmount());
console.log('PASS notification UI: unread, direct link, persisted read/remount, polling, logout, manager denial, storage failure');
})().catch(e=>{console.error(e);process.exitCode=1});

