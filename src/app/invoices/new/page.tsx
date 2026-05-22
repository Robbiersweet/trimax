"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import Card from "../../components/Card";
import Toast from "../../components/Toast";
import { supabase } from "../../lib/supabase";

export default function NewInvoicePage() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSave() {
    setToast(null);

    if (!customerName || !projectTitle || !invoiceAmount) {
      setToast({
        type: "error",
        message: "Please fill out customer, project title, and invoice amount.",
      });

      return;
    }

    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });

    const nextInvoiceNumber = (count ?? 0) + 1;
    const displayId = `INV-${String(nextInvoiceNumber).padStart(4, "0")}`;

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        display_id: displayId,
        customer_name: customerName,
        project_title: projectTitle,
        invoice_amount: invoiceAmount,
        due_date: dueDate,
        notes,
        status: "Draft",
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message: "Failed to save invoice.",
      });

      return;
    }

    setToast({
      type: "success",
      message: "Invoice created successfully.",
    });

    router.push(`/invoices/${data.id}`);
  }

  return (
    <AppShell>
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">New Invoice</h1>

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
              placeholder="Example: Unit 204 Turn"
              value={projectTitle}
              onChange={setProjectTitle}
            />

            <InputField
              label="Invoice Amount"
              placeholder="$0.00"
              value={invoiceAmount}
              onChange={setInvoiceAmount}
            />

            <InputField
              label="Due Date"
              placeholder="Example: Net 30 or Due Upon Receipt"
              value={dueDate}
              onChange={setDueDate}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Invoice notes..."
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>Save Invoice</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}