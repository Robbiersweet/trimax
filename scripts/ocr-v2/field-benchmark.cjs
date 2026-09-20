/* eslint-disable @typescript-eslint/no-require-imports -- Offline benchmark only. */
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp'), assert = require('node:assert/strict');
const { recognizeFields } = require('../../src/app/lib/ocrV2/recognition/index.ts');
const { normalizeDocument } = require('../../src/app/lib/ocrV2/documentNormalization.ts');
const { detectLayout } = require('../../src/app/lib/ocrV2/layout/index.ts');
function distance(a, b) { let prev = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
        next.push(Math.min(next[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] !== b[j] ? 1 : 0)));
    prev = next;
} return prev[b.length]; }
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
(async () => {
    const root = path.dirname(path.resolve(process.argv[2]));
    assert(path.relative(process.cwd(), root).startsWith('..'), 'Private output only');
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), original = fs.readFileSync(path.join(root, manifest.fixtures.B.file));
    assert.equal(require('node:crypto').createHash('sha256').update(original).digest('hex'), manifest.fixtures.B.sha256);
    const began = performance.now(), normalized = await normalizeDocument(original), layout = await detectLayout(normalized.documentColor);
    const result = await recognizeFields(normalized.documentColor, layout, 'B');
    const totalMs = performance.now() - began;
    // Evaluation truth enters only after recognition has finished.
    const truth = require('./labels.json').B, output = path.join(root, 'phase3-B');
    fs.mkdirSync(output, { recursive: true });
    const evaluations = result.crops.map(c => {
        const obs = result.observations.filter(o => o.regionId === c.regionId), best = obs.filter(o => o.status === 'completed').sort((a, b) => b.confidence - a.confidence || b.rawText.trim().length - a.rawText.trim().length)[0];
        const i = layout.rows.findIndex(r => r.id === c.rowId);
        const expected = c.field === 'invoice' ? truth.invoices[i] : c.field === 'amount' ? '1,099.00' : c.field === 'total' || c.field === 'footer' ? '5,495.00' : c.field === 'header' ? `CHECK ${truth.check}; DATE 08/19/2026` : '';
        const exact = o => c.field === 'invoice' ? o.candidates.includes(expected) : ['amount', 'total', 'footer'].includes(c.field) ? o.moneyCandidates.some(m => m.cents === Math.round((c.field === 'amount' ? truth.amounts[i] : truth.total) * 100)) : c.field === 'header' ? o.checkCandidates.includes(truth.check) && o.dateCandidates.includes('08/19/2026') : false;
        const actual = best?.normalizedText ?? '';
        const expectedDigits = expected.replace(/\D/g, ''), actualDigits = actual.replace(/\D/g, '');
        return { regionId: c.regionId, field: c.field, expected, bestRaw: best?.rawText ?? '', bestVariant: best?.variant, confidence: best?.confidence, bestExact: best ? exact(best) : false, anyExact: obs.some(exact), characterAccuracy: expected ? Math.max(0, 1 - distance(actual, expected) / expected.length) : null, numericCharacterAccuracy: expectedDigits ? Math.max(0, 1 - distance(actualDigits, expectedDigits) / expectedDigits.length) : null, ambiguous: new Set(obs.map(o => o.normalizedText)).size > 1, observations: obs };
    });
    const report = { ...result, metrics: require('./field-metrics.cjs').summarize(result, evaluations, truth), normalizationMs: normalized.evidence.metrics.completeMs, layoutMs: layout.diagnostics.durationMs, completeMs: totalMs, evaluations };
    fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify(report, null, 2));
    const tiles = [];
    let y = 0;
    for (const e of evaluations.filter(e => e.field !== 'date')) {
        const c = result.crops.find(c => c.regionId === e.regionId), crop = await sharp(normalized.documentColor).extract(c.bounds).png().toBuffer();
        fs.writeFileSync(path.join(output, e.regionId + '.png'), crop);
        const display = await sharp(crop).resize({ width: 1000, height: 170, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
        const label = Buffer.from(`<svg width="1100" height="85"><rect width="1100" height="85" fill="white"/><g font-family="Arial" font-size="18"><text x="10" y="22">${escape(e.regionId)} | ${escape(e.bestVariant)} | exact: ${e.bestExact}</text><text x="10" y="47">Raw: ${escape(e.bestRaw.trim().replace(/\s+/g, ' ').slice(0, 95))}</text><text x="10" y="72">Expected: ${escape(e.expected)}</text></g></svg>`);
        tiles.push({ input: label, left: 0, top: y });
        y += 85;
        tiles.push({ input: display.data, left: 10, top: y });
        y += display.info.height + 20;
    }
    await sharp({ create: { width: 1100, height: y, channels: 3, background: 'white' } }).composite(tiles).png().toFile(path.join(output, 'contact-sheet.png'));
    console.log(JSON.stringify({ durationMs: result.durationMs, completeMs: totalMs, passes: result.passCount, fields: evaluations.map(({ observations, ...e }) => ({ ...e, raw: observations.map(o => [o.variant, o.rawText, o.confidence]) })) }, null, 2));
    assert(result.observations.every(o => o.status === 'completed'), 'A field pass failed; inspect durable observations');
})();
