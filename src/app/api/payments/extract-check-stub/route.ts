import { NextResponse } from "next/server";
import sharp from "sharp";
import { parseCheckStubText } from "@/app/lib/remittanceMatching";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000;
const OCR_ATTEMPT_TIMEOUT_MS = 12_000;
const GOOD_OCR_SCORE = 130;
const ROTATIONS = [0, 90, 180, 270] as const;

type OcrRotation = (typeof ROTATIONS)[number];

type OcrAttempt = {
  rotation: OcrRotation;
  text: string;
  confidence: number;
  score: number;
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

async function preprocessForOcr(input: Buffer, rotation: OcrRotation) {
  const normalized = sharp(input, { limitInputPixels: 48_000_000 })
    .rotate()
    .rotate(rotation)
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .linear(1.25, -16)
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return normalized;
}

function scoreOcrText(text: string, confidence: number) {
  const invoiceMatches =
    text.match(/\bINV(?:OICE)?\.?\s*[-#: ]?\s*[0-9OoIl|Vv]{3,8}\b/gi) ?? [];
  const currencyMatches =
    text.match(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g) ?? [];
  const parsed = parseCheckStubText(text);
  const fieldCount = [
    parsed.checkNumber,
    parsed.checkDate,
    parsed.payor,
    parsed.totalAmount > 0 ? String(parsed.totalAmount) : "",
    parsed.lines.some((line) => line.invoiceNumbers.length > 0) ? "invoice" : "",
  ].filter(Boolean).length;
  const keywordMatches =
    text.match(/\b(?:check|ck|date|total|amount|invoice|inv|payor|payer|property|customer|apartment|apartments)\b/gi) ??
    [];

  return (
    confidence +
    invoiceMatches.length * 35 +
    currencyMatches.length * 12 +
    fieldCount * 28 +
    Math.min(keywordMatches.length, 10) * 4 +
    Math.min(text.trim().length / 20, 20)
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
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      user_defined_dpi: "300",
    });

    const attempts: OcrAttempt[] = [];

    for (const rotation of ROTATIONS) {
      const image = await preprocessForOcr(originalImage, rotation);
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
        rotation,
        text,
        confidence,
        score: scoreOcrText(text, confidence),
      };

      attempts.push(attempt);

      if (rotation === 0 && shouldAcceptFirstPass(attempt)) {
        break;
      }

      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    attempts.sort((left, right) => right.score - left.score);

    return attempts[0]?.text ?? "";
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
