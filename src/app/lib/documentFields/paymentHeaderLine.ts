import sharp from 'sharp';
import type { FaintPreparation } from '../ocrFaint.ts';
import {textComponents} from './visualComponents.ts';
/** Optical localization only. No monetary normalization or invoice data. */
type Word = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
const median = (values: number[]) => values.slice().sort((a,b) => a-b)[Math.floor(values.length/2)];
// Approximate label spelling only selects pixels to re-read. Exact values and
// labels still have to be recognized by the normal authority parser.
const fieldLabel = (text:string) => {
  const prefix=text.normalize('NFKC').toUpperCase().split(/[:#&¥.\d]/)[0].replace(/[^A-Z0-9]/g,'');
  if(!prefix||prefix.length>12||/SUB|TOTALS|BALANCE|PAYEE|PAYOR/.test(prefix))return false;
  const distance=(a:string,b:string)=>{let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,prev[j+1]+1,prev[j]+Number(a[i]!==b[j])));prev=next;}return prev[b.length];};
  return ['DATE','CK','CHK','CHECK','TOTAL'].some(label=>distance(prefix,label)<=(prefix.length<4?1:2));
};
/** A field already owns exact pixels. Never run a second paper/ink ROI detector
 * within that field; it can discard the faint first/last glyph as background. */
