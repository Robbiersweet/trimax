"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({
  children,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const isLoginPage =
        pathname.startsWith("/login");

      if (!session && !isLoginPage) {
        router.push("/login");
        return;
      }

      if (session && isLoginPage) {
        router.push("/?business=rnl-creations");
        return;
      }

      setLoading(false);
    }

    checkAuth();
  }, [pathname, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">
          Loading...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}