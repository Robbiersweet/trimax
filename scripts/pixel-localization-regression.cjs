/* eslint-disable @typescript-eslint/no-require-imports -- Node regression runner imports TypeScript source under strip-types. */
/* Source-pixel localization only: no expected invoice identifiers or amounts. */
const assert=require('node:assert/strict');
const {localizePixelTotalRegion}=require('../src/app/lib/ocrV2/recognition/totalLocalization.ts');
const {localizePhysicalRows}=require('../src/app/lib/ocrV2/semantics/physicalRows.ts');
const hash='a'.repeat(64),font=12;
const glyph=(id,left,top,width=8,height=12)=>({id,bounds:{left,top,width,height},pixels:width*height*.5,provenance:'source-pixels'});
const columns=[['property_name',30],['invoice_number',150],['description',280],['row_amount',500]].map(([type,left])=>({type,bounds:{left,top:40,width:60,height:12},semanticConfidence:'label-supported'}));
const row=(i)=>({id:'r'+i,bounds:{left:0,top:100+i*30,width:650,height:20},amountRegion:{left:540,top:100+i*30,width:80,height:20},physical:{sourceHash:hash}});
const footer=Array.from({length:7},(_,i)=>glyph('f'+i,550+i*10,214));
const model={sourceHash:hash,table:{supported:true,columns,rows:[row(0),row(1),row(2)],physicalGeometry:{inkComponents:footer}}};
const locate=(m=model,page=[])=>localizePixelTotalRegion(m,page,font,650,450);
const proof=locate();assert.ok(proof.bounds);assert.equal('cents'in proof.fields[0],false);assert.equal('value'in proof.fields[0],false);
const copy=()=>structuredClone(model);
let m=copy();m.table.physicalGeometry.inkComponents.push(...footer.map(c=>({...c,id:c.id+'b',bounds:{...c.bounds,top:c.bounds.top+25}})));assert.equal(locate(m).bounds,undefined,'Two footer fields block');
m=copy();m.table.physicalGeometry.inkComponents=footer.slice(0,3);assert.equal(locate(m).bounds,undefined,'Sparse noise blocks');
m=copy();m.table.physicalGeometry.inkComponents=[glyph('rule',500,214,120,2)];assert.equal(locate(m).bounds,undefined,'Rule is not glyph field');
m=copy();m.sourceHash='b'.repeat(64);assert.equal(locate(m).bounds,undefined,'Wrong source blocks');
m=copy();m.table.supported=false;assert.equal(locate(m).bounds,undefined,'Unsupported table blocks');
m=copy();const sign=glyph('minus',510,218,9,2),decimal=glyph('decimal',584,225,2,2);m.table.physicalGeometry.inkComponents.push(sign,decimal);const signed=locate(m);assert.ok(signed.fields[0].componentIds.includes('minus'));assert.ok(signed.fields[0].componentIds.includes('decimal'));assert.ok(signed.bounds.left<=sign.bounds.left);assert.ok(signed.bounds.top+signed.bounds.height>=decimal.bounds.top+decimal.bounds.height);
assert.equal(locate(model,[{verified:true,sourceHash:hash,words:[{text:'SUBTOTAL',confidence:95,bounds:{left:420,top:214,width:70,height:12}}]}]).bounds,undefined,'Observed subtotal blocks');
const ink=[];for(const y of [100,130,160])for(const x of [35,155,285,505])for(let j=0;j<4;j++)ink.push(glyph('ink-'+ink.length,x+j*8,y));
// A close TOTAL-like caption plus amount supplies two columns, no invoice cell.
for(const x of[285,505])for(let j=0;j<4;j++)ink.push(glyph('footer-'+ink.length,x+j*8,190));
const physical=localizePhysicalRows({components:[],inkComponents:ink,columns,slope:0,width:650,height:450,sourceHash:hash});
assert.equal(physical.rows.length,3,'Pixel-only rows require invoice and independent columns; footer excluded');
assert.ok(physical.rows.every(r=>r.columns.includes('invoice_number')&&r.columns.length>=3));
console.log('Pixel-first physical rows and total localization regressions passed');

