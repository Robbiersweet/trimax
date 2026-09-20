/* eslint-disable @typescript-eslint/no-require-imports -- Private manually reviewed harvest annotations. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), sharp = require('sharp');
const study = require('../invoice-study.cjs');
(async () => {
    const file = path.resolve(process.argv[2]), root = path.dirname(file);
    if (!path.relative(process.cwd(), root).startsWith('..')) throw Error('Private annotations must remain outside Git');
    const annotations = JSON.parse(fs.readFileSync(file, 'utf8')), samples = [];
    for (const doc of annotations) {
        if (doc.id === 'B' || doc.protectedFixture) throw Error('No held-out document allowed');
        const dir = path.join(root, 'optics', doc.id), source = fs.readFileSync(path.join(dir, 'document.png'));
        const meta = await sharp(source).metadata(), scale = meta.width / doc.previewWidth;
        const evidence = JSON.parse(fs.readFileSync(path.join(dir, 'evidence.json'), 'utf8'));
        for (let i = 0; i < doc.rows.length; i++) {
            const row = doc.rows[i], bounds = { left: Math.round(row.x*scale), top: Math.round(row.y*scale), width: Math.round(row.w*scale), height: Math.round(row.h*scale) };
            const crop = { rowId: 'reviewed-'+i, bounds, ownership: bounds };
            const config = {...study.configurations.find(c => c.id === 'contrast-3'), whitelist: ''};
            const result = await study.prepare(source, crop, config);
            const output = path.join(dir, 'reviewed-'+i+'.png');
            fs.writeFileSync(output, result.image);
            samples.push({ id: doc.id+'-'+i, documentId: doc.id, split: doc.split, label: row.label, file: output,
                originalHash: evidence.originalHash, sha256: crypto.createHash('sha256').update(result.image).digest('hex'), bounds,
                provenance: 'Visual transcription and manual token bounds on frozen Phase 1 output; Phase 2 output retained separately, no engine changes', verified: true });
        }
    }
    fs.writeFileSync(path.join(root, 'reviewed-crops.json'), JSON.stringify(samples, null, 2));
    console.log(JSON.stringify({ samples: samples.length, splits: samples.reduce((a,s)=>(a[s.split]=(a[s.split]||0)+1,a),{}) }));
})().catch(e => { console.error(e); process.exitCode=1; });
