/* eslint-disable @typescript-eslint/no-require-imports -- Capture-only release boundary against the deployed email-approved revision. */
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const baseline='991f5d0bb8f914465c7f695d4beb060fed964012',paths=require('./release/contract.cjs').sourcePaths;
const allowed=new Set(['src/app/components/RemittanceCamera.tsx','src/app/components/BatchInvoicePayments.tsx','src/app/lib/highResolutionStill.ts','scripts/remittance-camera-browser.cjs','scripts/remittance-matching-regression.ts','scripts/remittance-auto-capture-scope-regression.cjs','scripts/release/gate-checks.cjs']);
for(const args of [['diff',baseline,'--name-only','--',...paths],['ls-files','--others','--exclude-standard','--',...paths]]){
 const changed=cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
 assert(changed.every(p=>allowed.has(p)),'Unexpected automatic-capture source change: '+changed.filter(p=>!allowed.has(p)).join(', '));
}
const file='src/app/components/BatchInvoicePayments.tsx',old=cp.execFileSync('git',['show',baseline+':'+file],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');
const expected=old.replace('Reviewed still crop prepared; untouched original retained separately.','Full-resolution still prepared automatically; untouched original retained separately.').replace('User-reviewed high-resolution still','Automatic full-resolution still intake').replace('reviewed crop ${JSON.stringify(originalStill.crop)}','preserved frame ${JSON.stringify(originalStill.crop)}').replace('User-reviewed still crop; untouched original retained for private archival.','Full-resolution original sent directly to automatic normalization and document isolation; untouched original retained for private archival.');
assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),expected,'Only intake diagnostic labels may change; all review/resume/payment handlers remain exact');
const camera=fs.readFileSync('src/app/components/RemittanceCamera.tsx','utf8');
assert(!camera.includes('StillCropReview'));assert(!camera.includes('drawImage('));assert(camera.includes("onCapture(file,'camera',artifact)"));assert(camera.includes("onCapture(file,'existing')"));assert(camera.includes('crop:{...FULL_STILL}'));assert(camera.includes('capture="environment"'));
console.log('PASS automatic original-still handoff; unchanged review/payment/history handlers, OCR algorithms, jobs, matching, money, SQL, auth, email approval and website');
