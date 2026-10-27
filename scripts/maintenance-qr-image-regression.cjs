/* eslint-disable @typescript-eslint/no-require-imports -- Decode actual generated QR pixels. */
const assert=require('node:assert/strict'),sharp=require('sharp'),jsQR=require('jsqr');
(async()=>{
 const {maintenanceQrSvg,maintenanceQrUrl}=await import('../src/app/lib/maintenanceQr.ts');
 const id='88888888-8888-4888-8888-000000000727';
 const url=maintenanceQrUrl(id);assert.equal(url,'https://rnlcreations.com/maintenance/'+id);
 const svg=await maintenanceQrSvg(id);
 for(const width of [256,512]){
  const {data,info}=await sharp(Buffer.from(svg)).resize(width,width).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height);
  assert.equal(decoded?.data,url,'Generated SVG must decode at printable sizes');
 }
 assert.throws(()=>maintenanceQrUrl('../other'));
 assert.throws(()=>maintenanceQrUrl(id,'http://insecure.test'));
 console.log('PASS actual QR SVG rasterization/decoding at 256px and 512px; permanent HTTPS URL and invalid-ID/origin rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
