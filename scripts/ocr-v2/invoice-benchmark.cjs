/* eslint-disable @typescript-eslint/no-require-imports -- Offline scoring only. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict'), sharp = require('sharp');
const { createWorker, OEM, PSM } = require('tesseract.js');
const { fieldCrops } = require('../../src/app/lib/ocrV2/recognition/index.ts');
const study = require('./invoice-study.cjs');
function alignment(actual, expected) {
    const a = actual, b = expected, d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++)
        d[i][0] = i;
    for (let j = 0; j <= b.length; j++)
        d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    let i = a.length, j = b.length, changes = [];
    while (i || j) {
        if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
            if (a[i - 1] !== b[j - 1])
                changes.push({ expected: b[j - 1], observed: a[i - 1], expectedPosition: j - 1 });
            i--;
            j--;
        }
        else if (i && d[i][j] === d[i - 1][j] + 1) {
            changes.push({ expected: '', observed: a[i - 1], expectedPosition: j });
            i--;
        }
        else {
            changes.push({ expected: b[j - 1], observed: '', expectedPosition: j - 1 });
            j--;
        }
    }
    return { distance: d[a.length][b.length], characterAccuracy: Math.max(0, 1 - d[a.length][b.length] / b.length), changes: changes.reverse() };
}
(async () => {
    const root = path.dirname(path.resolve(process.argv[2]));
    assert(path.relative(process.cwd(), root).startsWith('..'));
    const source = fs.readFileSync(path.join(root, 'phase2-B/document-color.png')), layout = JSON.parse(fs.readFileSync(path.join(root, 'phase2-B/layout.json'), 'utf8'));
    const annotation = JSON.parse(fs.readFileSync(path.join(root, 'layout-B-annotation.json'), 'utf8'));
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    assert.equal(hash, annotation.imageSha256);
    const crops = fieldCrops(layout).filter(c => c.field === 'invoice'), out = path.join(root, 'phase3b-B');
    fs.mkdirSync(out, { recursive: true });
    const start = performance.now();
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath: path.join(require('os').tmpdir(), 'trimax-v2-tesseract'), logger: () => { } });
    const workerInitMs = performance.now() - start, observations = [], rounds = [];
    const score = (obs) => { const truth = require('./labels.json').B; return obs.map(o => { const expected = truth.invoices[crops.findIndex(c => c.rowId === o.rowId)]; return { ...o, expected, exact: o.normalizedText === expected, formatExact: o.structuralCandidate?.text === expected, ...alignment(o.normalizedText, expected) }; }); };
    const rank = obs => { const grouped = Object.groupBy(score(obs), o => o.id); return Object.entries(grouped).map(([id, rows]) => ({ id, exact: rows.filter(r => r.exact).length, formatExact: rows.filter(r => r.formatExact || r.exact).length, characterAccuracy: rows.reduce((s, r) => s + r.characterAccuracy, 0) / rows.length, timeMs: rows.reduce((s, r) => s + r.durationMs, 0), rows })).sort((a, b) => b.exact - a.exact || b.characterAccuracy - a.characterAccuracy || a.timeMs - b.timeMs); };
    async function run(name, configs) { const obs = []; for (const c of crops)
        for (const config of configs)
            obs.push(await study.observe(worker, source, c, config, 'B')); observations.push(...obs); rounds.push({ name, observations: obs }); console.log(name + ': ' + obs.length + ' completed observations'); }
    let selected;
    const segmentation = [];
    try {
        await run('preprocessing', study.configurations);
        selected = { ...study.configurations.find(c => c.id === 'contrast-3') };
        await run('interpolation', [{ ...selected, id: 'interp-cubic', interpolation: 'cubic' }, { ...selected, id: 'interp-linear', interpolation: 'linear' }, { ...selected, id: 'interp-lanczos', interpolation: 'lanczos3' }]);
        await run('mode', [PSM.SINGLE_LINE, PSM.SINGLE_WORD, PSM.SPARSE_TEXT, PSM.RAW_LINE].map(mode => ({ ...selected, id: 'mode-' + mode, mode })));
        await run('whitelist', [{ ...selected, id: 'whitelist-on', whitelist: study.whitelist }, { ...selected, id: 'whitelist-off', whitelist: '' }]);
        selected = { ...selected, whitelist: '' };
        await run('padding', [{ ...selected, id: 'padding-current', padding: 0 }, { ...selected, id: 'padding-2pct', padding: .02 }, { ...selected, id: 'padding-4pct', padding: .04 }, { ...selected, id: 'padding-vertical4', padding: 0, verticalPadding: .04 }]);
        for (const c of crops) {
            const p = await study.prepare(source, c, { ...selected, scale: 1, padding: 0 }), low = await study.segments(p.authoritative, 4), high = await study.segments(p.authoritative, 7);
            const stable = low.length === high.length && low.length >= 3 && low.length <= 12 && low.every((r, i) => Math.abs(r.left - high[i].left) <= 2 && Math.abs(r.width - high[i].width) <= 3);
            const glyphs = [];
            if (stable) {
                await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR, tessedit_char_whitelist: study.whitelist });
                for (const box of low) {
                    const input = await sharp(p.authoritative).extract(box).resize({ height: box.height * 3 }).extend({ top: 12, bottom: 12, left: 12, right: 12, background: 'white' }).png().toBuffer();
                    const t = performance.now(), r = await worker.recognize(input);
                    glyphs.push({ bounds: box, raw: r.data.text, confidence: r.data.confidence, ocrMs: performance.now() - t });
                }
            }
            // A prefix/suffix split needs a stable distinct interior gap, not a fixed INV width.
            const gaps = low.slice(1).map((b, i) => ({ x: (low[i].left + low[i].width + b.left) / 2, width: b.left - low[i].left - low[i].width })).sort((a, b) => b.width - a.width);
            const split = gaps[0] && gaps[0].width >= 2 * (gaps[1]?.width || 1) && gaps[0].x > p.bounds.width * .2 && gaps[0].x < p.bounds.width * .7 ? Math.round(gaps[0].x) : null;
            const parts = [];
            if (stable && split) {
                for (const [left, width, whitelist] of [[0, split, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-'], [split, p.bounds.width - split, '0123456789']]) {
                    const input = await sharp(p.authoritative).extract({ left, top: 0, width, height: p.bounds.height }).resize({ height: p.bounds.height * 3 }).extend({ top: 12, bottom: 12, left: 12, right: 12, background: 'white' }).png().toBuffer();
                    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD, tessedit_char_whitelist: whitelist });
                    const t = performance.now(), r = await worker.recognize(input);
                    parts.push({ left, width, raw: r.data.text, confidence: r.data.confidence, ocrMs: performance.now() - t });
                }
            }
            segmentation.push({ rowId: c.rowId, low, high, stable, glyphs, split, parts, recombined: glyphs.map(g => g.raw.trim()).join(''), reason: !stable ? 'Rejected: faint-stroke projection unstable across two thresholds' : !split ? 'No distinct supported prefix/suffix gap' : 'Experimental observations only' });
        }
    }
    finally {
        await worker.terminate();
    }
    const ranked = rank(observations), winner = ranked[0];
    const scoredRounds = rounds.map(r => ({ name: r.name, ranked: rank(r.observations) }));
    const report = { sourceHash: hash, layoutHash: crypto.createHash('sha256').update(JSON.stringify(layout)).digest('hex'), frozenLayout: true, observations: score(observations), rounds: scoredRounds, selected, bestAcrossStudy: winner, segmentation, totalMs: performance.now() - start, workerInitMs, wholeTokenPasses: observations.length, gatePassed: study.phase4Gate(winner.rows) };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    for (const c of crops) {
        const o = winner.rows.find(r => r.rowId === c.rowId), p = await study.prepare(source, c, o);
        fs.writeFileSync(path.join(out, c.rowId + '-original.png'), await sharp(source).extract(c.bounds).png().toBuffer());
        fs.writeFileSync(path.join(out, c.rowId + '-best.png'), p.image);
    }
    console.log(JSON.stringify({ winner, segmentation, totalMs: report.totalMs }, null, 2));
    assert(observations.every(o => o.status === 'completed'));
})().catch(e => { console.error(e); process.exitCode = 1; });
