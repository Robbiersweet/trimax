/* eslint-disable @typescript-eslint/no-require-imports -- Independent geometry and pixel oracles; synthetic tests are not real release evidence. */
const assert = require('node:assert/strict'), sharp = require('sharp'), fs = require('node:fs'), path = require('node:path');
const { detectDocumentGeometry, rectifyDocument, homography, transformPoint } = require('../../src/app/lib/ocrV2/documentGeometry.ts');
const { normalizeDocument, lightingVariants } = require('../../src/app/lib/ocrV2/documentNormalization.ts');
(async () => {
    const expected = [{ x: 100, y: 80 }, { x: 700, y: 105 }, { x: 660, y: 470 }, { x: 125, y: 490 }];
    const svg = Buffer.from('<svg width="800" height="600"><rect width="800" height="600" fill="#222"/><polygon points="100,80 700,105 660,470 125,490" fill="#eee"/><path d="M160 180H600M160 240H590M160 300H580" stroke="#ccc" stroke-width="3"/></svg>');
    const input = await sharp(svg).png().toBuffer(), geometry = await detectDocumentGeometry(input);
    assert(geometry.reliable, JSON.stringify(geometry));
    for (const p of expected)
        assert(Math.min(...geometry.corners.map(q => Math.hypot(q.x - p.x, q.y - p.y))) < 8, 'Paper corners must come from contour, not a bright-pixel area proxy');
    const rectified = await rectifyDocument(input, geometry);
    assert(rectified.matrix);
    assert((await sharp(rectified.image).metadata()).width > 580);
    const destination = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 400 }, { x: 0, y: 400 }], matrix = homography(destination, expected);
    destination.forEach((p, i) => { const actual = transformPoint(matrix, p); assert(Math.hypot(actual.x - expected[i].x, actual.y - expected[i].y) < 1e-6); });
    assert.throws(() => homography(destination, Array(4).fill({ x: 0, y: 0 })), /Degenerate/);
    const blank = await sharp({ create: { width: 160, height: 100, channels: 3, background: '#eee' } }).png().toBuffer();
    const unknown = await detectDocumentGeometry(blank);
    assert(!unknown.reliable);
    assert.deepEqual((await rectifyDocument(blank, unknown)).image, blank, 'Uncertain bounds must preserve every source pixel');
    const colors = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255, 0, 255, 255]);
    // A 2x3 asymmetric pattern verifies all EXIF reflections/rotations without OCR truth.
    const maps = { 1: [0, 1, 2, 3, 4, 5], 2: [1, 0, 3, 2, 5, 4], 3: [5, 4, 3, 2, 1, 0], 4: [4, 5, 2, 3, 0, 1], 5: [0, 2, 4, 1, 3, 5], 6: [4, 2, 0, 5, 3, 1], 7: [5, 3, 1, 4, 2, 0], 8: [1, 3, 5, 0, 2, 4] };
    for (let orientation = 1; orientation <= 8; orientation++) {
        const original = await sharp(colors, { raw: { width: 2, height: 3, channels: 3 } }).png().withMetadata({ orientation }).toBuffer();
        const originalCopy = Buffer.from(original), normalized = await normalizeDocument(original);
        const pixels = await sharp(normalized.normalizedFull).removeAlpha().raw().toBuffer();
        assert.deepEqual(pixels, Buffer.concat(maps[orientation].map(i => colors.subarray(i * 3, i * 3 + 3))));
        assert.deepEqual(original, originalCopy);
        assert.equal((await sharp(normalized.normalizedFull).metadata()).orientation, undefined);
        assert(!normalized.evidence.normalization.orientationCertain);
        assert.equal(normalized.evidence.normalization.rotation, 0);
    }
    const faint = await sharp(Buffer.from('<svg width="600" height="200"><rect width="600" height="200" fill="#eee"/><g fill="#d8d8d8" font-family="Arial" font-size="35"><text x="30" y="80">Faint strokes must survive</text><text x="30" y="140">1234567890</text></g></svg>')).png().toBuffer();
    const variants = await lightingVariants(faint);
    assert.equal(Object.keys(variants).length, 4);
    const native = await sharp(faint).flatten({ background: 'white' }).grayscale().raw().toBuffer(), gray = await sharp(variants.grayscale).grayscale().raw().toBuffer(), enhanced = await sharp(variants['local-contrast']).grayscale().raw().toBuffer();
    assert(native.equals(gray), 'Plain grayscale must preserve grayscale pixels exactly');
    let weak = 0, preserved = 0;
    for (let i = 0; i < native.length; i++)
        if (native[i] < 230 && native[i] > 210) {
            weak++;
            if (enhanced[i] < 235)
                preserved++;
        }
    assert(weak > 100);
    assert(preserved / weak > .95, 'Contrast normalization must retain faint stroke pixels');
    await assert.rejects(() => normalizeDocument(Buffer.from('not an image')));
    // Phase 6 permits only inert contracts and detached queue submission in UI.
    // Recognition/fusion/resolution must remain outside production request paths.
    function scan(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (file.includes(path.join('lib', 'ocrV2')))
            continue;
        if (item.isDirectory())
            scan(file);
        else if (/\.[tj]sx?$/.test(file))
            for (const match of fs.readFileSync(file, 'utf8').matchAll(/from\s+["']([^"']*ocrV2\/[^"']+)["']/g))
                assert(/ocrV2\/shadow\/(?:contract|client)$/.test(match[1]), 'Production import of v2 inference: ' + file);
    } }
    scan('src/app');
    console.log('OCR v2 Phase 1: contour geometry, projective mapping, uncertainty fallback, EXIF 1–8 pixel accuracy, original immutability, faint strokes, invalid input and production isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
