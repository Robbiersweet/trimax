import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Database = {
  public: {
    Tables: {
      push_subscriptions: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type QueueCreatedPayload = {
  businessId?: string;
  businessSlug?: string;
  property?: string;
  units?: string[];
  priority?: string;
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

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || "mailto:robbie@rnlcreations.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function getUnitLabel(units: string[]) {
  if (units.length === 0) {
    return "New queue item";
  }

  if (units.length === 1) {
    return `Unit ${units[0]}`;
  }

  return `${units.length} units`;
}

async function markSubscriptionError(
  supabase: AdminClient,
  id: string,
  message: string
) {
  await supabase
    .from("push_subscriptions")
    .update({
      status: "error",
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Push sender is missing Supabase service configuration." },
      { status: 500 }
    );
  }

  if (!configureWebPush()) {
    return NextResponse.json(
      { error: "Push sender is missing VAPID keys." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as QueueCreatedPayload;
  const businessId = body.businessId?.trim();
  const businessSlug = body.businessSlug?.trim() || "rnl-creations";
  const property = body.property?.trim() || "Queue";
  const units = body.units?.map((unit) => unit.trim()).filter(Boolean) ?? [];
  const unitLabel = getUnitLabel(units);

  if (!businessId) {
    return NextResponse.json(
      { error: "Missing business for push notification." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("business_id", businessId)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  const notificationPayload = JSON.stringify({
    title: `New queue request: ${property}`,
    body: `${unitLabel} was added${body.priority ? ` (${body.priority})` : ""}.`,
    url: `/queue?business=${businessSlug}`,
  });
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        notificationPayload
      )
    )
  );

  await Promise.all(
    results.map((result, index) => {
      if (result.status === "fulfilled") {
        return Promise.resolve();
      }

      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : "Push delivery failed.";

      return markSubscriptionError(supabase, subscriptions[index].id, reason);
    })
  );

  return NextResponse.json({
    ok: true,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
}
