import sharp from 'sharp';
import { selectDocumentDirection } from './ocrDocumentDirection.ts';
export type OrientationObservation = { rotation:number; score:number; credible:boolean; durationMs:number; status:'completed'|'failed'; error?:string };

/** V2 keeps its existing 1800px contrast preview and all-four comparison contract.
 * Only worker orchestration/scoring is shared; detailed v2 recognition is untouched. */
export async function probeDocumentDirection(image:Buffer){
  const dimensions=await sharp(image).metadata();
  if(Math.min(dimensions.width??0,dimensions.height??0)<32)return {rotation:0,certain:false,observations:[] as OrientationObservation[]};
  const result=await selectDocumentDirection(image,{sampling:'page-preview',requireAll:true});
  return {rotation:result.rotation??0,certain:result.certain,observations:result.observations.map(o=>({rotation:o.rotation,score:o.score,credible:o.credible,durationMs:o.durationMs,status:o.status==='completed'?'completed' as const:'failed' as const,...(o.error?{error:o.error}:{})}))};
}
