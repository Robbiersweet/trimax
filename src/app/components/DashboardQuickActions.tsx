"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";
import {
  DashboardActionKey,
  canUseDashboardAction,
} from "../lib/rolePermissions";

type DashboardQuickActionsProps = {
  businessSlug: string;
};

type QuickActionIcon =
  | "queue"
  | "estimate"
  | "invoice"
  | "payment"
  | "review"
  | "reports"
  | "print";

type QuickAction = {
  key: DashboardActionKey;
  title: string;
  subtitle: string;
  href: string;
  label: string;
  icon: QuickActionIcon;
  tone: "queue" | "estimate" | "invoice" | "payment" | "review" | "reports" | "print";
};

function DashboardCommandIcon({ icon }: { icon: QuickActionIcon }) {
  const iconProps = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "queue":
      return (
        <svg {...iconProps}>
          <path d="M8 4h8" />
          <path d="M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9A1 1 0 0 1 8 5V3a1 1 0 0 1 1-1Z" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M8 11h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "estimate":
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...iconProps}>
          <path d="M5 3v18l3-2 3 2 3-2 3 2 2-1.33V3Z" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "payment":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10" />
          <path d="M15 9.5c-.42-.85-1.46-1.5-3-1.5-1.66 0-3 .9-3 2s1.34 2 3 2 3 .9 3 2-1.34 2-3 2c-1.54 0-2.58-.65-3-1.5" />
        </svg>
      );
    case "review":
      return (
        <svg {...iconProps}>
          <path d="m3.5 6 1.5 1.5L8 4.5" />
          <path d="M11 6h9" />
          <path d="m3.5 12 1.5 1.5L8 10.5" />
          <path d="M11 12h9" />
          <path d="m3.5 18 1.5 1.5L8 16.5" />
          <path d="M11 18h9" />
        </svg>
      );
    case "reports":
      return (
        <svg {...iconProps}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );
    case "print":
      return (
        <svg {...iconProps}>
          <path d="M6 9V3h12v6" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v7H6Z" />
          <path d="M17 12h.01" />
        </svg>
      );
  }
}

const actionTones: Record<
  QuickAction["tone"],
  {
    border: string;
    background: string;
    topGlow: string;
    rail: string;
    pill: string;
    glyph: string;
    hover: string;
  }
> = {
  queue: {
    border: "border-orange-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(249,115,22,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-orange-400/20",
    rail: "bg-orange-500",
    pill: "border-orange-500/40 bg-orange-500/15 text-orange-200",
    glyph: "border-orange-400/35 bg-orange-500/15 text-orange-100",
    hover: "hover:border-orange-400/70 hover:bg-orange-500/15",
  },
  estimate: {
    border: "border-violet-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(139,92,246,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-violet-400/20",
    rail: "bg-violet-500",
    pill: "border-violet-500/40 bg-violet-500/15 text-violet-200",
    glyph: "border-violet-400/35 bg-violet-500/15 text-violet-100",
    hover: "hover:border-violet-400/70 hover:bg-violet-500/15",
  },
  invoice: {
    border: "border-emerald-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-emerald-400/20",
    rail: "bg-emerald-500",
    pill: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    glyph: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
    hover: "hover:border-emerald-400/70 hover:bg-emerald-500/15",
  },
  payment: {
    border: "border-sky-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-sky-400/20",
    rail: "bg-sky-500",
    pill: "border-sky-500/40 bg-sky-500/15 text-sky-200",
    glyph: "border-sky-400/35 bg-sky-500/15 text-sky-100",
    hover: "hover:border-sky-400/70 hover:bg-sky-500/15",
  },
  review: {
    border: "border-amber-400/35",
    background:
      "bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-amber-300/20",
    rail: "bg-amber-400",
    pill: "border-amber-400/40 bg-amber-400/15 text-amber-100",
    glyph: "border-amber-300/35 bg-amber-400/15 text-amber-100",
    hover: "hover:border-amber-300/70 hover:bg-amber-400/15",
  },
  reports: {
    border: "border-fuchsia-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(217,70,239,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-fuchsia-400/20",
    rail: "bg-fuchsia-500",
    pill: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200",
    glyph: "border-fuchsia-400/35 bg-fuchsia-500/15 text-fuchsia-100",
    hover: "hover:border-fuchsia-400/70 hover:bg-fuchsia-500/15",
  },
  print: {
    border: "border-cyan-500/35",
    background:
      "bg-[linear-gradient(135deg,rgba(6,182,212,0.18),rgba(9,9,11,0.92)_58%)]",
    topGlow: "bg-cyan-400/20",
    rail: "bg-cyan-500",
    pill: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
    glyph: "border-cyan-400/35 bg-cyan-500/15 text-cyan-100",
    hover: "hover:border-cyan-400/70 hover:bg-cyan-500/15",
  },
};

