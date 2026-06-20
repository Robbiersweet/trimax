"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  usePathname,
  useRouter,
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
  const router = useRouter();
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

  const navLinks = useMemo<
    {
      key: NavPermissionKey;
      label: string;
      href: string;
      active: boolean;
      icon: NavIconKey;
    }[]
  >(
    () => [
      {
        key: "dashboard",
        label: "Dashboard",
        href: `/?business=${business}`,
        active: pathname === "/",
        icon: "dashboard",
      },
      {
        key: "queue",
        label: "Queue",
        href: `/queue?business=${business}`,
        active: pathname.startsWith("/queue"),
        icon: "queue",
      },
      {
        key: "technician",
        label: "Technician",
        href: `/technician?business=${business}`,
        active: pathname.startsWith("/technician"),
        icon: "technician",
      },
      {
        key: "property_sales",
        label: "Property Sales",
        href: `/property-sales?business=${business}&property=north-creek-apartments`,
        active: pathname.startsWith("/property-sales"),
        icon: "property_sales",
      },
      {
        key: "job_sessions",
        label: "Job Sessions",
        href: `/job-sessions?business=${business}`,
        active: pathname.startsWith("/job-sessions"),
        icon: "job_sessions",
      },
      {
        key: "schedule",
        label: "Schedule",
        href: `/schedule?business=${business}`,
        active: pathname.startsWith("/schedule"),
        icon: "schedule",
      },
      {
        key: "estimates",
        label: "Estimates",
        href: `/estimates?business=${business}`,
        active: pathname.startsWith("/estimates"),
        icon: "estimates",
      },
      {
        key: "invoices",
        label: "Invoices",
        href: `/invoices?business=${business}`,
        active: pathname.startsWith("/invoices"),
        icon: "invoices",
      },
      {
        key: "payments",
        label: "Payments",
        href: `/payments?business=${business}`,
        active: pathname.startsWith("/payments"),
        icon: "payments",
      },
      {
        key: "clients",
        label: "Clients",
        href: `/clients?business=${business}`,
        active: pathname.startsWith("/clients"),
        icon: "clients",
      },
      {
        key: "imports",
        label: "Imports",
        href: `/imports?business=${business}`,
        active: pathname.startsWith("/imports"),
        icon: "imports",
      },
      {
        key: "services",
        label: "Services",
        href: `/services?business=${business}`,
        active: pathname.startsWith("/services"),
        icon: "services",
      },
      {
        key: "reports",
        label: "Reports",
        href: `/reports?business=${business}`,
        active: pathname.startsWith("/reports"),
        icon: "reports",
      },
      {
        key: "activity",
        label: "Activity",
        href: `/activity?business=${business}`,
        active: pathname.startsWith("/activity"),
        icon: "activity",
      },
      {
        key: "settings",
        label: "Settings",
        href: `/settings?business=${business}`,
        active: pathname.startsWith("/settings"),
        icon: "settings",
      },
    ],
    [business, pathname]
  );

  const visibleNavLinks = useMemo(
    () =>
      navLinks.filter(
        (link) =>
          isLoadingRole ||
          canAccessNavItem(role, link.key)
      ),
    [isLoadingRole, navLinks, role]
  );
  const activeLink = visibleNavLinks.find((link) => link.active);
  const settingsSubLinks = useMemo(
    () => [
      {
        label: "Phone App + Alerts",
        description: "Install setup",
        href: `/settings?business=${business}#phone-app-notifications`,
      },
      {
        label: "Email Launch",
        description: "Sender setup",
        href: `/settings?business=${business}#outlook-integration`,
      },
      {
        label: "User Role Integration",
        description: "Portal access",
        href: `/settings?business=${business}#user-role-integration`,
      },
    ],
    [business]
  );

  useEffect(() => {
    if (isLoadingRole) {
      return;
    }

    const prefetchHrefs = [
      ...visibleNavLinks.map((link) => link.href),
      ...settingsSubLinks.map((link) => link.href),
      `/payments?business=${business}#check-capture`,
      `/invoices?business=${business}&view=aging`,
      `/settings?business=${business}#outlook-integration`,
    ];

    const uniqueHrefs = Array.from(new Set(prefetchHrefs));

    const timer = window.setTimeout(() => {
      for (const href of uniqueHrefs) {
        router.prefetch(href);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [business, isLoadingRole, router, settingsSubLinks, visibleNavLinks]);

  return (
    <nav className="app-sidebar mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 shadow-lg sm:px-5 lg:sticky lg:top-5 lg:mb-0 lg:flex lg:h-[calc(100vh-2.5rem)] lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:px-4 lg:py-5">
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
          className="app-sidebar-menu-button inline-flex shrink-0 items-center rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300 lg:hidden"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-workspace-menu"
        >
          {isMobileMenuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className="app-sidebar-current mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 lg:hidden">
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
              aria-current={link.active ? "page" : undefined}
              className={`app-sidebar-nav-link group flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-center transition lg:justify-between lg:text-left ${
                link.active
                  ? "app-sidebar-nav-link-active text-white shadow-lg"
                  : "app-sidebar-nav-link-inactive hover:bg-zinc-800 hover:text-sky-300"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <NavIcon
                  icon={link.icon}
                  active={link.active}
                />
                <span className="truncate">{link.label}</span>
              </span>
              {link.key === "settings" ? (
                <span
                  aria-hidden="true"
                  className={`hidden rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] lg:inline ${
                    link.active
                      ? "app-sidebar-setup-pill-active bg-white/15 text-sky-50"
                      : "app-sidebar-setup-pill bg-zinc-800 text-zinc-400"
                  }`}
                >
                  Setup
                </span>
              ) : null}
            </Link>

            {link.key === "settings" && link.active ? (
              <div className="app-sidebar-settings grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-2 lg:ml-2">
                <p className="px-3 pt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                  Workspace setup
                </p>

                {settingsSubLinks.map((subLink) => (
                  <Link
                    key={subLink.href}
                    href={subLink.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="app-sidebar-sub-link rounded-xl px-3 py-2 text-left transition hover:bg-zinc-800"
                  >
                    <span className="block text-xs font-bold text-zinc-200">
                      {subLink.label}
                    </span>

                    <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
                      {subLink.description}
                    </span>
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

type NavIconKey =
  | "dashboard"
  | "queue"
  | "technician"
  | "property_sales"
  | "job_sessions"
  | "schedule"
  | "estimates"
  | "invoices"
  | "payments"
  | "clients"
  | "imports"
  | "services"
  | "reports"
  | "activity"
  | "settings";

function NavIcon({
  icon,
  active,
}: {
  icon: NavIconKey;
  active: boolean;
}) {
  const commonClasses = active
    ? "text-black"
    : "text-zinc-400 group-hover:text-orange-400";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${commonClasses}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === "dashboard" ? (
          <>
            <rect x="3" y="3" width="8" height="8" rx="1.5" />
            <rect x="13" y="3" width="8" height="5" rx="1.5" />
            <rect x="13" y="10" width="8" height="11" rx="1.5" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" />
          </>
        ) : null}
        {icon === "queue" ? (
          <>
            <path d="M5 6h14" />
            <path d="M5 12h14" />
            <path d="M5 18h10" />
            <circle cx="4" cy="6" r="1" />
            <circle cx="4" cy="12" r="1" />
            <circle cx="4" cy="18" r="1" />
          </>
        ) : null}
        {icon === "technician" ? (
          <>
            <path d="M14.7 6.3a3.2 3.2 0 0 0-4.4 4.4L4 17v3h3l6.3-6.3a3.2 3.2 0 0 0 4.4-4.4" />
            <path d="m14 7 3 3" />
            <path d="M18 3v4" />
            <path d="M16 5h4" />
          </>
        ) : null}
        {icon === "property_sales" ? (
          <>
            <path d="M4 20V8l8-4 8 4v12" />
            <path d="M8 20v-7h8v7" />
            <path d="M8 10h.01" />
            <path d="M12 10h.01" />
            <path d="M16 10h.01" />
            <path d="M4 20h16" />
          </>
        ) : null}
        {icon === "schedule" ? (
          <>
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M4 10h16" />
            <path d="M12 14v4" />
            <path d="M10 16h4" />
          </>
        ) : null}
        {icon === "job_sessions" ? (
          <>
            <path d="M9 2h6" />
            <path d="M12 2v3" />
            <circle cx="12" cy="13" r="7" />
            <path d="M12 13V9" />
            <path d="m12 13 3 2" />
          </>
        ) : null}
        {icon === "estimates" ? (
          <>
            <path d="M7 3h8l4 4v17H7z" />
            <path d="M15 3v5h5" />
            <path d="M10 13h6" />
            <path d="M10 17h4" />
          </>
        ) : null}
        {icon === "invoices" ? (
          <>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <path d="M9 8h6" />
            <path d="M9 12h6" />
            <path d="M9 16h4" />
          </>
        ) : null}
        {icon === "payments" ? (
          <>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 15h2" />
            <path d="M15 14c0-1-1-2-3-2s-3 1-3 2 1 2 3 2 3 1 3 2" />
          </>
        ) : null}
        {icon === "clients" ? (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c1-4 4-6 6-6s5 2 6 6" />
            <circle cx="17" cy="10" r="2" />
            <path d="M15 16c2 0 4 1 5 4" />
          </>
        ) : null}
        {icon === "imports" ? (
          <>
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M4 19h16" />
          </>
        ) : null}
        {icon === "services" ? (
          <>
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
            <path d="M8 5v14" />
          </>
        ) : null}
        {icon === "reports" ? (
          <>
            <path d="M5 19V5" />
            <path d="M9 19v-8" />
            <path d="M13 19V8" />
            <path d="M17 19v-5" />
            <path d="M3 19h18" />
          </>
        ) : null}
        {icon === "activity" ? (
          <>
            <path d="M4 13h4l2-7 4 13 2-6h4" />
          </>
        ) : null}
        {icon === "settings" ? (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <path d="m5 5 2 2" />
            <path d="m17 17 2 2" />
            <path d="m19 5-2 2" />
            <path d="m7 17-2 2" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
