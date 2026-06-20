"use client";

import { useCallback, useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "../lib/supabase";
import {
  defaultMaintenanceSettings,
  loadMaintenanceSettings,
  MaintenanceSettings,
} from "../lib/maintenanceMode";
import {
  canAccessPath,
  normalizeWorkspaceRole,
} from "../lib/rolePermissions";
import type { WorkspaceRole } from "../lib/rolePermissions";
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
import {
  clearSecureBrowserSession,
  getSessionSecurityStatus,
  recordSecureActivity,
} from "../lib/sessionSecurity";

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
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  );
}

function landingPathForRole(
  role: WorkspaceRole,
  businessSlug: string
) {
  if (
    role === "technician" ||
    role === "vendor" ||
    role === "subcontractor" ||
    role === "cleaner" ||
    role === "flooring_contractor"
  ) {
    return `/technician?business=${businessSlug}`;
  }

  return `/?business=${businessSlug}`;
}

function hasInviteMarker(searchParams: URLSearchParams) {
  if (
    searchParams.get("type") === "invite" ||
    searchParams.has("code") ||
    searchParams.has("token_hash")
  ) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hash.includes("type=invite") ||
    window.location.hash.includes("access_token=")
  );
}

export default function AuthGuard({
  children,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [maintenanceSettings, setMaintenanceSettings] =
    useState<MaintenanceSettings>(defaultMaintenanceSettings());
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);

  const expireSession = useCallback(async (reason: string) => {
    clearSecureBrowserSession();
    await supabase.auth.signOut();
    setLoading(false);
    router.replace(`/login?security=${reason}`);
  }, [router]);

  useEffect(() => {
    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    function recordActivity() {
      recordSecureActivity();
    }

    async function checkSessionOnResume() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      const status = getSessionSecurityStatus();

      if (!status.valid) {
        await expireSession(status.reason);
      }
    }

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, recordActivity, {
        passive: true,
      });
    }

    window.addEventListener("focus", checkSessionOnResume);
    document.addEventListener(
      "visibilitychange",
      checkSessionOnResume
    );

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, recordActivity);
      }

      window.removeEventListener("focus", checkSessionOnResume);
      document.removeEventListener(
        "visibilitychange",
        checkSessionOnResume
      );
    };
  }, [expireSession]);

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

      if (session) {
        const status = getSessionSecurityStatus();

        if (!status.valid) {
          await expireSession(status.reason);
          return;
        }

        recordSecureActivity();
      }

      const access = await loadWorkspaceAccess();
      const defaultBusinessSlug =
        preferredWorkspaceSlug(access);
      const selectedBusiness =
        searchParams.get("business");
      const inviteBusinessSlug =
        selectedBusiness ?? defaultBusinessSlug;
      const inviteLinkOpened =
        hasInviteMarker(searchParams);

      if (
        inviteLinkOpened &&
        !pathname.startsWith("/reset-password")
      ) {
        const nextParams = new URLSearchParams({
          business: inviteBusinessSlug,
        });
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (code) {
          nextParams.set("code", code);
        }

        if (tokenHash) {
          nextParams.set("token_hash", tokenHash);
        }

        if (type) {
          nextParams.set("type", type);
        }

        router.replace(
          `/reset-password?${nextParams.toString()}`
        );
        return;
      }

      if (
        session &&
        (isLoginPage ||
          pathname.startsWith("/request-access"))
      ) {
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
      const currentRole = normalizeWorkspaceRole(
        currentWorkspace?.role ?? "owner"
      );
      const maintenance = await loadMaintenanceSettings();
      const canUseAppDuringMaintenance =
        currentRole === "owner" || currentRole === "admin";

      setMaintenanceSettings(maintenance);
      setMaintenanceBlocked(
        maintenance.enabled && !canUseAppDuringMaintenance
      );

      if (
        access.length > 0 &&
        !canAccessPath(currentRole, pathname)
      ) {
        router.replace(
          landingPathForRole(currentRole, selectedBusiness)
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
  }, [expireSession, pathname, router, searchParams]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <p className="text-zinc-400">
          Opening workspace...
        </p>
      </main>
    );
  }

  if (maintenanceBlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-white">
        <section className="w-full max-w-2xl rounded-3xl border border-orange-500/30 bg-zinc-900 p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-300">
            Trimax Maintenance
          </p>
          <h1 className="mt-4 text-4xl font-bold">
            Trimax is being updated
          </h1>
          <p className="mt-4 text-lg leading-8 text-zinc-300">
            We are making improvements. Please check back in a few minutes.
          </p>
          <p className="mt-5 rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-200">
            {maintenanceSettings.message}
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
