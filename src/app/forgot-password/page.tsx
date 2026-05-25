"use client";

import Link from "next/link";
import { useState } from "react";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function sendResetEmail() {
    setToast(null);

    if (!email.trim()) {
      setToast({
        type: "error",
        message: "Enter the email address for your Trimax account.",
      });
      return;
    }

    setLoading(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );

    setLoading(false);

    if (error) {
      setToast({
        type: "error",
        message: error.message,
      });
      return;
    }

    setToast({
      type: "success",
      message:
        "Password reset email sent. Open the email and follow the reset link.",
    });
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
          Reset Password
        </h1>

        <p className="mt-3 text-zinc-400">
          Enter your account email and Trimax will send a secure reset link.
        </p>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
            />

            <Button onClick={sendResetEmail}>
              {loading ? "Sending..." : "Send Reset Email"}
            </Button>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-400">
              For security, Trimax only sends reset links to invited users with
              an existing Supabase account.
            </div>

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
