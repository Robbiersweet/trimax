/* eslint-disable @typescript-eslint/no-require-imports -- Private replay expectations are supplied only after inference. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [imageFile,legacyFile,shadowFile,rowCount]=process.argv.slice(2);
for(const file of [imageFile,legacyFile,shadowFile])assert(file&&path.relative(process.cwd(),path.resolve(file)).startsWith('..'),'Private replay artifacts must be outside repository');
const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(imageFile)).digest('hex');
const legacy=JSON.parse(fs.readFileSync(legacyFile)),shadow=JSON.parse(fs.readFileSync(shadowFile));
assert.equal(legacy.sourceHash,sourceHash);assert.equal(shadow.sourceImageHash,sourceHash);
assert(legacy.result.diagnostics.orientation.certain);
assert.equal(legacy.result.diagnostics.passTimings[0].sourceRotation,shadow.normalization.normalization.rotation);
assert.equal(legacy.result.diagnostics.passTimings[0].rotation,0,'First detailed pass must use the normalized pixels');
assert(shadow.model.table.columns.some(c=>c.type==='row_amount'&&c.semanticConfidence==='label-supported'));
assert(shadow.model.table.supported);assert.equal(shadow.paymentCanApply,false);
assert.equal(shadow.model.table.rows.length,Number(rowCount),'Every expected physical row must reach specialized recognition');
assert.notEqual(shadow.models.status,'not-run-no-supported-invoice-cells');
console.log('PASS same-image first-pass orientation, Amount column, physical rows and diagnostic-only execution');
assert.equal(shadow.physicalRows.filter(r=>r.specializedInvoiceInvoked&&r.specializedMoneyInvoked).length,Number(rowCount),'Every frozen row reaches both specialized recognizers');
