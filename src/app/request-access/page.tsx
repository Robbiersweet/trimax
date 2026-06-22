"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";

const workspaceOptions = [
  {
    slug: "rnl-creations",
    name: "R&L Creations",
  },
  {
    slug: "just-kleen",
    name: "Just Kleen",
  },
];

function RequestAccessPageContent() {
  const searchParams = useSearchParams();
  const requestedBusiness =
    searchParams.get("business") ?? "rnl-creations";

  const initialBusiness = useMemo(
    () =>
      workspaceOptions.some(
        (workspace) =>
          workspace.slug === requestedBusiness
      )
        ? requestedBusiness
        : "rnl-creations",
    [requestedBusiness]
  );

  const [businessSlug, setBusinessSlug] =
    useState(initialBusiness);
  const [requesterName, setRequesterName] =
    useState("");
  const [requesterEmail, setRequesterEmail] =
    useState("");
  const [companyOrProperty, setCompanyOrProperty] =
    useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setToast(null);

    if (!requesterName.trim()) {
      setToast({
        type: "error",
        message: "Enter your name.",
      });
      return;
    }

    if (
      !requesterEmail.includes("@") ||
      !requesterEmail.includes(".")
    ) {
      setToast({
        type: "error",
        message: "Enter a valid email address.",
      });
      return;
    }

    setSaving(true);

    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessSlug,
        requesterName,
        requesterEmail,
        companyOrProperty,
        message,
        website,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    setSaving(false);

    if (!response.ok) {
      setToast({
        type: "error",
        message:
          result.error ??
          "Trimax could not send this request.",
      });
      return;
    }

    setSubmitted(true);
    setToast({
      type: "success",
      message:
        "Request sent. Robbie will review it before any account is created.",
    });
  }

  return (
    <AppShell>
      {toast ? (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      ) : null}

      <div className="auth-page mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="auth-hero-panel rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-3 text-5xl font-bold">
            Request Access
          </h1>

          <p className="mt-3 text-zinc-400">
            Send a request for a Trimax workspace.
            Access is reviewed before any account is
            created.
          </p>

          <div className="mt-6 grid gap-3">
            {[
              {
                label: "Reviewed first",
                detail: "Requests are checked before a user account is created.",
              },
              {
                label: "Scoped roles",
                detail: "Access can be limited by workspace, role, and operational need.",
              },
              {
                label: "Private operations",
                detail: "Client, invoice, payment, and job data stay behind approval.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="auth-signal-row rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <p className="font-black text-white">
                  {item.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Card className="auth-card">
          {submitted ? (
            <div className="grid gap-5">
              <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5">
                <p className="font-semibold text-green-200">
                  Request received.
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  You are not signed up yet. The
                  workspace owner will review your
                  request and contact you if access
                  should be created.
                </p>
              </div>

              <Link
                href={`/login?business=${businessSlug}`}
                className="inline-flex justify-center rounded-2xl bg-zinc-800 px-5 py-3 font-semibold text-white transition hover:bg-zinc-700"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-sky-300">
                  Approval Request
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  Tell us who needs access
                </h2>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Workspace
                </label>

                <select
                  value={businessSlug}
                  onChange={(event) =>
                    setBusinessSlug(event.target.value)
                  }
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  {workspaceOptions.map((workspace) => (
                    <option
                      key={workspace.slug}
                      value={workspace.slug}
                    >
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </div>

              <InputField
                label="Name"
                placeholder="Your name"
                value={requesterName}
                onChange={setRequesterName}
              />

              <InputField
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={requesterEmail}
                onChange={setRequesterEmail}
              />

              <InputField
                label="Company or property"
                placeholder="Example: North Creek Apartments"
                value={companyOrProperty}
                onChange={setCompanyOrProperty}
              />

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Message
                </label>

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value)
                  }
                  rows={5}
                  placeholder="Tell us what access you need."
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500"
                />
              </div>

              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) =>
                  setWebsite(event.target.value)
                }
                className="hidden"
                aria-hidden="true"
              />

              <Button
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Sending request..."
                  : "Send Request"}
              </Button>

              <Link
                href={`/login?business=${businessSlug}`}
                className="text-center text-sm font-semibold text-zinc-400 transition hover:text-orange-300"
              >
                Back to login
              </Link>
            </form>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export default function RequestAccessPage() {
  return (
    <Suspense>
      <RequestAccessPageContent />
    </Suspense>
  );
}
