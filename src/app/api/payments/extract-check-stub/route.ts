import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  extractMoneyCandidates,
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
  durationMs: number;
  imageWidth?: number;
  imageHeight?: number;
  words: OcrWord[];
};

type OcrImageSource = {
  name: string;
  image: Buffer;
  width?: number;
  height?: number;
  bounds: ImageBounds;
};

type OcrWord = {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  region: string;
  variant: OcrVariant;
  pageMode: TesseractPageMode["name"];
  rotation: OcrRotation;
};

type GeometricRow = {
  y: number;
  height: number;
  text: string;
  score: number;
  tokens: string[];
  words: OcrWord[];
};

type InvoiceColumnDiagnosticAttempt = {
  variant: OcrVariant;
  pageMode: TesseractPageMode["name"];
  scaling: string;
  durationMs: number;
  confidence: number;
  rawText: string;
  invoiceLikeTokens: string[];
  words: Array<{
    text: string;
    confidence: number;
    bbox: OcrWord["bbox"];
  }>;
};

type InvoiceColumnDiagnostics = {
  bounds: ImageBounds;
  width: number;
  height: number;
  estimatedCharacterHeight: number;
  sharpness: number;
  contrast: number;
  rowBands: Array<{
    row: number;
    y: number;
    height: number;
    sourceText: string;
    tokens: Array<{
      text: string;
      confidence: number;
      bbox: OcrWord["bbox"];
      region: string;
      variant: OcrVariant;
      pageMode: TesseractPageMode["name"];
    }>;
  }>;
  attempts: InvoiceColumnDiagnosticAttempt[];
  skippedReason?: string;
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
  const metadata = await imageMetadata(input);
  const integerBounds = integerImageBounds(
    bounds,
    metadata.width ?? bounds.left + bounds.width,
    metadata.height ?? bounds.top + bounds.height
  );

  return sharp(input, { limitInputPixels: 48_000_000 })
    .extract(integerBounds)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function cropImageRegion(input: Buffer, bounds: ImageBounds) {
  const metadata = await imageMetadata(input);
  const integerBounds = integerImageBounds(
    bounds,
    metadata.width ?? bounds.left + bounds.width,
    metadata.height ?? bounds.top + bounds.height
  );

  return sharp(input, { limitInputPixels: 48_000_000 })
    .extract(integerBounds)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

function integerImageBounds(
  bounds: ImageBounds,
  sourceWidth: number,
  sourceHeight: number
): ImageBounds {
  const maxWidth = Math.max(1, Math.floor(sourceWidth));
  const maxHeight = Math.max(1, Math.floor(sourceHeight));
  const rawLeft = Number.isFinite(bounds.left) ? bounds.left : 0;
  const rawTop = Number.isFinite(bounds.top) ? bounds.top : 0;
  const rawRight = Number.isFinite(bounds.width)
    ? rawLeft + Math.max(0, bounds.width)
    : maxWidth;
  const rawBottom = Number.isFinite(bounds.height)
    ? rawTop + Math.max(0, bounds.height)
    : maxHeight;
  const left = Math.min(Math.max(0, Math.floor(rawLeft)), maxWidth - 1);
  const top = Math.min(Math.max(0, Math.floor(rawTop)), maxHeight - 1);
  const right = Math.min(Math.max(left + 1, Math.ceil(rawRight)), maxWidth);
  const bottom = Math.min(Math.max(top + 1, Math.ceil(rawBottom)), maxHeight);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
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
        bounds: region.bounds,
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
  const structurallyValidRows = parsed.lines.filter(isStructurallyUsefulRow);
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
    .filter(isStructurallyUsefulRow)
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
    isStructurallyUsefulRow
  );
}

function isStructurallyUsefulRow(
  line: ReturnType<typeof parseCheckStubText>["lines"][number]
) {
  const hasInvoiceOrUnit = line.invoiceNumbers.length > 0 || line.unitCodes.length > 0;
  const hasWorkContext = /\b(?:full|interior|paint|cabinet|primer|repair|clean|turn)\b/i.test(
    `${line.text} ${line.serviceDescription}`
  );

  return line.amount > 0 && hasInvoiceOrUnit && hasWorkContext;
}

function candidateStructureScore(attempt: OcrAttempt) {
  const text = withoutMicrBandText(attempt.text);
  const parsed = parseCheckStubText(text);
  const validRows = parsed.lines.filter(isStructurallyUsefulRow);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function childArray(record: unknown, key: string): unknown[] {
  if (!isRecord(record)) {
    return [];
  }

  const value = record[key];

  return Array.isArray(value) ? value : [];
}

function extractOcrWords(
  data: unknown,
  source: OcrImageSource,
  processedWidth: number,
  processedHeight: number,
  spec: OcrAttemptSpec,
  rotation: OcrRotation
): OcrWord[] {
  if (!isRecord(data) || rotation !== 0) {
    return [];
  }

  const blocks = childArray(data, "blocks");
  const sourceWidth = source.width ?? processedWidth;
  const sourceHeight = source.height ?? processedHeight;
  const scaleX = sourceWidth > 0 && processedWidth > 0 ? sourceWidth / processedWidth : 1;
  const scaleY = sourceHeight > 0 && processedHeight > 0 ? sourceHeight / processedHeight : 1;
  const words: OcrWord[] = [];

  for (const block of blocks) {
    for (const paragraph of childArray(block, "paragraphs")) {
      for (const line of childArray(paragraph, "lines")) {
        for (const word of childArray(line, "words")) {
          if (!isRecord(word)) {
            continue;
          }

          const text = typeof word.text === "string" ? word.text.trim() : "";
          const bbox = isRecord(word.bbox) ? word.bbox : null;

          if (!text || !bbox) {
            continue;
          }

          words.push({
            text,
            confidence: numberFromRecord(word, "confidence"),
            bbox: {
              x0: Math.round(source.bounds.left + numberFromRecord(bbox, "x0") * scaleX),
              y0: Math.round(source.bounds.top + numberFromRecord(bbox, "y0") * scaleY),
              x1: Math.round(source.bounds.left + numberFromRecord(bbox, "x1") * scaleX),
              y1: Math.round(source.bounds.top + numberFromRecord(bbox, "y1") * scaleY),
            },
            region: source.name,
            variant: spec.variant,
            pageMode: spec.pageMode.name,
            rotation,
          });
        }
      }
    }
  }

  return words;
}

function wordCenterY(word: OcrWord) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function wordHeight(word: OcrWord) {
  return Math.max(1, word.bbox.y1 - word.bbox.y0);
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function normalizeGeometryToken(text: string) {
  return text
    .replace(/[|]/g, "I")
    .replace(/[“”]/g, "\"")
    .replace(/[^\w$.,/#:-]/g, "")
    .trim();
}

function normalizeGeometryRowText(tokens: string[]) {
  return tokens
    .map(normalizeGeometryToken)
    .filter(Boolean)
    .join(" ")
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+\.(\d{2})\b/g, "$1.$2")
    .replace(/\b(\d{1,3}(?:,\d{3})*)\s+([0O]{2})\b/g, "$1.00")
    .replace(
      /\b(\d{1,3}(?:,\d{3})*)\.(\d)\b/g,
      (_match, dollars: string, cents: string) => `${dollars}.${cents}0`
    )
    .replace(/\b([A-Z])O(\d)\b/g, (_match, prefix: string, digit: string) => `${prefix}0${digit}`)
    .replace(/\b([A-Z])(\d)O\b/g, (_match, prefix: string, digit: string) => `${prefix}${digit}0`)
    .replace(/\s+/g, " ")
    .trim();
}

function scoreGeometryRow(text: string) {
  const hasAmount = /\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/i.test(
    text
  );
  const hasUnit = /\b[A-Z]\d{2}[A-Z]?\b/i.test(text);
  const hasInvoice = /\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/i.test(
    text
  );
  const hasDate = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/.test(
    text
  );
  const workWords =
    text.match(/\b(?:full|interior|paint|cabinet|primer|repair|clean|turn)\b/gi) ?? [];
  const isHeader = /\bproperty\b.*\binvoice\b.*\bamount\b/i.test(text);
  const isSummary = /\b(?:grand\s+total|payment\s+total|check\s+total|total)\b/i.test(text);

  return (
    (hasInvoice ? 60 : 0) +
    (hasUnit ? 45 : 0) +
    (hasAmount ? 45 : 0) +
    (hasDate ? 18 : 0) +
    Math.min(workWords.length, 4) * 15 -
    (isHeader ? 70 : 0) -
    (isSummary ? 40 : 0)
  );
}

function reconstructRowsFromOcrGeometry(words: OcrWord[]): GeometricRow[] {
  const usefulWords = words
    .filter((word) => {
      const text = normalizeGeometryToken(word.text);

      return (
        text.length > 0 &&
        word.confidence >= 10 &&
        !/^[^\w$]+$/.test(text)
      );
    })
    .sort((left, right) => wordCenterY(left) - wordCenterY(right));

  if (usefulWords.length === 0) {
    return [];
  }

  const medianHeight = median(usefulWords.map(wordHeight));
  const yTolerance = Math.max(14, medianHeight * 0.85);
  const bands: OcrWord[][] = [];

  for (const word of usefulWords) {
    const centerY = wordCenterY(word);
    const band = bands.find((candidate) => {
      const candidateCenter = median(candidate.map(wordCenterY));

      return Math.abs(candidateCenter - centerY) <= yTolerance;
    });

    if (band) {
      band.push(word);
    } else {
      bands.push([word]);
    }
  }

  return bands
    .map((band) => {
      const sortedWords = [...band].sort((left, right) => left.bbox.x0 - right.bbox.x0);
      const text = normalizeGeometryRowText(sortedWords.map((word) => word.text));
      const heights = sortedWords.map(wordHeight);
      const score = scoreGeometryRow(text);

      return {
        y: Math.round(median(sortedWords.map(wordCenterY))),
        height: Math.round(median(heights)),
        text,
        score,
        tokens: sortedWords.map((word) => normalizeGeometryToken(word.text)).filter(Boolean),
        words: sortedWords,
      };
    })
    .filter(
      (row) =>
        row.score >= 55 &&
        !/^[-_\s]+$/.test(row.text) &&
        !/\bproperty\b.*\binvoice\b.*\bamount\b/i.test(row.text)
    )
    .sort((left, right) => left.y - right.y);
}

function compactWordPosition(word: OcrWord) {
  return `${normalizeGeometryToken(word.text)}@${word.bbox.x0},${word.bbox.y0}-${word.bbox.x1},${word.bbox.y1}`;
}

function diagnosticWords(words: OcrWord[], pattern: RegExp, limit = 12) {
  return words
    .filter((word) => pattern.test(normalizeGeometryToken(word.text)))
    .slice(0, limit)
    .map(compactWordPosition);
}

function diagnosticTokenTexts(words: OcrWord[], pattern: RegExp, limit = 10) {
  return words
    .map((word) => normalizeGeometryToken(word.text))
    .filter((text) => pattern.test(text))
    .slice(0, limit);
}

function textRegionMetrics(words: OcrWord[], documentWidth = 0, documentHeight = 0) {
  const usefulWords = words.filter((word) => {
    const text = normalizeGeometryToken(word.text);

    return text.length > 1 && word.confidence >= 10 && !/^[^\w$]+$/.test(text);
  });
  const textLikeWords = usefulWords.filter((word) =>
    /[A-Za-z0-9]/.test(normalizeGeometryToken(word.text))
  );
  const heights = textLikeWords.map(wordHeight);
  const highConfidenceWords = textLikeWords.filter((word) => word.confidence >= 60);
  const x0 =
    textLikeWords.length > 0 ? Math.min(...textLikeWords.map((word) => word.bbox.x0)) : 0;
  const y0 =
    textLikeWords.length > 0 ? Math.min(...textLikeWords.map((word) => word.bbox.y0)) : 0;
  const x1 =
    textLikeWords.length > 0 ? Math.max(...textLikeWords.map((word) => word.bbox.x1)) : 0;
  const y1 =
    textLikeWords.length > 0 ? Math.max(...textLikeWords.map((word) => word.bbox.y1)) : 0;
  const textArea = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const documentArea = Math.max(1, documentWidth * documentHeight);

  return {
    wordCount: textLikeWords.length,
    highConfidenceWordCount: highConfidenceWords.length,
    medianWordHeight: Math.round(median(heights) * 10) / 10,
    averageWordConfidence:
      textLikeWords.length > 0
        ? Math.round(
            (textLikeWords.reduce((total, word) => total + word.confidence, 0) /
              textLikeWords.length) *
              10
          ) / 10
        : 0,
    textRegionBounds:
      textLikeWords.length > 0
        ? {
            x0,
            y0,
            x1,
            y1,
          }
        : null,
    textRegionAreaRatio: Math.round((textArea / documentArea) * 1000) / 1000,
    sourcePixelsPerDocumentHeight: documentHeight,
  };
}

function candidateTokenSummary(attempt: OcrAttempt) {
  const words = attempt.words;

  return {
    invoiceLike: diagnosticTokenTexts(
      words,
      /\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/i
    ),
    dates: diagnosticTokenTexts(
      words,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/
    ),
    units: diagnosticTokenTexts(words, /\b[A-Z][0-9O]{2}[A-Z]?\b/i),
    amounts: diagnosticTokenTexts(
      words,
      /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\.\d{2}\b/
    ),
  };
}

function wordCenterX(word: OcrWord) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function boxesIntersect(first: ImageBounds, second: ImageBounds) {
  return (
    first.left < second.left + second.width &&
    first.left + first.width > second.left &&
    first.top < second.top + second.height &&
    first.top + first.height > second.top
  );
}

function wordBounds(word: OcrWord): ImageBounds {
  return {
    left: word.bbox.x0,
    top: word.bbox.y0,
    width: Math.max(1, word.bbox.x1 - word.bbox.x0),
    height: Math.max(1, word.bbox.y1 - word.bbox.y0),
  };
}

function estimateInvoiceColumnBounds(
  words: OcrWord[],
  rows: GeometricRow[],
  documentWidth: number,
  documentHeight: number
): ImageBounds {
  const normalizedWords = words.map((word) => ({
    word,
    text: normalizeGeometryToken(word.text).toLowerCase(),
  }));
  const invoiceHeader = normalizedWords.find(({ text }) =>
    /^invoice\b|^mvoice\b|^nv[o0]?ice\b/.test(text)
  )?.word;
  const dateHeader = normalizedWords
    .filter(({ text }) => /^date\b|^vate\b/.test(text))
    .map(({ word }) => word)
    .find((word) => invoiceHeader && wordCenterX(word) > wordCenterX(invoiceHeader));
  const invoiceTokens = words.filter((word) =>
    /\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/i.test(
      normalizeGeometryToken(word.text)
    )
  );
  const unitTokens = words.filter((word) =>
    /\b[A-Z][0-9O]{2}[A-Z]?\b/i.test(normalizeGeometryToken(word.text))
  );
  const rowTop =
    rows.length > 0
      ? Math.max(0, Math.min(...rows.map((row) => row.y - row.height * 2)))
      : Math.round(documentHeight * 0.18);
  const rowBottom =
    rows.length > 0
      ? Math.min(documentHeight, Math.max(...rows.map((row) => row.y + row.height * 2)))
      : Math.round(documentHeight * 0.72);
  let left = Math.round(documentWidth * 0.3);
  let right = Math.round(documentWidth * 0.47);

  if (invoiceHeader) {
    left = Math.max(0, invoiceHeader.bbox.x0 - Math.round(documentWidth * 0.015));
    right = dateHeader
      ? Math.max(left + 40, dateHeader.bbox.x0 - Math.round(documentWidth * 0.01))
      : Math.min(documentWidth, invoiceHeader.bbox.x1 + Math.round(documentWidth * 0.13));
  } else if (invoiceTokens.length > 0) {
    left = Math.max(0, Math.min(...invoiceTokens.map((word) => word.bbox.x0)) - 24);
    right = Math.min(
      documentWidth,
      Math.max(...invoiceTokens.map((word) => word.bbox.x1)) + 34
    );
  } else if (unitTokens.length > 0) {
    const medianUnitX = median(unitTokens.map(wordCenterX));
    left = Math.max(0, Math.round(medianUnitX + documentWidth * 0.035));
    right = Math.min(documentWidth, Math.round(left + documentWidth * 0.17));
  }

  return {
    left: Math.max(0, Math.min(left, documentWidth - 1)),
    top: Math.max(0, Math.round(rowTop - documentHeight * 0.025)),
    width: Math.max(40, Math.min(documentWidth - left, right - left)),
    height: Math.max(40, Math.min(documentHeight - rowTop, rowBottom - rowTop + documentHeight * 0.05)),
  };
}

async function imageDetailMetrics(input: Buffer) {
  const scan = await sharp(input, { limitInputPixels: 48_000_000 })
    .resize({
      width: 520,
      height: 520,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = scan.info.width;
  const height = scan.info.height;
  const pixels = scan.data;
  let total = 0;
  let totalSquared = 0;

  for (const value of pixels) {
    total += value;
    totalSquared += value * value;
  }

  const count = Math.max(width * height, 1);
  const brightness = total / count;
  const contrast = Math.sqrt(Math.max(totalSquared / count - brightness * brightness, 0));
  let laplacianTotal = 0;
  let laplacianCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = pixels[y * width + x] ?? 0;
      const laplacian = Math.abs(
        (pixels[(y - 1) * width + x] ?? center) +
          (pixels[(y + 1) * width + x] ?? center) +
          (pixels[y * width + x - 1] ?? center) +
          (pixels[y * width + x + 1] ?? center) -
          center * 4
      );

      laplacianTotal += laplacian;
      laplacianCount += 1;
    }
  }

  return {
    contrast: Math.round(contrast * 10) / 10,
    sharpness: Math.round((laplacianTotal / Math.max(laplacianCount, 1)) * 10) / 10,
  };
}

function buildGeometryAttempt(attempts: OcrAttempt[], baseText: string): OcrAttempt | null {
  const bestAttemptByRegion = Array.from(
    attempts
      .filter((attempt) => attempt.rotation === 0 && attempt.words.length > 0)
      .reduce((map, attempt) => {
        const current = map.get(attempt.region);

        if (!current || candidateStructureScore(attempt) > candidateStructureScore(current)) {
          map.set(attempt.region, attempt);
        }

        return map;
      }, new Map<string, OcrAttempt>())
      .values()
  );
  const rowWords = bestAttemptByRegion
    .filter((attempt) => /full-document|stub-(?:row|invoice|description|amount)/i.test(attempt.region))
    .flatMap((attempt) => attempt.words);
  const rows = reconstructRowsFromOcrGeometry(rowWords);

  if (rows.length === 0) {
    return null;
  }

  const geometryText = rows.map((row) => row.text).join("\n");
  const mergedText = [baseText, "--- OCR GEOMETRIC ROWS ---", geometryText]
    .filter(Boolean)
    .join("\n\n");
  const confidence =
    rowWords.reduce((total, word) => total + word.confidence, 0) /
    Math.max(rowWords.length, 1);

  return {
    region: "geometric-row-reconstruction",
    variant: "row-focused",
    pageMode: "sparse-text",
    rotation: 0,
    text: mergedText,
    confidence,
    score: scoreOcrText(mergedText, confidence),
    durationMs: 0,
    words: rowWords,
  };
}

function classifyGeometryWord(word: OcrWord, documentWidth = 0) {
  const text = normalizeGeometryToken(word.text);
  const lower = text.toLowerCase();
  const xCenter = (word.bbox.x0 + word.bbox.x1) / 2;
  const xRatio = documentWidth > 0 ? xCenter / documentWidth : 0;

  if (/\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/i.test(text)) {
    return "invoice number";
  }

  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/.test(text)) {
    return "date";
  }

  if (/\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\.\d{2}\b/i.test(text)) {
    return "amount";
  }

  if (/\b[A-Z][0-9O]{2}[A-Z]?\b/i.test(text)) {
    return "unit";
  }

  if (/north|creek|apart|property/.test(lower) || xRatio < 0.24) {
    return "property";
  }

  if (/serv|paint/.test(lower) && xRatio < 0.42) {
    return "account";
  }

  if (/\b(?:full|interior|paint|cabinet|primer|repair|clean|turn)\b/i.test(text)) {
    return "description";
  }

  return "unclassified";
}

function rowAcceptance(row: GeometricRow) {
  const parsed = parseCheckStubText(row.text).lines[0] ?? null;

  if (!parsed) {
    return {
      accepted: false,
      rejectionReason: "No remittance line parsed from reconstructed row text.",
      amount: 0,
      invoiceNumbers: [] as string[],
      unitCodes: [] as string[],
    };
  }

  const hasInvoiceOrUnit = parsed.invoiceNumbers.length > 0 || parsed.unitCodes.length > 0;
  const hasWorkContext = /\b(?:full|interior|paint|cabinet|primer|repair|clean|turn)\b/i.test(
    `${parsed.text} ${parsed.serviceDescription}`
  );

  if (parsed.amount <= 0) {
    return {
      accepted: false,
      rejectionReason: "Amount not recognized on this row.",
      amount: parsed.amount,
      invoiceNumbers: parsed.invoiceNumbers,
      unitCodes: parsed.unitCodes,
    };
  }

  if (!hasInvoiceOrUnit) {
    return {
      accepted: false,
      rejectionReason: "No invoice number or unit identifier recognized on this row.",
      amount: parsed.amount,
      invoiceNumbers: parsed.invoiceNumbers,
      unitCodes: parsed.unitCodes,
    };
  }

  if (!hasWorkContext) {
    return {
      accepted: false,
      rejectionReason: "Work description context was not recognized on this row.",
      amount: parsed.amount,
      invoiceNumbers: parsed.invoiceNumbers,
      unitCodes: parsed.unitCodes,
    };
  }

  return {
    accepted: true,
    rejectionReason: "",
    amount: parsed.amount,
    invoiceNumbers: parsed.invoiceNumbers,
    unitCodes: parsed.unitCodes,
  };
}

function geometryAmountCandidates(row: GeometricRow) {
  const candidates = extractMoneyCandidates(row.text);
  const selectedValue = rowAcceptance(row).amount;

  return candidates.map((candidate) => {
    const matchingWords = row.words.filter((word) => {
      const token = normalizeGeometryToken(word.text);
      const value = extractMoneyCandidates(token)[0]?.value ?? 0;

      return value > 0 && Math.abs(value - candidate.value) < 0.01;
    });
    const x0 =
      matchingWords.length > 0
        ? Math.min(...matchingWords.map((word) => word.bbox.x0))
        : undefined;
    const x1 =
      matchingWords.length > 0
        ? Math.max(...matchingWords.map((word) => word.bbox.x1))
        : undefined;
    const confidence =
      matchingWords.length > 0
        ? Math.round(
            matchingWords.reduce((total, word) => total + word.confidence, 0) /
              matchingWords.length
          )
        : undefined;

    return {
      raw: candidate.raw,
      normalized: candidate.normalized,
      value: candidate.value,
      score: candidate.score,
      selected: Math.abs(candidate.value - selectedValue) < 0.01,
      reason:
        Math.abs(candidate.value - selectedValue) < 0.01
          ? "selected as strongest complete row amount"
          : "lower-scored or fragment candidate",
      bbox:
        x0 !== undefined && x1 !== undefined
          ? {
              x0,
              y0: Math.min(...matchingWords.map((word) => word.bbox.y0)),
              x1,
              y1: Math.max(...matchingWords.map((word) => word.bbox.y1)),
            }
          : undefined,
      confidence,
    };
  });
}

function geometryRowDetails(rows: GeometricRow[], documentWidth = 0) {
  return rows.map((row) => {
    const acceptance = rowAcceptance(row);

    return {
      y: row.y,
      height: row.height,
      score: row.score,
      reconstructedText: row.text,
      accepted: acceptance.accepted,
      rejectionReason: acceptance.rejectionReason,
      amount: acceptance.amount,
      amountCandidates: geometryAmountCandidates(row),
      invoiceNumbers: acceptance.invoiceNumbers,
      unitCodes: acceptance.unitCodes,
      tokens: row.words.map((word) => ({
        text: normalizeGeometryToken(word.text),
        field: classifyGeometryWord(word, documentWidth),
        confidence: Math.round(word.confidence),
        bbox: word.bbox,
        region: word.region,
        variant: word.variant,
        pageMode: word.pageMode,
      })),
    };
  });
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
      bounds: {
        left: 0,
        top: 0,
        width: sources.document.width ?? 0,
        height: sources.document.height ?? 0,
      },
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
        parsed.lines.filter(isStructurallyUsefulRow).length < 2
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
        const processedMetadata = await imageMetadata(image);
        markStage(`preprocessed:${attemptStage}`);
        const recognizeStartedAt = Date.now();
        const recognition = worker.recognize(image, {}, { text: true, blocks: true });
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
        const words = extractOcrWords(
          result.data,
          source,
          processedMetadata.width ?? source.width ?? 0,
          processedMetadata.height ?? source.height ?? 0,
          spec,
          rotation
        );
        const attempt = {
          region: source.name,
          variant: spec.variant,
          pageMode: spec.pageMode.name,
          rotation,
          text,
          confidence,
          score: scoreOcrText(text, confidence),
          durationMs: Date.now() - recognizeStartedAt,
          imageWidth: source.width,
          imageHeight: source.height,
          words,
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
        const validRows = parsed.lines.filter(isStructurallyUsefulRow);

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
        durationMs: structurallyUsefulRegionAttempts.reduce(
          (total, attempt) => total + attempt.durationMs,
          0
        ),
        imageWidth: sources.document.width,
        imageHeight: sources.document.height,
        words: structurallyUsefulRegionAttempts.flatMap((attempt) => attempt.words),
      };

      attempts.push(mergedAttempt);
      attempts.sort(
        (left, right) =>
          candidateStructureScore(right) - candidateStructureScore(left)
      );
    }

    attempts.sort(
      (left, right) =>
        candidateStructureScore(right) - candidateStructureScore(left)
    );
    const bestTextBeforeGeometry = attempts[0]?.text ?? "";
    const geometricAttempt = buildGeometryAttempt(attempts, bestTextBeforeGeometry);

    if (geometricAttempt) {
      attempts.push(geometricAttempt);
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
      durationMs: attempt.durationMs,
      imageWidth: attempt.imageWidth,
      imageHeight: attempt.imageHeight,
      confidence: attempt.confidence,
      score: Math.round(candidateStructureScore(attempt)),
      validRows: structurallyValidRemittanceRows(attempt.text).length,
      tokens: candidateTokenSummary(attempt),
      summary: redactedTextSummary(attempt.text),
    }));
    const finalText = selected?.text ?? "";
    const diagnosticWordSource = selected?.region === "geometric-row-reconstruction"
      ? selected.words
      : attempts
          .filter((attempt) => attempt.rotation === 0 && attempt.words.length > 0)
          .slice(0, 6)
          .flatMap((attempt) => attempt.words);
    const geometricRows = reconstructRowsFromOcrGeometry(diagnosticWordSource).slice(
      0,
      12
    );
    const geometricRowDetails = geometryRowDetails(
      geometricRows,
      sources.document.width ?? 0
    );
    const documentWidth = sources.document.width ?? 0;
    const documentHeight = sources.document.height ?? 0;

    async function buildInvoiceColumnDiagnostics(): Promise<InvoiceColumnDiagnostics | null> {
      if (
        documentType !== "remittance_stub" ||
        documentWidth <= 0 ||
        documentHeight <= 0
      ) {
        return null;
      }

      const bounds = estimateInvoiceColumnBounds(
        diagnosticWordSource,
        geometricRows,
        documentWidth,
        documentHeight
      );
      const columnImage = await cropImageRegion(sources.document.image, bounds);
      const columnMetadata = await imageMetadata(columnImage);
      const detailMetrics = await imageDetailMetrics(columnImage);
      const columnBox = bounds;
      const candidateRows = geometricRows.slice(0, 5);
      const rowBands = candidateRows.map((row, index) => {
        const bandHeight = Math.max(row.height * 2.4, 32);
        const rowBox: ImageBounds = {
          left: columnBox.left,
          top: Math.max(0, Math.round(row.y - bandHeight / 2)),
          width: columnBox.width,
          height: Math.round(bandHeight),
        };
        const tokens = diagnosticWordSource
          .filter((word) => boxesIntersect(wordBounds(word), rowBox))
          .sort((left, right) => left.bbox.x0 - right.bbox.x0)
          .map((word) => ({
            text: normalizeGeometryToken(word.text),
            confidence: Math.round(word.confidence),
            bbox: word.bbox,
            region: word.region,
            variant: word.variant,
            pageMode: word.pageMode,
          }));

        return {
          row: index + 1,
          y: row.y,
          height: row.height,
          sourceText: row.text,
          tokens,
        };
      });
      const estimatedCharacterHeight =
        rowBands.flatMap((row) =>
          row.tokens.map((token) =>
            Math.max(1, (token.bbox.y1 ?? 0) - (token.bbox.y0 ?? 0))
          )
        );
      const attemptsForDiagnostics: InvoiceColumnDiagnosticAttempt[] = [];
      const diagnosticSpecs: OcrAttemptSpec[] = [
        {
          variant: "row-focused",
          pageMode: { name: "single-block", value: Tesseract.PSM.SINGLE_BLOCK },
        },
        {
          variant: "sharpened",
          pageMode: { name: "sparse-text", value: Tesseract.PSM.SPARSE_TEXT },
        },
      ];
      let skippedReason = "";

      for (const spec of diagnosticSpecs) {
        if (Date.now() - startedAt > 55_000) {
          skippedReason = "Skipped remaining invoice-column OCR because route time budget was nearly exhausted.";
          break;
        }

        await worker.setParameters({
          tessedit_pageseg_mode: spec.pageMode.value,
        });

        const attemptStartedAt = Date.now();
        const processedImage = await preprocessForOcr(columnImage, 0, spec.variant);
        const processedMetadata = await imageMetadata(processedImage);
        let diagnosticTimeout: ReturnType<typeof setTimeout> | null = null;

        try {
          const result = await Promise.race([
            worker.recognize(processedImage, {}, { text: true, blocks: true }),
            new Promise<never>((_, reject) => {
              diagnosticTimeout = setTimeout(
                () => reject(new Error("Invoice-column diagnostic OCR timed out.")),
                3_500
              );
            }),
          ]);
          const source: OcrImageSource = {
            name: "invoice-column-diagnostic",
            image: columnImage,
            width: columnMetadata.width,
            height: columnMetadata.height,
            bounds,
          };
          const words = extractOcrWords(
            result.data,
            source,
            processedMetadata.width ?? columnMetadata.width ?? 0,
            processedMetadata.height ?? columnMetadata.height ?? 0,
            spec,
            0
          );
          const confidence =
            typeof result.data.confidence === "number" ? result.data.confidence : 0;

          attemptsForDiagnostics.push({
            variant: spec.variant,
            pageMode: spec.pageMode.name,
            scaling: `${columnMetadata.width ?? bounds.width}x${columnMetadata.height ?? bounds.height} -> ${processedMetadata.width ?? "?"}x${processedMetadata.height ?? "?"}`,
            durationMs: Date.now() - attemptStartedAt,
            confidence,
            rawText: redactedTextSummary(result.data.text ?? ""),
            invoiceLikeTokens: candidateTokenSummary({
              region: "invoice-column-diagnostic",
              variant: spec.variant,
              pageMode: spec.pageMode.name,
              rotation: 0,
              text: result.data.text ?? "",
              confidence,
              score: 0,
              durationMs: Date.now() - attemptStartedAt,
              imageWidth: columnMetadata.width,
              imageHeight: columnMetadata.height,
              words,
            }).invoiceLike,
            words: words.slice(0, 30).map((word) => ({
              text: normalizeGeometryToken(word.text),
              confidence: Math.round(word.confidence),
              bbox: word.bbox,
            })),
          });
        } catch (error) {
          skippedReason =
            error instanceof Error
              ? error.message
              : "Invoice-column diagnostic OCR failed.";
        } finally {
          if (diagnosticTimeout) {
            clearTimeout(diagnosticTimeout);
          }
        }
      }

      markStage("invoice-column-diagnostics");

      return {
        bounds,
        width: columnMetadata.width ?? bounds.width,
        height: columnMetadata.height ?? bounds.height,
        estimatedCharacterHeight:
          Math.round(median(estimatedCharacterHeight) * 10) / 10,
        sharpness: detailMetrics.sharpness,
        contrast: detailMetrics.contrast,
        rowBands,
        attempts: attemptsForDiagnostics,
        skippedReason,
      };
    }

    const invoiceColumnDiagnostics = await buildInvoiceColumnDiagnostics();

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
        textRegionMetrics: textRegionMetrics(
          diagnosticWordSource,
          sources.document.width ?? 0,
          sources.document.height ?? 0
        ),
        geometryTokenSummaries: {
          invoiceLike: diagnosticWords(
            diagnosticWordSource,
            /\b[Il1|]?NV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoSsZzIl|Vv]{3,8}\b/i
          ),
          unitLike: diagnosticWords(diagnosticWordSource, /\b[A-Z][0-9O]{2}[A-Z]?\b/i),
          dates: diagnosticWords(
            diagnosticWordSource,
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/
          ),
          amounts: diagnosticWords(
            diagnosticWordSource,
            /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\.\d{2}\b/
          ),
        },
        geometricRows: geometricRows.map((row) => ({
          y: row.y,
          height: row.height,
          score: row.score,
          text: row.text,
        })),
        geometricRowDetails,
        invoiceColumnDiagnostics,
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
      rawText: parsedText,
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
