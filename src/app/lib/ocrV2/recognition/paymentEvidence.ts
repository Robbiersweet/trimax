// Offline Phase 5B. Optical fields only: no invoice records or benchmark answers.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Bounds } from '../types.ts';
import type { structuralLayout } from '../layout/generalized.ts';

type Layout = Awaited<ReturnType<typeof structuralLayout>>;
export type PaymentObservation = {
  id: string; scope: 'row' | 'document'; rowId?: string; field: 'amount' | 'total' | 'footer-label' | 'header' | 'check';
  variant: string; raw: string; bounds: Bounds; sourceHash: string; cropHash: string;
  durationMs: number; confidence: number; money: number[];
  words: Array<{ text: string; bounds: Bounds; confidence: number }>;
};
export type MoneyDecision = { cents: number | null; candidates: Array<{ cents: number; observations: string[] }>; ambiguity: 'missing' | 'conflicting' | 'supported'; confidence: 'unavailable' | 'agreement' | 'strong-single'; provenance: string[] };
export type DocumentPaymentEvidence = {
  documentId: string; sourceHash: string; checkNumber: string | null; checkDate: string | null; payor: string | null;
  headerEvidence: { observations: PaymentObservation[]; checkCandidates: string[]; dateCandidates: string[]; payorCandidates: string[] };
  authoritativeTotal: number | null;
  totalEvidence: MoneyDecision & { authority: 'explicit-label' | 'unlabeled-footer' | 'unknown'; labelEvidence: string[]; observations: PaymentObservation[]; belowLastRow: boolean };
  rows: Array<MoneyDecision & { rowId: string; observations: PaymentObservation[] }>;
  timings: { rowAmountsMs: number; footerMs: number; headerMs: number; completeMs: number; passCount: number };
};

/** Formatting separators only; no digit insertion, deletion, substitution or database lookup. */
export function paymentMoney(raw: string) {
  return [...raw.matchAll(/(?:^|\s)(\$?[\d.,]+)(?=\s|$)/g)].flatMap(m => {
    const token=m[1].replace(/^\$/,'');
    if (!/^(?:\d+|\d{1,3}(?:[, .]\d{3})+)[.,]\d{2}$/.test(token)) return [];
    const digits=token.replace(/[.,]/g,'');
    const value=Number(digits);
    return Number.isSafeInteger(value)&&value>0?[value]:[];
  });
}
export function decideMoney(observations: PaymentObservation[]): MoneyDecision {
  const values=[...new Set(observations.flatMap(o=>o.money))];
  const candidates=values.map(cents=>({cents,observations:observations.filter(o=>o.money.length===1&&o.money[0]===cents).map(o=>o.id)}));
  // Distinct preprocessing variants corroborate, but this is not calibrated probability.
  const supported=candidates.filter(c=>new Set(observations.filter(o=>c.observations.includes(o.id)&&o.confidence>=40).map(o=>o.variant)).size>=2
    || observations.some(o=>c.observations.includes(o.id)&&o.confidence>=85));
  const selected=supported.length===1?supported[0]:null;
  return {cents:selected?.cents??null,candidates,ambiguity:selected?'supported':values.length?'conflicting':'missing',confidence:selected?(selected.observations.length>=2?'agreement':'strong-single'):'unavailable',provenance:selected?.observations??[]};
}
export function normalizePaymentDate(raw: string) {
  const match=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(!match)return null;
  const [,m,d,y]=match, date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
  return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()===Number(m)-1&&date.getUTCDate()===Number(d)?`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`:null;
}
export function paymentRegions(layout: Layout) {
  if(!layout.rows.length||!layout.headerRegion||!layout.totalCandidateRegion)throw Error('Payment evidence requires supported Phase 2 geometry');
  const last=Math.max(...layout.rows.map(r=>r.bounds.top+r.bounds.height)),total=layout.totalCandidateRegion;
  if(total.top<last)throw Error('Total region overlaps physical rows');
  const top=Math.max(last,Math.floor(total.top-total.height));
  // Expand the table-heading anchor to the nearby remittance header, not the
  // entire photograph (which can include a textured desk or a separate check).
  const font=layout.diagnostics.font*layout.sourceWidth/Math.min(layout.sourceWidth,2400);
  const headerTop=Math.max(0,Math.floor(layout.headerRegion.top-font*10));
  return {header:{left:0,top:headerTop,width:layout.sourceWidth,height:Math.max(1,Math.floor(layout.headerRegion.top)-headerTop)},
    footer:{left:0,top,width:layout.sourceWidth,height:Math.min(layout.sourceHeight-top,Math.ceil(total.top+total.height*2-top))},total};
}

