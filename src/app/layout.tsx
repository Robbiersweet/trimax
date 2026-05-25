import { Suspense } from "react";
import type { Metadata } from "next";
import AuthGuard from "./components/AuthGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trimax Operations Platform",
  description:
    "Operations, estimating, invoicing, workflow management, and scheduling for R&L Creations and JUST KLEEN.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Suspense
          fallback={
            <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
              <p className="text-zinc-400">
                Opening workspace...
              </p>
            </main>
          }
        >
          <AuthGuard>{children}</AuthGuard>
        </Suspense>
      </body>
    </html>
  );
}
