/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic geometry supplements, never substitutes for real Fixture B. */
const assert = require('node:assert/strict'), sharp = require('sharp');
const { detectLayout, ownerAtY, ownerOfBounds, cropBounds } = require('../../src/app/lib/ocrV2/layout/index.ts');
async function fixture(options = {}) {
    const count = options.count || 5, ys = options.ys || Array.from({ length: count }, (_, i) => 250 + i * 60), last = ys.at(-1), footerY = last + (options.footerGap || 85);
    const color = options.faint ? '#d7d7d7' : '#777';
    let text = `<g font-family="Arial" fill="${color}"><text x="80" y="65" font-size="24">PRIVATE SYNTHETIC GEOMETRY TEST</text>`;
    if (options.extraHeader)
        text += '<text x="80" y="110" font-size="23">Additional contact and address information</text>';
    for (const [x, label] of [[80, 'Property'], [410, 'Account'], [620, 'Reference'], [810, 'Date'], [1030, 'Description'], [1570, 'Amount']])
        text += `<text x="${x}" y="175" font-size="29">${label}</text>`;
    ys.forEach((y, i) => { const values = [[80, 'Sample Grove Place'], [410, 'Services'], [620, 'DOC-' + (8120 + i)], [810, '09/01/2030'], [1030, 'X' + i + ' Interior painting'], [1690, options.digitWidths ? ['9.00', '99.50', '999.00', '1,999.95', '19,999.99'][i % 5] : '250.00']]; for (const [x, value] of values)
        text += `<text x="${x}" y="${y}" font-size="22" ${x === 1690 ? 'text-anchor="end"' : ''}>${value}</text>`; if (options.tall && i === 2)
        text += `<text x="1030" y="${y + 25}" font-size="21">Additional wrapped description</text>`; });
    text += `<text x="1690" y="${footerY}" text-anchor="end" font-size="22">7,321.45</text></g>`;
    const shadow = options.shadow ? '<rect width="1800" height="950" fill="url(#shade)" opacity=".24"/>' : '';
    const wrinkle = options.wrinkle ? '<path d="M900 0Q960 300 840 600T950 950" stroke="#aaa" stroke-width="8" fill="none" opacity=".2"/>' : '';
    let image = await sharp(Buffer.from(`<svg width="1800" height="950"><defs><linearGradient id="shade"><stop stop-color="#000"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="1800" height="950" fill="#f5f5f5"/>${text}${shadow}${wrinkle}</svg>`)).flatten({ background: 'white' }).png().toBuffer();
    if (options.perspective) {
        const { rectifyDocument } = require('../../src/app/lib/ocrV2/documentGeometry.ts');
        image = (await rectifyDocument(image, { reliable: true, corners: [{ x: 0, y: 0 }, { x: 1799, y: 7 }, { x: 1785, y: 949 }, { x: 12, y: 949 }] })).image;
    }
    if (options.skew)
        image = await sharp(image).rotate(.35, { background: 'white' }).png().toBuffer();
    return { image, ys, footerY };
}
(async () => {
    const scenarios = [['plain', {}], ['faint', { faint: true }], ['uneven spacing', { ys: [250, 300, 373, 428, 504] }], ['tall wrapped row', { ys: [250, 310, 370, 460, 520], tall: true }], ['shadow', { shadow: true }], ['slight perspective', { perspective: true }], ['slight skew', { skew: true }], ['wrinkle', { wrinkle: true }], ['extra header', { extraHeader: true }], ['near footer', { footerGap: 43 }], ['very close footer', { footerGap: 25 }], ['distant footer', { footerGap: 200 }], ['digit widths', { digitWidths: true }], ['two rows', { count: 2 }], ['six rows', { count: 6 }]];
    for (const [name, options] of scenarios) {
        const { image, ys, footerY } = await fixture(options), layout = await detectLayout(image);
        assert.equal(layout.rows.length, ys.length, name + ': wrong row count ' + JSON.stringify(layout.diagnostics.bands));
        assert(layout.rows.every((row, i) => !i || row.top >= layout.rows[i - 1].bottom), name + ': adjacent ownership overlap');
        assert(layout.rows.every((row, i) => Math.abs(row.centerY - (ys[i] - 8)) < 14), name + ': rows are not the physical body lines');
        assert(layout.totalCandidateRegion, name + ': missing footer group');
        assert(layout.totalCandidateRegion.top <= footerY && layout.totalCandidateRegion.top + layout.totalCandidateRegion.height >= footerY - 15, name + ': footer missed');
        assert(layout.columns.invoice, name + ': missing compact invoice-field hypothesis');
        assert(layout.columns.invoice.left <= 630 && layout.columns.invoice.left + layout.columns.invoice.width >= 720, name + ': invoice crop misses its visible field');
        assert(layout.columns.amount.left + layout.columns.amount.width >= 1680, name + ': amount crop truncates right-aligned digits');
        if (options.tall)
            assert.equal(ownerAtY(layout, ys[2] + 17), layout.rows[2].id, 'Wrapped description belongs only to its tall physical row');
        for (const row of layout.rows) {
            assert.equal(ownerAtY(layout, row.top), row.id);
            assert.equal(ownerOfBounds(layout, row.bounds), row.id);
            const copy = JSON.stringify(row);
            cropBounds(row.bounds, 10, layout.documentBounds);
            assert.equal(JSON.stringify(row), copy);
        }
        console.log(name + ': ' + layout.rows.length + ' rows, exclusive ownership, footer located');
    }
    const { image } = await fixture(), full = await detectLayout(image), scaled = await detectLayout(image, { maximumAnalysisEdge: 1200 });
    assert.equal(scaled.diagnostics.scaleX, 1.5);
    assert.equal(scaled.rows.length, full.rows.length);
    const fractional = await detectLayout(image, { maximumAnalysisEdge: 997 });
    assert.equal(fractional.rows.length, full.rows.length);
    fractional.rows.forEach((row, i) => {
        assert(Math.abs(row.centerY - full.rows[i].centerY) < 5);
        if (i) assert.equal(row.top, fractional.rows[i - 1].bottom, 'Mapped shared cuts remain exact at fractional scale');
    });
    full.rows.forEach((row, i) => { assert(Math.abs(row.centerY - scaled.rows[i].centerY) < 5); assert.equal(row.id, scaled.rows[i].id); });
    const mappedCrop = cropBounds(scaled.rows[0].bounds, 2, scaled.documentBounds), pixels = await sharp(image).extract(mappedCrop).png().toBuffer();
    assert((await sharp(pixels).metadata()).width > scaled.diagnostics.analysisWidth, 'Recognition crops come from full-resolution source, not the analysis bitmap');
    const boundary = full.rows[0].bottom;
    assert.notEqual(ownerAtY(full, boundary), full.rows[0].id);
    assert.equal(ownerOfBounds(full, { left: 0, top: boundary - 1, width: 1, height: 2 }), null);
    const blank = await sharp({ create: { width: 900, height: 500, channels: 3, background: 'white' } }).png().toBuffer();
    assert.equal((await detectLayout(blank)).rows.length, 0);
    console.log('Phase 2 layout regressions passed; all inputs are supplementary synthetic geometry tests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
