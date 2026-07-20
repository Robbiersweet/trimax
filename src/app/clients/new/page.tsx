"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import Toast from "../../components/Toast";
import { supabase } from "../../lib/supabase";

export default function NewClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";

  const [name, setName] = useState("");
  const [contactName, setContactName] =
    useState("");
  const [email, setEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [billingAddress, setBillingAddress] =
    useState("");
  const [serviceAddress, setServiceAddress] =
    useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSave() {
    setToast(null);

    if (!name) {
      setToast({
        type: "error",
        message: "Client name is required.",
      });

      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCcEmail = ccEmail.trim().toLowerCase();

    if (normalizedEmail && !normalizedEmail.includes("@")) {
      setToast({
        type: "error",
        message: "Enter a valid customer email address.",
      });

      return;
    }

    if (normalizedCcEmail && !normalizedCcEmail.includes("@")) {
      setToast({
        type: "error",
        message: "Enter a valid CC email address.",
      });

      return;
    }

    setLoading(true);

    const { data: businessData } =
      await supabase
        .from("businesses")
        .select("id")
        .eq("slug", businessSlug)
        .single();

    if (!businessData?.id) {
      setLoading(false);

      setToast({
        type: "error",
        message:
          "Unable to determine business.",
      });

      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("clients")
      .insert({
        business_id: businessData.id,
        created_by_user_id:
          user?.id ?? null,

        name,
        contact_name: contactName,
        email: normalizedEmail || null,
        cc_email: normalizedCcEmail || null,
        phone,
        billing_address: billingAddress,
        service_address:
          serviceAddress || billingAddress,
        notes,
      })
      .select()
      .single();

    setLoading(false);

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message: "Failed to create client.",
      });

      return;
    }

    router.push(
      `/clients?business=${businessSlug}`
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
          New Client
        </h1>

        <p className="mt-3 text-zinc-400">
          Create a customer or property
          record.
        </p>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Client Name"
              placeholder="Example: North Creek Apartments"
              value={name}
              onChange={setName}
            />

            <InputField
              label="Contact Name"
              placeholder="Example: Sarah Johnson"
              value={contactName}
              onChange={setContactName}
            />

            <InputField
              label="Email"
              placeholder="billing@example.com"
              value={email}
              onChange={setEmail}
            />

            <InputField
              label="CC Email"
              placeholder="assistant-manager@example.com"
              value={ccEmail}
              onChange={setCcEmail}
              helperText="Optional. This customer-visible copy is used for this client's invoices, estimates, and reminders."
            />

            <InputField
              label="Phone"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={setPhone}
            />

            <InputField
              label="Billing Address"
              placeholder="123 Main St..."
              value={billingAddress}
              onChange={setBillingAddress}
            />

            <InputField
              label="Default Service Address"
              placeholder="Leave blank to use billing address"
              value={serviceAddress}
              onChange={setServiceAddress}
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
                placeholder="Internal notes..."
                className="app-form-input min-h-40 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <Button onClick={handleSave}>
                {loading
                  ? "Saving..."
                  : "Create Client"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/clients?business=${businessSlug}`
                  )
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
