import type { Metadata } from "next";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}