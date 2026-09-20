/* eslint-disable @typescript-eslint/no-require-imports -- Inactive offline benchmark. */
const fs=require('fs'),path=require('path'),sharp=require('sharp');
const {structuralLayout}=require('../../src/app/lib/ocrV2/layout/generalized.ts');
(async()=>{
 const root=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});
 const plan={development:['A','D','check2715','check2721','check2734','check2743'],holdout:['B','C'],recognizerValidation:['D'],historicalExposure:'B and C were examined in preceding phases; untouched within this phase only'};
 const planFile=path.join(out,'split-plan.json');if(fs.existsSync(planFile)&&JSON.stringify(JSON.parse(fs.readFileSync(planFile)))!==JSON.stringify(plan))throw Error('Split changed');fs.writeFileSync(planFile,JSON.stringify(plan,null,2));
 const truth=JSON.parse(fs.readFileSync(path.join(root,'reviewed-annotations.json'))),records=[],tiles=[];
 for(const doc of truth.filter(d=>plan.development.includes(d.id))){
  const source=fs.readFileSync(path.join(root,'optics',doc.id,'document.png')),meta=await sharp(source).metadata(),layout=await structuralLayout(source),scale=meta.width/doc.previewWidth;
  fs.writeFileSync(path.join(out,doc.id+'-layout.json'),JSON.stringify(layout,null,2));
  for(let i=0;i<doc.rows.length;i++){
   const r=doc.rows[i],manual={left:Math.round(r.x*scale),top:Math.round(r.y*scale),width:Math.round(r.w*scale),height:Math.round(r.h*scale)};
   for(const [kind,bounds]of [['manual',manual],['auto',layout.rows[i]?.invoiceRegion]]){
    const file=doc.id+'-'+i+'-'+kind+'.png';if(bounds){const image=await sharp(source).extract(bounds).png().toBuffer();fs.writeFileSync(path.join(out,file),image);tiles.push({input:await sharp(image).resize(300,60,{fit:'contain',background:'white'}).png().toBuffer(),left:kind==='manual'?0:320,top:(records.length>>1)*70});}
    records.push({id:doc.id+'-'+i,documentId:doc.id,label:r.label,kind,file:bounds?file:null,bounds,split:doc.id==='D'?'validation':'train'});
   }
  }
  console.log(doc.id,layout.rows.length,doc.rows.length);
 }
 await sharp({create:{width:640,height:records.length/2*70,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(out,'development-crops.png'));
 fs.writeFileSync(path.join(out,'development.json'),JSON.stringify(records,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
