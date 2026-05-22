"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import LogoutButton from "./LogoutButton";

type UserData = {
  email: string;
};

export default function UserMenu() {
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

      setUser({
        email: user.email,
      });
    }

    loadUser();
  }, []);

  return (
    <div className="flex items-center gap-4">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2">
        <p className="text-xs text-zinc-500">
          Logged In
        </p>

        <p className="text-sm font-medium text-white">
          {user?.email ?? "Loading..."}
        </p>
      </div>

      <LogoutButton />
    </div>
  );
}