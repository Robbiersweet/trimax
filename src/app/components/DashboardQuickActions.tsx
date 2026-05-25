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
      },
      {
        key: "new_estimate",
        title: "New Estimate",
        subtitle: "Create a customer estimate",
        href: `/estimates/new?business=${businessSlug}`,
        label: "Estimate",
      },
      {
        key: "new_invoice",
        title: "New Invoice",
        subtitle: "Create invoice or deposit request",
        href: `/invoices/new?business=${businessSlug}`,
        label: "Invoice",
      },
      {
        key: "record_payment",
        title: "Record Payment",
        subtitle: "Apply payment to invoice",
        href: `/invoices?business=${businessSlug}&status=sent`,
        label: "Payment",
      },
      {
        key: "review_queue",
        title: "Review Queue",
        subtitle: "Check upcoming units",
        href: `/queue?business=${businessSlug}`,
        label: "Review",
      },
      {
        key: "reports",
        title: "Property Reports",
        subtitle: "Review unit history and readiness",
        href: `/reports?business=${businessSlug}`,
        label: "Reports",
      },
      {
        key: "print_documents",
        title: "Print Documents",
        subtitle: "Estimates and invoices",
        href: `/estimates?business=${businessSlug}`,
        label: "Print",
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
      {visibleActions.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-orange-500/60 hover:bg-zinc-800"
        >
          <p className="inline-flex rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">
            {action.label}
          </p>

          <p className="mt-3 font-semibold">
            {action.title}
          </p>

          <p className="mt-1 text-sm text-zinc-400">
            {action.subtitle}
          </p>
        </Link>
      ))}
    </div>
  );
}

