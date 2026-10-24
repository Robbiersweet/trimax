type Word={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
/** Establish table ownership from three actual column captions. Missing body
 * invoice text never excludes a row; only pixels above the measured header do. */
export function measuredTableHeader(words:Word[]){
  const labels=words.filter(w=>w.confidence>=30&&/^(?:property|account|invoice|date|description|amount)$/i.test(w.text.trim()));
  const candidates:Array<{slope:number;intercept:number;font:number;support:number}>=[];
  for(const invoice of labels.filter(w=>/^invoice$/i.test(w.text.trim())))for(const amount of labels.filter(w=>/^amount$/i.test(w.text.trim()))){
    const ix=(invoice.bbox.x0+invoice.bbox.x1)/2,iy=(invoice.bbox.y0+invoice.bbox.y1)/2,ax=(amount.bbox.x0+amount.bbox.x1)/2,ay=(amount.bbox.y0+amount.bbox.y1)/2,font=Math.max(invoice.bbox.y1-invoice.bbox.y0,amount.bbox.y1-amount.bbox.y0);
    if(ax-ix<font*3)continue;const slope=(ay-iy)/(ax-ix),intercept=iy-slope*ix;if(Math.abs(slope)>.25)continue;
    const support=labels.filter(w=>Math.abs((w.bbox.y0+w.bbox.y1)/2-slope*(w.bbox.x0+w.bbox.x1)/2-intercept)<=font*.75);
    if(new Set(support.map(w=>w.text.trim().toLowerCase())).size<3||!support.some(w=>/^(?:property|account|description)$/i.test(w.text.trim())))continue;
    candidates.push({slope,intercept,font,support:support.length});
  }
  return candidates.sort((a,b)=>b.support-a.support)[0]??null;
}
/** Score only measured table-column coverage, not parsed row values/counts.
 * A faint invoice token remains a real body band when other physical columns
 * independently occupy the same baseline. */
export function measuredTableBodySupport(rows:Array<{y:number;height:number;words:Word[]}>,words:Word[]){
 const header=measuredTableHeader(words);if(!header)return 0;
 const captions=words.filter(w=>w.confidence>=30&&/^(?:property|account|invoice|date|description|amount)$/i.test(w.text.trim())&&Math.abs((w.bbox.y0+w.bbox.y1)/2-header.slope*(w.bbox.x0+w.bbox.x1)/2-header.intercept)<=header.font*.75);
 const names=[...new Map(captions.sort((a,b)=>a.confidence-b.confidence).map(w=>[w.text.trim().toLowerCase(),w])).values()].sort((a,b)=>a.bbox.x0-b.bbox.x0);
 if(names.length<3)return 0;
 return rows.filter(row=>{
  const slots=new Set<string>();
  for(const word of row.words){
   const x=(word.bbox.x0+word.bbox.x1)/2,y=(word.bbox.y0+word.bbox.y1)/2;
   if(word.confidence<10||y<=header.slope*x+header.intercept+header.font||!/[A-Za-z0-9]/.test(word.text))continue;
   let slot=names[0];for(const c of names)if(x>=c.bbox.x0-header.font*.5)slot=c;
   slots.add(slot.text.trim().toLowerCase());
  }
  return slots.size>=3&&(slots.has('invoice')||slots.has('date'))&&slots.has('amount');
 }).length;
}
