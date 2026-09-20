/* eslint-disable @typescript-eslint/no-require-imports -- Private physical-image benchmark; no field OCR, fixture truth or database reaches detector. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { normalizeDocument } = require('../../src/app/lib/ocrV2/documentNormalization.ts');
const { detectLayout } = require('../../src/app/lib/ocrV2/layout/index.ts');
const { measureLayout } = require('./layout-metrics.cjs'), { layoutVisuals } = require('./layout-visuals.cjs');
(async () => {
    if (!process.argv[2])
        throw Error('Supply the private manifest outside the repository');
    const root = path.dirname(path.resolve(process.argv[2]));
    if (!path.relative(process.cwd(), root).startsWith('..'))
        throw Error('Real-image benchmark output must remain outside the repository');
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), report = { phase: 2, productionChanged: false, fixtures: [] };
    for (const id of ['A', 'B', 'C', 'D']) {
        const entry = manifest.fixtures[id];
        if (!entry) {
            report.fixtures.push({ id, available: false, reason: 'Structural labels only; no real original' });
            continue;
        }
        const inputPath = path.resolve(root, entry.file);
        if (path.relative(root, inputPath).startsWith('..'))
            throw Error('Image outside private fixture directory');
        const image = fs.readFileSync(inputPath), hash = crypto.createHash('sha256').update(image).digest('hex');
        assert.equal(hash, entry.sha256, 'Original fixture identity changed');
        const start = performance.now(), normalized = await normalizeDocument(image), layout = await detectLayout(normalized.documentColor), combinedMs = performance.now() - start;
        // Truth is read only AFTER detection completes. It is never an engine input.
        const truth = JSON.parse(fs.readFileSync(path.join(root, 'layout-' + id + '-annotation.json'), 'utf8'));
        assert.equal(crypto.createHash('sha256').update(normalized.documentColor).digest('hex'), truth.imageSha256, 'Manual annotation belongs to a different normalized image');
        const metrics = measureLayout(layout, truth), output = path.join(root, 'phase2-' + id);
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, 'document-color.png'), normalized.documentColor);
        fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(layout, null, 2));
        await layoutVisuals(normalized.documentColor, layout, output);
        const paper = require('./metrics.cjs').geometryMetrics(normalized.evidence, require('./labels.json')[id]);
        const passed = metrics.detectedRows === metrics.expectedRows && metrics.rowOverlaps.every(v => v >= .85) && metrics.rowOrderingCorrect && !metrics.adjacentRowOverlap && metrics.invoiceOverlap >= .85 && metrics.amountOverlap >= .7 && metrics.headerOverlap >= .9 && metrics.footerOverlap >= .75 && metrics.knownTotalLocationIncluded;
        report.fixtures.push({ id, available: true, sourceHash: hash, metrics, paperGeometry: paper, columns: layout.columns, normalizationMs: normalized.evidence.metrics.completeMs, layoutMs: layout.diagnostics.durationMs, combinedMs, layoutOcrPasses: 0, orientationProbes: normalized.evidence.metrics.ocrPassCount, passed, scope: 'Cold offline Phase 1 + Phase 2; not upload/UI or specialized recognition latency', annotation: truth.provenance, output });
    }
    fs.writeFileSync(path.join(root, 'phase2-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert(report.fixtures.some(x => x.available), 'No real optical fixture was run');
    assert(report.fixtures.filter(x => x.available).every(x => x.passed), 'Physical Phase 2 geometry gate failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
