"use client";

import { usePathname } from "next/navigation";
import Navigation from "./Navigation";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({
  children,
}: AppShellProps) {
  const pathname = usePathname();

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {isAuthPage ? (
        <div className="mx-auto max-w-6xl px-4 py-5">
          {children}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[112rem] flex-col px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
          <Navigation />

          <section className="min-w-0 flex-1 lg:py-2">
            {children}
          </section>
        </div>
      )}
    </main>
  );
}
