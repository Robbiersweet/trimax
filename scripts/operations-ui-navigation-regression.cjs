/* eslint-disable @typescript-eslint/no-require-imports -- Executes the actual component against isolated navigation adapters. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const req=require;
const ts=req('typescript'),React=req('react'),{create,act}=req('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const storage=new Map();
global.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const calls=[];
const router={back:()=>calls.push('back'),replace:path=>calls.push(path)};
const origin='https://app.rnlcreations.com';
function compile(file, adapters={}){
 const full=path.resolve(file),mod=new Module(full,module);
 mod.filename=full;mod.paths=Module._nodeModulePaths(path.dirname(full));
 mod.require=id=>Object.hasOwn(adapters,id)?adapters[id]:req(id);
 mod._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,full);
 return mod.exports;
}
const stack='trimax.routeStack',other='trimax.previousRoute';
const Back=compile('src/app/components/BackButton.tsx',{'next/navigation':{useRouter:()=>router},'./NavigationHistoryTracker':{trimaxRouteStackKey:stack,previousTrimaxRouteKey:other}}).default;
async function test(current,history,stacked,expected,fallback='/queue?business=rnl-creations'){
 storage.set(stack,JSON.stringify(stacked));calls.length=0;
 global.window={location:new URL(current,origin)};
 if(history)window.navigation={currentEntry:{index:1},entries:()=>[{index:0,url:history},{index:1,url:origin+current}]};
 let root;
 await act(async()=>{root=create(React.createElement(Back,{fallbackHref:fallback}));});
 await act(async()=>root.root.findByType('button').props.onClick());
 assert.deepEqual(calls,[expected]);
 await act(async()=>root.unmount());
}
(async()=>{
 const detail='/queue/item?business=rnl-creations', list='/queue?business=rnl-creations&view=history';
 await test(detail,origin+list,[list,detail],'back');
 await test(detail,'https://example.org/outside',[list,detail],list);
 await test(detail,origin+'/queue?business=other',[list,detail],list);
 await test(detail,origin+'/login?business=rnl-creations',[detail],'/queue?business=rnl-creations');
 await test(detail,null,[list,detail],list);
 await test(detail,null,['/\\evil.example','/queue?business=other',detail],'/queue?business=rnl-creations');
 const role=compile('src/app/lib/rolePermissions.ts');
 for(const name of ['owner','admin','property_manager']){
  assert.equal(role.canAccessPath(name,'/queue'),true);
  assert.equal(role.canAccessPath(name,'/calendar'),true);
 }
 for(const name of ['owner','admin']) assert.equal(role.canAccessPath(name,'/admin/service-requests'),true);
 assert.equal(role.canAccessPath('property_manager','/invoices'),false);
 assert.equal(role.canAccessPath('property_manager','/admin/service-requests'),false);
 console.log('PASS six real Back component interactions and three role navigation checks');
})().catch(e=>{console.error(e);process.exitCode=1});

