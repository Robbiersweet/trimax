import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createWorker,OEM,PSM} from 'tesseract.js';
import {ocrRuntimeCache} from '../../ocrRuntimeCache.ts';
import type {DocumentSemanticModel,SemanticObservation,SemanticWord} from './model.ts';
import type {Bounds} from '../types.ts';
import {recognizeLabel} from './labels.ts';
import {EvidenceLedger} from '../recognition/evidenceLedger.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const exact=(s:string)=>/^(?:PROPERTY|CUSTOMER|CLIENT|PAYOR|PAYER|ORGANIZATION)$/.test(s.trim().toUpperCase());
/** A physically measured leading column without its caption is not identity.
 * Only its heading pixels are reread; no body/property values enter this step. */
export function missingLeadingCaptionRegion(model:DocumentSemanticModel,width:number,height:number):Bounds|null {
 if(!model.table.supported||model.table.columns.some(c=>['property_name','customer_name','payor_name'].includes(c.type)))return null;
 const heading=model.table.headerPosition,rows=model.table.rows;
 const cells=rows.flatMap(r=>r.physical?.columnRegions?.['unlabeled-leading']?[r.physical.columnRegions['unlabeled-leading']]:[]);
 const known=model.table.columns.filter(c=>c.semanticConfidence==='label-supported');
 if(!heading||rows.length<3||cells.length<3||!known.length)return null;
 const left=Math.floor(Math.min(...cells.map(c=>c.left))),right=Math.floor(Math.min(...known.map(c=>c.bounds.left))),firstBody=Math.min(...rows.map(r=>r.bounds.top));
 const top=Math.max(0,Math.floor(heading.top-heading.height*.6)),bottom=Math.min(height,firstBody,Math.ceil(heading.top+heading.height*1.6));
 if(![left,right,top,bottom,width,height].every(Number.isFinite)||left<0||right>width||right-left<heading.height||bottom<=top||bottom>firstBody)return null;
 return {left,top,width:right-left,height:bottom-top};
}
export function acceptedCaptionWords(reads:Array<{variant:string;words:SemanticWord[]}>,region:Bounds):SemanticWord[] {
 if(reads.length!==2||new Set(reads.map(r=>r.variant)).size!==2)return [];
 if(reads.some(r=>r.words.some(w=>w.confidence>=70&&recognizeLabel(w.text)&&!exact(w.text))))return [];
 const candidates=reads.map(r=>r.words.filter(w=>w.confidence>=70&&exact(w.text)&&Object.values(w.bounds).every(Number.isFinite)&&w.bounds.width>0&&w.bounds.height>0&&w.bounds.left>=region.left&&w.bounds.top>=region.top&&w.bounds.left+w.bounds.width<=region.left+region.width&&w.bounds.top+w.bounds.height<=region.top+region.height));
 if(candidates.some(c=>c.length!==1)||candidates[0][0].text.trim().toUpperCase()!==candidates[1][0].text.trim().toUpperCase())return [];
 const [a,b]=candidates.map(c=>c[0]);
 if(Math.abs(a.bounds.left-b.bounds.left)>Math.max(a.bounds.height,b.bounds.height)||Math.abs(a.bounds.top-b.bounds.top)>Math.max(a.bounds.height,b.bounds.height)*.5)return [];
 return [a,b];
}
export async function recoverLeadingCaption(image:Buffer,model:DocumentSemanticModel,ledger:EvidenceLedger):Promise<SemanticObservation[]> {
 const sourceHash=hash(image),m=await sharp(image).metadata();if(sourceHash!==ledger.sourceHash||model.sourceHash!==sourceHash)throw Error('Caption source mismatch');
 const region=missingLeadingCaptionRegion(model,m.width!,m.height!);if(!region)return [];
 const worker=await createWorker('eng',OEM.LSTM_ONLY,{cachePath:ocrRuntimeCache(),logger:()=>undefined});
 const reads:Array<{variant:string;words:SemanticWord[];bytes:Buffer;raw:string;confidence:number}>=[];
 try {await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'',user_defined_dpi:'300'});
  for(const variant of ['native','grayscale']){let s=sharp(image).extract(region).resize({width:region.width*2,height:region.height*2,fit:'fill'});if(variant==='grayscale')s=s.grayscale();const bytes=await s.png().toBuffer();const {data}=await worker.recognize(bytes,{}, {text:true,blocks:true});
   reads.push({variant,bytes,raw:data.text,confidence:data.confidence,words:(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).map(w=>({text:w.text,confidence:w.confidence,bounds:{left:region.left+w.bbox.x0/2,top:region.top+w.bbox.y0/2,width:(w.bbox.x1-w.bbox.x0)/2,height:(w.bbox.y1-w.bbox.y0)/2}}))});
  }
 }finally{await worker.terminate();}
 const words=acceptedCaptionWords(reads,region);if(!words.length)return [];
 return reads.map((r,i)=>{const id=ledger.documentId+':owned-table-caption:'+r.variant,cropHash=hash(r.bytes),sequence=ledger.append({field:'table-caption',documentId:ledger.documentId,sourceHash,cropHash,region,recognizer:'tesseract.js-eng-lstm',variant:r.variant,configuration:'owned-leading-header-psm7-scale2',raw:r.raw,normalized:[words[i].text],confidence:words[i].confidence,provenance:{valid:true,reason:'Two source-owned exact caption rereads; measured leading column and heading bounds; no identity values',reference:id},stage:'phase5e-table-caption',timestamp:new Date().toISOString()});return {id,runKey:ledger.snapshot().entries[sequence].runKey,sourceHash,cropHash,region,recognizer:'tesseract.js-eng-lstm',variant:'owned-caption-'+r.variant,raw:r.raw,confidence:words[i].confidence,verified:true,words:[words[i]]};});
}
