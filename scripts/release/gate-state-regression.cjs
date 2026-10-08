/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic state-machine tests; not deployed evidence. */
const assert=require('node:assert/strict');
const {mode,requiredChecks,evaluate,authorize}=require('./gate-state.cjs');
const {classify,aggregate}=require('./runtime-evidence.cjs');
const corpus={documents:[{id:'fictional'}]};
const manifest={releaseId:'r',acceptance:{sha256:'truth'},components:{legacy:{commit:'c'},'v2-shadow':{commit:'c'}},sourceBundle:{sha256:'source'},modelBundle:{sha256:'models'},runtimeSources:{sha256:'libraries'},supabaseProjectId:'project',workerConfiguration:{businessId:'business'},database:{fingerprints:Object.fromEntries(['schema','rpc','triggers','policies','grants'].map(k=>[k,{sha256:k}])),flags:[]}};
const base=()=>({mode:mode('predeployment'),releaseId:'r',sourceBundle:'source',corpusHash:'truth',finishedAt:new Date().toISOString(),checks:requiredChecks(corpus).map(name=>({name,status:['production-runtime-attestation','live-database-attestation'].includes(name)?'DEPLOYMENT_PREREQUISITE':'PASS',failures:[]})),retained:[{id:'fictional',status:'PASS',failures:[]}]});
function receipt(r){return{...r,...evaluate(r,corpus)};}
for(const name of ['lint','production-runtime-attestation','live-database-attestation']){const r=base();r.checks.find(c=>c.name===name).status='FAIL';assert.equal(evaluate(r,corpus).status,'FAIL',name);}
let r=base();r.retained[0].status='FAIL';assert.equal(evaluate(r,corpus).status,'FAIL','B retained failure');
r=receipt(base());assert.equal(r.status,'READY_FOR_CONTROLLED_DEPLOYMENT','C absent deployment evidence');assert.deepEqual(authorize(manifest,r,corpus,'source'),[],'H sealed controlled deployment');
assert(authorize(manifest,r,corpus,'changed').length);assert(authorize(manifest,{...r,releaseId:'other'},corpus,'source').length);assert(authorize(manifest,r,corpus,'source',['dirty']).length);
assert(authorize(manifest,{...r,status:'FAIL'},corpus,'source').length,'G ordinary FAIL');
for(const name of ['lint','production-runtime-attestation']){const forged=structuredClone(r);forged.checks=forged.checks.filter(c=>c.name!==name);assert(authorize(manifest,forged,corpus,'source').length,'Missing checks denied');}
let post=base();post.mode=mode('postdeployment');assert.equal(evaluate(post,corpus).status,'FAIL','Missing postdeployment evidence');post.checks.forEach(c=>c.status='PASS');post=receipt(post);assert.equal(post.status,'PASS','F postdeploy evidence');assert.deepEqual(authorize(manifest,post,corpus,'source'),[]);
assert.equal(post.physicalAcceptance,'PHYSICAL_ACCEPTANCE_PENDING','I');assert(authorize(manifest,{...post,physicalAcceptance:'PHYSICAL_ACCEPTANCE_PASSED'},corpus,'source').length);
assert.throws(()=>mode(undefined));assert.throws(()=>mode('relaxed'));
const config={supabaseUrl:'https://project.supabase.co',businessId:'business'};
const release=engine=>({releaseId:'r',engine,sourceCommit:'c',sourceBundle:'source',modelBundle:'models',runtimeSources:'libraries',databaseFingerprint:'schema',paymentWriteCapability:false,validatedAt:new Date().toISOString()});
const body=engine=>({...manifest.database,businessId:'business',engine,credentialScope:'ocr-only',legacyRelease:release('legacy'),v2Release:release('v2-shadow')});
for(const engine of ['legacy','v2-shadow']){
 const original=body(engine),key=engine==='legacy'?'legacyRelease':'v2Release';
 assert.equal(classify(manifest,engine,config,{status:200,body:original}).runtime.status,'PASS');
 const absent=structuredClone(original);delete absent[key];assert.equal(classify(manifest,engine,config,{status:200,body:absent}).runtime.status,'DEPLOYMENT_PREREQUISITE');
 for(const field of ['releaseId','engine','sourceCommit','sourceBundle','modelBundle','runtimeSources','databaseFingerprint','paymentWriteCapability','validatedAt']){const changed=structuredClone(original);changed[key][field]='wrong';assert.equal(classify(manifest,engine,config,{status:200,body:changed}).runtime.status,'FAIL',field);}
 const db=structuredClone(original);db.fingerprints.schema.sha256='bad';assert.equal(classify(manifest,engine,config,{status:200,body:db}).database.status,'FAIL');
 for(const field of ['businessId','credentialScope'])assert.equal(classify(manifest,engine,config,{status:200,body:{...original,[field]:'bad'}}).database.status,'FAIL');
 assert.equal(classify(manifest,engine,{...config,supabaseUrl:'https://other.supabase.co'},{status:200,body:original}).runtime.status,'FAIL');
 assert.equal(classify(manifest,engine,config,{status:404,body:{code:'PGRST202'}}).database.status,'DEPLOYMENT_PREREQUISITE');
 for(const status of [401,403,503,520])assert.equal(classify(manifest,engine,config,{status,body:{}}).runtime.status,'FAIL');
 assert.equal(classify(manifest,engine,config,{error:'timeout'}).runtime.status,'FAIL');
}
assert.equal(aggregate([{engine:'legacy',runtime:{status:'PASS'}},{engine:'v2-shadow',runtime:{status:'FAIL',failures:['mismatch']}}],'runtime').status,'FAIL');
console.log('PASS A-I gate modes, exact receipt authorization, missing/duplicate checks, actual deployed identity vs local validation, DB/project/scope/hash mismatch and physical separation');
