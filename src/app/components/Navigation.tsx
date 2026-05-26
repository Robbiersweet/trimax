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
  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(false);

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
  const activeLink = visibleNavLinks.find((link) => link.active);
  const settingsSubLinks = [
    {
      label: "Outlook Integration",
      href: `/settings?business=${business}#outlook-integration`,
    },
    {
      label: "User Role Integration",
      href: `/settings?business=${business}#user-role-integration`,
    },
  ];

  return (
    <nav className="mb-8 rounded-3xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 shadow-lg sm:px-5 lg:sticky lg:top-5 lg:mb-0 lg:flex lg:h-[calc(100vh-2.5rem)] lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:px-4 lg:py-5">
      <div className="flex items-center justify-between gap-3 lg:block">
        <Link
          href={`/?business=${business}`}
          className="flex min-w-0 items-center gap-3 lg:flex-col lg:items-start"
        >
          {isRnl ? (
            <Image
              src="/Brand/rnl-multi-colors.png"
              alt={businessName}
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

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((current) => !current)}
          className="inline-flex shrink-0 items-center rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300 lg:hidden"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-workspace-menu"
        >
          {isMobileMenuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 lg:hidden">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Current
        </p>

        <p className="mt-1 font-semibold text-orange-400">
          {activeLink?.label ?? "Workspace"}
        </p>
      </div>

      <div
        id="mobile-workspace-menu"
        className={`mt-4 space-y-4 lg:hidden ${
          isMobileMenuOpen ? "block" : "hidden"
        }`}
      >
        <UserMenu variant="top" />
      </div>

      <div
        className={`mt-4 grid grid-cols-2 gap-2 text-sm font-medium text-zinc-300 sm:grid-cols-4 lg:flex lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pt-3 ${
          isMobileMenuOpen ? "grid" : "hidden lg:flex"
        }`}
      >
        {visibleNavLinks.map((link) => (
          <div key={link.href} className="grid gap-2">
            <Link
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center justify-center rounded-2xl px-3 py-2 text-center transition lg:justify-between lg:text-left ${
                link.active
                  ? "bg-orange-500 text-black shadow-lg shadow-orange-950/20"
                  : "hover:bg-zinc-800 hover:text-orange-400"
              }`}
            >
              <span>{link.label}</span>
              {link.key === "settings" ? (
                <span
                  aria-hidden="true"
                  className="hidden text-sm lg:inline"
                >
                  {link.active ? "v" : ">"}
                </span>
              ) : null}
            </Link>

            {link.key === "settings" && link.active ? (
              <div className="grid gap-1 pl-3 lg:pl-4">
                {settingsSubLinks.map((subLink) => (
                  <Link
                    key={subLink.href}
                    href={subLink.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="rounded-xl px-3 py-2 text-left text-xs font-semibold text-zinc-400 transition hover:bg-zinc-800 hover:text-orange-400"
                  >
                    {subLink.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-5 hidden border-t border-zinc-800 pt-4 lg:block">
        <UserMenu variant="sidebar" />
      </div>
    </nav>
  );
}
