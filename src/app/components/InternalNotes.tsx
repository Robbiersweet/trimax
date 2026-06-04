"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import Toast from "./Toast";
import { supabase } from "../lib/supabase";

type InternalNote = {
  id: string;
  body: string;
  author_email: string | null;
  created_at: string | null;
};

type InternalNotesProps = {
  businessId: string | null;
  entityType: "client" | "invoice" | "estimate" | "queue_item";
  entityId: string;
  title?: string;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function InternalNotes({
  businessId,
  entityType,
  entityId,
  title = "Internal Notes",
}: InternalNotesProps) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function loadNotes() {
    if (!businessId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("internal_notes")
      .select("id, body, author_email, created_at")
      .eq("business_id", businessId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.warn("Internal notes could not be loaded:", error.message);
      setNotes([]);
      return;
    }

    setNotes((data ?? []) as InternalNote[]);
  }

  useEffect(() => {
    Promise.resolve().then(loadNotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, entityType, entityId]);

  async function handleAddNote() {
    setToast(null);

    if (!businessId) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });
      return;
    }

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      setToast({
        type: "error",
        message: "Enter a note first.",
      });
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("internal_notes")
      .insert({
        business_id: businessId,
        entity_type: entityType,
        entity_id: entityId,
        body: trimmedBody,
        author_user_id: user?.id ?? null,
        author_email: user?.email ?? null,
      });

    setSaving(false);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to save this note. The internal notes SQL may still need to be run.",
      });
      return;
    }

    setBody("");
    await loadNotes();

    setToast({
      type: "success",
      message: "Internal note added.",
    });
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6">
      {toast ? (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      ) : null}

      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Team Notes
        </p>

        <h2 className="mt-2 text-2xl font-bold text-white">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Private Trimax notes for your team. These do not print on customer
          invoices or estimates.
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add an internal update, question, or follow-up..."
          className="min-h-28 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500"
        />

        <div className="flex justify-end">
          <Button
            onClick={handleAddNote}
            disabled={saving}
          >
            {saving ? "Saving..." : "Add Note"}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {loading ? (
          <p className="text-sm text-zinc-500">
            Loading notes...
          </p>
        ) : notes.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
            No internal notes yet.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-zinc-300">
                  {note.author_email || "Trimax user"}
                </span>
                <span>{formatDateTime(note.created_at)}</span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                {note.body}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
