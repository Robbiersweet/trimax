/* eslint-disable @typescript-eslint/no-require-imports -- Offline Phase 5C; truth enters after resolution. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { recognizeDocumentTotal } = require('../../src/app/lib/ocrV2/recognition/documentTotalAuthority.ts');
const { resolveOfflineDocument } = require('../../src/app/lib/ocrV2/resolver/index.ts');
const { privatePath } = require('./dataset/core.cjs');
const [root, out, retainedConfig] = process.argv.slice(2), config = { repository: process.cwd(), privateRoots: [path.dirname(root)] };
privatePath(config, out);
privatePath(config, root);
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
(async () => {
    assert(!fs.existsSync(out), 'Fresh output required');
    fs.mkdirSync(out, { recursive: true });
    const templates = read(path.join(root, 'phase5/resolver-evidence.json')), results = [];
    for (const template of templates) {
        const id = template.document.id, imagePath = path.join(root, 'generalization-v1/pipeline', id, 'document.png'), image = fs.readFileSync(imagePath), pipeline = read(path.join(root, 'generalization-v1/pipeline', id, 'pipeline.json')), old = read(path.join(root, 'phase5b/final', id + '-payment-evidence.json'));
        const retained = require('./retained-payment-fields.cjs').loadRetainedPaymentFields(config, retainedConfig, id, image);
        const revised = await recognizeDocumentTotal(image, pipeline.layout, old, retained), document = structuredClone(template.document);
        document.rows.forEach(row => { const ev = revised.evidence.rows.find(r => r.rowId === row.rowId); row.amounts = ev.cents === null ? [] : ev.observations.filter(o => ev.provenance.includes(o.id)).map(o => ({ cents: ev.cents, raw: o.raw, observationId: o.id, rowId: row.rowId })); });
        document.header = { payor: old.payor, checkNumber: old.checkNumber, checkDate: old.checkDate, total: revised.authority.cents === null ? null : { amount: revised.authority.cents / 100, source: 'explicit-document-total', payable: true }, provenance: 'Phase 5C structural document-total authority; no truth or invoice amounts in extraction' };
        const resolved = resolveOfflineDocument(document, template.snapshot);
        results.push({ id, ...revised, resolved });
        fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(results.at(-1), null, 2));
        console.log(JSON.stringify({ id, total: revised.authority.cents, amounts: revised.evidence.rows.map(r => r.cents), reason: revised.authority.reason, status: resolved.status, extraPasses: revised.extraPasses, incrementalMs: revised.incrementalMs }));
    }
    fs.writeFileSync(path.join(out, 'unscored-results.json'), JSON.stringify(results, null, 2));
    const truth = read(path.join(root, 'generalization-v1/ground-truth.json')).documents, norm = s => s.replace(/\D/g, '').replace(/^0+/, '');
    const summary = results.map(r => {
        const t = truth.find(t => t.id === r.id), wrongAuto = r.resolved.automaticInvoiceIds.filter((id, i) => norm(r.resolved.snapshot.invoices.find(x => x.id === id).displayId) !== norm(t.rows[i].invoice)).length;
        const exact = r.evidence.rows.filter((row, i) => row.cents === t.rows[i].amountCents).length, wrong = r.evidence.rows.filter((row, i) => row.cents !== null && row.cents !== t.rows[i].amountCents).length;
        assert.equal(wrongAuto, 0);
        assert.equal(wrong, 0);
        if (r.authority.cents !== null)
            assert.equal(r.authority.cents, t.totalCents, 'Wrong authoritative total');
        if (r.resolved.automaticInvoiceIds.length) {
            assert.equal(new Set(r.resolved.automaticInvoiceIds).size, t.rows.length);
            assert.equal(r.resolved.assignments.length, 1);
            assert.equal(r.resolved.assignments[0].totalCents, r.authority.cents);
            assert.equal(r.resolved.audit.filter(a => !a.blockers.length).length, 1);
        }
        return { id: r.id, rows: t.rows.length, exactAmounts: exact, ambiguous: r.evidence.rows.filter(row => row.cents === null && row.candidates.length).length, missing: r.evidence.rows.filter(row => !row.candidates.length).length, wrongAmounts: wrong, total: r.authority.cents, exactTotal: r.authority.cents === t.totalCents, check: r.evidence.checkNumber, date: r.evidence.checkDate, automaticRows: r.resolved.automaticInvoiceIds.length, wrongAutomaticRows: wrongAuto, status: r.resolved.status, observedSubtotal: r.authority.subtotal, observedReconciliationDifference: r.authority.cents !== null && r.authority.subtotal !== null ? r.authority.subtotal - r.authority.cents : null, resolverDifference: r.resolved.assignments.length === 1 ? r.resolved.assignments[0].totalCents - r.authority.cents : null, extraPasses: r.extraPasses, incrementalMs: r.incrementalMs };
    });
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
})().catch(e => { console.error(e); process.exitCode = 1; });
