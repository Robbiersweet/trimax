/* eslint-disable @typescript-eslint/no-require-imports -- Private real-image corpus: truth is scoring-only, never inference input. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const sharp=require('sharp');
const {loadSnapshot,scoreFinancial}=require('./photo-corpus-financial.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const textHash=file=>hash(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'));
const privateRoot=process.env.TRIMAX_PHOTO_CORPUS_ROOT||path.join(process.env.LOCALAPPDATA||require('node:os').tmpdir(),'Trimax','photo-robustness-20261022');
const corpus=require('../release/physical-photo-regression.json');
function applicationHash(){const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src/app','scripts/release/recognizer-adapter.cjs','scripts/ocr-v2/dataset/recognize.py'],{encoding:'utf8'}).trim().split(/\r?\n/).sort();return hash(files.map(f=>f+'='+hash(fs.readFileSync(f).toString('utf8').replaceAll('\r\n','\n'))).join('\n'));}
function score(doc,engine,result){
 const digits=s=>String(s).replace(/\D/g,'').replace(/^0+/,''), expected=doc.truth;
 let check,date,payor,total,rows;
 if(engine==='legacy'){
  const r=result.result; check=r.checkNumber;date=r.checkDate;payor=r.payor;total=r.totalEvidence?.payable?Math.round(r.totalEvidence.amount*100):null;
  rows=(r.structuredRowEvidence||[]).map(row=>({numbers:row.normalizedInvoiceCandidates.map(digits),amounts:[...new Set(row.amountCandidates.filter(a=>a.selected).map(a=>Math.round(a.value*100)))]}));
 }else{
  check=result.document.header.checkNumber;date=result.document.header.checkDate;
  const identity=result.organizationIdentity,accepted=result.document.header.payor;
  // The diagnostic resolver carries a distinctive stem, while the same accepted
  // model proof retains the literal printed descriptor. Score that observed text,
  // never an alias, page-only rejected candidate or business-record completion.
  payor=identity?.authority==='authoritative'&&accepted===identity.value&&!identity.competingCandidates.length?identity.candidates.find(c=>c.stem===accepted)?.observedText:accepted;total=result.monetary.authority.cents;
  rows=result.document.rows.map(row=>({numbers:row.fusion.topCandidate?[digits(row.fusion.topCandidate)]:[],confident:row.fusion.confidence.confidentlySelected,amounts:[result.matureMoney?.find(m=>m.rowId===row.rowId&&m.field==='row_amount')?.cents??null].filter(a=>a!==null)}));
 }
 const matchRows=rows.length===expected.rows.length && expected.rows.every((r,i)=>rows[i].numbers.includes(digits(r.number)));
 const amounts=rows.length===expected.rows.length && expected.rows.every((r,i)=>rows[i].amounts.length===1&&rows[i].amounts[0]===r.cents);
 const subtotal=rows.every(r=>r.amounts.length===1)?rows.reduce((s,r)=>s+r.amounts[0],0):null;
 const fields={checkNumber:check===expected.check?'PASS':'FAIL',date:date===expected.date?'PASS':'FAIL',payor:expected.payor.test(String(payor))?'PASS':'FAIL',invoiceRows:matchRows?(engine==='v2-shadow'&&rows.some(r=>!r.confident)?'PASS_OBSERVED_REVIEW_REQUIRED':'PASS'):'FAIL',rowAmounts:amounts?'PASS':'FAIL',documentTotal:total===expected.total?'PASS':'FAIL',reconciliation:subtotal===total&&total===expected.total?'PASS':'FAIL'};
 const financial=scoreFinancial(doc,engine,result);Object.assign(fields,financial.fields);
 const terminalStatus=engine==='legacy'?(result.status===200?'review':result.status>=400?'actionable-failure':'missing'):(result.resolver?.status?'review':'missing');fields.terminalStatus=terminalStatus==='missing'?'FAIL':'PASS';
 return{...financial,terminalStatus,fields,status:Object.values(fields).includes('FAIL')||(engine==='v2-shadow'&&result.paymentCanApply!==false)?'FAIL':'PASS',observed:{check,date,payor,totalCents:total,subtotalCents:subtotal,rows},paymentApplied:false,paymentCapability:engine==='v2-shadow'?result.paymentCanApply:false};
}
async function variant(file,name,target){let s=sharp(file),m=await s.metadata();if(name==='distance-resolution')s=s.resize({width:Math.round(m.width*.68)}).extend({top:110,bottom:30,left:170,right:50,background:'#3d4248'});if(name==='lighting-rotation')s=s.modulate({brightness:.85}).rotate(3,{background:'#4c443b'});if(name==='perspective'){const {rectifyDocument}=require('../src/app/lib/ocrV2/documentGeometry.ts');const w=m.width,h=m.height;const g={reliable:true,corners:[{x:0,y:h*.01},{x:w*.97,y:0},{x:w,y:h*.96},{x:w*.035,y:h}]};s=sharp((await rectifyDocument(fs.readFileSync(file),g)).image);}await s.jpeg({quality:90}).toFile(target);}
(async()=>{
 const rescore=process.argv.find(a=>a.startsWith('--rescore-report='))?.slice(17);
 if(rescore){const r=JSON.parse(fs.readFileSync(rescore));if(!r.finishedAt||r.results.length!==corpus.documents.length*8||r.applicationHash!==applicationHash()||r.financialScorerHash!==textHash('scripts/photo-corpus-financial.cjs')||r.corpusHash!==textHash('release/physical-photo-regression.json')||r.recognizerAdapterHash!==textHash('scripts/release/recognizer-adapter.cjs'))throw Error('Only complete unchanged-source inference evidence can be rescored');
  r.priorScoringRunnerHash=r.runnerHash;r.runnerHash=textHash(__filename);r.rescoredAt=new Date().toISOString();
  r.results=r.results.map(old=>{const doc=corpus.documents.find(d=>d.id===old.capture);if(!doc)throw Error('Unknown retained capture');const original=path.join(privateRoot,doc.file);if(hash(fs.readFileSync(original))!==doc.sha256)throw Error('Retained image changed');const file=path.join(r.out,old.capture+'-'+old.variant+'-'+old.engine,'result.json');const actual=JSON.parse(fs.readFileSync(file));if(actual.sourceImageHash!==old.sha256||actual.engine!==old.engine)throw Error('Replay source binding differs');return{capture:old.capture,variant:old.variant,engine:old.engine,sha256:old.sha256,...score({...doc,truth:{...doc.truth,payor:new RegExp(doc.truth.payorPattern,'i')}},old.engine,actual.result)};});r.status=r.results.some(x=>x.status!=='PASS')?'FAIL':'PASS';fs.writeFileSync(rescore,JSON.stringify(r,null,2));console.log('RESCORED '+r.status);return;
 }
 if(process.argv.includes('--verify-receipt')){for(const d of corpus.documents){loadSnapshot(d.snapshot);loadSnapshot(d.currentSnapshot);}const r=JSON.parse(fs.readFileSync('release/evidence/physical-photo-corpus.json'));if(r.status!=='PASS'||r.applicationHash!==applicationHash()||r.runnerHash!==textHash(__filename)||r.recognizerAdapterHash!==textHash('scripts/release/recognizer-adapter.cjs')||r.financialScorerHash!==textHash('scripts/photo-corpus-financial.cjs')||r.corpusHash!==textHash('release/physical-photo-regression.json')||r.results.length!==corpus.documents.length*8||corpus.documents.some(d=>['native','distance-resolution','lighting-rotation','perspective'].some(v=>['legacy','v2-shadow'].some(e=>!r.results.some(x=>x.capture===d.id&&x.variant===v&&x.engine===e))))||r.results.some(r=>r.status!=='PASS'))throw Error('Missing, stale, incomplete or failing physical-photo corpus evidence');console.log('PASS source-pinned physical-photo corpus receipt');return;}
 const startedAt=new Date().toISOString(),source=applicationHash(),out=path.join(privateRoot,'matrix-'+startedAt.replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
 for(const d of corpus.documents){loadSnapshot(d.snapshot);loadSnapshot(d.currentSnapshot);}
 const report={status:'RUNNING',startedAt,applicationHash:source,runnerHash:textHash(__filename),financialScorerHash:textHash('scripts/photo-corpus-financial.cjs'),recognizerAdapterHash:textHash('scripts/release/recognizer-adapter.cjs'),corpusHash:textHash('release/physical-photo-regression.json'),sourceTruth:'User verified paper values and retained paper inspection; scoring only',variantsAreSynthetic:true,independentPhysicalCaptures:corpus.documents.length,results:[],out};
 const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));save();console.log('REPORT '+path.join(out,'report.json'));
 const jobs=[];let stop=false;
 const captureFilter=process.argv.find(a=>a.startsWith('--capture='))?.slice(10),variantFilter=process.argv.find(a=>a.startsWith('--variant='))?.slice(10);
 if(captureFilter&&!corpus.documents.some(d=>d.id===captureFilter))throw Error('Unknown development capture filter');
 for(const doc of corpus.documents.filter(d=>!captureFilter||d.id===captureFilter)){
  const snapshot=loadSnapshot(doc.snapshot).snapshot;
  const original=path.join(privateRoot,doc.file);if(hash(fs.readFileSync(original))!==doc.sha256)throw Error('Retained image mismatch '+doc.id);
  const names=process.argv.includes('--base-only')?['native']:['native','distance-resolution','lighting-rotation','perspective'];
  if(variantFilter&&!names.includes(variantFilter))throw Error('Unknown development variant filter');
  for(const name of names.filter(n=>!variantFilter||n===variantFilter)){
   const id=doc.id+'-'+name,file=name==='native'?original:path.join(out,id+'.jpg');if(name!=='native')await variant(original,name,file);
   const sha256=hash(fs.readFileSync(file));
   for(const engine of (process.argv.includes('--legacy-only')?['legacy']:['legacy','v2-shadow'])){
    jobs.push({capture:doc.id,variant:name,run:async()=>{
    const input=path.join(out,id+'-'+engine+'-input.json'),dir=path.join(out,id+'-'+engine);fs.writeFileSync(input,JSON.stringify({id,image:file,sha256,snapshot,engine}));
    const replayStartedAt=Date.now();const r=await new Promise(resolve=>{const child=cp.spawn(process.execPath,['--experimental-strip-types','scripts/release/replay-document.cjs',input,dir],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout=(stdout+b).slice(-4000000);});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000000);});const timer=setTimeout(()=>child.kill(),900000);child.on('error',e=>{clearTimeout(timer);resolve({status:null,stdout,stderr:stderr+'\n'+e.message});});child.on('exit',status=>{clearTimeout(timer);resolve({status,stdout,stderr});});});fs.writeFileSync(dir+'.log',r.stdout+'\n'+r.stderr);
    let result;try{if(r.status!==0)throw Error('Replay exit '+r.status);const evidence=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))).result;result=score({...doc,truth:{...doc.truth,payor:new RegExp(doc.truth.payorPattern,'i')}},engine,evidence);result.processingStages=engine==='legacy'?(evidence.result?.diagnostics?.stageTimings??{}):(evidence.timings??{});}catch(e){result={status:'FAIL',error:e.message};}
    report.results.push({capture:doc.id,variant:name,engine,sha256,processingDurationMs:Date.now()-replayStartedAt,...result});save();console.log(JSON.stringify({capture:doc.id,variant:name,engine,...result}));if(process.argv.includes('--fail-fast')&&result.status==='FAIL'){stop=true;}
    }});
   }
  }
 }
 const order=['native','distance-resolution','lighting-rotation','perspective'];jobs.sort((a,b)=>order.indexOf(a.variant)-order.indexOf(b.variant)||corpus.documents.findIndex(d=>d.id===a.capture)-corpus.documents.findIndex(d=>d.id===b.capture));
 let next=0;await Promise.all([0,1].map(async()=>{while(next<jobs.length&&!stop){const job=jobs[next++];await job.run();}}));
 report.finishedAt=new Date().toISOString();report.status=source!==applicationHash()||report.results.some(r=>r.status!=='PASS')?'FAIL':'PASS';save();console.log('FINAL '+report.status);process.exitCode=report.status==='PASS'?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
