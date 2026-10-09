"use client";
import { useState } from "react";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase";
import type { PublicServiceRequest } from "../../lib/publicScheduling/domain";

export default function ServiceRequestsIntake() {
  const [requests, setRequests] = useState<PublicServiceRequest[]>([]), [status, setStatus] = useState("Load requests to verify owner/admin access."), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setRequests([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("Sign in with an owner or admin account."); return; }
      const response = await fetch("/api/public-scheduling/intake?business=rnl-creations", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setStatus(data.error || "Unable to load requests."); return; }
      setRequests(data.requests); setStatus(`${data.requests.length} development requests. No appointments are automatically confirmed.`);
    } catch { setStatus("Connection interrupted. You can retry safely."); }
    finally { setBusy(false); }
  }
  return <AppShell><main className="mx-auto max-w-5xl space-y-6 p-6"><header><p className="text-xs uppercase tracking-widest text-amber-300">Owner / admin · Development intake</p><h1 className="mt-2 text-3xl font-semibold">Public service requests</h1><p className="mt-3 text-sm text-slate-400">An isolated review inbox. Queue conversion, client linking, confirmations, and notifications are not enabled.</p></header><button onClick={load} disabled={busy} className="rounded-lg bg-sky-700 px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? "Loading…" : "Load development requests"}</button><p role="status" className="text-sm text-slate-300">{status}</p><div className="space-y-4">{requests.map(request => <article key={request.id} className="rounded-xl border border-slate-700 p-5"><header className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{request.reference} · {request.customerName}</h2><span className="rounded bg-amber-900/40 px-3 py-1 text-xs text-amber-200">Pending confirmation</span></header><p className="mt-3 whitespace-pre-wrap text-sm">{request.description}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-400">Address</dt><dd className="whitespace-pre-wrap">{request.address}</dd></div><div><dt className="text-slate-400">Contact</dt><dd>{request.phone} · {request.email}<br/>Preferred: {request.preferredContact}</dd></div><div><dt className="text-slate-400">Requested visit</dt><dd>{request.preferredDate || "Flexible"} · {request.timeWindowId || "Any window"}</dd></div><div><dt className="text-slate-400">Submitted</dt><dd>{new Date(request.submittedAt).toLocaleString()}</dd></div></dl>{request.notes && <p className="mt-3 whitespace-pre-wrap text-sm">Notes: {request.notes}</p>}<p className="mt-4 text-xs text-slate-400">Next integration: review → request more information / approve / reject → explicit Queue or client conversion. No business records are changed here.</p></article>)}</div></main></AppShell>;
}
