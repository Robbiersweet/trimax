"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import Card from "../../components/Card";
import Toast from "../../components/Toast";
import { queueItems } from "../../data/queue";

function NewEstimatePageContent() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get("queueId");

  const queueItem = queueItems.find((item) => item.id === queueId);

  const [customerName, setCustomerName] = useState(queueItem?.property ?? "");
  const [projectAddress, setProjectAddress] = useState(
    queueItem ? `Unit ${queueItem.unit}` : ""
  );
  const [estimateAmount, setEstimateAmount] = useState("");
  const [projectTitle, setProjectTitle] = useState(
    queueItem
      ? `${queueItem.property} - Unit ${queueItem.unit} ${queueItem.paintType}`
      : ""
  );
  const [notes, setNotes] = useState(
    queueItem
      ? `${queueItem.notes}\n\nFlooring: ${queueItem.flooring}\nMove Out: ${queueItem.moveOutDate}\nReady Date: ${queueItem.readyDate}`
      : ""
  );

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSave = () => {
    setToast(null);

    if (!customerName || !projectTitle || !estimateAmount) {
      setToast({
        type: "error",
        message: "Please fill out customer, project title, and estimate amount.",
      });
      return;
    }

    console.log({
      sourceQueueId: queueId,
      customerName,
      projectTitle,
      projectAddress,
      estimateAmount,
      notes,
    });

    setToast({
      type: "success",
      message: "Estimate saved successfully.",
    });
  };

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">New Estimate</h1>

        {queueItem && (
          <Card className="mt-6 border-orange-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Created from Queue
            </p>

            <p className="mt-2 text-lg font-semibold">
              {queueItem.property} — Unit {queueItem.unit}
            </p>

            <p className="mt-1 text-zinc-400">
              {queueItem.paintType} • {queueItem.flooring}
            </p>
          </Card>
        )}

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Customer Name"
              placeholder="Enter customer name"
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Title"
              placeholder="Example: North Creek Unit U6 Reno Paint"
              value={projectTitle}
              onChange={setProjectTitle}
            />

            <InputField
              label="Project Address / Unit"
              placeholder="Enter address or unit"
              value={projectAddress}
              onChange={setProjectAddress}
            />

            <InputField
              label="Estimate Amount"
              placeholder="$0.00"
              value={estimateAmount}
              onChange={setEstimateAmount}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Estimate notes..."
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>Save Estimate</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function NewEstimatePage() {
  return (
    <Suspense fallback={<div>Loading estimate form...</div>}>
      <NewEstimatePageContent />
    </Suspense>
  );
}