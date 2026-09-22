/* eslint-disable @typescript-eslint/no-require-imports -- Private label-free inference export. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {createWorker,OEM,PSM}=require('tesseract.js');
const {fieldVariant}=require('../../src/app/lib/ocrV2/recognition/index.ts');
const {paymentMoney,decideMoney}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const {decideRowMoney}=require('../../src/app/lib/ocrV2/recognition/semanticMoney.ts');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const [research,out,split]=process.argv.slice(2);if(!['development','heldout','native'].includes(split))throw Error('Explicit split required');
 if(!path.relative(process.cwd(),out).startsWith('..')||fs.existsSync(out))throw Error('Fresh private output directory required');
 fs.mkdirSync(out,{recursive:true});const inputs=[],labels=[],tesseract=[];
 const truth=JSON.parse(fs.readFileSync(path.join(research,'generalization-v1/ground-truth.json'))).documents;
 const worker=await createWorker('eng',OEM.LSTM_ONLY,{logger:()=>{}});
 try{
 const documents=split==='native'?['native-retained']:truth.filter(t=>(['B','C'].includes(t.id))===(split==='heldout')).map(t=>t.id);
 for(const documentId of documents){
  let image,regions,expected;
  if(split==='native'){
   const p=path.join(process.env.LOCALAPPDATA,'Trimax/ocr-shadow-worker/physical-e2e87232');
   const result=JSON.parse(fs.readFileSync(path.join(p,'money-production-final.json'))).find(x=>x.payload.result).payload.result;
   image=fs.readFileSync(path.join(p,'native-paper.png'));if(hash(image)!==result.normalizedImageHash)throw Error('Native paper hash mismatch');
   regions=result.monetary.regions.map(r=>({id:r.rowId,field:'row_amount',bounds:r.bounds,ownership:r.ownership})).concat([{id:'total',field:'total',bounds:result.monetary.totalBounds,ownership:result.monetary.totalBounds}]);
   // Annotation only: never passed to the recognizers.
   expected=JSON.parse(fs.readFileSync(path.join(p,'money-fixture.json')));
  }else{
   const base=path.join(research,'generalization-v1/pipeline',documentId),layout=JSON.parse(fs.readFileSync(path.join(base,'layout.json')));
   image=fs.readFileSync(path.join(base,'document.png'));
   regions=layout.rows.map(r=>({id:r.id,field:'row_amount',bounds:r.amountRegion,ownership:r.bounds})).concat([{id:'total',field:'total',bounds:layout.totalCandidateRegion,ownership:layout.totalCandidateRegion}]);
   const t=truth.find(t=>t.id===documentId);expected={amountsCents:t.rows.map(r=>r.amountCents),totalCents:t.totalCents};
  }
  const sourceHash=hash(image);
  for(const [i,region]of regions.entries()){
   if(!region.bounds)throw Error('Verified field geometry missing');
   const bytes=await sharp(image).extract(region.bounds).flatten({background:'white'}).png().toBuffer();const file=documentId+'-'+i+'.png';fs.writeFileSync(path.join(out,file),bytes);
   const input={id:documentId+':'+region.id,documentId,field:region.field,file,sha256:hash(bytes)};inputs.push(input);
   labels.push({...input,physicalDocumentId:split==='native'?'B':documentId,split,sourceHash,bounds:region.bounds,ownership:region.ownership,cents:region.field==='total'?expected.totalCents:expected.amountsCents[i],quality:{width:region.bounds.width,height:region.bounds.height,source:'real-photograph',resampled:false}});
   const obs=[];
   for(const variant of ['native','local-contrast']){
    const prep=await fieldVariant(image,{regionId:region.id,field:'amount',bounds:region.bounds,ownership:region.ownership},variant);
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_WORD,tessedit_char_whitelist:'0123456789$,.',user_defined_dpi:'300'});
    const start=performance.now(),{data}=await worker.recognize(prep.image);
    obs.push({id:input.id+':'+variant,raw:data.text,confidence:data.confidence,variant,money:paymentMoney(data.text),ms:performance.now()-start});
   }
   tesseract.push({...input,observations:obs,accepted:(region.field==='total'?decideMoney(obs):decideRowMoney(obs)).cents});
  }
 }
 }finally{await worker.terminate();}
 // Only five allowlisted metadata fields enter the mature recognizer directory.
 fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(inputs,null,2));
 fs.writeFileSync(out+'-labels.json',JSON.stringify(labels,null,2));
 fs.writeFileSync(out+'-tesseract.json',JSON.stringify(tesseract,null,2));
 console.log(JSON.stringify({split,documents:new Set(inputs.map(r=>r.documentId)).size,rowAmounts:inputs.filter(r=>r.field==='row_amount').length,totals:inputs.filter(r=>r.field==='total').length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
