/* eslint-disable @typescript-eslint/no-require-imports -- Offline adversarial contracts. */
const assert = require('assert/strict'), sharp = require('sharp'), { createWorker, OEM, PSM } = require('tesseract.js');
const study = require('./invoice-study.cjs');
(async () => {
    assert.equal(study.configurations.length, 10);
    const exact = { exact: true, characterAccuracy: 1, distance: 0, changes: [] };
    assert(study.phase4Gate(Array(5).fill(exact)));
    assert(study.phase4Gate([...Array(4).fill(exact), { exact: false, characterAccuracy: .875, distance: 1, changes: [{ expected: '0', observed: 'O' }] }]));
    assert(!study.phase4Gate([...Array(4).fill(exact), { exact: false, characterAccuracy: .5, distance: 4, changes: [] }]));
    assert(!study.phase4Gate([...Array(4).fill(exact), { exact: false, characterAccuracy: .875, distance: 1, changes: [{ expected: '5', observed: '' }] }]));
    for (const raw of ['INV-O5I3', 'INV-LS10', 'INV0513', '0513', 'NV-0513', 'INV-051', 'QX-9237', 'INV-SB9Y'])
        assert.equal(study.normalizeToken(raw).normalizedText, raw);
    assert.equal(study.normalizeToken(' | inv – 8294! ').normalizedText, 'INV-8294');
    assert.equal(study.normalizeToken('INV0513').structuralCandidate.text, 'INV-0513');
    assert.equal(study.normalizeToken('INVO513').structuralCandidate, null, 'No O-to-zero substitution');
    const crop = { rowId: 'synthetic-1', bounds: { left: 20, top: 20, width: 300, height: 50 }, ownership: { left: 0, top: 20, width: 360, height: 50 } };
    const base = Buffer.from('<svg width="360" height="100"><rect width="360" height="100" fill="white"/><text x="35" y="57" font-family="Arial" font-size="30">QX-7824</text></svg>');
    const source = await sharp(base).png().toBuffer(), original = Buffer.from(source);
    const altered = await sharp(source).composite([{ input: Buffer.from('<svg width="360" height="30"><rect width="360" height="30" fill="black"/></svg>'), top: 70, left: 0 }]).png().toBuffer();
    for (const config of study.configurations) {
        const a = await study.prepare(source, crop, config), b = await study.prepare(altered, crop, config);
        assert(a.image.equals(b.image), 'Neighbor pixels cannot leak');
        assert(a.bounds.top >= 20 && a.bounds.top + a.bounds.height <= 70);
    }
    assert(source.equals(original), 'Original is immutable');
    const bounds = study.paddedBounds(crop, { padding: .04, verticalPadding: .04 }, { width: 360, height: 100 });
    assert.equal(bounds.top, 20);
    assert.equal(bounds.height, 50);
    assert(bounds.width > crop.bounds.width);
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath: require('path').join(require('os').tmpdir(), 'trimax-v2-tesseract'), logger: () => { } });
    try {
        const observation = await study.observe(worker, source, crop, { ...study.configurations[0], mode: PSM.SINGLE_LINE }, 'synthetic');
        assert.equal(observation.imageId, 'synthetic');
        assert.equal(observation.status, 'completed');
        assert.equal(observation.normalizedText, 'QX-7824');
        for (const [name, text] of [['faint-final', 'QX-782<tspan fill="#ccc">4</tspan>'], ['missing-prefix', '7824'], ['missing-hyphen', 'QX7824'], ['confusable', 'OI1LS5B8'], ['clipped', '<tspan x="-8">Q</tspan>X-7824']]) {
            const bytes = await sharp(Buffer.from(`<svg width="360" height="100"><rect width="360" height="100" fill="white"/><text x="35" y="57" font-size="30" font-family="Arial">${text}</text></svg>`)).png().toBuffer();
            const o = await study.observe(worker, bytes, crop, study.configurations[7], name);
            assert.equal(o.status, 'completed');
            assert.deepEqual(study.normalizeToken(o.rawText).normalizedText, o.normalizedText);
            assert(o.ocrMs >= 0 && o.preprocessingMs >= 0);
        }
    }
    finally {
        await worker.terminate();
    }
    const blank = await sharp({ create: { width: 100, height: 40, channels: 3, background: 'white' } }).png().toBuffer();
    assert.equal((await study.segments(blank)).length, 0);
    console.log('Phase 3B passed: bounded variants, confusable glyph preservation, no digit invention, alternative prefix, missing prefix/hyphen, faint/clipped text, exact crop ownership, neighbor isolation, immutable source, timing and observation provenance.');
})().catch(e => { console.error(e); process.exitCode = 1; });
