"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

export default function EditQueueItemPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queueItemId = params.unit as string;
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";

  const [property, setProperty] = useState("");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [paintType, setPaintType] = useState("");
  const [flooring, setFlooring] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [scheduledDate, setScheduledDate] =
    useState("");
  const [completedDate, setCompletedDate] =
    useState("");
  const [notes, setNotes] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadQueueItem() {
      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("id", queueItemId)
        .single();

      if (error || !data) {
        setToast({
          type: "error",
          message: "Unable to load queue item.",
        });
        return;
      }

      setProperty(data.property ?? "");
      setUnit(data.unit ?? "");
      setStatus(data.status ?? "");
      setPriority(data.priority ?? "");
      setPaintType(data.paint_type ?? "");
      setFlooring(data.flooring ?? "");
      setMoveOutDate(data.move_out_date ?? "");
      setReadyDate(data.ready_date ?? "");
      setScheduledDate(data.scheduled_date ?? "");
      setCompletedDate(data.completed_date ?? "");
      setNotes(data.notes ?? "");
    }

    loadQueueItem();
  }, [queueItemId]);

  const handleSave = async () => {
    setToast(null);

    const { error } = await supabase
      .from("queue_items")
      .update({
        property,
        unit,
        status,
        priority,
        paint_type: paintType,
        flooring,
        move_out_date: moveOutDate || null,
        ready_date: readyDate || null,
        scheduled_date: scheduledDate || null,
        completed_date: completedDate || null,
        notes,
      })
      .eq("id", queueItemId);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message: "Unable to update queue item.",
      });
      return;
    }

    setToast({
      type: "success",
      message: "Queue item updated successfully.",
    });

    router.push(
      `/queue/${queueItemId}?business=${businessSlug}`
    );
    router.refresh();
  };

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href={`/queue/${queueItemId}?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          Back to Queue Item
        </Link>

        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax Queue
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Edit Queue Item
          </h1>
        </div>

        <Card>
          <div className="grid gap-5">
            <InputField
              label="Property"
              value={property}
              onChange={setProperty}
            />

            <InputField
              label="Unit"
              value={unit}
              onChange={setUnit}
            />

            <InputField
              label="Status"
              value={status}
              onChange={setStatus}
            />

            <InputField
              label="Priority"
              value={priority}
              onChange={setPriority}
            />

            <InputField
              label="Paint Type"
              value={paintType}
              onChange={setPaintType}
            />

            <InputField
              label="Flooring"
              value={flooring}
              onChange={setFlooring}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Move Out Date"
                value={moveOutDate}
                onChange={setMoveOutDate}
              />

              <InputField
                label="Ready Date"
                value={readyDate}
                onChange={setReadyDate}
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Scheduled Date"
                value={scheduledDate}
                onChange={setScheduledDate}
              />

              <InputField
                label="Completed Date"
                value={completedDate}
                onChange={setCompletedDate}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
