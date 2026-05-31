import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Database = {
  public: {
    Tables: {
      activity_logs: GenericTable;
      businesses: GenericTable;
      document_send_logs: GenericTable;
      invoice_line_items: GenericTable;
      invoices: GenericTable;
      recurring_invoice_templates: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

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
  due_days: number;
  tax_label: string | null;
  tax_rate: number | string | null;
  terms: string | null;
  notes: string | null;
  email_subject: string | null;
  email_body: string | null;
  line_items: RecurringLineItem[] | null;
  next_run_date: string | null;
  businesses: {
    name: string | null;
  } | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
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

function lineTotal(item: RecurringLineItem) {
  return (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseDocumentNumber(displayId: string | null) {
  if (!displayId) {
    return 0;
  }

  const match = displayId.match(/-(\d+)$/);

  return match ? Number(match[1]) : 0;
}

async function getNextInvoiceDisplayId(
  supabase: AdminClient,
  businessId: string
) {
  const { data, error } = await supabase
    .from("invoices")
    .select("display_id")
    .eq("business_id", businessId)
    .like("display_id", "INV-%");

  if (error) {
    throw error;
  }

  const displayRows = (data ?? []) as { display_id: string | null }[];
  const highestExistingNumber = displayRows.reduce(
    (highest, row) => Math.max(highest, parseDocumentNumber(row.display_id)),
    0
  );
  const nextNumber = Math.max(highestExistingNumber + 1, 500);

  return `INV-${String(nextNumber).padStart(4, "0")}`;
}

function defaultEmailSubject(displayId: string, customerName: string) {
  return `Invoice ${displayId} - ${customerName}`;
}

async function createInvoiceFromTemplate(
  supabase: AdminClient,
  template: RecurringTemplate
) {
  const templateLineItems = (template.line_items ?? []).filter(
    (item) => item.description?.trim() && Number(item.quantity) > 0
  );

  if (templateLineItems.length === 0) {
    throw new Error("Template has no usable line items.");
  }

  const issueDate = template.next_run_date
    ? new Date(`${template.next_run_date}T00:00:00`)
    : new Date();
  const dueDate = addDays(issueDate, Number(template.due_days) || 0);
  const subtotal = templateLineItems.reduce(
    (total, item) => total + lineTotal(item),
    0
  );
  const taxAmount = subtotal * ((Number(template.tax_rate) || 0) / 100);
  const total = subtotal + taxAmount;
  const displayId = await getNextInvoiceDisplayId(supabase, template.business_id);
  const amount = formatCurrency(total);
  const subject =
    template.email_subject?.trim() ||
    defaultEmailSubject(displayId, template.customer_name);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      business_id: template.business_id,
      client_id: template.client_id,
      created_by_user_id: null,
      display_id: displayId,
      customer_name: template.customer_name,
      project_title: template.project_title,
      service_address: template.service_address,
      invoice_amount: amount,
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

  const { error: lineError } = await supabase.from("invoice_line_items").insert(
    templateLineItems.map((item, index) => ({
      invoice_id: invoice.id,
      business_id: template.business_id,
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

  await supabase.from("document_send_logs").insert({
    business_id: template.business_id,
    document_type: "invoice",
    document_id: invoice.id,
    recipient_email: null,
    subject,
    status: "draft_prepared",
    created_by_email: "Trimax automation",
  });

  await supabase.from("activity_logs").insert({
    business_id: template.business_id,
    actor_user_id: null,
    actor_email: "Trimax automation",
    action: "invoice.recurring_draft_created",
    entity_type: "invoice",
    entity_id: invoice.id,
    entity_label: displayId,
    details: {
      templateName: template.name,
      customerName: template.customer_name,
      projectTitle: template.project_title,
      amount,
      deliveryFormat: template.delivery_format,
      automatic: true,
    },
  });

  await supabase
    .from("recurring_invoice_templates")
    .update({
      last_generated_invoice_id: invoice.id,
      last_generated_at: new Date().toISOString(),
      last_generated_for_date: toDateInputValue(issueDate),
      next_run_date: addMonthsToDateInput(template.next_run_date),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", template.id);

  return displayId;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel before enabling automatic recurring drafts.",
      },
      { status: 500 }
    );
  }

  const today = toDateInputValue(new Date());
  const { data, error } = await supabase
    .from("recurring_invoice_templates")
    .select("*, businesses(name)")
    .eq("is_active", true)
    .eq("auto_create_drafts", true)
    .not("next_run_date", "is", null)
    .lte("next_run_date", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const templates = (data ?? []) as RecurringTemplate[];
  const created: string[] = [];
  const failed: { template: string; error: string }[] = [];

  for (const template of templates) {
    try {
      const displayId = await createInvoiceFromTemplate(supabase, template);
      created.push(displayId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown recurring draft error.";

      failed.push({ template: template.name, error: message });

      await supabase
        .from("recurring_invoice_templates")
        .update({
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", template.id);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: templates.length,
    created,
    failed,
  });
}
