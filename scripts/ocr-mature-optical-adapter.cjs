/* eslint-disable @typescript-eslint/no-require-imports -- Validated local worker optical capability, never imported by an HTTP route. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const models={svtr:'svtrv2',parseq:'parseq',ppocr:'ppocrv5'};
function createMatureOpticalAdapter(config,{spawn=cp.spawn}={}){
 if(config.matureFallbackEnabled!==true||!config.python||!config.wslDistribution||!path.isAbsolute(config.privateRoot??''))throw Error('Validated mature optical runtime is unavailable');
 const repository=path.resolve(__dirname,'..'),relative=path.relative(repository,path.resolve(config.privateRoot));
 if(!relative||!relative.startsWith('..'))throw Error('Optical transient storage must be outside the repository');
 let used=false;
 return async(crops,documentId,sourceHash,moneyCrops,organizationCrops,paymentCrops=[])=>{
  if(used)throw Error('Only one mature optical batch is allowed per fallback');used=true;
  if(!documentId||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('Missing optical source binding');
  const all=[...crops.map(c=>({crop:c,field:null})),...moneyCrops.map(c=>({crop:c,field:c.field})),...organizationCrops.map(c=>({crop:c,field:'organization'})),...paymentCrops.map(c=>({crop:c,field:'payment_metadata'}))];
  if(!all.length||all.length>96||all.some(({crop})=>!crop.rowId||hash(crop.bytes)!==crop.sha256))throw Error('Invalid bounded optical crops');
  fs.mkdirSync(config.privateRoot,{recursive:true});const privateRoot=fs.realpathSync.native(config.privateRoot),dir=fs.mkdtempSync(path.join(privateRoot,'legacy-mature-'));
  try{
   const inputs=all.map(({crop,field},i)=>{const file='crop-'+i+'.png';fs.writeFileSync(path.join(dir,file),crop.bytes);return{id:crop.rowId,documentId,file,sha256:crop.sha256,...(field?{field}:{})};});
   fs.writeFileSync(path.join(dir,'inputs.json'),JSON.stringify(inputs));
   const toWSL=file=>{const full=fs.realpathSync.native(file);if(!/^[a-z]:\\/i.test(full))throw Error('Windows runtime path required');return '/mnt/'+full[0].toLowerCase()+'/'+full.slice(3).replaceAll('\\','/');};
   await new Promise((resolve,reject)=>{
    const child=spawn('wsl',['-d',config.wslDistribution,'--','env','HF_HUB_OFFLINE=1','timeout','--signal=TERM','--kill-after=5s','90s',config.python,toWSL(path.join(__dirname,'ocr-v2/dataset/recognize.py')),toWSL(dir)],{windowsHide:true,stdio:['ignore','ignore','pipe']});let settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve();};
    const timer=setTimeout(()=>{child.kill();finish(Error('Mature optical fallback exceeded its bounded worker budget'));},100000);
    child.stderr?.on('data',()=>{});child.once('error',()=>finish(Error('Mature optical runtime could not start')));child.once('exit',code=>finish(code===0?null:Error('Mature optical model batch failed; saved evidence remains retained')));
   });
   const data=JSON.parse(fs.readFileSync(path.join(dir,'recognition.json'),'utf8'));
   if(!Array.isArray(data.observations)||data.observations.some(o=>!inputs.some(i=>i.id===o.id&&i.file===o.file&&i.sha256===o.sha256&&i.documentId===o.documentId&&i.field===o.field)))throw Error('Model output source binding mismatch');
   return {versions:data.versions,modelTimings:data.models,
    paymentObservations:data.observations.filter(o=>o.field==='payment_metadata'&&models[o.recognizer]).map(o=>{const crop=paymentCrops.find(c=>c.rowId===o.id);return{id:'payment:'+o.recognizer+':'+o.id,fieldId:o.id,documentId,sourceHash:crop.sourceHash,cropHash:o.sha256,recognizer:models[o.recognizer],raw:o.raw,confidence:null,confidenceCalibrated:false};}),
    organizationObservations:data.observations.filter(o=>o.field==='organization'&&models[o.recognizer]).map(o=>{const crop=organizationCrops.find(c=>c.rowId===o.id);return{id:'organization:'+o.recognizer+':'+o.id,documentId,sourceImageHash:sourceHash,cropHash:o.sha256,sourceRegion:o.id,geometry:crop.bounds,regionType:crop.regionType,recognizer:models[o.recognizer],rawText:o.raw,confidence:null,durationMs:o.ms};}),
    moneyObservations:data.observations.filter(o=>['row_amount','total'].includes(o.field)&&models[o.recognizer]).map(o=>({id:'money:'+o.recognizer+':'+o.field+':'+o.id,rowId:o.id,field:o.field,documentId,sourceHash,cropHash:o.sha256,recognizer:models[o.recognizer],raw:o.raw,confidence:null,confidenceCalibrated:false,durationMs:o.ms})),
    observations:data.observations.filter(o=>!o.field&&models[o.recognizer]).map(o=>({id:o.recognizer+':'+o.id,fieldType:'invoice',scope:'row',rowId:o.id,recognizer:models[o.recognizer],rawText:o.raw,sequenceConfidence:null,characterConfidences:null,confidenceCalibrated:false,cropReference:{documentId,rowId:o.id,sourceImageSha256:sourceHash,baseCropSha256:o.sha256,sha256:o.sha256,path:o.file,variant:'native'},durationMs:o.ms,visualWarnings:[]}))};
  }finally{
   const resolved=fs.realpathSync.native(dir),within=path.relative(privateRoot,resolved);
   if(!within||within.startsWith('..')||path.isAbsolute(within))throw Error('Unsafe optical transient cleanup path');
   fs.rmSync(resolved,{recursive:true,force:true});
  }
 };
}
module.exports={createMatureOpticalAdapter};
