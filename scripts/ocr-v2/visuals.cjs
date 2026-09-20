/* eslint-disable @typescript-eslint/no-require-imports -- Private optical artifacts only. */
const fs = require('node:fs'), path = require('node:path'), sharp = require('sharp');
exports.writeVisuals = async function (normalized, output) {
    const { evidence, normalizedFull, documentColor, variants } = normalized;
    const meta = await sharp(normalizedFull).metadata();
    const points = evidence.documentGeometry.corners.map(p => `${p.x},${p.y}`).join(' ');
    const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><polygon points="${points}" fill="none" stroke="#00cc88" stroke-width="9"/></svg>`);
    const overlay = await sharp(normalizedFull).composite([{ input: svg }]).png().toBuffer();
    const upright = await sharp(overlay).rotate(evidence.normalization.rotation).resize({ width: 1200 }).png().toBuffer();
    fs.writeFileSync(path.join(output, 'paper-overlay.png'), upright);
    const images = [['Detected paper (full frame)', upright], ['Rectified native color', documentColor], ['Grayscale', variants.grayscale], ['Local contrast (non-binary)', variants['local-contrast']], ['Light sharpening', variants['light-sharpen']], ['Adaptive threshold (experimental)', variants['adaptive-threshold-experimental']]];
    const cells = [];
    for (let i = 0; i < images.length; i++) {
        const [label, bytes] = images[i], thumb = await sharp(bytes).resize({ width: 1100, height: 490, fit: 'inside', withoutEnlargement: true }).extend({ top: 40, bottom: 0, left: 0, right: 0, background: 'white' }).png().toBuffer();
        const tag = Buffer.from(`<svg width="1100" height="40"><rect width="100%" height="100%" fill="white"/><text x="10" y="28" font-family="Arial" font-size="22">${label}</text></svg>`);
        const cell = await sharp({ create: { width: 1100, height: 560, channels: 3, background: 'white' } }).composite([{ input: thumb, left: 0, top: 0 }, { input: tag, left: 0, top: 0 }]).png().toBuffer();
        cells.push({ input: cell, left: (i % 2) * 1100, top: Math.floor(i / 2) * 560 });
    }
    await sharp({ create: { width: 2200, height: 1680, channels: 3, background: 'white' } }).composite(cells).png().toFile(path.join(output, 'comparison.png'));
};
