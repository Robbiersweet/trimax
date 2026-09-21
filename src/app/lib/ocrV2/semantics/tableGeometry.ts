import type { Bounds } from '../types.ts';
import { headerMoney } from '../recognition/documentTotalAuthority.ts';
import type { SemanticColumn, SemanticLabel, SemanticObservation, SemanticRow } from './model.ts';

const right = (b: Bounds) => b.left + b.width;
const bottom = (b: Bounds) => b.top + b.height;
const center = (b: Bounds) => b.top + b.height / 2;
const sameLine = (a: Bounds, b: Bounds) => Math.abs(bottom(a) - bottom(b)) < Math.max(a.height, b.height) * .6;
const union = (boxes: Bounds[]): Bounds => {
  const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top));
  return { left, top, width: Math.max(...boxes.map(right)) - left, height: Math.max(...boxes.map(bottom)) - top };
};
const invoiceToken = (text: string) => /^INV[\w-]*\d[\w-]*$/i.test(text) || /^\d[\d-]+$/.test(text);
// Decimal currency syntax, not arbitrary account numbers, dates, or quantities.
const moneyToken = (text: string) => /^[$£€]?\d[\d,]*\.\d{2}$/.test(text.trim()) && headerMoney(text) !== null;

/** Same-image observations share coordinates. A missed label in one pass must
 * not erase a spatially aligned sibling label. Geometry never supplies values. */
export function mapSemanticTable(observations: SemanticObservation[], labels: SemanticLabel[]) {
  const invoice = labels.filter(l => l.type === 'invoice_number').sort((a,b) => b.confidence-a.confidence)[0];
  if (!invoice) return { heading: [] as SemanticLabel[], columns: [] as SemanticColumn[], rows: [] as SemanticRow[] };
  const heading = labels.filter(l => sameLine(l.bounds, invoice.bounds));
  const columns: SemanticColumn[] = [];
  for (const label of heading.slice().sort((a,b) => b.confidence-a.confidence)) {
    const existing = columns.find(c => c.type === label.type);
    if (existing) {
      if (Math.abs(existing.bounds.left-label.bounds.left) < Math.max(existing.bounds.height,label.bounds.height)*2) existing.labelEvidence!.push(label.id);
    } else columns.push({ type: label.type, bounds: label.bounds, labelEvidence: [label.id], geometryEvidence: [], semanticConfidence: 'label-supported' });
  }
  const candidates = observations.flatMap(o => o.words.filter(w => w.bounds.top > bottom(invoice.bounds) && invoiceToken(w.text) && Math.abs(w.bounds.left-invoice.bounds.left) < invoice.bounds.height*3)
    .filter(w => !labels.some(l => ['document_total','subtotal','balance'].includes(l.type) && sameLine(l.bounds,w.bounds)))
    .map(w => ({ ...w, observationId: o.id })));
  const prefixed = candidates.filter(w=>/^INV/i.test(w.text));
  const anchors = prefixed.length ? candidates.filter(w=>/^INV/i.test(w.text) || prefixed.some(p=>sameLine(p.bounds,w.bounds))) : candidates;
  const bands: typeof anchors[] = [];
  for (const word of anchors.sort((a,b) => center(a.bounds)-center(b.bounds))) {
    const band = bands.find(b => Math.abs(center(b[0].bounds)-center(word.bounds)) < Math.min(b[0].bounds.height,word.bounds.height)*.7);
    if (band) band.push(word); else bands.push([word]);
  }
  // A header alone cannot invent a table. Repeated invoice anchors establish
  // rows even when the same page OCR fails to transcribe their monetary values.
  if (!bands.length) return { heading, columns, rows: [] as SemanticRow[] };
  const monetary = observations.flatMap(o => o.words.filter(w => moneyToken(w.text) && bands.some(b => sameLine(b[0].bounds,w.bounds))).map(w => ({...w, observationId:o.id})));
  if (!columns.some(c => c.type === 'row_amount')) {
    const clusters: typeof monetary[] = [];
    for (const word of monetary) {
      const group = clusters.find(g => Math.abs(right(g[0].bounds)-right(word.bounds)) < Math.max(g[0].bounds.height,word.bounds.height));
      if (group) group.push(word); else clusters.push([word]);
    }
    const supported = clusters.filter(g => bands.filter(b => g.some(w => sameLine(w.bounds,b[0].bounds))).length >= 2);
    // Competing monetary columns need a label; do not silently choose one.
    if (supported.length === 1) {
      const extent = union(supported[0].map(w => w.bounds));
      columns.push({type:'row_amount', bounds:{left:extent.left,top:invoice.bounds.top,width:extent.width,height:invoice.bounds.height}, labelEvidence:[],
        geometryEvidence:supported[0].map(w => ({observationId:w.observationId,bounds:w.bounds,kind:'decimal-money-aligned-with-invoice-row'})), semanticConfidence:'provisional-geometry'});
    }
  }
  columns.sort((a,b) => a.bounds.left-b.bounds.left);
  const amount = columns.find(c => c.type === 'row_amount');
  if (!amount) return { heading, columns, rows: [] as SemanticRow[] };
  const pageRight = Math.max(...observations.map(o => right(o.region)), ...observations.flatMap(o=>o.words.map(w=>right(w.bounds))));
  const afterAmount = columns.find(c => c.bounds.left > amount.bounds.left);
  const amountLeft = Math.max(0,amount.bounds.left-amount.bounds.height);
  const amountRight = afterAmount ? afterAmount.bounds.left-afterAmount.bounds.height : pageRight;
  const rows: SemanticRow[] = bands.map((band,i) => {
    const extent = union(band.map(w => w.bounds));
    const previous = bands[i-1], next = bands[i+1];
    const top = Math.max(0,Math.floor(previous ? (Math.max(...previous.map(w=>bottom(w.bounds)))+extent.top)/2 : extent.top-extent.height*.3));
    const end = Math.floor(next ? (bottom(extent)+Math.min(...next.map(w=>w.bounds.top)))/2 : bottom(extent)+extent.height*.3);
    const ink = observations.flatMap(o=>o.words).filter(w => center(w.bounds)>=top && center(w.bounds)<end);
    const left = Math.min(...columns.map(c=>c.bounds.left),...ink.map(w=>w.bounds.left));
    const rowRight = Math.max(right(extent),...ink.map(w=>right(w.bounds)),amountRight);
    const matchedMoney = monetary.filter(w=>center(w.bounds)>=top && center(w.bounds)<end && w.bounds.left>=amountLeft && right(w.bounds)<=amountRight);
    const values = [...new Set(matchedMoney.map(w=>headerMoney(w.text)))];
    const invoiceColumn = columns.find(c=>c.type==='invoice_number')!;
    invoiceColumn.geometryEvidence!.push(...band.map(w=>({observationId:w.observationId,bounds:w.bounds,kind:'repeated-invoice-token'})));
    amount.geometryEvidence!.push(...matchedMoney.map(w=>({observationId:w.observationId,bounds:w.bounds,kind:'decimal-money-aligned-with-invoice-row'})));
    return {id:`semantic-row-${i}`,bounds:{left,top,width:rowRight-left,height:end-top},
      invoiceRegion:{left:Math.max(0,extent.left-2),top,width:extent.width+4,height:end-top},
      amountRegion:matchedMoney.length ? union(matchedMoney.map(w=>w.bounds)) : {left:amountLeft,top,width:amountRight-amountLeft,height:end-top},amountCents:values.length===1?values[0]:null};
  });
  return { heading, columns, rows };
}
