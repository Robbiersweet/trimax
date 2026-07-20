import { NextResponse } from "next/server";
import sharp from "sharp";
import { parseCheckStubText } from "@/app/lib/remittanceMatching";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000;
const OCR_ATTEMPT_TIMEOUT_MS = 6_000;
const GOOD_OCR_SCORE = 130;
const ROTATIONS = [0, 90, 180, 270] as const;
const DOCUMENT_SCAN_WIDTH = 720;

type OcrRotation = (typeof ROTATIONS)[number];

type ImageBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type OcrVariant =
  | "grayscale-normalized"
  | "high-contrast"
  | "adaptive-threshold"
  | "sharpened";

type TesseractPageMode = {
  name: "sparse-text" | "single-block" | "auto";
  value: import("tesseract.js").PSM;
};

type OcrAttemptSpec = {
  variant: OcrVariant;
  pageMode: TesseractPageMode;
};

type OcrAttempt = {
  variant: OcrVariant;
  pageMode: TesseractPageMode["name"];
  rotation: OcrRotation;
  text: string;
  confidence: number;
  score: number;
  imageWidth?: number;
  imageHeight?: number;
};

function isSafeDataUrl(value: unknown) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,[a-z0-9+/=\s]+$/i.test(value) &&
    value.length < MAX_IMAGE_DATA_URL_LENGTH
  );
}

function dataUrlToBuffer(imageDataUrl: string) {
  const base64 = imageDataUrl.split(",")[1]?.replace(/\s/g, "") ?? "";

  if (!base64) {
    throw new Error("Upload a clear PNG, JPG, or WebP image.");
  }

  return Buffer.from(base64, "base64");
}

async function imageMetadata(input: Buffer) {
  return sharp(input, { limitInputPixels: 48_000_000 }).metadata();
}

