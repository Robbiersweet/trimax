type Word={text:string;bbox:{x0:number;y0:number;x1:number;y1:number}};
type Row={y:number;height:number;text:string;tokens:string[];words:Word[]};
export type RowCoalescenceProof={anchor:{y:number;height:number};fragment:{y:number;height:number;text:string;words:Word[]};measuredPitch:number;reason:string};
const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const invoice=(word:Word)=>/^INV[\w-]*\d[\w-]*$/i.test(word.text.trim());
const money=(word:Word)=>/^[$£€]?\d[\d,]*\.\d{2}$/.test(word.text.trim());
const protectedLabel=(text:string)=>/\b(?:SUB[ -]*TOTAL|TOTAL|CHECK|BALANCE|AMOUNT[ -]*DUE)\b/i.test(text);
/** Coalesce only same-frame complementary fragments whose actual glyph boxes
 * overlap a repeated invoice row. No invoice/amount value or expected row count
 * participates. Unknown genuine rows at normal pitch remain independent. */
export function coalesceComplementaryRowBands<T extends Row>(input:T[]):Array<T&{coalescenceProof?:RowCoalescenceProof[]}>{
 const anchors=input.filter(r=>r.words.some(invoice)).sort((a,b)=>a.y-b.y);
 if(anchors.length<3)return input;
 const font=median(anchors.map(r=>r.height)),gaps=anchors.slice(1).map((r,i)=>r.y-anchors[i].y),pitch=median(gaps);
 if(!(font>0&&pitch>font*1.1)||gaps.some(g=>Math.abs(g-pitch)>pitch*.35))return input;
 const merged=new Map<T,Array<T>>();
 for(const fragment of input.filter(r=>!r.words.some(invoice))){
  if(!fragment.words.length||fragment.words.length>3||protectedLabel(fragment.text)||fragment.words.some(w=>/\d{1,4}[/]\d{1,2}[/]\d{2,4}/.test(w.text)||/^[-−]/.test(w.text.trim())))continue;
  const owners=anchors.filter(anchor=>{
   if(Math.abs(anchor.y-fragment.y)>pitch*.5||protectedLabel(anchor.text))return false;
   const invRight=Math.max(...anchor.words.filter(invoice).map(w=>w.bbox.x1));
   if(fragment.words.some(w=>w.bbox.x0<invRight+font*.25))return false;
   const aMoney=anchor.words.filter(money),bMoney=fragment.words.filter(money);
   const values=[...new Set([...aMoney,...bMoney].map(w=>w.text.replace(/[$£€,]/g,'')))];
   // The anchor must already own a literal monetary word in this same pass.
   // A standalone nearby footer amount never supplies a missing invoice amount.
   if(values.length>1||!aMoney.length||!fragment.words.some(w=>!money(w)&&/[A-Za-z]{2}/.test(w.text)))return false;
   if(fragment.words.some(w=>{const overlap=Math.max(0,Math.min(w.bbox.y1,anchor.y+anchor.height/2)-Math.max(w.bbox.y0,anchor.y-anchor.height/2));return overlap<Math.min(w.bbox.y1-w.bbox.y0,anchor.height)*.5;}))return false;
   return true;
  });
  if(owners.length===1)merged.set(owners[0],[...(merged.get(owners[0])??[]),fragment]);
 }
 const consumed=new Set([...merged.values()].flat());
 return input.filter(row=>!consumed.has(row)).map(anchor=>{
  const fragments=merged.get(anchor);if(!fragments)return anchor;
  const words=[...anchor.words,...fragments.flatMap(r=>r.words)].sort((a,b)=>a.bbox.x0-b.bbox.x0),tokens=words.map(w=>w.text);
  return {...anchor,words,tokens,text:tokens.join(' '),coalescenceProof:fragments.map(fragment=>({anchor:{y:anchor.y,height:anchor.height},fragment:{y:fragment.y,height:fragment.height,text:fragment.text,words:fragment.words},measuredPitch:pitch,reason:'Same-frame glyph overlap and sub-pitch complementary cells; invoice anchor retained'}))};
 });
}
