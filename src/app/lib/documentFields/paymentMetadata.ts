import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker,OEM,PSM} from 'tesseract.js';
import {ocrRuntimeCache} from '../ocrRuntimeCache.ts';
import {paymentHeaderPixelFields,paymentHeaderFields,prepareOwnedPaymentField} from './paymentHeaderLine.ts';
type Word={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
/** Exact formatting only: OCR characters and missing years/digits are never repaired. */
export function normalizedPaymentMetadata(text:string):{field:'checkNumber'|'checkDate';value:string}|null{
  const check=text.trim().match(/^(?:CK|CHK|CHECK)(?:\s*(?:NO\.?|NUMBER))?\s*[^A-Za-z0-9\s]{1,5}\s*(\d{1,12})$/i);
  if(check)return {field:'checkNumber',value:check[1]};
  const date=text.trim().match(/^(?:(?:CHECK|PAYMENT)\s+)?DATE\s*[:#]\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/i);
  if(!date)return null;
  const month=Number(date[1]),day=Number(date[2]),year=Number(date[3]),d=new Date(Date.UTC(year,month-1,day));
  return year>=1900&&year<=2100&&d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?{field:'checkDate',value:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}:null;
}
type Observation={id:string;sourceHash:string;cropHash:string;bounds:{left:number;top:number;width:number;height:number};variant:string;raw:string;confidence:number;field:'checkNumber'|'checkDate'|null;value:string|null};
export function paymentMetadataConsensus(observations:Observation[]){
  const conflicting=(field:'checkNumber'|'checkDate')=>new Set(observations.filter(o=>o.field===field&&o.confidence>=70&&o.value).map(o=>o.value)).size>1;
  const select=(field:'checkNumber'|'checkDate')=>{
    const strong=observations.filter(o=>o.field===field&&o.confidence>=70&&o.value),values=[...new Set(strong.map(o=>o.value!))];
    return values.length===1&&new Set(strong.map(o=>o.cropHash)).size>=2?values[0]:null;
  };
  return {checkNumber:select('checkNumber'),checkDate:select('checkDate'),conflicts:{checkNumber:conflicting('checkNumber'),checkDate:conflicting('checkDate')}};
}
/** Adjacent caption/value crops are independent measured source observations.
 * A skewed line can be clear in its cells while a rectangular joined crop also
 * includes the next printed line. Preserve exact digits and every strong rival. */
export function splitPaymentMetadataObservations(observations:Observation[]):Observation[]{
  const out:Observation[]=[];
  const captions=observations.filter(o=>o.confidence>=70&&/^(?:DATE|CK|CHK|CHECK)\s*[:#]?$/i.test(o.raw.trim()));
  for(const caption of captions){
    if(new Set(captions.filter(o=>o.sourceHash===caption.sourceHash&&JSON.stringify(o.bounds)===JSON.stringify(caption.bounds)&&o.raw.trim().replace(/[:#\s]/g,'').toUpperCase()===caption.raw.trim().replace(/[:#\s]/g,'').toUpperCase()).map(o=>o.cropHash)).size<2)continue;
    const field=/^DATE/i.test(caption.raw.trim())?'checkDate':'checkNumber',h=caption.bounds.height;
    const candidates=observations.filter(o=>o.sourceHash===caption.sourceHash&&o.confidence>=70&&o.bounds.left>=caption.bounds.left+caption.bounds.width-h*.15&&o.bounds.left-caption.bounds.left-caption.bounds.width<h*4&&Math.abs(o.bounds.top+o.bounds.height/2-caption.bounds.top-h/2)<h*.6);
    for(const value of candidates){
      const token=value.raw.trim();if(!(field==='checkDate'?/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/:/^\d{1,12}$/).test(token))continue;
      const raw=(field==='checkDate'?'DATE:':'CK#:')+token,normalized=normalizedPaymentMetadata(raw);if(!normalized)continue;
      const right=Math.max(caption.bounds.left+caption.bounds.width,value.bounds.left+value.bounds.width),bottom=Math.max(caption.bounds.top+h,value.bounds.top+value.bounds.height),top=Math.min(caption.bounds.top,value.bounds.top);
      out.push({id:caption.id+'+'+value.id,sourceHash:caption.sourceHash,cropHash:value.cropHash,bounds:{left:caption.bounds.left,top,width:right-caption.bounds.left,height:bottom-top},variant:'measured-adjacent-caption-value:'+caption.variant+'+'+value.variant,raw,confidence:Math.min(caption.confidence,value.confidence),...normalized});
    }
  }
  return out;
}
type Metadata=ReturnType<typeof paymentMetadataConsensus>;
export function combinePaymentMetadataViews(a:Metadata&{canonicalHash?:string;observations?:Observation[]},b:Metadata&{canonicalHash?:string;observations?:Observation[]}):Metadata{
  let pooled:Metadata|null=null;
  if(a.observations&&b.observations){if(!a.canonicalHash||!/^[a-f0-9]{64}$/.test(a.canonicalHash)||a.canonicalHash!==b.canonicalHash)throw Error('Metadata canonical source binding missing');pooled=paymentMetadataConsensus([...a.observations,...b.observations]);}
  const conflicts={checkNumber:a.conflicts.checkNumber||b.conflicts.checkNumber||!!pooled?.conflicts.checkNumber||!!(a.checkNumber&&b.checkNumber&&a.checkNumber!==b.checkNumber),checkDate:a.conflicts.checkDate||b.conflicts.checkDate||!!pooled?.conflicts.checkDate||!!(a.checkDate&&b.checkDate&&a.checkDate!==b.checkDate)};
  return {checkNumber:conflicts.checkNumber?null:a.checkNumber??b.checkNumber??pooled?.checkNumber??null,checkDate:conflicts.checkDate?null:a.checkDate??b.checkDate??pooled?.checkDate??null,conflicts};
}
export function resolvePaymentMetadataField(metadata:Metadata,field:'checkNumber'|'checkDate',pageValues:string[]){
  if(metadata.conflicts[field])return null;
  const localized=metadata[field],values=[...new Set(pageValues)];
  if(localized&&values.every(v=>v===localized))return localized;
  return values.length===1&&!localized?values[0]:null;
}
/** Source-bound field reread, independent of invoice rows/amount arithmetic. */
export async function recognizeLocalizedPaymentMetadata(image:Buffer,words:Word[],firstBodyTop:number){
  const meta=await sharp(image).metadata(),sourceHash=createHash('sha256').update(image).digest('hex');
  const regions=(await paymentHeaderPixelFields(image,words,firstBodyTop,meta.width!,meta.height!)).slice(0,32),observations:Observation[]=[];
  if(!regions.length)return {sourceHash,observations,...paymentMetadataConsensus(observations)};
  const worker=await createWorker('eng',OEM.LSTM_ONLY,{cachePath:ocrRuntimeCache(),logger:()=>undefined});
  try{
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'',user_defined_dpi:'300'});
    const queue=[...regions];let followed=false;
    for(let index=0;index<queue.length;index++){
      const bounds=queue[index];
      const bytes=await sharp(image).extract(bounds).png().toBuffer(),prepared=await prepareOwnedPaymentField(bytes),scale2=await prepareOwnedPaymentField(bytes,2),scale2Meta=await sharp(scale2.color).metadata(),border=Math.max(8,Math.ceil(scale2Meta.height!*.4));
      const padded2=await sharp(scale2.color).extend({top:border,bottom:border,left:border,right:border,background:'white'}).png().toBuffer();
      for(const [variant,pixels] of Object.entries({native:prepared.color,grayscale:prepared.gray,binary:prepared.binary,'native-2x-max24mp':scale2.color,'native-2x-white-border':padded2,'native-3x-max24mp':(await prepareOwnedPaymentField(bytes,3)).color})){
        const {data}=await worker.recognize(pixels,{}, {text:true,blocks:true});
        const normalized=normalizedPaymentMetadata(data.text);
        observations.push({id:`metadata:${index}:${variant}`,sourceHash,cropHash:createHash('sha256').update(pixels).digest('hex'),bounds,variant,raw:data.text,confidence:data.confidence,field:normalized?.field??null,value:normalized?.value??null});
      }
      if(index===regions.length-1&&!followed){
        followed=true;
        const seed=observations.filter(o=>o.confidence>=70).map(o=>({text:o.raw.trim(),confidence:o.confidence,bbox:{x0:o.bounds.left,y0:o.bounds.top,x1:o.bounds.left+o.bounds.width,y1:o.bounds.top+o.bounds.height}}));
        const followup=paymentHeaderFields(seed,firstBodyTop,meta.width!,meta.height!).filter(b=>!queue.some(q=>JSON.stringify(q)===JSON.stringify(b))).slice(0,12);
        queue.push(...followup);
      }
    }
  }finally{await worker.terminate();}
  observations.push(...splitPaymentMetadataObservations(observations));
  return {sourceHash,observations,...paymentMetadataConsensus(observations)};
}
