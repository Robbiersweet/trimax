/* eslint-disable @typescript-eslint/no-require-imports -- Explicit private real-image gate; no image/answers in Git. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const {analyzeUnseenDocument}=require('../../src/app/lib/ocrV2/semantics/index.ts');
const {normalizeDocument}=require('../../src/app/lib/ocrV2/documentNormalization.ts');
(async()=>{
 const manifestFile=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');
 for(const file of [manifestFile,out])assert(path.relative(process.cwd(),file).startsWith('..'),'Private artifacts must stay outside repository');
 const fixture=JSON.parse(fs.readFileSync(manifestFile)),bytes=fs.readFileSync(path.resolve(path.dirname(manifestFile),fixture.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.sha256);
 const result=await analyzeUnseenDocument(bytes,'private-native-regression','private-native-regression');
 // Labels/expectations enter only after inference.
 const rows=result.model.table.rows;assert.equal(rows.length,fixture.expectedRows);assert.notEqual(result.model.documentType,'unknown_review');assert(result.normalization.documentGeometry.reliable);
 assert(result.model.table.columns.some(c=>c.type==='invoice_number'));assert(result.model.table.columns.some(c=>c.type==='row_amount'));
 const normalized=await normalizeDocument(bytes);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'paper.png'),normalized.documentColor);
 for(let i=0;i<rows.length;i++){const r=rows[i];assert(r.invoiceRegion&&r.amountRegion);assert(r.invoiceRegion.left+r.invoiceRegion.width<r.amountRegion.left);if(i)assert(rows[i-1].bounds.top+rows[i-1].bounds.height<=r.bounds.top);for(const field of ['invoiceRegion','amountRegion']){assert(r[field].width>0&&r[field].height>0);await sharp(normalized.documentColor).extract(r[field]).png().toFile(path.join(out,`row-${i}-${field}.png`));}}
 console.log(JSON.stringify({gate:'PASS private native-still layout',hash:fixture.sha256,rows:rows.length,columns:result.model.table.columns,document:result.normalization.normalization.documentDimensions,classification:result.model.documentType}));
})().catch(e=>{console.error(e);process.exitCode=1;});
