import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

export async function renderStatementPdf(html: string) {
  const native = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(path => path && existsSync(path));
  const browser = await puppeteer.launch({
    executablePath: native ?? await chromium.executablePath(),
    args: native ? [] : chromium.args,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return Buffer.from(await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true }));
  } finally { await browser.close(); }
}
