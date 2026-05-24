"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import UserMenu from "./UserMenu";

export default function Navigation() {
  const searchParams = useSearchParams();

  const business =
    searchParams.get("business") ??
    "rnl-creations";

  return (
    <nav className="mb-8 flex items-center justify-between rounded-3xl border border-zinc-800 bg-zinc-900/80 px-5 py-4">
      <Link
        href={`/?business=${business}`}
        className="flex items-center gap-3"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-black">
          T
        </div>

        <div>
          <p className="text-sm font-bold tracking-[0.25em] text-orange-400">
            TRIMAX
          </p>

          <p className="text-xs text-zinc-300">
            Operations Platform
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-6 text-sm font-medium text-zinc-300">
        <Link
          href={`/?business=${business}`}
          className="hover:text-orange-400"
        >
          Dashboard
        </Link>

        <Link
          href={`/queue?business=${business}`}
          className="hover:text-orange-400"
        >
          Queue
        </Link>

        <Link
          href={`/estimates?business=${business}`}
          className="hover:text-orange-400"
        >
          Estimates
        </Link>

        <Link
          href={`/invoices?business=${business}`}
          className="hover:text-orange-400"
        >
          Invoices
        </Link>

        <Link
          href={`/clients?business=${business}`}
          className="hover:text-orange-400"
        >
          Clients
        </Link>

        <Link
          href={`/services?business=${business}`}
          className="hover:text-orange-400"
        >
          Services
        </Link>

        <UserMenu />
      </div>
    </nav>
  );
}