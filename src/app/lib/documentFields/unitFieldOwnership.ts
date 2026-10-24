import {measuredTableHeader} from './tableHeaderOwnership.ts';
type Box={x0:number;y0:number;x1:number;y1:number};
type Word={text:string;confidence:number;bbox:Box;region?:string;variant?:string;pageMode?:string;rotation?:number};
type Row={y:number;height:number};
const pass=(w:Word)=>[w.region,w.variant,w.pageMode,w.rotation].join('|');
const key=(w:Word)=>pass(w)+'|'+w.text+'|'+Object.values(w.bbox).join(',');
/** Unit-like glyphs in prose are not unit evidence. A measured UNIT column,
 * its explicit inline label, or the leading code in a Description cell owns
 * the field. An unreadable leading token never licenses a later prose word. */
export function ownedUnitField(row:Row,words:Word[],allWords:Word[]){
 const header=measuredTableHeader(allWords),owned=new Map<string,Word>(),proof:Array<{kind:string;word:Word}>=[];
 const captions=header?allWords.filter(w=>w.confidence>=30&&/^(?:unit|description|amount|invoice|date|property|account)$/i.test(w.text.trim())&&Math.abs((w.bbox.y0+w.bbox.y1)/2-header.slope*(w.bbox.x0+w.bbox.x1)/2-header.intercept)<=header.font*.75):[];
 const candidates=captions.filter(w=>/^(?:unit|description)$/i.test(w.text.trim())&&w.bbox.y1<row.y-row.height/2).sort((a,b)=>b.confidence-a.confidence);
 const unitCaptions=candidates.filter(w=>/^unit$/i.test(w.text.trim()));
 const distinctUnits=unitCaptions.filter((w,i)=>!unitCaptions.slice(0,i).some(other=>Math.abs((w.bbox.x0+w.bbox.x1-other.bbox.x0-other.bbox.x1)/2)<=Math.min(w.bbox.x1-w.bbox.x0,other.bbox.x1-other.bbox.x0)));
 if(distinctUnits.length>1)return {available:false,words:[] as Word[],owns:()=>false,proof,caption:null,ambiguity:'Multiple distinct measured unit columns; preserve original evidence'};
 const caption=unitCaptions[0]??candidates[0],next=caption?captions.filter(w=>w.bbox.x0>caption.bbox.x1).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0]:null;
 const add=(word:Word,kind:string)=>{owned.set(key(word),word);proof.push({word,kind});};
 for(const id of new Set(words.map(pass))){
  const own=words.filter(w=>pass(w)===id).sort((a,b)=>a.bbox.x0-b.bbox.x0);
  for(let i=0;i<own.length-1;i++)if(/^unit[:#]?$/i.test(own[i].text.trim())&&own[i+1].bbox.x0-own[i].bbox.x1<row.height*1.5)add(own[i+1],'explicit-inline-unit-label');
  if(!caption||!header)continue;
  const font=Math.min(header.font,row.height);
  const start=caption.bbox.x0-font*.75,end=next?next.bbox.x0-header.font*.5:Infinity;
  const leading=own.find(w=>w.bbox.x0>=start&&w.bbox.x0<end&&/[A-Za-z0-9]/.test(w.text));
  // Description prose can start farther right when the code was not read.
  // In that case retain unknown rather than interpreting a later word as code.
  if(leading&&(/^unit$/i.test(caption.text.trim())||leading.bbox.x0<=caption.bbox.x0+font*1.5))add(leading,/^unit$/i.test(caption.text.trim())?'measured-unit-column':'measured-description-leading-token');
 }
 return {available:!!caption||proof.some(p=>p.kind==='explicit-inline-unit-label'),words:[...owned.values()],owns:(word:Word)=>owned.has(key(word)),proof,caption:caption??null};
}
