"use client";

import { usePathname, useSearchParams } from "next/navigation";
import BackButton from "./BackButton";

const sectionFallbacks: Record<string, string> = {
  activity: "/",
  clients: "/clients",
  estimates: "/estimates",
  imports: "/",
  invoices: "/invoices",
  "job-sessions": "/",
  payments: "/",
  "property-intelligence": "/queue",
  queue: "/queue",
  reports: "/",
  schedule: "/",
  services: "/",
  settings: "/",
};

function withBusiness(href: string, business: string) {
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}business=${encodeURIComponent(business)}`;
}

function fallbackForPath(pathname: string, business: string) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] ?? "";

  if (pathname === "/" || !section) {
    return withBusiness("/", business);
  }

  const baseFallback = sectionFallbacks[section] ?? "/";

  if (parts.length <= 1 && baseFallback === `/${section}`) {
    return withBusiness("/", business);
  }

  return withBusiness(baseFallback, business);
}

export default function WorkspaceBackBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const business = searchParams.get("business") ?? "rnl-creations";
  const shouldHide = pathname === "/";

  if (shouldHide) {
    return null;
  }

  return (
    <div className="app-workspace-back-bar mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-black/20 px-3 py-3 backdrop-blur-xl">
      <BackButton
        label="Back"
        fallbackHref={fallbackForPath(pathname, business)}
        className="app-shell-back-button"
      />
      <p className="app-workspace-back-hint text-xs font-bold text-zinc-500">
        Returns to your previous Trimax screen when available.
      </p>
    </div>
  );
}
