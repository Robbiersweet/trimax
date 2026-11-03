/* eslint-disable @typescript-eslint/no-require-imports -- Prove the transport-only draft leaves all production recognition and financial code unchanged. */
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const baseline='52dfc56445229c055a6b9fa90727b1be7116798f';
const allowed=new Set(['src/app/components/BatchInvoicePayments.tsx','src/app/components/RecentScans.tsx','src/app/lib/ocrCanonical.ts','src/app/lib/ocrCanonicalClient.ts','src/app/lib/ocrCanonicalObject.ts','src/app/lib/ocrHistory.ts','src/app/lib/ocrHistoryClient.ts','scripts/ocr-upload-retry-regression.cjs','scripts/ocr-upload-retry-scope-regression.cjs','scripts/ocr-performance-scope-regression.cjs','scripts/release/gate-checks.cjs']);
const paths=require('./release/contract.cjs').sourcePaths;
for(const args of [['diff',baseline,'--name-only','--',...paths],['ls-files','--others','--exclude-standard','--',...paths]]){
 const changed=cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
 assert(changed.every(file=>allowed.has(file)),'Unexpected source change: '+changed.filter(file=>!allowed.has(file)).join(', '));
}
const original=cp.execFileSync('git',['show',baseline+':src/app/components/BatchInvoicePayments.tsx'],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');
const current=fs.readFileSync('src/app/components/BatchInvoicePayments.tsx','utf8').replaceAll('\r\n','\n');
for(const [start,end] of [['      const data = (await response.json()', '    } catch (error) {'],['  async function applyBatchPayment(', '\n  function ']]){
 const a=original.indexOf(start),b=current.indexOf(start);assert(a>=0&&b>=0,start);
 const x=original.indexOf(end,a),y=current.indexOf(end,b);assert(x>a&&y>b,end);
 assert.equal(current.slice(b,y).replaceAll('\r\n','\n'),original.slice(a,x).replaceAll('\r\n','\n'),'Review/recognition and payment handler must remain identical');
}
console.log('PASS transport-only draft scope: unchanged recognizers, batching/performance, matching, monetary validation, duplicate checks, atomic posting, worker/job lifecycle, SQL/RLS/grants, financial API and QR/settings; unchanged review result and apply handlers');
