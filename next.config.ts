import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "sharp", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/invoices/[id]/send-email": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/estimates/[id]/send-email": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/invoices/send-overdue-reminders": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/payments/extract-check-stub": [
      "./node_modules/bmp-js/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
