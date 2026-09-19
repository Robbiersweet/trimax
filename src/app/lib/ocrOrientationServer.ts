import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";
import { opticalScore } from "./ocrOptical.ts";
export async function probeOrientation(input: Buffer) {
  const started = Date.now(),
    metadata = await sharp(input).metadata();
  // autoOrient consumes original EXIF once; browser-normalized JPEG has no EXIF.
  const normalized = await sharp(input)
    .rotate()
    .flatten({ background: "#fff" })
    .png()
    .toBuffer();
  const cachePath=join(tmpdir(),"trimax-optical-tesseract");await mkdir(cachePath,{recursive:true});
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    cachePath,
    gzip: true,
    logger: () => undefined,
  });
  const passes: Array<{
    rotation: number;
    durationMs: number;
    text: string;
    score: ReturnType<typeof opticalScore>;
  }> = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });
    for (const rotation of [0, 90, 180, 270]) {
      if (Date.now() - started > 16000) break;
      const begin = Date.now();
      const image = await sharp(normalized)
        .rotate(rotation)
        .resize({
          width: 1500,
          height: 1500,
          fit: "inside",
          withoutEnlargement: true,
        })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
      const result = await Promise.race([
        worker.recognize(image),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(Error("Orientation probe time budget exceeded")),
            4000,
          );
        }),
      ]).finally(() => clearTimeout(timeout));
      passes.push({
        rotation,
        durationMs: Date.now() - begin,
        text: result.data.text,
        score: opticalScore(result.data.text, result.data.confidence),
      });
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }
  const ranked = passes
    .filter((p) => p.score.credible)
    .sort((a, b) => b.score.score - a.score.score);
  // Do not infer an angle from noise or from a partially completed four-angle comparison.
  const selected = passes.length === 4 ? ranked[0] : undefined;
  const ambiguous =
    selected && ranked[1] && ranked[1].score.score >= selected.score.score - 5;
  const angle = selected && !ambiguous ? selected.rotation : null;
  const image = await sharp(normalized)
    .rotate(angle ?? 0)
    .jpeg({ quality: 88 })
    .toBuffer();
  const out = await sharp(image).metadata();
  return {
    resolved: angle !== null,
    rotation: angle,
    exifOrientation: metadata.orientation ?? null,
    width: out.width!,
    height: out.height!,
    probeDurationMs: Date.now() - started,
    passes,
    image,
  };
}
