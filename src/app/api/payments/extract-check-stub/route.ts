import { NextResponse } from "next/server";

type CheckStubLine = {
  property?: string;
  account?: string;
  invoiceDate?: string;
  description?: string;
  amount?: number;
};

type CheckStubExtraction = {
  rawText?: string;
  payor?: string;
  checkNumber?: string;
  checkDate?: string;
  totalAmount?: number;
  lines?: CheckStubLine[];
};

function isSafeDataUrl(value: unknown) {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) &&
    value.length < 12_000_000
  );
}

function toMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeExtraction(value: unknown): CheckStubExtraction {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const lines = Array.isArray(source.lines)
    ? source.lines
        .map((line) => {
          if (!line || typeof line !== "object") {
            return null;
          }

          const row = line as Record<string, unknown>;

          const normalizedLine: CheckStubLine = {
            property:
              typeof row.property === "string" ? row.property.trim() : "",
            account: typeof row.account === "string" ? row.account.trim() : "",
            invoiceDate:
              typeof row.invoiceDate === "string"
                ? row.invoiceDate.trim()
                : "",
            description:
              typeof row.description === "string"
                ? row.description.trim()
                : "",
            amount: toMoney(row.amount),
          };

          return normalizedLine;
        })
        .filter((line): line is CheckStubLine => Boolean(line))
    : [];

  return {
    rawText: typeof source.rawText === "string" ? source.rawText.trim() : "",
    payor: typeof source.payor === "string" ? source.payor.trim() : "",
    checkNumber:
      typeof source.checkNumber === "string"
        ? source.checkNumber.trim()
        : "",
    checkDate:
      typeof source.checkDate === "string" ? source.checkDate.trim() : "",
    totalAmount: toMoney(source.totalAmount),
    lines,
  };
}

function extractionToStubText(extraction: CheckStubExtraction) {
  const header = [
    extraction.checkDate ? `DATE: ${extraction.checkDate}` : "",
    extraction.checkNumber ? `CK#: ${extraction.checkNumber}` : "",
    typeof extraction.totalAmount === "number"
      ? `TOTAL: $${extraction.totalAmount.toFixed(2)}`
      : "",
    extraction.payor ? `PAYOR: ${extraction.payor}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lineText = (extraction.lines ?? [])
    .map((line) =>
      [
        line.property,
        line.account,
        line.invoiceDate,
        line.description,
        typeof line.amount === "number" ? `$${line.amount.toFixed(2)}` : "",
      ]
        .filter(Boolean)
        .join(" - ")
    )
    .filter(Boolean);

  return [header, ...lineText, extraction.rawText]
    .filter(Boolean)
    .join("\n");
}

function parseJsonOutput(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? trimmed;

  return JSON.parse(jsonText);
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Check photo reading is ready, but OPENAI_API_KEY is not connected on the server yet.",
      },
      { status: 503 }
    );
  }

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

  const model = process.env.TRIMAX_CHECK_OCR_MODEL ?? "gpt-5.5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Read this check remittance stub for apartment maintenance accounting. Return JSON only with keys rawText, payor, checkNumber, checkDate, totalAmount, and lines. Each line should include property, account, invoiceDate, description, and amount. Preserve unit codes like J08A or J08B exactly when visible. If a field is unclear, use an empty string or null.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    return NextResponse.json(
      {
        error:
          "Trimax could not read that check photo yet. Try a clearer photo or paste the stub text manually.",
        detail: detail.slice(0, 500),
      },
      { status: response.status }
    );
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ text?: string }>;
    }>;
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n") ??
    "";

  try {
    const extraction = normalizeExtraction(parseJsonOutput(outputText));

    return NextResponse.json({
      ...extraction,
      stubText: extractionToStubText(extraction),
    });
  } catch {
    return NextResponse.json({
      rawText: outputText,
      stubText: outputText,
      lines: [],
    });
  }
}
