/* eslint-disable @typescript-eslint/no-require-imports -- Structural authority safety cases. */
const assert=require('node:assert/strict');
const {localizeDocumentTotal}=require('../../src/app/lib/ocrV2/recognition/totalLocalization.ts');
const {decideDocumentTotal}=require('../../src/app/lib/ocrV2/recognition/documentTotalAuthority.ts');
const word=(text,left,top,width=80)=>({text,confidence:92,bounds:{left,top,width,height:20}});
const model={sourceHash:'pixels',table:{supported:true,columns:[{type:'row_amount',semanticConfidence:'label-supported'}],rows:[{id:'a',bounds:{left:0,top:100,width:450,height:30},amountRegion:{left:320,top:100,width:100,height:30}},{id:'b',bounds:{left:0,top:160,width:450,height:30},amountRegion:{left:320,top:160,width:100,height:30}}]}};
const page=words=>['native','gray'].map(variant=>({id:variant,variant,verified:true,sourceHash:'pixels',words}));
const locate=words=>localizeDocumentTotal(model,page(words),12,500,400);
const total=word('321.45',340,240);
assert(locate([total]).finalField,'A unique aligned value');
assert(locate([word('TOTAL',240,240),total]).finalField,'B adjacent label');
assert(locate([word('TOTAL',20,20),total]).finalField,'C header label');
assert.equal(locate([total,word('400.00',340,285)]).bounds,undefined,'D competing footer');
assert.equal(locate([word('100.00',340,165)]).bounds,undefined,'E body amount');
const subtotal=word('SUBTOTAL',220,215),subvalue=word('300.00',340,215),grand=word('GRAND TOTAL',180,265,130),grandvalue=word('321.45',340,265);
assert.equal(locate([subtotal,subvalue,grand,grandvalue]).selected.bounds.top,265,'F semantic distinction');
assert.equal(locate([]).bounds,undefined,'G no field');
assert.equal(locate([word('300.00',50,240)]).bounds,undefined);
assert.equal(locate([word('invoice',220,240),total]).bounds,undefined);
assert.equal(localizeDocumentTotal(model,[{...page([total])[0],sourceHash:'other'}],12,500,400).bounds,undefined);
const proof=locate([total]),layout={sourceWidth:500,sourceHeight:400,rows:model.table.rows,totalCandidateRegion:proof.bounds,totalLocalization:proof,diagnostics:{font:12}},evidence={sourceHash:'pixels',rows:[{cents:null},{cents:10000}]};
const obs=variant=>({id:variant,variant,sourceHash:'pixels',scope:'document',field:'total',bounds:proof.bounds,confidence:94,money:[32145],words:[],raw:'321.45'});
assert.equal(decideDocumentTotal(layout,evidence,[obs('native'),obs('contrast')]).cents,32145);
assert.equal(decideDocumentTotal(layout,evidence,[obs('native')]).cents,null,'No single-pass structural authority');
assert.equal(decideDocumentTotal(layout,{...evidence,rows:[{cents:10000},{cents:10000}]},[obs('native'),obs('contrast')]).cents,null,'Arithmetic only vetoes');
console.log('PASS A–G total geometry, semantic distinction, source isolation, independent observation support, arithmetic veto');

// Saved iPhone attempt 9e393393 (2026-10-21): full-frame background ink
// widened amount ownership to x4011; actual monetary word edges stay ~3470.
const phoneRows=[
 [760,44,3287,775,498,40],[805,49,3284,820,556,46],
 [855,50,3282,871,729,45],[906,46,3280,922,751,41]
].map(([top,height,left,ownerTop,width,ownerHeight],i)=>({id:'row-'+i,bounds:{left:0,top,width:4032,height},amountRegion:{left,top:ownerTop,width,height:ownerHeight}}));
const phoneModel={...model,table:{...model.table,rows:phoneRows}};
const phoneWords=[
 ['1,089.00',3290,778,183,29,95],['1,099.00',3288,828,183,29,96],
 ['1,291.33',3285,878,181,29,96],['1,099.00',3284,929,182,29,95],
 ['4,588.33',3279,1009,182,48,93]
].map(([text,left,top,width,height,confidence])=>({text,bounds:{left,top,width,height},confidence}));
const phoneLocate=observations=>localizeDocumentTotal(phoneModel,observations,15,4032,2160);
const phone=phoneLocate(page(phoneWords));
assert(phone.finalField,'Observed row-money geometry must locate the real iPhone footer despite oversized ownership bounds');
assert.equal(phone.selected.observations[0].cents,458833);
assert(Math.abs(phone.axis-3470)<15);
assert.equal(phoneLocate(page(phoneWords.slice(0,4))).bounds,undefined,'Row amounts never become a missing footer');
assert.equal(phoneLocate(page([...phoneWords, {...phoneWords[4],text:'4,600.00',bounds:{...phoneWords[4].bounds,top:1090}}])).bounds,undefined,'Competing totals still block');
assert.equal(phoneLocate(page(phoneWords).map(o=>({...o,sourceHash:'other'}))).bounds,undefined,'No cross-source axis support');
assert.equal(phoneLocate(page(phoneWords.map(w=>({...w,bounds:{...w.bounds,left:50}})))).bounds,undefined,'Amounts outside the labeled ownership cannot move the axis');
console.log('PASS retained iPhone amount-column contamination, missing/competing totals and source/ownership isolation');
