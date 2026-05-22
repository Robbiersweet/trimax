"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

type Invoice = {
  id: string;
  business_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  due_date: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
};

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();

  const invoiceId = params.id as string;

  const [businessSlug, setBusinessSlug] = useState("rnl-creations");

  const [customerName, setCustomerName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadInvoice() {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load invoice.",
        });

        setLoading(false);
        return;
      }

      const invoice = data as Invoice;

      setCustomerName(invoice.customer_name ?? "");
      setProjectTitle(invoice.project_title ?? "");
      setInvoiceAmount(invoice.invoice_amount ?? "");
      setDueDate(invoice.due_date ?? "");
      setNotes(invoice.notes ?? "");

      if (invoice.business_id) {
        const { data: businessData } = await supabase
          .from("businesses")
          .select("id, slug")
          .eq("id", invoice.business_id)
          .single();

        const business = businessData as Business | null;

        if (business?.slug) {
          setBusinessSlug(business.slug);
        }
      }

      setLoading(false);
    }

    loadInvoice();
  }, [invoiceId]);

  async function handleSave() {
    setToast(null);
    setSaving(true);

    if (!customerName || !projectTitle || !invoiceAmount) {
      setToast({
        type: "error",
        message: "Customer, project title, and amount are required.",
      });

      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        customer_name: customerName,
        project_title: projectTitle,
        invoice_amount: invoiceAmount,
        due_date: dueDate,
        notes,
      })
      .eq("id", invoiceId);

    setSaving(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update invoice.",
      });

      return;
    }

    router.push(`/invoices/${invoiceId}?business=${businessSlug}`);
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-400">Loading invoice...</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Invoice Details
        </p>

        <h1 className="mt-3 text-5xl font-bold">Edit Invoice</h1>

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
              label="Invoice Amount"
              value={invoiceAmount}
              onChange={setInvoiceAmount}
            />

            <InputField
              label="Due Date"
              value={dueDate}
              onChange={setDueDate}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Notes
              </label>

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
                  router.push(`/invoices/${invoiceId}?business=${businessSlug}`)
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