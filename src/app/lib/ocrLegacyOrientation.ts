import sharp from 'sharp';
import { probeDocumentDirection } from './ocrStillDirection.ts';

/** Use the same bounded direction evidence as shadow, before detailed legacy OCR.
 * The probe is disposable; the authoritative pixels are only losslessly rotated. */
export async function orientLegacyStill(input: Buffer) {
  const start = Date.now();
  const metadata = await sharp(input).metadata();
  const normalized = await sharp(input).rotate().flatten({ background: 'white' }).png().toBuffer();
  const gray = await sharp(normalized).grayscale().raw().toBuffer({ resolveWithObject: true });
  const background = await sharp(normalized).grayscale().blur(24).raw().toBuffer();
  const contrast = Buffer.alloc(gray.data.length);
  for (let i = 0; i < contrast.length; i++) contrast[i] = Math.max(0, Math.min(255, 240 + (gray.data[i] - background[i]) * 3));
  const probe = await sharp(contrast, { raw: { width: gray.info.width, height: gray.info.height, channels: 1 } }).png().toBuffer();
  const direction = await probeDocumentDirection(probe);
  const image = direction.rotation ? await sharp(normalized).rotate(direction.rotation).png().toBuffer() : normalized;
  return { image, evidence: { ...direction, exifOrientation: metadata.orientation ?? null,
    durationMs: Date.now() - start, source: 'bounded-same-still-direction', preservesFullResolution: true } };
}
