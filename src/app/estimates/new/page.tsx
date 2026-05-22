"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import Card from "../../components/Card";
import Toast from "../../components/Toast";
import { supabase } from "../../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

function NewEstimatePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const queueId = searchParams.get("queueId");
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";

  const [business, setBusiness] = useState<Business | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [notes, setNotes] = useState("");

  const [sourceQueueSummary, setSourceQueueSummary] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadBusiness() {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("slug", businessSlug)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load selected business.",
        });

        return;
      }

      setBusiness(data as Business);
    }

    loadBusiness();
  }, [businessSlug]);

  useEffect(() => {
    async function loadQueueItem() {
      if (!queueId) {
        return;
      }

      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("id", queueId)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load queue item details.",
        });

        return;
      }

      const property = data.property ?? "";
      const unit = data.unit ?? "";
      const paintType = data.paint_type ?? "";
      const flooring = data.flooring ?? "";
      const moveOutDate = data.move_out_date ?? "";
      const readyDate = data.ready_date ?? "";
      const queueNotes = data.notes ?? "";

      setCustomerName(property);

      setProjectAddress(unit ? `Unit ${unit}` : "");

      setProjectTitle(
        [property, unit ? `Unit ${unit}` : "", paintType]
          .filter(Boolean)
          .join(" - ")
      );

      setNotes(
        [
          queueNotes,
          flooring ? `Flooring: ${flooring}` : "",
          moveOutDate ? `Move Out: ${moveOutDate}` : "",
          readyDate ? `Ready Date: ${readyDate}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      setSourceQueueSummary(
        [property, unit ? `Unit ${unit}` : ""]
          .filter(Boolean)
          .join(" — ")
      );
    }

    loadQueueItem();
  }, [queueId]);

  async function handleSave() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

    if (!customerName || !projectTitle || !estimateAmount) {
      setToast({
        type: "error",
        message:
          "Please fill out customer, project title, and estimate amount.",
      });

      return;
    }

    const { count } = await supabase
      .from("estimates")
      .select("*", { count: "exact", head: true });

    const nextEstimateNumber = (count ?? 0) + 1;

    const displayId = `EST-${String(nextEstimateNumber).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("estimates")
      .insert({
        business_id: business.id,
        display_id: displayId,
        queue_item_id: queueId,
        customer_name: customerName,
        project_title: projectTitle,
        project_address: projectAddress,
        estimate_amount: estimateAmount,
        notes,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message: "Failed to save estimate.",
      });

      return;
    }

    if (queueId) {
      await supabase
        .from("queue_items")
        .update({
          linked_estimate_id: data.id,
          status: "Estimate Created",
        })
        .eq("id", queueId);
    }

    setToast({
      type: "success",
      message: "Estimate created successfully.",
    });

    router.push(`/estimates/${data.id}`);
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">New Estimate</h1>

        {business && (
          <Card className="mt-6 border-orange-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Selected Business
            </p>

            <p className="mt-2 text-lg font-semibold">
              {business.name}
            </p>
          </Card>
        )}

        {sourceQueueSummary && (
          <Card className="mt-6 border-orange-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Created from Queue
            </p>

            <p className="mt-2 text-lg font-semibold">
              {sourceQueueSummary}
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
              <label className="mb-2 block text-sm text-zinc-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Estimate notes..."
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>
              Save Estimate
            </Button>
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