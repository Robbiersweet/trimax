import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const serverClient = read("src/app/lib/supabaseServer.ts");

assert(
  serverClient.includes("createServerClient") &&
    serverClient.includes("cookies") &&
    serverClient.includes("cookieStore.getAll()"),
  "Server-rendered workspace pages must pass request cookies to Supabase so RLS sees the signed-in owner."
);

const protectedServerFiles = [
  "src/app/page.tsx",
  "src/app/queue/page.tsx",
  "src/app/queue/[unit]/page.tsx",
  "src/app/invoices/page.tsx",
  "src/app/invoices/[id]/page.tsx",
  "src/app/invoices/batch-payment/page.tsx",
  "src/app/invoices/batch-send/page.tsx",
  "src/app/estimates/page.tsx",
  "src/app/estimates/[id]/page.tsx",
  "src/app/payments/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/clients/page.tsx",
  "src/app/clients/[id]/page.tsx",
  "src/app/property-sales/page.tsx",
  "src/app/service-analytics/page.tsx",
  "src/app/schedule/page.tsx",
];

for (const file of protectedServerFiles) {
  const source = read(file);

  assert(
    source.includes("createSupabaseServerClient"),
    `${file} must use the authenticated server Supabase client after RLS hardening.`
  );
  assert(
    source.includes("const supabase = await createSupabaseServerClient();"),
    `${file} must create Supabase inside the request/page scope.`
  );
  assert(
    !source.includes("from \"../lib/supabase\"") &&
      !source.includes("from \"./lib/supabase\"") &&
      !source.includes("from \"../../lib/supabase\"") &&
      !source.includes("from \"../../../lib/supabase\""),
    `${file} must not use the browser Supabase client for server-rendered tenant data.`
  );
}

const invoicePage = read("src/app/invoices/page.tsx");
const queuePage = read("src/app/queue/page.tsx");
const servicesPage = read("src/app/services/page.tsx");

assert(
  invoicePage.includes(".from(\"invoices\")") &&
    invoicePage.includes(".eq(\"business_id\", business.id)"),
  "Invoice page must still scope owner invoice reads to the selected business."
);

assert(
  queuePage.includes(".from(\"queue_items\")") &&
    queuePage.includes(".eq(\"business_id\", selectedBusiness.id)"),
  "Queue page must still scope owner queue reads to the selected business."
);

assert(
  servicesPage.startsWith("\"use client\"") &&
    servicesPage.includes("from \"../lib/supabase\"") &&
    servicesPage.includes(".from(\"service_items\")") &&
    servicesPage.includes(".eq(\"business_id\", selectedBusiness.id)"),
  "Saved Services remains a browser-authenticated page and must scope reads to the selected business."
);

console.log("Owner server auth regression checks passed.");
