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
  allowedPropertiesForBusiness,
  canAccessProperty,
  loadPropertyAccess,
} from "../lib/propertyAccess";
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

function withSearchParam(
  pathname: string,
  searchParams: URLSearchParams,
  key: string,
  value: string
) {
  const nextParams = new URLSearchParams(
    searchParams.toString()
  );
  nextParams.set(key, value);

  return `${pathname}?${nextParams.toString()}`;
}

function isPublicAuthPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  );
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
      const isPublicPage = isPublicAuthPath(pathname);

      if (!session && !isPublicPage) {
        router.push("/login");
        return;
      }

      if (!session && isPublicPage) {
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

      if (
        session &&
        pathname.startsWith("/forgot-password")
      ) {
        router.push(
          `/?business=${defaultBusinessSlug}`
        );
        return;
      }

      if (
        session &&
        pathname.startsWith("/reset-password")
      ) {
        setLoading(false);
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

      if (
        currentRole === "property_manager" &&
        (pathname.startsWith("/queue") ||
          pathname.startsWith("/reports") ||
          pathname.startsWith("/new-request"))
      ) {
        const propertyAccess =
          await loadPropertyAccess();
        const allowedProperties =
          allowedPropertiesForBusiness(
            propertyAccess,
            selectedBusiness
          );
        const requestedProperty =
          searchParams.get("property");

        if (
          allowedProperties.length > 0 &&
          !canAccessProperty(
            propertyAccess,
            selectedBusiness,
            requestedProperty
          )
        ) {
          router.replace(
            withSearchParam(
              pathname,
              searchParams,
              "property",
              allowedProperties[0].propertyKey
            )
          );
          return;
        }
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