export async function recognizePaymentEvidence(image: Buffer, layout: Layout, documentId: string, retainedAmounts: PaymentObservation[] = []): Promise<DocumentPaymentEvidence> {
  const start=performance.now(),sourceHash=createHash('sha256').update(image).digest('hex'),regions=paymentRegions(layout);
  const meta=await sharp(image).metadata();if(meta.width!==layout.sourceWidth||meta.height!==layout.sourceHeight)throw Error('Image/layout coordinate mismatch');
  const worker=await createWorker('eng',OEM.LSTM_ONLY,{logger:()=>undefined});let passCount=0;
  let completed: DocumentPaymentEvidence | null = null;
  async function observe(field: PaymentObservation['field'],bounds: Bounds,variant: string,rowId?:string): Promise<PaymentObservation> {
    const began=performance.now(),crop=await sharp(image).extract(bounds).flatten({background:'white'}).png().toBuffer();
    let pixels=crop;
    if(variant!=='native')pixels=await sharp(crop).grayscale().png().toBuffer();
    if(variant==='local-contrast'||variant==='numeric-focused'){
      const gray=await sharp(crop).grayscale().raw().toBuffer({resolveWithObject:true}),bg=await sharp(crop).grayscale().blur(12).raw().toBuffer();
      const data=Buffer.from(gray.data.map((v,i)=>Math.max(0,Math.min(255,245+(v-bg[i])*3))));pixels=await sharp(data,{raw:{width:gray.info.width,height:gray.info.height,channels:1}}).png().toBuffer();
    }
    const scale=field==='header'||field==='footer-label'?1:2,border=12;pixels=await sharp(pixels).resize(bounds.width*scale,bounds.height*scale).extend({top:border,bottom:border,left:border,right:border,background:'white'}).png().toBuffer();
    await worker.setParameters({tessedit_pageseg_mode:field==='header'||field==='footer-label'?PSM.SPARSE_TEXT:PSM.SINGLE_LINE,tessedit_char_whitelist:field==='check'?'0123456789':variant==='numeric-focused'?'0123456789$,.':'',user_defined_dpi:'300'});
    const {data}=await worker.recognize(pixels,{}, {text:true,blocks:true});passCount++;
    const words=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).map(w=>({text:w.text,confidence:w.confidence,bounds:{left:bounds.left+(w.bbox.x0-border)/scale,top:bounds.top+(w.bbox.y0-border)/scale,width:(w.bbox.x1-w.bbox.x0)/scale,height:(w.bbox.y1-w.bbox.y0)/scale}}));
    return {id:`${documentId}:${rowId??field}:${variant}`,scope:rowId?'row':'document',rowId,field,variant,raw:data.text,bounds,sourceHash,cropHash:createHash('sha256').update(crop).digest('hex'),durationMs:performance.now()-began,confidence:data.confidence,money:paymentMoney(data.text),words};
  }
  try {
    const rows:DocumentPaymentEvidence['rows']=[],rowStart=performance.now();
    for(const [index,row] of layout.rows.entries()){
      if(!row.amountRegion)throw Error('Missing amount-column geometry');
      const rowId=`${documentId}-${index}`;
      const observations=retainedAmounts.filter(o=>o.rowId===rowId&&o.scope==='row'&&o.field==='amount'&&o.sourceHash===sourceHash).map(o=>({...o,money:paymentMoney(o.raw)}));
      if(!observations.length)for(const variant of ['native','local-contrast'])observations.push(await observe('amount',row.amountRegion,variant,rowId));
      if(decideMoney(observations).cents===null)for(const variant of ['native','grayscale','local-contrast','numeric-focused']){
        if(!observations.some(o=>o.variant===variant))observations.push(await observe('amount',row.amountRegion,variant,rowId));
      }
      rows.push({rowId:`${documentId}-${index}`,...decideMoney(observations),observations});
    }
    const rowAmountsMs=performance.now()-rowStart,footerStart=performance.now(),totals=[];
    for(const variant of ['native','grayscale','local-contrast','numeric-focused'])totals.push(await observe('total',regions.total,variant));
    const decision=decideMoney(totals);
    const labels=[];if(decision.cents!==null)for(const variant of ['native','local-contrast'])labels.push(await observe('footer-label',regions.footer,variant));
    const labelEvidence=labels.filter(o=>o.words.some(w=>/^TOTAL:?$/i.test(w.text)&&w.bounds.left<regions.total.left&&Math.abs(w.bounds.top-regions.total.top)<regions.total.height*1.5)
      && !/\bSUB\s*-?\s*TOTAL\b/i.test(o.raw)).map(o=>o.id);
    const explicit=decision.cents!==null&&labelEvidence.length>=2;
    const footerMs=performance.now()-footerStart,headerStart=performance.now(),headers=[];
    for(const variant of ['native','grayscale'])headers.push(await observe('header',regions.header,variant));
    const checks=headers.flatMap(o=>[...new Set([...o.raw.matchAll(/\b(?:CHECK|CHK|CK)[^\d\n]{0,8}(\d{3,12})\b/gi)].map(m=>m[1]))]);
    // One bounded numeric check crop, located by observed label/word geometry.
    // No guessed position, account number, or expected check value is supplied.
    const anchor=headers.flatMap(o=>o.words.map(w=>({word:w,words:o.words}))).find(x=>/^(?:CHECK|CHK|CK)/i.test(x.word.text));
    if(anchor){
      const target=/\d{3,12}/.test(anchor.word.text)?anchor.word:anchor.words.filter(w=>/^\d{3,12}$/.test(w.text)&&w.bounds.left>=anchor.word.bounds.left+anchor.word.bounds.width&&Math.abs(w.bounds.top-anchor.word.bounds.top)<anchor.word.bounds.height).sort((a,b)=>a.bounds.left-b.bounds.left)[0];
      if(target){const left=Math.max(regions.header.left,Math.floor(target.bounds.left-2)),top=Math.max(regions.header.top,Math.floor(target.bounds.top-2));
        const bounds={left,top,width:Math.min(regions.header.width-left,Math.ceil(target.bounds.left+target.bounds.width+2)-left),height:Math.min(regions.header.top+regions.header.height-top,Math.ceil(target.bounds.top+target.bounds.height+2)-top)};
        if(bounds.width>0&&bounds.height>0){const extra=await observe('check',bounds,'numeric-focused');headers.push(extra);const digits=extra.raw.trim();if(/^\d{3,12}$/.test(digits))checks.push(digits);}
      }
    }
    const dates=headers.flatMap(o=>[...new Set([...o.raw.matchAll(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g)].map(m=>normalizePaymentDate(m[1])).filter((s):s is string=>s!==null))]);
    const payors=headers.flatMap(o=>[...o.raw.matchAll(/(?:^|\n)\s*(?:PAYOR|PAYER|PROPERTY|CUSTOMER)\s*:\s*([^\n]+)/gi)].map(m=>m[1].trim()));
    const consensus=(values:string[])=>{const unique=[...new Set(values)];return unique.length===1&&values.length>=2?unique[0]:null;};
    return completed={documentId,sourceHash,checkNumber:consensus(checks),checkDate:consensus(dates),payor:consensus(payors),headerEvidence:{observations:headers,checkCandidates:[...new Set(checks)],dateCandidates:[...new Set(dates)],payorCandidates:[...new Set(payors)]},authoritativeTotal:explicit?decision.cents:null,totalEvidence:{...decision,authority:explicit?'explicit-label':decision.cents===null?'unknown':'unlabeled-footer',labelEvidence,observations:[...totals,...labels],belowLastRow:true},rows,timings:{rowAmountsMs,footerMs,headerMs:performance.now()-headerStart,completeMs:performance.now()-start,passCount}};
  } finally {await worker.terminate();if(completed)completed.timings.completeMs=performance.now()-start;}
}
