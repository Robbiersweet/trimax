"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";
import LogoutButton from "./LogoutButton";

type UserData = {
  email: string;
  role: string | null;
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

export default function UserMenu() {
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

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2">
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

      <LogoutButton />
    </div>
  );
}
