"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";
import {
  loadWorkspaceAccess,
  preferredWorkspaceSlug,
} from "../lib/workspaceAccess";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleLogin() {
    setToast(null);
    setLoading(true);

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error || !data.session) {
      setLoading(false);

      setToast({
        type: "error",
        message: error?.message ?? "Login failed.",
      });

      return;
    }

    const access = await loadWorkspaceAccess();
    const businessSlug = preferredWorkspaceSlug(access);

    window.location.replace(
      `/?business=${businessSlug}`
    );
  }

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="mx-auto max-w-md">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          Login
        </h1>

        <p className="mt-3 text-zinc-400">
          Sign in to your Trimax workspace.
          Access is by invitation only.
        </p>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
            />

            <InputField
              type="password"
              label="Password"
              placeholder="Enter password"
              value={password}
              onChange={setPassword}
            />

            <div className="-mt-2 flex justify-end">
              <Link
                href={`/forgot-password?business=${businessSlug}`}
                className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
              >
                Forgot password?
              </Link>
            </div>

            <Button onClick={handleLogin}>
              {loading
                ? "Opening workspace..."
                : "Login"}
            </Button>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              New users need an invitation from
              Trimax before they can access a
              workspace.
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
