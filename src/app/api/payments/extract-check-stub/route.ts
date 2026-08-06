import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  hasExplicitRemittanceTotal,
  parseCheckStubText,
} from "@/app/lib/remittanceMatching";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_DATA_URL_LENGTH = 20_000_000;
const OCR_ATTEMPT_TIMEOUT_MS = 6_000;
const OCR_ROUTE_BUDGET_MS = 48_000;
const GOOD_OCR_SCORE = 130;
const ROTATIONS = [0, 90, 180, 270] as const;
const DOCUMENT_SCAN_WIDTH = 720;

type OcrRotation = (typeof ROTATIONS)[number];
type RemittanceDocumentType =
  | "remittance_stub"
  | "full_check_stub"
  | "check_only";
type OcrRetryStrategy = "standard" | "alternate";

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
  | "sharpened"
  | "row-focused";

type TesseractPageMode = {
  name: "sparse-text" | "single-block" | "single-line" | "auto";
  value: import("tesseract.js").PSM;
};

type OcrAttemptSpec = {
  variant: OcrVariant;
  pageMode: TesseractPageMode;
};

type OcrAttempt = {
  region: string;
  variant: OcrVariant;
  pageMode: TesseractPageMode["name"];
  rotation: OcrRotation;
  text: string;
  confidence: number;
  score: number;
  imageWidth?: number;
  imageHeight?: number;
};

type OcrImageSource = {
  name: string;
  image: Buffer;
  width?: number;
  height?: number;
};

function normalizeDocumentType(value: unknown): RemittanceDocumentType {
  return value === "full_check_stub" || value === "check_only"
    ? value
    : "remittance_stub";
}

function normalizeRetryStrategy(value: unknown): OcrRetryStrategy {
  return value === "alternate" ? "alternate" : "standard";
}

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

