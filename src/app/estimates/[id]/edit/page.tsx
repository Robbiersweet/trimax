"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../components/AppShell";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import InputField from "../../../components/InputField";
import Toast from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";

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
  tax_label: string | null;
  tax_rate: number | string | null;
  terms: string | null;
  notes: string | null;
};

type Business = {
  id: string;
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

  const estimateId = params.id as string;

  const [businessId, setBusinessId] = useState("");
  const [businessSlug, setBusinessSlug] =
    useState("rnl-creations");

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
  const [taxLabel, setTaxLabel] = useState("Tax");
  const [taxRate, setTaxRate] = useState("0");
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
    return subtotal * ((Number(taxRate) || 0) / 100);
  }, [subtotal, taxRate]);

  const estimateTotal = subtotal + taxAmount;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadEstimate() {
      const { data, error } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", estimateId)
        .limit(1);

      const estimate =
        data?.[0] as Estimate | undefined;

      if (error || !estimate) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load estimate.",
        });

        setLoading(false);
        return;
      }

      const { data: invoiceData } =
        await supabase
          .from("invoices")
          .select("id")
          .eq("estimate_id", estimateId)
          .limit(1);

      if (invoiceData && invoiceData.length > 0) {
        router.push(
          `/estimates/${estimateId}?business=${businessSlug}`
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
      setTaxLabel(estimate.tax_label ?? "Tax");
      setTaxRate(String(toNumber(estimate.tax_rate)));
      setTerms(
        estimate.terms ??
          "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."
      );
      setNotes(estimate.notes ?? "");
      setSelectedClientId(estimate.client_id ?? "");

      if (estimate.business_id) {
        setBusinessId(estimate.business_id);

        const { data: businessRows } =
          await supabase
            .from("businesses")
            .select("id, slug")
            .eq("id", estimate.business_id)
            .limit(1);

        const business =
          businessRows?.[0] as Business | undefined;

        if (business?.slug) {
          setBusinessSlug(business.slug);
        }

        const { data: clientRows } =
          await supabase
            .from("clients")
            .select("*")
            .eq("business_id", estimate.business_id)
            .order("name", {
              ascending: true,
            });

        setClients((clientRows ?? []) as Client[]);

        const { data: serviceData } =
          await supabase
            .from("service_items")
            .select("*")
            .eq("business_id", estimate.business_id)
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
  }, [estimateId, router, businessSlug]);

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);

    const client = clients.find(
      (clientItem) => clientItem.id === clientId
    );

    if (!client) {
      return;
    }

    setCustomerName(client.name);

    if (client.billing_address) {
      setServiceAddress(client.billing_address);
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

    const { data: invoiceData } =
      await supabase
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
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

    if (!selectedClientId && businessId) {
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
        reference,
        estimate_amount:
          formatCurrency(estimateTotal),
        tax_label: taxLabel || "Tax",
        tax_rate: Number(taxRate) || 0,
        terms,
        notes,
      })
      .eq("id", estimateId);

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
        .eq("estimate_id", estimateId);

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
            business_id: businessId || null,
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
              onChange={setServiceAddress}
            />

            <InputField
              label="Reference"
              placeholder="Example: Unit 204, PO #123, X4"
              value={reference}
              onChange={setReference}
            />

            <div className="grid gap-5 md:grid-cols-2">
              <InputField
                label="Tax Label"
                placeholder="Example: Snohomish"
                value={taxLabel}
                onChange={setTaxLabel}
              />

              <InputField
                label="Tax Rate (%)"
                type="number"
                value={taxRate}
                onChange={setTaxRate}
              />
            </div>

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
                  label={`${taxLabel || "Tax"} (${Number(taxRate) || 0}%)`}
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