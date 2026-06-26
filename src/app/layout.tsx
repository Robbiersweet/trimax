import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import AuthGuard from "./components/AuthGuard";
import PwaRegistration from "./components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Trimax",
  title: "Trimax Operations Platform",
  description:
    "Operations, estimating, invoicing, workflow management, and scheduling for R&L Creations and JUST KLEEN.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trimax",
  },
  icons: {
    icon: [
      { url: "/trimax-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/trimax-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

function isPrintDocumentPath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return (
    /^\/invoices\/[^/]+\/print(?:\/)?$/.test(pathname) ||
    /^\/estimates\/[^/]+\/print(?:\/)?$/.test(pathname)
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-trimax-pathname");
  const isPrintDocument = isPrintDocumentPath(pathname);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = window.localStorage.getItem("trimax-theme");
                if (theme !== "dark") {
                  document.documentElement.dataset.theme = "light";
                  document.documentElement.classList.add("theme-light");
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        {isPrintDocument ? (
          children
        ) : (
          <>
            <PwaRegistration />
            <Suspense
              fallback={
                <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950">
                  <p className="text-slate-600">
                    Opening workspace...
                  </p>
                </main>
              }
            >
              <AuthGuard>{children}</AuthGuard>
            </Suspense>
          </>
        )}
      </body>
    </html>
  );
}
