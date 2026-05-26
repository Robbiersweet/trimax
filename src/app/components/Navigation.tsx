"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  usePathname,
  useSearchParams,
} from "next/navigation";
import {
  NavPermissionKey,
  canAccessNavItem,
} from "../lib/rolePermissions";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";
import UserMenu from "./UserMenu";

export default function Navigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [role, setRole] =
    useState<string | null>(null);
  const [isLoadingRole, setIsLoadingRole] =
    useState(true);

  const business =
    searchParams.get("business") ??
    "rnl-creations";

  const isRnl =
    business === "rnl-creations";

  const businessName = isRnl
    ? "R&L Creations"
    : "JUST KLEEN";

  useEffect(() => {
    let isMounted = true;

    async function loadRole() {
      const access = await loadWorkspaceAccess();
      const currentWorkspace = access.find(
        (workspace) =>
          workspace.businessSlug === business
      );

      if (!isMounted) {
        return;
      }

      setRole(currentWorkspace?.role ?? "owner");
      setIsLoadingRole(false);
    }

    loadRole();

    return () => {
      isMounted = false;
    };
  }, [business]);

  const navLinks: {
    key: NavPermissionKey;
    label: string;
    href: string;
    active: boolean;
  }[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      href: `/?business=${business}`,
      active: pathname === "/",
    },
    {
      key: "queue",
      label: "Queue",
      href: `/queue?business=${business}`,
      active: pathname.startsWith("/queue"),
    },
    {
      key: "estimates",
      label: "Estimates",
      href: `/estimates?business=${business}`,
      active: pathname.startsWith("/estimates"),
    },
    {
      key: "invoices",
      label: "Invoices",
      href: `/invoices?business=${business}`,
      active: pathname.startsWith("/invoices"),
    },
    {
      key: "payments",
      label: "Payments",
      href: `/payments?business=${business}`,
      active: pathname.startsWith("/payments"),
    },
    {
      key: "clients",
      label: "Clients",
      href: `/clients?business=${business}`,
      active: pathname.startsWith("/clients"),
    },
    {
      key: "services",
      label: "Services",
      href: `/services?business=${business}`,
      active: pathname.startsWith("/services"),
    },
    {
      key: "reports",
      label: "Reports",
      href: `/reports?business=${business}`,
      active: pathname.startsWith("/reports"),
    },
    {
      key: "activity",
      label: "Activity",
      href: `/activity?business=${business}`,
      active: pathname.startsWith("/activity"),
    },
    {
      key: "settings",
      label: "Settings",
      href: `/settings?business=${business}`,
      active: pathname.startsWith("/settings"),
    },
  ];

  const visibleNavLinks = navLinks.filter(
    (link) =>
      isLoadingRole ||
      canAccessNavItem(role, link.key)
  );

  return (
    <nav className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 shadow-lg sm:px-5 lg:sticky lg:top-5 lg:mb-0 lg:flex lg:h-[calc(100vh-2.5rem)] lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:px-4 lg:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch lg:justify-start">
        <Link
          href={`/?business=${business}`}
          className="flex min-w-0 items-center gap-3 lg:flex-col lg:items-start"
        >
          {isRnl ? (
            <Image
              src="/Brand/rnl-multi-colors.png"
              alt="R&L Creations"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover lg:h-14 lg:w-14"
              priority
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-400/10 text-sm font-black text-cyan-200 lg:h-14 lg:w-14">
              JK
            </div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-400">
              TRIMAX
            </p>

            <p className="truncate text-xs text-zinc-300 sm:text-sm">
              {businessName} Operations
            </p>
          </div>
        </Link>

        <div className="lg:hidden">
          <UserMenu variant="top" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-medium text-zinc-300 sm:grid-cols-4 lg:flex lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pt-3">
        {visibleNavLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-2xl px-3 py-2 text-center transition lg:text-left ${
              link.active
                ? "bg-orange-500 text-black shadow-lg shadow-orange-950/20"
                : "hover:bg-zinc-800 hover:text-orange-400"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="mt-5 hidden border-t border-zinc-800 pt-4 lg:block">
        <UserMenu variant="sidebar" />
      </div>
    </nav>
  );
}
