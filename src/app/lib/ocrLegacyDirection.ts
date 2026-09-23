import { selectDocumentDirection, type DirectionWorker } from './ocrDocumentDirection.ts';

export function probeLegacyDirection(image:Buffer,factory?:()=>Promise<DirectionWorker>){
  return selectDocumentDirection(image,{sampling:'text-bands'},factory);
}
