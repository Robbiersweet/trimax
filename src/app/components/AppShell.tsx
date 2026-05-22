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

  const isLoginPage =
    pathname.startsWith("/login");

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-5">
        {!isLoginPage && <Navigation />}

        {children}
      </div>
    </main>
  );
}