/* eslint-disable @typescript-eslint/no-require-imports -- Fixed held-out baseline, no tuning or training. */
const fs = require('fs'), path = require('path'), { createWorker, OEM } = require('tesseract.js');
const { fieldCrops } = require('../../../src/app/lib/ocrV2/recognition/index.ts');
const study = require('../invoice-study.cjs');
(async () => {
    const root = path.join(process.env.LOCALAPPDATA, 'Trimax'), privateRoot = path.join(root, 'ocr-v2-private'), out = path.join(root, 'ocr-v2-training');
    const source = fs.readFileSync(path.join(privateRoot, 'phase2-B/document-color.png')), layout = JSON.parse(fs.readFileSync(path.join(privateRoot, 'phase2-B/layout.json'), 'utf8'));
    const crops = fieldCrops(layout).filter(c => c.field === 'invoice'), config = { ...study.configurations.find(c => c.id === 'contrast-3'), id: 'frozen-phase3b-best', whitelist: '' };
    const start = performance.now(), worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath: path.join(require('os').tmpdir(), 'trimax-v2-tesseract'), logger: () => { } }), initMs = performance.now() - start, observations = [];
    try {
        for (const c of crops)
            observations.push(await study.observe(worker, source, c, config, 'B-heldout'));
    }
    finally {
        await worker.terminate();
    }
    const truth = require('../labels.json').B;
    function edits(a, b) { let d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0)); for (let i = 0; i <= a.length; i++)
        d[i][0] = i; for (let j = 0; j <= b.length; j++)
        d[0][j] = j; for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)); let i = a.length, j = b.length, s = 0, ins = 0, del = 0; while (i || j) {
        if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)) {
            s += a[i - 1] !== b[j - 1] ? 1 : 0;
            i--;
            j--;
        }
        else if (i && d[i][j] === d[i - 1][j] + 1) {
            ins++;
            i--;
        }
        else {
            del++;
            j--;
        }
    } return { substitutions: s, insertions: ins, deletions: del, cer: d[a.length][b.length] / b.length }; }
    const rows = observations.map((o, i) => ({ ...o, expected: truth.invoices[i], exact: o.normalizedText === truth.invoices[i], ...edits(o.normalizedText, truth.invoices[i]) }));
    const report = { benchmarkVersion: 'ocr-v2-phase3c-v1', datasetHash: fs.readFileSync(path.join(out, 'trimax-invoice-dataset-v1/dataset.sha256'), 'utf8').trim(), generic: { rows, exactAccuracy: rows.filter(r => r.exact).length / rows.length, cer: rows.reduce((s, r) => s + r.cer, 0) / rows.length, characterAccuracy: 1 - rows.reduce((s, r) => s + r.cer, 0) / rows.length, initMs, fiveRowMs: observations.reduce((s, o) => s + o.durationMs, 0), totalMs: performance.now() - start }, trained: { status: 'not-run', reason: 'No independent real train or validation documents; protected B cannot train the model' }, readyForPhase4: false };
    fs.writeFileSync(path.join(out, 'heldout-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, generic: { ...report.generic, rows: rows.map(r => ({ row: r.rowId, raw: r.rawText, cer: r.cer, exact: r.exact })) } }, null, 2));
})();
