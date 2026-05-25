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
    <nav className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href={`/?business=${business}`}
          className="flex min-w-0 items-center gap-3"
        >
          {isRnl ? (
            <Image
              src="/Brand/rnl-multi-colors.png"
              alt="R&L Creations"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
              priority
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-400/10 text-sm font-black text-cyan-200">
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

        <UserMenu />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-medium text-zinc-300 sm:grid-cols-4 xl:flex xl:flex-wrap xl:items-center xl:justify-center">
        {visibleNavLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-2 text-center transition ${
              link.active
                ? "bg-orange-500 text-black"
                : "hover:bg-zinc-800 hover:text-orange-400"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
