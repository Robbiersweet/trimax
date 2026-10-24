/* eslint-disable @typescript-eslint/no-require-imports -- Source-owned geometry adversaries, no production truth. */
const assert=require('node:assert/strict'),{coalesceComplementaryRowBands:coalesce}=require('../src/app/lib/documentFields/complementaryRowBands.ts');
const word=(text,x,y,h=20)=>({text,bbox:{x0:x,x1:x+55,y0:y-h/2,y1:y+h/2}});
const row=(y,words,height=20)=>({y,height,words,text:words.map(w=>w.text).join(' '),tokens:words.map(w=>w.text),score:50});
const anchors=()=>[100,140,180,220].map((y,i)=>row(y,[word('Example',10,y),word('INV-0'+(610+i),100,y),word('123.45',500,y)]));
const fragment=()=>row(228,[word('Unit',230,220,32),word('interior',320,222,34)],34);
const source=anchors(),input=[...source,fragment()],copy=structuredClone(input),good=coalesce(input);
assert.equal(good.length,4);assert.equal(good.at(-1).coalescenceProof.length,1);assert.equal(good.at(-1).y,220);assert.deepEqual(input,copy,'Never mutate original retained geometry');
for(const make of [()=>row(260,[word('unreadable',20,260),word('123.45',500,260)]),()=>row(228,[word('TOTAL',230,220),word('123.45',500,220)]),()=>row(228,[word('124.45',500,220)]),()=>row(228,[word('12/03/2027',250,220)]),()=>row(228,[word('Other',10,220),word('123.45',500,220)]),()=>row(228,[word('-123.45',500,220)]),()=>row(228,[word('different',230,270)])]){const x=[...anchors(),make()];assert.equal(coalesce(x).length,x.length,'Genuine rows, totals, conflicting money and nonoverlapping glyphs remain separate');}
const noAmount=anchors();noAmount.at(-1).words=noAmount.at(-1).words.filter(w=>w.text!=='123.45');assert.equal(coalesce([...noAmount,row(228,[word('123.45',500,220)])]).length,5,'An unlabeled footer amount cannot supply an invoice amount');
assert.equal(coalesce([anchors()[0],anchors()[1],fragment()]).length,3,'Two rows do not establish repeated pitch');
const uneven=anchors();uneven[2].y=205;assert.equal(coalesce([...uneven,fragment()]).length,5,'Irregular source pitch does not authorize merge');
console.log('PASS complementary same-frame glyph bands: repeated pitch/source overlap, immutable raw evidence, footer/subtotal/negative/date/foreign-cell/amount-conflict guards');
