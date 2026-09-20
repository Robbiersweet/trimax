import { observeOcr } from "./ocrObservationCache.ts";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";
import {
  prepareFaintRegions,
  directionEvidence,
  faintProvenance,
} from "./ocrFaint.ts";
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
  const cachePath = join(tmpdir(), "trimax-optical-tesseract");
  await mkdir(cachePath, { recursive: true });
  const prepared = await prepareFaintRegions(normalized);
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
    direction: ReturnType<typeof directionEvidence>;
    preparation: ReturnType<typeof faintProvenance>;
    variant: string;
  }> = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    for (const rotation of [0, 90, 180, 270]) {
      if (Date.now() - started > 16000) break;
      const begin = Date.now();
      const image = await sharp(prepared.gray)
        .rotate(rotation)
        .png()
        .toBuffer();
      const result = await Promise.race([
        observeOcr(worker, image, "sparse-text"),
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
        direction: directionEvidence(result.data),
        preparation: {
          ...faintProvenance(prepared),
          outputWidth:
            rotation % 180 ? prepared.bounds.height : prepared.bounds.width,
          outputHeight:
            rotation % 180 ? prepared.bounds.width : prepared.bounds.height,
        },
        variant: "local-gray",
      });
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }
  const ranked = passes
    .filter((p) => p.direction.credible)
    .sort((a, b) => b.direction.score - a.direction.score);
  // Do not infer an angle from noise or from a partially completed four-angle comparison.
  const selected = passes.length === 4 ? ranked[0] : undefined;
  const ambiguous =
    selected &&
    ranked[1] &&
    ranked[1].direction.score >= selected.direction.score * 0.9;
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
    optical:
      angle === null
        ? {
            images: [
              {
                label: "Orientation OCR variant",
                mime: "image/png",
                base64: prepared.gray.toString("base64"),
                width: prepared.bounds.width,
                height: prepared.bounds.height,
                exifOrientation: null,
                rotation: 0,
                source: "orientation-probe",
                transformation: JSON.stringify({
                  variant: "local-gray",
                  ...faintProvenance(prepared),
                }),
              },
            ],
            notes: [
              "Orientation unresolved; retained unrotated local-gray recognition region for inspection.",
            ],
          }
        : undefined,
    image,
  };
}
