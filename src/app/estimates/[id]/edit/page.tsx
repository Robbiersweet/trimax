"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

type Estimate = {
  id: string;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  estimate_amount: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
};

export default function EditEstimatePage() {
  const params = useParams();
  const router = useRouter();

  const estimateId = params.id as string;

  const [businessSlug, setBusinessSlug] = useState("rnl-creations");

  const [customerName, setCustomerName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadEstimate() {
      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", estimateId)
        .limit(1);

      const estimate = data?.[0] as Estimate | undefined;

      if (error || !estimate) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load estimate.",
        });

        setLoading(false);
        return;
      }

      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
        .limit(1);

      if (invoiceData && invoiceData.length > 0) {
        router.push(`/estimates/${estimateId}`);
        return;
      }

      setCustomerName(estimate.customer_name ?? "");
      setProjectTitle(estimate.project_title ?? "");
      setProjectAddress(estimate.project_address ?? "");
      setEstimateAmount(estimate.estimate_amount ?? "");
      setNotes(estimate.notes ?? "");

      if (estimate.business_id) {
        const { data: businessRows } = await supabase
          .from("businesses")
          .select("id, slug")
          .eq("id", estimate.business_id)
          .limit(1);

        const business = businessRows?.[0] as Business | undefined;

        if (business?.slug) {
          setBusinessSlug(business.slug);
        }
      }

      setLoading(false);
    }

    loadEstimate();
  }, [estimateId, router]);

  async function handleSave() {
    setToast(null);
    setSaving(true);

    if (!customerName || !projectTitle || !estimateAmount) {
      setToast({
        type: "error",
        message: "Customer, project title, and amount are required.",
      });

      setSaving(false);
      return;
    }

    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("id")
      .eq("estimate_id", estimateId)
      .limit(1);

    if (invoiceData && invoiceData.length > 0) {
      setToast({
        type: "error",
        message: "This estimate has already been converted to an invoice.",
      });

      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("estimates")
      .update({
        customer_name: customerName,
        project_title: projectTitle,
        project_address: projectAddress,
        estimate_amount: estimateAmount,
        notes,
      })
      .eq("id", estimateId);

    setSaving(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update estimate.",
      });

      return;
    }

    router.push(`/estimates/${estimateId}?business=${businessSlug}`);
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-400">Loading estimate...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Estimate Details
        </p>

        <h1 className="mt-3 text-5xl font-bold">Edit Estimate</h1>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Customer Name"
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Title"
              value={projectTitle}
              onChange={setProjectTitle}
            />

            <InputField
              label="Project Address / Unit"
              value={projectAddress}
              onChange={setProjectAddress}
            />

            <InputField
              label="Estimate Amount"
              value={estimateAmount}
              onChange={setEstimateAmount}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex gap-4">
              <Button onClick={handleSave}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.push(`/estimates/${estimateId}?business=${businessSlug}`)
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}