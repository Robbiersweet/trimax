"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";
import {
  sessionSecurityMessage,
  startSecureBrowserSession,
} from "../lib/sessionSecurity";
import {
  loadWorkspaceAccess,
  preferredWorkspaceSlug,
} from "../lib/workspaceAccess";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";
  const securityMessage = sessionSecurityMessage(
    searchParams.get("security")
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleLogin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setToast(null);

    if (!email.trim() || !password) {
      setToast({
        type: "error",
        message: "Enter your email and password.",
      });
      return;
    }

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

    startSecureBrowserSession();

    const access = await loadWorkspaceAccess();
    const nextBusinessSlug = preferredWorkspaceSlug(
      access,
      businessSlug
    );

    window.location.replace(
      `/?business=${nextBusinessSlug}`
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

      <div className="auth-page auth-page-simple mx-auto grid max-w-3xl gap-5 lg:grid-cols-none">
        <div className="auth-hero-panel rounded-3xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
            Trimax Login
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Sign in to your approved workspace.
          </p>
        </div>

        <Card className="auth-card">
          <form className="grid gap-5" onSubmit={handleLogin}>
            <div>
              <h2 className="mt-2 text-2xl font-black text-white">
                Open workspace
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Enter your email and password.
              </p>
            </div>

            {securityMessage && (
              <div className="auth-security-message rounded-2xl border px-4 py-3 text-sm font-semibold">
                {securityMessage}
              </div>
            )}

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

            <Button type="submit" disabled={loading}>
              {loading
                ? "Opening workspace..."
                : "Login"}
            </Button>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              <p>
                Need access? Send a request and an owner can approve it.
              </p>

              <Link
                href={`/request-access?business=${businessSlug}`}
                className="mt-3 inline-flex font-semibold text-orange-400 transition hover:text-orange-300"
              >
                Request access
              </Link>
            </div>
          </form>
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
