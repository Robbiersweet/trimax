/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real offline CLI with sanitized images. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),sharp=require('sharp'),c=require('./core.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-dataset-cli-')),inbox=path.join(root,'inbox');fs.mkdirSync(inbox);
 const bytes=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer();fs.writeFileSync(path.join(inbox,'one.png'),bytes);fs.writeFileSync(path.join(inbox,'copy.png'),bytes);
 const config=path.join(root,'config.json'),sources=path.join(root,'sources.json'),manifest=path.join(root,'manifest.json');
 c.write(config,{repository:path.resolve(__dirname,'../../..'),privateRoots:[root],seed:'test',frozenSplits:{}});
 function run(...args){const result=cp.spawnSync(process.execPath,[path.join(__dirname,'cli.cjs'),...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 run('discover',config,inbox,sources);assert.equal(c.read(sources).length,2);
 run('ingest',config,sources,manifest,'trimax-ocr-test-v1');const m=c.read(manifest);assert.equal(m.records.length,1);assert.equal(m.records[0].verificationStatus,'requires-annotation');assert.equal(m.records[0].verifiedTruth,null);
 const bundle=path.join(root,'truth.json');c.write(bundle,{purpose:'verified-dataset-labels',verifiedBy:'sanitized-reviewer',verifiedAt:'2026-01-01',sourceExportHash:c.hash('sanitized'),documents:[{independentDocumentId:m.records[0].independentDocumentId,imageHash:m.records[0].imageHash,businessTruthVerified:true,truth:{rows:[{rowId:'row-1',invoiceNumber:'INV-9000',amountCents:100}],authoritativeTotalCents:100}}]});
 const second=path.join(root,'manifest-v2.json');run('import-truth',config,manifest,bundle,second,'trimax-ocr-test-v2');run('validate',config,second);assert.equal(c.read(second).records[0].verificationStatus,'verified');assert.equal(c.read(manifest).records[0].verifiedTruth,null);
 assert.throws(()=>c.enforceFrozenSplits([{independentDocumentId:'protected',split:'train'}],{protected:'holdout'}));
 console.log('PASS CLI discovery, exact deduplication, draft labels, verified truth import, immutable version, split ledger');
})().catch(e=>{console.error(e);process.exitCode=1;});
