"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { createQueueItem } from "../lib/createQueueItem";

export default function NewRequestPage() {
  const router = useRouter();

  const [property, setProperty] = useState("");
  const [unit, setUnit] = useState("");
  const [paintType, setPaintType] = useState("");
  const [flooring, setFlooring] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [readyDate, setReadyDate] = useState("");
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit() {
    setToast(null);

    if (!property || !unit || !paintType || !flooring) {
      setToast({
        type: "error",
        message: "Please fill out property, unit, paint type, and flooring.",
      });
      return;
    }

    try {
      setIsSaving(true);

      await createQueueItem({
        property,
        unit,
        paintType,
        flooring,
        moveOutDate,
        readyDate,
        notes,
      });

      setToast({
        type: "success",
        message: "Queue item created successfully.",
      });

      router.push("/queue");
      router.refresh();
    } catch {
      setToast({
        type: "error",
        message: "Something went wrong while saving the queue item.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">New Queue Request</h1>

        <p className="mt-3 text-zinc-400">
          Add a new apartment turn, work request, or queue item.
        </p>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Property"
              placeholder="Example: North Creek Apartments"
              value={property}
              onChange={setProperty}
            />

            <InputField
              label="Unit"
              placeholder="Example: U6"
              value={unit}
              onChange={setUnit}
            />

            <InputField
              label="Paint Type"
              placeholder="Example: Reno Paint, Classic Paint, Primer + Paint"
              value={paintType}
              onChange={setPaintType}
            />

            <InputField
              label="Flooring"
              placeholder="Example: Keep vinyl / Replace carpet"
              value={flooring}
              onChange={setFlooring}
            />

            <InputField
              label="Move Out Date"
              placeholder="Example: 2026-06-30"
              value={moveOutDate}
              onChange={setMoveOutDate}
            />

            <InputField
              label="Ready Date"
              placeholder="Example: 2026-07-03"
              value={readyDate}
              onChange={setReadyDate}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add notes about smoke, flooring, damages, timing, or access..."
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSubmit}>
              {isSaving ? "Saving..." : "Create Queue Item"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}