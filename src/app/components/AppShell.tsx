"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Navigation from "./Navigation";
import {
  defaultMaintenanceSettings,
  loadMaintenanceSettings,
  MaintenanceSettings,
} from "../lib/maintenanceMode";
import { normalizeWorkspaceRole } from "../lib/rolePermissions";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [maintenance, setMaintenance] =
    useState<MaintenanceSettings>(defaultMaintenanceSettings());
  const [canManageMaintenance, setCanManageMaintenance] = useState(false);

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  useEffect(() => {
    let isActive = true;

    async function loadBannerState() {
      if (isAuthPage) {
        return;
      }

      const [settings, access] = await Promise.all([
        loadMaintenanceSettings(),
        loadWorkspaceAccess(),
      ]);
      const selectedBusiness =
        new URLSearchParams(window.location.search).get("business");
      const workspace = selectedBusiness
        ? access.find((item) => item.businessSlug === selectedBusiness)
        : access[0];
      const role = normalizeWorkspaceRole(workspace?.role ?? "member");

      if (!isActive) {
        return;
      }

      setMaintenance(settings);
      setCanManageMaintenance(role === "owner" || role === "admin");
    }

    loadBannerState();

    return () => {
      isActive = false;
    };
  }, [isAuthPage]);

  return (
    <main className="app-shell-root min-h-screen bg-zinc-950 text-white">
      {isAuthPage ? (
        <div className="mx-auto max-w-6xl px-4 py-5">
          {children}
        </div>
      ) : (
        <div className="app-shell-content mx-auto flex w-full max-w-[112rem] flex-col px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
          <Navigation />

          <section className="min-w-0 flex-1 lg:py-2">
            {maintenance.enabled && canManageMaintenance ? (
              <div className="mb-4 rounded-2xl border border-orange-500/40 bg-orange-500/15 px-4 py-3 text-sm font-semibold text-orange-100">
                Maintenance Mode is ON. Normal users are temporarily paused.
              </div>
            ) : null}
            {children}
          </section>
        </div>
      )}
    </main>
  );
}
