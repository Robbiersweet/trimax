import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  findDuplicateRemittance,
  type DuplicateRemittanceActivity,
} from "@/app/lib/duplicateRemittance";
import { createRemittanceDocumentFingerprint } from "@/app/lib/remittanceDocumentFingerprint";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

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

function cleanString(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function moneyNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(cleanString(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
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
    return { ok: false, email: null, userId: null, role: "" };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false, email: null, userId: null, role: "" };
  }

  const userEmail = userData.user.email?.toLowerCase() ?? "";
  const { data, error } = await supabase
    .from("business_users")
    .select("id, role")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .limit(1)
    .maybeSingle<{ id: string; role?: string | null }>();

  if (error || !data) {
    return {
      ok: false,
      email: userData.user.email ?? null,
      userId: userData.user.id,
      role: "",
    };
  }

  return {
    ok: true,
    email: userData.user.email ?? null,
    userId: userData.user.id,
    role: data.role ?? "",
  };
}

function normalizedDate(value: unknown) {
  const text = cleanString(value, 40);

  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

async function fingerprintStoredPaymentImage(
  supabase: AdminClient,
  storagePath: string
) {
  const { data, error } = await supabase.storage
    .from("trimax-payment-images")
    .download(storagePath);

  if (error || !data) {
    return "";
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const fingerprint = await createRemittanceDocumentFingerprint(buffer);

  return fingerprint.hash;
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Duplicate remittance preflight is not configured." },
      { status: 503 }
    );
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json(
      { error: "Duplicate remittance preflight needs an image." },
      { status: 400 }
    );
  }

  const businessId = cleanString(formData.get("businessId"), 80);
  const file = formData.get("remittanceImage");

  if (!businessId || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Duplicate remittance preflight needs a workspace and image." },
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

  const currentBuffer = Buffer.from(await file.arrayBuffer());
  const currentFingerprint =
    await createRemittanceDocumentFingerprint(currentBuffer);
  const { data: activityData, error: activityError } = await supabase
    .from("activity_logs")
    .select("id, action, entity_id, entity_label, details, created_at")
    .eq("business_id", businessId)
    .eq("action", "invoice.batch_payment_applied")
    .order("created_at", { ascending: false })
    .limit(250);

  if (activityError) {
    return NextResponse.json(
      { error: "Trimax could not verify prior payment activity." },
      { status: 500 }
    );
  }

  const storedImageFingerprints = new Map<string, string>();
  const activities = await Promise.all(
    ((activityData ?? []) as Array<{
      id: string;
      action: string;
      entity_id?: string | null;
      entity_label?: string | null;
      details?: Record<string, unknown> | null;
      created_at?: string | null;
    }>).map(async (activity): Promise<DuplicateRemittanceActivity> => {
      const details = { ...(activity.details ?? {}) };
      const existingFingerprint = cleanString(
        details.remittanceDocumentFingerprint ?? details.documentFingerprint,
        300
      );
      const storagePath = cleanString(details.paymentImagePath, 1000);

      if (!existingFingerprint && storagePath) {
        const cached =
          storedImageFingerprints.get(storagePath) ??
          (await fingerprintStoredPaymentImage(supabase, storagePath).catch(() => ""));

        if (cached) {
          storedImageFingerprints.set(storagePath, cached);
          details.remittanceDocumentFingerprint = cached;
        }
      }

      return {
        id: activity.id,
        action: activity.action,
        entityId: activity.entity_id ?? null,
        entityLabel: activity.entity_label ?? null,
        details,
        createdAt: activity.created_at ?? null,
      };
    })
  );
  const duplicateRemittance = findDuplicateRemittance(
    {
      checkNumber: cleanString(formData.get("checkNumber"), 120),
      amount: moneyNumber(formData.get("amount")),
      checkDate: normalizedDate(formData.get("checkDate")),
      receivedDate: normalizedDate(formData.get("receivedDate")),
      payor: cleanString(formData.get("payor"), 160),
      invoiceIds: cleanString(formData.get("invoiceIds"), 3000)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      invoiceNumbers: cleanString(formData.get("invoiceNumbers"), 3000)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      fingerprint: currentFingerprint.hash,
    },
    activities,
    access.role
  );

  return NextResponse.json({
    ok: true,
    documentFingerprint: {
      version: currentFingerprint.version,
      hash: currentFingerprint.hash,
    },
    priorImagesCompared: storedImageFingerprints.size,
    duplicateRemittance,
  });
}
