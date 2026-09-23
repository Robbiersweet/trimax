import sharp from 'sharp';
import { probeLegacyDirection } from './ocrLegacyDirection.ts';

/** Use independent bounded legacy direction candidates, before detailed legacy OCR.
 * The probe is disposable; the authoritative pixels are only losslessly rotated. */
export async function orientLegacyStill(input: Buffer) {
  const start = Date.now();
  const metadata = await sharp(input).metadata();
  const normalized = await sharp(input).rotate().flatten({ background: 'white' }).png().toBuffer();
  const normalizationMs=Date.now()-start;
  const direction = await probeLegacyDirection(normalized);
  if (!direction.certain || direction.rotation === null) throw Object.assign(new Error('Document orientation remains uncertain; review the saved photo.'), {
    ocrStarted: direction.observations.some(o => o.recognitionStarted), stage: 'orientation-probe',
    diagnostics: { orientation: direction, orientationProbeStarted: true, detailedOcrStarted: false, passTimings: [] },
  });
  const rotationStart=performance.now();
  const image = direction.rotation ? await sharp(normalized).rotate(direction.rotation).png().toBuffer() : normalized;
  const rotationApplicationMs=performance.now()-rotationStart;
  return { image, evidence: { ...direction, rotation: direction.rotation, exifOrientation: metadata.orientation ?? null,
    normalizationMs, rotationApplicationMs, probeDurationMs: direction.durationMs, durationMs: Date.now() - start, source: 'shared-text-band-direction', preservesFullResolution: true } };
}
