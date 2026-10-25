const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const root=path.resolve(__dirname,'..');
let ts;try{ts=require('typescript');}catch{ts=require('C:/Users/robbi/.codex/worktrees/workflow-upgrade/trimax/node_modules/typescript');}
function load(file,mocks={}){const m=new Module(file,module);m.filename=file;m.paths=module.paths;m.require=id=>id in mocks?mocks[id]:require(id);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
const boundary=load(path.join(root,'sites/rnl/lib/isolatedLabBoundary.ts'));
const env={VERCEL:'1',VERCEL_ENV:'preview',RNL_ISOLATED_INTAKE_ENABLED:'enabled',VERCEL_URL:'synthetic.vercel.app',RNL_ISOLATED_INTAKE_ORIGIN:'https://synthetic.vercel.app',RNL_ISOLATED_INTAKE_SLUG:'trimax-acceptance-20261026-a',RNL_ISOLATED_FINGERPRINT_SECRET:'x'.repeat(40),RNL_SCHEDULING_DATABASE_URL:`postgres://trimax_lab_website_intake_20261025.yzyfmvoswucyauogueca:${'x'.repeat(40)}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`};
const request=new Request(env.RNL_ISOLATED_INTAKE_ORIGIN+'/api/public-scheduling/'+env.RNL_ISOLATED_INTAKE_SLUG,{method:'POST',headers:{origin:env.RNL_ISOLATED_INTAKE_ORIGIN}});
assert.ok(boundary.isolatedLabRequest(request,env));
const defaultOrigin={...env,RNL_ISOLATED_INTAKE_ORIGIN:undefined};
assert.ok(boundary.isolatedLabRequest(request,defaultOrigin));
for(const patch of [{VERCEL_URL:undefined},{VERCEL_URL:'synthetic.vercel.app/path'},{VERCEL_URL:'https://synthetic.vercel.app'},{VERCEL_URL:'rnlcreations.com'},{VERCEL_ENV:'production'},{RNL_ISOLATED_INTAKE_ORIGIN:'https://other.vercel.app'}])assert.equal(boundary.isolatedLabRequest(request,{...defaultOrigin,...patch}),null);
for(const patch of [{VERCEL_ENV:'production'},{RNL_ISOLATED_INTAKE_ENABLED:undefined},{VERCEL_URL:'other.vercel.app'},{RNL_ISOLATED_INTAKE_SLUG:'rnl-creations'},{RNL_ISOLATED_INTAKE_ORIGIN:'https://rnlcreations.com'},{RNL_SCHEDULING_DATABASE_URL:env.RNL_SCHEDULING_DATABASE_URL.replace('yzyfmvoswucyauogueca','gqknefosisnsjuzmhvts')},{RNL_SCHEDULING_DATABASE_URL:env.RNL_SCHEDULING_DATABASE_URL.replace('trimax_lab_website_intake_20261025','postgres')},{RNL_SCHEDULING_DATABASE_URL:env.RNL_SCHEDULING_DATABASE_URL+'?sslmode=disable'}])assert.equal(boundary.isolatedLabRequest(request,{...env,...patch}),null);
assert.equal(boundary.isolatedLabRequest(new Request(request.url,{headers:{origin:'https://other.vercel.app'}}),env),null);
assert.equal(boundary.isolatedLabRequest(new Request('https://other.vercel.app/test',{headers:{origin:env.RNL_ISOLATED_INTAKE_ORIGIN}}),env),null);
(async()=>{
 const old={...process.env};Object.assign(process.env,env);
 let calls=0,queries=[],badScope=false,conflict=false,pools=0;
 const direct=load(path.join(root,'sites/rnl/lib/credentialLifecycle/directIntegrationReview.ts'),{'server-only':{}});
 class Pool{constructor(options){pools++;assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.ca,process.env.RNL_ISOLATED_DB_CA_PEM);}on(){}async connect(){return {query:async(sql,values)=>{queries.push(sql);if(sql.startsWith('SELECT current_user'))return {rows:[{role:boundary.labRole,session_role:boundary.labRole,safe_role:true,no_memberships:true,required_rpcs:true,no_other_rpcs:!badScope,no_tables:true,no_create:true}]};if(sql.includes(' result')){if(conflict)throw Error('Idempotency conflict');calls++;return {rows:[{result:{ok:true}}]};}return {rows:[]};},release(){}};}}
 const mod=load(path.join(root,'sites/rnl/lib/isolatedLabRuntime.ts'),{'server-only':{},pg:{Pool},'./isolatedLabBoundary.ts':boundary,'./credentialLifecycle/directIntegrationReview.ts':direct});
 assert.ok(mod.labScopeSql.includes("r.rolname='trimax_scheduling_web'"));assert.ok(!mod.labScopeSql.includes('NOT rolinherit'));
 delete process.env.RNL_ISOLATED_DB_CA_PEM;assert.throws(()=>mod.isolatedLabRuntime(),/LAB_CA_REJECTED/);
 for(const ca of ['invalid','-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----',require('node:tls').rootCertificates[0].replaceAll('\n','\\n')]){process.env.RNL_ISOLATED_DB_CA_PEM=ca;assert.throws(()=>mod.isolatedLabRuntime(),/LAB_CA_REJECTED/);}assert.equal(pools,0);
 process.env.RNL_ISOLATED_DB_CA_PEM=require('node:tls').rootCertificates[0];
 const runtime=mod.isolatedLabRuntime();
 assert.equal((await runtime.client.rpc('trimax_public_scheduling_config',{p_slug:env.RNL_ISOLATED_INTAKE_SLUG})).error,null);assert.equal(calls,1);
 await assert.rejects(()=>runtime.client.rpc('trimax_public_scheduling_config',{p_slug:'rnl-creations'}));
 await assert.rejects(()=>runtime.client.rpc('other',{}));
 const args={p_slug:env.RNL_ISOLATED_INTAKE_SLUG,p_payload:{email:'real@example.com'},p_idempotency_hash:'a'.repeat(64),p_capability_hash:'b'.repeat(64)};
 await assert.rejects(()=>runtime.client.rpc('trimax_submit_public_service_request',args));assert.equal(calls,1);
 args.p_payload.email='trimax-acceptance-20261026-customer-a@example.invalid';await runtime.client.rpc('trimax_submit_public_service_request',args);assert.equal(calls,2);
 badScope=true;assert.ok((await runtime.client.rpc('trimax_public_scheduling_config',{p_slug:env.RNL_ISOLATED_INTAKE_SLUG})).error);assert.equal(calls,2);assert.ok(queries.includes('ROLLBACK'));badScope=false;conflict=true;assert.equal((await runtime.client.rpc('trimax_submit_public_service_request',args)).error.message,'Idempotency conflict');conflict=false;
 assert.equal((await runtime.config.providers.challenge.verify({token:'real-token'})).verified,false);assert.equal((await runtime.config.providers.challenge.verify({token:'isolated-lab-synthetic'})).verified,true);
 for(let n=0;n<5;n++)assert.equal((await runtime.config.providers.rateLimit.consume({key:'synthetic',limit:5,windowSeconds:600})).allowed,true);
 assert.equal((await runtime.config.providers.rateLimit.consume({key:'synthetic',limit:5,windowSeconds:600})).allowed,false);
 let handled=0,selected;
 const route=load(path.join(root,'sites/rnl/app/api/public-scheduling/[slug]/route.ts'),{
  '../../../../.shared/lib/publicScheduling/productionHandler.ts':{productionSubmission:async(req,slug,factory)=>{handled++;selected=factory;assert.equal(req.headers.get('origin'),env.RNL_ISOLATED_INTAKE_ORIGIN);if(process.env.VERCEL_ENV==='preview')assert.equal(req.headers.get('x-turnstile-token'),'isolated-lab-synthetic');return Response.json({ok:true},{status:201});}},
  '../../../../lib/submissionRuntime.ts':{websiteSubmissionRuntime:()=>{throw Error('Production must not be selected by lab');}},
  '../../../../lib/isolatedLabBoundary.ts':boundary,'../../../../lib/isolatedLabRuntime.ts':mod});
 assert.equal((await route.POST(request,{params:Promise.resolve({slug:env.RNL_ISOLATED_INTAKE_SLUG})})).status,201);assert.equal(selected,mod.isolatedLabRuntime);
 assert.equal((await route.POST(request,{params:Promise.resolve({slug:'rnl-creations'})})).status,404);
 process.env.RNL_ISOLATED_INTAKE_ENABLED='disabled';assert.equal((await route.POST(request,{params:Promise.resolve({slug:env.RNL_ISOLATED_INTAKE_SLUG})})).status,503);assert.equal(handled,1);
 process.env=old;console.log('PASS exact isolated project/origin/role boundary, two RPC scope, synthetic identities, fail-closed SQL privilege checks, simulated providers; no network');
})().catch(e=>{console.error(e);process.exitCode=1});
