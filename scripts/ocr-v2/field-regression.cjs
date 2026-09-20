/* eslint-disable @typescript-eslint/no-require-imports -- Offline field contracts and supplementary optical tests. */
const assert = require('node:assert/strict'), sharp = require('sharp');
const { normalizeField } = require('../../src/app/lib/ocrV2/recognition/normalize.ts');
const { fieldCrops, fieldVariant, recognizeFields } = require('../../src/app/lib/ocrV2/recognition/index.ts');
(async () => {
    for (const token of ['INVO5I3', '1NV-LS10', 'INV-S015', 'INV0513', '0513', 'INV-051', 'NV-0513']) {
        const n = normalizeField(token, 'invoice');
        assert.equal(n.normalizedText, token);
        assert.deepEqual(n.candidates, [token]);
    }
    assert.equal(normalizeField(' inv–8123\n', 'invoice').normalizedText, 'INV-8123');
    for (const token of ['$1,099.00', '1099.00'])
        assert.equal(normalizeField(token, 'amount').moneyCandidates[0].cents, 109900);
    for (const token of ['1,09g.00', '1,09900', '1,099.0', '1,098,00', '.099.00', 'S1,099.00'])
        assert.equal(normalizeField(token, 'amount').moneyCandidates.length, 0, token);
    assert.equal(normalizeField('1,099.00 2,000.00', 'total').moneyCandidates.length, 2, 'No total selection/fusion');
    assert.deepEqual(normalizeField('CK:2797 DATE:08/19/2026', 'header').checkCandidates, ['2797']);
    assert.deepEqual(normalizeField('CK:2797', 'amount').checkCandidates, [], 'Body never supplies header');
    const row = { id: 'row-0001', top: 30.25, bottom: 90.75, centerY: 60, bounds: { left: 0, top: 30.25, width: 600, height: 60.5 }, invoiceRegion: { left: 10, top: 30.25, width: 250, height: 60.5 }, amountRegion: { left: 300, top: 30.25, width: 280, height: 60.5 } };
    const layout = { documentBounds: { left: 0, top: 0, width: 600, height: 170 }, rows: [row], columns: {}, footerRegion: { left: 0, top: 90.75, width: 600, height: 79.25 }, totalCandidateRegion: { left: 300, top: 105, width: 280, height: 50 } };
    const crops = fieldCrops(layout);
    for (const c of crops.filter(c => c.rowId)) {
        assert(c.bounds.top >= row.top);
        assert(c.bounds.top + c.bounds.height <= row.bottom);
    }
    const snapshot = JSON.stringify(layout);
    const svg = (tail = '') => Buffer.from(`<svg width="600" height="170"><rect width="600" height="170" fill="white"/><g font-family="Arial" font-size="30" fill="#333"><text x="20" y="72">INV-8123</text><text x="330" y="72">1,234.56</text><text x="330" y="140">2,345.67</text></g>${tail}</svg>`);
    const image = await sharp(svg()).png().toBuffer();
    const report = await recognizeFields(image, layout, 'synthetic-contract');
    assert.equal(JSON.stringify(layout), snapshot);
    assert.equal(report.passCount, 8);
    assert(report.observations.every(o => o.status === 'completed'));
    assert(report.observations.filter(o => o.field === 'amount').some(o => o.moneyCandidates.some(m => m.cents === 123456)));
    assert(report.observations.filter(o => o.field === 'total').some(o => o.moneyCandidates.some(m => m.cents === 234567)));
    assert(report.observations.filter(o => o.field === 'invoice').some(o => o.candidates.includes('INV-8123')));
    assert(report.observations.filter(o => o.field === 'amount').every(o => !o.moneyCandidates.some(m => m.cents === 234567)), 'Near footer cannot leak into row');
    // Pixel-level contamination proof: changing outside ownership cannot change an OCR crop.
    const changed = await sharp(svg('<rect y="91" width="600" height="79" fill="black"/>')).png().toBuffer();
    for (const c of crops.filter(c => c.rowId))
        for (const v of ['native', 'local-contrast']) {
            assert((await fieldVariant(image, c, v)).image.equals((await fieldVariant(changed, c, v)).image));
        }
    // Faint final digit / punctuation and clipped leading ink are retained, never repaired from truth.
    for (const [name, text] of [['faint final', 'INV-812<tspan fill="#ddd">3</tspan>'], ['faint comma', '1<tspan fill="#ddd">,</tspan>234.56'], ['faint decimal', '1,234<tspan fill="#ddd">.</tspan>56'], ['partial dollar', '<tspan x="-8">$</tspan>1,234.56'], ['clipped prefix', '<tspan x="-8">I</tspan>NV-8123']]) {
        const bytes = await sharp(Buffer.from(`<svg width="600" height="170"><rect width="600" height="170" fill="white"/><text x="20" y="72" font-family="Arial" font-size="30">${text}</text></svg>`)).png().toBuffer();
        const c = crops[0], prepared = await fieldVariant(bytes, c, 'local-contrast');
        assert(prepared.pixels.length > 0, name);
        const r = await recognizeFields(bytes, { ...layout, rows: [{ ...row, amountRegion: undefined }], footerRegion: undefined, totalCandidateRegion: undefined }, name);
        assert.equal(r.passCount, 2);
        assert(r.observations.every(o => o.status === 'completed' && o.imageId === name && o.transformations.every(t => !t.includes('digit'))));
    }
    await assert.rejects(() => recognizeFields(image, { ...layout, documentBounds: { ...layout.documentBounds, width: 601 } }, 'wrong-source'), /dimensions/);
    console.log('Phase 3 contracts, glyph ambiguity, missing prefix/hyphen, faint/clipped fields, strict money, multiple footer values, row isolation, mapped provenance and real synthetic optical tests passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
