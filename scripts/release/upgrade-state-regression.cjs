/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic identities only; no production mutation. */
const assert=require('node:assert/strict');
const {digest}=require('./contract.cjs');
const {classify,identity}=require('./runtime-evidence.cjs');
const {verifyWeb}=require('./upgrade-context.cjs');
const config={supabaseUrl:'https://project.supabase.co',businessId:'business'};
const candidate={releaseId:'rc10',components:{web:{commit:'new'},legacy:{commit:'new'},'v2-shadow':{commit:'new'}},sourceBundle:{sha256:'new-source'},modelBundle:{sha256:'models'},runtimeSources:{sha256:'runtime'},supabaseProjectId:'project',workerConfiguration:{businessId:'business',configHashes:{legacy:digest(config),'v2-shadow':digest(config)}},database:{fingerprints:Object.fromEntries(['schema','rpc','triggers','policies','grants'].map(k=>[k,{sha256:k}])),flags:[]}};
const prior=structuredClone(candidate);prior.releaseId='rc9';prior.sourceBundle.sha256='old-source';Object.values(prior.components).forEach(c=>c.commit='old');
const record=(m,e)=>({...identity(m,e),validatedAt:new Date().toISOString()});
const web=m=>({url:'https://app.rnlcreations.com/admin/ocr-attempts?business=rnl-creations',method:'authenticated-release-diagnostics',observedAt:new Date().toISOString(),releaseId:m.releaseId,sourceCommit:m.components.web.commit,modelBundle:'models',databaseFingerprint:'schema'});
const pre={mode:'PREDEPLOYMENT',currentProductionRelease:prior,servingWeb:web(prior)};
const body=(e,m=prior)=>({...candidate.database,businessId:'business',engine:e,credentialScope:'ocr-only',legacyRelease:record(m,'legacy'),v2Release:null});
const run=(e,b,ctx=pre,cfg=config)=>classify(candidate,e,cfg,{status:200,body:b},ctx).runtime.status;
assert.equal(run('legacy',body('legacy')),'DEPLOYMENT_PREREQUISITE','approved rc9 before cutover');
for(const field of ['releaseId','sourceCommit','sourceBundle','modelBundle','runtimeSources','databaseFingerprint']){const b=body('legacy');b.legacyRelease[field]='tampered';assert.equal(run('legacy',b),'FAIL',field);}
assert.equal(run('legacy',body('legacy'),{...pre,servingWeb:web(candidate)}),'FAIL','prior must agree with serving web');
assert.equal(run('legacy',body('legacy'),{mode:'POSTDEPLOYMENT',servingWeb:web(candidate)}),'FAIL','prior after cutover');
for(const e of ['legacy','v2-shadow']){const b=body(e,candidate);b.v2Release=record(candidate,'v2-shadow');assert.equal(run(e,b,{mode:'POSTDEPLOYMENT',servingWeb:web(candidate)}),'PASS');}
assert.equal(run('v2-shadow',body('v2-shadow')),'DEPLOYMENT_PREREQUISITE');
assert.equal(run('v2-shadow',body('v2-shadow'),{mode:'POSTDEPLOYMENT'}),'FAIL');
const badModel=body('legacy',candidate);badModel.legacyRelease.modelBundle='wrong';assert.equal(run('legacy',badModel),'FAIL');
assert.equal(run('legacy',body('legacy',candidate),pre,{...config,pollMs:1}),'FAIL','changed config');
for(const e of ['legacy','v2-shadow']){const b=body('legacy',candidate);b.v2Release=record(candidate,'v2-shadow');b[e==='legacy'?'legacyRelease':'v2Release'].paymentWriteCapability=true;assert.equal(run('legacy',b),'FAIL','payment capability anywhere');}
assert.deepEqual(verifyWeb(prior,web(prior)),[]);
assert(verifyWeb(candidate,web(prior)).length);
assert(verifyWeb(prior,{...web(prior),observedAt:'2000-01-01'}).length);
assert(verifyWeb(prior,{...web(prior),method:'local-build'}).length);
// Exercise platform-to-committed-manifest binding, not just identity strings.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),c=require('./contract.cjs');
const real=c.read(path.join(c.root,'release/trimax-release-manifest.json'));
const approval=real.upgradeContext.currentProductionRelease;
const platform={method:'authenticated-vercel-production-deployment',url:'https://vercel.com/trimax-s-projects/trimax/'+approval.deploymentId,observedAt:new Date().toISOString(),alias:'app.rnlcreations.com',state:'Ready',environment:'Production',latest:true,deploymentCommit:approval.deploymentCommit,deploymentId:approval.deploymentId};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-upgrade-test-')),file=path.join(dir,'synthetic-web.json'),old=process.env.TRIMAX_SERVING_WEB_EVIDENCE;
try{process.env.TRIMAX_SERVING_WEB_EVIDENCE=file;fs.writeFileSync(file,JSON.stringify(platform));assert.equal(require('./upgrade-context.cjs').load(real,'PREDEPLOYMENT').servingWeb.releaseId,approval.releaseId);
 for(const patch of [{latest:false},{state:'Error'},{alias:'preview.example'},{deploymentCommit:'0'.repeat(40)},{observedAt:'2000-01-01'}]){fs.writeFileSync(file,JSON.stringify({...platform,...patch}));assert.throws(()=>require('./upgrade-context.cjs').load(real,'PREDEPLOYMENT'));}
}finally{if(old===undefined)delete process.env.TRIMAX_SERVING_WEB_EVIDENCE;else process.env.TRIMAX_SERVING_WEB_EVIDENCE=old;fs.unlinkSync(file);fs.rmdirSync(dir);}
console.log('PASS nine upgrade cases, strict postdeployment, prior approval/serving identity, stale web proof, configuration and cross-worker payment denial');
