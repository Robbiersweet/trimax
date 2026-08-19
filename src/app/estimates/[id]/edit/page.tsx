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
import { logActivity } from "../../../lib/activityLog";
import {
  calculateDiscountedDocumentTotals,
  discountDisplayLabel,
  isDiscountLine,
  parseDiscountFromLineItem,
  type DiscountType,
} from "../../../lib/documentDiscounts";
import {
  serviceSearchText,
  uniqueSavedServices,
} from "../../../lib/savedServicePresentation";
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
  easy_unit_price?: number | string | null;
  normal_unit_price?: number | string | null;
  difficult_unit_price?: number | string | null;
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

function servicePricingTiers(serviceItem: ServiceItem | null) {
  if (!serviceItem) {
    return [];
  }

  return [
    {
      label: "Easy",
      price: Number(serviceItem.easy_unit_price) || 0,
    },
    {
      label: "Normal",
      price: Number(serviceItem.normal_unit_price) || 0,
    },
    {
      label: "Difficult",
      price: Number(serviceItem.difficult_unit_price) || 0,
    },
  ].filter((tier) => tier.price > 0);
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
  const [serviceSearch, setServiceSearch] = useState("");

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
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] =
    useState<DiscountType>("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");

  const [lineItems, setLineItems] =
    useState<LineItem[]>([
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  const visibleServiceItems = useMemo(() => {
    const normalizedSearch = serviceSearch.trim().toLowerCase();
    const uniqueServices = uniqueSavedServices(serviceItems);

    if (!normalizedSearch) {
      return uniqueServices;
    }

    return uniqueServices.filter((service) =>
      serviceSearchText(service).includes(normalizedSearch)
    );
  }, [serviceItems, serviceSearch]);

  const subtotal = useMemo(() => {
    return lineItems.reduce(
      (total, item) => total + getLineTotal(item),
      0
    );
  }, [lineItems]);

  const documentTotals = useMemo(() => {
    const effectiveTaxRate = getEffectiveTaxRate({
      taxMode,
      taxRate,
    });

    return calculateDiscountedDocumentTotals({
      lineSubtotal: subtotal,
      taxRate: effectiveTaxRate,
      discount: {
        enabled: discountEnabled,
        type: discountType,
        value: discountValue,
        label: discountLabel,
      },
    });
  }, [discountEnabled, discountLabel, discountType, discountValue, subtotal, taxMode, taxRate]);

  const taxAmount = documentTotals.taxAmount;
  const discountAmount = documentTotals.discountAmount;
  const estimateTotal = documentTotals.total;
  const [splitWarningAmount, setSplitWarningAmount] =
    useState(0);
  const effectiveSplitTargetAmount =
    toNumber(splitTargetAmount) || splitWarningAmount;
  const automaticSplitPlan = useMemo(
    () =>
      effectiveSplitTargetAmount > 0
        ? buildSplitInvoicePlan({
            subtotalAmount: documentTotals.taxableSubtotal,
            targetAmount: effectiveSplitTargetAmount,
            taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
          })
        : [],
    [documentTotals.taxableSubtotal, effectiveSplitTargetAmount, taxMode, taxRate]
  );
  const looksLikeApartmentSplitJob = useMemo(() => {
    return looksLikeApartmentUnitPaintJob(
      customerName,
      projectTitle,
      lineItems
    );
  }, [customerName, projectTitle, lineItems]);
  const shouldAutoEnableSplitWarning =
    looksLikeApartmentSplitJob && automaticSplitPlan.length > 0;
  const effectiveSplitWarningEnabled =
    splitWarningManuallyChanged
      ? splitWarningEnabled
      : savedSplitWarningEnabled || shouldAutoEnableSplitWarning;
  const showSplitWarning =
    effectiveSplitWarningEnabled &&
    automaticSplitPlan.length > 0;
  const splitPreview = showSplitWarning
    ? automaticSplitPlan
    : null;
  const taxSuggestion =
    getTaxSuggestionForAddress(serviceAddress);
  const showTaxSuggestionNote =
    Boolean(taxSuggestion) && !taxManuallyChanged;
  const readyLineItems = lineItems.filter(
    (item) =>
      item.description.trim() &&
      getLineTotal(item) > 0
  );
  const editorWarnings = [
    !serviceAddress.trim()
      ? "No service address is saved, so tax and site context may be weaker."
      : null,
    readyLineItems.length !== lineItems.length
      ? "One or more line items will not save until it has a description and price."
      : null,
    showSplitWarning
      ? `Conversion will create ${automaticSplitPlan.length} split invoice drafts.`
      : null,
    showTaxSuggestionNote
      ? "Tax was suggested from the service address and can still be overridden."
      : null,
  ].filter(Boolean) as string[];

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
      const savedDiscount = savedLineItems
        .map((item) =>
          parseDiscountFromLineItem({
            description: item.description,
            lineTotal: item.line_total,
            unitPrice: item.unit_price,
          })
        )
        .find(Boolean);

      if (savedDiscount) {
        setDiscountEnabled(true);
        setDiscountType(savedDiscount.type);
        setDiscountValue(String(savedDiscount.value));
        setDiscountLabel(savedDiscount.label ?? "");
      }

      const editableLineItems = savedLineItems.filter(
        (item) => !isDiscountLine(item.description)
      );

      if (editableLineItems.length > 0) {
        setLineItems(editableLineItems.map(toLineItem));
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

    const tiers = servicePricingTiers(selectedService);
    const normalTier = tiers.find((tier) => tier.label === "Normal");
    const suggestedUnitPrice =
      normalTier?.price || Number(selectedService.default_unit_price) || 0;

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
              unitPrice: String(suggestedUnitPrice),
            }
          : item
      )
    );
  }

  function applyServiceTier(index: number, price: number) {
    updateLineItem(index, "unitPrice", String(price));
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
    const discountLineItem =
      discountAmount > 0
        ? {
            serviceItemId: "",
            description: discountDisplayLabel({
              enabled: discountEnabled,
              type: discountType,
              value: discountValue,
              label: discountLabel,
            }),
            quantity: "1",
            unitPrice: String(-discountAmount),
          }
        : null;
    const saveLineItems = discountLineItem
      ? [...validLineItems, discountLineItem]
      : validLineItems;

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
          saveLineItems.map((item, index) => ({
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
        lineItemCount: saveLineItems.length,
        discountAmount: formatCurrency(discountAmount),
        discountLabel: discountLabel.trim() || null,
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

        <Card className="mt-5 border-orange-500/25 bg-zinc-950/70 p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="grid gap-2 sm:grid-cols-4">
              <SummaryMetric label="Status" value={editorWarnings.length > 0 ? "Needs review" : "Estimate ready"} />
              <SummaryMetric label="Total" value={formatCurrency(estimateTotal)} strong />
              <SummaryMetric label="Priced Lines" value={String(readyLineItems.length)} />
              <SummaryMetric
                label="Automatic Split"
                value={showSplitWarning ? `${automaticSplitPlan.length} invoices` : "Off"}
              />
            </div>
            <Button onClick={handleSave}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
          {editorWarnings.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {editorWarnings.map((warning) => (
                <div
                  key={warning}
                  className="estimate-editor-signal"
                  data-tone={
                    warning.includes("will create") ||
                    warning.includes("suggested")
                      ? "info"
                      : "warning"
                  }
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </Card>

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
                preventWheelChange
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
              <p className="document-note-panel rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                No tax selected. Trimax will calculate this estimate with a
                $0.00 tax line.
              </p>
            ) : null}

            {taxMode === "tax_exempt" ? (
              <p className="document-note-panel rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                Tax exempt selected. Trimax will show Tax exempt with a $0.00
                tax line.
              </p>
            ) : null}

            {showTaxSuggestionNote ? (
              <p className="document-info-panel rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm leading-6 text-orange-100/80">
                Tax suggestion applied from service address. You can override
                the tax label or rate.
              </p>
            ) : null}

            {shouldAutoEnableSplitWarning &&
            !splitWarningManuallyChanged &&
            !savedSplitWarningEnabled ? (
              <p className="document-info-panel rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm leading-6 text-purple-100/80">
                Apartment paint billing detected over the split threshold.
                Trimax will automatically prepare this estimate for split
                invoice drafts when it is converted.
              </p>
            ) : null}

            <label className="document-option-card flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
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
                  Split this apartment paint estimate when it becomes an invoice
                </span>

                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  Leave this on for North Creek apartment paint work that
                  should stay below the approved invoice amount. Turn it on
                  manually for another estimate only when you truly want Trimax
                  to create split drafts.
                </span>
              </span>
            </label>

            <InputField
              label="Split Target Amount"
              type="number"
              preventWheelChange
              placeholder={
                splitWarningAmount > 0
                  ? `Default: ${formatCurrency(splitWarningAmount)}`
                  : "Example: 1300"
              }
              value={splitTargetAmount}
              onChange={setSplitTargetAmount}
            />

            <div className="document-line-items-panel rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
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

              <div className="mt-3">
                <InputField
                  label="Find Saved Service"
                  placeholder="Search saved services or choose Custom Line Item"
                  value={serviceSearch}
                  onChange={setServiceSearch}
                />
              </div>

              <div className="mt-4 grid gap-4">
                {lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="document-line-item-row grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
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

                        {visibleServiceItems.map((serviceItem) => (
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

                      {servicePricingTiers(
                        serviceItems.find(
                          (serviceItem) => serviceItem.id === item.serviceItemId
                        ) ?? null
                      ).length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-100">
                            Choose pricing tier
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {servicePricingTiers(
                              serviceItems.find(
                                (serviceItem) =>
                                  serviceItem.id === item.serviceItemId
                              ) ?? null
                            ).map((tier) => (
                              <button
                                key={tier.label}
                                type="button"
                                onClick={() =>
                                  applyServiceTier(index, tier.price)
                                }
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:border-sky-200 hover:bg-sky-300/20"
                              >
                                {tier.label} {formatCurrency(tier.price)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
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
                        preventWheelChange
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

                        <p className="document-line-total rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-semibold text-orange-400">
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

                <div className="rounded-2xl border border-zinc-800 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">Discount</p>
                      <p className="text-xs text-zinc-500">
                        Applied before tax
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-300">
                      <input
                        type="checkbox"
                        checked={discountEnabled}
                        onChange={(event) =>
                          setDiscountEnabled(event.target.checked)
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                      Add
                    </label>
                  </div>

                  {discountEnabled ? (
                    <div className="mt-3 grid gap-2">
                      <select
                        value={discountType}
                        onChange={(event) =>
                          setDiscountType(event.target.value as DiscountType)
                        }
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none transition focus:border-orange-500"
                      >
                        <option value="fixed">Fixed amount</option>
                        <option value="percentage">Percentage</option>
                      </select>
                      <InputField
                        label={discountType === "percentage" ? "Value (%)" : "Value"}
                        type="number"
                        preventWheelChange
                        value={discountValue}
                        onChange={setDiscountValue}
                      />
                      <InputField
                        label="Label"
                        placeholder="Courtesy discount"
                        value={discountLabel}
                        onChange={setDiscountLabel}
                      />
                      <SummaryRow
                        label="Discount"
                        value={`-${formatCurrency(discountAmount)}`}
                      />
                    </div>
                  ) : null}
                </div>

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
                <div className="document-warning-panel mt-6 rounded-2xl border border-yellow-500/60 bg-yellow-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
                    Automatic Split Ready
                  </p>

                  <p className="mt-2 text-lg font-semibold text-yellow-100">
                    This estimate is over{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} after tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                    When this estimate is converted, Trimax will create the
                    split invoice drafts automatically.
                  </p>
                </div>
              )}

              {splitPreview && (
                <div className="document-info-panel mt-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
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

function SummaryMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 font-black ${strong ? "text-orange-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
