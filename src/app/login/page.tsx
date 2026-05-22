"use client";

import { useState } from "react";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
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

    const { data, error } = await supabase.auth.signInWithPassword({
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

    await supabase.auth.getSession();

    setTimeout(() => {
      window.location.replace("/?business=rnl-creations");
    }, 300);
  }

  async function handleSignup() {
    setToast(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

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
      message: "Account created. Check your email.",
    });
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-md">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">Login</h1>

        <p className="mt-3 text-zinc-400">
          Sign in to Trimax Operations Platform.
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

            <div className="flex gap-3">
              <Button onClick={handleLogin}>
                {loading ? "Logging in..." : "Login"}
              </Button>

              <Button variant="secondary" onClick={handleSignup}>
                Create Account
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}