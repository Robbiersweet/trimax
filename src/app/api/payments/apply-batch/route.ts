import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  invoiceCollectionAmountDue,
  isPaymentEligibleInvoice,
  type InvoiceEligibilityLineItem,
} from "../../../lib/invoiceEligibility";
import { moneyNumber } from "../../../lib/invoiceLifecycle";

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
      business_users: GenericTable;
      invoice_line_items: GenericTable;
      invoices: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type InvoiceRow = {
  id: string;
  business_id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount: string | number | null;
  deposit_status: string | null;
  status: string | null;
};

type InvoiceLineItemRow = InvoiceEligibilityLineItem & {
  invoice_id: string;
};

type BusinessUserRow = {
  id: string;
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

async function requireWorkspaceAccess({
  supabase,
  token,
  businessId,
}: {
  supabase: AdminClient;
  token: string | null;
  businessId: string;
}) {
  if (!token) {
    return { ok: false, email: null, userId: null };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false, email: null, userId: null };
  }

  const userEmail = userData.user.email?.toLowerCase() ?? "";
  const { data, error } = await supabase
    .from("business_users")
    .select("id")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .limit(1)
    .maybeSingle<BusinessUserRow>();

  if (error || !data) {
    return {
      ok: false,
      email: userData.user.email ?? null,
      userId: userData.user.id,
    };
  }

  return {
    ok: true,
    email: userData.user.email ?? null,
    userId: userData.user.id,
  };
}

