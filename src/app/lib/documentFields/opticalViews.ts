import {moneyCents} from '../money.ts';
import type {StructuredRemittanceRowEvidence} from '../remittanceMatching.ts';
type View={canonicalHash:string;normalizedHash:string;header:{documentTotal:{payable:boolean;amount:number}|null;checkNumber?:string|null;checkDate?:string|null;payor?:string|null;checkNumberEvidence?:{value:string|null};checkDateEvidence?:{value:string|null}};rows:StructuredRemittanceRowEvidence[]};
/** Same capture, independent image evidence. Neither invoice balances nor an
 * expected subtotal belongs here. A complete alternate cannot erase a conflict. */
export function compareOpticalViews(a:View,b:View){
  if(!/^[a-f0-9]{64}$/.test(a.canonicalHash)||a.canonicalHash!==b.canonicalHash||!/^[a-f0-9]{64}$/.test(a.normalizedHash)||!/^[a-f0-9]{64}$/.test(b.normalizedHash))throw Error('Optical view source binding missing');
  const conflicts:string[]=[];
  if(a.header.documentTotal?.payable&&b.header.documentTotal?.payable&&moneyCents(a.header.documentTotal.amount)!==moneyCents(b.header.documentTotal.amount))conflicts.push('Conflicting independently observed document totals across optical views.');
  const normalized=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  for(const key of ['checkNumber','checkDate','payor'] as const){const x=a.header[key],y=b.header[key];if(x&&y&&normalized(x)!==normalized(y))conflicts.push(`Conflicting accepted ${key} across optical views.`);}
  for(const key of ['checkNumberEvidence','checkDateEvidence'] as const){const x=a.header[key]?.value,y=b.header[key]?.value;if(x&&y&&x!==y)conflicts.push(`Conflicting strong ${key} across optical views.`);}
  const strongInvoiceSet=(view:View)=>view.rows.map(row=>{
    const values=[...new Set((row.invoiceEvidenceByPass??[]).filter(e=>(e.confidence??0)>=85&&e.normalized.length===1).flatMap(e=>e.normalized))];
    return values.length===1?values[0]:null;
  });
  const xInvoices=strongInvoiceSet(a),yInvoices=strongInvoiceSet(b);
  if(xInvoices.length&&yInvoices.length&&xInvoices.every(v=>v!==null)&&yInvoices.every(v=>v!==null)&&JSON.stringify([...xInvoices].sort())!==JSON.stringify([...yInvoices].sort()))conflicts.push('Conflicting independently observed invoice identities across optical views.');
  const strongAmounts=(row:StructuredRemittanceRowEvidence)=>[...new Set(row.amountCandidates.filter(c=>c.selected&&(c.confidence??0)>=85&&/^\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(c.raw?.trim()??'')).map(c=>moneyCents(c.value)))];
  for(const row of a.rows){
    const other=b.rows.filter(r=>row.normalizedInvoiceCandidates.length===1&&r.normalizedInvoiceCandidates.length===1&&r.normalizedInvoiceCandidates[0]===row.normalizedInvoiceCandidates[0]);
    if(other.length!==1)continue;
    const x=strongAmounts(row),y=strongAmounts(other[0]);
    if(x.length===1&&y.length===1&&x[0]!==y[0])conflicts.push('Conflicting strong physical row amount across optical views.');
  }
  return {compatible:conflicts.length===0,conflicts,canonicalHash:a.canonicalHash,normalizedHashes:[a.normalizedHash,b.normalizedHash]};
}
