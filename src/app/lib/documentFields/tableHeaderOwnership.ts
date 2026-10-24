type Word={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
/** Establish table ownership from three actual column captions. Missing body
 * invoice text never excludes a row; only pixels above the measured header do. */
export function measuredTableHeader(words:Word[]){
  const labels=words.filter(w=>w.confidence>=30&&/^(?:property|account|invoice|date|description|amount)$/i.test(w.text.trim()));
  const candidates:Array<{slope:number;intercept:number;font:number;support:number}>=[];
  for(const invoice of labels.filter(w=>/^invoice$/i.test(w.text)))for(const amount of labels.filter(w=>/^amount$/i.test(w.text))){
    const ix=(invoice.bbox.x0+invoice.bbox.x1)/2,iy=(invoice.bbox.y0+invoice.bbox.y1)/2,ax=(amount.bbox.x0+amount.bbox.x1)/2,ay=(amount.bbox.y0+amount.bbox.y1)/2,font=Math.max(invoice.bbox.y1-invoice.bbox.y0,amount.bbox.y1-amount.bbox.y0);
    if(ax-ix<font*3)continue;const slope=(ay-iy)/(ax-ix),intercept=iy-slope*ix;if(Math.abs(slope)>.25)continue;
    const support=labels.filter(w=>Math.abs((w.bbox.y0+w.bbox.y1)/2-slope*(w.bbox.x0+w.bbox.x1)/2-intercept)<=font*.75);
    if(new Set(support.map(w=>w.text.toLowerCase())).size<3||!support.some(w=>/^(?:property|account|description)$/i.test(w.text)))continue;
    candidates.push({slope,intercept,font,support:support.length});
  }
  return candidates.sort((a,b)=>b.support-a.support)[0]??null;
}