async function cropImageRegion(input: Buffer, bounds: ImageBounds) {
  return sharp(input, { limitInputPixels: 48_000_000 })
    .extract(bounds)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function preprocessForOcr(input: Buffer, rotation: OcrRotation, variant: OcrVariant) {
  const targetEdge = variant === "row-focused" ? 3600 : 2400;
  const pipeline = sharp(input, { limitInputPixels: 48_000_000 })
    .rotate(rotation)
    .resize({
      width: targetEdge,
      height: targetEdge,
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
  } else if (variant === "row-focused") {
    pipeline.linear(1.85, -48).median(1).sharpen({ sigma: 1.9 });
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
  const originalMetadata = await imageMetadata(originalImage);
  const normalizedScene = await normalizeInputImage(originalImage);
  const sceneMetadata = await imageMetadata(normalizedScene);
  const detectedBounds = await detectDocumentBounds(normalizedScene);
  const documentImage = detectedBounds
    ? await cropDocument(normalizedScene, detectedBounds)
    : normalizedScene;
  const documentMetadata = await imageMetadata(documentImage);

  return {
    detectedBounds,
    original: {
      width: originalMetadata.width,
      height: originalMetadata.height,
      format: originalMetadata.format,
      orientation: originalMetadata.orientation,
    },
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

async function buildRegionSources(
  documentImage: Buffer,
  documentType: RemittanceDocumentType
): Promise<OcrImageSource[]> {
  const metadata = await imageMetadata(documentImage);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    return [];
  }

  const regions: Array<{ name: string; bounds: ImageBounds }> = [
    {
      name: "full-document",
      bounds: { left: 0, top: 0, width, height },
    },
  ];
  const isWideDocument = width / Math.max(height, 1) >= 1.65;
  const isTallDocument = height / Math.max(width, 1) >= 1.65;

  if (documentType === "remittance_stub") {
    regions.push(
      {
        name: "stub-header",
        bounds: { left: 0, top: 0, width, height: Math.round(height * 0.34) },
      },
      {
        name: "stub-invoice-rows",
        bounds: {
          left: 0,
          top: Math.round(height * 0.18),
          width,
          height: Math.round(height * 0.68),
        },
      },
      {
        name: "stub-row-band",
        bounds: {
          left: 0,
          top: Math.round(height * 0.2),
          width,
          height: Math.round(height * 0.48),
        },
      },
      {
        name: "stub-invoice-account-column",
        bounds: {
          left: 0,
          top: Math.round(height * 0.2),
          width: Math.round(width * 0.62),
          height: Math.round(height * 0.42),
        },
      },
      {
        name: "stub-description-column",
        bounds: {
          left: Math.round(width * 0.38),
          top: Math.round(height * 0.2),
          width: Math.round(width * 0.38),
          height: Math.round(height * 0.42),
        },
      },
      {
        name: "stub-amount-column",
        bounds: {
          left: Math.round(width * 0.68),
          top: Math.round(height * 0.18),
          width: width - Math.round(width * 0.68),
          height: Math.round(height * 0.58),
        },
      },
      {
        name: "stub-total-footer",
        bounds: {
          left: 0,
          top: Math.round(height * 0.66),
          width,
          height: height - Math.round(height * 0.66),
        },
      }
    );
  } else if (documentType === "check_only") {
    regions.push(
      {
        name: "check-face-no-micr",
        bounds: { left: 0, top: 0, width, height: Math.round(height * 0.84) },
      },
      {
        name: "check-number-date-amount",
        bounds: {
          left: Math.round(width * 0.42),
          top: 0,
          width: width - Math.round(width * 0.42),
          height: Math.round(height * 0.6),
        },
      }
    );
  } else if (isWideDocument) {
    regions.push(
      {
        name: "check-left",
        bounds: { left: 0, top: 0, width: Math.round(width * 0.52), height },
      },
      {
        name: "check-face-no-micr",
        bounds: {
          left: 0,
          top: 0,
          width: Math.round(width * 0.56),
          height: Math.round(height * 0.84),
        },
      },
      {
        name: "remittance-right",
        bounds: {
          left: Math.round(width * 0.38),
          top: 0,
          width: width - Math.round(width * 0.38),
          height,
        },
      },
      {
        name: "amounts-right-edge",
        bounds: {
          left: Math.round(width * 0.68),
          top: 0,
          width: width - Math.round(width * 0.68),
          height,
        },
      }
    );
  }

  if (documentType === "full_check_stub" && isTallDocument) {
    regions.push(
      {
        name: "check-top",
        bounds: { left: 0, top: 0, width, height: Math.round(height * 0.46) },
      },
      {
        name: "remittance-bottom",
        bounds: {
          left: 0,
          top: Math.round(height * 0.34),
          width,
          height: height - Math.round(height * 0.34),
        },
      }
    );
  }

  if (documentType === "full_check_stub" && !isWideDocument && !isTallDocument) {
    regions.push(
      {
        name: "upper-half",
        bounds: { left: 0, top: 0, width, height: Math.round(height * 0.58) },
      },
      {
        name: "lower-half",
        bounds: {
          left: 0,
          top: Math.round(height * 0.42),
          width,
          height: height - Math.round(height * 0.42),
        },
      }
    );
  }

  return Promise.all(
    regions.map(async (region) => {
      const image = await cropImageRegion(documentImage, region.bounds);
      const regionMetadata = await imageMetadata(image);

      return {
        name: region.name,
        image,
        width: regionMetadata.width,
        height: regionMetadata.height,
      };
    })
  );
}

function scoreOcrText(text: string, confidence: number) {
  const scoringText = withoutMicrBandText(text);
  const invoiceMatches =
    scoringText.match(/\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/gi) ??
    [];
  const currencyMatches =
    scoringText.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g) ?? [];
  const parsed = parseCheckStubText(scoringText);
  const structurallyValidRows = parsed.lines.filter(
    (line) => line.invoiceNumbers.length > 0 && line.amount > 0
  );
  const invoiceNumbers = structurallyValidRows.flatMap(
    (line) => line.invoiceNumbers
  );
  const checkNumberNearLabel = /\b(?:CK|CHK|CHECK)\s*#?\s*:?\s*\d{3,5}\b/i.test(
    scoringText.replace(/[Oo]/g, "0")
  );
  const hasPropertyName = /north\s+creek/i.test(scoringText);
  const hasApartments = /apartments?/i.test(scoringText);
  const explicitTotal = hasExplicitRemittanceTotal(scoringText);
  const referencedLineTotal = parsed.lines
    .filter((line) => line.invoiceNumbers.length > 0 && line.amount > 0)
    .reduce((total, line) => total + line.amount, 0);
  const linesReconcile =
    parsed.totalAmount > 0 &&
    referencedLineTotal > 0 &&
    Math.abs(referencedLineTotal - parsed.totalAmount) < 0.01;
  const hasMultipleRemittanceRows =
    structurallyValidRows.length > 1;
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
    scoringText.match(/\b(?:check|ck|date|total|amount|invoice|inv|payor|payer|property|customer|apartment|apartments)\b/gi) ??
    [];

  return (
    confidence +
    invoiceMatches.length * 35 +
    invoiceNumbers.length * 28 +
    structurallyValidRows.length * 55 +
    currencyMatches.length * 12 +
    fieldCount * 28 +
    (checkNumberNearLabel ? 45 : 0) +
    (hasPropertyName && hasApartments ? 55 : 0) +
    (explicitTotal ? 45 : 0) +
    (linesReconcile ? 80 : 0) +
    (hasMultipleRemittanceRows ? 35 : 0) +
    Math.min(keywordMatches.length, 10) * 4 +
    Math.min(scoringText.trim().length / 20, 20) -
    (headerPayor ? 70 : 0) -
    (implausibleCheckNumber ? 55 : 0) -
    (noInvoicesDespiteAmounts ? 60 : 0)
  );
}

function structurallyValidRemittanceRows(text: string) {
  return parseCheckStubText(withoutMicrBandText(text)).lines.filter(
    (line) => line.invoiceNumbers.length > 0 && line.amount > 0
  );
}

function candidateStructureScore(attempt: OcrAttempt) {
  const text = withoutMicrBandText(attempt.text);
  const parsed = parseCheckStubText(text);
  const validRows = parsed.lines.filter(
    (line) => line.invoiceNumbers.length > 0 && line.amount > 0
  );
  const lineTotal = validRows.reduce((total, line) => total + line.amount, 0);
  const reconciles =
    parsed.totalAmount > 0 &&
    lineTotal > 0 &&
    Math.abs(lineTotal - parsed.totalAmount) < 0.01;
  const checkNumberNearLabel = /\b(?:CK|CHK|CHECK)\s*#?\s*:?\s*\d{3,5}\b/i.test(
    text.replace(/[Oo]/g, "0")
  );
  const hasHeader = /\bproperty\b.*\binvoice\b.*\bamount\b/i.test(
    text.replace(/\n/g, " ")
  );

  return (
    attempt.score +
    validRows.length * 90 +
    (validRows.length >= 2 ? 120 : 0) +
    (reconciles ? 180 : 0) +
    (hasHeader ? 45 : 0) +
    (parsed.totalAmount > 0 ? 60 : 0) +
    (parsed.checkDate ? 35 : 0) +
    (parsed.checkNumber && checkNumberNearLabel ? 50 : 0) -
    (parsed.checkNumber && !checkNumberNearLabel ? 45 : 0)
  );
}

function redactedTextSummary(text: string) {
  return text
    .replace(/\b\d{7,}\b/g, "[redacted-number]")
    .replace(/\b\d{2,4}[- ]\d{2,4}[- ]\d{3,6}\b/g, "[redacted-bank-text]")
    .replace(/[^\S\r\n]+/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(" | ")
    .slice(0, 800);
}

function withoutMicrBandText(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const compact = line.replace(/\s/g, "");
      const digitCount = (compact.match(/\d/g) ?? []).length;
      const micrMarks = /[⑆⑈⑉]|routing|account|micr/i.test(line);

      return !(digitCount >= 9 && (micrMarks || compact.length >= 12));
    })
    .join("\n");
}

