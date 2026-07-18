import { NextResponse } from "next/server";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { parseCheckStubText } from "@/app/lib/remittanceMatching";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_DATA_URL_LENGTH = 12_000_000;
const OCR_TIMEOUT_MS = 45_000;

function isSafeDataUrl(value: unknown) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) &&
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

async function preprocessForOcr(input: Buffer) {
  return sharp(input, { limitInputPixels: 48_000_000 })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.1 })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function recognizeText(image: Buffer) {
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

    const recognition = worker.recognize(image, {}, { text: true });
    const result = await Promise.race([
      recognition,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Trimax could not finish reading that photo in time. Try a closer, brighter photo or paste the stub text manually."
              )
            ),
          OCR_TIMEOUT_MS
        );
      }),
    ]);

    return result.data.text.trim();
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
      {
        error:
          "Upload a clear PNG, JPG, or WebP image under the current size limit.",
      },
      { status: 400 }
    );
  }

  try {
    const originalImage = dataUrlToBuffer(imageDataUrl as string);
    const ocrImage = await preprocessForOcr(originalImage);
    const rawText = await recognizeText(ocrImage);

    if (!rawText) {
      return NextResponse.json({
        rawText: "",
        stubText: "",
        lines: [],
        error:
          "Owner Review Required. Trimax did not find readable printed text in that photo.",
      });
    }

    const extraction = parseCheckStubText(rawText);

    return NextResponse.json({
      ocrEngine: "tesseract.js",
      ...extraction,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Trimax could not read that photo. Paste the stub text manually.",
      },
      { status: 422 }
    );
  }
}
