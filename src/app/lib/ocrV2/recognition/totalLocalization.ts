/** Visual field localization only. Values never come from arithmetic or business data. */
import type { Bounds } from '../types.ts';
import type { DocumentSemanticModel, SemanticObservation } from '../semantics/model.ts';
import { paymentMoney } from './paymentEvidence.ts';
const bottom=(b:Bounds)=>b.top+b.height, right=(b:Bounds)=>b.left+b.width;
const area=(b:Bounds)=>b.width*b.height;
const overlap=(a:Bounds,b:Bounds)=>Math.max(0,Math.min(right(a),right(b))-Math.max(a.left,b.left))*Math.max(0,Math.min(bottom(a),bottom(b))-Math.max(a.top,b.top));
const median=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
export function localizeDocumentTotal(model:DocumentSemanticModel,page:SemanticObservation[],font:number,width:number,height:number){
 const rows=model.table.rows, owners=rows.flatMap(r=>r.amountRegion?[r.amountRegion]:[]);
 const last=Math.max(...rows.map(r=>bottom(r.bounds)),...owners.map(bottom));
 const axis=median(owners.map(right)), rowHeight=Math.max(...rows.map(r=>r.bounds.height));
 const supported=model.table.supported&&owners.length===rows.length&&rows.length>0&&model.table.columns.some(c=>c.type==='row_amount'&&c.semanticConfidence==='label-supported');
 const observations=page.filter(o=>o.verified&&o.sourceHash===model.sourceHash);
 const candidates=observations.flatMap(o=>o.words.flatMap(w=>{
  const values=paymentMoney(w.text);if(values.length!==1)return [];
  const b=w.bounds, rowOverlap=rows.some(r=>overlap(b,r.bounds)>0)||owners.some(r=>overlap(b,r)>0);
  const aligned=Number.isFinite(axis)&&Math.abs(right(b)-axis)<=font*2;
  const below=b.top>=last, gap=b.top-last;
  const nearby=o.words.filter(x=>x!==w&&Math.abs((x.bounds.top+x.bounds.height/2)-(b.top+b.height/2))<=Math.max(x.bounds.height,b.height)*.6&&x.bounds.left<right(b)&&right(x.bounds)>b.left-font*12);
  const label=nearby.filter(x=>/^(?:(?:GRAND|PAYMENT|CHECK)\s+)?TOTAL:?$|^AMOUNT\s+DUE:?$/i.test(x.text.trim())).map(x=>({text:x.text,bounds:x.bounds,confidence:x.confidence}));
  const subtotal=nearby.some(x=>/^SUB[-\s]*TOTAL:?$/i.test(x.text.trim()));
  const neighboringBody=nearby.some(x=>x.confidence>=40&&!/^(?:(?:GRAND|PAYMENT|CHECK|SUB)\s*)?TOTAL:?$|^AMOUNT:?$|^DUE:?$|^[\s:$.,\d]+$/i.test(x.text.trim()));
  const eligible=supported&&!rowOverlap&&aligned&&below&&gap<=rowHeight*4&&!neighboringBody;
  return [{text:w.text,cents:values[0],bounds:b,center:{x:b.left+b.width/2,y:b.top+b.height/2},observationId:o.id,variant:o.variant,confidence:w.confidence,axisDistance:right(b)-axis,finalRowDistance:gap,rowOverlap,aligned,below,label,subtotal,eligible,rejection:rowOverlap?'physical row overlap':!below?'above final row':!aligned?'outside amount-column projection':gap>rowHeight*4?'outside bounded table continuation':neighboringBody?'neighboring body text':!supported?'unsupported amount table':null}];
 }));
 const groups:Array<{bounds:Bounds;observations:typeof candidates}>=[];
 for(const c of candidates.filter(c=>c.eligible)){
  const group=groups.find(g=>overlap(g.bounds,c.bounds)>=Math.min(area(g.bounds),area(c.bounds))*.6);
  if(group)group.observations.push(c);else groups.push({bounds:c.bounds,observations:[c]});
 }
 // Subtotal can be excluded only when a distinct, explicit final-total label exists.
 const labeled=groups.filter(g=>g.observations.some(c=>c.label.some(l=>l.confidence>=40))&&!g.observations.some(c=>c.subtotal));
 const plausible=labeled.length===1&&groups.every(g=>g===labeled[0]||g.observations.some(c=>c.subtotal))?labeled:groups;
 const chosen=plausible.length===1&&!plausible[0].observations.some(c=>c.subtotal)?plausible[0]:null;
 const pad=Math.max(2,Math.ceil(font*.2));
 const b=chosen?.bounds;
 const bounds=b?{left:Math.max(0,Math.floor(b.left-pad)),top:Math.max(Math.ceil(last),Math.floor(b.top-pad)),width:Math.min(width,Math.ceil(right(b)+pad))-Math.max(0,Math.floor(b.left-pad)),height:Math.min(height,Math.ceil(bottom(b)+pad))-Math.max(Math.ceil(last),Math.floor(b.top-pad))}:undefined;
 return {version:'document-total-localization-1',axis,lastRowBottom:last,candidates,plausibleFields:plausible.length,selected:chosen,bounds,finalField:supported&&!!chosen&&groups.every(g=>bottom(g.bounds)<=bottom(chosen.bounds)),reason:chosen?'Unique visual monetary field in amount-column continuation':plausible.length>1?'Competing footer monetary fields':'No isolated observed total field'};
}
