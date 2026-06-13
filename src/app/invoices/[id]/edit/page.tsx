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
import {
  buildSplitInvoicePlan,
  createSplitInvoices,
} from "../../../lib/splitInvoices";
import { supabase } from "../../../lib/supabase";
import { looksLikeApartmentUnitPaintJob } from "../../../utils/jobWorkflow";
import { getSmartInvoiceDates } from "../../../utils/invoiceDates";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
  getTaxSuggestionForAddress,
  type TaxMode,
} from "../../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../../utils/unitLabels";

type Invoice = {
  id: string;
  business_id: string | null;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | null;
  issue_date: string | null;
  due_date: string | null;
  reference: string | null;
  service_address: string | null;
  tax_mode: TaxMode | string | null;
  tax_label: string | null;
  tax_rate: number | string | null;
  tax_number: string | null;
  amount_paid: number | string | null;
  split_parent_invoice_id: string | null;
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

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const invoiceId = params.id as string;
  const requestedBusinessSlug =
    searchParams.get("business") ?? "rnl-creations";

  const [businessId, setBusinessId] = useState("");
  const [businessSlug, setBusinessSlug] =
    useState(requestedBusinessSlug);
  const [invoiceDisplayId, setInvoiceDisplayId] =
    useState<string | null>(null);
  const [invoiceClientId, setInvoiceClientId] =
    useState<string | null>(null);
  const [invoiceSplitParentId, setInvoiceSplitParentId] =
    useState<string | null>(null);
  const [serviceItems, setServiceItems] =
    useState<ServiceItem[]>([]);

  const [customerName, setCustomerName] =
    useState("");
  const [projectTitle, setProjectTitle] =
    useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueDateManuallyChanged, setDueDateManuallyChanged] =
    useState(false);
  const [reference, setReference] = useState("");
  const [serviceAddress, setServiceAddress] =
    useState("");
  const [taxMode, setTaxMode] = useState<TaxMode>("taxable");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxManuallyChanged, setTaxManuallyChanged] =
    useState(false);
  const [amountPaid, setAmountPaid] = useState("0");
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
    "Payment due upon invoice. Thank you for your business."
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

  const invoiceTotal = subtotal + taxAmount;
  const amountDue =
    invoiceTotal - (Number(amountPaid) || 0);
  const [splitWarningAmount, setSplitWarningAmount] =
    useState(0);
  const effectiveSplitTargetAmount =
    toNumber(splitTargetAmount) || splitWarningAmount;
  const automaticSplitPlan = useMemo(
    () =>
      effectiveSplitTargetAmount > 0
        ? buildSplitInvoicePlan({
            subtotalAmount: subtotal,
            targetAmount: effectiveSplitTargetAmount,
            taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
          })
        : [],
    [effectiveSplitTargetAmount, subtotal, taxMode, taxRate]
  );
  const shouldAutoEnableSplitWarning = automaticSplitPlan.length > 0;
  const looksLikeApartmentSplitJob = useMemo(() => {
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
    automaticSplitPlan.length > 0;
  const splitPreview = showSplitWarning
    ? automaticSplitPlan
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
    async function loadInvoice() {
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
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .eq("business_id", selectedBusiness.id)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load invoice for this workspace.",
        });

        setLoading(false);
        return;
      }

      const invoice = data as Invoice;

      setInvoiceDisplayId(invoice.display_id ?? null);
      setInvoiceClientId(invoice.client_id ?? null);
      setInvoiceSplitParentId(invoice.split_parent_invoice_id ?? null);
      setCustomerName(invoice.customer_name ?? "");
      setProjectTitle(invoice.project_title ?? "");
      setIssueDate(invoice.issue_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setReference(invoice.reference ?? "");
      setServiceAddress(invoice.service_address ?? "");
      setTaxMode(
        invoice.tax_mode === "no_tax" ||
          invoice.tax_mode === "tax_exempt"
          ? invoice.tax_mode
          : "taxable"
      );
      setTaxLabel(
        invoice.tax_label && invoice.tax_label !== "Tax"
          ? invoice.tax_label
          : ""
      );
      setTaxRate(
        toNumber(invoice.tax_rate) > 0
          ? String(toNumber(invoice.tax_rate))
          : ""
      );
      setTaxNumber(invoice.tax_number ?? "");
      const hasSavedTax =
        Boolean(invoice.tax_label && invoice.tax_label !== "Tax") ||
        toNumber(invoice.tax_rate) > 0;

      setTaxManuallyChanged(hasSavedTax);

      if (!hasSavedTax && invoice.service_address) {
        const suggestion = getTaxSuggestionForAddress(
          invoice.service_address
        );

        if (suggestion) {
          setTaxLabel(suggestion.label);
          setTaxRate(suggestion.rate);
        }
      }
      setAmountPaid(String(toNumber(invoice.amount_paid)));
      setSplitWarningEnabled(
        Boolean(invoice.split_warning_enabled)
      );
      setSplitTargetAmount(
        invoice.split_target_amount
          ? String(toNumber(invoice.split_target_amount))
          : ""
      );
      setSavedSplitWarningEnabled(
        Boolean(invoice.split_warning_enabled)
      );
      setTerms(
        invoice.terms ??
          "Payment due upon invoice. Thank you for your business."
      );
      setNotes(invoice.notes ?? "");

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
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("sort_order", {
            ascending: true,
          });

      const savedLineItems =
        (lineItemData ?? []) as SavedLineItem[];

      if (savedLineItems.length > 0) {
        const loadedLineItems = savedLineItems.map(toLineItem);
        setLineItems(loadedLineItems);

        if (!invoice.issue_date || !invoice.due_date) {
          const smartDates = getSmartInvoiceDates({
            customerName: invoice.customer_name ?? "",
            projectTitle: invoice.project_title ?? "",
            serviceAddress: invoice.service_address ?? "",
            reference: invoice.reference ?? "",
            notes: invoice.notes ?? "",
            terms:
              invoice.terms ??
              "Payment due upon invoice. Thank you for your business.",
            lineItems: loadedLineItems,
            issueDate: invoice.issue_date,
          });

          if (!invoice.issue_date) {
            setIssueDate(smartDates.issueDate);
          }

          if (!invoice.due_date) {
            setDueDate(smartDates.dueDate);
          }
        }
      } else {
        const fallbackLineItems = [
          {
            serviceItemId: "",
            description:
              invoice.project_title ?? "",
            quantity: "1",
            unitPrice: parseCurrency(
              invoice.invoice_amount
            ),
          },
        ];

        setLineItems(fallbackLineItems);

        if (!invoice.issue_date || !invoice.due_date) {
          const smartDates = getSmartInvoiceDates({
            customerName: invoice.customer_name ?? "",
            projectTitle: invoice.project_title ?? "",
            serviceAddress: invoice.service_address ?? "",
            reference: invoice.reference ?? "",
            notes: invoice.notes ?? "",
            terms:
              invoice.terms ??
              "Payment due upon invoice. Thank you for your business.",
            lineItems: fallbackLineItems,
            issueDate: invoice.issue_date,
          });

          if (!invoice.issue_date) {
            setIssueDate(smartDates.issueDate);
          }

          if (!invoice.due_date) {
            setDueDate(smartDates.dueDate);
          }
        }
      }

      setLoading(false);
    }

    loadInvoice();
  }, [invoiceId, requestedBusinessSlug]);

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

  function handleIssueDateChange(value: string) {
    setIssueDate(value);

    if (!dueDateManuallyChanged) {
      setDueDate(
        getSmartInvoiceDates({
          customerName,
          projectTitle,
          serviceAddress,
          reference,
          notes,
          terms,
          lineItems,
          issueDate: value,
        }).dueDate
      );
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

    const { error } = await supabase
      .from("invoices")
      .update({
        customer_name: customerName,
        project_title: projectTitle,
        invoice_amount: formatCurrency(invoiceTotal),
        issue_date: issueDate,
        due_date: dueDate,
        reference: maybeCanonicalApartmentUnitLabel(reference),
        service_address: serviceAddress,
        tax_mode: taxMode,
        tax_label: taxLabel.trim() || null,
        tax_rate: getEffectiveTaxRate({ taxMode, taxRate }),
        tax_number:
          taxMode === "taxable" ? taxNumber.trim() || null : null,
        amount_paid: Number(amountPaid) || 0,
        split_warning_enabled: effectiveSplitWarningEnabled,
        split_target_amount:
          effectiveSplitWarningEnabled &&
          effectiveSplitTargetAmount > 0
            ? effectiveSplitTargetAmount
            : null,
        terms,
        notes,
      })
      .eq("id", invoiceId)
      .eq("business_id", businessId);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to update invoice.",
      });

      setSaving(false);
      return;
    }

    const { error: deleteError } =
      await supabase
        .from("invoice_line_items")
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("business_id", businessId);

    if (deleteError) {
      console.error(deleteError);

      setToast({
        type: "error",
        message:
          "Invoice saved, but old line items could not be replaced.",
      });

      setSaving(false);
      return;
    }

    const { error: lineItemError } =
      await supabase
        .from("invoice_line_items")
        .insert(
          validLineItems.map((item, index) => ({
            invoice_id: invoiceId,
            business_id: businessId,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unitPrice) || 0,
            line_total: getLineTotal(item),
            sort_order: index,
          }))
        );

    if (lineItemError) {
      console.error(lineItemError);

      setToast({
        type: "error",
        message:
          "Invoice saved, but line items could not be saved.",
      });

      return;
    }

    await captureServicesFromLineItems({
      businessId,
      lineItems: validLineItems,
    });

    if (
      !invoiceSplitParentId &&
      effectiveSplitWarningEnabled &&
      effectiveSplitTargetAmount > 0 &&
      automaticSplitPlan.length > 0
    ) {
      const { data: existingSplitInvoices, error: splitCheckError } =
        await supabase
          .from("invoices")
          .select("id")
          .eq("business_id", businessId)
          .eq("split_parent_invoice_id", invoiceId)
          .limit(1);

      if (splitCheckError) {
        console.error(splitCheckError);

        setToast({
          type: "error",
          message:
            "Invoice saved, but Trimax could not check for existing split drafts.",
        });

        setSaving(false);
        return;
      }

      if ((existingSplitInvoices ?? []).length === 0) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          await createSplitInvoices({
            sourceInvoice: {
              id: invoiceId,
              displayId: invoiceDisplayId,
              businessId,
              businessSlug,
              clientId: invoiceClientId,
              customerName,
              projectTitle,
              issueDate,
              dueDate,
              reference: maybeCanonicalApartmentUnitLabel(reference),
              serviceAddress,
              terms,
              notes,
            },
            subtotalAmount: subtotal,
            targetAmount: effectiveSplitTargetAmount,
            taxLabel: taxLabel.trim() || "Tax",
            taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
            taxMode,
            taxNumber,
            createdByUserId: user?.id ?? null,
          });
        } catch (splitError) {
          console.error(splitError);

          setToast({
            type: "error",
            message:
              "Invoice saved, but Trimax could not create the split drafts.",
          });

          setSaving(false);
          return;
        }
      }
    }

    await logActivity({
      businessId: businessId || null,
      action: "invoice.updated",
      entityType: "invoice",
      entityId: invoiceId,
      entityLabel: projectTitle || customerName,
      details: {
        customerName,
        projectTitle,
        amount: formatCurrency(invoiceTotal),
        lineItemCount: validLineItems.length,
        splitWarningEnabled: effectiveSplitWarningEnabled,
      },
    });

    router.push(
      `/invoices/${invoiceId}?business=${businessSlug}`
    );

    setSaving(false);
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-400">
          Loading invoice...
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
          Invoice Details
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          Edit Invoice
        </h1>

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

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Issue Date"
                value={issueDate}
                onChange={handleIssueDateChange}
                type="date"
              />

              <InputField
                label="Due Date"
                value={dueDate}
                onChange={(value) => {
                  setDueDateManuallyChanged(true);
                  setDueDate(value);
                }}
                type="date"
                helperText={
                  dueDateManuallyChanged
                    ? "Manual due date selected."
                    : "Blank saved due dates are auto-filled from the invoice type."
                }
              />
            </div>

            <InputField
              label="Reference"
              placeholder="Example: Unit 204, PO #123, X4"
              value={reference}
              onChange={setReference}
            />

            <InputField
              label="Service Address"
              placeholder="Job location"
              value={serviceAddress}
              onChange={handleServiceAddressChange}
            />

            <div className="grid gap-5 md:grid-cols-4">
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

              <InputField
                label="Amount Paid"
                type="number"
                value={amountPaid}
                onChange={setAmountPaid}
              />
            </div>

            {taxMode === "no_tax" ? (
              <p className="document-note-panel rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                No tax selected. Trimax will calculate this invoice with a
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
                Over-threshold billing detected. Trimax will automatically
                prepare split invoice drafts for this job so no split invoice
                exceeds the target amount.
                {looksLikeApartmentSplitJob
                  ? " Apartment unit work was also detected."
                  : ""}
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
                  Automatically split this invoice if it is over the threshold
                </span>

                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  Leave this on when Trimax should create draft split invoices.
                  Turn it off only when this invoice should stay as one
                  document even though it is over the threshold.
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

                <SummaryRow
                  label={formatTaxSummaryLabel({
                    label: taxLabel,
                    rate: taxRate,
                    taxNumber,
                    taxMode,
                  })}
                  value={formatCurrency(taxAmount)}
                />

                <SummaryRow
                  label="Total"
                  value={formatCurrency(invoiceTotal)}
                />

                <SummaryRow
                  label="Amount Paid"
                  value={formatCurrency(Number(amountPaid) || 0)}
                />

                <div className="border-t border-zinc-700 pt-3">
                  <SummaryRow
                    label="Amount Due"
                    value={formatCurrency(amountDue)}
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
                    This invoice is over{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} after tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                    Save the invoice, then open its detail page to review or
                    create the split drafts.
                  </p>
                </div>
              )}

              {splitPreview && (
                <div className="document-info-panel mt-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
                    Split Preview
                  </p>

                  <p className="mt-2 text-lg font-semibold text-orange-100">
                    This would become {splitPreview.length} invoices. No split
                    invoice would exceed{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} including tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-orange-100/80">
                    Save the edit, then open the invoice detail page to create
                    or review the split drafts.
                  </p>
                </div>
              )}
            </div>

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
                placeholder="Payment terms..."
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
                    `/invoices/${invoiceId}?business=${businessSlug}`
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
