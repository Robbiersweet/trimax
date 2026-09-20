import { observeOcr } from "./ocrObservationCache.ts";
import sharp from "sharp";
import { opticalScore } from "./ocrOptical.ts";
import type { Worker } from "tesseract.js";
export type OpticalBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type FaintVariant = "native-color" | "local-gray" | "local-binary";
export type FaintPreparation = {
  color: Buffer;
  gray: Buffer;
  binary: Buffer;
  bounds: OpticalBounds;
  inputWidth: number;
  inputHeight: number;
  estimatedCharacterHeight: number | null;
  scale: number;
};

// Independent of the live camera detector. A recognition ROI never replaces the
// audit image or supplies an invoice identity. All coordinates stay in input pixels.
export async function prepareFaintRegions(
  input: Buffer,
): Promise<FaintPreparation> {
  const source = await sharp(input, { limitInputPixels: 48_000_000 })
    .flatten({ background: "white" })
    .removeAlpha()
    .png()
    .toBuffer();
  const meta = await sharp(source).metadata(),
    iw = meta.width!,
    ih = meta.height!;
  const scan = await sharp(source)
    .resize({
      width: 600,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sw = scan.info.width,
    sh = scan.info.height,
    n = sw * sh,
    seen = new Uint8Array(n),
    queue = new Int32Array(n);
  let best = 0,
    box = { left: 0, top: 0, width: sw, height: sh };
  for (let start = 0; start < n; start++) {
    if (seen[start] || scan.data[start] < 145) continue;
    let head = 0,
      tail = 1,
      x0 = sw,
      y0 = sh,
      x1 = 0,
      y1 = 0;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % sw,
        y = Math.floor(i / sw);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (const j of [
        x ? i - 1 : -1,
        x < sw - 1 ? i + 1 : -1,
        y ? i - sw : -1,
        y < sh - 1 ? i + sw : -1,
      ])
        if (j >= 0 && !seen[j] && scan.data[j] >= 145) {
          seen[j] = 1;
          queue[tail++] = j;
        }
    }
    if (
      tail > best &&
      tail > n * 0.08 &&
      tail / ((x1 - x0 + 1) * (y1 - y0 + 1)) > 0.55
    ) {
      best = tail;
      box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    }
  }
  // Include a safety margin. The full audit image is always kept separately.
  const left = Math.max(0, Math.floor((box.left * iw) / sw) - 12),
    top = Math.max(0, Math.floor((box.top * ih) / sh) - 12);
  const right = Math.min(
      iw,
      Math.ceil(((box.left + box.width) * iw) / sw) + 12,
    ),
    bottom = Math.min(ih, Math.ceil(((box.top + box.height) * ih) / sh) + 12);
  const bounds = { left, top, width: right - left, height: bottom - top };
  const color = await sharp(source).extract(bounds).png().toBuffer();
  const g = await sharp(color)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = g.info.width,
    height = g.info.height;
  // Local shading removal preserves faint strokes instead of choosing a global
  // paper/desk threshold. No resize, hard inversion, or destructive global clipping.
  const background = await sharp(color).grayscale().blur(18).raw().toBuffer();
  const flat = Buffer.alloc(width * height),
    binary = Buffer.alloc(width * height);
  for (let i = 0; i < flat.length; i++) {
    const ink = background[i] - g.data[i];
    flat[i] = Math.max(0, Math.min(255, 245 - ink * 9));
    binary[i] = ink > 4 ? 0 : 255;
  }
  const raw = { width, height, channels: 1 as const };
  // Estimate character scale from compact ink components; broad text envelope
  // includes every detected band (including header and bottom total), never fixed rows.
  const visited = new Uint8Array(flat.length),
    q = new Int32Array(flat.length),
    heights: number[] = [];
  let tx0 = width,
    ty0 = height,
    tx1 = 0,
    ty1 = 0;
  for (let start = 0; start < binary.length; start++) {
    if (visited[start] || binary[start] !== 0) continue;
    let head = 0,
      tail = 1,
      x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    q[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const i = q[head++],
        x = i % width,
        y = Math.floor(i / width);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (const j of [
        x ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ])
        if (j >= 0 && !visited[j] && binary[j] === 0) {
          visited[j] = 1;
          q[tail++] = j;
        }
    }
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    if (
      h >= 8 &&
      h <= 100 &&
      w >= 2 &&
      w <= h * 8 &&
      tail >= 8 &&
      tail / (w * h) > 0.1 &&
      x0 > 2 &&
      y0 > 2 &&
      x1 < width - 3 &&
      y1 < height - 3
    ) {
      heights.push(h);
      tx0 = Math.min(tx0, x0);
      ty0 = Math.min(ty0, y0);
      tx1 = Math.max(tx1, x1);
      ty1 = Math.max(ty1, y1);
    }
  }
  heights.sort((a, b) => a - b);
  const estimatedCharacterHeight =
    heights.length >= 12 ? heights[Math.floor(heights.length / 2)] : null;
  // Bounds are deliberately broad: retain all bands plus two character heights.
  const padding = Math.max(32, (estimatedCharacterHeight ?? 20) * 2);
  const roi =
    heights.length >= 12
      ? {
          left: Math.max(0, tx0 - padding),
          top: Math.max(0, ty0 - padding),
          width:
            Math.min(width, tx1 + padding + 1) - Math.max(0, tx0 - padding),
          height:
            Math.min(height, ty1 + padding + 1) - Math.max(0, ty0 - padding),
        }
      : { left: 0, top: 0, width, height };
  return {
    color: await sharp(color).extract(roi).png().toBuffer(),
    gray: await sharp(flat, { raw }).extract(roi).png().toBuffer(),
    binary: await sharp(binary, { raw }).extract(roi).png().toBuffer(),
    bounds: {
      left: bounds.left + roi.left,
      top: bounds.top + roi.top,
      width: roi.width,
      height: roi.height,
    },
    inputWidth: iw,
    inputHeight: ih,
    estimatedCharacterHeight,
    scale: 1,
  };
}

export function faintVariantImage(
  prepared: FaintPreparation,
  variant: FaintVariant,
) {
  return variant === "native-color"
    ? prepared.color
    : variant === "local-gray"
      ? prepared.gray
      : prepared.binary;
}

export const FAINT_VARIANTS: readonly FaintVariant[] = [
  "native-color",
  "local-gray",
  "local-binary",
];
export function faintProvenance(prepared: FaintPreparation) {
  return {
    inputWidth: prepared.inputWidth,
    inputHeight: prepared.inputHeight,
    outputWidth: prepared.bounds.width,
    outputHeight: prepared.bounds.height,
    bounds: prepared.bounds,
    estimatedCharacterHeight: prepared.estimatedCharacterHeight,
    scale: prepared.scale,
  };
}

// The caller owns the worker and its PSM. Three variants share one deadline.
// Timeout propagates: do not reuse a worker while recognition is still running.
export async function recognizeFaintVariants(
  worker: Worker,
  prepared: FaintPreparation,
  budgetMs: number,
  restartWorker?: () => Promise<Worker>,
) {
  const originalWorker = worker;
  const deadline = Date.now() + budgetMs;
  const passes = [];
  const outcomes: Array<{variant: FaintVariant; status: "completed" | "no-useful-structure" | "timed-out" | "errored"; durationMs: number; reason?: string}> = [];
  let stopped = false;
  // Run the physically proven high-value variant first, retaining the same scoring.
  for (const variant of ["local-gray", "local-binary", "native-color"] as const) {
    const remaining = deadline - Date.now();
    if (stopped || remaining <= 0) {
      outcomes.push({variant,status:"timed-out",durationMs:0,reason:"Not started: candidate budget exhausted or worker terminated"});
      continue;
    }
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        observeOcr(worker, faintVariantImage(prepared, variant), "sparse-text"),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Optical variant time budget exceeded")), Math.min(3000, remaining));
        }),
      ]);
      const score = opticalScore(result.data.text, result.data.confidence);
      passes.push({variant,data:result.data,durationMs:Date.now()-start,score,...faintProvenance(prepared)});
      outcomes.push({variant,status:score.credible?"completed":"no-useful-structure",durationMs:Date.now()-start});
    } catch(error) {
      const reason=error instanceof Error?error.message:String(error);
      outcomes.push({variant,status:reason.includes("time budget")?"timed-out":"errored",durationMs:Date.now()-start,reason});
      // A raced timeout does not cancel Tesseract. Terminate the worker explicitly.
      await worker.terminate().catch(()=>undefined);
      stopped=true;
      if (restartWorker && Date.now() < deadline) {
        try { worker=await restartWorker(); stopped=false; } catch { /* Completed siblings still survive worker startup failure. */ }
      }
    } finally { clearTimeout(timer); }
  }
  if (worker !== originalWorker) await worker.terminate().catch(()=>undefined);
  const ranked = [...passes].sort((a,b)=>b.score.score-a.score.score);
  return {passes,outcomes,selected:ranked[0]};
}

// Direction is optical evidence, not invoice matching. Confident horizontal word
// boxes and multiple text lines permit ordinary prose to establish orientation.
export function directionEvidence(
  data: Awaited<ReturnType<Worker["recognize"]>>["data"],
) {
  const words = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
  );
  const useful = words.filter(
    (w) =>
      w.confidence >= 40 &&
      /[a-z]{2}/i.test(w.text) &&
      !/^([a-z])\1+$/i.test(w.text) &&
      w.bbox.x1 - w.bbox.x0 >= w.bbox.y1 - w.bbox.y0,
  );
  const unique = new Set(useful.map((w) => w.text.toLowerCase())).size;
  const lines = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .filter((l) => l.words.some((w) => useful.includes(w))).length;
  const score =
    useful.reduce(
      (n, w) => n + (w.confidence / 100) * Math.min(w.text.length, 12),
      0,
    ) +
    unique * 2 +
    Math.min(lines, 15) * 2;
  return {
    credible: useful.length >= 6 && unique >= 5 && lines >= 3,
    score,
    words: useful.length,
    unique,
    lines,
  };
}