function shouldAcceptFirstPass(attempt: OcrAttempt) {
  const text = withoutMicrBandText(attempt.text);
  const parsed = parseCheckStubText(text);
  const hasInvoice = parsed.lines.some(
    (line) => line.invoiceNumbers.length > 0 && line.amount > 0
  );
  const referencedLineTotal = parsed.lines
    .filter((line) => line.invoiceNumbers.length > 0 && line.amount > 0)
    .reduce((total, line) => total + line.amount, 0);
  const invoiceLinesReconcile =
    parsed.totalAmount <= 0 ||
    referencedLineTotal <= 0 ||
    Math.abs(referencedLineTotal - parsed.totalAmount) < 0.01;

  return (
    attempt.score >= GOOD_OCR_SCORE &&
    hasExplicitRemittanceTotal(text) &&
    parsed.totalAmount > 0 &&
    (hasInvoice || parsed.checkNumber || parsed.payor) &&
    invoiceLinesReconcile
  );
}

function ocrAttemptSpecs(
  psm: typeof import("tesseract.js").PSM,
  retryStrategy: OcrRetryStrategy
): OcrAttemptSpec[] {
  const specs: OcrAttemptSpec[] = [
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
    {
      variant: "row-focused",
      pageMode: { name: "single-line", value: psm.SINGLE_LINE },
    },
  ];

  return retryStrategy === "alternate"
    ? [specs[2], specs[3], specs[1], specs[0]]
    : specs;
}

