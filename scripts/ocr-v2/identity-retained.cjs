/* eslint-disable @typescript-eslint/no-require-imports -- Private offline evidence adapters. */
const fs = require('node:fs'), path = require('node:path');
const { read, hash, privatePath } = require('./dataset/core.cjs');
exports.loadIdentityRetained = function(config, root, id, image, current) {
    const result = [], sourceHash = hash(image), access = f => privatePath(config, f);
    function payment(o, stage, timestamp) {
        const variant = o.variant.replace(/^retained-/, '').replace(/^(?:header-line|label)-/, '');
        const scale = /header-line|label-/.test(o.variant) ? 2 : ['header','footer-label'].includes(o.field) ? 1 : 2;
        const psm = scale === 1 ? 11 : 7, whitelist = o.field === 'check' ? 'digits' : variant === 'numeric-focused' || o.variant.startsWith('retained-') ? 'money' : 'none';
        result.push({ observation: o, stage, timestamp, variant, configuration: `psm${psm}-scale${scale}-border12-whitelist-${whitelist}`, currentGeometry: !o.variant.startsWith('retained-') });
    }
    function readPayment(value, stage, timestamp) {
        const e = value.evidence ?? value;
        for (const o of [...(e.rows??[]).flatMap(r=>r.observations??[]), ...(value.observations??e.headerEvidence?.observations??[]), ...(e.totalEvidence?.observations??[])]) payment(o,stage,timestamp);
    }
    for (const relative of [`phase5b/final/${id}-payment-evidence.json`,`phase5c/committed/${id}.json`,`phase5c/committed-complete/${id}/pipeline.json`]) {
        const file=access(path.join(root,relative));if(!fs.existsSync(file))continue;
        const value=read(file);readPayment(value.phase5c??value,relative,fs.statSync(file).mtime.toISOString());
    }
    if(current)readPayment(current,'current-phase5c',new Date().toISOString());
    const phase3 = [{ file: path.join(root,'generalization-v1/pipeline',id,'pipeline.json'), imageHash: sourceHash, generalized: true }];
    // These earlier full Phase 5 runs retain OCR text/geometry but no lossless
    // amount/header crop digest. Preserve them as unauthenticated observations;
    // never fabricate the missing historical provenance by hashing a new crop.
    for(const folder of ['complete-final','complete-replay']) {
        const file=access(path.join(root,'phase5',folder,id,'pipeline.json'));
        if(fs.existsSync(file))phase3.push({file,imageHash:'historical-normalized-hash-unavailable',generalized:true,stage:'phase5-'+folder});
    }
    if(config.phase5cRetainedFile)for(const s of read(access(config.phase5cRetainedFile)).filter(s=>s.documentId===id))phase3.push({file:s.observations,imageHash:hash(fs.readFileSync(access(s.normalizedImage))),crops:s.crops});
    for(const source of phase3){const file=access(source.file),value=read(file),fields=source.generalized?value.fields:value;
        for(const o of fields.observations??[]){if(o.status!=='completed')continue;
            let cropHash='unavailable';const c=fields.crops?.find(c=>c.regionId===o.regionId);if(c?.sha256)cropHash=c.sha256;
            if(source.crops){const p=access(path.join(source.crops,o.regionId+'.png'));if(fs.existsSync(p))cropHash=hash(fs.readFileSync(p));}
            // Generalized Phase 3 stores the raw crop hash in the crop descriptor.
            if(c?.cropHash)cropHash=c.cropHash;
            const field=o.field==='footer'?'footer-label':o.field;
            if(!['amount','total','footer-label','header','check'].includes(field))continue;
            const index=o.rowId?Number(o.rowId.match(/\d+$/)[0])-1:null;
            result.push({observation:{id:`${id}:phase3:${o.regionId}:${o.variant}`,scope:index===null?'document':'row',rowId:index===null?undefined:`${id}-${index}`,field,variant:o.variant,raw:o.rawText,bounds:o.bounds,sourceHash:source.imageHash,cropHash,durationMs:o.durationMs,confidence:o.confidence,money:[],words:o.words},stage:source.stage??(source.generalized?'generalized-phase3':'original-phase3'),timestamp:fs.statSync(file).mtime.toISOString(),variant:o.variant,configuration:`psm${o.configuration.psm}-scale${o.scale}-border${o.border}-whitelist-${o.configuration.whitelist?'money':'none'}`,currentGeometry:false});
        }
    }
    // Preserve exploratory Phase 5 artifacts too. Their exact historical OCR
    // configuration was not frozen, so they cannot create additional votes.
    function collect(value,file,timestamp) {
        if(!value||typeof value!=='object')return;
        if(typeof value.raw==='string'&&value.bounds&&value.sourceHash&&value.cropHash&&['amount','total','header','footer-label'].includes(value.field)) {
            result.push({observation:value,stage:path.relative(root,file),timestamp,variant:value.variant,configuration:'unfrozen-historical-configuration',rejectionReason:'Historical OCR configuration not frozen; diagnostic-only'});return;
        }
        for(const [key,child] of Object.entries(value))if(!['resolved','snapshot','document','groundTruth','truth'].includes(key))collect(child,file,timestamp);
    }
    function visit(directory) {
        for(const entry of fs.readdirSync(access(directory),{withFileTypes:true})) {
            if(entry.isSymbolicLink())continue;
            const file=access(path.join(directory,entry.name));
            if(entry.isDirectory())visit(file);
            else if(entry.name.endsWith('.json')&&(entry.name===id+'.json'||entry.name===id+'-payment-evidence.json'||path.basename(directory)===id)&&!entry.name.includes('summary'))collect(read(file),file,fs.statSync(file).mtime.toISOString());
        }
    }
    for(const phase of ['phase5b','phase5c'])visit(path.join(root,phase));
    return result;
};
exports.appendFrozenInvoiceEvidence = function(ledger, document) {
    for(const row of document.rows)for(const o of row.fusion.observations)ledger.append({field:'invoice',documentId:document.id,rowId:row.rowId,sourceHash:o.cropReference.sourceImageSha256,cropHash:o.cropReference.baseCropSha256,region:row.geometry,recognizer:o.recognizer,variant:o.cropReference.variant,configuration:'frozen-phase4-adapter',raw:o.rawText,normalized:o.formatNormalizedText?[o.formatNormalizedText]:[],confidence:o.sequenceConfidence??0,provenance:{valid:true,reason:'Frozen invoice observation; ledger does not alter fusion or interpret uncalibrated confidence',reference:o.id},timestamp:new Date().toISOString(),stage:'frozen-invoice-fusion'});
};