export async function prepareOwnedPaymentField(input:Buffer,requestedScale?:number):Promise<FaintPreparation>{
  const meta=await sharp(input).metadata(),width=meta.width!,height=meta.height!;
  const scale=Math.max(1,Math.min(3,requestedScale??60/height,Math.sqrt(24000000/(width*height))));
  const color=await sharp(input).flatten({background:'white'}).resize({width:Math.round(width*scale),height:Math.round(height*scale),fit:'fill'}).png().toBuffer();
  const g=await sharp(color).grayscale().raw().toBuffer({resolveWithObject:true}),background=await sharp(color).grayscale().blur(12).raw().toBuffer();
  const gray=Buffer.alloc(g.data.length),binary=Buffer.alloc(g.data.length);
  for(let i=0;i<g.data.length;i++){const ink=background[i]-g.data[i];gray[i]=Math.max(0,Math.min(255,245-ink*5));binary[i]=ink>4?0:255;}
  const raw={width:g.info.width,height:g.info.height,channels:1 as const};
  return {color,gray:await sharp(gray,{raw}).png().toBuffer(),binary:await sharp(binary,{raw}).png().toBuffer(),bounds:{left:0,top:0,width,height},inputWidth:width,inputHeight:height,estimatedCharacterHeight:null,scale};
}
export function paymentHeaderFields(words:Word[],firstInvoiceTop:number,width:number,height:number){
  const before=words.filter(w=>w.bbox.y1<firstInvoiceTop&&w.confidence>=0),out:Array<{left:number;top:number;width:number;height:number}>=[];
  for(const anchor of before.filter(w=>fieldLabel(w.text)&&/[:#&¥.]/.test(w.text)).sort((a,b)=>Number(/[:#&¥]\s*\$?\s*\d/.test(b.text))-Number(/[:#&¥]\s*\$?\s*\d/.test(a.text)))){
    const h=anchor.bbox.y1-anchor.bbox.y0;
    if(!(h>0))continue;
    const rightWords=before.filter(w=>w!==anchor&&w.bbox.x0>=anchor.bbox.x1-2&&w.bbox.x0-anchor.bbox.x1<h*18&&Math.abs((w.bbox.y0+w.bbox.y1-anchor.bbox.y0-anchor.bbox.y1)/2)<h*.7).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const stop=rightWords.find(w=>fieldLabel(w.text)||/^(?:BANK|ROUTING|ACCOUNT)\s*:/i.test(w.text));
    const values=/[:#&¥]\s*\$?\s*\d/.test(anchor.text)?[]:rightWords.filter(w=>(!stop||w.bbox.x0<stop.bbox.x0)&&/^[\d$.,/\s*:+%-]+$/.test(w.text));
    const pieces=[anchor,...values],left=Math.max(0,Math.floor(anchor.bbox.x0-h*.25)),top=Math.max(0,Math.floor(Math.min(...pieces.map(w=>w.bbox.y0))-h*.25));
    const right=Math.min(width,Math.ceil(Math.max(...pieces.map(w=>w.bbox.x1))+h*.25)),bottom=Math.min(height,Math.ceil(Math.max(...pieces.map(w=>w.bbox.y1))+h*.25));
    const bounds={left,top,width:right-left,height:bottom-top};
    if(bounds.width>0&&bounds.height>0&&!out.some(b=>Math.abs(b.left-left)<h&&Math.abs(b.top-top)<h))out.push(bounds);
  }
  return out;
}
/** Oversized word boxes may include a neighboring paper crease/rule. Retain the
 * original box and independently observed glyph-band alternatives, never a fixed
 * photograph coordinate or a repaired numeric value. */
export async function paymentHeaderPixelFields(image:Buffer,words:Word[],firstInvoiceTop:number,width:number,height:number){
  const fields=paymentHeaderFields(words,firstInvoiceTop,width,height),pixels=await textComponents(image,3200,{minimumContrast:10}),out=[...fields];
  for(const bounds of fields){
    const components=pixels.components.map(c=>({left:c.left*pixels.scaleX,top:c.top*pixels.scaleY,width:c.width*pixels.scaleX,height:c.height*pixels.scaleY})).filter(c=>c.left>=bounds.left&&c.left+c.width<=bounds.left+bounds.width&&c.top>=bounds.top&&c.top+c.height<=bounds.top+bounds.height);
    const glyphHeight=median(components.map(c=>c.height));if(!glyphHeight)continue;
    const lines:Array<typeof components>=[];
    for(const c of components.filter(c=>c.height>=glyphHeight*.55&&c.height<=glyphHeight*1.8).sort((a,b)=>a.top+a.height/2-b.top-b.height/2)){
      const line=lines.find(l=>Math.abs(median(l.map(c=>c.top+c.height/2))-c.top-c.height/2)<glyphHeight*.6);if(line)line.push(c);else lines.push([c]);
    }
    for(const line of lines.filter(l=>l.length>=3)){
      const top=Math.max(bounds.top,Math.floor(Math.min(...line.map(c=>c.top))-glyphHeight*.2)),bottom=Math.min(bounds.top+bounds.height,Math.ceil(Math.max(...line.map(c=>c.top+c.height))+glyphHeight*.2));
      if(bottom-top<bounds.height*.9&&bottom>top)out.push({...bounds,top,height:bottom-top});
    }
  }
  return out.slice(0,20);
}
export function propertyRowRegions(words:Word[],rows:Array<{y?:number;height?:number}>,width:number,height:number){
  const pairs=words.filter(w=>/^property$/i.test(w.text)).flatMap(property=>{
    const h=property.bbox.y1-property.bbox.y0;
    const account=words.filter(w=>/^account$/i.test(w.text)&&w.bbox.x0>property.bbox.x1&&Math.abs(w.bbox.y0-property.bbox.y0)<h*1.5).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];
    return account?[{property,account,h}]:[];
  });
  const pair=pairs[0];if(!pair)return [];
  return rows.flatMap((row,index)=>{
    if(row.y==null||row.height==null)return [];
    const left=Math.max(0,Math.floor(pair.property.bbox.x0-pair.h*.4)),right=Math.min(width,Math.ceil(pair.account.bbox.x0-pair.h*.25));
    const top=Math.max(pair.property.bbox.y1,Math.floor(row.y-row.height*.6)),bottom=Math.min(height,Math.ceil(row.y+row.height*.6));
    return right>left&&bottom>top?[{index,bounds:{left,top,width:right-left,height:bottom-top}}]:[];
  });
}
export function paymentHeaderLine(words: Word[], firstInvoiceTop: number, width: number, height: number) {
  const anchors = words.filter(w => w.bbox.y1 < firstInvoiceTop && /[:#&¥]/.test(w.text) && fieldLabel(w.text));
  if (anchors.length < 2) return null;
  const h=median(anchors.map(w=>w.bbox.y1-w.bbox.y0)), cx=median(anchors.map(w=>(w.bbox.x0+w.bbox.x1)/2)),cy=median(anchors.map(w=>(w.bbox.y0+w.bbox.y1)/2));
  if (!(h>0)) return null;
  const xx=anchors.reduce((sum,w)=>sum+((w.bbox.x0+w.bbox.x1)/2-cx)**2,0);
  const slope=xx?anchors.reduce((sum,w)=>sum+((w.bbox.x0+w.bbox.x1)/2-cx)*((w.bbox.y0+w.bbox.y1)/2-cy),0)/xx:0;
  const intercept=median(anchors.map(w=>(w.bbox.y0+w.bbox.y1)/2-slope*(w.bbox.x0+w.bbox.x1)/2));
  const line=words.filter(w=>w.bbox.y1<firstInvoiceTop&&Math.abs((w.bbox.y0+w.bbox.y1)/2-slope*(w.bbox.x0+w.bbox.x1)/2-intercept)<h*.65&&w.confidence>=20);
  const bank=line.filter(w=>/^(?:BANK|ROUTING|ACCOUNT|MICR)\s*:/i.test(w.text)).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];
  const fields=line.filter(w=>!bank||w.bbox.x1<bank.bbox.x0);
  if (!fields.length) return null;
  const left=Math.max(0,Math.floor(Math.min(...fields.map(w=>w.bbox.x0))-h)),top=Math.max(0,Math.floor(Math.min(...fields.map(w=>w.bbox.y0))-h*.2));
  const right=Math.min(width,Math.ceil(Math.max(...fields.map(w=>w.bbox.x1))+h)),bottom=Math.min(height,Math.ceil(Math.max(...fields.map(w=>w.bbox.y1))+h*.2));
  return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}

/** A labelled date/check/total line is not a routing band because it has many digits. */
export function withoutMicrBandText(text: string) {
  return text.split(/\r?\n/).map(line=>/\b(?:DATE|TOTAL|CHECK|CK|CHK)\s*[:#]/i.test(line)?line.replace(/\b(?:BANK|ROUTING|ACCOUNT|MICR)\s*[:#].*$/i,'').trim():line).filter(line=>{
    if (/\b(?:DATE|TOTAL|CHECK|CK|CHK)\s*[:#]/i.test(line)) return true;
    const compact=line.replace(/\s/g,'');
    return !((compact.match(/\d/g)??[]).length>=9&&(/[⑆⑈⑉]|routing|account|micr/i.test(line)||compact.length>=12));
  }).join('\n');
}