async function recognizeBestText(
  originalImage: Buffer,
  documentType: RemittanceDocumentType,
  retryStrategy: OcrRetryStrategy
) {
  const Tesseract = await import("tesseract.js");
  const startedAt = Date.now();
  const stageTimings: Record<string, number> = {};
  const markStage = (stage: string) => {
    stageTimings[stage] = Date.now() - startedAt;
  };
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
    markStage("document-normalized");
    const regionSources = await buildRegionSources(
      sources.document.image,
      documentType
    );
    markStage("regions-built");
    const specs = ocrAttemptSpecs(Tesseract.PSM, retryStrategy);
    const fullDocumentSource = regionSources[0] ?? {
      name: "full-document",
      image: sources.document.image,
      width: sources.document.width,
      height: sources.document.height,
    };
    const enoughTimeForAnotherAttempt = () =>
      Date.now() - startedAt < OCR_ROUTE_BUDGET_MS;
    const bestParsedSoFar = () => {
      attempts.sort((left, right) => right.score - left.score);
      const selectedAttempt = attempts[0] ?? null;

      return selectedAttempt ? parseCheckStubText(selectedAttempt.text) : null;
    };
    const needsMoreOcr = () => {
      const parsed = bestParsedSoFar();

      return (
        !parsed ||
        parsed.totalAmount <= 0 ||
        parsed.lines.filter(
          (line) => line.invoiceNumbers.length > 0 && line.amount > 0
        ).length < 2
      );
    };

    async function runAttemptsForSource(
      source: OcrImageSource,
      sourceSpecs: OcrAttemptSpec[],
      rotations: readonly OcrRotation[] = ROTATIONS
    ) {
      for (const spec of sourceSpecs) {
      for (const rotation of rotations) {
        if (!enoughTimeForAnotherAttempt()) {
          markStage(`budget-exhausted:${source.name}`);
          return;
        }

        await worker.setParameters({
          tessedit_pageseg_mode: spec.pageMode.value,
        });

        const attemptStage = `${source.name}/${spec.variant}/${spec.pageMode.name}/${rotation}`;
        const image = await preprocessForOcr(source.image, rotation, spec.variant);
        markStage(`preprocessed:${attemptStage}`);
        const recognition = worker.recognize(image, {}, { text: true });
        let result;

        try {
          result = await Promise.race([
            recognition,
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () =>
                  reject(
                    new Error(
                      `OCR timed out during ${source.name}. Try a closer, brighter photo or enter it manually.`
                    )
                  ),
                OCR_ATTEMPT_TIMEOUT_MS
              );
            }),
          ]);
        } catch (error) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }

          markStage(`timeout:${attemptStage}`);

          if (attempts.length > 0) {
            return;
          }

          throw error;
        }

        const text = result.data.text.trim();
        const confidence =
          typeof result.data.confidence === "number" ? result.data.confidence : 0;
        const attempt = {
          region: source.name,
          variant: spec.variant,
          pageMode: spec.pageMode.name,
          rotation,
          text,
          confidence,
          score: scoreOcrText(text, confidence),
          imageWidth: source.width,
          imageHeight: source.height,
        };

        attempts.push(attempt);

        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        markStage(`recognized:${attemptStage}`);

        if (
          spec.variant === "grayscale-normalized" &&
          rotation === 0 &&
          shouldAcceptFirstPass(attempt)
        ) {
          return;
        }
      }
    }
    }

    await runAttemptsForSource(fullDocumentSource, [specs[0]], [0]);

    if (needsMoreOcr() && documentType === "remittance_stub") {
      const rowFocusedSpec = specs.find((spec) => spec.variant === "row-focused");
      const rowSources = regionSources.filter((source) =>
        /stub-(?:row|invoice|description|amount)/i.test(source.name)
      );

      if (rowFocusedSpec) {
        for (const source of rowSources) {
          await runAttemptsForSource(source, [rowFocusedSpec], [0]);
          if (!needsMoreOcr()) {
            break;
          }
        }
      }
    }

    if (needsMoreOcr() && regionSources.length > 1) {
      const fallbackSpecs = specs.filter((spec) =>
        ["sparse-text", "single-block"].includes(spec.pageMode.name)
      );

      for (const source of regionSources.slice(1)) {
        await runAttemptsForSource(source, fallbackSpecs, [0]);
        if (!needsMoreOcr()) {
          break;
        }
      }
    }

    if (needsMoreOcr()) {
      await runAttemptsForSource(fullDocumentSource, specs.slice(1), [0, 180]);
    }

    if (needsMoreOcr()) {
      await runAttemptsForSource(fullDocumentSource, [specs[0]], [90, 270]);
    }

    attempts.sort(
      (left, right) =>
        candidateStructureScore(right) - candidateStructureScore(left)
    );

    const structurallyUsefulRegionAttempts = attempts
      .filter((attempt) => {
        const parsed = parseCheckStubText(withoutMicrBandText(attempt.text));
        const validRows = parsed.lines.filter(
          (line) => line.invoiceNumbers.length > 0 && line.amount > 0
        );

        return (
          validRows.length > 0 ||
          parsed.totalAmount > 0 ||
          parsed.checkDate ||
          (parsed.checkNumber &&
            /\b(?:CK|CHK|CHECK)\s*#?\s*:?\s*\d{3,5}\b/i.test(
              attempt.text.replace(/[Oo]/g, "0")
            ))
        );
      })
      .reduce<OcrAttempt[]>((selectedAttempts, attempt) => {
        if (
          selectedAttempts.some(
            (selectedAttempt) => selectedAttempt.region === attempt.region
          )
        ) {
          return selectedAttempts;
        }

        return [...selectedAttempts, attempt];
      }, []);

    if (structurallyUsefulRegionAttempts.length > 1) {
      const mergedText = structurallyUsefulRegionAttempts
        .map((attempt) => attempt.text)
        .join("\n\n--- OCR STRUCTURED REGION ---\n\n");
      const mergedAttempt: OcrAttempt = {
        region: "structured-region-merge",
        variant: "row-focused",
        pageMode: "sparse-text",
        rotation: 0,
        text: mergedText,
        confidence:
          structurallyUsefulRegionAttempts.reduce(
            (total, attempt) => total + attempt.confidence,
            0
          ) / structurallyUsefulRegionAttempts.length,
        score: scoreOcrText(mergedText, 0),
        imageWidth: sources.document.width,
        imageHeight: sources.document.height,
      };

      attempts.push(mergedAttempt);
      attempts.sort(
        (left, right) =>
          candidateStructureScore(right) - candidateStructureScore(left)
      );
    }

    const selected = attempts[0] ?? null;
    const regionBestAttempts = regionSources
      .map((source) =>
        attempts
          .filter((attempt) => attempt.region === source.name)
          .sort(
            (left, right) =>
              candidateStructureScore(right) - candidateStructureScore(left)
          )[0] ?? null
      )
      .filter((attempt): attempt is OcrAttempt => Boolean(attempt));
    const candidateSummaries = attempts.slice(0, 8).map((attempt) => ({
      region: attempt.region,
      rotation: attempt.rotation,
      variant: attempt.variant,
      pageMode: attempt.pageMode,
      confidence: attempt.confidence,
      score: Math.round(candidateStructureScore(attempt)),
      validRows: structurallyValidRemittanceRows(attempt.text).length,
      summary: redactedTextSummary(attempt.text),
    }));
    const finalText = selected?.text ?? "";

    return {
      text: finalText,
      diagnostics: {
        documentType,
        retryStrategy,
        originalWidth: sources.original.width,
        originalHeight: sources.original.height,
        originalFormat: sources.original.format,
        originalOrientation: sources.original.orientation,
        normalizedWidth: sources.scene.width,
        normalizedHeight: sources.scene.height,
        documentWidth: sources.document.width,
        documentHeight: sources.document.height,
        ocrReceivedThumbnail: false,
        detectedBounds: sources.detectedBounds,
        selectedRegion: selected?.region,
        selectedRotation: selected?.rotation,
        selectedVariant: selected?.variant,
        selectedConfidence: selected?.confidence,
        stageTimings,
        selectedSummary: redactedTextSummary(selected?.text ?? ""),
        regionSummaries: regionBestAttempts.map((attempt) =>
          redactedTextSummary(attempt.text)
        ),
        candidateSummaries,
      },
    };
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
    documentType?: unknown;
    retryStrategy?: unknown;
  } | null;
  const imageDataUrl = body?.imageDataUrl;
  const documentType = normalizeDocumentType(body?.documentType);
  const retryStrategy = normalizeRetryStrategy(body?.retryStrategy);

  if (!isSafeDataUrl(imageDataUrl)) {
    return NextResponse.json(
      { error: "Upload a clear remittance stub or check photo under the current size limit." },
      { status: 400 }
    );
  }

  try {
    const originalImage = dataUrlToBuffer(imageDataUrl as string);
    const ocrResult = await recognizeBestText(
      originalImage,
      documentType,
      retryStrategy
    );
    const rawText = ocrResult.text;
    const parsedText = withoutMicrBandText(rawText);

    if (!rawText) {
      return NextResponse.json({
        rawText: "",
        stubText: "",
        lines: [],
        diagnostics: {
          summary: [
            "No readable OCR text was returned from the selected image.",
          ],
          ...ocrResult.diagnostics,
        },
        error:
          "Owner Review Required. Trimax did not find readable printed text in that remittance.",
      });
    }

    const extraction = parseCheckStubText(parsedText);
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
        diagnostics: {
          summary: [
            "Check number not found.",
            "Payment date not found.",
            "Document total not found.",
            "Remittance invoice rows not found.",
          ],
          ...ocrResult.diagnostics,
        },
        error: "Could not read the payment fields. Adjust crop or enter manually.",
      });
    }
    const confirmedInvoiceRowCount = extraction.lines.filter(
      (line) => line.invoiceNumbers.length > 0 && line.amount > 0
    ).length;
    const diagnosticSummary = [
      extraction.checkNumber ? "Check number found." : "Check number not found.",
      extraction.checkDate ? "Payment date found." : "Payment date not found.",
      extraction.totalAmount > 0 ? "Document total found." : "Document total not found.",
      confirmedInvoiceRowCount > 0
        ? `${confirmedInvoiceRowCount} confirmed invoice row${
            confirmedInvoiceRowCount === 1 ? "" : "s"
          } found.`
        : extractedInvoiceNumbers.length > 0
          ? "Some invoice text was detected, but invoice rows could not be confirmed."
          : "Remittance rows not found.",
    ];

    return NextResponse.json({
      ocrEngine: "tesseract.js",
      documentType,
      retryStrategy,
      ...extraction,
      diagnostics: {
        summary: diagnosticSummary,
        ...ocrResult.diagnostics,
      },
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
