"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import TaxModeSelect from "../../components/TaxModeSelect";
import Card from "../../components/Card";
import Toast from "../../components/Toast";
import { captureServicesFromLineItems } from "../../lib/captureServicesFromLineItems";
import { getNextDocumentDisplayId } from "../../lib/documentNumbers";
import { logActivity } from "../../lib/activityLog";
import { supabase } from "../../lib/supabase";
import { looksLikeApartmentUnitPaintJob } from "../../utils/jobWorkflow";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
  getTaxSuggestionForAddress,
  type TaxMode,
} from "../../utils/tax";

type Business = {
  id: string;
  name: string;
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

type LineItem = {
  serviceItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function getLineTotal(item: LineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;

  return quantity * unitPrice;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value) || 0;
}

function getSplitPreview(totalAmount: number, targetAmount: number) {
  if (totalAmount <= targetAmount || targetAmount <= 0) {
    return null;
  }

  const invoiceCount = Math.ceil(totalAmount / targetAmount);

  return {
    invoiceCount,
    averageAmount: totalAmount / invoiceCount,
  };
}

function looksLikeFiveStarsBoaInvoiceDraft(
  customerName: string,
  projectTitle: string,
  serviceAddress: string,
  reference: string,
  notes: string,
  lineItems: LineItem[]
) {
  const combinedText = [
    customerName,
    projectTitle,
    serviceAddress,
    reference,
    notes,
    ...lineItems.map((item) => item.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasFiveStars =
    combinedText.includes("5stars") ||
    combinedText.includes("5 stars") ||
    combinedText.includes("5star") ||
    combinedText.includes("5 star");
  const hasBankOfAmerica =
    combinedText.includes("bank of america") ||
    combinedText.includes("boa");

  return hasFiveStars || hasBankOfAmerica;
}

function NewInvoicePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";
  const clientIdFromUrl = searchParams.get("clientId");

  const [business, setBusiness] =
    useState<Business | null>(null);
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
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
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
  const splitWarningAmount = toNumber(
    business?.split_warning_amount
  );
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
      : shouldAutoEnableSplitWarning;
  const showSplitWarning =
    effectiveSplitWarningEnabled &&
    effectiveSplitTargetAmount > 0 &&
    subtotal > effectiveSplitTargetAmount;
  const splitPreview = effectiveSplitWarningEnabled
    ? getSplitPreview(subtotal, effectiveSplitTargetAmount)
    : null;
  const taxSuggestion =
    getTaxSuggestionForAddress(serviceAddress);
  const showTaxSuggestionNote =
    Boolean(taxSuggestion) && !taxManuallyChanged;
  const showFiveStarsBoaTemplateNote =
    businessSlug === "just-kleen" &&
    looksLikeFiveStarsBoaInvoiceDraft(
      customerName,
      projectTitle,
      serviceAddress,
      reference,
      notes,
      lineItems
    );

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const applyTaxSuggestion = useCallback(
    (address: string) => {
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
    },
    [taxManuallyChanged]
  );

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
          message: "Unable to load selected business.",
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

      const loadedClients = (clientData ?? []) as Client[];

      setClients(loadedClients);

      if (clientIdFromUrl) {
        const clientFromUrl = loadedClients.find(
          (client) => client.id === clientIdFromUrl
        );

        if (clientFromUrl) {
          const clientServiceAddress =
            clientFromUrl.service_address ||
            clientFromUrl.billing_address ||
            "";

          setSelectedClientId(clientFromUrl.id);
          setCustomerName(clientFromUrl.name);
          setServiceAddress(clientServiceAddress);

          if (clientServiceAddress) {
            applyTaxSuggestion(clientServiceAddress);
          }
        }
      }

      const { data: serviceData } =
        await supabase
          .from("service_items")
          .select("*")
          .eq("business_id", businessData.id)
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
    }

    loadBusiness();
  }, [applyTaxSuggestion, businessSlug, clientIdFromUrl]);

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
      setCustomerName("");
      setServiceAddress("");
      setTaxLabel("");
      setTaxRate("");
      setTaxManuallyChanged(false);
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

  function resetForm() {
    setSelectedClientId("");
    setCustomerName("");
    setProjectTitle("");
    setServiceAddress("");
    setIssueDate("");
    setDueDate("");
    setReference("");
    setTaxMode("taxable");
    setTaxLabel("");
    setTaxRate("");
    setTaxNumber("");
    setTaxManuallyChanged(false);
    setAmountPaid("0");
    setSplitWarningEnabled(false);
    setSplitTargetAmount("");
    setSplitWarningManuallyChanged(false);
    setTerms(
      "Payment due upon invoice. Thank you for your business."
    );
    setNotes("");
    setLineItems([
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
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

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

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
          "Please fill out customer, project title, and at least one line item.",
      });

      return;
    }

    let displayId = "";

    try {
      displayId = await getNextDocumentDisplayId({
        table: "invoices",
        prefix: "INV",
        businessId: business.id,
      });
    } catch (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to reserve the next invoice number. Refresh the page, then try again.",
      });

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
          business_id: business.id,
          created_by_user_id: user?.id ?? null,
          name: customerName,
        })
        .select()
        .single();

      if (clientError || !newClient) {
        console.error(clientError);

        setToast({
          type: "error",
          message: "Unable to create client record.",
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
        created_by_user_id: user?.id ?? null,
        display_id: displayId,
        customer_name: customerName,
        project_title: projectTitle,
        service_address: serviceAddress,
        invoice_amount: formatCurrency(invoiceTotal),
        issue_date: issueDate,
        due_date: dueDate,
        reference,
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

    const { error: lineItemError } = await supabase
      .from("invoice_line_items")
      .insert(
        validLineItems.map((item, index) => ({
          invoice_id: data.id,
          business_id: business.id,
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
          "Invoice was created, but line items failed to save.",
      });

      return;
    }

    await captureServicesFromLineItems({
      businessId: business.id,
      lineItems: validLineItems,
    });

    await logActivity({
      businessId: business.id,
      action: "invoice.created",
      entityType: "invoice",
      entityId: data.id,
      entityLabel: displayId,
      details: {
        customerName,
        projectTitle,
        amount: formatCurrency(invoiceTotal),
        lineItemCount: validLineItems.length,
        splitWarningEnabled: effectiveSplitWarningEnabled,
      },
    });

    router.push(
      `/invoices/${data.id}?business=${business.slug}`
    );
  }

  return (
    <AppShell>
      {toast && (
        <Toast type={toast.type} message={toast.message} />
      )}

      <div className="mx-auto max-w-4xl">
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
                  handleClientChange(event.target.value)
                }
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="">
                  -- Select Client --
                </option>

                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
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

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Issue Date"
                value={issueDate}
                onChange={setIssueDate}
                type="date"
              />

              <InputField
                label="Due Date"
                value={dueDate}
                onChange={setDueDate}
                type="date"
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
              <p className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                No tax selected. Trimax will calculate this invoice with a
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

            {showFiveStarsBoaTemplateNote ? (
              <p className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm leading-6 text-yellow-100/80">
                5Stars / Bank of America invoice detected. After saving,
                Trimax will offer the special spreadsheet-style print format
                for this invoice, while regular invoices keep the normal
                format.
              </p>
            ) : null}

            {shouldAutoEnableSplitWarning &&
            !splitWarningManuallyChanged ? (
              <p className="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm leading-6 text-purple-100/80">
                Apartment unit paint billing detected. Split warning is on for
                this job only. Fence, tree, remodel, and other general project
                invoices stay normal unless you turn this on yourself.
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

                <Button variant="secondary" onClick={addLineItem}>
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
                          {formatCurrency(getLineTotal(item))}
                        </p>
                      </div>

                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          onClick={() => removeLineItem(index)}
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
                <div className="mt-6 rounded-2xl border border-yellow-500/60 bg-yellow-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
                    Split Warning
                  </p>

                  <p className="mt-2 text-lg font-semibold text-yellow-100">
                    This invoice subtotal is over{" "}
                    {formatCurrency(effectiveSplitTargetAmount)}.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                    Consider splitting this apartment work into smaller invoices
                    before sending.
                  </p>
                </div>
              )}

              {splitPreview && (
                <div className="mt-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
                    Split Preview
                  </p>

                  <p className="mt-2 text-lg font-semibold text-orange-100">
                    This would become {splitPreview.invoiceCount} invoices with
                    about {formatCurrency(splitPreview.averageAmount)} in
                    pre-tax work each.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-orange-100/80">
                    This is only a preview. Trimax is not creating split
                    invoices yet.
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
                onChange={(event) => setNotes(event.target.value)}
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
                onChange={(event) => setTerms(event.target.value)}
                placeholder="Payment terms..."
                className="min-h-32 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <Button onClick={handleSave}>
                Create Invoice
              </Button>

              <Button
                variant="secondary"
                onClick={resetForm}
              >
                Start Over
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/invoices?business=${businessSlug}`
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

export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoicePageContent />
    </Suspense>
  );
}
