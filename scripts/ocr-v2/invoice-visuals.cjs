/* eslint-disable @typescript-eslint/no-require-imports -- Offline diagnostic rendering only. */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
(async () => {
    const root = path.resolve(process.argv[2]), r = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8'));
    const composites = [];
    let y = 0;
    let md = '# Phase 3B — invoice-only study\n\nFrozen real Fixture B crops. All scores are in-sample study results, not generalization accuracy. Best configuration chosen globally across five rows; no row-by-row oracle selection.\n\n';
    for (const o of r.bestAcrossStudy.rows) {
        const text = [o.rowId + ' expected: ' + o.expected, 'Raw: ' + JSON.stringify(o.rawText.trim()) + ' | normalized: ' + o.normalizedText, 'Exact: ' + o.exact + ' | character accuracy: ' + (o.characterAccuracy * 100).toFixed(1) + '%', o.preprocessing + ' ' + o.scale + 'x ' + o.interpolation + ' | PSM ' + o.mode + ' | whitelist ' + (o.whitelist ? 'on' : 'off'), 'Left: authoritative crop. Right: best preprocessing.'];
        const svg = Buffer.from(`<svg width="1200" height="130"><rect width="1200" height="130" fill="white"/><g font-family="Arial" font-size="19">${text.map((t, i) => `<text x="10" y="${23 + i * 24}">${esc(t)}</text>`).join('')}</g></svg>`);
        composites.push({ input: svg, top: y, left: 0 });
        y += 130;
        for (const [suffix, left] of [['original', 10], ['best', 610]]) {
            const p = await sharp(path.join(root, o.rowId + '-' + suffix + '.png')).resize({ width: 560, height: 170, fit: 'inside' }).png().toBuffer();
            composites.push({ input: p, left, top: y });
        }
        y += 190;
        md += '## ' + o.rowId + '\n\nExpected ' + o.expected + '; raw ' + JSON.stringify(o.rawText) + '; normalized ' + o.normalizedText + '; exact ' + o.exact + '; character accuracy ' + o.characterAccuracy + '\n\n';
        const recurring = {};
        for (const observation of r.observations.filter(x => x.rowId === o.rowId))
            for (const c of observation.changes) {
                const key = (c.expected || '[extra]') + ' -> ' + (c.observed || '[missing]');
                recurring[key] = (recurring[key] || 0) + 1;
            }
        md += 'Glyph confusions across observations (edit alignments can be non-unique):\n\n```json\n' + JSON.stringify(recurring, null, 2) + '\n```\n\n';
    }
    await sharp({ create: { width: 1200, height: y, channels: 3, background: 'white' } }).composite(composites).png().toFile(path.join(root, 'comparison-sheet.png'));
    for (const round of r.rounds) {
        md += '## ' + round.name + '\n\n| Configuration | Exact | Character accuracy | Five-row time ms |\n|---|---:|---:|---:|\n';
        for (const c of round.ranked)
            md += '| ' + c.id + ' | ' + c.exact + '/5 | ' + (c.characterAccuracy * 100).toFixed(1) + '% | ' + c.timeMs.toFixed(1) + ' |\n';
        md += '\n';
    }
    md += '## Segmentation\n\n```json\n' + JSON.stringify(r.segmentation, null, 2) + '\n```\n\n## Timing\n\nComplete benchmark ' + r.totalMs.toFixed(1) + ' ms, including worker startup ' + r.workerInitMs.toFixed(1) + ' ms. ' + r.wholeTokenPasses + ' whole-token observations. Best single configuration five-row processing ' + r.bestAcrossStudy.timeMs.toFixed(1) + ' ms, excluding worker startup.\n\nNo amount/header/footer code changed. No production integration, push or deployment. Phase 4 gate: ' + r.gatePassed + '.\n';
    fs.writeFileSync(path.join(root, 'report.md'), md);
})();