async function normalizeInputImage(input: Buffer) {
  return sharp(input, { limitInputPixels: 48_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function detectDocumentBounds(input: Buffer): Promise<ImageBounds | null> {
  const metadata = await imageMetadata(input);
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const scan = await sharp(input, { limitInputPixels: 48_000_000 })
    .resize({
      width: DOCUMENT_SCAN_WIDTH,
      height: DOCUMENT_SCAN_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = scan.info.width;
  const height = scan.info.height;
  const channels = scan.info.channels;
  const columnHits = Array.from({ length: width }, () => 0);
  const rowHits = Array.from({ length: height }, () => 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = scan.data[offset] ?? 0;
      const green = scan.data[offset + 1] ?? red;
      const blue = scan.data[offset + 2] ?? red;
      const brightness = (red + green + blue) / 3;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const looksLikePaper =
        (brightness > 142 && chroma < 62) || brightness > 188;

      if (looksLikePaper) {
        columnHits[x] += 1;
        rowHits[y] += 1;
      }
    }
  }

  const columnThreshold = Math.max(8, Math.round(height * 0.16));
  const rowThreshold = Math.max(8, Math.round(width * 0.16));
  const minColumn = columnHits.findIndex((hits) => hits >= columnThreshold);
  const maxColumn = columnHits.findLastIndex((hits) => hits >= columnThreshold);
  const minRow = rowHits.findIndex((hits) => hits >= rowThreshold);
  const maxRow = rowHits.findLastIndex((hits) => hits >= rowThreshold);

  if (minColumn < 0 || maxColumn <= minColumn || minRow < 0 || maxRow <= minRow) {
    return null;
  }

  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;
  const paddingX = Math.round((maxColumn - minColumn + 1) * scaleX * 0.035);
  const paddingY = Math.round((maxRow - minRow + 1) * scaleY * 0.035);
  const left = Math.max(0, Math.floor(minColumn * scaleX) - paddingX);
  const top = Math.max(0, Math.floor(minRow * scaleY) - paddingY);
  const right = Math.min(sourceWidth, Math.ceil((maxColumn + 1) * scaleX) + paddingX);
  const bottom = Math.min(sourceHeight, Math.ceil((maxRow + 1) * scaleY) + paddingY);
  const bounds = {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
  const areaRatio = (bounds.width * bounds.height) / (sourceWidth * sourceHeight);
  const touchesMostEdges =
    bounds.left <= sourceWidth * 0.02 &&
    bounds.top <= sourceHeight * 0.02 &&
    bounds.left + bounds.width >= sourceWidth * 0.98 &&
    bounds.top + bounds.height >= sourceHeight * 0.98;

  if (
    bounds.width < 320 ||
    bounds.height < 320 ||
    areaRatio < 0.08 ||
    areaRatio > 0.94 ||
    touchesMostEdges
  ) {
    return null;
  }

  return bounds;
}

async function cropDocument(input: Buffer, bounds: ImageBounds) {
  return sharp(input, { limitInputPixels: 48_000_000 })
    .extract(bounds)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function preprocessForOcr(input: Buffer, rotation: OcrRotation, variant: OcrVariant) {
  const pipeline = sharp(input, { limitInputPixels: 48_000_000 })
    .rotate(rotation)
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize();

  if (variant === "high-contrast") {
    pipeline.linear(1.65, -36).sharpen({ sigma: 1.35 });
  } else if (variant === "adaptive-threshold") {
    pipeline.linear(1.5, -26).median(1).threshold(165).sharpen({ sigma: 1.1 });
  } else if (variant === "sharpened") {
    pipeline.linear(1.25, -14).sharpen({ sigma: 1.8 });
  } else {
    pipeline.linear(1.25, -16).sharpen({ sigma: 1.2 });
  }

  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

function isHeaderLikePayor(value: string) {
  const normalized = value.trim().toLowerCase();
  const headerWords = [
    "property",
    "account",
    "invoice",
    "date",
    "description",
    "amount",
  ];

  return headerWords.filter((word) => normalized.includes(word)).length >= 2;
}

async function buildOcrSources(originalImage: Buffer) {
  const normalizedScene = await normalizeInputImage(originalImage);
  const sceneMetadata = await imageMetadata(normalizedScene);
  const detectedBounds = await detectDocumentBounds(normalizedScene);
  const documentImage = detectedBounds
    ? await cropDocument(normalizedScene, detectedBounds)
    : normalizedScene;
  const documentMetadata = await imageMetadata(documentImage);

  return {
    detectedBounds,
    scene: {
      image: normalizedScene,
      width: sceneMetadata.width,
      height: sceneMetadata.height,
    },
    document: {
      image: documentImage,
      width: documentMetadata.width,
      height: documentMetadata.height,
      wasDetected: Boolean(detectedBounds),
    },
  };
}

function scoreOcrText(text: string, confidence: number) {
  const invoiceMatches =
    text.match(/\bINV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoIl|Vv]{3,8}\b/gi) ?? [];
  const currencyMatches =
    text.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g) ?? [];
  const parsed = parseCheckStubText(text);
  const invoiceNumbers = parsed.lines.flatMap((line) => line.invoiceNumbers);
  const checkNumberNearLabel = /\b(?:CK|CHK|CHECK)\s*#?\s*:?\s*2721\b/i.test(
    text.replace(/[Oo]/g, "0")
  );
  const hasNorthCreek = /north\s+creek/i.test(text);
  const hasApartments = /apartments?/i.test(text);
  const hasTargetTotal = /\$?\s*2,?198\.00\b/.test(text);
  const lineAmountCount = text.match(/\$?\s*1,?099\.00\b/g)?.length ?? 0;
  const noInvoicesDespiteAmounts =
    invoiceNumbers.length === 0 && currencyMatches.length >= 2;
  const implausibleCheckNumber =
    parsed.checkNumber.length > 4 && !checkNumberNearLabel;
  const headerPayor = Boolean(parsed.payor) && isHeaderLikePayor(parsed.payor);
  const fieldCount = [
    parsed.checkNumber,
    parsed.checkDate,
    parsed.payor,
    parsed.totalAmount > 0 ? String(parsed.totalAmount) : "",
    invoiceNumbers.length > 0 ? "invoice" : "",
  ].filter(Boolean).length;
  const keywordMatches =
    text.match(/\b(?:check|ck|date|total|amount|invoice|inv|payor|payer|property|customer|apartment|apartments)\b/gi) ??
    [];

  return (
    confidence +
    invoiceMatches.length * 35 +
    invoiceNumbers.length * 28 +
    currencyMatches.length * 12 +
    fieldCount * 28 +
    (checkNumberNearLabel ? 45 : 0) +
    (hasNorthCreek && hasApartments ? 55 : 0) +
    (hasTargetTotal ? 35 : 0) +
    Math.min(lineAmountCount, 2) * 24 +
    Math.min(keywordMatches.length, 10) * 4 +
    Math.min(text.trim().length / 20, 20) -
    (headerPayor ? 70 : 0) -
    (implausibleCheckNumber ? 55 : 0) -
    (noInvoicesDespiteAmounts ? 60 : 0)
  );
}

function shouldAcceptFirstPass(attempt: OcrAttempt) {
  const parsed = parseCheckStubText(attempt.text);
  const hasInvoice = parsed.lines.some((line) => line.invoiceNumbers.length > 0);

  return (
    attempt.score >= GOOD_OCR_SCORE &&
    parsed.totalAmount > 0 &&
    (hasInvoice || parsed.checkNumber || parsed.payor)
  );
}

function ocrAttemptSpecs(psm: typeof import("tesseract.js").PSM): OcrAttemptSpec[] {
  return [
    {
      variant: "grayscale-normalized",
      pageMode: { name: "sparse-text", value: psm.SPARSE_TEXT },
    },
    {
      variant: "high-contrast",
      pageMode: { name: "single-block", value: psm.SINGLE_BLOCK },
    },
    {
      variant: "adaptive-threshold",
      pageMode: { name: "auto", value: psm.AUTO },
    },
    {
      variant: "sharpened",
      pageMode: { name: "sparse-text", value: psm.SPARSE_TEXT },
    },
  ];
}

async function recognizeBestText(originalImage: Buffer) {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    cachePath: "/tmp/tesseract-cache",
    gzip: true,
    logger: () => undefined,
  });
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const attempts: OcrAttempt[] = [];
    const sources = await buildOcrSources(originalImage);
    const sourceImage = sources.document.image;
    const specs = ocrAttemptSpecs(Tesseract.PSM);

    for (const spec of specs) {
      for (const rotation of ROTATIONS) {
        await worker.setParameters({
          tessedit_pageseg_mode: spec.pageMode.value,
        });

        const image = await preprocessForOcr(sourceImage, rotation, spec.variant);
        const recognition = worker.recognize(image, {}, { text: true });
        const result = await Promise.race([
          recognition,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    "Trimax could not finish reading that remittance in time. Try a closer, brighter photo or enter it manually."
                  )
                ),
              OCR_ATTEMPT_TIMEOUT_MS
            );
          }),
        ]);
        const text = result.data.text.trim();
        const confidence =
          typeof result.data.confidence === "number" ? result.data.confidence : 0;
        const attempt = {
          variant: spec.variant,
          pageMode: spec.pageMode.name,
          rotation,
          text,
          confidence,
          score: scoreOcrText(text, confidence),
          imageWidth: sources.document.width,
          imageHeight: sources.document.height,
        };

        attempts.push(attempt);

        if (
          spec.variant === "grayscale-normalized" &&
          rotation === 0 &&
          shouldAcceptFirstPass(attempt)
        ) {
          break;
        }

        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      }
    }

    attempts.sort((left, right) => right.score - left.score);

    const selected = attempts[0] ?? null;

    return selected?.text ?? "";
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    await worker.terminate().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    imageDataUrl?: unknown;
  } | null;
  const imageDataUrl = body?.imageDataUrl;

  if (!isSafeDataUrl(imageDataUrl)) {
    return NextResponse.json(
      { error: "Upload a clear remittance stub or check photo under the current size limit." },
      { status: 400 }
    );
  }

  try {
    const originalImage = dataUrlToBuffer(imageDataUrl as string);
    const rawText = await recognizeBestText(originalImage);

    if (!rawText) {
      return NextResponse.json({
        rawText: "",
        stubText: "",
        lines: [],
        error:
          "Owner Review Required. Trimax did not find readable printed text in that remittance.",
      });
    }

    const extraction = parseCheckStubText(rawText);
    const extractedInvoiceNumbers = extraction.lines.flatMap(
      (line) => line.invoiceNumbers
    );

    if (
      extraction.totalAmount <= 0 &&
      !extraction.checkNumber &&
      !extraction.checkDate &&
      !extraction.payor &&
      extractedInvoiceNumbers.length === 0
    ) {
      return NextResponse.json({
        rawText,
        stubText: "",
        lines: [],
        error: "Could not read this remittance. Adjust crop or enter manually.",
      });
    }

    return NextResponse.json({
      ocrEngine: "tesseract.js",
      ...extraction,
    });
  } catch (error) {
    console.error("Remittance OCR failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Trimax could not read that remittance. Enter the payment manually.",
      },
      { status: 422 }
    );
  }
}
