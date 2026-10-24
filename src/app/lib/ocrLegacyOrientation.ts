import sharp from 'sharp';
import { probeLegacyDirection } from './ocrLegacyDirection.ts';
import {selectDocumentDirection,type DirectionWorker} from './ocrDocumentDirection.ts';
import {prepareFaintRegions} from './ocrFaint.ts';

/** Use independent bounded legacy direction candidates, before detailed legacy OCR.
 * The probe is disposable; the authoritative pixels are only losslessly rotated. */
export async function orientLegacyStill(input: Buffer, factory?:()=>Promise<DirectionWorker>) {
  const start = Date.now();
  const metadata = await sharp(input).metadata();
  const normalized = await sharp(input).rotate().flatten({ background: 'white' }).png().toBuffer();
  const normalizationMs=Date.now()-start;
  const bandDirection = await probeLegacyDirection(normalized,factory);
  // A small montage can lose faint labels at a band edge. An uncertain montage
  // is not evidence that the full saved photograph is unreadable. Compare all
  // four bounded page previews before returning an actionable orientation error.
  const direction = bandDirection.certain ? bandDirection : await selectDocumentDirection((await prepareFaintRegions(normalized)).gray,{sampling:'page-preview',requireAll:true,requireStructuredAnchors:true},factory);
  if (!direction.certain || direction.rotation === null) throw Object.assign(new Error('Document orientation remains uncertain; review the saved photo.'), {
    ocrStarted: direction.observations.some(o => o.recognitionStarted), stage: 'orientation-probe',
    diagnostics: { orientation: direction, orientationProbeStarted: true, detailedOcrStarted: false, passTimings: [] },
  });
  const rotationStart=performance.now();
  const image = direction.rotation ? await sharp(normalized).rotate(direction.rotation).png().toBuffer() : normalized;
  const rotationApplicationMs=performance.now()-rotationStart;
  return { image, evidence: { ...direction, rotation: direction.rotation, exifOrientation: metadata.orientation ?? null,
    normalizationMs, rotationApplicationMs, probeDurationMs: bandDirection.durationMs+(bandDirection===direction?0:direction.durationMs), bandDirection,
    durationMs: Date.now() - start, source: bandDirection===direction?'shared-text-band-direction':'bounded-full-page-direction-recovery', preservesFullResolution: true } };
}
