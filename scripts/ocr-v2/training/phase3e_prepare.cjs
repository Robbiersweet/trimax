// Frozen crop preparation only. No labels are consumed by recognition adapters.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
async function main() {
  const root = process.argv[2], out = process.argv[3];
  await fs.mkdir(out, { recursive: true });
  const rows = [...JSON.parse(await fs.readFile(path.join(root, 'development.json'))), ...JSON.parse(await fs.readFile(path.join(root, 'holdout.json')))];
  const entries = [];
  for (const row of rows) {
    const source = await fs.readFile(path.join(root, row.file));
    const gray = await sharp(source).grayscale().raw().toBuffer({ resolveWithObject: true });
    const background = await sharp(source).grayscale().blur(12).raw().toBuffer();
    const pixels = Buffer.from(gray.data.map((v, i) => Math.max(0, Math.min(255, 245 + (v - background[i]) * 3))));
    const enhanced = await sharp(pixels, { raw: { width: gray.info.width, height: gray.info.height, channels: 1 } }).resize(gray.info.width * 2, gray.info.height * 2).extend({ top:12,bottom:12,left:12,right:12,background:'white' }).png().toBuffer();
    for (const [variant, bytes] of [['native',source],['enhanced',enhanced]]) {
      const file = `${row.id}-${row.kind}-${variant}.png`;
      await fs.writeFile(path.join(out,file), bytes);
      entries.push({ id:row.id, documentId:row.documentId, kind:row.kind, variant, file, sha256:crypto.createHash('sha256').update(bytes).digest('hex') });
    }
  }
  if (rows.length !== 48 || new Set(rows.map(r=>r.documentId)).size !== 8) throw Error('Unexpected frozen corpus');
  await fs.writeFile(path.join(out,'inputs.json'),JSON.stringify(entries,null,2));
  await fs.writeFile(path.join(out,'truth.json'),JSON.stringify(rows.map(({id,kind,label})=>({id,kind,label})),null,2));
  await fs.writeFile(path.join(out,'protocol.json'),JSON.stringify({ created:new Date().toISOString(), folds:[...new Set(rows.map(r=>r.documentId))].sort(), training:false, primary:'native automatic crops', secondary:'fixed OCR-v2 local contrast, manual crops independently', modelSelection:'aggregate primary metrics only; no per-row oracle', constraint:'same observed positions only; no missing digits supplied', evaluation:'fixed pretrained document-grouped evaluation; prior corpus development exposure disclosed', tesseractPilot:'historically trained on five documents and validated on C; not unseen cross-validation' },null,2));
  console.log(`Frozen ${entries.length} inputs across eight documents.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
