/* eslint-disable @typescript-eslint/no-require-imports -- Private, offline benchmark; no business IDs, tokens or database writes. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const labels = require('./labels.json'), loadLegacy = require('./legacy-loader.cjs');
const manifestPath = process.argv[2], mode = process.argv[3] || 'baseline';
if (!manifestPath)
    throw Error('Usage: node scripts/ocr-v2/benchmark.cjs PRIVATE_MANIFEST baseline|foundation');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const root = path.dirname(path.resolve(manifestPath));
if (!path.relative(process.cwd(), root).startsWith('..'))
    throw Error('Real-image fixtures and outputs must remain outside the repository.');
const report = { mode, createdAt: new Date().toISOString(), scope: 'Offline still-image server replay; not camera, network, browser or physical acceptance timing.', fixtures: [] };
function editDistance(a, b) { const row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) {
    let last = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
        last = old;
    }
} return row[b.length]; }
function measure(result, truth) {
    const rows = result.structuredRowEvidence || [], n = truth.invoices.length;
    const invoiceMatches = truth.invoices.map((id, i) => rows[i]?.normalizedInvoiceCandidates?.length === 1 && rows[i].normalizedInvoiceCandidates[0] === id);
    const amounts = truth.amounts.map((amount, i) => { const v = [...new Set((rows[i]?.amountCandidates || []).filter(x => x.selected).map(x => x.value))]; return v.length === 1 && v[0] === amount; });
    const chars = truth.invoices.reduce((sum, id, i) => sum + Math.min(id.length, editDistance(id, rows[i]?.normalizedInvoiceCandidates?.length === 1 ? rows[i].normalizedInvoiceCandidates[0] : '')), 0);
    const total = result.totalEvidence?.payable && result.totalEvidence.amount === truth.total;
    const check = truth.check ? result.checkNumber === truth.check : null, date = truth.date ? result.checkDate === truth.date : null;
    return { rowCount: rows.length, expectedRows: n, rowCountCorrect: rows.length === n, rowPrecision: null, rowRecall: null, rowMetricNote: 'Phase 1 has no layout detector; do not misrepresent row count as geometric precision/recall.', invoiceExactPercent: 100 * invoiceMatches.filter(Boolean).length / n, invoiceCharacterAccuracy: 100 * (1 - chars / truth.invoices.join('').length), amountExactPercent: 100 * amounts.filter(Boolean).length / n, totalCorrect: Boolean(total), checkCorrect: check, dateCorrect: date, documentExact: rows.length === n && invoiceMatches.every(Boolean) && amounts.every(Boolean) && Boolean(total) && check !== false && date !== false, scoring: 'Strict ordered rows, unique observed candidate required; no database corroboration or inferred invoice IDs.' };
}
async function post(body) {
    const { route, commit } = loadLegacy(manifest.baselineCommit), start = performance.now();
    const response = await route.POST(new Request('http://offline.invalid/api/payments/extract-check-stub', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ocr-observation-scope': crypto.randomUUID() }, body: JSON.stringify(body) }));
    return { commit, status: response.status, ms: performance.now() - start, data: await response.json() };
}
(async () => {
    for (const [id, truth] of Object.entries(labels)) {
        const entry = manifest.fixtures[id];
        if (!entry) {
            report.fixtures.push({ id, available: false, reason: 'No retained original available; text labels are not an optical fixture.' });
            continue;
        }
        const inputPath = path.resolve(root, entry.file);
        if (path.relative(root, inputPath).startsWith('..'))
            throw Error('Fixture escapes private root');
        const input = fs.readFileSync(inputPath), hash = crypto.createHash('sha256').update(input).digest('hex');
        if (entry.sha256 && entry.sha256 !== hash)
            throw Error('Fixture identity mismatch');
        const output = path.join(root, mode + '-' + id);
        fs.mkdirSync(output, { recursive: true });
        const start = performance.now();
        let item;
        if (mode === 'baseline') {
            const orientation = await post({ mode: 'orientation-probe', captureCandidates: [{ id: 'still', label: 'Original retained still', imageDataUrl: 'data:image/jpeg;base64,' + input.toString('base64') }] });
            fs.writeFileSync(path.join(output, 'orientation.json'), JSON.stringify(orientation.data));
            if (!orientation.data.imageDataUrl || orientation.status !== 200) {
                item = { id, available: true, hash, error: 'Legacy orientation did not return a usable still', status: orientation.status, metrics: measure({}, truth), orientationMs: orientation.ms };
            }
            else {
                const preflight = await post({ mode: 'capture-source-selection', captureCandidates: [{ id: 'still', label: 'Original retained still', imageDataUrl: orientation.data.imageDataUrl }] });
                const detail = await post({ imageDataUrl: orientation.data.imageDataUrl, documentType: 'remittance_stub' });
                fs.writeFileSync(path.join(output, 'response.json'), JSON.stringify(detail.data));
                fs.writeFileSync(path.join(output, 'preflight.json'), JSON.stringify(preflight.data));
                item = { id, available: true, hash, commit: detail.commit, metrics: measure(detail.data, truth), orientationMs: orientation.ms, preflightMs: preflight.ms, detailedMs: detail.ms, orientationResolved: orientation.data.resolved, rotation: orientation.data.rotation, paperBoundsAccuracy: null, passCount: { orientation: orientation.data.passes?.length ?? null, preflight: preflight.data.evaluations?.[0]?.variantOutcomes?.length ?? null, detailedCompleted: detail.data.evidence?.rawPasses?.length ?? null }, note: 'Same authoritative still; preflight cannot replace it with video. Server stages replayed from pinned production commit. Camera/source competition is outside this benchmark.' };
            }
        }
        else if (mode === 'foundation') {
            const { normalizeDocument } = require('../../src/app/lib/ocrV2/documentNormalization.ts');
            const normalized = await normalizeDocument(input);
            fs.writeFileSync(path.join(output, 'normalized-full.png'), normalized.normalizedFull);
            fs.writeFileSync(path.join(output, 'document-color.png'), normalized.documentColor);
            for (const [name, bytes] of Object.entries(normalized.variants))
                fs.writeFileSync(path.join(output, name + '.png'), bytes);
            fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(normalized.evidence, null, 2));
            const { writeVisuals } = require('./visuals.cjs');
            await writeVisuals(normalized, output);
            const geometry = require('./metrics.cjs').geometryMetrics(normalized.evidence, truth);
            // Ablation holds the recognizer constant; this is not a v2 layout/field engine.
            const legacyAfter = await post({ imageDataUrl: 'data:image/png;base64,' + normalized.documentColor.toString('base64'), documentType: 'remittance_stub' });
            fs.writeFileSync(path.join(output, 'legacy-after-response.json'), JSON.stringify(legacyAfter.data));
            const variants = await require('./variant-ablation.cjs').variantAblation(normalized, truth, output);
            item = { id, available: true, hash, evidence: normalized.evidence, geometry, legacyRecognizerAfter: { metrics: measure(legacyAfter.data, truth), status: legacyAfter.status, ms: legacyAfter.ms, completedPasses: legacyAfter.data.evidence?.rawPasses?.length ?? null }, diagnosticVariantAblation: variants, recognition: 'V2 recognition not implemented. Legacy ablation and five fixed diagnostic passes measure optical transformations only; not a production pipeline.' };
        }
        else
            throw Error('Unknown mode');
        item.completeMs = Math.round(performance.now() - start);
        report.fixtures.push(item);
    }
    const available = report.fixtures.filter(x => x.available);
    report.realImageCount = available.length;
    if (mode === 'baseline')
        report.aggregate = { documentExact: available.filter(x => x.metrics.documentExact).length + '/' + available.length, manualReviewPercent: 100 * available.filter(x => !x.metrics.documentExact).length / available.length, meanColdMs: available.reduce((s, x) => s + x.completeMs, 0) / available.length };
    fs.writeFileSync(path.join(root, mode + '-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
