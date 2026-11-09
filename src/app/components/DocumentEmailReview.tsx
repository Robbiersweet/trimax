"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
type Attachment = { filename: string; content: string };
type Review = {
  subject: string;
  message: string;
  recipientEmail: string;
  ccEmail: string;
  bccEmail: string;
  from: string;
  replyToEmail: string;
  html: string;
  facts: string;
  reviewToken: string;
  attachments: Attachment[];
};
export default function DocumentEmailReview({
  documentId,
  kind = "invoice",
  businessSlug,
  recipientEmail,
  sendSplitGroup = false,
  purpose = "send",
  onClose,
  onSent,
}: {
  documentId: string;
  kind?: "invoice" | "estimate";
  businessSlug: string;
  recipientEmail: string;
  sendSplitGroup?: boolean;
  purpose?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState({
    subject: "",
    message: "",
    recipientEmail,
    ccEmail: "",
  });
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pdfs, setPdfs] = useState<{ name: string; url: string }[]>([]);
  const key = useRef("");
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const idempotency = useRef(crypto.randomUUID());
  const endpoint = `/api/${kind === "estimate" ? "estimates" : "invoices"}/${documentId}/send-email`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const urls = (review?.attachments || []).map((a) => ({
      name: a.filename,
      url: URL.createObjectURL(
        new Blob([Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0))], {
          type: "application/pdf",
        }),
      ),
    }));
    Promise.resolve().then(() => {
      if (active) setPdfs(urls);
    });
    return () => {
      active = false;
      urls.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [review]);
  async function request(mode: "prepare" | "review" | "send", values = draft) {
    if (inFlight.current || (mode === "send" && (!approved || !review))) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitting(mode === "send");
    setError("");
    setApproved(false);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session)
        throw Error("Your session is unavailable. No email was sent.");
      key.current = `document-email:${session.user.id}:${businessSlug}:${kind}:${documentId}:${purpose}:${sendSplitGroup}`;
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...values,
          businessSlug,
          sendSplitGroup,
          emailPurpose: purpose,
          sendIdempotencyKey: idempotency.current,
          preflightOnly: mode !== "send",
          mode,
          ...(mode === "send"
            ? {
                finalApproval: true,
                reviewToken: review?.reviewToken,
                reviewAttachments: review?.attachments,
              }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Email review failed. No email was sent.");
      if (!mounted.current) return;
      if (mode === "send") {
        try {
          sessionStorage.removeItem(key.current);
        } catch {
          /* optional draft storage */
        }
        setStatus(
          result.statusUpdateError
            ? "Provider accepted the email; status update needs review. Check send history before trying again."
            : "Email provider accepted the message for sending. Delivery is not yet confirmed.",
        );
        setReview(null);
        onSent();
        return;
      }
      const prepared = result as Review;
      if (mode === "prepare") {
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(key.current);
        } catch {
          /* Storage is optional; review remains usable. */
        }
        const restored = saved ? JSON.parse(saved) : null;
        setDraft(
          restored || {
            subject: prepared.subject,
            message: prepared.message,
            recipientEmail: prepared.recipientEmail,
            ccEmail: prepared.ccEmail,
          },
        );
        if (restored) {
          setReview(null);
          setError(
            "Your saved edits were restored. Refresh the review to validate them against the current documents.",
          );
          return;
        }
      }
      setReview(prepared);
    } catch (e) {
      if (
        mounted.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          e instanceof Error
            ? e.message
            : "Review unavailable. No email was sent.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setSubmitting(false);
      }
    }
  }
  // Only prepare runs on mount; the provider path is exclusively the final button below.
  useEffect(() => {
    Promise.resolve().then(() => {
      if (mounted.current) void request("prepare");
    }); /* props are fixed for this keyed review */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function edit(name: keyof typeof draft, value: string) {
    const next = { ...draft, [name]: value };
    setDraft(next);
    setReview(null);
    setApproved(false);
    if (key.current) {
      try {
        sessionStorage.setItem(key.current, JSON.stringify(next));
      } catch {
        /* optional draft storage */
      }
    }
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review Email"
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 p-3"
    >
      <div className="mx-auto max-w-5xl space-y-4 rounded-2xl bg-white p-5 text-slate-950">
        <div className="flex justify-between">
          <h2 className="text-2xl font-bold">Review Email</h2>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              abort.current?.abort();
              onClose();
            }}
          >
            Close
          </button>
        </div>
        <p>
          Nothing is transmitted until you review this email and explicitly
          confirm Send. Closing or canceling keeps edits without sending.
        </p>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        {!status && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                To
                <input
                  aria-label="To"
                  type="email"
                  disabled={busy}
                  value={draft.recipientEmail}
                  onChange={(e) => edit("recipientEmail", e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>
              <label>
                CC (optional)
                <input
                  aria-label="CC"
                  type="email"
                  disabled={busy}
                  value={draft.ccEmail}
                  onChange={(e) => edit("ccEmail", e.target.value)}
                  className="w-full rounded border p-2"
                />
              </label>
            </div>
            <label className="block">
              Subject
              <input
                aria-label="Subject"
                disabled={busy}
                value={draft.subject}
                onChange={(e) => edit("subject", e.target.value)}
                className="w-full rounded border p-2"
              />
            </label>
            <label className="block">
              Message
              <textarea
                aria-label="Message"
                rows={12}
                disabled={busy}
                value={draft.message}
                onChange={(e) => edit("message", e.target.value)}
                className="w-full rounded border p-2"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (key.current)
                  try {
                    sessionStorage.removeItem(key.current);
                  } catch {
                    /* optional draft storage */
                  }
                void request("prepare");
              }}
              className="underline"
            >
              Discard edits and reload canonical draft
            </button>
            <p className="text-sm">
              Edit your greeting and cover note freely. Keep the document
              details unchanged; update financial terms on the saved document,
              then reopen review. The workspace signature is appended exactly
              once.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                request(draft.subject && draft.message ? "review" : "prepare")
              }
              className="rounded bg-slate-800 p-3 text-white"
            >
              {busy ? "Preparing…" : "Refresh and validate preview"}
            </button>
            {review && (
              <>
                <p>
                  From: {review.from}
                  <br />
                  Reply-to: {review.replyToEmail}
                  <br />
                  BCC: {review.bccEmail || "None"}
                </p>
                <h3 className="font-bold">Complete email preview</h3>
                <iframe
                  title="Reviewed email"
                  sandbox=""
                  srcDoc={review.html}
                  className="h-[480px] w-full border"
                />
                <h3 className="font-bold">Official PDF attachments</h3>
                {pdfs.map((p) => (
                  <div key={p.name}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Inspect {p.name}
                    </a>
                    <iframe
                      title={p.name}
                      src={p.url}
                      className="h-80 w-full border"
                    />
                  </div>
                ))}
                <label className="block">
                  <input
                    type="checkbox"
                    checked={approved}
                    disabled={busy}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{" "}
                  I reviewed the recipients, message, signature and attached
                  PDFs and approve this email.
                </label>
                <button
                  type="button"
                  disabled={!approved || busy}
                  onClick={() => request("send")}
                  className="rounded bg-emerald-700 p-3 text-white disabled:opacity-40"
                >
                  {busy ? "Submitting…" : "Confirm and Send Email"}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                abort.current?.abort();
                onClose();
              }}
              className="ml-3 rounded border p-3"
            >
              Cancel — keep draft
            </button>
          </>
        )}
      </div>
    </div>
  );
}
