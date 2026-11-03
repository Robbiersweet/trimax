/* eslint-disable @typescript-eslint/no-require-imports -- Execute the production bounded optical join and freeze all financial decisions. */
const a=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {joinedOpticalStages:join}=require('../src/app/lib/ocrV2/shadow/pipeline.ts');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let leftDone,rightDone,active=0,peak=0,calls=0;
 const run=side=>()=>new Promise(resolve=>{calls++;active++;peak=Math.max(peak,active);const finish=()=>{active--;resolve(side);};if(side==='left')leftDone=finish;else rightDone=finish;});
 const result=join(run('left'),run('right'));await tick();a.equal(calls,2);a.equal(peak,2);rightDone();leftDone();a.deepEqual(await result,['left','right']);a.equal(active,0);
 let cleaned=false,finish;const bad=join(async()=>{throw Error('left failure');},()=>new Promise(resolve=>{finish=()=>{cleaned=true;resolve('retained');};}));let returned=false;const check=bad.catch(e=>{returned=true;a.equal(e.message,'left failure');a.equal(cleaned,true);});await tick();a.equal(returned,false);finish();await check;
 await a.rejects(join(()=>{throw Error('synchronous');},async()=>{await tick();cleaned=true;}),/synchronous/);
 await a.rejects(join(async()=>{throw Error('first');},async()=>{throw Error('second');}),/first/);
 await a.rejects(join(async()=>1,async()=>{throw Error('second');}),/second/);
 const baseline=cp.execFileSync('git',['show','c9f1dd4e21ae7c413ff125d0b1a81c595b4018ba:src/app/lib/ocrV2/shadow/pipeline.ts'],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');
 const candidate=fs.readFileSync('src/app/lib/ocrV2/shadow/pipeline.ts','utf8').replaceAll('\r\n','\n');
 a.equal(candidate.slice(candidate.indexOf('  const metadataFusion:')),baseline.slice(baseline.indexOf('  const metadataFusion:')),'All metadata conflict fusion, total/payor authority, row reconciliation, invoice resolution and final decisions stay identical');
 const slice=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end));
 a.equal(slice(candidate,'  const paymentCrops=','  const readLocalizedMetadata='),slice(baseline,'  const paymentCrops=','  const recognitionStart ='),'Every crop, money preparation and source-bound row remains identical');
 a.equal(slice(candidate,'  for (const o of batch.observations)','  const {localizedMetadata,metadataViews}='),slice(baseline,'  for (const o of batch.observations)','  let localizedMetadata='),'Complete model/source checks and row/identity fusion remain identical');
 const compact=s=>s.split('\n').map(x=>x.trim()).join('\n');
 a.equal(compact(slice(candidate,'    let localizedMetadata=','    return {localizedMetadata,metadataViews};')),compact(slice(baseline,'  let localizedMetadata=','  const metadataFusion:')),'All localized passes, conditional alternate-view reads and conflict inputs are preserved');
 console.log('PASS bounded optical overlap: exactly-once two-task join, ordered values/errors, synchronous rejection, drained sibling cleanup and unchanged complete optical/financial decision bodies');
})().catch(e=>{console.error(e);process.exitCode=1});
