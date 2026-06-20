"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import BackButton from "./BackButton";

type SectionContext = {
  fallback: string;
  label: string;
  actionLabel: string;
  actionHref: string;
};

const sectionContexts: Record<string, SectionContext> = {
  activity: {
    fallback: "/",
    label: "Activity Trail",
    actionLabel: "Dashboard",
    actionHref: "/",
  },
  clients: {
    fallback: "/clients",
    label: "Client Workspace",
    actionLabel: "All Clients",
    actionHref: "/clients",
  },
  estimates: {
    fallback: "/estimates",
    label: "Estimate Workspace",
    actionLabel: "New Estimate",
    actionHref: "/estimates/new",
  },
  imports: {
    fallback: "/",
    label: "Import Center",
    actionLabel: "Dashboard",
    actionHref: "/",
  },
  invoices: {
    fallback: "/invoices",
    label: "Invoice Workspace",
    actionLabel: "New Invoice",
    actionHref: "/invoices/new",
  },
  "job-sessions": {
    fallback: "/",
    label: "Job Sessions",
    actionLabel: "Open Queue",
    actionHref: "/queue",
  },
  technician: {
    fallback: "/technician",
    label: "Technician Workbench",
    actionLabel: "Open Queue",
    actionHref: "/queue",
  },
  payments: {
    fallback: "/",
    label: "Payments",
    actionLabel: "Capture Check",
    actionHref: "/payments#check-capture",
  },
  "property-intelligence": {
    fallback: "/queue",
    label: "Property Intelligence",
    actionLabel: "Queue",
    actionHref: "/queue",
  },
  "property-sales": {
    fallback: "/",
    label: "Property Sales",
    actionLabel: "Demo Mode",
    actionHref: "/property-sales?demo=evergreen",
  },
  queue: {
    fallback: "/queue",
    label: "Work Queue",
    actionLabel: "New Queue Item",
    actionHref: "/new-request",
  },
  reports: {
    fallback: "/",
    label: "Reports",
    actionLabel: "Dashboard",
    actionHref: "/",
  },
  schedule: {
    fallback: "/",
    label: "Schedule",
    actionLabel: "Ready Work",
    actionHref: "/queue?view=ready-soon",
  },
  services: {
    fallback: "/",
    label: "Services",
    actionLabel: "Dashboard",
    actionHref: "/",
  },
  settings: {
    fallback: "/",
    label: "Settings",
    actionLabel: "Email Setup",
    actionHref: "/settings#outlook-integration",
  },
};

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

  const baseFallback = sectionContexts[section]?.fallback ?? "/";

  if (parts.length <= 1 && baseFallback === `/${section}`) {
    return withBusiness("/", business);
  }

  return withBusiness(baseFallback, business);
}

function contextForPath(pathname: string, business: string) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] ?? "";
  const context = sectionContexts[section] ?? {
    fallback: "/",
    label: "Trimax Workspace",
    actionLabel: "Dashboard",
    actionHref: "/",
  };
  const isDetailPage = parts.length > 1;
  const detailLabel = isDetailPage ? "Detail view" : "Section home";

  return {
    ...context,
    actionHref: withBusiness(context.actionHref, business),
    detailLabel,
  };
}

export default function WorkspaceBackBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const business = searchParams.get("business") ?? "rnl-creations";
  const shouldHide = pathname === "/";
  const context = contextForPath(pathname, business);

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
      <div className="app-workspace-context flex min-w-0 flex-1 items-center justify-between gap-3 sm:justify-end">
        <div className="app-workspace-context-copy min-w-0 text-right">
          <p className="app-workspace-context-label truncate text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            <span className="app-workspace-context-dot" aria-hidden="true" />
            {context.label}
          </p>
          <p className="app-workspace-back-hint text-xs font-bold text-zinc-500">
            {context.detailLabel} / Back returns to your previous Trimax screen.
          </p>
        </div>
        <Link
          href={context.actionHref}
          className="app-workspace-back-action rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-sky-100 transition hover:-translate-y-0.5 hover:border-sky-300/50 hover:text-white"
        >
          {context.actionLabel}
        </Link>
      </div>
    </div>
  );
}
