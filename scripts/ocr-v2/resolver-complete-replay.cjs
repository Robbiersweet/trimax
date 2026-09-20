/* eslint-disable @typescript-eslint/no-require-imports -- Measured offline original-image through resolver replay. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),sharp=require('sharp');
const {normalizeDocument}=require('../../src/app/lib/ocrV2/documentNormalization.ts');
const {structuralLayout}=require('../../src/app/lib/ocrV2/layout/generalized.ts');
const {recognizeFields}=require('../../src/app/lib/ocrV2/recognition/index.ts');
const {fuseInvoiceObservations}=require('../../src/app/lib/ocrV2/fusion/index.ts');
const {resolveOfflineDocument}=require('../../src/app/lib/ocrV2/resolver/index.ts');
const {selectObservedHeader}=require('../../src/app/lib/remittanceAttempt.ts');
const {recognizePaymentEvidence}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const root=process.argv[2],out=process.argv[3],wslRoot=process.argv[4];
const paymentMode=process.argv.includes('--payment-evidence');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,''));
(async()=>{
 if(fs.existsSync(out))throw Error('Fresh output directory required');fs.mkdirSync(out,{recursive:true});
 const sources=[...read('generalization-v1/development-originals.json'),...read('generalization-v1/holdout-originals.json')];
 const frozen=read('phase5/resolver-evidence.json'),timings=[];
 for(const source of sources){
  const start=performance.now(),dest=path.join(out,source.id);fs.mkdirSync(dest);
  const normalized=await normalizeDocument(fs.readFileSync(source.original));const normalizedAt=performance.now();
  const geometry=await structuralLayout(normalized.documentColor);
  const rows=geometry.rows.map(r=>({...r,top:r.bounds.top,bottom:r.bounds.top+r.bounds.height,centerY:r.bounds.top+r.bounds.height/2,invoiceRegion:undefined}));
  const payment=paymentMode?await recognizePaymentEvidence(normalized.documentColor,geometry,source.id):null;
  const fields=payment?{observations:[]}:await recognizeFields(normalized.documentColor,{documentBounds:{left:0,top:0,width:geometry.sourceWidth,height:geometry.sourceHeight},rows,columns:{},footerRegion:geometry.totalCandidateRegion,totalCandidateRegion:geometry.totalCandidateRegion},source.id);
  fs.writeFileSync(path.join(dest,'pipeline.json'),JSON.stringify({normalization:normalized.evidence,layout:geometry,fields,payment},null,2));
  const inputs=[];
  for(let i=0;i<geometry.rows.length;i++){
   const file=`invoice-${i}.png`,bytes=await sharp(normalized.documentColor).extract(geometry.rows[i].invoiceRegion).png().toBuffer();fs.writeFileSync(path.join(dest,file),bytes);inputs.push({id:`${source.id}-${i}`,file,sha256:hash(bytes)});
  }
  fs.writeFileSync(path.join(dest,'inputs.json'),JSON.stringify(inputs));const fieldsAt=performance.now();
  const localRelative=path.relative(root,dest).replaceAll('\\','/');
  const child=cp.spawnSync('wsl',['-d','Ubuntu','--','env','HF_HUB_OFFLINE=1','/home/robbi/trimax-ocr/benchmark-venv/bin/python','/mnt/c/Users/robbi/trimax/scripts/ocr-v2/training/phase5_recognize.py',wslRoot+'/'+localRelative],{encoding:'utf8',timeout:180000,maxBuffer:5000000});
  fs.writeFileSync(path.join(dest,'recognition.log'),child.stdout+'\n'+child.stderr);if(child.status!==0)throw Error(`Recognition failed: ${source.id}: ${child.stderr}`);
  const recognition=JSON.parse(fs.readFileSync(path.join(dest,'recognition.json'))),recognizedAt=performance.now();
  const template=frozen.find(r=>r.document.id===source.id),sourceHash=hash(normalized.documentColor);
  const evidenceRows=geometry.rows.map((r,index)=>{
   const rowId=`${source.id}-${index}`,observations=recognition.filter(o=>o.id===rowId).map(o=>({id:`${o.recognizer}:${rowId}`,fieldType:'invoice',scope:'row',rowId,recognizer:{svtr:'svtrv2',parseq:'parseq',ppocr:'ppocrv5'}[o.recognizer],rawText:o.raw,sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId:source.id,rowId,sourceImageSha256:sourceHash,baseCropSha256:o.sha256,sha256:o.sha256,path:o.file,variant:'native'},durationMs:o.ms,visualWarnings:[]}));
   return {rowId,fusion:fuseInvoiceObservations(observations),geometry:{...r.bounds,coordinateSpace:geometry.coordinateSpace,sourceHash},amounts:fields.observations.filter(o=>o.rowId===r.id&&o.field==='amount'&&o.status==='completed').flatMap(o=>o.moneyCandidates.map(m=>({cents:m.cents,raw:m.text,observationId:`${source.id}:${o.regionId}:${o.variant}`,rowId}))),units:[],accountCandidates:[]};
  });
  const rawPasses=fields.observations.filter(o=>!o.rowId&&o.status==='completed').map(o=>({text:o.rawText,region:o.field,variant:o.variant,pageMode:o.configuration.psm,words:[]}));
  const header=selectObservedHeader(rawPasses,[]);
  if(payment)evidenceRows.forEach(row=>{const ev=payment.rows.find(r=>r.rowId===row.rowId);row.amounts=ev.cents===null?[]:ev.observations.filter(o=>ev.provenance.includes(o.id)).map(o=>({cents:ev.cents,raw:o.raw,observationId:o.id,rowId:row.rowId}));});
  const selectedHeader=payment?{payor:payment.payor,checkNumber:payment.checkNumber,checkDate:payment.checkDate,total:payment.authoritativeTotal===null?null:{amount:payment.authoritativeTotal/100,source:'explicit-document-total',payable:true},provenance:'Fresh Phase 5B optical payment evidence; no benchmark truth'}:{payor:header.payor,checkNumber:header.checkNumber,checkDate:header.checkDate,total:header.documentTotal,provenance:'Fresh original-image replay; no benchmark truth'};
  const result=resolveOfflineDocument({id:source.id,rows:evidenceRows,rawPasses,header:selectedHeader},template.snapshot);
  fs.writeFileSync(path.join(dest,'result.json'),JSON.stringify(result,null,2));
  const record={id:source.id,normalizationMs:normalizedAt-start,layoutFieldsAndCropsMs:fieldsAt-normalizedAt,paymentEvidenceTimings:payment?.timings,recognitionIncludingWSLAndModelLoadMs:recognizedAt-fieldsAt,resolverMs:result.durationMs,completeMs:performance.now()-start,rows:evidenceRows.length,status:result.status};timings.push(record);console.log(JSON.stringify(record));fs.writeFileSync(path.join(out,'timings.json'),JSON.stringify(timings,null,2));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
