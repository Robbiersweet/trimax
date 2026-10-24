import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker,OEM,PSM} from 'tesseract.js';
import {ocrRuntimeCache} from '../ocrRuntimeCache.ts';
import {paymentHeaderPixelFields} from './paymentHeaderLine.ts';
import {detectDocumentGeometry} from './documentGeometry.ts';
import {normalizeVisualMoney} from './visualMoney.ts';
type Bounds={left:number;top:number;width:number;height:number};
type Word={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
export type MaturePaymentCrop={rowId:string;bounds:Bounds;bytes:Buffer;sha256:string;sourceHash:string;scale:number;border:number;localization:string;firstBodyTop:number};
export type MaturePaymentObservation={id:string;fieldId:string;documentId:string;sourceHash:string;cropHash:string;recognizer:string;raw:string;confidence:null;confidenceCalibrated:false};
/** Proposal only: fuzzy captions locate pixels; they never normalize recognizer answers. */
export function paymentCaptionHint(raw:string):'date'|'total'|'check'|null {
 const caption=raw.trim().replace(/^[\p{P}\p{Z}\s]+/u,'');
 const prefix=caption.match(/^([A-Za-z'’ ]{2,24})(?=[:#$\d]|$)/)?.[1].toUpperCase().replace(/[^A-Z]/g,'');
 if(!prefix||prefix.length>7)return null;
 const distance=(a:string,b:string)=>{let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,p[j]+1,p[j-1]+Number(a[i-1]!==b[j-1]));p=n;}return p[b.length];};
 const labels=[['DATE','date'],['TOTAL','total'],['CK','check'],['CHK','check'],['CHECK','check']] as const;
 const near=labels.map(([caption,kind])=>({kind,distance:distance(prefix,caption)})),best=Math.min(...near.map(c=>c.distance));
 const kinds=[...new Set(near.filter(c=>c.distance===best&&best<=1).map(c=>c.kind))];return kinds.length===1?kinds[0]:null;
}
export function hasMultiplePaymentCaptions(raw:string){
 const captions=[...raw.matchAll(/\b([A-Za-z'’]{2,12})(?=\s*[#:.]|\s*\d)/g)].flatMap(m=>{const hint=paymentCaptionHint(m[1]);return hint?[hint]:[];});
 return new Set(captions).size>1;
}
/** Nested crops of one physical field share one batch slot, including equal
 * widths with different vertical padding. Distinct physical fields remain. */
export function deduplicatePaymentFieldRegions<T extends {bounds:Bounds;hint:string|null}>(fields:T[]){
 return fields.filter((a,index)=>!fields.some((b,other)=>other!==index&&!!b.hint&&(b.hint===a.hint||!a.hint)&&b.bounds.left<=a.bounds.left&&b.bounds.top<=a.bounds.top&&b.bounds.left+b.bounds.width>=a.bounds.left+a.bounds.width&&b.bounds.top+b.bounds.height>=a.bounds.top+a.bounds.height&&(b.bounds.width*b.bounds.height>a.bounds.width*a.bounds.height||b.bounds.width*b.bounds.height===a.bounds.width*a.bounds.height&&other<index)));
}

const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const models=['svtrv2','parseq','ppocrv5'];
const label=(raw:string)=>{const s=raw.trim().toUpperCase().replace(/[#:.$\s]+$/g,'');return /^(?:(?:CHECK|PAYMENT)\s+)?DATE$/.test(s)?'checkDate':/^(?:CK|CHK|CHECK)(?:\s+(?:NO|NUMBER))?$/.test(s)?'checkNumber':/^(?:(?:CHECK|GRAND)\s+)?TOTAL$/.test(s)?'documentTotal':null;};
/** Formatting only: complete numeric strings retain every digit/year. Caption
 * type comes from independent exact recognition on these same physical pixels. */
export function maturePaymentValue(raw:string,field:'checkDate'|'checkNumber'|'documentTotal'){
 const match=raw.trim().match(/^([A-Za-z ]{1,24})\s*[#:.]{0,5}\s*(\$?[0-9](?:[0-9,./\s-]*[0-9])?)\s*\**$/);
 if(!match||field!=='documentTotal'&&/\*\s*$/.test(raw))return null;const value=match[2].replace(/\s/g,'');
 if(field==='checkNumber')return /^\d{1,12}$/.test(value)?value:null;
 if(field==='documentTotal'){const cents=normalizeVisualMoney(value);return cents===null?null:String(cents);}
 const date=value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(!date)return null;
 const month=Number(date[1]),day=Number(date[2]),year=Number(date[3]),d=new Date(Date.UTC(year,month-1,day));
 return year>=1900&&year<=2100&&d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
export function fuseMaturePaymentFields(crops:MaturePaymentCrop[],observations:MaturePaymentObservation[],documentId:string,sourceHash:string){
 if(crops.length>6||crops.some(c=>c.sourceHash!==sourceHash||!/^[a-f0-9]{64}$/.test(c.sha256)||hash(c.bytes)!==c.sha256||!Object.values(c.bounds).every(Number.isFinite)||c.bounds.top<0||c.bounds.left<0||c.bounds.width<=0||c.bounds.height<=0||c.bounds.top+c.bounds.height>c.firstBodyTop))throw Error('Invalid payment header field ownership');
 if(observations.some(o=>!models.includes(o.recognizer)||o.documentId!==documentId||o.sourceHash!==sourceHash||!crops.some(c=>c.rowId===o.fieldId&&c.sha256===o.cropHash&&c.sourceHash===sourceHash)))throw Error('Payment metadata does not belong to canonical owned field pixels');
 return crops.map(crop=>{
  const own=observations.filter(o=>o.fieldId===crop.rowId),types=[...new Set(own.map(o=>label(o.raw.split(/\d/)[0])).filter((v):v is 'checkDate'|'checkNumber'|'documentTotal'=>v!==null))];
  const field=types.length===1?types[0]:null,complete=models.every(m=>own.some(o=>o.recognizer===m));
  const values=own.map(o=>({...o,value:field?maturePaymentValue(o.raw,field):null}));
  const selfConflict=models.some(m=>new Set(values.filter(o=>o.recognizer===m).map(o=>o.value)).size>1);
  const candidates=[...new Set(values.flatMap(o=>o.value===null?[]:[o.value]))].map(value=>({value,recognizers:[...new Set(values.filter(o=>o.value===value).map(o=>o.recognizer))],provenance:values.filter(o=>o.value===value).map(o=>o.id)}));
  const supported=candidates.filter(c=>c.recognizers.length>=2),value=field&&complete&&!selfConflict&&supported.length===1?supported[0].value:null;
  return {fieldId:crop.rowId,field,value,sourceHash,cropHash:crop.sha256,bounds:crop.bounds,complete,candidates,observations:values,provenance:value===null?[]:supported[0].provenance,exactLabelProvenance:own.filter(o=>label(o.raw.split(/\d/)[0])===field).map(o=>o.id),reason:types.length>1?'Competing exact field captions':!field?'No exact independently recognized payment caption':!complete?'Incomplete mature model set':selfConflict?'Conflicting same-model repeat':value===null?'No two-model agreement on this prepared field':'Two distinct mature models agree on this exact caption-owned field; uncalibrated scores are not probabilities'};
 });
}
/** Cheap optical localization precedes one existing model batch. At most six
 * same-source fields are added; no scale variants count as separate models. */
export async function prepareMaturePaymentFields(image:Buffer,words:Word[],firstBodyTop:number,maxFields=6):Promise<MaturePaymentCrop[]>{
 if(!Number.isFinite(firstBodyTop))return [];
 const m=await sharp(image).metadata(),sourceHash=hash(image),regions=(await paymentHeaderPixelFields(image,words,firstBodyTop,m.width!,m.height!)).slice(0,40);
 if(!regions.length)return [];
 // Baseline grouping may split a faint final year from its caption/value. Join
 // only physically adjacent glyph clusters; never reconstruct missing text.
 const geometry=await detectDocumentGeometry(image),slope=geometry.reliable?Math.tan(geometry.angle*Math.PI/180):0,baseline=(b:Bounds)=>b.top+b.height/2-slope*(b.left+b.width/2);
 const originalRegions=[...regions];
 for(const a of originalRegions){let joined={...a};for(const b of originalRegions.filter(b=>b.left>a.left).sort((a,b)=>a.left-b.left)){
  const gap=b.left-joined.left-joined.width,h=Math.min(joined.height,b.height);if(gap<0)continue;if(gap>h*.4)break;if(Math.abs(baseline(joined)-baseline(b))>h*.45)continue;
  const top=Math.min(joined.top,b.top),bottom=Math.max(joined.top+joined.height,b.top+b.height);joined={left:joined.left,top,width:b.left+b.width-joined.left,height:bottom-top};
 }if(joined.width>a.width&&!regions.some(b=>JSON.stringify(b)===JSON.stringify(joined)))regions.push(joined);}
 const worker=await createWorker('eng',OEM.LSTM_ONLY,{cachePath:ocrRuntimeCache(),logger:()=>undefined});
 const reads:Array<{bounds:Bounds;raw:string;hint:string|null}>=[];
 const hint=paymentCaptionHint;
 try{await worker.setParameters({tessedit_pageseg_mode:PSM.RAW_LINE,user_defined_dpi:'300'});for(const bounds of regions){const {data}=await worker.recognize(await sharp(image).extract(bounds).png().toBuffer());reads.push({bounds,raw:data.text,hint:hint(data.text)});}}finally{await worker.terminate();}
 const eligible=reads.filter(r=>!hasMultiplePaymentCaptions(r.raw)),hinted=eligible.filter(r=>r.hint),selected=new Set(hinted);
 for(const a of hinted)for(const b of hinted){if(a.hint===b.hint||Math.abs(baseline(a.bounds)-baseline(b.bounds))>Math.min(a.bounds.height,b.bounds.height)*.6)continue;
  const left=Math.min(a.bounds.left,b.bounds.left),right=Math.max(a.bounds.left+a.bounds.width,b.bounds.left+b.bounds.width),center=(baseline(a.bounds)+baseline(b.bounds))/2,h=Math.min(a.bounds.height,b.bounds.height);
  for(const r of eligible)if(r.bounds.left>=left&&r.bounds.left+r.bounds.width<=right&&Math.abs(baseline(r.bounds)-center)<h*.6)selected.add(r);
 }
 const candidates=deduplicatePaymentFieldRegions([...selected]).sort((a,b)=>Number(!!b.hint)-Number(!!a.hint)||a.bounds.left-b.bounds.left).slice(0,Math.min(6,Math.max(0,maxFields))),out:MaturePaymentCrop[]=[];
 for(const r of candidates){const scale=Math.min(2,Math.sqrt(24000000/(r.bounds.width*r.bounds.height))),border=12;const bytes=await sharp(image).extract(r.bounds).resize({width:Math.round(r.bounds.width*scale),height:Math.round(r.bounds.height*scale),fit:'fill'}).extend({top:border,bottom:border,left:border,right:border,background:'white'}).png().toBuffer();out.push({rowId:'payment-field-'+out.length,bounds:r.bounds,bytes,sha256:hash(bytes),sourceHash,scale,border,firstBodyTop,localization:'Physical payment-header glyph band and observed caption baseline; cheap OCR supplies location only'});}
 return out;
}

export function mergeMaturePaymentField(existing:string|null,conflict:boolean,strongOpticalValues:string[],fields:ReturnType<typeof fuseMaturePaymentFields>,field:'checkNumber'|'checkDate'){
 const values=[...new Set(fields.filter(f=>f.field===field&&f.value!==null).map(f=>f.value!))];
 const inconsistent=conflict||values.length>1||values.length===1&&(strongOpticalValues.some(v=>v!==values[0])||!!existing&&existing!==values[0]);
 return {value:inconsistent?null:values[0]??existing,conflict:!!inconsistent};
}

export type CorrelatedMetadataObservation={sourceHash:string;field:string|null;value:string|null;confidence:number;bounds:Bounds;raw:string};
/** Three model families must unanimously read one date on each separately
 * prepared view. Views are provenance checks, never extra model votes. */
export function unanimousDateAuthority(fields:ReturnType<typeof fuseMaturePaymentFields>,expectedSources:string[],optical:CorrelatedMetadataObservation[]){
 const sources=[...new Set(expectedSources)],dates=fields.filter(f=>f.field==='checkDate');
 const overlap=(a:Bounds,b:Bounds)=>Math.max(0,Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top));
 const sameOwner=(a:Bounds,b:Bounds)=>overlap(a,b)>=Math.min(a.width*a.height,b.width*b.height)*.5;
 const reject=(reason:string)=>({value:null as string|null,reason,retainedCorrelatedAlternatives:[] as CorrelatedMetadataObservation[]});
 if(sources.length!==2||sources.some(source=>!/^[a-f0-9]{64}$/.test(source)||!dates.some(f=>f.sourceHash===source))||dates.some(f=>!sources.includes(f.sourceHash)))return reject('Incomplete separately prepared date views');
 const values=[...new Set(dates.map(f=>f.value))];if(values.length!==1||!values[0])return reject('Conflicting or incomplete mature date fields');
 const value=values[0];
 for(const field of dates){
  if(!field.complete||!models.every(model=>field.observations.some(o=>o.recognizer===model))||field.observations.some(o=>!models.includes(o.recognizer)||o.sourceHash!==field.sourceHash||o.cropHash!==field.cropHash||o.value!==value)||new Set(field.observations.filter(o=>field.exactLabelProvenance.includes(o.id)).map(o=>o.recognizer)).size<2)return reject('Date models are not unanimously complete with exact captions');
 }
 for(const source of sources){const own=dates.filter(f=>f.sourceHash===source);if(own.some(a=>own.some(b=>!sameOwner(a.bounds,b.bounds))))return reject('Multiple separately owned physical date fields');}
 const strong=optical.filter(o=>o.field==='checkDate'&&o.value&&o.confidence>=70);
 if(strong.some(o=>!sources.includes(o.sourceHash)||!dates.some(f=>f.sourceHash===o.sourceHash&&sameOwner(f.bounds,o.bounds))))return reject('Independent optical date owner cannot be superseded');
 return {value,reason:'Unanimous complete independent models on both source-owned views; correlated recognizer alternatives retained',retainedCorrelatedAlternatives:strong.filter(o=>o.value!==value)};
}
