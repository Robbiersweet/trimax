/* eslint-disable @typescript-eslint/no-require-imports -- Execute route boundaries with isolated dependencies, never hosted writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function compile(file,resolve){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(resolve,m,m.exports);return m.exports;}
const runtime=compile('src/app/lib/publicScheduling/workflowRuntime.ts',()=>{throw Error('Unexpected dependency');});
const origin='https://trimax-lab-example.vercel.app',env={VERCEL_ENV:'preview',SERVICE_REQUEST_WORKFLOW_ENABLED:'enabled',WORKFLOW_ISOLATED_TEST_ADAPTER:'enabled',WORKFLOW_ISOLATED_TEST_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:'https://yzyfmvoswucyauogueca.supabase.co'};
const request=(url=origin,header=origin)=>new Request(url+'/api/public-scheduling/workflow?business=synthetic',{method:'POST',headers:header?{origin:header}:{}});
assert.equal(runtime.workflowWritesAllowed(request(),env),true);
for(const changes of [{WORKFLOW_ISOLATED_TEST_ADAPTER:undefined},{SERVICE_REQUEST_WORKFLOW_ENABLED:undefined},{NEXT_PUBLIC_SUPABASE_URL:'https://gqknefosisnsjuzmhvts.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'https://differentproject.supabase.co'},{WORKFLOW_ISOLATED_TEST_ORIGIN:'https://app.rnlcreations.com'},{WORKFLOW_ISOLATED_TEST_ORIGIN:origin+'/'},{WORKFLOW_ISOLATED_TEST_ORIGIN:'http://trimax-lab-example.vercel.app'}])assert.equal(runtime.workflowWritesAllowed(request(),{...env,...changes}),false);
assert.equal(runtime.workflowWritesAllowed(request(origin,null),env),false);assert.equal(runtime.workflowWritesAllowed(request(origin,'https://evil.vercel.app'),env),false);assert.equal(runtime.workflowWritesAllowed(request('https://evil.vercel.app'),env),false);
assert.equal(runtime.workflowWritesAllowed(request(),{VERCEL_ENV:'production',SERVICE_REQUEST_WORKFLOW_ENABLED:'enabled'}),true);
(async()=>{for(const name of ['workflow','blocks']){
 let ownerCalls=0,mutationCalls=0,authorized=false;
 const route=compile(`src/app/api/public-scheduling/${name}/route.ts`,id=>{
  if(id.endsWith('/workflowRuntime'))return {workflowWritesAllowed:r=>runtime.workflowWritesAllowed(r,env)};
  if(id.endsWith('/productionOwner'))return {productionOwner:async()=>{ownerCalls++;if(!authorized)throw Error('Owner required');return {workflow:async()=>{mutationCalls++;return {saved:true};},block:async()=>{mutationCalls++;return 'fixture';}};}};
  if(id.endsWith('/httpBody'))return {readBoundedJson:async()=>({label:'Synthetic',start:'2026-11-01T10:00:00Z',end:'2026-11-01T11:00:00Z'})};
  if(id.endsWith('/workflow'))return {validateWorkflowChange:v=>v};throw Error(id);
 });
 assert.equal((await route.POST(request(origin,null))).status,403);assert.equal(ownerCalls,0);assert.equal(mutationCalls,0);
 assert.equal((await route.POST(request())).status,409);assert.equal(ownerCalls,1);assert.equal(mutationCalls,0);
 authorized=true;assert.equal((await route.POST(request())).status,200);assert.equal(mutationCalls,1);
}console.log('PASS isolated preview project/origin/flag denial and actual route owner-auth boundary; no hosted writes');})().catch(e=>{console.error(e);process.exitCode=1});
