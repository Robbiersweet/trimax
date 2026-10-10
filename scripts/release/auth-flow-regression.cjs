/* eslint-disable @typescript-eslint/no-require-imports -- Execute the unchanged guard with deterministic browser/session adapters. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,requireFn=require){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(requireFn,mod,mod.exports);return mod.exports;}
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
global.window={localStorage:store(),sessionStorage:store(),location:{hash:''},addEventListener:()=>{},removeEventListener:()=>{}};
global.document={addEventListener:()=>{},removeEventListener:()=>{}};
const security=compile('src/app/lib/sessionSecurity.ts'),roles=compile('src/app/lib/rolePermissions.ts');
async function scenario(start,signedIn,secure){let current=new URL(start,'https://test.invalid'),params=current.searchParams,session=signedIn?{user:{id:'test'}}:null,navigations=[];
 const navigate=url=>{navigations.push(url);current=new URL(url,'https://test.invalid');params=current.searchParams;};const router={push:navigate,replace:navigate,refresh:()=>{}};
 security.clearSecureBrowserSession();if(secure)security.startSecureBrowserSession();
 const Guard=compile('src/app/components/AuthGuard.tsx',name=>name==='next/navigation'?{usePathname:()=>current.pathname,useSearchParams:()=>params,useRouter:()=>router}:name==='../lib/supabase'?{supabase:{auth:{getSession:async()=>({data:{session}}),signOut:async()=>{session=null;}}}}:name==='../lib/sessionSecurity'?security:name==='../lib/rolePermissions'?roles:name==='../lib/workspaceAccess'?{loadWorkspaceAccess:async()=>[{businessSlug:'rnl-creations',role:'owner'}],preferredWorkspaceSlug:()=> 'rnl-creations',canAccessWorkspace:(_access,slug)=>slug==='rnl-creations'}:name==='../lib/propertyAccess'?{}:name==='../lib/maintenanceMode'?{defaultMaintenanceSettings:()=>({enabled:false}),loadMaintenanceSettings:async()=>({enabled:false})}:require(name)).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Guard,null,'workspace'));});
 for(let i=0;i<5;i++)await renderer.act(async()=>{tree.update(React.createElement(Guard,null,'workspace'));});
 assert(navigations.length<=1,'Repeated redirects/login loop: '+navigations.join(' -> '));await renderer.act(async()=>tree.unmount());return{path:current.pathname,navigations};
}
(async()=>{assert.equal((await scenario('/login',true,true)).path,'/');assert.equal((await scenario('/?business=rnl-creations',false,false)).path,'/login');assert.equal((await scenario('/?business=rnl-creations',true,false)).path,'/login');assert.equal((await scenario('/?business=rnl-creations',true,true)).navigations.length,0);console.log('Auth guard login/expiry/remount redirect-loop checks PASS; deterministic adapters, not physical PWA acceptance');})().catch(e=>{console.error(e);process.exitCode=1;});
