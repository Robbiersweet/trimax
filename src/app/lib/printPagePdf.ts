import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { Page } from "puppeteer-core";
import type { EmailAttachment } from "./pdfAttachments";

const PDF_READY_SELECTOR = '[data-pdf-ready="true"]';
const PRINT_READY_SELECTOR = [
  PDF_READY_SELECTOR,
  ".standard-invoice-print",
  ".standard-estimate-print",
].join(", ");

type PrintPagePdfDiagnostics = {
  traceId?: string | null;
  documentId?: string | null;
  businessId?: string | null;
  userId?: string | null;
};

function safeFileName(value: string) {
  const safeValue = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeValue || "trimax-document";
}

function localChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  return candidates.find(Boolean);
}

export async function createPrintPagePdfAttachment({
  url,
  filename,
  accessToken,
  cronSecret,
  diagnostics,
}: {
  url: string;
  filename: string;
  accessToken?: string | null;
  cronSecret?: string | null;
  diagnostics?: PrintPagePdfDiagnostics;
}): Promise<EmailAttachment> {
  const isProduction = process.env.NODE_ENV === "production";
  const executablePath = isProduction
    ? await chromium.executablePath()
    : localChromePath() || (await chromium.executablePath());
  const browser = await puppeteer.launch({
    args: isProduction
      ? chromium.args
      : ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: {
      width: 1280,
      height: 1600,
      deviceScaleFactor: 1,
    },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text().slice(0, 500));
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500)
      );
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.failure()?.errorText ?? "failed"} ${request.url()}`.slice(
          0,
          500
        )
      );
    });

    if (accessToken) {
      await page.setExtraHTTPHeaders({
        Authorization: `Bearer ${accessToken}`,
      });
    } else if (cronSecret) {
      await page.setExtraHTTPHeaders({
        "x-trimax-cron-secret": cronSecret,
      });
    }

    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 45_000,
    });
    const finalUrl = page.url();

    if (!response?.ok()) {
      await logPrintPageDiagnostics({
        page,
        requestedUrl: url,
        finalUrl,
        status: response?.status() ?? null,
        diagnostics,
        consoleErrors,
        failedRequests,
        reason: "non_ok_response",
      });
      throw new Error(
        `Print page returned ${response?.status() ?? "no response"}.`
      );
    }

    const pageText = await page.evaluate(() => document.body.innerText);

    if (
      pageText.includes("Opening workspace") ||
      pageText.includes("Selected business was not found") ||
      pageText.includes("Invoice not found") ||
      pageText.includes("Estimate not found")
    ) {
      await logPrintPageDiagnostics({
        page,
        requestedUrl: url,
        finalUrl,
        status: response.status(),
        diagnostics,
        consoleErrors,
        failedRequests,
        reason: "customer_document_not_rendered",
      });
      throw new Error("Print page did not render the customer document.");
    }

    try {
      await page.waitForSelector(PRINT_READY_SELECTOR, {
        timeout: 20_000,
      });
      const hasCanonicalReadyMarker = await page.evaluate((selector) => {
        return Boolean(document.querySelector(selector));
      }, PDF_READY_SELECTOR);

      if (!hasCanonicalReadyMarker) {
        console.warn("[Trimax PDF render compatibility selector used]", {
          traceId: diagnostics?.traceId ?? null,
          documentId: diagnostics?.documentId ?? null,
          businessId: diagnostics?.businessId ?? null,
          requestedUrl: url,
          finalUrl,
        });
      }
    } catch (error) {
      await logPrintPageDiagnostics({
        page,
        requestedUrl: url,
        finalUrl,
        status: response.status(),
        diagnostics,
        consoleErrors,
        failedRequests,
        reason: "pdf_ready_selector_missing",
      });
      throw new Error(
        `Print page did not expose a print-ready marker (${PDF_READY_SELECTOR}). ${
          error instanceof Error ? error.message : ""
        }`.trim()
      );
    }
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: undefined,
    });

    return {
      filename: `${safeFileName(filename)}.pdf`,
      content: Buffer.from(pdf).toString("base64"),
    };
  } finally {
    await browser.close();
  }
}

async function logPrintPageDiagnostics({
  page,
  requestedUrl,
  finalUrl,
  status,
  diagnostics,
  consoleErrors,
  failedRequests,
  reason,
}: {
  page: Page;
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  diagnostics?: PrintPagePdfDiagnostics;
  consoleErrors: string[];
  failedRequests: string[];
  reason: string;
}) {
  const snapshot = await page
    .evaluate(() => {
      const bodyText = document.body?.innerText ?? "";
      const bodyHtml = document.body?.innerHTML ?? "";
      const hasPdfReady = Boolean(
        document.querySelector('[data-pdf-ready="true"]')
      );
      const hasStandardInvoice = Boolean(
        document.querySelector(".standard-invoice-print")
      );
      const hasStandardEstimate = Boolean(
        document.querySelector(".standard-estimate-print")
      );
      const detectedPageType = (() => {
        const text = bodyText.toLowerCase();

        if (hasPdfReady) {
          return "pdf-ready-document";
        }

        if (text.includes("login") || text.includes("sign in")) {
          return "login";
        }

        if (text.includes("unauthorized") || text.includes("forbidden")) {
          return "unauthorized";
        }

        if (text.includes("not found")) {
          return "not-found";
        }

        if (text.includes("opening workspace")) {
          return "workspace-loading";
        }

        if (!bodyText.trim() && !bodyHtml.trim()) {
          return "blank";
        }

        return "unknown";
      })();

      return {
        title: document.title,
        detectedPageType,
        hasPdfReady,
        hasStandardInvoice,
        hasStandardEstimate,
        bodyPreview: bodyText.replace(/\s+/g, " ").trim().slice(0, 700),
      };
    })
    .catch((error) => ({
      title: "",
      detectedPageType: "diagnostic-evaluation-failed",
      hasPdfReady: false,
      hasStandardInvoice: false,
      hasStandardEstimate: false,
      bodyPreview:
        error instanceof Error ? error.message.slice(0, 700) : "Unknown error",
    }));

  console.error("[Trimax PDF render diagnostics]", {
    reason,
    traceId: diagnostics?.traceId ?? null,
    documentId: diagnostics?.documentId ?? null,
    businessId: diagnostics?.businessId ?? null,
    initiatingUserId: diagnostics?.userId ?? null,
    requestedUrl,
    finalUrl,
    status,
    pageTitle: snapshot.title,
    detectedPageType: snapshot.detectedPageType,
    hasPdfReady: snapshot.hasPdfReady,
    hasStandardInvoice: snapshot.hasStandardInvoice,
    hasStandardEstimate: snapshot.hasStandardEstimate,
    consoleErrors: consoleErrors.slice(-10),
    failedRequests: failedRequests.slice(-10),
    bodyPreview: snapshot.bodyPreview,
  });
}
