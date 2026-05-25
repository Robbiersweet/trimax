"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";

function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function prepareResetSession() {
      const code = searchParams.get("code");

      if (!code) {
        setReady(true);
        return;
      }

      const { error } =
        await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        setToast({
          type: "error",
          message:
            "This reset link could not be opened. Please request a fresh reset email.",
        });
      }

      setReady(true);
    }

    prepareResetSession();
  }, [searchParams]);

  async function updatePassword() {
    setToast(null);

    if (password.length < 8) {
      setToast({
        type: "error",
        message: "Use at least 8 characters for the new password.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setToast({
        type: "error",
        message: "The two password fields do not match yet.",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setToast({
        type: "error",
        message:
          error.message ||
          "Unable to update the password. Please request a fresh reset email.",
      });
      return;
    }

    setToast({
      type: "success",
      message: "Password updated. You can sign in with the new password.",
    });
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <AppShell>
      {toast ? (
        <Toast type={toast.type} message={toast.message} />
      ) : null}

      <div className="mx-auto max-w-md">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          New Password
        </h1>

        <p className="mt-3 text-zinc-400">
          Create a new password for your Trimax account.
        </p>

        <Card className="mt-8">
          <div className="grid gap-5">
            {!ready ? (
              <p className="text-sm text-zinc-400">
                Opening reset link...
              </p>
            ) : (
              <>
                <InputField
                  type="password"
                  label="New Password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={setPassword}
                />

                <InputField
                  type="password"
                  label="Confirm Password"
                  placeholder="Retype new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />

                <Button onClick={updatePassword}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </>
            )}

            <Link
              href="/login"
              className="text-sm font-semibold text-orange-400 transition hover:text-orange-300"
            >
              Back to login
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
          <p className="text-zinc-400">Opening reset link...</p>
        </main>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}
