"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";
import LogoutButton from "./LogoutButton";
import SecureSessionBadge from "./SecureSessionBadge";
import ThemeToggle from "./ThemeToggle";

type UserData = {
  email: string;
  role: string | null;
};

type UserMenuProps = {
  variant?: "top" | "sidebar";
};

function formatRole(value: string | null) {
  if (!value) {
    return "Workspace User";
  }

  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

export default function UserMenu({
  variant = "top",
}: UserMenuProps) {
  const searchParams = useSearchParams();
  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";

  const [user, setUser] =
    useState<UserData | null>(null);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        return;
      }

      const access = await loadWorkspaceAccess();
      const currentWorkspace = access.find(
        (workspace) =>
          workspace.businessSlug === businessSlug
      );

      setUser({
        email: user.email,
        role: currentWorkspace?.role ?? null,
      });
    }

    loadUser();
  }, [businessSlug]);

  const isSidebar = variant === "sidebar";

  return (
    <div
      className={
        isSidebar
          ? "flex min-w-0 flex-col gap-3"
          : "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
      }
    >
      <ThemeToggle
        className={isSidebar ? "w-full justify-center" : ""}
      />

      <div className="app-user-menu-card min-w-0 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2">
        <p className="text-xs text-zinc-500">
          Logged In
        </p>

        <p className="break-all text-sm font-medium text-white">
          {user?.email ?? "Loading..."}
        </p>

        <p className="mt-1 text-xs text-zinc-500">
          {formatRole(user?.role ?? null)}
        </p>
      </div>

      <SecureSessionBadge
        className={isSidebar ? "w-full" : ""}
      />

      <LogoutButton
        className={isSidebar ? "w-full" : ""}
      />
    </div>
  );
}
