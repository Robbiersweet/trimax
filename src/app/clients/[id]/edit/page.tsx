"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

type Client = {
  id: string;
  business_id: string | null;
  name: string;
  contact_name: string | null;
  email: string | null;
  cc_email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
};

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const clientId = params.id as string;

  const [businessSlug, setBusinessSlug] =
    useState(searchParams.get("business") ?? "rnl-creations");
  const [businessId, setBusinessId] = useState("");

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadClient() {
      const requestedBusinessSlug =
        searchParams.get("business") ?? "rnl-creations";

      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("id, slug")
        .eq("slug", requestedBusinessSlug)
        .limit(1)
        .maybeSingle();

      const business =
        businessData as Business | null;

      if (businessError || !business) {
        setToast({
          type: "error",
          message: "Selected business was not found.",
        });
        setLoading(false);
        return;
      }

      setBusinessId(business.id);
      setBusinessSlug(business.slug);

      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("business_id", business.id)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load client for this workspace.",
        });

        setLoading(false);
        return;
      }

      const client = data as Client;

      setName(client.name ?? "");
      setContactName(client.contact_name ?? "");
      setEmail(client.email ?? "");
      setCcEmail(client.cc_email ?? "");
      setPhone(client.phone ?? "");
      setBillingAddress(client.billing_address ?? "");
      setServiceAddress(client.service_address ?? "");
      setNotes(client.notes ?? "");

      setLoading(false);
    }

    loadClient();
  }, [clientId, searchParams]);

  async function handleSave() {
    setToast(null);
    setSaving(true);

    if (!name) {
      setToast({
        type: "error",
        message: "Client name is required.",
      });

      setSaving(false);
      return;
    }

    if (!businessId) {
      setToast({
        type: "error",
        message: "Workspace is still loading. Try again in a moment.",
      });

      setSaving(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCcEmail = ccEmail.trim().toLowerCase();

    if (normalizedEmail && !normalizedEmail.includes("@")) {
      setToast({
        type: "error",
        message: "Enter a valid customer email address.",
      });

      setSaving(false);
      return;
    }

    if (normalizedCcEmail && !normalizedCcEmail.includes("@")) {
      setToast({
        type: "error",
        message: "Enter a valid CC email address.",
      });

      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("clients")
      .update({
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
      .eq("id", clientId)
      .eq("business_id", businessId);

    setSaving(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update client.",
      });

      return;
    }

    router.push(
      `/clients/${clientId}?business=${businessSlug}`
    );
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-400">
          Loading client...
        </p>
      </AppShell>
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
          Client Details
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          Edit Client
        </h1>

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
              placeholder="Example: Property Manager"
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
              placeholder="425-555-5555"
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

            <div className="flex gap-4">
              <Button onClick={handleSave}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/clients/${clientId}?business=${businessSlug}`
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
