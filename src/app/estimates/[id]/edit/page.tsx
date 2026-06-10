"use client";

import { useEffect, useMemo, useState } from "react";
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
import { captureServicesFromLineItems } from "../../../lib/captureServicesFromLineItems";
import { logActivity } from "../../../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../../../lib/maintenanceMode";
import { buildSplitInvoicePlan } from "../../../lib/splitInvoices";
import { supabase } from "../../../lib/supabase";
import { looksLikeApartmentUnitPaintJob } from "../../../utils/jobWorkflow";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
  getTaxSuggestionForAddress,
  type TaxMode,
} from "../../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../../utils/unitLabels";

type Estimate = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  project_address: string | null;
  service_address: string | null;
  reference: string | null;
  estimate_amount: string | null;
  tax_mode: TaxMode | string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  split_warning_enabled: boolean | null;
  split_target_amount: number | string | null;
  terms: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
  split_warning_amount: number | string | null;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
};

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  default_quantity: number | string | null;
  default_unit_price: number | string | null;
  category: string | null;
};

type SavedLineItem = {
  id: string;
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  sort_order: number | null;
};

type LineItem = {
  serviceItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function parseCurrency(value: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(/[^0-9.]/g, "");
}

function toNumber(value: number | string | null) {
  return Number(value) || 0;
}

function getLineTotal(item: LineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;

  return quantity * unitPrice;
}

function toLineItem(item: SavedLineItem): LineItem {
  return {
    serviceItemId: "",
    description: item.description ?? "",
    quantity: String(Number(item.quantity) || 1),
    unitPrice: String(Number(item.unit_price) || 0),
  };
}

export default function EditEstimatePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const estimateId = params.id as string;
  const requestedBusinessSlug =
    searchParams.get("business") ?? "rnl-creations";

  const [businessId, setBusinessId] = useState("");
  const [businessSlug, setBusinessSlug] =
    useState(requestedBusinessSlug);

  const [clients, setClients] = useState<Client[]>([]);
  const [serviceItems, setServiceItems] =
    useState<ServiceItem[]>([]);

  const [selectedClientId, setSelectedClientId] =
    useState("");

  const [customerName, setCustomerName] =
    useState("");
  const [projectTitle, setProjectTitle] =
    useState("");
  const [serviceAddress, setServiceAddress] =
    useState("");
  const [reference, setReference] = useState("");
  const [taxMode, setTaxMode] = useState<TaxMode>("taxable");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxManuallyChanged, setTaxManuallyChanged] =
    useState(false);
  const [splitWarningEnabled, setSplitWarningEnabled] =
    useState(false);
  const [splitTargetAmount, setSplitTargetAmount] =
    useState("");
  const [savedSplitWarningEnabled, setSavedSplitWarningEnabled] =
    useState(false);
  const [
    splitWarningManuallyChanged,
    setSplitWarningManuallyChanged,
  ] = useState(false);
  const [terms, setTerms] = useState(
    "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."
  );
  const [notes, setNotes] = useState("");

  const [lineItems, setLineItems] =
    useState<LineItem[]>([
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);

  const subtotal = useMemo(() => {
    return lineItems.reduce(
      (total, item) => total + getLineTotal(item),
      0
    );
  }, [lineItems]);

  const taxAmount = useMemo(() => {
    const effectiveTaxRate = getEffectiveTaxRate({
      taxMode,
      taxRate,
    });

    return subtotal * (effectiveTaxRate / 100);
  }, [subtotal, taxMode, taxRate]);

  const estimateTotal = subtotal + taxAmount;
  const [splitWarningAmount, setSplitWarningAmount] =
    useState(0);
  const effectiveSplitTargetAmount =
    toNumber(splitTargetAmount) || splitWarningAmount;
  const shouldAutoEnableSplitWarning = useMemo(() => {
    return looksLikeApartmentUnitPaintJob(
      customerName,
      projectTitle,
      lineItems
    );
  }, [customerName, projectTitle, lineItems]);
  const effectiveSplitWarningEnabled =
    splitWarningManuallyChanged
      ? splitWarningEnabled
      : savedSplitWarningEnabled || shouldAutoEnableSplitWarning;
  const showSplitWarning =
    effectiveSplitWarningEnabled &&
    effectiveSplitTargetAmount > 0 &&
    buildSplitInvoicePlan({
      subtotalAmount: subtotal,
      targetAmount: effectiveSplitTargetAmount,
      taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
    }).length > 0;
  const splitPreview = showSplitWarning
    ? buildSplitInvoicePlan({
        subtotalAmount: subtotal,
        targetAmount: effectiveSplitTargetAmount,
        taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
      })
    : null;
  const taxSuggestion =
    getTaxSuggestionForAddress(serviceAddress);
  const showTaxSuggestionNote =
    Boolean(taxSuggestion) && !taxManuallyChanged;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadEstimate() {
      const { data: selectedBusinessData, error: selectedBusinessError } =
        await supabase
          .from("businesses")
          .select("id, slug, split_warning_amount")
          .eq("slug", requestedBusinessSlug)
          .limit(1)
          .maybeSingle();

      const selectedBusiness =
        selectedBusinessData as Business | null;

      if (selectedBusinessError || !selectedBusiness) {
        setToast({
          type: "error",
          message: "Selected business was not found.",
        });

        setLoading(false);
        return;
      }

      setBusinessId(selectedBusiness.id);
      setBusinessSlug(selectedBusiness.slug);
      setSplitWarningAmount(
        toNumber(selectedBusiness.split_warning_amount ?? null)
      );

      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", estimateId)
        .eq("business_id", selectedBusiness.id)
        .limit(1);

      const estimate =
        data?.[0] as Estimate | undefined;

      if (error || !estimate) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load estimate for this workspace.",
        });

        setLoading(false);
        return;
      }

      const { data: invoiceData } =
        await supabase
          .from("invoices")
          .select("id")
          .eq("estimate_id", estimateId)
          .eq("business_id", selectedBusiness.id)
          .limit(1);

      if (invoiceData && invoiceData.length > 0) {
        router.push(
          `/estimates/${estimateId}?business=${selectedBusiness.slug}`
        );
        return;
      }

      setCustomerName(estimate.customer_name ?? "");
      setProjectTitle(estimate.project_title ?? "");
      setServiceAddress(
        estimate.service_address ??
          estimate.project_address ??
          ""
      );
      setReference(estimate.reference ?? "");
      setTaxMode(
        estimate.tax_mode === "no_tax" ||
          estimate.tax_mode === "tax_exempt"
          ? estimate.tax_mode
          : "taxable"
      );
      setTaxLabel(
        estimate.tax_label && estimate.tax_label !== "Tax"
          ? estimate.tax_label
          : ""
      );
      setTaxRate(
        toNumber(estimate.tax_rate) > 0
          ? String(toNumber(estimate.tax_rate))
          : ""
      );
      setTaxNumber(estimate.tax_number ?? "");
      const hasSavedTax =
        Boolean(estimate.tax_label && estimate.tax_label !== "Tax") ||
        toNumber(estimate.tax_rate) > 0;

      setTaxManuallyChanged(hasSavedTax);

      const savedServiceAddress =
        estimate.service_address ??
        estimate.project_address ??
        "";

      if (!hasSavedTax && savedServiceAddress) {
        const suggestion = getTaxSuggestionForAddress(
          savedServiceAddress
        );

        if (suggestion) {
          setTaxLabel(suggestion.label);
          setTaxRate(suggestion.rate);
        }
      }
      setSplitWarningEnabled(
        Boolean(estimate.split_warning_enabled)
      );
      setSplitTargetAmount(
        estimate.split_target_amount
          ? String(toNumber(estimate.split_target_amount))
          : ""
      );
      setSavedSplitWarningEnabled(
        Boolean(estimate.split_warning_enabled)
      );
      setTerms(
        estimate.terms ??
          "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."
      );
      setNotes(estimate.notes ?? "");
      setSelectedClientId(estimate.client_id ?? "");

      const { data: clientRows } =
        await supabase
          .from("clients")
          .select("*")
          .eq("business_id", selectedBusiness.id)
          .order("name", {
            ascending: true,
          });

      setClients((clientRows ?? []) as Client[]);

      const { data: serviceData } =
        await supabase
          .from("service_items")
          .select("*")
          .eq("business_id", selectedBusiness.id)
          .eq("is_active", true)
          .order("category", {
            ascending: true,
          })
          .order("name", {
            ascending: true,
          });

      setServiceItems(
        (serviceData ?? []) as ServiceItem[]
      );

      const { data: lineItemData } =
        await supabase
          .from("estimate_line_items")
          .select("*")
          .eq("estimate_id", estimateId)
          .order("sort_order", {
            ascending: true,
          });

      const savedLineItems =
        (lineItemData ?? []) as SavedLineItem[];

      if (savedLineItems.length > 0) {
        setLineItems(savedLineItems.map(toLineItem));
      } else {
        setLineItems([
          {
            serviceItemId: "",
            description:
              estimate.project_title ?? "",
            quantity: "1",
            unitPrice: parseCurrency(
              estimate.estimate_amount
            ),
          },
        ]);
      }

      setLoading(false);
    }

    loadEstimate();
  }, [estimateId, router, requestedBusinessSlug]);

  function applyTaxSuggestion(address: string) {
    if (taxManuallyChanged) {
      return;
    }

    const suggestion =
      getTaxSuggestionForAddress(address);

    if (!suggestion) {
      setTaxLabel("");
      setTaxRate("");
      return;
    }

    setTaxLabel(suggestion.label);
    setTaxRate(suggestion.rate);
  }

  function handleServiceAddressChange(address: string) {
    setServiceAddress(address);
    applyTaxSuggestion(address);
  }

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);

    const client = clients.find(
      (clientItem) => clientItem.id === clientId
    );

    if (!client) {
      return;
    }

    setCustomerName(client.name);

    const clientServiceAddress =
      client.service_address ||
      client.billing_address ||
      "";

    if (clientServiceAddress) {
      setServiceAddress(clientServiceAddress);
      applyTaxSuggestion(clientServiceAddress);
    }
  }

  function updateLineItem(
    index: number,
    field: keyof LineItem,
    value: string
  ) {
    setLineItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function handleServiceChange(
    index: number,
    serviceItemId: string
  ) {
    const selectedService = serviceItems.find(
      (serviceItem) => serviceItem.id === serviceItemId
    );

    if (!selectedService) {
      updateLineItem(index, "serviceItemId", "");
      return;
    }

    setLineItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              serviceItemId,
              description:
                selectedService.description ||
                selectedService.name,
              quantity: String(
                Number(
                  selectedService.default_quantity
                ) || 1
              ),
              unitPrice: String(
                Number(
                  selectedService.default_unit_price
                ) || 0
              ),
            }
          : item
      )
    );
  }

  function addLineItem() {
    setLineItems((currentItems) => [
      ...currentItems,
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems((currentItems) =>
      currentItems.length === 1
        ? currentItems
        : currentItems.filter(
            (_item, itemIndex) => itemIndex !== index
          )
    );
  }

  async function handleSave() {
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Trimax is being updated. Try again in a few minutes.",
      });
      return;
    }

    setSaving(true);

    const validLineItems = lineItems.filter(
      (item) =>
        item.description.trim() &&
        getLineTotal(item) > 0
    );

    if (
      !customerName ||
      !projectTitle ||
      validLineItems.length === 0
    ) {
      setToast({
        type: "error",
        message:
          "Customer, project title, and at least one line item are required.",
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

    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
        .eq("business_id", businessId)
        .limit(1);

    if (invoiceData && invoiceData.length > 0) {
      setToast({
        type: "error",
        message:
          "This estimate has already been converted to an invoice.",
      });

      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let finalClientId = selectedClientId || null;

    if (!selectedClientId) {
      const {
        data: newClient,
        error: clientError,
      } = await supabase
        .from("clients")
        .insert({
          business_id: businessId,
          created_by_user_id:
            user?.id ?? null,
          name: customerName,
          billing_address: serviceAddress,
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

        setSaving(false);
        return;
      }

      finalClientId = newClient.id;
    }

    const { error } = await supabase
      .from("estimates")
      .update({
        client_id: finalClientId,
        customer_name: customerName,
        project_title: projectTitle,
        project_address: serviceAddress,
        service_address: serviceAddress,
        reference: maybeCanonicalApartmentUnitLabel(reference),
        estimate_amount:
          formatCurrency(estimateTotal),
        tax_mode: taxMode,
        tax_label: taxLabel.trim() || null,
        tax_rate: getEffectiveTaxRate({ taxMode, taxRate }),
        tax_number:
          taxMode === "taxable" ? taxNumber.trim() || null : null,
        split_warning_enabled: effectiveSplitWarningEnabled,
        split_target_amount:
          effectiveSplitWarningEnabled &&
          effectiveSplitTargetAmount > 0
            ? effectiveSplitTargetAmount
            : null,
        terms,
        notes,
      })
      .eq("id", estimateId)
      .eq("business_id", businessId);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update estimate.",
      });

      setSaving(false);
      return;
    }

    const { error: deleteError } =
      await supabase
        .from("estimate_line_items")
        .delete()
        .eq("estimate_id", estimateId)
        .eq("business_id", businessId);

    if (deleteError) {
      console.error(deleteError);

      setToast({
        type: "error",
        message:
          "Estimate saved, but old line items could not be replaced.",
      });

      setSaving(false);
      return;
    }

    const { error: lineItemError } =
      await supabase
        .from("estimate_line_items")
        .insert(
          validLineItems.map((item, index) => ({
            estimate_id: estimateId,
            business_id: businessId,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unitPrice) || 0,
            line_total: getLineTotal(item),
            sort_order: index,
          }))
        );

    setSaving(false);

    if (lineItemError) {
      console.error(lineItemError);

      setToast({
        type: "error",
        message:
          "Estimate saved, but line items could not be saved.",
      });

      return;
    }

    await captureServicesFromLineItems({
      businessId,
      lineItems: validLineItems,
    });

    await logActivity({
      businessId: businessId || null,
      action: "estimate.updated",
      entityType: "estimate",
      entityId: estimateId,
      entityLabel: projectTitle || customerName,
      details: {
        customerName,
        projectTitle,
        amount: formatCurrency(estimateTotal),
        lineItemCount: validLineItems.length,
        splitWarningEnabled: effectiveSplitWarningEnabled,
      },
    });

    router.push(
      `/estimates/${estimateId}?business=${businessSlug}`
    );
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-400">
          Loading estimate...
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

      <div className="mx-auto max-w-4xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Estimate Details
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          Edit Estimate
        </h1>

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
                  -- Create / use typed customer --
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
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Title"
              value={projectTitle}
              onChange={setProjectTitle}
            />

            <InputField
              label="Service Address"
              value={serviceAddress}
              onChange={handleServiceAddressChange}
            />

            <InputField
              label="Reference"
              placeholder="Example: Unit 204, PO #123, X4"
              value={reference}
              onChange={setReference}
            />

            <div className="grid gap-5 md:grid-cols-3">
              <TaxModeSelect value={taxMode} onChange={setTaxMode} />

              <InputField
                label="Tax Label"
                placeholder="Snohomish"
                value={taxLabel}
                onChange={(value) => {
                  setTaxManuallyChanged(true);
                  setTaxLabel(value);
                }}
              />

              <InputField
                label="Tax Rate (%)"
                type="number"
                placeholder="9.9"
                value={taxRate}
                onChange={(value) => {
                  setTaxManuallyChanged(true);
                  setTaxRate(value);
                }}
              />

              <InputField
                label="Tax Number"
                placeholder="Optional"
                value={taxNumber}
                onChange={setTaxNumber}
              />
            </div>

            {taxMode === "no_tax" ? (
              <p className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                No tax selected. Trimax will calculate this estimate with a
                $0.00 tax line.
              </p>
            ) : null}

            {taxMode === "tax_exempt" ? (
              <p className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                Tax exempt selected. Trimax will show Tax exempt with a $0.00
                tax line.
              </p>
            ) : null}

            {showTaxSuggestionNote ? (
              <p className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm leading-6 text-orange-100/80">
                Tax suggestion applied from service address. You can override
                the tax label or rate.
              </p>
            ) : null}

            {shouldAutoEnableSplitWarning &&
            !splitWarningManuallyChanged &&
            !savedSplitWarningEnabled ? (
              <p className="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm leading-6 text-purple-100/80">
                Apartment unit paint billing detected. Split warning is on for
                this job only. Fence, tree, remodel, and other general project
                estimates stay normal unless you turn this on yourself.
              </p>
            ) : null}

            <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <input
                type="checkbox"
                checked={effectiveSplitWarningEnabled}
                onChange={(event) => {
                  setSplitWarningManuallyChanged(true);
                  setSplitWarningEnabled(event.target.checked);
                }}
                className="mt-1 h-5 w-5 accent-orange-500"
              />

              <span>
                <span className="block font-semibold text-white">
                  Use apartment split warning for this job
                </span>

                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  Turn this on only for unit paint work that should stay below
                  the approved invoice amount. Leave it off for normal jobs,
                  including North Creek fences, trees, repairs, or remodels.
                </span>
              </span>
            </label>

            <InputField
              label="Split Target Amount"
              type="number"
              placeholder={
                splitWarningAmount > 0
                  ? `Default: ${formatCurrency(splitWarningAmount)}`
                  : "Example: 1300"
              }
              value={splitTargetAmount}
              onChange={setSplitTargetAmount}
            />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">
                  Line Items
                </h2>

                <Button
                  variant="secondary"
                  onClick={addLineItem}
                >
                  Add Line
                </Button>
              </div>

              <div className="mt-4 grid gap-4">
                {lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div>
                      <label className="mb-2 block text-sm text-zinc-400">
                        Saved Service
                      </label>

                      <select
                        value={item.serviceItemId}
                        onChange={(event) =>
                          handleServiceChange(
                            index,
                            event.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                      >
                        <option value="">
                          -- Custom Line Item --
                        </option>

                        {serviceItems.map((serviceItem) => (
                          <option
                            key={serviceItem.id}
                            value={serviceItem.id}
                          >
                            {serviceItem.category
                              ? `${serviceItem.category} - ${serviceItem.name}`
                              : serviceItem.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_120px_auto]">
                      <InputField
                        label="Description"
                        placeholder="Labor, materials, paint..."
                        value={item.description}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "description",
                            value
                          )
                        }
                      />

                      <InputField
                        label="Qty"
                        type="number"
                        value={item.quantity}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "quantity",
                            value
                          )
                        }
                      />

                      <InputField
                        label="Unit Price"
                        type="number"
                        value={item.unitPrice}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "unitPrice",
                            value
                          )
                        }
                      />

                      <div>
                        <p className="mb-2 text-sm text-zinc-400">
                          Total
                        </p>

                        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-semibold text-orange-400">
                          {formatCurrency(
                            getLineTotal(item)
                          )}
                        </p>
                      </div>

                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            removeLineItem(index)
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ml-auto mt-6 grid max-w-sm gap-3 text-sm">
                <SummaryRow
                  label="Subtotal"
                  value={formatCurrency(subtotal)}
                />

                <SummaryRow
                  label={formatTaxSummaryLabel({
                    label: taxLabel,
                    rate: taxRate,
                    taxNumber,
                    taxMode,
                  })}
                  value={formatCurrency(taxAmount)}
                />

                <div className="border-t border-zinc-700 pt-3">
                  <SummaryRow
                    label="Estimate Total"
                    value={formatCurrency(estimateTotal)}
                    strong
                  />
                </div>
              </div>

              {showSplitWarning && (
                <div className="mt-6 rounded-2xl border border-yellow-500/60 bg-yellow-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
                    Split Warning
                  </p>

                  <p className="mt-2 text-lg font-semibold text-yellow-100">
                    This estimate would be over{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} after tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                    Consider splitting this apartment work into smaller invoices
                    or estimates before sending.
                  </p>
                </div>
              )}

              {splitPreview && (
                <div className="mt-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
                    Split Preview
                  </p>

                  <p className="mt-2 text-lg font-semibold text-orange-100">
                    This would become {splitPreview.length} invoices after
                    conversion. No split invoice would exceed{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} including tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-orange-100/80">
                    Save the estimate first. When it is converted, Trimax will
                    create the split invoice drafts automatically.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Scope of Work
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                placeholder="Describe the project scope..."
                className="min-h-32 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Terms
              </label>

              <textarea
                value={terms}
                onChange={(event) =>
                  setTerms(event.target.value)
                }
                placeholder="Estimate terms..."
                className="min-h-32 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
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
                    `/estimates/${estimateId}?business=${businessSlug}`
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

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-lg font-bold text-orange-400" : ""
      }`}
    >
      <span className="text-zinc-400">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}
