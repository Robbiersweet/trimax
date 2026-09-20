/* eslint-disable @typescript-eslint/no-require-imports -- Private offline harvest; no production writes. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sharp = require('sharp');
const { normalizeDocument } = require('../../../src/app/lib/ocrV2/documentNormalization.ts');
const { detectLayout } = require('../../../src/app/lib/ocrV2/layout/index.ts');
const { fieldCrops } = require('../../../src/app/lib/ocrV2/recognition/index.ts');
const study = require('../invoice-study.cjs');
(async () => {
    const manifestPath = path.resolve(process.argv[2]), root = path.dirname(manifestPath);
    if (!path.relative(process.cwd(), root).startsWith('..')) throw Error('Private output must remain outside Git');
    const docs = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const doc of docs) {
        if (doc.protectedFixture === 'B') throw Error('Protected B cannot enter harvest processing');
        const output = path.join(root, 'optics', doc.id);
        if (fs.existsSync(path.join(output, 'evidence.json'))) continue;
        fs.mkdirSync(output, { recursive: true });
        const original = fs.readFileSync(path.join(root, doc.file));
        const normalized = await normalizeDocument(original);
        const layout = await detectLayout(normalized.documentColor);
        fs.writeFileSync(path.join(output, 'document.png'), normalized.documentColor);
        fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(layout, null, 2));
        const crops = fieldCrops(layout).filter(c => c.field === 'invoice');
        const config = { ...study.configurations.find(c => c.id === 'contrast-3'), whitelist: '' };
        for (const c of crops) {
            const prepared = await study.prepare(normalized.documentColor, c, config);
            fs.writeFileSync(path.join(output, c.rowId + '.png'), prepared.authoritative);
            fs.writeFileSync(path.join(output, c.rowId + '.prepared.png'), prepared.image);
        }
        await sharp(normalized.documentColor).resize({ width: 1500, withoutEnlargement: true }).png().toFile(path.join(output, 'preview.png'));
        const evidence = { documentId: doc.id, originalHash: crypto.createHash('sha256').update(original).digest('hex'), normalization: normalized.evidence, crops };
        fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ id: doc.id, rows: crops.length, output }));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
