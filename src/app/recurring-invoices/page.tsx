"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import BackButton from "../components/BackButton";
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
  next_run_date: string | null;
  auto_create_drafts: boolean;
  auto_send_enabled: boolean;
  recipient_email: string | null;
  cc_email: string | null;
  bcc_email: string | null;
  end_type: "forever" | "until_date" | "after_occurrences";
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_sent: number;
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
  last_generated_for_date: string | null;
  last_error: string | null;
  last_sent_invoice_id: string | null;
  last_sent_at: string | null;
  last_send_error: string | null;
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

function addMonthsToDateInput(value: string | null) {
  const sourceDate = value ? new Date(`${value}T00:00:00`) : new Date();

  if (Number.isNaN(sourceDate.getTime())) {
    return toDateInputValue(new Date());
  }

  const nextDate = new Date(sourceDate);
  nextDate.setMonth(nextDate.getMonth() + 1);

  return toDateInputValue(nextDate);
}

function daysUntilDate(value: string | null) {
  if (!value) {
    return null;
  }

  const target = new Date(`${value}T00:00:00`);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function scheduleStatusLabel(template: RecurringTemplate) {
  if (!template.is_active) {
    return "Archived";
  }

  if (isRecurringEndMet(template)) {
    return "Ended";
  }

  if (!template.auto_create_drafts) {
    return "Paused";
  }

  const days = daysUntilDate(template.next_run_date);

  if (days === null) {
    return "Needs date";
  }

  if (template.auto_send_enabled && days >= 0) {
    if (days === 0) {
      return "Sends today";
    }

    return `Auto sends in ${days} day${days === 1 ? "" : "s"}`;
  }

  if (days < 0) {
    const overdueDays = Math.abs(days);
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  return `Runs in ${days} day${days === 1 ? "" : "s"}`;
}

function isRecurringEndMet(template: RecurringTemplate) {
  if (template.end_type === "until_date" && template.end_date) {
    const nextRun = template.next_run_date
      ? new Date(`${template.next_run_date}T00:00:00`)
      : null;
    const endDate = new Date(`${template.end_date}T00:00:00`);

    if (
      nextRun &&
      !Number.isNaN(nextRun.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      nextRun.getTime() > endDate.getTime()
    ) {
      return true;
    }
  }

  if (
    template.end_type === "after_occurrences" &&
    template.max_occurrences !== null &&
    template.max_occurrences > 0
  ) {
    return (template.occurrences_sent ?? 0) >= template.max_occurrences;
  }

  return false;
}

function recurringModeLabel(template: RecurringTemplate) {
  return template.auto_send_enabled ? "Auto Send" : "Manual / Draft";
}

function recurringEndLabel(template: RecurringTemplate) {
  if (template.end_type === "until_date") {
    return `Until ${formatDate(template.end_date)}`;
  }

  if (template.end_type === "after_occurrences") {
    return `${template.occurrences_sent ?? 0} of ${
      template.max_occurrences ?? 0
    } runs`;
  }

  return "Forever";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function shouldPauseAfterRun(
  template: RecurringTemplate,
  nextRunDate: string,
  nextOccurrences: number
) {
  if (template.end_type === "until_date" && template.end_date) {
    const nextRun = new Date(`${nextRunDate}T00:00:00`);
    const endDate = new Date(`${template.end_date}T00:00:00`);

    return (
      !Number.isNaN(nextRun.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      nextRun.getTime() > endDate.getTime()
    );
  }

  if (
    template.end_type === "after_occurrences" &&
    template.max_occurrences !== null &&
    template.max_occurrences > 0
  ) {
    return nextOccurrences >= template.max_occurrences;
  }

  return false;
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
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
  const [autoCreateDrafts, setAutoCreateDrafts] = useState(true);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [bccEmail, setBccEmail] = useState("");
  const [endType, setEndType] = useState<
    "forever" | "until_date" | "after_occurrences"
  >("forever");
  const [endDate, setEndDate] = useState("");
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const [nextRunDate, setNextRunDate] = useState(toDateInputValue(new Date()));
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
  const activeTemplates = templates.filter((template) => template.is_active);
  const runnableTemplates = activeTemplates.filter(
    (template) => !isRecurringEndMet(template)
  );
  const autoCreateTemplates = activeTemplates.filter(
    (template) => template.auto_create_drafts && !isRecurringEndMet(template)
  );
  const autoSendTemplates = autoCreateTemplates.filter(
    (template) => template.auto_send_enabled
  );
  const pausedTemplates = activeTemplates.filter(
    (template) => !template.auto_create_drafts || isRecurringEndMet(template)
  );
  const dueTemplates = autoCreateTemplates.filter((template) => {
    const days = daysUntilDate(template.next_run_date);
    return days !== null && days <= 0;
  });
  const nextScheduledTemplate = autoCreateTemplates
    .filter((template) => daysUntilDate(template.next_run_date) !== null)
    .sort(
      (first, second) =>
        (daysUntilDate(first.next_run_date) ?? 9999) -
        (daysUntilDate(second.next_run_date) ?? 9999)
    )[0];
  const recurringMonthlyTotal = activeTemplates.reduce(
    (total, template) =>
      total +
      (template.line_items ?? []).reduce(
        (subtotal, item) => subtotal + lineTotal(item),
        0
      ),
    0
  );
  const dueDraftTotal = dueTemplates.reduce(
    (total, template) =>
      total +
      (template.line_items ?? []).reduce(
        (subtotal, item) => subtotal + lineTotal(item),
        0
      ),
    0
  );
  const templatesWithErrors = activeTemplates.filter((template) =>
    Boolean(template.last_error)
  );
  const pausedMonthlyTotal = pausedTemplates.reduce(
    (total, template) =>
      total +
      (template.line_items ?? []).reduce(
        (subtotal, item) => subtotal + lineTotal(item),
        0
      ),
    0
  );
  const templatesMissingRunDate = autoCreateTemplates.filter(
    (template) => !template.next_run_date
  );
  const templatesNeedingReview = activeTemplates.filter(
    (template) =>
      Boolean(template.last_error) ||
      !template.next_run_date ||
      (template.line_items ?? []).length === 0 ||
      (template.line_items ?? []).every((item) => lineTotal(item) <= 0)
  );
  const autopilotCoverage =
    runnableTemplates.length > 0
      ? Math.round((autoCreateTemplates.length / runnableTemplates.length) * 100)
      : 0;
  const nextSevenDayTemplates = autoCreateTemplates
    .filter((template) => {
      const days = daysUntilDate(template.next_run_date);
      return days !== null && days >= 0 && days <= 7;
    })
    .sort(
      (first, second) =>
        (daysUntilDate(first.next_run_date) ?? 9999) -
        (daysUntilDate(second.next_run_date) ?? 9999)
    )
    .slice(0, 4);
  const recurringAutopilotSignals = [
    {
      label: "Autopilot Coverage",
      value: `${autopilotCoverage}%`,
      detail:
        activeTemplates.length > 0
          ? `${autoCreateTemplates.length} of ${runnableTemplates.length} active templates are scheduled to run.`
          : "Create a template to start recurring invoice coverage.",
      tone: autopilotCoverage >= 80 ? "emerald" : "amber",
    },
    {
      label: "Paused Revenue",
      value: formatCurrency(pausedMonthlyTotal),
      detail:
        pausedTemplates.length > 0
          ? `${pausedTemplates.length} active template${pausedTemplates.length === 1 ? "" : "s"} set to manual review.`
          : "No recurring value is paused right now.",
      tone: pausedTemplates.length > 0 ? "amber" : "emerald",
    },
    {
      label: "Schedule Gaps",
      value: String(templatesMissingRunDate.length),
      detail:
        templatesMissingRunDate.length > 0
          ? "Templates need a next run date before they can run predictably."
          : "Every scheduled template has a next run date.",
      tone: templatesMissingRunDate.length > 0 ? "rose" : "emerald",
    },
  ];
  const recurringHealthCards = [
    {
      label: "Monthly Base",
      value: formatCurrency(recurringMonthlyTotal),
      detail: "Active recurring template value.",
      tone: "emerald",
    },
    {
      label: "Due Runs",
      value: String(dueTemplates.length),
      detail:
        dueTemplates.length > 0
          ? `${formatCurrency(dueDraftTotal)} ready to run.`
          : "No recurring invoices need to run today.",
      tone: dueTemplates.length > 0 ? "amber" : "zinc",
    },
    {
      label: "Paused",
      value: String(pausedTemplates.length),
      detail: "Active templates set to manual only.",
      tone: pausedTemplates.length > 0 ? "cyan" : "zinc",
    },
    {
      label: "Needs Attention",
      value: String(templatesWithErrors.length),
      detail: "Templates with a saved generation error.",
      tone: templatesWithErrors.length > 0 ? "rose" : "zinc",
    },
  ];

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

    setCustomerName(client.name.trim());
    setRecipientEmail(client.email ?? "");
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

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setName("");
    setSelectedClientId("");
    setCustomerName("");
    setProjectTitle("");
    setServiceAddress("");
    setReference("");
    setDeliveryFormat("standard");
    setAutoCreateDrafts(true);
    setAutoSendEnabled(false);
    setRecipientEmail("");
    setCcEmail("");
    setBccEmail("");
    setEndType("forever");
    setEndDate("");
    setMaxOccurrences("");
    setNextRunDate(toDateInputValue(new Date()));
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

  function editTemplate(template: RecurringTemplate) {
    setEditingTemplateId(template.id);
    setName(template.name ?? "");
    setSelectedClientId(template.client_id ?? "");
    setCustomerName(template.customer_name ?? "");
    setProjectTitle(template.project_title ?? "");
    setServiceAddress(template.service_address ?? "");
    setReference(template.reference ?? "");
    setDeliveryFormat(template.delivery_format ?? "standard");
    setAutoCreateDrafts(Boolean(template.auto_create_drafts));
    setAutoSendEnabled(Boolean(template.auto_send_enabled));
    setRecipientEmail(template.recipient_email ?? "");
    setCcEmail(template.cc_email ?? "");
    setBccEmail(template.bcc_email ?? "");
    setEndType(template.end_type ?? "forever");
    setEndDate(template.end_date ?? "");
    setMaxOccurrences(
      template.max_occurrences !== null ? String(template.max_occurrences) : ""
    );
    setNextRunDate(template.next_run_date ?? toDateInputValue(new Date()));
    setDayOfMonth(String(template.day_of_month ?? 1));
    setDueDays(String(template.due_days ?? 30));
    setTaxLabel(template.tax_label ?? "");
    setTaxRate(template.tax_rate !== null ? String(template.tax_rate) : "");
    setTerms(template.terms ?? "Payment due upon invoice. Thank you for your business.");
    setNotes(template.notes ?? "");
    setEmailSubject(template.email_subject ?? "");
    setEmailBody(template.email_body ?? "");
    setLineItems(
      template.line_items && template.line_items.length > 0
        ? template.line_items
        : [{ ...emptyLineItem }]
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    if (autoSendEnabled && !isValidEmail(recipientEmail.trim())) {
      setToast({
        type: "error",
        message: "Auto Send mode needs a valid recipient email.",
      });
      return;
    }

    if (ccEmail.trim() && !isValidEmail(ccEmail.trim())) {
      setToast({
        type: "error",
        message: "CC must be a valid email address or left blank.",
      });
      return;
    }

    if (bccEmail.trim() && !isValidEmail(bccEmail.trim())) {
      setToast({
        type: "error",
        message: "BCC must be a valid email address or left blank.",
      });
      return;
    }

    if (endType === "until_date" && !endDate) {
      setToast({
        type: "error",
        message: "Choose an Until Date or set repeat to Forever.",
      });
      return;
    }

    if (
      endType === "after_occurrences" &&
      (!Number(maxOccurrences) || Number(maxOccurrences) < 1)
    ) {
      setToast({
        type: "error",
        message: "After X Occurrences needs a positive number.",
      });
      return;
    }

    setIsSaving(true);

    const templatePayload = {
      business_id: business.id,
      client_id: selectedClientId || null,
      name: name.trim(),
      customer_name: customerName.trim(),
      project_title: projectTitle.trim(),
      service_address: serviceAddress.trim() || null,
      reference: reference.trim() || null,
      delivery_format: deliveryFormat,
      frequency: "monthly",
      next_run_date: nextRunDate || toDateInputValue(new Date()),
      auto_create_drafts: autoCreateDrafts,
      auto_send_enabled: autoSendEnabled,
      recipient_email: recipientEmail.trim() || null,
      cc_email: ccEmail.trim() || null,
      bcc_email: bccEmail.trim() || null,
      end_type: endType,
      end_date: endType === "until_date" ? endDate : null,
      max_occurrences:
        endType === "after_occurrences" ? Number(maxOccurrences) : null,
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
      updated_at: new Date().toISOString(),
    };

    const query = editingTemplateId
      ? supabase
          .from("recurring_invoice_templates")
          .update(templatePayload)
          .eq("id", editingTemplateId)
          .eq("business_id", business.id)
          .select()
          .single()
      : supabase
          .from("recurring_invoice_templates")
          .insert({
            ...templatePayload,
            occurrences_sent: 0,
          })
          .select()
          .single();

    const { data, error } = await query;

    setIsSaving(false);

    if (error || !data) {
      setToast({
        type: "error",
        message:
          "Recurring invoice could not be saved. If this is the first time, run the Supabase SQL first.",
      });
      return;
    }

    setTemplates((current) =>
      editingTemplateId
        ? current.map((item) =>
            item.id === editingTemplateId ? (data as RecurringTemplate) : item
          )
        : [data as RecurringTemplate, ...current]
    );
    setToast({
      type: "success",
      message: editingTemplateId
        ? "Recurring invoice updated."
        : "Recurring invoice saved.",
    });

    resetTemplateForm();
  }

  async function createDraftInvoice(template: RecurringTemplate) {
    if (!business) {
      return;
    }

    const templateLineItems = (template.line_items ?? []).filter(
      (item) => item.description?.trim() && Number(item.quantity) > 0
    );

    if (isRecurringEndMet(template)) {
      setToast({
        type: "error",
        message:
          "This recurring invoice has reached its end condition. Resume or edit it before running again.",
      });
      return;
    }

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
      const issueDate = template.next_run_date
        ? new Date(`${template.next_run_date}T00:00:00`)
        : new Date();
      const dueDate = addDays(issueDate, Number(template.due_days) || 0);
      const nextRunDate = addMonthsToDateInput(template.next_run_date);
      const nextOccurrences = (template.occurrences_sent ?? 0) + 1;
      const shouldPause = shouldPauseAfterRun(
        template,
        nextRunDate,
        nextOccurrences
      );
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
            "Recurring invoice prepared in Manual / Draft mode. Review and send manually from Trimax.",
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
          last_generated_for_date: toDateInputValue(issueDate),
          next_run_date: nextRunDate,
          occurrences_sent: nextOccurrences,
          auto_create_drafts: shouldPause ? false : template.auto_create_drafts,
          auto_send_enabled: shouldPause ? false : template.auto_send_enabled,
          last_error: null,
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
                last_generated_for_date: toDateInputValue(issueDate),
                next_run_date: nextRunDate,
                occurrences_sent: nextOccurrences,
                auto_create_drafts: shouldPause
                  ? false
                  : item.auto_create_drafts,
                auto_send_enabled: shouldPause ? false : item.auto_send_enabled,
                last_error: null,
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
        message: shouldPause
          ? `${displayId} was created. This recurring invoice reached its end condition and is now paused.`
          : `${displayId} was created. Review it before sending.`,
      });
    } catch (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to create the recurring invoice. Check the template and try again.",
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

  async function toggleAutoCreateDrafts(template: RecurringTemplate) {
    if (!business) {
      return;
    }

    const nextValue = !template.auto_create_drafts;
    const { error } = await supabase
      .from("recurring_invoice_templates")
      .update({
        auto_create_drafts: nextValue,
        auto_send_enabled: nextValue ? template.auto_send_enabled : false,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
      .eq("business_id", business.id);

    if (error) {
      setToast({
        type: "error",
        message: "Recurring invoice schedule could not be updated.",
      });
      return;
    }

    setTemplates((current) =>
      current.map((item) =>
        item.id === template.id
            ? {
                ...item,
                auto_create_drafts: nextValue,
                auto_send_enabled: nextValue ? item.auto_send_enabled : false,
                last_error: null,
              }
          : item
      )
    );
    setToast({
      type: "success",
      message: nextValue
        ? `${template.name} will run on its monthly schedule.`
        : `${template.name} is paused. You can still create invoices manually.`,
    });
  }

  async function toggleAutoSendMode(template: RecurringTemplate) {
    if (!business) {
      return;
    }

    const nextValue = !template.auto_send_enabled;
    const fallbackRecipient =
      template.recipient_email ||
      clients.find((client) => client.id === template.client_id)?.email ||
      "";

    if (nextValue && !fallbackRecipient.trim().includes("@")) {
      setToast({
        type: "error",
        message:
          "Add a client email or create a new template with an Auto Send recipient before enabling Auto Send.",
      });
      return;
    }

    const { error } = await supabase
      .from("recurring_invoice_templates")
      .update({
        auto_create_drafts: true,
        auto_send_enabled: nextValue,
        recipient_email: fallbackRecipient.trim() || null,
        last_error: null,
        last_send_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id)
      .eq("business_id", business.id);

    if (error) {
      setToast({
        type: "error",
        message: "Recurring invoice mode could not be updated.",
      });
      return;
    }

    setTemplates((current) =>
      current.map((item) =>
        item.id === template.id
          ? {
              ...item,
              auto_create_drafts: true,
              auto_send_enabled: nextValue,
              recipient_email: fallbackRecipient.trim() || null,
              last_error: null,
              last_send_error: null,
            }
          : item
      )
    );

    setToast({
      type: "success",
      message: nextValue
        ? `${template.name} is in Auto Send mode.`
        : `${template.name} is in Manual / Draft mode.`,
    });
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
            <BackButton label="Back" fallbackHref={`/invoices${businessQuery}`} />

            <p className="mt-4 text-sm uppercase tracking-[0.3em] text-orange-400">
              Recurring Invoices
            </p>

            <h1 className="mt-2 text-4xl font-bold">Recurring Invoices</h1>

            <p className="mt-2 max-w-3xl text-zinc-400">
              Save repeat invoice packages for Just Kleen, then choose Manual /
              Manual / Draft mode or Auto Send mode for each recurring invoice.
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
              Invoice Ready
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              {generatedInvoice.displayId} is ready
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Open the invoice, confirm the customer-facing PDF/export, then send
              it from Trimax when it is a Manual / Draft invoice.
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

        <Card className="recurring-health-strip border-emerald-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-emerald-200">
                Recurring Health
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Keep repeat billing predictable
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                See the monthly base, runs due now, paused templates, and any
                template errors before customer-facing invoices are created.
              </p>
            </div>

            <Link href={`/activity${businessQuery}&type=invoice`}>
              <Button variant="secondary">Open Invoice Trail</Button>
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recurringHealthCards.map((card) => (
              <div
                key={card.label}
                data-tone={card.tone}
                className="recurring-health-card rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {card.detail}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="recurring-autopilot-panel border-orange-500/20 bg-zinc-950/70 p-4">
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-300">
                Billing Autopilot
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Recurring revenue, guarded before it slips
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Trimax now surfaces automation coverage, paused revenue, and
                schedule gaps in one place so repeat invoices stay predictable.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {recurringAutopilotSignals.map((signal) => (
                  <div
                    key={signal.label}
                    data-tone={signal.tone}
                    className="recurring-autopilot-signal rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                      {signal.label}
                    </p>
                    <p className="mt-3 text-2xl font-black text-white">
                      {signal.value}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-zinc-400">
                      {signal.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="recurring-next-window rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                    Next 7 Days
                  </p>
                  <h3 className="mt-2 text-lg font-black text-white">
                    Upcoming Runs
                  </h3>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                  {nextSevenDayTemplates.length} queued
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {nextSevenDayTemplates.length > 0 ? (
                  nextSevenDayTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="recurring-window-item rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-white">
                            {template.name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {template.customer_name}
                          </p>
                        </div>
                        <span className="text-right text-xs font-black uppercase tracking-[0.14em] text-orange-200">
                          {formatDate(template.next_run_date)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm leading-6 text-zinc-400">
                    No automatic runs are scheduled in the next seven days. The
                    next template will appear here when it enters the work
                    window.
                  </p>
                )}
              </div>

              {templatesNeedingReview.length > 0 ? (
                <p className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm leading-6 text-rose-100">
                  {templatesNeedingReview.length} template
                  {templatesNeedingReview.length === 1 ? "" : "s"} should be
                  reviewed before the next billing cycle.
                </p>
              ) : (
                <p className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-100">
                  No recurring templates are showing errors, missing dates, or
                  empty invoice value.
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                {editingTemplateId ? "Edit Recurring Invoice" : "New Recurring Invoice"}
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                {editingTemplateId
                  ? "Update the saved recurring invoice"
                  : "Save a repeat invoice package"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Use this for the church invoice and the BOA / 5 Star 5 invoice.
                Trimax can save this as Manual / Draft mode for review, or Auto
                Send mode for scheduled customer delivery.
              </p>
            </div>
            <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
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
              <label className="app-form-label mb-2 block text-sm text-zinc-400">Client</label>
              <select
                value={selectedClientId}
                onChange={(event) => chooseClient(event.target.value)}
                className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="" className="bg-white text-slate-950">
                  {isLoading
                    ? "Loading clients..."
                    : clients.length > 0
                      ? "Choose a client or type the customer below"
                      : "No clients found for this business"}
                </option>
                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                    className="bg-white text-slate-950"
                  >
                    {client.name.trim() || "Unnamed client"}
                  </option>
                ))}
              </select>
              {clients.length === 0 && !isLoading ? (
                <p className="app-helper-text mt-2 text-xs leading-5 text-zinc-500">
                  No clients are saved for this business yet. You can still type
                  the customer manually.
                </p>
              ) : null}
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
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Customer Format
              </label>
              <select
                value={deliveryFormat}
                onChange={(event) =>
                  setDeliveryFormat(event.target.value as "standard" | "5stars_boa")
                }
                className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="standard">Normal invoice PDF</option>
                <option value="5stars_boa">BOA / 5 Star 5 spreadsheet format</option>
              </select>
            </div>

            <label className="app-soft-panel flex min-h-[82px] cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <input
                type="checkbox"
                checked={autoCreateDrafts}
                onChange={(event) => setAutoCreateDrafts(event.target.checked)}
                className="mt-1 h-5 w-5 accent-sky-500"
              />
              <span>
                <span className="block text-sm font-semibold text-white">
                  Run monthly
                </span>
                <span className="mt-1 block text-sm leading-5 text-zinc-400">
                  Trimax will run this template on the schedule. Pause this when
                  you do not want invoices created or auto-sent.
                </span>
              </span>
            </label>

            <label className="app-soft-panel flex min-h-[82px] cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(event) => {
                  setAutoSendEnabled(event.target.checked);
                  if (event.target.checked) {
                    setAutoCreateDrafts(true);
                  }
                }}
                className="mt-1 h-5 w-5 accent-emerald-500"
              />
              <span>
                <span className="block text-sm font-semibold text-white">
                  Auto Send mode
                </span>
                <span className="mt-1 block text-sm leading-5 text-zinc-400">
                  Create and send the invoice automatically with the official
                  customer PDF attached. Leave off for Manual / Draft mode.
                </span>
              </span>
            </label>

            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
                  Delivery
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Auto Send mode requires a recipient. CC and BCC are optional
                  for temporary routing changes.
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <InputField
                    label="Recipient"
                    type="email"
                    placeholder="customer@example.com"
                    value={recipientEmail}
                    onChange={setRecipientEmail}
                    helperText="Required for Auto Send mode."
                  />
                  <InputField
                    label="CC"
                    type="email"
                    placeholder="Optional"
                    value={ccEmail}
                    onChange={setCcEmail}
                  />
                  <InputField
                    label="BCC"
                    type="email"
                    placeholder="Optional private copy"
                    value={bccEmail}
                    onChange={setBccEmail}
                  />
                </div>
              </div>
            </div>

            <InputField
              label="Next Run Date"
              type="date"
              value={nextRunDate}
              onChange={setNextRunDate}
              helperText="Trimax will run this template on this date, then move it ahead one month after the invoice is created or the auto-send succeeds."
            />

            <InputField
              label="Day of Month"
              type="number"
              value={dayOfMonth}
              onChange={setDayOfMonth}
              helperText="Use the same day as the next run date. This keeps the schedule clear."
            />

            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">
                  Repeat
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className="app-form-label mb-2 block text-sm text-zinc-400">
                      End Condition
                    </label>
                    <select
                      value={endType}
                      onChange={(event) =>
                        setEndType(
                          event.target.value as
                            | "forever"
                            | "until_date"
                            | "after_occurrences"
                        )
                      }
                      className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                    >
                      <option value="forever">Forever</option>
                      <option value="until_date">Until Date</option>
                      <option value="after_occurrences">
                        After X Occurrences
                      </option>
                    </select>
                  </div>
                  <InputField
                    label="End Date"
                    type="date"
                    value={endDate}
                    onChange={setEndDate}
                    helperText="Used only when repeat is Until Date."
                  />
                  <InputField
                    label="Max Occurrences"
                    type="number"
                    placeholder="Example: 12"
                    value={maxOccurrences}
                    onChange={setMaxOccurrences}
                    helperText="Used only when repeat is After X Occurrences."
                  />
                </div>
              </div>
            </div>

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
              <label className="app-form-label mb-2 block text-sm text-zinc-400">Terms</label>
              <textarea
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
                className="app-form-input min-h-24 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="app-form-label mb-2 block text-sm text-zinc-400">Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="app-form-input min-h-24 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
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
                  className="app-soft-panel grid gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4 lg:grid-cols-[1fr_120px_160px_auto]"
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
              <label className="app-form-label mb-2 block text-sm text-zinc-400">
                Email Body
              </label>
              <textarea
                value={emailBody}
                onChange={(event) => setEmailBody(event.target.value)}
                placeholder="Optional. Blank means Trimax will create a simple email body."
                className="app-form-input min-h-36 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={saveTemplate}
                disabled={isSaving || Boolean(setupMessage)}
              >
                {isSaving
                  ? "Saving..."
                  : editingTemplateId
                    ? "Save Changes"
                    : "Save Recurring Invoice"}
              </Button>
              {editingTemplateId ? (
                <Button variant="secondary" onClick={resetTemplateForm}>
                  Cancel Edit
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="recurring-command-panel border-sky-500/20 bg-sky-500/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                Recurring Workflow
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Recurring schedule command center
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                FreshBooks-style recurring invoices with two modes: Manual /
                Draft for review, or Auto Send for scheduled customer delivery.
              </p>
            </div>

            <Link href={`/invoices${businessQuery}&status=draft`}>
              <Button variant="secondary">Review Generated Invoices</Button>
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="recurring-metric-card rounded-2xl border p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em]">
                Active
              </p>
              <p className="mt-2 text-3xl font-black">
                {activeTemplates.length}
              </p>
              <p className="mt-1 text-sm">Templates in use</p>
            </div>

            <div className="recurring-metric-card rounded-2xl border p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em]">
                Scheduled
              </p>
              <p className="mt-2 text-3xl font-black">
                {autoCreateTemplates.length}
              </p>
              <p className="mt-1 text-sm">Scheduled monthly</p>
            </div>

            <div className="recurring-metric-card rounded-2xl border p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em]">
                Auto Send
              </p>
              <p className="mt-2 text-3xl font-black">
                {autoSendTemplates.length}
              </p>
              <p className="mt-1 text-sm">Send without prompting</p>
            </div>

            <div className="recurring-metric-card rounded-2xl border p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em]">
                Due Now
              </p>
              <p className="mt-2 text-3xl font-black">
                {dueTemplates.length}
              </p>
              <p className="mt-1 text-sm">Ready to create</p>
            </div>

            <div className="recurring-metric-card rounded-2xl border p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em]">
                Paused
              </p>
              <p className="mt-2 text-3xl font-black">
                {pausedTemplates.length}
              </p>
              <p className="mt-1 text-sm">Manual only</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
            {nextScheduledTemplate ? (
              <>
                Next recurring run:{" "}
                <span className="font-black text-white">
                  {nextScheduledTemplate.name}
                </span>{" "}
                on{" "}
                <span className="font-black text-sky-200">
                  {formatDate(nextScheduledTemplate.next_run_date)}
                </span>
                .
              </>
            ) : (
              "No recurring runs are currently scheduled. Turn on monthly runs for a template when you want Trimax to prepare it monthly."
            )}
          </div>
        </Card>

        <Card>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Saved Templates
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Saved Recurring Invoices
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
                const scheduleStatus = scheduleStatusLabel(template);
                const scheduleDays = daysUntilDate(template.next_run_date);
                const scheduleTone = !template.is_active
                  ? "archived"
                  : !template.auto_create_drafts
                    ? "paused"
                    : scheduleDays !== null && scheduleDays <= 0
                      ? "due"
                      : "scheduled";

                return (
                  <div
                    key={template.id}
                    className={`recurring-template-card rounded-2xl border border-zinc-800 bg-zinc-950 p-4 ${
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
                          <span
                            className="recurring-schedule-pill rounded-full border px-3 py-1"
                            data-tone={scheduleTone}
                          >
                            {scheduleStatus}
                          </span>
                          <span className="app-chip rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                            Status:{" "}
                            {template.is_active && !isRecurringEndMet(template)
                              ? "Active"
                              : "Paused"}
                          </span>
                          <span className="app-chip rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                            Monthly on day {template.day_of_month}
                          </span>
                          <span className="app-chip rounded-full border border-orange-500/40 px-3 py-1 text-orange-200">
                            Next run: {formatDate(template.next_run_date)}
                          </span>
                          <span className="app-chip rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                            Due in {template.due_days} days
                          </span>
                          <span className="app-chip rounded-full border border-green-500/40 px-3 py-1 text-green-200">
                            {template.delivery_format === "5stars_boa"
                              ? "BOA / 5 Star 5 format"
                              : "Normal PDF"}
                          </span>
                          <span className="app-chip rounded-full border border-emerald-500/40 px-3 py-1 text-emerald-200">
                            Mode: {recurringModeLabel(template)}
                          </span>
                          <span className="app-chip rounded-full border border-sky-500/40 px-3 py-1 text-sky-200">
                            Repeat: {recurringEndLabel(template)}
                          </span>
                        </div>
                      </div>

                      <div className="text-left lg:text-right">
                        <p className="text-sm text-zinc-400">Monthly Amount</p>
                        <p className="mt-1 text-2xl font-black text-white">
                          {formatCurrency(total)}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          Recipient: {template.recipient_email || "Not set"}
                        </p>
                        {template.cc_email ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            CC: {template.cc_email}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-zinc-500">
                          Last created: {formatDate(template.last_generated_at)}
                        </p>
                        {template.auto_send_enabled ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            Last sent: {formatDate(template.last_sent_at)}
                          </p>
                        ) : null}
                        {template.last_error ? (
                          <p className="mt-2 max-w-md text-xs text-red-200">
                            Last error: {template.last_error}
                          </p>
                        ) : null}
                        {template.last_send_error ? (
                          <p className="mt-2 max-w-md text-xs text-red-200">
                            Last send error: {template.last_send_error}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => editTemplate(template)}
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => createDraftInvoice(template)}
                        disabled={
                          !template.is_active ||
                          isRecurringEndMet(template) ||
                          generatingId === template.id
                        }
                      >
                        {generatingId === template.id
                          ? "Creating..."
                          : template.auto_send_enabled
                            ? "Create Invoice Now"
                            : "Create Next Invoice Now"}
                      </Button>
                      {template.last_generated_invoice_id ? (
                        <Link
                          href={`/invoices/${template.last_generated_invoice_id}${businessQuery}`}
                        >
                          <Button variant="secondary">Open Last Invoice</Button>
                        </Link>
                      ) : null}
                      {template.is_active ? (
                        <Button
                          variant="secondary"
                          onClick={() => toggleAutoCreateDrafts(template)}
                        >
                          {template.auto_create_drafts
                            ? "Pause"
                            : "Resume"}
                        </Button>
                      ) : null}
                      {template.is_active ? (
                        <Button
                          variant="secondary"
                          onClick={() => toggleAutoSendMode(template)}
                        >
                          {template.auto_send_enabled
                            ? "Use Manual / Draft"
                            : "Enable Auto Send"}
                        </Button>
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
