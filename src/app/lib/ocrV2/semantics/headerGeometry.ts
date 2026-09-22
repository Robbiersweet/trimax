import type { SemanticLabel } from './model.ts';

const x = (l: SemanticLabel) => l.bounds.left + l.bounds.width / 2;
const y = (l: SemanticLabel) => l.bounds.top + l.bounds.height;
const columnTypes = new Set(['invoice_number','row_amount','property_name','customer_name','payor_name','account_number','date','unit','description']);

/** Fit independent column labels, never repeated passes of one label. A pair
 * alone cannot establish skew. Incompatible/ambiguous layouts retain flat fallback. */
export function fitTableHeader(labels: SemanticLabel[], invoice: SemanticLabel) {
  const candidates = labels.filter(l => columnTypes.has(l.type));
  const unique: SemanticLabel[] = [];
  for (const label of candidates.slice().sort((a,b) => b.confidence-a.confidence)) {
    if (!unique.some(l => l.type === label.type && Math.abs(x(l)-x(label)) < Math.max(l.bounds.height,label.bounds.height)*2 && Math.abs(y(l)-y(label)) < Math.max(l.bounds.height,label.bounds.height))) unique.push(label);
  }
  const matches = (l:SemanticLabel,slope:number,intercept:number) => Math.abs(y(l)-slope*x(l)-intercept)/Math.hypot(1,slope) < Math.max(l.bounds.height,invoice.bounds.height)*.6;
  const flat = candidates.filter(l=>matches(l,0,y(invoice)));
  const fits: Array<{slope:number;intercept:number;support:SemanticLabel[];error:number}> = [];
  for (const label of unique) {
    const dx = x(label)-x(invoice);
    if (Math.abs(dx) < Math.max(label.bounds.height,invoice.bounds.height)*4) continue;
    const slope = (y(label)-y(invoice))/dx;
    // Heading fitting handles modest residual perspective, not quarter-turn orientation.
    if (Math.abs(slope) > Math.tan(Math.PI/12)) continue;
    const intercept = y(invoice)-slope*x(invoice);
    const support = unique.filter(l=>matches(l,slope,intercept));
    if (new Set(support.map(l=>l.type)).size < 3 || new Set(support.map(l=>l.type)).size !== support.length) continue;
    const meanX = support.reduce((s,l)=>s+x(l),0)/support.length, meanY = support.reduce((s,l)=>s+y(l),0)/support.length;
    const denominator = support.reduce((s,l)=>s+(x(l)-meanX)**2,0);
    if (!denominator) continue;
    const fittedSlope = support.reduce((s,l)=>s+(x(l)-meanX)*(y(l)-meanY),0)/denominator;
    if (Math.abs(fittedSlope) > Math.tan(Math.PI/12)) continue;
    const fittedIntercept = meanY-fittedSlope*meanX;
    if (!support.every(l=>matches(l,fittedSlope,fittedIntercept))) continue;
    fits.push({slope:fittedSlope,intercept:fittedIntercept,support,error:support.reduce((s,l)=>s+Math.abs(y(l)-fittedSlope*x(l)-fittedIntercept)/l.bounds.height,0)});
  }
  fits.sort((a,b)=>b.support.length-a.support.length||a.error-b.error);
  const best=fits[0];
  const competing=best&&fits.some(f=>f.support.length===best.support.length&&f.support.some(l=>!best.support.includes(l)));
  const accepted=best&&!competing?best:null;
  const heading=accepted?candidates.filter(l=>matches(l,accepted.slope,accepted.intercept)):flat;
  return {heading,geometry:{method:accepted?'independent-label-baseline-fit':'flat-baseline-fallback',slope:accepted?.slope??0,intercept:accepted?.intercept??y(invoice),supportLabelIds:(accepted?.support??flat).map(l=>l.id),ambiguous:Boolean(competing),residuals:heading.map(l=>({labelId:l.id,perpendicularPixels:Math.abs(y(l)-(accepted?.slope??0)*x(l)-(accepted?.intercept??y(invoice)))/Math.hypot(1,accepted?.slope??0)}))}};
}
