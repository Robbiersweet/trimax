/* eslint-disable @typescript-eslint/no-require-imports -- One release gate; outputs private, never deploys or changes production. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const c=require('./contract.cjs');
const state=require('./gate-state.cjs');
const modeArg=process.argv.slice(2);if(modeArg.length!==1||!modeArg[0].startsWith('--mode='))throw Error('Explicit gate mode required');
const gateMode=state.mode(modeArg[0].slice(7));
const {evidenceMetrics}=require('./evidence-metrics.cjs');
const manifest=c.read(path.join(c.root,'release/trimax-release-manifest.json')),corpus=c.read(path.join(c.root,manifest.acceptance.corpus));
const base=process.env.TRIMAX_RELEASE_OUTPUT_ROOT||path.join(process.env.LOCALAPPDATA||os.tmpdir(),'Trimax','release-gates');
if(path.resolve(base).startsWith(c.root+path.sep))throw Error('Gate evidence must remain outside Git');
const out=path.join(base,new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
const report={mode:gateMode,releaseId:manifest.releaseId,startedAt:new Date().toISOString(),sourceCommit:c.git(['rev-parse','HEAD']),sourceBundle:c.digest(c.sourceHashes()),corpusHash:manifest.acceptance.sha256,out,checks:[],retained:[],physicalAcceptance:'PHYSICAL_ACCEPTANCE_PENDING',productionMutations:false};
const save=()=>fs.writeFileSync(path.join(out,'gate-result.json'),JSON.stringify(report,null,2));
function record(name,failures,extra={}){report.checks.push({name,status:failures.length?'FAIL':'PASS',failures,...extra});save();console.log(name,report.checks.at(-1).status);}
function run(name,command,args,timeout=300000){const start=Date.now(),r=cp.spawnSync(command,args,{cwd:c.root,encoding:'utf8',windowsHide:true,timeout,maxBuffer:16000000,env:{...process.env,HF_HUB_OFFLINE:'1'}});fs.writeFileSync(path.join(out,name.replace(/[^a-z0-9-]/gi,'_')+'.log'),(r.stdout||'')+'\n'+(r.stderr||'')+'\n'+(r.error?.message||''));record(name,r.status===0?[]:[r.error?.message||'Exit '+r.status],{durationMs:Date.now()-start});return r;}
record('clean-manifest-source-start',c.localFailures(manifest));
record('frozen-corpus-integrity',c.hash(fs.readFileSync(path.join(c.root,manifest.acceptance.corpus)))===manifest.acceptance.sha256?[]:['Corpus changed']);
run('clean-dependency-install',process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm ci']:['ci'],600000);
record('model-bundle',c.verifyModels(manifest,'v2-shadow',manifest.workerConfiguration));
record('runtime-source-bundles',c.verifyRuntimeSources(manifest,'v2-shadow',manifest.workerConfiguration));
const attestationFile=path.join(out,'runtime-attestation.json');
const live=cp.spawnSync(process.execPath,['scripts/release/runtime-check.cjs',attestationFile],{cwd:c.root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4000000});
fs.writeFileSync(path.join(out,'runtime-attestation.log'),(live.stdout||'')+'\n'+(live.stderr||''));
let attestation;try{if(![0,1,2].includes(live.status))throw Error('Attestation probe failed');attestation=c.read(attestationFile);}catch{attestation={database:{status:'FAIL',failures:['Attestation probe unavailable']},runtime:{status:'FAIL',failures:['Attestation probe unavailable']}};}
for(const [name,key] of [['production-runtime-attestation','runtime'],['live-database-attestation','database']])record(name,attestation[key].failures,attestation[key]);
const scripts=require('./gate-checks.cjs');
const sqlRuntime=process.env.TRIMAX_SQL_TEST_RUNTIME||path.join(process.env.LOCALAPPDATA,'Trimax','phase6-dbtest');
try{const file=path.join(sqlRuntime,'node_modules/@electric-sql/pglite/package.json');record('sql-test-runtime',c.hash(fs.readFileSync(file))===manifest.testRuntime.pglitePackageSha256?[]:['PGlite runtime hash mismatch']);}catch{record('sql-test-runtime',['Pinned PGlite runtime unavailable']);}
for(const file of scripts){const args=['--experimental-strip-types',file];if(['ocr-evidence-persistence-regression.cjs','canonical-sql-regression.cjs','shadow-sql-regression.cjs'].includes(path.basename(file))){args.push(sqlRuntime);if(file.endsWith('canonical-sql-regression.cjs'))args.push(corpus.documents.find(d=>d.id==='B').canonicalReference.path);}run(path.basename(file).replace(/\.(cjs|ts)$/,''),process.execPath,args);}
const snapshots=c.read(corpus.snapshot.path);record('frozen-business-snapshot',c.hash(fs.readFileSync(corpus.snapshot.path))===corpus.snapshot.sha256?[]:['Business snapshot changed']);
for(const doc of corpus.documents){const failures=[];let metrics=null;const image=doc.canonicalReference.path;
 if(!fs.existsSync(image)||c.hash(fs.readFileSync(image))!==doc.canonicalSha256){report.retained.push({id:doc.id,status:'FAIL',failures:['Image missing/changed']});save();continue;}
 const snapshot=snapshots.find(s=>s.document.id===doc.id)?.snapshot;if(!snapshot){report.retained.push({id:doc.id,status:'FAIL',failures:['Frozen resolver snapshot missing']});save();continue;}
 for(const engine of ['legacy','v2-shadow']){const input=path.join(out,doc.id+'-'+engine+'-input.json'),dir=path.join(out,doc.id+'-'+engine);fs.writeFileSync(input,JSON.stringify({id:doc.id,image,sha256:doc.canonicalSha256,snapshot,engine}));
 const replay=run('retained-'+doc.id+'-'+engine,process.execPath,['--experimental-strip-types','scripts/release/replay-document.cjs',input,dir],900000);
 if(replay.status!==0){failures.push(engine+' replay failed');continue;}const result=c.read(path.join(dir,'result.json'));
 if(engine==='v2-shadow'){metrics=evidenceMetrics(doc,result.result);failures.push(...c.scoreDocument(doc,result.result),...metrics.failures);}
 else {
  // Legacy raw candidates are not accepted field evidence. Preserve the real response, and require a terminal result.
  if(![200,422].includes(result.result.status))failures.push('Legacy nonterminal response');
  const raw=result.result.result;if(raw.totalEvidence?.payable&&Math.round(raw.totalEvidence.amount*100)!==doc.truth.authoritativeTotalCents)failures.push('Wrong legacy authoritative total');
  if(raw.paymentCanApply===true)failures.push('Legacy extraction unexpectedly applies payment');
 }
 }
 report.retained.push({id:doc.id,status:failures.length?'FAIL':'PASS',failures,metrics});save();console.log('ACCEPTANCE',doc.id,failures.length?'FAIL':'PASS');
}
run('lint',process.execPath,['node_modules/eslint/bin/eslint.js','.']);
run('typescript',process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
run('production-build',process.execPath,['node_modules/next/dist/bin/next','build'],600000);
record('clean-manifest-source-end',c.localFailures(manifest));
Object.assign(report,state.evaluate(report,corpus));report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,mode:report.mode,report:path.join(out,'gate-result.json'),physicalAcceptance:report.physicalAcceptance}));process.exitCode=report.status==='FAIL'?1:0;
