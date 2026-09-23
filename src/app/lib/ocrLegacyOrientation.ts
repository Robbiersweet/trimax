import sharp from 'sharp';
import { probeLegacyDirection } from './ocrLegacyDirection.ts';

/** Use independent bounded legacy direction candidates, before detailed legacy OCR.
 * The probe is disposable; the authoritative pixels are only losslessly rotated. */
export async function orientLegacyStill(input: Buffer) {
  const start = Date.now();
  const metadata = await sharp(input).metadata();
  const normalized = await sharp(input).rotate().flatten({ background: 'white' }).png().toBuffer();
  const gray = await sharp(normalized).grayscale().raw().toBuffer({ resolveWithObject: true });
  // Use the existing faint-text local contrast treatment only for the disposable probe.
  const background = await sharp(normalized).grayscale().blur(18).raw().toBuffer();
  const contrast = Buffer.alloc(gray.data.length);
  for (let i = 0; i < contrast.length; i++) contrast[i] = Math.max(0, Math.min(255, 245 + (gray.data[i] - background[i]) * 9));
  const probe = await sharp(contrast, { raw: { width: gray.info.width, height: gray.info.height, channels: 1 } }).png().toBuffer();
  const direction = await probeLegacyDirection(probe);
  if (!direction.certain || direction.rotation === null) throw Object.assign(new Error('Document orientation remains uncertain; review the saved photo.'), {
    ocrStarted: direction.observations.some(o => o.recognitionStarted), stage: 'orientation-probe',
    diagnostics: { orientation: direction, orientationProbeStarted: true, detailedOcrStarted: false, passTimings: [] },
  });
  const image = direction.rotation ? await sharp(normalized).rotate(direction.rotation).png().toBuffer() : normalized;
  return { image, evidence: { ...direction, rotation: direction.rotation, exifOrientation: metadata.orientation ?? null,
    probeDurationMs: direction.durationMs, durationMs: Date.now() - start, source: 'bounded-same-still-direction', preservesFullResolution: true } };
}
