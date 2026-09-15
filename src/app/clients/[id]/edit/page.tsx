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
import TaxModeSelect from "../../../components/TaxModeSelect";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";
import type { TaxMode } from "../../../utils/tax";

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
  tax_mode?: TaxMode | string | null;
  tax_label?: string | null;
  tax_rate?: number | string | null;
  tax_number?: string | null;
  auto_split_enabled?: boolean | null;
  split_target_amount?: number | string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
};

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  default_unit_price: number | string | null;
};

type ServiceOverride = {
  id?: string;
  client_id: string | null;
  service_item_id: string | null;
  unit_price: number | string | null;
  description: string | null;
  is_active: boolean | null;
};

function toNumber(value: number | string | null | undefined) {
  return Number(value) || 0;
}

function formatCurrency(value: number | string | null | undefined) {
  return `$${toNumber(value).toFixed(2)}`;
}

function isMissingCommercialSettingsColumnError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("tax_mode") ||
      error?.message?.includes("tax_label") ||
      error?.message?.includes("tax_rate") ||
      error?.message?.includes("tax_number") ||
      error?.message?.includes("auto_split_enabled") ||
      error?.message?.includes("split_target_amount")
  );
}

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
  const [taxMode, setTaxMode] = useState<TaxMode>("taxable");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(false);
  const [splitTargetAmount, setSplitTargetAmount] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceOverrides, setServiceOverrides] = useState<
    Record<string, string>
  >({});
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
      setTaxMode(
        client.tax_mode === "no_tax" || client.tax_mode === "tax_exempt"
          ? client.tax_mode
          : "taxable"
      );
      setTaxLabel(client.tax_label ?? "");
      setTaxRate(
        toNumber(client.tax_rate) > 0
          ? String(toNumber(client.tax_rate))
          : ""
      );
      setTaxNumber(client.tax_number ?? "");
      setAutoSplitEnabled(Boolean(client.auto_split_enabled));
      setSplitTargetAmount(
        toNumber(client.split_target_amount) > 0
          ? String(toNumber(client.split_target_amount))
          : ""
      );
      setNotes(client.notes ?? "");

      const { data: serviceData } = await supabase
        .from("service_items")
        .select("id, name, description, category, default_unit_price")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      setServices((serviceData ?? []) as ServiceItem[]);

      const { data: overrideData, error: overrideError } = await supabase
        .from("client_service_overrides")
        .select("*")
        .eq("business_id", business.id)
        .eq("client_id", clientId)
        .eq("is_active", true);

      if (!overrideError) {
        const nextOverrides = ((overrideData ?? []) as ServiceOverride[]).reduce<
          Record<string, string>
        >((result, override) => {
          if (override.service_item_id && toNumber(override.unit_price) > 0) {
            result[override.service_item_id] = String(
              toNumber(override.unit_price)
            );
          }

          return result;
        }, {});

        setServiceOverrides(nextOverrides);
      }

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

    const baseClientPayload = {
      name,
      contact_name: contactName,
      email: normalizedEmail || null,
      cc_email: normalizedCcEmail || null,
      phone,
      billing_address: billingAddress,
      service_address:
        serviceAddress || billingAddress,
      notes,
    };
    const commercialClientPayload = {
      ...baseClientPayload,
      tax_mode: taxMode,
      tax_label:
        taxMode === "taxable" ? taxLabel.trim() || null : null,
      tax_rate:
        taxMode === "taxable" ? Number(taxRate) || 0 : 0,
      tax_number:
        taxMode === "taxable" ? taxNumber.trim() || null : null,
      auto_split_enabled: autoSplitEnabled,
      split_target_amount:
        autoSplitEnabled && Number(splitTargetAmount) > 0
          ? Number(splitTargetAmount)
          : null,
    };

    let { error } = await supabase
      .from("clients")
      .update(commercialClientPayload)
      .eq("id", clientId)
      .eq("business_id", businessId);

    let savedWithoutCommercialSettings = false;

    if (isMissingCommercialSettingsColumnError(error)) {
      const fallback = await supabase
        .from("clients")
        .update(baseClientPayload)
        .eq("id", clientId)
        .eq("business_id", businessId);

      error = fallback.error;
      savedWithoutCommercialSettings = !fallback.error;
    }

    setSaving(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update client.",
      });

      return;
    }

    if (savedWithoutCommercialSettings) {
      setToast({
        type: "error",
        message:
          "Client saved. Run the property commercial settings SQL before tax, split, and override settings can be saved.",
      });
      return;
    }

    const activeOverrides = Object.entries(serviceOverrides)
      .map(([serviceItemId, unitPrice]) => ({
        serviceItemId,
        unitPrice: Number(unitPrice) || 0,
      }))
      .filter((override) => override.unitPrice > 0);

    if (activeOverrides.length > 0) {
      const { error: overrideError } = await supabase
        .from("client_service_overrides")
        .upsert(
          activeOverrides.map((override) => ({
            business_id: businessId,
            client_id: clientId,
            service_item_id: override.serviceItemId,
            unit_price: override.unitPrice,
            is_active: true,
          })),
          {
            onConflict: "business_id,client_id,service_item_id",
          }
        );

      if (overrideError) {
        console.error(overrideError);
        setToast({
          type: "error",
          message:
            "Client saved, but service price overrides need the property-pricing SQL migration.",
        });
        return;
      }
    }

    const clearedOverrideServiceIds = services
      .map((service) => service.id)
      .filter(
        (serviceId) =>
          !activeOverrides.some(
            (override) => override.serviceItemId === serviceId
          )
      );

    if (clearedOverrideServiceIds.length > 0) {
      const { error: clearOverrideError } = await supabase
        .from("client_service_overrides")
        .update({ is_active: false })
        .eq("business_id", businessId)
        .eq("client_id", clientId)
        .in("service_item_id", clearedOverrideServiceIds);

      if (
        clearOverrideError &&
        !clearOverrideError.message.includes("client_service_overrides")
      ) {
        console.error(clearOverrideError);
        setToast({
          type: "error",
          message:
            "Client saved, but cleared service overrides could not be updated.",
        });
        return;
      }
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

            <div className="grid gap-5 md:grid-cols-3">
              <TaxModeSelect value={taxMode} onChange={setTaxMode} />

              <InputField
                label="Tax Label"
                placeholder="Snohomish"
                value={taxLabel}
                onChange={setTaxLabel}
              />

              <InputField
                label="Tax Rate (%)"
                type="number"
                preventWheelChange
                placeholder="9.9"
                value={taxRate}
                onChange={setTaxRate}
              />

              <InputField
                label="Tax Number"
                placeholder="Optional"
                value={taxNumber}
                onChange={setTaxNumber}
              />
            </div>

            <label className="document-option-card flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <input
                type="checkbox"
                checked={autoSplitEnabled}
                onChange={(event) =>
                  setAutoSplitEnabled(event.target.checked)
                }
                className="mt-1 h-5 w-5 accent-orange-500"
              />

              <span>
                <span className="block font-semibold text-white">
                  Auto-split apartment paint estimates for this client
                </span>
                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  When enabled, matching apartment paint estimates can create
                  split invoice drafts at conversion using this client&apos;s target
                  amount.
                </span>
              </span>
            </label>

            <InputField
              label="Split Target Amount"
              type="number"
              preventWheelChange
              placeholder="Example: 1300"
              value={splitTargetAmount}
              onChange={setSplitTargetAmount}
            />

            {services.length > 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                <h2 className="text-lg font-semibold text-white">
                  Service Price Overrides
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Leave blank to use the shared saved-service price.
                </p>

                <div className="mt-4 grid gap-3">
                  {services.map((service) => (
                    <InputField
                      key={service.id}
                      label={`${service.category ? `${service.category} - ` : ""}${service.name}`}
                      type="number"
                      preventWheelChange
                      placeholder={`Default ${formatCurrency(service.default_unit_price)}`}
                      value={serviceOverrides[service.id] ?? ""}
                      onChange={(value) =>
                        setServiceOverrides((current) => ({
                          ...current,
                          [service.id]: value,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}

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
