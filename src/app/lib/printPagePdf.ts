import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { EmailAttachment } from "./pdfAttachments";

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
}: {
  url: string;
  filename: string;
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

    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 45_000,
    });

    if (!response?.ok()) {
      throw new Error(
        `Print page returned ${response?.status() ?? "no response"}.`
      );
    }

    await page.waitForSelector(
      ".standard-invoice-print, .standard-estimate-print",
      {
        timeout: 20_000,
      }
    );
    await page.emulateMediaType("print");
    const pageText = await page.evaluate(() => document.body.innerText);

    if (
      pageText.includes("Opening workspace") ||
      pageText.includes("Selected business was not found") ||
      pageText.includes("Invoice not found") ||
      pageText.includes("Estimate not found")
    ) {
      throw new Error("Print page did not render the customer document.");
    }

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
