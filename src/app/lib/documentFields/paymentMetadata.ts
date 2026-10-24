import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker,OEM,PSM} from 'tesseract.js';
import {ocrRuntimeCache} from '../ocrRuntimeCache.ts';
import {paymentHeaderPixelFields,prepareOwnedPaymentField} from './paymentHeaderLine.ts';
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
  const regions=(await paymentHeaderPixelFields(image,words,firstBodyTop,meta.width!,meta.height!)).slice(0,20),observations:Observation[]=[];
  if(!regions.length)return {sourceHash,observations,...paymentMetadataConsensus(observations)};
  const worker=await createWorker('eng',OEM.LSTM_ONLY,{cachePath:ocrRuntimeCache(),logger:()=>undefined});
  try{
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'',user_defined_dpi:'300'});
    for(const [index,bounds] of regions.entries()){
      const bytes=await sharp(image).extract(bounds).png().toBuffer(),prepared=await prepareOwnedPaymentField(bytes);
      for(const [variant,pixels] of Object.entries({native:prepared.color,grayscale:prepared.gray,binary:prepared.binary,'native-2x-max24mp':(await prepareOwnedPaymentField(bytes,2)).color,'native-3x-max24mp':(await prepareOwnedPaymentField(bytes,3)).color})){
        const {data}=await worker.recognize(pixels,{}, {text:true,blocks:true});
        const normalized=normalizedPaymentMetadata(data.text);
        observations.push({id:`metadata:${index}:${variant}`,sourceHash,cropHash:createHash('sha256').update(pixels).digest('hex'),bounds,variant,raw:data.text,confidence:data.confidence,field:normalized?.field??null,value:normalized?.value??null});
      }
    }
  }finally{await worker.terminate();}
  return {sourceHash,observations,...paymentMetadataConsensus(observations)};
}
