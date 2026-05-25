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

type QuickAction = {
  key: DashboardActionKey;
  title: string;
  subtitle: string;
  href: string;
  label: string;
  glyph: string;
  tone: "queue" | "estimate" | "invoice" | "payment" | "review" | "reports" | "print";
};

const actionTones: Record<
  QuickAction["tone"],
  {
    border: string;
    background: string;
    rail: string;
    pill: string;
    glyph: string;
    hover: string;
  }
> = {
  queue: {
    border: "border-orange-500/35",
    background: "bg-orange-500/10",
    rail: "bg-orange-500",
    pill: "border-orange-500/40 bg-orange-500/15 text-orange-200",
    glyph: "border-orange-400/35 bg-orange-500/15 text-orange-100",
    hover: "hover:border-orange-400/70 hover:bg-orange-500/15",
  },
  estimate: {
    border: "border-violet-500/35",
    background: "bg-violet-500/10",
    rail: "bg-violet-500",
    pill: "border-violet-500/40 bg-violet-500/15 text-violet-200",
    glyph: "border-violet-400/35 bg-violet-500/15 text-violet-100",
    hover: "hover:border-violet-400/70 hover:bg-violet-500/15",
  },
  invoice: {
    border: "border-emerald-500/35",
    background: "bg-emerald-500/10",
    rail: "bg-emerald-500",
    pill: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    glyph: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
    hover: "hover:border-emerald-400/70 hover:bg-emerald-500/15",
  },
  payment: {
    border: "border-sky-500/35",
    background: "bg-sky-500/10",
    rail: "bg-sky-500",
    pill: "border-sky-500/40 bg-sky-500/15 text-sky-200",
    glyph: "border-sky-400/35 bg-sky-500/15 text-sky-100",
    hover: "hover:border-sky-400/70 hover:bg-sky-500/15",
  },
  review: {
    border: "border-amber-400/35",
    background: "bg-amber-400/10",
    rail: "bg-amber-400",
    pill: "border-amber-400/40 bg-amber-400/15 text-amber-100",
    glyph: "border-amber-300/35 bg-amber-400/15 text-amber-100",
    hover: "hover:border-amber-300/70 hover:bg-amber-400/15",
  },
  reports: {
    border: "border-fuchsia-500/35",
    background: "bg-fuchsia-500/10",
    rail: "bg-fuchsia-500",
    pill: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200",
    glyph: "border-fuchsia-400/35 bg-fuchsia-500/15 text-fuchsia-100",
    hover: "hover:border-fuchsia-400/70 hover:bg-fuchsia-500/15",
  },
  print: {
    border: "border-cyan-500/35",
    background: "bg-cyan-500/10",
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

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        key: "new_queue",
        title: "New Queue Item",
        subtitle:
          "Add apartment turn or property request",
        href: `/new-request?business=${businessSlug}`,
        label: "Queue",
        glyph: "Q",
        tone: "queue",
      },
      {
        key: "new_estimate",
        title: "New Estimate",
        subtitle: "Create a customer estimate",
        href: `/estimates/new?business=${businessSlug}`,
        label: "Estimate",
        glyph: "E",
        tone: "estimate",
      },
      {
        key: "new_invoice",
        title: "New Invoice",
        subtitle: "Create invoice or deposit request",
        href: `/invoices/new?business=${businessSlug}`,
        label: "Invoice",
        glyph: "I",
        tone: "invoice",
      },
      {
        key: "record_payment",
        title: "Record Payment",
        subtitle: "Apply one check to many invoices",
        href: `/payments?business=${businessSlug}`,
        label: "Payment",
        glyph: "$",
        tone: "payment",
      },
      {
        key: "review_queue",
        title: "Review Queue",
        subtitle: "Check upcoming units",
        href: `/queue?business=${businessSlug}`,
        label: "Review",
        glyph: "R",
        tone: "review",
      },
      {
        key: "reports",
        title: "Property Reports",
        subtitle: "Review unit history and readiness",
        href: `/reports?business=${businessSlug}`,
        label: "Reports",
        glyph: "%",
        tone: "reports",
      },
      {
        key: "print_documents",
        title: "Print Documents",
        subtitle: "Estimates and invoices",
        href: `/estimates?business=${businessSlug}`,
        label: "Print",
        glyph: "P",
        tone: "print",
      },
    ],
    [businessSlug]
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
            className={[
              "group relative overflow-hidden rounded-2xl border p-4 transition",
              "bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
              tone.border,
              tone.background,
              tone.hover,
            ].join(" ")}
          >
            <span
              className={[
                "absolute inset-y-0 left-0 w-1 opacity-80 transition group-hover:opacity-100",
                tone.rail,
              ].join(" ")}
            />

            <div className="pl-2">
              <div className="flex items-start justify-between gap-3">
                <p
                  className={[
                    "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                    tone.pill,
                  ].join(" ")}
                >
                  {action.label}
                </p>

                <span
                  aria-hidden="true"
                  className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-sm font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition group-hover:scale-105",
                    tone.glyph,
                  ].join(" ")}
                >
                  {action.glyph}
                </span>
              </div>

              <p className="mt-3 font-semibold text-white">
                {action.title}
              </p>

              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  {action.subtitle}
                </p>

                <span
                  aria-hidden="true"
                  className="text-lg font-semibold text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-white"
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
