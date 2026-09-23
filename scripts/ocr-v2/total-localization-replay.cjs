/* eslint-disable @typescript-eslint/no-require-imports -- Private optical diagnostic CLI. */
const fs=require('node:fs'),crypto=require('node:crypto');
const {recognizeSemanticPage}=require('../../src/app/lib/ocrV2/semantics/index.ts');
const {EvidenceLedger}=require('../../src/app/lib/ocrV2/recognition/evidenceLedger.ts');
const {inspectStructuralLines}=require('../../src/app/lib/ocrV2/layout/generalized.ts');
const {paymentMoney}=require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
(async()=>{
 const image=fs.readFileSync(process.argv[2]),hash=crypto.createHash('sha256').update(image).digest('hex');
 const page=await recognizeSemanticPage(image,new EvidenceLedger('total-audit','total-audit',hash));
 const structure=await inspectStructuralLines(image);
 const candidates=page.observations.flatMap(o=>o.words.filter(w=>paymentMoney(w.text).length).map(w=>({observation:o.id,variant:o.variant,...w,cents:paymentMoney(w.text)})));
 fs.writeFileSync(process.argv[3],JSON.stringify({page,structure,candidates}));
 console.log(JSON.stringify({candidates,font:structure.font*structure.scaleY,lines:structure.lines.filter(l=>l.top*structure.scaleY>Math.max(...page.model.table.rows.map(r=>r.bounds.top+r.bounds.height))).map(l=>({left:l.left*structure.scaleX,top:l.top*structure.scaleY,width:l.width*structure.scaleX,height:l.height*structure.scaleY}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
