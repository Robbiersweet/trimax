/* eslint-disable @typescript-eslint/no-require-imports -- Fixed post-selection holdout export; no inference or tuning. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { fieldCrops } = require('../../../src/app/lib/ocrV2/recognition/index.ts');
const study = require('../invoice-study.cjs');
(async () => {
    const [privateRoot, selectionPath, output] = process.argv.slice(2).map(p => path.resolve(p));
    for (const p of [privateRoot, output]) if (!path.relative(process.cwd(), p).startsWith('..')) throw Error('Private paths only');
    const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    if (!selection.sha256 || !selection.selectedAt) throw Error('Model selection must precede holdout');
    fs.mkdirSync(output);
    const source = fs.readFileSync(path.join(privateRoot, 'phase2-B/document-color.png'));
    const layout = JSON.parse(fs.readFileSync(path.join(privateRoot, 'phase2-B/layout.json'), 'utf8'));
    const crops = fieldCrops(layout).filter(c => c.field === 'invoice');
    const config = {...study.configurations.find(c => c.id === 'contrast-3'), whitelist: ''};
    const labels = require('../labels.json').B.invoices, rows = [];
    for (let i=0; i<crops.length; i++) {
        const prepared = await study.prepare(source, crops[i], config), file = crops[i].rowId+'.png';
        fs.writeFileSync(path.join(output, file), prepared.image);
        rows.push({id:crops[i].rowId, file, label:labels[i], kind:'real', protectedFixture:'B',
            sha256:crypto.createHash('sha256').update(prepared.image).digest('hex'), bounds:prepared.bounds,
            preprocessing:'Frozen Phase 3B contrast-3, no whitelist, unchanged crop ownership'});
    }
    fs.writeFileSync(path.join(output, 'inputs.json'), JSON.stringify(rows, null, 2));
    console.log('Prepared five frozen held-out crops after model selection; no OCR run here.');
})().catch(e => { console.error(e); process.exitCode=1; });
