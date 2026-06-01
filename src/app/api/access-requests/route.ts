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
      access_requests: GenericTable;
      activity_logs: GenericTable;
      businesses: GenericTable;
      push_subscriptions: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type AccessRequestPayload = {
  businessSlug?: string;
  requesterName?: string;
  requesterEmail?: string;
  companyOrProperty?: string;
  message?: string;
  website?: string;
};

type BusinessRow = {
  id: string;
  name: string | null;
  slug: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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

function cleanText(value: string | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

async function sendAccessRequestPush(
  supabase: AdminClient,
  business: BusinessRow,
  requesterName: string,
  requesterEmail: string
) {
  if (!configureWebPush()) {
    return;
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("business_id", business.id)
    .eq("status", "active");

  if (error) {
    return;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  const notificationPayload = JSON.stringify({
    title: "New Trimax access request",
    body: `${requesterName} (${requesterEmail}) requested ${business.name || business.slug}.`,
    url: `/settings?business=${business.slug}`,
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
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Access requests are missing server configuration." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as AccessRequestPayload;

  if (cleanText(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const businessSlug = cleanText(body.businessSlug, 80) || "rnl-creations";
  const requesterName = cleanText(body.requesterName, 120);
  const requesterEmail = cleanText(body.requesterEmail, 180).toLowerCase();
  const companyOrProperty = cleanText(body.companyOrProperty, 180);
  const message = cleanText(body.message, 1000);

  if (!requesterName) {
    return NextResponse.json(
      { error: "Enter your name." },
      { status: 400 }
    );
  }

  if (!isValidEmail(requesterEmail)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", businessSlug)
    .limit(1)
    .maybeSingle();

  if (businessError || !businessData) {
    return NextResponse.json(
      { error: "Trimax could not find that workspace." },
      { status: 400 }
    );
  }

  const business = businessData as BusinessRow;

  const { data: insertedRequest, error: requestError } = await supabase
    .from("access_requests")
    .insert({
      business_id: business.id,
      business_slug: business.slug,
      business_name: business.name,
      requester_name: requesterName,
      requester_email: requesterEmail,
      company_or_property: companyOrProperty || null,
      message: message || null,
      status: "new",
    })
    .select("id")
    .single();

  if (requestError || !insertedRequest) {
    return NextResponse.json(
      { error: "Trimax could not save this request. Please try again." },
      { status: 500 }
    );
  }

  await supabase.from("activity_logs").insert({
    business_id: business.id,
    actor_user_id: null,
    actor_email: requesterEmail,
    action: "access_request.created",
    entity_type: "access_request",
    entity_id: (insertedRequest as { id: string }).id,
    entity_label: requesterName,
    details: {
      requesterEmail,
      companyOrProperty,
      message,
    },
  });

  await sendAccessRequestPush(supabase, business, requesterName, requesterEmail);

  return NextResponse.json({ ok: true });
}
