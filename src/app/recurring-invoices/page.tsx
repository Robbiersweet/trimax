"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { captureServicesFromLineItems } from "../lib/captureServicesFromLineItems";
import { getNextDocumentDisplayId } from "../lib/documentNumbers";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Client = {
  id: string;
  name: string;
  email: string | null;
  billing_address: string | null;
  service_address: string | null;
};

type RecurringLineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

type RecurringTemplate = {
  id: string;
  business_id: string;
  client_id: string | null;
  name: string;
  customer_name: string;
  project_title: string;
  service_address: string | null;
  reference: string | null;
  delivery_format: "standard" | "5stars_boa";
  frequency: "monthly";
  day_of_month: number;
  due_days: number;
  tax_label: string | null;
  tax_rate: number | string | null;
  terms: string | null;
  notes: string | null;
  email_subject: string | null;
  email_body: string | null;
  line_items: RecurringLineItem[] | null;
  is_active: boolean;
  last_generated_invoice_id: string | null;
  last_generated_at: string | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

const emptyLineItem: RecurringLineItem = {
  description: "",
  quantity: "1",
  unitPrice: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not generated yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not generated yet";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lineTotal(item: RecurringLineItem) {
  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

function defaultEmailSubject(displayId: string, customerName: string) {
  return `Invoice ${displayId} - ${customerName}`;
}

function defaultEmailBody({
  businessName,
  customerName,
  displayId,
  projectTitle,
  amountDue,
  dueDate,
}: {
  businessName: string;
  customerName: string;
  displayId: string;
  projectTitle: string;
  amountDue: string;
  dueDate: string;
}) {
  return `Hi ${customerName},

Attached is invoice ${displayId} for ${projectTitle}.

Amount due: ${amountDue}
Due date: ${dueDate}

Please let us know if you have any questions.

Thank you,
${businessName}`;
}

function RecurringInvoicesPageContent() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const businessQuery = `?business=${businessSlug}`;

  const [business, setBusiness] = useState<Business | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [generatedInvoice, setGeneratedInvoice] = useState<{
    id: string;
    displayId: string;
    templateName: string;
    deliveryFormat: string;
    subject: string;
    body: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [reference, setReference] = useState("");
  const [deliveryFormat, setDeliveryFormat] = useState<"standard" | "5stars_boa">(
    "standard"
  );
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [dueDays, setDueDays] = useState("30");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [terms, setTerms] = useState(
    "Payment due upon invoice. Thank you for your business."
  );
  const [notes, setNotes] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [lineItems, setLineItems] = useState<RecurringLineItem[]>([
    { ...emptyLineItem },
  ]);

  const templateTotal = useMemo(
    () => lineItems.reduce((total, item) => total + lineTotal(item), 0),
    [lineItems]
  );

  useEffect(() => {
    async function loadPageData() {
      setIsLoading(true);
      setSetupMessage(null);

      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (businessError || !businessData) {
        setSetupMessage(
          "This workspace could not be loaded. Sign in again, then reopen the workspace."
        );
        setIsLoading(false);
        return;
      }

      const selectedBusiness = businessData as Business;
      setBusiness(selectedBusiness);

      const [{ data: clientData }, { data: templateData, error: templateError }] =
        await Promise.all([
          supabase
            .from("clients")
            .select("id, name, email, billing_address, service_address")
            .eq("business_id", selectedBusiness.id)
            .order("name", { ascending: true }),
          supabase
            .from("recurring_invoice_templates")
            .select("*")
            .eq("business_id", selectedBusiness.id)
            .order("created_at", { ascending: false }),
        ]);

      setClients((clientData ?? []) as Client[]);

      if (templateError) {
        setSetupMessage(
          "Recurring invoice templates are not set up in Supabase yet. Run the SQL below, then refresh this page."
        );
        setTemplates([]);
      } else {
        setTemplates((templateData ?? []) as RecurringTemplate[]);
      }

      setIsLoading(false);
    }

    loadPageData();
  }, [businessSlug]);

  function chooseClient(clientId: string) {
    setSelectedClientId(clientId);

    const client = clients.find((item) => item.id === clientId);

    if (!client) {
      return;
    }

    setCustomerName(client.name);
    setServiceAddress(client.service_address ?? client.billing_address ?? "");
  }

  function updateLineItem(
    index: number,
    key: keyof RecurringLineItem,
    value: string
  ) {
    setLineItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  }

  function addLineItem() {
    setLineItems((current) => [...current, { ...emptyLineItem }]);
  }

  function removeLineItem(index: number) {
    setLineItems((current) =>
      current.length === 1
        ? [{ ...emptyLineItem }]
        : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function saveTemplate() {
    if (!business) {
      return;
    }

    const validLineItems = lineItems.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0
    );

    if (!name.trim() || !customerName.trim() || !projectTitle.trim()) {
      setToast({
        type: "error",
        message: "Add a template name, customer, and project title first.",
      });
      return;
    }

    if (validLineItems.length === 0) {
      setToast({
        type: "error",
        message: "Add at least one line item before saving the template.",
      });
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase
      .from("recurring_invoice_templates")
      .insert({
        business_id: business.id,
        client_id: selectedClientId || null,
        name: name.trim(),
        customer_name: customerName.trim(),
        project_title: projectTitle.trim(),
        service_address: serviceAddress.trim() || null,
        reference: reference.trim() || null,
        delivery_format: deliveryFormat,
        frequency: "monthly",
        day_of_month: Math.min(Math.max(Number(dayOfMonth) || 1, 1), 28),
        due_days: Math.min(Math.max(Number(dueDays) || 0, 0), 120),
        tax_label: taxLabel.trim() || null,
        tax_rate: Number(taxRate) || 0,
        terms: terms.trim() || null,
        notes: notes.trim() || null,
        email_subject: emailSubject.trim() || null,
        email_body: emailBody.trim() || null,
        line_items: validLineItems.map((item) => ({
          description: item.description.trim(),
          quantity: String(Number(item.quantity) || 0),
          unitPrice: String(Number(item.unitPrice) || 0),
        })),
      })
      .select()
      .single();

    setIsSaving(false);

    if (error || !data) {
      setToast({
        type: "error",
        message:
          "Template could not be saved. If this is the first time, run the Supabase SQL first.",
      });
      return;
    }

    setTemplates((current) => [data as RecurringTemplate, ...current]);
    setToast({
      type: "success",
      message: "Recurring invoice template saved.",
    });

    setName("");
    setSelectedClientId("");
    setCustomerName("");
    setProjectTitle("");
    setServiceAddress("");
    setReference("");
    setDeliveryFormat("standard");
    setDayOfMonth("1");
    setDueDays("30");
    setTaxLabel("");
    setTaxRate("");
    setTerms("Payment due upon invoice. Thank you for your business.");
    setNotes("");
    setEmailSubject("");
    setEmailBody("");
    setLineItems([{ ...emptyLineItem }]);
  }

  async function createDraftInvoice(template: RecurringTemplate) {
    if (!business) {
      return;
    }

    const templateLineItems = (template.line_items ?? []).filter(
      (item) => item.description?.trim() && Number(item.quantity) > 0
    );

    if (templateLineItems.length === 0) {
      setToast({
        type: "error",
        message: "This template needs at least one line item before it can run.",
      });
      return;
    }

    setGeneratingId(template.id);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const displayId = await getNextDocumentDisplayId({
        table: "invoices",
        prefix: "INV",
        businessId: business.id,
      });
      const issueDate = new Date();
      const dueDate = addDays(issueDate, Number(template.due_days) || 0);
      const subtotal = templateLineItems.reduce(
        (total, item) => total + lineTotal(item),
        0
      );
      const taxAmount = subtotal * ((Number(template.tax_rate) || 0) / 100);
      const total = subtotal + taxAmount;

      const subject =
        template.email_subject?.trim() ||
        defaultEmailSubject(displayId, template.customer_name);
      const body =
        template.email_body?.trim() ||
        defaultEmailBody({
          businessName: business.name,
          customerName: template.customer_name,
          displayId,
          projectTitle: template.project_title,
          amountDue: formatCurrency(total),
          dueDate: toDateInputValue(dueDate),
        });

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          business_id: business.id,
          client_id: template.client_id,
          created_by_user_id: user?.id ?? null,
          display_id: displayId,
          customer_name: template.customer_name,
          project_title: template.project_title,
          service_address: template.service_address,
          invoice_amount: formatCurrency(total),
          issue_date: toDateInputValue(issueDate),
          due_date: toDateInputValue(dueDate),
          reference: template.reference,
          tax_label: template.tax_label,
          tax_rate: Number(template.tax_rate) || 0,
          amount_paid: 0,
          split_warning_enabled: false,
          split_target_amount: null,
          terms: template.terms,
          notes: [
            template.notes,
            "Recurring draft prepared by Trimax. Review and send manually from Outlook.",
          ]
            .filter(Boolean)
            .join("\n\n"),
          status: "Draft",
        })
        .select()
        .single();

      if (invoiceError || !invoice) {
        throw invoiceError ?? new Error("Invoice was not created.");
      }

      const { error: lineError } = await supabase
        .from("invoice_line_items")
        .insert(
          templateLineItems.map((item, index) => ({
            invoice_id: invoice.id,
            business_id: business.id,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unitPrice) || 0,
            line_total: lineTotal(item),
            sort_order: index,
          }))
        );

      if (lineError) {
        throw lineError;
      }

      await supabase
        .from("document_send_logs")
        .insert({
          business_id: business.id,
          document_type: "invoice",
          document_id: invoice.id,
          recipient_email: null,
          subject,
          status: "draft_prepared",
          created_by_email: user?.email ?? null,
        });

      await supabase
        .from("recurring_invoice_templates")
        .update({
          last_generated_invoice_id: invoice.id,
          last_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", template.id)
        .eq("business_id", business.id);

      await captureServicesFromLineItems({
        businessId: business.id,
        lineItems: templateLineItems,
      });

      await logActivity({
        businessId: business.id,
        action: "invoice.recurring_draft_created",
        entityType: "invoice",
        entityId: invoice.id,
        entityLabel: displayId,
        details: {
          templateName: template.name,
          customerName: template.customer_name,
          projectTitle: template.project_title,
          amount: formatCurrency(total),
          deliveryFormat: template.delivery_format,
        },
      });

      setTemplates((current) =>
        current.map((item) =>
          item.id === template.id
            ? {
                ...item,
                last_generated_invoice_id: invoice.id,
                last_generated_at: new Date().toISOString(),
              }
            : item
        )
      );
      setGeneratedInvoice({
        id: invoice.id,
        displayId,
        templateName: template.name,
        deliveryFormat: template.delivery_format,
        subject,
        body,
      });
      setToast({
        type: "success",
        message: `${displayId} was created as a draft. Review it before sending.`,
      });
    } catch (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to create the recurring draft. Check the template and try again.",
      });
    } finally {
      setGeneratingId(null);
    }
  }

  async function archiveTemplate(template: RecurringTemplate) {
    if (!business) {
      return;
    }

    const { error } = await supabase
      .from("recurring_invoice_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
      .eq("business_id", business.id);

    if (error) {
      setToast({
        type: "error",
        message: "Template could not be archived.",
      });
      return;
    }

    setTemplates((current) =>
      current.map((item) =>
        item.id === template.id ? { ...item, is_active: false } : item
      )
    );
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast({
        type: "success",
        message: `${label} copied.`,
      });
    } catch {
      setToast({
        type: "error",
        message: `${label} could not be copied. Select the text and copy it manually.`,
      });
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {toast ? <Toast type={toast.type} message={toast.message} /> : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href={`/invoices${businessQuery}`}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300"
            >
              Back to Invoices
            </Link>

            <p className="mt-4 text-sm uppercase tracking-[0.3em] text-orange-400">
              Recurring Drafts
            </p>

            <h1 className="mt-2 text-4xl font-bold">Recurring Invoice Drafts</h1>

            <p className="mt-2 max-w-3xl text-zinc-400">
              Save repeat invoice packages for Just Kleen, create the draft when
              it is time, then review and send from Outlook yourself.
            </p>
          </div>

          <Link href={`/invoices/new${businessQuery}`}>
            <Button variant="secondary">One-Time Invoice</Button>
          </Link>
        </div>

        {setupMessage ? (
          <Card className="app-notice-card border-amber-500/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-200">
              Setup needed
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-100/90">
              {setupMessage}
            </p>
          </Card>
        ) : null}

        {generatedInvoice ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green-300">
              Draft Ready
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              {generatedInvoice.displayId} is ready to review
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Open the invoice, confirm the customer-facing PDF/export, then send
              it manually from Outlook with your usual signature.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={`/invoices/${generatedInvoice.id}${businessQuery}`}>
                <Button>Open Invoice</Button>
              </Link>
              <Link
                href={`/invoices/${generatedInvoice.id}/print${businessQuery}${
                  generatedInvoice.deliveryFormat === "5stars_boa"
                    ? "&template=5stars-boa"
                    : ""
                }`}
              >
                <Button variant="secondary">Print / Save PDF</Button>
              </Link>
              {generatedInvoice.deliveryFormat === "5stars_boa" ? (
                <Link
                  href={`/invoices/${generatedInvoice.id}/exports/5stars-boa${businessQuery}`}
                >
                  <Button variant="secondary">Download BOA Export</Button>
                </Link>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-green-500/20 bg-black/25 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-200">
                      Email Subject
                    </p>
                    <p className="mt-2 text-sm text-green-50">
                      {generatedInvoice.subject}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      copyToClipboard(generatedInvoice.subject, "Subject")
                    }
                  >
                    Copy Subject
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-green-500/20 bg-black/25 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-200">
                      Email Message
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-green-50">
                      {generatedInvoice.body}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      copyToClipboard(generatedInvoice.body, "Message")
                    }
                  >
                    Copy Message
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                New Template
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Save a repeat invoice package
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Use this for the church invoice and the BOA / 5 Star 5 invoice.
                Trimax will create drafts only; you still review and send.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
              Template total:{" "}
              <span className="font-black text-white">
                {formatCurrency(templateTotal)}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InputField
              label="Template Name"
              placeholder="Example: BOA / 5 Star 5 Monthly"
              value={name}
              onChange={setName}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Client</label>
              <select
                value={selectedClientId}
                onChange={(event) => chooseClient(event.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="">Choose a client or type the customer below</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <InputField
              label="Customer Name"
              placeholder="Example: 5 Star 5"
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Title"
              placeholder="Example: Bank of America Cleaning"
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
              placeholder="Optional PO, site, or account reference"
              value={reference}
              onChange={setReference}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Customer Format
              </label>
              <select
                value={deliveryFormat}
                onChange={(event) =>
                  setDeliveryFormat(event.target.value as "standard" | "5stars_boa")
                }
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="standard">Normal invoice PDF</option>
                <option value="5stars_boa">BOA / 5 Star 5 spreadsheet format</option>
              </select>
            </div>

            <InputField
              label="Day of Month"
              type="number"
              value={dayOfMonth}
              onChange={setDayOfMonth}
              helperText="For your reminder only in this first version. Use 1 through 28."
            />

            <InputField
              label="Due Days After Invoice Date"
              type="number"
              value={dueDays}
              onChange={setDueDays}
            />

            <InputField
              label="Tax Label"
              placeholder="Optional"
              value={taxLabel}
              onChange={setTaxLabel}
            />

            <InputField
              label="Tax Rate"
              type="number"
              placeholder="Example: 10.3"
              value={taxRate}
              onChange={setTaxRate}
            />
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-zinc-400">Terms</label>
              <textarea
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
                className="min-h-24 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-24 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
              Line Items
            </p>
            <div className="mt-3 space-y-3">
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4 lg:grid-cols-[1fr_120px_160px_auto]"
                >
                  <InputField
                    label="Description"
                    value={item.description}
                    onChange={(value) =>
                      updateLineItem(index, "description", value)
                    }
                  />
                  <InputField
                    label="Qty"
                    type="number"
                    value={item.quantity}
                    onChange={(value) => updateLineItem(index, "quantity", value)}
                  />
                  <InputField
                    label="Unit Price"
                    type="number"
                    value={item.unitPrice}
                    onChange={(value) => updateLineItem(index, "unitPrice", value)}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      onClick={() => removeLineItem(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Button variant="secondary" onClick={addLineItem}>
                Add Line Item
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InputField
              label="Email Subject"
              placeholder="Optional. Blank means Trimax will create a normal subject."
              value={emailSubject}
              onChange={setEmailSubject}
            />
            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Email Body
              </label>
              <textarea
                value={emailBody}
                onChange={(event) => setEmailBody(event.target.value)}
                placeholder="Optional. Blank means Trimax will create a simple email body."
                className="min-h-36 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={saveTemplate} disabled={isSaving || Boolean(setupMessage)}>
              {isSaving ? "Saving..." : "Save Recurring Template"}
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Saved Templates
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Create customer-ready drafts
          </h2>

          {isLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Loading templates...</p>
          ) : templates.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-zinc-400">
              No recurring templates yet. Add the church invoice and BOA / 5 Star
              5 invoice above.
            </p>
          ) : (
            <div className="mt-5 grid gap-4">
              {templates.map((template) => {
                const subtotal = (template.line_items ?? []).reduce(
                  (total, item) => total + lineTotal(item),
                  0
                );
                const taxAmount =
                  subtotal * ((Number(template.tax_rate) || 0) / 100);
                const total = subtotal + taxAmount;

                return (
                  <div
                    key={template.id}
                    className={`rounded-2xl border border-zinc-800 bg-zinc-950 p-4 ${
                      template.is_active ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-orange-400">
                          {template.name}
                        </p>
                        <h3 className="mt-1 text-xl font-bold">
                          {template.customer_name}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          {template.project_title}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                            Monthly on day {template.day_of_month}
                          </span>
                          <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                            Due in {template.due_days} days
                          </span>
                          <span className="rounded-full border border-green-500/40 px-3 py-1 text-green-200">
                            {template.delivery_format === "5stars_boa"
                              ? "BOA / 5 Star 5 format"
                              : "Normal PDF"}
                          </span>
                        </div>
                      </div>

                      <div className="text-left lg:text-right">
                        <p className="text-sm text-zinc-400">Template Total</p>
                        <p className="mt-1 text-2xl font-black text-white">
                          {formatCurrency(total)}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          Last created: {formatDate(template.last_generated_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button
                        onClick={() => createDraftInvoice(template)}
                        disabled={!template.is_active || generatingId === template.id}
                      >
                        {generatingId === template.id
                          ? "Creating..."
                          : "Create Draft Invoice"}
                      </Button>
                      {template.last_generated_invoice_id ? (
                        <Link
                          href={`/invoices/${template.last_generated_invoice_id}${businessQuery}`}
                        >
                          <Button variant="secondary">Open Last Draft</Button>
                        </Link>
                      ) : null}
                      {template.is_active ? (
                        <Button
                          variant="secondary"
                          onClick={() => archiveTemplate(template)}
                        >
                          Archive Template
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export default function RecurringInvoicesPage() {
  return (
    <Suspense fallback={<AppShell>Loading recurring invoices...</AppShell>}>
      <RecurringInvoicesPageContent />
    </Suspense>
  );
}
