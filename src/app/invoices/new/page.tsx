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

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
};

function NewInvoicePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";

  const [business, setBusiness] =
    useState<Business | null>(null);

  const [clients, setClients] = useState<
    Client[]
  >([]);

  const [selectedClientId, setSelectedClientId] =
    useState("");

  const [customerName, setCustomerName] =
    useState("");

  const [projectTitle, setProjectTitle] =
    useState("");

  const [invoiceAmount, setInvoiceAmount] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  const [notes, setNotes] = useState("");

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
          message:
            "Unable to load selected business.",
        });

        return;
      }

      const businessData = data as Business;

      setBusiness(businessData);

      const { data: clientData } =
        await supabase
          .from("clients")
          .select("*")
          .eq("business_id", businessData.id)
          .order("name", {
            ascending: true,
          });

      setClients((clientData ?? []) as Client[]);
    }

    loadBusiness();
  }, [businessSlug]);

  function handleClientChange(
    clientId: string
  ) {
    setSelectedClientId(clientId);

    const client = clients.find(
      (c) => c.id === clientId
    );

    if (!client) {
      return;
    }

    setCustomerName(client.name);

    if (client.billing_address) {
      setNotes(
        `Billing Address:\n${client.billing_address}`
      );
    }
  }

  async function handleSave() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message:
          "Business is still loading.",
      });

      return;
    }

    if (
      !customerName ||
      !projectTitle ||
      !invoiceAmount
    ) {
      setToast({
        type: "error",
        message:
          "Please fill out customer, project title, and invoice amount.",
      });

      return;
    }

    const { count } = await supabase
      .from("invoices")
      .select("*", {
        count: "exact",
        head: true,
      });

    const nextInvoiceNumber =
      (count ?? 0) + 1;

    const displayId = `INV-${String(
      nextInvoiceNumber
    ).padStart(4, "0")}`;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let finalClientId =
      selectedClientId || null;

    if (!selectedClientId) {
      const {
        data: newClient,
        error: clientError,
      } = await supabase
        .from("clients")
        .insert({
          business_id: business.id,
          created_by_user_id:
            user?.id ?? null,

          name: customerName,
        })
        .select()
        .single();

      if (clientError || !newClient) {
        console.error(clientError);

        setToast({
          type: "error",
          message:
            "Unable to create client record.",
        });

        return;
      }

      finalClientId = newClient.id;
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        business_id: business.id,
        client_id: finalClientId,
        created_by_user_id:
          user?.id ?? null,

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
        message:
          "Failed to save invoice.",
      });

      return;
    }

    setToast({
      type: "success",
      message:
        "Invoice created successfully.",
    });

    router.push(
      `/invoices/${data.id}?business=${business.slug}`
    );
  }

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          New Invoice
        </h1>

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

        <Card className="mt-8">
          <div className="grid gap-5">
            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Select Existing Client
              </label>

              <select
                value={selectedClientId}
                onChange={(event) =>
                  handleClientChange(
                    event.target.value
                  )
                }
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="">
                  -- Select Client --
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

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
              placeholder="Example: Net 30"
              value={dueDate}
              onChange={setDueDate}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                placeholder="Invoice notes..."
                className="min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <Button onClick={handleSave}>
              Create Invoice
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoicePageContent />
    </Suspense>
  );
}