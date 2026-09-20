/* eslint-disable @typescript-eslint/no-require-imports -- Diagnostic overlays/crops remain in private local storage. */
const sharp = require('sharp'), path = require('node:path'), fs = require('node:fs');
const { cropBounds } = require('../../src/app/lib/ocrV2/layout/index.ts');
exports.layoutVisuals = async function (image, layout, output) {
    const w = layout.documentBounds.width, h = layout.documentBounds.height, ox = 150, oy = 100;
    const boxes = [];
    function box(b, color, dash = '') { if (b)
        boxes.push(`<rect x="${b.left + ox}" y="${b.top + oy}" width="${b.width}" height="${b.height}" stroke="${color}" stroke-width="3" fill="${color}" fill-opacity=".035" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`); }
    box(layout.documentBounds, '#333');
    box(layout.headerRegion, '#1672d4');
    box(layout.tableRegion, '#777', '9 6');
    for (const row of layout.rows) {
        box(row.bounds, '#07844f');
        boxes.push(`<text x="8" y="${row.centerY + oy + 6}" fill="#07844f" font-size="20">${row.id}</text>`);
    }
    box(layout.columns.invoice, '#7938b5');
    box(layout.columns.amount, '#dc7400');
    box(layout.footerRegion, '#078da0');
    box(layout.totalCandidateRegion, '#d12c40');
    const legend = [['#333', 'Document'], ['#1672d4', 'Header'], ['#777', 'Table/body'], ['#07844f', 'Exclusive rows'], ['#7938b5', 'Invoice hypothesis'], ['#dc7400', 'Amount hypothesis'], ['#078da0', 'Footer'], ['#d12c40', 'Total search only']];
    legend.forEach(([color, label], i) => boxes.push(`<rect x="${w + 190}" y="${130 + i * 48}" width="24" height="24" fill="${color}"/><text x="${w + 226}" y="${151 + i * 48}" fill="#222" font-size="23">${label}</text>`));
    const overlay = Buffer.from(`<svg width="${w + 680}" height="${h + 170}"><g font-family="Arial"><text x="150" y="45" font-size="28">OCR v2 Phase 2 — pixel geometry, no field recognition</text>${boxes.join('')}</g></svg>`);
    await sharp({ create: { width: w + 680, height: h + 170, channels: 3, background: 'white' } }).composite([{ input: image, left: ox, top: oy }, { input: overlay, left: 0, top: 0 }]).png().toFile(path.join(output, 'layout-overlay.png'));
    const crops = [];
    for (const row of layout.rows)
        for (const field of ['invoice', 'amount']) {
            const region = row[field + 'Region'];
            if (!region)
                continue;
            const bounds = cropBounds(region, 2, layout.documentBounds);
            const file = row.id + '-' + field + '.png';
            await sharp(image).extract(bounds).png().toFile(path.join(output, file));
            crops.push({ file, source: 'authoritative normalized document-color.png', bounds, ownership: { top: row.top, bottom: row.bottom } });
        }
    fs.writeFileSync(path.join(output, 'crop-provenance.json'), JSON.stringify(crops, null, 2));
};
