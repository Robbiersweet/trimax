"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ActiveJobSessionDock from "./ActiveJobSessionDock";
import FilteredResultsScroller from "./FilteredResultsScroller";
import HashScrollRestorer from "./HashScrollRestorer";
import Navigation from "./Navigation";
import NavigationHistoryTracker from "./NavigationHistoryTracker";
import QuickCommandCenter from "./QuickCommandCenter";
import WorkspaceBackBar from "./WorkspaceBackBar";
import {
  defaultMaintenanceSettings,
  loadMaintenanceSettings,
  MaintenanceSettings,
} from "../lib/maintenanceMode";
import {
  canUseWorkPermission,
  normalizeWorkspaceRole,
} from "../lib/rolePermissions";
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
  const [canUseJobSessions, setCanUseJobSessions] = useState(false);

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const workspaceSection =
    pathname.split("/").filter(Boolean)[0] || "dashboard";

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
      const role = normalizeWorkspaceRole(workspace?.role ?? "technician");

      if (!isActive) {
        return;
      }

      setMaintenance(settings);
      setCanManageMaintenance(role === "owner" || role === "admin");
      setCanUseJobSessions(canUseWorkPermission(role, "view_own_sessions"));
    }

    loadBannerState();

    return () => {
      isActive = false;
    };
  }, [isAuthPage]);

  return (
    <main
      className="app-shell-root min-h-screen bg-zinc-950 text-white"
      data-workspace-section={isAuthPage ? "auth" : workspaceSection}
    >
      {!isAuthPage ? (
        <a className="app-skip-link" href="#trimax-main-content">
          Skip to main content
        </a>
      ) : null}
      {!isAuthPage ? (
        <>
          <div className="app-platinum-horizon" aria-hidden="true" />
          <div className="app-shell-visual-field" aria-hidden="true" />
        </>
      ) : null}
      <NavigationHistoryTracker />
      <HashScrollRestorer />
      <FilteredResultsScroller />
      {isAuthPage ? (
        <div className="mx-auto max-w-6xl px-4 py-5">
          {children}
        </div>
      ) : (
        <div className="app-shell-content mx-auto flex w-full max-w-[112rem] flex-col px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
          <Navigation />
          <QuickCommandCenter />
          {canUseJobSessions ? <ActiveJobSessionDock /> : null}

          <section
            aria-label="Trimax workspace content"
            className="app-workspace-panel min-w-0 flex-1 outline-none lg:py-2"
            id="trimax-main-content"
            tabIndex={-1}
          >
            {maintenance.enabled && canManageMaintenance ? (
              <div className="mb-4 rounded-2xl border border-orange-500/40 bg-orange-500/15 px-4 py-3 text-sm font-semibold text-orange-100">
                Maintenance Mode is ON. Normal users are temporarily paused.
              </div>
            ) : null}
            <WorkspaceBackBar />
            {children}
          </section>
        </div>
      )}
    </main>
  );
}
