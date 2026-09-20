/* eslint-disable @typescript-eslint/no-require-imports -- Local private evidence inventory. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), sharp = require('sharp');
(async () => {
    const root = path.join(process.env.LOCALAPPDATA, 'Trimax/ocr-v2-training'), out = path.join(root, 'inventory');
    fs.mkdirSync(out, { recursive: true });
    const files = ['trimax-two-physical-attempts.json', 'trimax-c44d-physical.json', 'trimax-ad80-physical.json', 'trimax-optical-0818/evidence.json'].map(n => path.join(process.env.TEMP, n));
    const entries = [];
    for (const file of files) {
        if (!fs.existsSync(file))
            continue;
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const item of (Array.isArray(json) ? json : [json])) {
            const attempt = item.attempt?.id ?? 'fixture-b-retained', images = (item.optical ?? item).images ?? [];
            for (let i = 0; i < images.length; i++) {
                const im = images[i];
                if (!im.base64) {
                    entries.push({ attempt, sourceFile: file, index: i, label: im.label, width: im.width, height: im.height, available: false, supervisedEligible: false, reason: "Metadata only; no retained image bytes in export" });
                    continue;
                }
                const data = Buffer.from(im.base64.replace(/^data:[^,]*,/, ''), 'base64'), hash = crypto.createHash('sha256').update(data).digest('hex'), dest = path.join(out, hash + '.png');
                let meta;
                try {
                    meta = await sharp(data).metadata();
                    await sharp(data).rotate().png().toFile(dest);
                }
                catch {
                    continue;
                }
                entries.push({ attempt, sourceFile: file, index: i, label: im.label, source: im.source, sourceHash: hash, path: dest, width: meta.width, height: meta.height, exifOrientation: meta.orientation ?? null, rotation: im.rotation ?? null, transformation: im.transformation ?? null, documentGroup: 'unverified', supervisedEligible: false });
            }
        }
    }
    const original = path.join(process.env.LOCALAPPDATA, 'Trimax/ocr-v2-private/fixture-b-original.jpg'), bytes = fs.readFileSync(original), meta = await sharp(bytes).metadata();
    entries.push({ attempt: 'fixture-b-retained', sourceFile: original, label: 'verified original', sourceHash: crypto.createHash('sha256').update(bytes).digest('hex'), path: original, width: meta.width, height: meta.height, exifOrientation: meta.orientation, documentGroup: 'fixture-b-document', supervisedEligible: true });
    const liveAudit = path.join(out, 'live-history-audit.json');
    fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ version: 'trimax-invoice-inventory-v1', entries, remoteInventory: fs.existsSync(liveAudit) ? JSON.parse(fs.readFileSync(liveAudit, 'utf8')) : 'not inventoried by this local-only script' }, null, 2));
    const tiles = [];
    let y = 0;
    for (const e of entries) {
        if (!e.path)
            continue;
        const p = await sharp(e.path).rotate().resize({ width: 700, height: 500, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
        const label = Buffer.from(`<svg width="800" height="50"><rect width="800" height="50" fill="white"/><text x="10" y="20" font-family="Arial" font-size="15">${e.attempt} ${e.index ?? ''}</text><text x="10" y="42" font-family="Arial" font-size="15">${e.width}x${e.height} ${String(e.label).replace(/[&<>]/g, ' ')}</text></svg>`);
        tiles.push({ input: label, top: y, left: 0 });
        y += 50;
        tiles.push({ input: p.data, top: y, left: 0 });
        y += p.info.height + 10;
    }
    if (y)
        await sharp({ create: { width: 800, height: y, channels: 3, background: 'white' } }).composite(tiles).png().toFile(path.join(out, 'contact-sheet.png'));
    console.log(entries.map(e => ({ attempt: e.attempt, label: e.label, width: e.width, height: e.height, hash: e.sourceHash?.slice(0, 12) })));
})().catch(e => { console.error(e); process.exitCode = 1; });
