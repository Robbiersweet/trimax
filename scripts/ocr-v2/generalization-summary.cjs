/* eslint-disable @typescript-eslint/no-require-imports -- Aggregate private experimental evidence. */
const fs=require('fs'),path=require('path');
const root=process.argv[2],read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));
const truth=read('ground-truth.json'),results=[];
for(const doc of truth.documents){
 const p=read(`pipeline/${doc.id}/pipeline.json`),r=read((doc.split==='heldout'?'holdout':'development')+'-crnn.json').rows.filter(r=>r.documentId===doc.id&&r.kind==='auto');
 const obs=p.fields.observations;
 const amountNative=doc.rows.filter((row,i)=>obs.some(o=>o.field==='amount'&&o.rowId===p.layout.rows[i]?.id&&o.variant==='native'&&o.moneyCandidates.some(c=>c.cents===row.amountCents))).length;
 const amountAny=doc.rows.filter((row,i)=>obs.some(o=>o.field==='amount'&&o.rowId===p.layout.rows[i]?.id&&o.moneyCandidates.some(c=>c.cents===row.amountCents))).length;
 const totalNative=obs.some(o=>o.field==='total'&&o.variant==='native'&&o.moneyCandidates.some(c=>c.cents===doc.totalCents));
 const totalAny=obs.some(o=>o.field==='total'&&o.moneyCandidates.some(c=>c.cents===doc.totalCents));
 results.push({id:doc.id,split:doc.split,rowsDetected:p.layout.rows.length,expectedRows:doc.rows.length,invoiceExact:r.filter(r=>r.exact).length,amountNative,amountAny,totalNative,totalAny,totalCandidateSets:obs.filter(o=>o.field==='total').map(o=>({variant:o.variant,cents:o.moneyCandidates.map(c=>c.cents)})),phase1Ms:p.normalization.metrics.completeMs,phase2Ms:p.layout.diagnostics.durationMs,invoiceMs:r.reduce((a,b)=>a+b.ms,0),amountTotalMs:p.fields.durationMs,measuredNormalizationLayoutFieldsWallMs:p.completeMs,combinedStageMs:p.completeMs+r.reduce((a,b)=>a+b.ms,0)});
}
const geometry=read('geometry-metrics.json'),report={documents:results,comparisons:{},geometry:{},notes:['Exact recognition measures literal printed token; canonical formatting exact reported separately. No numeric repairs.','AmountAny/totalAny are evidence-recovery ceilings across fixed variants, not a fused or authorized result. Native is separately reported.','Combined timing adds separately measured invoice recognition to normalization/layout/field wall time. It is not a single-process cold-start UX measurement.']};
for(const split of ['development','holdout']){
 report.comparisons[split]={};for(const engine of ['generic','pilot','ppocr','crnn'])report.comparisons[split][engine]=read(`${split}-${engine}.json`).groups;
 const g=geometry.filter(g=>truth.documents.find(d=>d.id===g.id).split===(split==='holdout'?'heldout':'development')),iou=g.flatMap(g=>g.rowIoU);
 report.geometry[split]={rowCountCorrect:g.filter(g=>g.rowCountCorrect).length,documents:g.length,meanRowIoU:iou.reduce((a,b)=>a+b,0)/iou.length,rowsAtLeast95IoU:iou.filter(n=>n>=.95).length,totalRows:iou.length,visualCompleteTokens:g.reduce((a,b)=>a+b.invoiceCompleteVisual,0)};
}
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
