"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
  useSearchParams,
} from "next/navigation";
import UserMenu from "./UserMenu";

export default function Navigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const business =
    searchParams.get("business") ??
    "rnl-creations";

  const isRnl =
    business === "rnl-creations";

  const businessName = isRnl
    ? "R&L Creations"
    : "JUST KLEEN";

  const navLinks = [
    {
      label: "Dashboard",
      href: `/?business=${business}`,
      active: pathname === "/",
    },
    {
      label: "Queue",
      href: `/queue?business=${business}`,
      active: pathname.startsWith("/queue"),
    },
    {
      label: "Estimates",
      href: `/estimates?business=${business}`,
      active: pathname.startsWith("/estimates"),
    },
    {
      label: "Invoices",
      href: `/invoices?business=${business}`,
      active: pathname.startsWith("/invoices"),
    },
    {
      label: "Clients",
      href: `/clients?business=${business}`,
      active: pathname.startsWith("/clients"),
    },
    {
      label: "Services",
      href: `/services?business=${business}`,
      active: pathname.startsWith("/services"),
    },
    {
      label: "Reports",
      href: `/reports?business=${business}`,
      active: pathname.startsWith("/reports"),
    },
    {
      label: "Settings",
      href: `/settings?business=${business}`,
      active: pathname.startsWith("/settings"),
    },
  ];

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
        {navLinks.map((link) => (
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
