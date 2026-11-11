import {createHash} from 'node:crypto';
import {moneyCents, sumMoney} from './money.ts';
import {invoiceCollectionAmountDue} from './invoiceEligibility';
import {moneyNumber} from './invoiceLifecycle';
import {customerMatchesPayor} from './remittanceMatching';
import {createPaymentTimelinessSnapshot} from './paymentTimeliness';

export type PostingInvoice={id:string;business_id:string;client_id:string|null;display_id:string|null;customer_name:string|null;project_title:string|null;invoice_amount:string|number|null;amount_paid:string|number|null;deposit_requested_amount:string|number|null;deposit_status:string|null;status:string|null;due_date:string|null;split_parent_invoice_id?:string|null};
export type PostingLine={id:string;invoice_id:string;description?:string|null;quantity?:string|number|null;unit_price?:string|number|null;line_total?:string|number|null};
export type VerifiedInvoiceReference={id:string;number:string;amountPaidCents:number;amountDueCents:number};
type Body={businessId?:string;invoiceIds?:string[];checkAmount?:number;receivedDate?:string|null;paymentDate?:string;checkDate?:string;paymentReference?:string;paymentType?:string;payor?:string;allocations?:{invoiceId:string;amount:number}[];reversedDuplicateConfirmed?:boolean;confirmedInvoiceRefs?:VerifiedInvoiceReference[];remittanceStubMatched?:boolean;remittanceStubTotal?:number|null;remittanceStubLineCount?:number|null;[key:string]:unknown};
export function postingRequestKey(body:Body,reversedAuditIds:string[]=[]){
 const normalized={business:String(body.businessId??''),ids:[...(body.invoiceIds??[])].sort(),amount:moneyCents(moneyNumber(body.checkAmount)),
  allocations:(body.allocations??[]).map(v=>({id:v.invoiceId,cents:moneyCents(moneyNumber(v.amount))})).sort((a,b)=>a.id.localeCompare(b.id)),
  date:body.checkDate??null,received:body.historicalReceiptDateUnknown===true ? null : body.receivedDate??body.paymentDate??null,type:String(body.paymentType??'').trim().toLowerCase(),
  reference:String(body.paymentReference??'').trim().toLowerCase(),payor:String(body.payor??'').normalize('NFKC').trim().toLowerCase(),reversedAuditIds:[...reversedAuditIds].sort()};
 // Attachment IDs, network timing and notes cannot turn a retry into a new payment.
 return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export function verifiedActivitySnapshot(rows:{id:string;entity_id?:string|null;entity_label?:string|null;details?:Record<string,unknown>|null}[]){
 return rows.map(v=>({id:v.id,entityId:v.entity_id??null,entityLabel:v.entity_label??null,details:v.details??{}})).sort((a,b)=>a.id.localeCompare(b.id));
}
export function prepareAtomicPlan(body:Body,invoices:PostingInvoice[],lineItems:Map<string,PostingLine[]>,audit:Record<string,unknown>,overrideAudit:Record<string,unknown>|null){
 const ids=body.invoiceIds??[],refs=body.confirmedInvoiceRefs??[];
 const exactCents=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&Number.isSafeInteger(Math.round(value*100))&&Math.abs(value*100-Math.round(value*100))<0.000001;
 if(!exactCents(body.checkAmount)||body.allocations?.some(v=>!v||!exactCents(v.amount)))throw Error('Payment and allocation amounts require exact cents.');
 if(new Set(ids).size!==ids.length||ids.length!==invoices.length||refs.length!==ids.length||new Set(refs.map(v=>v.id)).size!==ids.length)throw Error('Review every intended invoice reference before posting. Refresh the payment screen if needed.');
 const payor=String(audit.payor??'').trim();
 if(!payor||invoices.some(v=>!customerMatchesPayor(v.customer_name??'',payor)))throw Error('Every allocation must agree with the verified payor.');
 if(new Set(invoices.map(v=>(v.customer_name??'').trim().toLowerCase())).size!==1)throw Error('A complete check must have one verified customer/payor.');
 const requested=body.allocations;
 if(requested&&(requested.length!==ids.length||new Set(requested.map(v=>v.invoiceId)).size!==ids.length||requested.some(v=>!ids.includes(v.invoiceId))))throw Error('Every intended invoice requires exactly one allocation.');
 const allocations=invoices.map(invoice=>{
  const due=invoiceCollectionAmountDue(invoice),paid=moneyNumber(invoice.amount_paid),total=moneyNumber(invoice.invoice_amount),ref=refs.find(v=>v.id===invoice.id);
  if(!ref||ref.number!==(invoice.display_id??invoice.project_title??'Invoice')||ref.amountPaidCents!==moneyCents(paid)||ref.amountDueCents!==moneyCents(due))throw Error('An invoice changed after review. Review the whole check again.');
  const amount=requested?moneyNumber(requested.find(v=>v.invoiceId===invoice.id)!.amount):due;
  if(!Number.isSafeInteger(moneyCents(amount))||amount<=0||moneyCents(amount)>moneyCents(due)||moneyCents(amount)>moneyCents(total-paid))throw Error('An allocation exceeds a collectible invoice balance.');
  const next=sumMoney([paid,amount]),snapshot=typeof audit.receivedDate==='string' && moneyCents(next)===moneyCents(total)?createPaymentTimelinessSnapshot({invoice,lineItems:lineItems.get(invoice.id)??[],fullyPaidDate:String(audit.receivedDate),finalPaymentReference:String(audit.paymentReference)}):null;
  return{invoiceId:invoice.id,amountCents:moneyCents(amount),expected:{totalCents:moneyCents(total),paidCents:moneyCents(paid),status:invoice.status,depositStatus:invoice.deposit_status,depositRequestedCents:moneyCents(moneyNumber(invoice.deposit_requested_amount)),clientId:invoice.client_id,customerName:invoice.customer_name,invoiceNumber:invoice.display_id,dueDate:invoice.due_date,
   lineItems:(lineItems.get(invoice.id)??[]).map(v=>({id:v.id,description:v.description??null,quantity:v.quantity??null,unit_price:v.unit_price??null,line_total:v.line_total??null})).sort((a,b)=>a.id.localeCompare(b.id))},
   ...(snapshot?{timeliness:{dueDateAtCompletion:snapshot.dueDateAtCompletion,fullyPaidDate:snapshot.fullyPaidDate,daysLate:snapshot.daysLate,paidLate:snapshot.paidLate,finalPaymentReference:snapshot.finalPaymentReference,recordedAt:snapshot.recordedAt}}:{})};
 });
 const checkCents=moneyCents(moneyNumber(body.checkAmount));
 if(!Number.isSafeInteger(checkCents)||checkCents<=0||allocations.reduce((s,v)=>s+v.amountCents,0)!==checkCents)throw Error('The complete check must reconcile with every intended allocation.');
 const intendedCount=body.remittanceStubMatched?Number(body.remittanceStubLineCount):ids.length;
 if(intendedCount!==ids.length)throw Error('An intended remittance row is missing or unresolved.');
 const documentCents=body.remittanceStubMatched?moneyCents(moneyNumber(body.remittanceStubTotal)):null;
 if(documentCents!==null&&documentCents!==checkCents)throw Error('The document grand total does not reconcile with all allocations.');
 return{approved:true,checkCents,intendedCount,documentCents,allocations,audit,overrideAudit};
}
