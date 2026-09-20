/* eslint-disable @typescript-eslint/no-require-imports -- One sealed offline holdout export. */
const fs=require('fs'),path=require('path'),sharp=require('sharp');
(async()=>{
 const root=process.argv[2];if(!fs.existsSync(path.join(root,'pipeline/freeze.json')))throw Error('Missing freeze');
 const dest=path.join(root,'holdout.json');if(fs.existsSync(dest))throw Error('Holdout already exported');
 const annotations=JSON.parse(fs.readFileSync(path.join(root,'holdout-manual-annotations.json'))),records=[],tiles=[];
 for(const doc of annotations){
  const dir=path.join(root,'pipeline',doc.id),source=fs.readFileSync(path.join(dir,'document.png')),meta=await sharp(source).metadata(),layout=JSON.parse(fs.readFileSync(path.join(dir,'layout.json'))),scale=meta.width/doc.previewWidth;
  for(let i=0;i<doc.rows.length;i++){
   const r=doc.rows[i],manual={left:Math.round(r.x*scale),top:Math.round(r.y*scale),width:Math.round(r.w*scale),height:Math.round(r.h*scale)};
   for(const [kind,bounds]of [['manual',manual],['auto',layout.rows[i]?.invoiceRegion]]){
    const file=doc.id+'-'+i+'-'+kind+'.png';if(bounds){const im=await sharp(source).extract(bounds).png().toBuffer();fs.writeFileSync(path.join(root,file),im);tiles.push({input:await sharp(im).resize(300,60,{fit:'contain',background:'white'}).png().toBuffer(),left:kind==='manual'?0:320,top:(records.length>>1)*70});}
    records.push({id:doc.id+'-'+i,documentId:doc.id,label:r.label,kind,file:bounds?file:null,bounds,split:'heldout'});
   }
  }
 }
 fs.writeFileSync(dest,JSON.stringify(records,null,2));await sharp({create:{width:640,height:records.length/2*70,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(root,'holdout-crops.png'));
})().catch(e=>{console.error(e);process.exitCode=1});
