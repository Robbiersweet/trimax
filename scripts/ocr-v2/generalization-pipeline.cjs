/* eslint-disable @typescript-eslint/no-require-imports -- Isolated offline real-image benchmark. */
const fs=require('fs'),path=require('path'),sharp=require('sharp');
const {normalizeDocument}=require('../../src/app/lib/ocrV2/documentNormalization.ts');
const {structuralLayout}=require('../../src/app/lib/ocrV2/layout/generalized.ts');
const {recognizeFields}=require('../../src/app/lib/ocrV2/recognition/index.ts');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(process.argv[2])),out=process.argv[3];fs.mkdirSync(out,{recursive:true});
 for(const doc of manifest){
  if(doc.split==='heldout'&&!fs.existsSync(path.join(out,'freeze.json')))throw Error('Freeze required before holdout processing');
  const dest=path.join(out,doc.id);fs.mkdirSync(dest,{recursive:true});
  if(fs.existsSync(path.join(dest,'pipeline.json')))throw Error('Completed document may not be silently rerun');
  const start=performance.now(),normalized=await normalizeDocument(fs.readFileSync(doc.original));
  const geometry=await structuralLayout(normalized.documentColor);fs.writeFileSync(path.join(dest,'layout.json'),JSON.stringify(geometry,null,2));
  fs.writeFileSync(path.join(dest,'document.png'),normalized.documentColor);
  const rows=geometry.rows.map(r=>({...r,top:r.bounds.top,bottom:r.bounds.top+r.bounds.height,centerY:r.bounds.top+r.bounds.height/2,invoiceRegion:undefined}));
  // Existing Phase 3 amount/total recognizer unchanged; no invoice matching.
  const layout={documentBounds:{left:0,top:0,width:geometry.sourceWidth,height:geometry.sourceHeight},rows,columns:{},footerRegion:geometry.totalCandidateRegion,totalCandidateRegion:geometry.totalCandidateRegion};
  const fields=await recognizeFields(normalized.documentColor,layout,doc.id);
  for(let i=0;i<geometry.rows.length;i++)if(geometry.rows[i].invoiceRegion)await sharp(normalized.documentColor).extract(geometry.rows[i].invoiceRegion).png().toFile(path.join(dest,`invoice-${i}.png`));
  const report={id:doc.id,normalization:normalized.evidence,layout:geometry,fields,completeMs:performance.now()-start};
  fs.writeFileSync(path.join(dest,'pipeline.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id:doc.id,rows:rows.length,ms:report.completeMs}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
