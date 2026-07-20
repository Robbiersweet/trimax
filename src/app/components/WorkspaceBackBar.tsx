"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BackButton from "./BackButton";

type SectionContext = {
  fallback: string;
};

const sectionContexts: Record<string, SectionContext> = {
  activity: { fallback: "/" },
  clients: { fallback: "/clients" },
  estimates: { fallback: "/estimates" },
  imports: { fallback: "/" },
  invoices: { fallback: "/invoices" },
  "job-sessions": { fallback: "/" },
  technician: { fallback: "/technician" },
  payments: { fallback: "/payments" },
  "property-intelligence": { fallback: "/queue" },
  "property-sales": { fallback: "/" },
  queue: { fallback: "/queue" },
  reports: { fallback: "/" },
  schedule: { fallback: "/" },
  services: { fallback: "/" },
  settings: { fallback: "/" },
};

const primaryWorkspaceSections = new Set([
  "activity",
  "clients",
  "estimates",
  "imports",
  "invoices",
  "job-sessions",
  "payments",
  "property-sales",
  "queue",
  "reports",
  "schedule",
  "services",
  "settings",
  "technician",
]);

function withBusiness(href: string, business: string) {
  const [pathAndQuery, hash] = href.split("#");
  const joiner = pathAndQuery.includes("?") ? "&" : "?";
  const route = `${pathAndQuery}${joiner}business=${encodeURIComponent(business)}`;

  return hash ? `${route}#${hash}` : route;
}

function fallbackForPath(pathname: string, business: string) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] ?? "";

  if (pathname === "/" || !section) {
    return withBusiness("/", business);
  }

  return withBusiness(sectionContexts[section]?.fallback ?? "/", business);
}

function shouldHideFloatingBack(pathname: string, hash: string) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] ?? "";

  if (pathname === "/payments" && hash.length > 0) {
    return false;
  }

  return (
    pathname === "/" ||
    parts.length === 0 ||
    (parts.length === 1 && primaryWorkspaceSections.has(section))
  );
}

function shouldPreferParentRoute(pathname: string, hash: string) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] ?? "";

  return (
    (["queue", "invoices", "estimates"].includes(section) &&
      parts.length > 1) ||
    (pathname === "/payments" && hash.length > 0)
  );
}

export default function WorkspaceBackBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");
  const business = searchParams.get("business") ?? "rnl-creations";

  useEffect(() => {
    function updateHash() {
      setHash(window.location.hash);
    }

    updateHash();
    window.addEventListener("hashchange", updateHash);

    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  if (shouldHideFloatingBack(pathname, hash)) {
    return null;
  }

  return (
    <div
      className="app-floating-back-control pointer-events-auto fixed z-[70]"
      data-floating-back-control="true"
      style={{
        right: "max(1rem, env(safe-area-inset-right, 0px))",
        bottom: "calc(5.6rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <BackButton
        label="Back"
        fallbackHref={fallbackForPath(pathname, business)}
        preferFallback={shouldPreferParentRoute(pathname, hash)}
        variant="floating"
      />
    </div>
  );
}
