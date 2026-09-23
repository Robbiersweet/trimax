/* eslint-disable @typescript-eslint/no-require-imports -- Private before/after optical benchmark; truth enters scoring only. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {normalizeDocument}=require('../../src/app/lib/ocrV2/documentNormalization.ts');
const {recognizeSemanticPage}=require('../../src/app/lib/ocrV2/semantics/index.ts');
const {recognizeSemanticMoney}=require('../../src/app/lib/ocrV2/recognition/semanticMoney.ts');
const {EvidenceLedger}=require('../../src/app/lib/ocrV2/recognition/evidenceLedger.ts');
(async()=>{
 const base=process.argv[4];assert(base,'Provide the pre-repair Git revision');const out=path.resolve(process.argv[3]);assert(!out.startsWith(process.cwd()+path.sep),'Private output must be outside repository');fs.mkdirSync(out,{recursive:true});
 function baseline(file){const relative='src/app/lib/ocrV2/recognition/'+file,source=cp.execFileSync('git',['show',base+':'+relative],{encoding:'utf8'});const text=source.replace(/from '([^']+)'/g,(all,s)=>{if(s==='./documentTotalAuthority.ts')return "from '"+pathToFileURL(path.join(out,'documentTotalAuthority.ts')).href+"'";if(s.startsWith('.'))return "from '"+pathToFileURL(path.resolve(path.dirname(relative),s)).href+"'";if(s==='sharp'||s==='tesseract.js')return "from '"+pathToFileURL(require.resolve(s)).href+"'";return all;});fs.writeFileSync(path.join(out,file),text);}
 baseline('documentTotalAuthority.ts');baseline('semanticMoney.ts');const before=require(path.join(out,'semanticMoney.ts')).recognizeSemanticMoney;
 const records=JSON.parse(fs.readFileSync(process.argv[2])).records,results=[];
 for(const r of records){const norm=await normalizeDocument(fs.readFileSync(r.imageReference)),image=norm.documentColor,hash=crypto.createHash('sha256').update(image).digest('hex'),ledger=()=>new EvidenceLedger(r.fixtureId,r.fixtureId,hash);const page=await recognizeSemanticPage(image,ledger());
  const old=await before(image,page.model,page.observations,ledger()),next=await recognizeSemanticMoney(image,page.model,page.observations,ledger());
  fs.writeFileSync(path.join(out,r.fixtureId+'.json'),JSON.stringify({sourceHash:hash,page,old,next}));results.push({id:r.fixtureId,before:old.authority.cents,after:next.authority.cents,reason:next.authority.reason,ambiguous:next.totalLocalization.plausibleFields>1});console.log(r.fixtureId,old.authority.cents,next.authority.cents);
 }
 // Scoring after every inference is frozen.
 for(const result of results){const truth=records.find(r=>r.fixtureId===result.id).verifiedTruth.authoritativeTotalCents;result.exact=result.after!==null&&result.after===truth;result.wrong=result.after!==null&&result.after!==truth;assert(!result.wrong,result.id+' wrong accepted total');if(result.before!==null)assert.equal(result.after,result.before,result.id+' total authority regressed');}
 const summary={results,before:results.filter(r=>r.before!==null).length,after:results.filter(r=>r.after!==null).length,exact:results.filter(r=>r.exact).length,wrong:results.filter(r=>r.wrong).length,ambiguous:results.filter(r=>r.ambiguous).length};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
