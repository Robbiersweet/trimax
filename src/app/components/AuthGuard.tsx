"use client";

import { useCallback, useEffect, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { supabase } from "../lib/supabase";
import { loginUrl, safeLoginReturn } from "../lib/loginReturn";
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
  expireSecureBrowserSession,
  getSessionSecurityStatus,
  recordSecureActivity,
  restoreSecureBrowserSession,
} from "../lib/sessionSecurity";

function definitiveAuthFailure(error: {name?: string; status?: number} | null) {
  return !!error && (error.name === "AuthSessionMissingError" ||
    typeof error.status === "number" && error.status >= 400 && error.status < 500 && ![408,429].includes(error.status));
}

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
  const [authRevision, setAuthRevision] = useState(0);
  const [sessionError, setSessionError] = useState(false);
  const [maintenanceSettings, setMaintenanceSettings] =
    useState<MaintenanceSettings>(defaultMaintenanceSettings());
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);

  const expireSession = useCallback(async (reason: string) => {
    await expireSecureBrowserSession(reason, () => supabase.auth.signOut());
    setLoading(true);
    router.replace(loginUrl(pathname, searchParams.toString(), reason));
  }, [router, pathname, searchParams]);

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

    let active = true;
    function checkSessionOnResume() {
      if (active && document.visibilityState !== "hidden") setAuthRevision(value => value + 1);
    }
    // The callback must not await Supabase APIs while the auth client holds its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(() => { if (active) setAuthRevision(value => value + 1); });
    });

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
      active = false;
      subscription.unsubscribe();
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
    let current = true;
    async function checkAuth() {
      try {
      const {
        data: { session }, error,
      } = await supabase.auth.getSession();
      if (!current) return;
      if (error) {
        if (!definitiveAuthFailure(error)) throw error;
        if (!isPublicAuthPath(pathname)) router.replace(loginUrl(pathname, searchParams.toString()));
        setLoading(false);
        return;
      }
      setSessionError(false);

      const isLoginPage =
        pathname.startsWith("/login");
      const isPublicPage = isPublicAuthPath(pathname);

      if (!session && !isPublicPage) {
        router.replace(loginUrl(pathname, searchParams.toString()));
        return;
      }

      if (!session && isPublicPage) {
        setLoading(false);
        return;
      }

      // Recovery handlers own their temporary Supabase auth flow. They never
      // establish an application lease or grant protected workspace access.
      if (pathname.startsWith("/reset-password") || pathname.startsWith("/forgot-password")) {
        setLoading(false);
        return;
      }

      if (session) {
        let status = getSessionSecurityStatus(session.user.id);
        if (!status.valid && status.reason === "new-browser-session") {
          const verified = await supabase.auth.getUser();
          if (!current) return;
          if (verified.error && !definitiveAuthFailure(verified.error)) throw verified.error;
          if (!verified.error && verified.data.user?.id === session.user.id) status = restoreSecureBrowserSession(verified.data.user.id);
        }

        if (!status.valid) {
          // Unverified/mismatched users still require the normal login flow.
          if (status.reason === "new-browser-session" && isLoginPage) {
            setLoading(false);
            return;
          }
          await expireSession(status.reason);
          return;
        }

        recordSecureActivity();
      }

      const access = await loadWorkspaceAccess();
      if (!current) return;
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
          (isLoginPage ? safeLoginReturn(searchParams.get("next")) : null) ??
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
      if (!current) return;
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
      if (!current) return;
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
      } catch {
        if (current) { setSessionError(true); setLoading(false); }
      }
    }

    void checkAuth();
    return () => { current = false; };
  }, [authRevision, expireSession, pathname, router, searchParams]);

  if (sessionError) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white"><section role="alert"><p>Your session could not be verified. Check your connection and retry.</p><button type="button" className="mt-4 rounded border px-4 py-2" onClick={() => { setSessionError(false); setLoading(true); setAuthRevision(value => value + 1); }}>Retry</button></section></main>;
  }

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
