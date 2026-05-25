"use client";

import { useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "../lib/supabase";
import { canAccessPath } from "../lib/rolePermissions";
import {
  canAccessWorkspace,
  loadWorkspaceAccess,
  preferredWorkspaceSlug,
} from "../lib/workspaceAccess";

type AuthGuardProps = {
  children: React.ReactNode;
};

function withBusinessParam(
  pathname: string,
  businessSlug: string
) {
  return `${pathname}?business=${businessSlug}`;
}

export default function AuthGuard({
  children,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

      if (!session && isLoginPage) {
        setLoading(false);
        return;
      }

      const access = await loadWorkspaceAccess();
      const defaultBusinessSlug =
        preferredWorkspaceSlug(access);

      if (session && isLoginPage) {
        router.push(
          `/?business=${defaultBusinessSlug}`
        );
        return;
      }

      const selectedBusiness =
        searchParams.get("business");

      if (!selectedBusiness) {
        router.replace(
          withBusinessParam(
            pathname,
            defaultBusinessSlug
          )
        );
        return;
      }

      if (
        !canAccessWorkspace(
          access,
          selectedBusiness
        )
      ) {
        router.replace(
          withBusinessParam(
            pathname,
            defaultBusinessSlug
          )
        );
        return;
      }

      const currentWorkspace = access.find(
        (workspace) =>
          workspace.businessSlug === selectedBusiness
      );
      const currentRole =
        currentWorkspace?.role ?? "owner";

      if (
        access.length > 0 &&
        !canAccessPath(currentRole, pathname)
      ) {
        router.replace(
          `/?business=${selectedBusiness}`
        );
        return;
      }

      setLoading(false);
    }

    checkAuth();
  }, [pathname, router, searchParams]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">
          Opening workspace...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