function cleanString(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Payment application is not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    businessId?: string;
    invoiceIds?: string[];
    paymentDate?: string;
    paymentType?: string;
    paymentReference?: string;
    internalNote?: string;
    checkAmount?: number;
    paymentAttachmentId?: string | null;
    paymentImagePath?: string | null;
    paymentImageFileName?: string | null;
    remittanceStubMatched?: boolean;
    remittanceStubTotal?: number | null;
    remittanceStubLineCount?: number | null;
    remittanceMatchConfidence?: number | null;
  };
  const businessId = cleanString(body.businessId, 80);
  const invoiceIds = Array.from(
    new Set((body.invoiceIds ?? []).map((id) => cleanString(id, 80)).filter(Boolean))
  );

  if (!businessId || invoiceIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one invoice before applying payment." },
      { status: 400 }
    );
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const access = await requireWorkspaceAccess({
    supabase,
    token,
    businessId,
  });

  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, business_id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status"
    )
    .eq("business_id", businessId)
    .in("id", invoiceIds)
    .returns<InvoiceRow[]>();

  if (invoiceError) {
    return NextResponse.json(
      { error: "Trimax could not verify selected invoices." },
      { status: 500 }
    );
  }

  if ((invoiceData ?? []).length !== invoiceIds.length) {
    return NextResponse.json(
      { error: "One selected invoice could not be found in this workspace." },
      { status: 400 }
    );
  }

  const { data: childData } = await supabase
    .from("invoices")
    .select("split_parent_invoice_id")
    .eq("business_id", businessId)
    .in("split_parent_invoice_id", invoiceIds)
    .returns<{ split_parent_invoice_id: string | null }[]>();
  const splitChildrenByParentId = new Map<string, number>();
  (childData ?? []).forEach((child) => {
    const parentId = String(child.split_parent_invoice_id ?? "");
    if (!parentId) return;
    splitChildrenByParentId.set(
      parentId,
      (splitChildrenByParentId.get(parentId) ?? 0) + 1
    );
  });

  const { data: lineItemData, error: lineItemError } = await supabase
    .from("invoice_line_items")
    .select("invoice_id, description, quantity, unit_price, line_total")
    .in("invoice_id", invoiceIds)
    .returns<InvoiceLineItemRow[]>();

  if (lineItemError) {
    return NextResponse.json(
      { error: "Trimax could not verify invoice line items." },
      { status: 500 }
    );
  }

  const lineItemsByInvoiceId = new Map<string, InvoiceEligibilityLineItem[]>();
  (lineItemData ?? []).forEach((lineItem) => {
    const current = lineItemsByInvoiceId.get(lineItem.invoice_id) ?? [];
    current.push(lineItem);
    lineItemsByInvoiceId.set(lineItem.invoice_id, current);
  });
  const invoices = (invoiceData ?? []).map((invoice) => ({
    ...invoice,
    split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
  }));
  const invalidInvoice = invoices.find(
    (invoice) =>
      !isPaymentEligibleInvoice({
        invoice,
        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      })
  );

  if (invalidInvoice) {
    return NextResponse.json(
      {
        error: `${invalidInvoice.display_id ?? "This invoice"} is not collectible and cannot receive a payment.`,
        invoiceId: invalidInvoice.id,
      },
      { status: 400 }
    );
  }

  const appliedInvoices = [];

  for (const invoice of invoices) {
    const invoiceAmount = moneyNumber(invoice.invoice_amount);
    const amountPaid = moneyNumber(invoice.amount_paid);
    const amountDue = invoiceCollectionAmountDue(invoice);
    const nextAmountPaid = Math.min(invoiceAmount, amountPaid + amountDue);
    const isFullyPaid =
      invoiceAmount > 0 && nextAmountPaid >= invoiceAmount - 0.01;
    const isDepositRequest =
      String(invoice.deposit_status ?? "none").toLowerCase() === "requested" &&
      moneyNumber(invoice.deposit_requested_amount) > 0;
    const updatePayload: {
      amount_paid: number;
      status: string;
      deposit_status?: string;
    } = {
      amount_paid: nextAmountPaid,
      status: isFullyPaid ? "Paid" : invoice.status ?? "Sent",
    };

    if (isDepositRequest && !isFullyPaid) {
      updatePayload.deposit_status = "paid";
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", invoice.id)
      .eq("business_id", businessId);

    if (updateError) {
      return NextResponse.json(
        { error: `Unable to apply payment to ${invoice.display_id ?? "invoice"}.` },
        { status: 500 }
      );
    }

    await supabase.from("activity_logs").insert({
      business_id: businessId,
      actor_user_id: access.userId,
      actor_email: access.email,
      action: "invoice.batch_payment_applied",
      entity_type: "invoice",
      entity_id: invoice.id,
      entity_label: invoice.display_id ?? invoice.project_title ?? "Invoice",
      details: {
        paymentDate: cleanString(body.paymentDate, 40),
        paymentType: cleanString(body.paymentType, 80),
        paymentReference: cleanString(body.paymentReference, 120),
        internalNote: cleanString(body.internalNote, 1000),
        checkAmount: moneyNumber(body.checkAmount ?? null),
        amountApplied: amountDue,
        resultingAmountPaid: nextAmountPaid,
        paymentOutcome: isFullyPaid ? "paid" : "partial",
        depositPayment: isDepositRequest,
        batchInvoiceCount: invoices.length,
        remittanceStubMatched: Boolean(body.remittanceStubMatched),
        remittanceStubTotal: body.remittanceStubTotal ?? null,
        remittanceStubLineCount: body.remittanceStubLineCount ?? null,
        remittanceMatchConfidence: body.remittanceMatchConfidence ?? null,
        paymentAttachmentId: body.paymentAttachmentId ?? null,
        paymentImagePath: body.paymentImagePath ?? null,
        paymentImageFileName: body.paymentImageFileName ?? null,
      },
    });

    appliedInvoices.push({
      invoiceId: invoice.id,
      displayId: invoice.display_id,
      amountApplied: amountDue,
      resultingAmountPaid: nextAmountPaid,
      status: updatePayload.status,
    });
  }

  return NextResponse.json({
    ok: true,
    appliedCount: appliedInvoices.length,
    appliedInvoices,
  });
}
