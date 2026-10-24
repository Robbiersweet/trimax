/* eslint-disable @typescript-eslint/no-require-imports -- Pure measured heading ownership and actual semantic rebuilding. */
const assert=require('node:assert/strict');
const {missingLeadingCaptionRegion:region,acceptedCaptionWords:accept}=require('../src/app/lib/ocrV2/semantics/tableCaptionOwnership.ts');
const model=()=>({table:{supported:true,headerPosition:{left:300,top:100,width:500,height:20},columns:[{type:'account_number',bounds:{left:300,top:100,width:80,height:20},semanticConfidence:'label-supported'}],rows:[150,190,230].map(top=>({bounds:{left:0,top,width:900,height:20},physical:{columnRegions:{'unlabeled-leading':{left:40,top,width:230,height:20}}}}))}});
const m=model(),r=region(m,900,400);assert.deepEqual(r,{left:40,top:88,width:260,height:44});assert(r.top+r.height<150);
for(const mutate of [m=>m.table.supported=false,m=>m.table.rows.pop(),m=>m.table.headerPosition=null,m=>m.table.columns.push({type:'property_name'}),m=>m.table.rows.forEach(r=>r.physical.columnRegions={}),m=>m.table.columns[0].bounds.left=20,m=>m.table.rows[0].bounds.top=80]){const x=model();mutate(x);assert.equal(region(x,900,400),null);}
const word=(text='Property',confidence=94,bounds={left:45,top:100,width:90,height:20})=>({text,confidence,bounds});
const reads=()=>[{variant:'native',words:[word()]},{variant:'gray',words:[word()]}];
assert.equal(accept(reads(),r).length,2);
for(const mutate of [x=>x.pop(),x=>x[1].variant='native',x=>x[0].words[0].confidence=69,x=>x[1].words[0].text='Customer',x=>x[0].words[0].text='Propertv',x=>x[0].words.push(word('Property')),x=>x[0].words.push(word('Account')),x=>x[0].words[0].bounds.top=150,x=>x[0].words[0].bounds.left=0,x=>x[0].words[0].bounds.width=NaN,x=>x[1].words[0].bounds.left=100]){const x=reads();mutate(x);assert.deepEqual(accept(x,r),[]);}
console.log('PASS source-owned missing leading caption: measured header-only bounds, existing identity preservation, exact two-variant caption agreement, low-confidence/conflicting/multiple-label/body/outside/invalid geometry rejection');
