import {measuredTableHeader} from './tableHeaderOwnership.ts';
import type {WordBox} from '../ocrStructure.ts';
type Bounds={left:number;top:number;width:number;height:number};
type Row={rowId:string;y?:number;height?:number;amountCandidates:Array<{raw:string;bbox?:Partial<WordBox>}>};
/** Crops are owned by one measured table row and its labelled amount column.
 * Margin is font-relative and stops at neighboring row midlines. */
export function ownedRowAmountRegions(rows:Row[],words:Array<{text:string;confidence:number;bbox:WordBox}>,width:number,height:number){
 const table=measuredTableHeader(words);if(!table)return [];
 const captions=words.filter(w=>/^amount$/i.test(w.text.trim())&&w.confidence>=30&&Math.abs((w.bbox.y0+w.bbox.y1)/2-table.slope*(w.bbox.x0+w.bbox.x1)/2-table.intercept)<=table.font*.75).sort((a,b)=>b.confidence-a.confidence);
 const caption=captions[0];if(!caption)return [];
 return rows.flatMap(row=>{
  if(row.y==null||!row.height||row.y<=caption.bbox.y1)return [];
  const boxes=row.amountCandidates.filter(c=>/^\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(c.raw.trim())).map(c=>c.bbox).filter((b):b is WordBox=>!!b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&Number(b.x1)>caption.bbox.x0&&Number(b.x1)-Number(b.x0)<row.height!*12);
  if(!boxes.length)return [];
  const leftGlyph=Math.min(...boxes.map(b=>b.x0)),rightGlyph=Math.max(...boxes.map(b=>b.x1)),topGlyph=Math.min(...boxes.map(b=>b.y0)),bottomGlyph=Math.max(...boxes.map(b=>b.y1));
  const glyphHeight=bottomGlyph-topGlyph;if(!(glyphHeight>0&&glyphHeight<row.height*2))return [];
  const margin=Math.ceil(glyphHeight*.3),previous=Math.max(-Infinity,...rows.filter(r=>r.y!=null&&r.y<row.y!).map(r=>r.y!)),next=Math.min(Infinity,...rows.filter(r=>r.y!=null&&r.y>row.y!).map(r=>r.y!));
  const left=Math.max(0,Math.floor(leftGlyph-margin)),right=Math.min(width,Math.ceil(rightGlyph+margin)),top=Math.max(0,Math.floor(topGlyph-margin),Math.ceil((previous+row.y)/2)),bottom=Math.min(height,Math.ceil(bottomGlyph+margin),Math.floor((next+row.y)/2));
  return right>left&&bottom>top?[{rowId:row.rowId,bounds:{left,top,width:right-left,height:bottom-top} as Bounds}]:[];
 });
}
export type OwnedAmountProof={canonicalHash:string;normalizedHash:string;cropHash:string;rowId:string;bounds:Bounds};
export function ownedRowAmountConsensus(words:Array<{text:string;confidence:number;region:string;variant:string;pageMode:string;ownedAmount?:OwnedAmountProof}>,rowId:string){
 const observed=words.filter(w=>w.ownedAmount?.rowId===rowId&&[w.ownedAmount.canonicalHash,w.ownedAmount.normalizedHash,w.ownedAmount.cropHash].every(h=>/^[a-f0-9]{64}$/.test(h))&&w.region.startsWith('payment-row-amount-')&&w.confidence>=85&&/^\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(w.text.trim()));
 const values=[...new Set(observed.map(w=>w.text.replace(/[$,\s]/g,'')))];
 const passes=new Set(observed.map(w=>w.ownedAmount!.cropHash));
 const bindings=new Set(observed.map(w=>w.ownedAmount!.canonicalHash+'|'+w.ownedAmount!.normalizedHash+'|'+JSON.stringify(w.ownedAmount!.bounds)));
 if(bindings.size>1)return {value:null,conflict:true};
 return {value:values.length===1&&passes.size>=2?Number(values[0]):null,conflict:values.length>1};
}
