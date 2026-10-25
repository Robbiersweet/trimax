// Reproducible derivatives of the approved badge; no generated/replacement artwork.
// Run manually after an intentional brand change. Outputs are committed for stable URLs.
import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url), output=new URL('public/brand/',root);
await mkdir(output,{recursive:true});
const original=new URL('../../public/branding/rnl/rnl-original-badge.png',root);
// Approved badge is 5334 x 4268. This crop isolates its crossed-hammer emblem.
const emblem=await sharp(fileURLToPath(original)).extract({left:2350,top:1370,width:640,height:600}).resize(384,360).png().toBuffer();
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#000"/><rect x="14" y="14" width="484" height="484" rx="82" fill="none" stroke="#ff9810" stroke-width="20"/><image x="64" y="76" width="384" height="360" href="data:image/png;base64,${emblem.toString('base64')}"/></svg>`;
await writeFile(new URL('rnl-mark-v1.svg',output),svg+'\n');
for(const size of [16,32,48,180,192,512])await sharp(Buffer.from(svg)).resize(size,size).png().toFile(fileURLToPath(new URL(`rnl-mark-${size}-v1.png`,output)));
// Maskable icons keep the entire mark inside the central 80% safe zone.
const mask=await sharp(Buffer.from(svg)).resize(360,360).png().toBuffer();
await sharp({create:{width:512,height:512,channels:4,background:'#000'}}).composite([{input:mask,left:76,top:76}]).png().toFile(fileURLToPath(new URL('rnl-maskable-512-v1.png',output)));
// ICO directory with PNG frames: 16, 32 and 48px fallbacks for older tab/bookmark clients.
const frames=await Promise.all([16,32,48].map(s=>readFile(new URL(`rnl-mark-${s}-v1.png`,output))));
const head=Buffer.alloc(6+16*frames.length);head.writeUInt16LE(1,2);head.writeUInt16LE(frames.length,4);let offset=head.length;
frames.forEach((frame,i)=>{const at=6+i*16;head[at]=[16,32,48][i];head[at+1]=head[at];head.writeUInt16LE(1,at+4);head.writeUInt16LE(32,at+6);head.writeUInt32LE(frame.length,at+8);head.writeUInt32LE(offset,at+12);offset+=frame.length;});
await writeFile(new URL('app/favicon.ico',root),Buffer.concat([head,...frames]));
// Full original badge remains readable in shared-link previews; unlike tab icons this
// retains the company name and complete approved seal, without recreating the logo.
const badge=await sharp(fileURLToPath(original)).extract({left:1170,top:870,width:2980,height:2520}).resize({width:590,height:500,fit:'inside'}).png().toBuffer();
const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#000"/><rect y="612" width="1200" height="18" fill="#ff9810"/><g font-family="Arial,sans-serif"><text x="665" y="190" fill="#ff9810" font-size="22" font-weight="bold" letter-spacing="2">GENERAL CONTRACTING</text><text x="665" y="273" fill="white" font-size="42" font-weight="bold">Homes.</text><text x="665" y="329" fill="white" font-size="42" font-weight="bold">Projects.</text><text x="665" y="385" fill="white" font-size="42" font-weight="bold">People.</text><text x="665" y="477" fill="#ddd" font-size="26">rnlcreations.com</text></g></svg>`);
await sharp(title).composite([{input:badge,left:48,top:58}]).png().toFile(fileURLToPath(new URL('rnl-social-v1.png',output)));
console.log('Created approved-logo favicon, touch, Android/maskable icons and 1200x630 social preview.');
