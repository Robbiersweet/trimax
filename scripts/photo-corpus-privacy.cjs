/* eslint-disable @typescript-eslint/no-require-imports -- Public receipts contain only an explicit privacy whitelist; full evidence stays private. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hashKeys=['applicationHash','runnerHash','financialScorerHash','recognizerAdapterHash','corpusHash','annotationHash'];
const fields=['checkNumber','date','payor','invoiceRows','rowAmounts','documentTotal','reconciliation','matchedInvoiceRecords','clientIsolation','selectedRowAmounts','selectedTotal','financialReconciliation','alreadyPaidCollectibleGuard','terminalStatus'];
const allowedStatus=(field,value)=>value==='PASS'||field==='invoiceRows'&&value==='PASS_OBSERVED_REVIEW_REQUIRED'||field==='financialReconciliation'&&value==='PASS_CORRECT_RECORDS_REVIEW_REQUIRED'||field==='alreadyPaidCollectibleGuard'&&value==='NOT_APPLICABLE_CURRENTLY_UNPAID';
function privatePath(root,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid private evidence pointer');
 const base=fs.realpathSync(root),file=fs.realpathSync(path.resolve(base,relative)),rel=path.relative(base,file);
 if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Private evidence escapes root');
 const repo=fs.realpathSync(path.resolve(__dirname,'..')),repoRel=path.relative(repo,file);
 if(!repoRel.startsWith('..')&&!path.isAbsolute(repoRel))throw Error('Private evidence must remain outside repository');
 for(let dir=path.dirname(file);;dir=path.dirname(dir)){if(fs.existsSync(path.join(dir,'.git')))throw Error('Private evidence must remain outside Git');if(path.dirname(dir)===dir)break;}
 return file;
}
function loadAnnotations(bootstrap,privateRoot){
 if(bootstrap.schemaVersion!==2||bootstrap.independentPhysicalCaptures!==7||!bootstrap.annotations||!/^[a-f0-9]{64}$/.test(bootstrap.annotations.sha256))throw Error('Invalid private annotation bootstrap');
 if(JSON.stringify(bootstrap.variants)!==JSON.stringify(['native','distance-resolution','lighting-rotation','perspective'])||JSON.stringify(bootstrap.engines)!==JSON.stringify(['legacy','v2-shadow']))throw Error('Unsupported corpus dimensions');
 const bytes=fs.readFileSync(privatePath(privateRoot,bootstrap.annotations.file));
 if(hash(bytes)!==bootstrap.annotations.sha256)throw Error('Private annotation hash differs');
 const corpus=JSON.parse(bytes);
 if(corpus.documents?.length!==bootstrap.independentPhysicalCaptures||new Set(corpus.documents.map(d=>d.id)).size!==corpus.documents.length)throw Error('Private annotation corpus incomplete');
 return corpus;
}
function validateReport(report,{corpus,hashes}){
 const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
 if(report.status!=='PASS'||!timestamp(report.startedAt)||!timestamp(report.finishedAt)||Date.parse(report.finishedAt)<Date.parse(report.startedAt)||report.independentPhysicalCaptures!==corpus.documents.length||report.results?.length!==corpus.documents.length*8)throw Error('Complete genuine PASS report required');
 for(const key of hashKeys)if(!/^[a-f0-9]{64}$/.test(hashes[key]||'')||report[key]!==hashes[key])throw Error('Stale source or annotation hash: '+key);
 const seen=new Set();
 for(const item of report.results){
  if(!corpus.documents.some(d=>d.id===item.capture)||!['native','distance-resolution','lighting-rotation','perspective'].includes(item.variant)||!['legacy','v2-shadow'].includes(item.engine))throw Error('Unknown corpus case');
  const document=corpus.documents.find(d=>d.id===item.capture);
  if(!/^[a-f0-9]{64}$/.test(item.sha256||'')||item.variant==='native'&&item.sha256!==document.sha256)throw Error('Missing or changed capture binding');
  const key=[item.capture,item.variant,item.engine].join('/');if(seen.has(key))throw Error('Duplicate corpus case');seen.add(key);
  if(item.status!=='PASS'||item.paymentApplied!==false||item.paymentCapability!==false||item.terminalStatus!=='review'||!item.fields||Object.keys(item.fields).length!==fields.length||fields.some(f=>!allowedStatus(f,item.fields[f])))throw Error('Failing or incomplete case evidence');
 }
}
function exportReceipt(report,options){
 validateReport(report,options);
 if(!/^matrix-[0-9TZ-]+\/report\.json$/.test(options.reportPath||''))throw Error('Private report pointer must use an anonymous timestamp directory');
 const {corpus,privateRoot,hashes}=options,reportFile=privatePath(privateRoot,options.reportPath),bytes=fs.readFileSync(reportFile);
 if(fs.realpathSync(report.out)!==path.dirname(reportFile))throw Error('Private report directory binding differs');
 if(!isDeepStrictEqual(JSON.parse(bytes),report))throw Error('Export requires the actual persisted private report');
 const aliases=new Map(corpus.documents.map((d,i)=>[d.id,'capture-'+(i+1)]));
 const results=report.results.map(item=>({capture:aliases.get(item.capture),variant:item.variant,engine:item.engine,status:item.status,fields:Object.fromEntries(fields.map(f=>[f,item.fields[f]])),terminalStatus:item.terminalStatus}));
 results.sort((a,b)=>[a.capture,a.variant,a.engine].join('/').localeCompare([b.capture,b.variant,b.engine].join('/')));
 return {schemaVersion:2,status:'PASS',...Object.fromEntries(hashKeys.map(k=>[k,hashes[k]])),startedAt:report.startedAt,finishedAt:report.finishedAt,independentPhysicalCaptures:corpus.documents.length,caseCount:results.length,privateReport:{path:options.reportPath,sha256:hash(bytes)},results};
}
function verifyReceipt(receipt,options){
 if(receipt.schemaVersion!==2||!receipt.privateReport||!/^[a-f0-9]{64}$/.test(receipt.privateReport.sha256||''))throw Error('Missing private evidence binding');
 const bytes=fs.readFileSync(privatePath(options.privateRoot,receipt.privateReport.path));
 if(hash(bytes)!==receipt.privateReport.sha256)throw Error('Private report hash differs');
 const report=JSON.parse(bytes),expected=exportReceipt(report,{...options,reportPath:receipt.privateReport.path});
 if(!isDeepStrictEqual(receipt,expected))throw Error('Public receipt must equal the exact private evidence whitelist');
 return report;
}
module.exports={loadAnnotations,exportReceipt,verifyReceipt,validateReport,privatePath,hashKeys,fields};
