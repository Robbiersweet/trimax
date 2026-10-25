import assert from 'node:assert/strict';
import sharp from 'sharp';
const base=process.env.RNL_TEST_URL||'http://localhost:3108';
for(const path of ['/','/gallery','/schedule']){
 const res=await fetch(base+path);assert.equal(res.status,200);const html=await res.text();
 for(const fragment of ['/manifest.webmanifest','/brand/rnl-mark-180-v1.png','/brand/rnl-mark-v1.svg','/brand/rnl-social-v1.png','summary_large_image'])assert.ok(html.includes(fragment),`${path}: missing ${fragment}`);
 assert.ok(!html.includes('app.rnlcreations.com/manifest'),'Marketing must not use TriMax manifest');
}
for(const size of [16,32,48,180,192,512]){
 const r=await fetch(`${base}/brand/rnl-mark-${size}-v1.png`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);
 const m=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(m.width,size);assert.equal(m.height,size);
}
const manifest=await (await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'browser');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
assert.equal(manifest.icons.length,3);assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
for(const icon of manifest.icons)assert.equal((await fetch(base+icon.src)).status,200);
for(const path of ['/brand/rnl-social-v1.png','/opengraph-image']){const r=await fetch(base+path);assert.equal(r.status,200);const m=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(m.width,1200);assert.equal(m.height,630);}
const ico=Buffer.from(await (await fetch(base+'/favicon.ico')).arrayBuffer());assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
console.log('PASS brand metadata on homepage/gallery/schedule, PNG sizes, ICO frames, separate browser manifest, maskable icon and both social image URLs.');