export default function DashboardQuickActions({
  businessSlug,
}: DashboardQuickActionsProps) {
  const [role, setRole] =
    useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadRole() {
      const access = await loadWorkspaceAccess();
      const currentWorkspace = access.find(
        (workspace) =>
          workspace.businessSlug === businessSlug
      );

      if (!isMounted) {
        return;
      }

      setRole(currentWorkspace?.role ?? "owner");
      setIsLoading(false);
    }

    loadRole();

    return () => {
      isMounted = false;
    };
  }, [businessSlug]);

  const isJustKleen = businessSlug === "just-kleen";

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        key: "new_queue",
        title: isJustKleen ? "New Work Request" : "New Queue Item",
        subtitle: isJustKleen
          ? "Add cleaning job or customer request"
          : "Add apartment turn or property request",
        href: `/new-request?business=${businessSlug}`,
        label: isJustKleen ? "Work" : "Queue",
        icon: "queue",
        tone: "queue",
      },
      {
        key: "new_estimate",
        title: "New Estimate",
        subtitle: "Create a customer estimate",
        href: `/estimates/new?business=${businessSlug}`,
        label: "Estimate",
        icon: "estimate",
        tone: "estimate",
      },
      {
        key: "new_invoice",
        title: "New Invoice",
        subtitle: "Create invoice or deposit request",
        href: `/invoices/new?business=${businessSlug}`,
        label: "Invoice",
        icon: "invoice",
        tone: "invoice",
      },
      {
        key: "record_payment",
        title: "Record Payment",
        subtitle: "Apply one check to many invoices",
        href: `/payments?business=${businessSlug}`,
        label: "Payment",
        icon: "payment",
        tone: "payment",
      },
      {
        key: "review_queue",
        title: isJustKleen ? "Review Work" : "Review Queue",
        subtitle: isJustKleen
          ? "Check upcoming cleaning requests"
          : "Check upcoming units",
        href: `/queue?business=${businessSlug}`,
        label: "Review",
        icon: "review",
        tone: "review",
      },
      {
        key: "reports",
        title: isJustKleen ? "Business Reports" : "Property Reports",
        subtitle: isJustKleen
          ? "Review client activity and revenue"
          : "Review unit history and readiness",
        href: `/reports?business=${businessSlug}`,
        label: "Reports",
        icon: "reports",
        tone: "reports",
      },
      {
        key: "print_documents",
        title: "Print Documents",
        subtitle: "Estimates and invoices",
        href: `/estimates?business=${businessSlug}`,
        label: "Print",
        icon: "print",
        tone: "print",
      },
    ],
    [businessSlug, isJustKleen]
  );

  const visibleActions = quickActions.filter(
    (action) =>
      isLoading ||
      canUseDashboardAction(role, action.key)
  );

  if (!isLoading && visibleActions.length === 0) {
    return (
      <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        No quick actions are assigned to this role
        yet.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {visibleActions.map((action) => {
        const tone = actionTones[action.tone];

        return (
          <Link
            key={action.key}
            href={action.href}
            data-tone={action.tone}
            aria-label={`${action.title}: ${action.subtitle}`}
            className={[
              "dashboard-feature-card dashboard-action-card dark-surface group relative min-h-44 overflow-hidden rounded-2xl border p-4 transition",
              "bg-zinc-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              tone.border,
              tone.background,
              tone.hover,
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="dashboard-action-overlay absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_85%_100%,rgba(255,255,255,0.08),transparent_24%),linear-gradient(135deg,rgba(0,0,0,0.08),rgba(0,0,0,0.74)_72%)] opacity-95"
            />

            <span
              className={[
                "absolute inset-y-0 left-0 w-1 opacity-80 transition group-hover:opacity-100",
                tone.rail,
              ].join(" ")}
            />

            <span
              aria-hidden="true"
              className={[
                "absolute inset-x-0 top-0 h-px opacity-90",
                tone.topGlow,
              ].join(" ")}
            />

            <div className="relative z-10 pl-2">
              <div className="flex items-start justify-between gap-3">
                <p
                  className={[
                    "dashboard-action-pill inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                    tone.pill,
                  ].join(" ")}
                >
                  {action.label}
                </p>

                <span
                  aria-hidden="true"
                  className={[
                    "dashboard-action-glyph grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition group-hover:scale-105",
                    tone.glyph,
                  ].join(" ")}
                >
                  <DashboardCommandIcon icon={action.icon} />
                </span>
              </div>

              <p className="dashboard-action-title mt-4 text-lg font-semibold text-white drop-shadow-sm">
                {action.title}
              </p>

              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="dashboard-action-subtitle text-sm leading-6 text-white/75">
                  {action.subtitle}
                </p>

                <span
                  aria-hidden="true"
                  className="dashboard-action-arrow grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-lg font-semibold text-white/75 transition group-hover:translate-x-0.5 group-hover:border-white/20 group-hover:bg-white/15 group-hover:text-white"
                >
                  &gt;
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
