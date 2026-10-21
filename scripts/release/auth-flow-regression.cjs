/* eslint-disable @typescript-eslint/no-require-imports -- Execute the unchanged guard with deterministic browser/session adapters. */
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
function compile(file,requireFn=require){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(requireFn,mod,mod.exports);return mod.exports;}
const store=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
global.window={localStorage:store(),sessionStorage:store(),location:{hash:''},addEventListener:()=>{},removeEventListener:()=>{}};
global.document={addEventListener:()=>{},removeEventListener:()=>{}};
const loginReturn=compile('src/app/lib/loginReturn.ts');
const security=compile('src/app/lib/sessionSecurity.ts'),roles=compile('src/app/lib/rolePermissions.ts');
async function scenario(start,signedIn,secure,reopened=false,options={}){let current=new URL(start,'https://test.invalid'),params=current.searchParams,session=signedIn?{user:{id:'test'}}:null,navigations=[],sessionCalls=0,releaseHydration,notifyAuth,signOuts=0;
 const navigate=url=>{navigations.push(url);current=new URL(url,'https://test.invalid');params=current.searchParams;};const router={push:navigate,replace:navigate,refresh:()=>{}};
 security.clearSecureBrowserSession();if(secure)security.startSecureBrowserSession("test");if(reopened)window.sessionStorage.removeItem("trimax.activeBrowserSession");
 const Guard=compile('src/app/components/AuthGuard.tsx',name=>name==='next/navigation'?{usePathname:()=>current.pathname,useSearchParams:()=>params,useRouter:()=>router}:name==='../lib/loginReturn'?loginReturn:name==='../lib/supabase'?{supabase:{auth:{getSession:async()=>{sessionCalls++;if((options.delay||options.stale)&&sessionCalls===1)return new Promise(resolve=>{releaseHydration=resolve;});return {data:{session:options.network||options.invalid?null:session},error:options.network?{status:503}:(options.invalid||options.invalidKeepSession)?{status:401}:null};},getUser:async()=>({data:{user:options.unverified?null:session?.user??null},error:options.verifyNetwork?{status:503}:null}),onAuthStateChange:callback=>{notifyAuth=callback;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{signOuts++;session=null;}}}}:name==='../lib/sessionSecurity'?security:name==='../lib/rolePermissions'?roles:name==='../lib/workspaceAccess'?{loadWorkspaceAccess:async()=>[{businessSlug:'rnl-creations',role:'owner'}],preferredWorkspaceSlug:()=> 'rnl-creations',canAccessWorkspace:(_access,slug)=>slug==='rnl-creations'}:name==='../lib/propertyAccess'?{}:name==='../lib/maintenanceMode'?{defaultMaintenanceSettings:()=>({enabled:false}),loadMaintenanceSettings:async()=>({enabled:false})}:require(name)).default;
 let tree;await renderer.act(async()=>{tree=renderer.create(React.createElement(Guard,null,'workspace'));});
 if(options.delay){assert.equal(navigations.length,0,'Hydration is pending, not signed out');assert(JSON.stringify(tree.toJSON()).includes('Opening workspace'));await renderer.act(async()=>releaseHydration({data:{session}}));}
 if(options.stale){current=new URL('/invoices?business=rnl-creations','https://test.invalid');params=current.searchParams;await renderer.act(async()=>tree.update(React.createElement(Guard,null,'workspace')));await renderer.act(async()=>releaseHydration({data:{session:null}}));assert.equal(navigations.length,0,'Stale hydration must not redirect the new route');}
 if(options.recovery||options.pendingSignIn){session={user:{id:'test'}};await renderer.act(async()=>notifyAuth(options.recovery?'PASSWORD_RECOVERY':'SIGNED_IN',session));assert.equal(signOuts,0,'Auth form must not revoke a session while its completion handler is establishing app state');assert.equal(navigations.length,0);}
 if(options.signOut){session=null;security.clearSecureBrowserSession();await renderer.act(async()=>notifyAuth('SIGNED_OUT',null));}
 const output=JSON.stringify(tree.toJSON());
 for(let i=0;i<5;i++)await renderer.act(async()=>{tree.update(React.createElement(Guard,null,'workspace'));});
 assert(navigations.length<=1,'Repeated redirects/login loop: '+navigations.join(' -> '));await renderer.act(async()=>tree.unmount());return{path:current.pathname,search:current.searchParams,navigations,output};
}
(async()=>{
 const destination='/admin/service-requests?business=rnl-creations&request=c27947e5-168e-4876-8110-620f8662a190';
 for(const session of [false,true]){const result=await scenario(destination,session,false);assert.equal(result.path,'/login');assert.equal(result.search.get('next'),destination);}
 const reopened=await scenario('/payments?business=rnl-creations',true,true,true);assert.equal(reopened.path,'/payments','A valid persisted Supabase session and live security lease must survive a new tab/PWA reopen');
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,true,{delay:true})).path,'/payments');
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,false,{stale:true})).path,'/invoices');
 const network=await scenario('/payments?business=rnl-creations',true,true,false,{network:true});assert.equal(network.navigations.length,0);assert(network.output.includes('could not be verified'));
 const verifyNetwork=await scenario('/payments?business=rnl-creations',true,true,true,{verifyNetwork:true});assert.equal(verifyNetwork.navigations.length,0);assert(verifyNetwork.output.includes('could not be verified'));
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,true,{unverified:true})).path,'/login');
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,false,{invalid:true})).path,'/login');
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,false,{signOut:true})).path,'/login');
 assert.equal((await scenario('/payments?business=rnl-creations',true,true,false,{invalidKeepSession:true})).path,'/login','A definitive invalid session is denied even if cached user data remains');
 assert.equal((await scenario('/reset-password?business=rnl-creations',false,false,false,{recovery:true})).path,'/reset-password');
 assert.equal((await scenario('/login?business=rnl-creations',false,false,false,{pendingSignIn:true})).path,'/login');
 const login='/login?business=rnl-creations&next='+encodeURIComponent(destination);
 const resumed=await scenario(login,true,true);assert.equal(resumed.navigations[0],destination);
 assert.equal((await scenario(login,false,false)).navigations.length,0);
 for(const unsafe of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/%5cevil.invalid','/login?next=/login','/forgot-password','/reset-password','/%0a/evil','/%ZZ'])assert.equal(loginReturn.safeLoginReturn(unsafe),null,unsafe);
 assert.equal(loginReturn.loginUrl('/login',new URL(login,'https://test.invalid').searchParams.toString(),'idle-timeout').includes('next=%2Fadmin'),true);
 assert.equal((await scenario('/login',true,true)).path,'/');assert.equal((await scenario('/?business=rnl-creations',false,false)).path,'/login');assert.equal((await scenario('/?business=rnl-creations',true,false)).path,'/login');assert.equal((await scenario('/?business=rnl-creations',true,true)).navigations.length,0);console.log('Auth guard login/expiry/remount redirect-loop checks PASS; deterministic adapters, not physical PWA acceptance');})().catch(e=>{console.error(e);process.exitCode=1;});

