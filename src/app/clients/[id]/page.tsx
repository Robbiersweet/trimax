import Link from "next/link";
import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { supabase } from "../../lib/supabase";

type Client = {
  id: string;
  business_id: string | null;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
  notes: string | null;
};

type Business = {
  id: string;
  slug: string;
};

export default async function ClientDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <AppShell>
        <p className="text-red-400">
          Client not found.
        </p>
      </AppShell>
    );
  }

  const client = data as Client;

  let businessSlug = "rnl-creations";

  if (client.business_id) {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("id, slug")
      .eq("id", client.business_id)
      .single();

    const business =
      businessData as Business | null;

    if (business?.slug) {
      businessSlug = business.slug;
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href={`/clients?business=${businessSlug}`}
          className="inline-flex text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Clients
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Client Details
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {client.name}
            </h1>
          </div>

          <div className="flex gap-4">
            <Link
              href={`/clients/${client.id}/edit?business=${businessSlug}`}
            >
              <Button variant="secondary">
                Edit Client
              </Button>
            </Link>

            <Link
              href={`/invoices/new?business=${businessSlug}`}
            >
              <Button>
                Create Invoice
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Info
              label="Contact Name"
              value={client.contact_name}
            />

            <Info
              label="Email"
              value={client.email}
            />

            <Info
              label="Phone"
              value={client.phone}
            />

            <Info
              label="Billing Address"
              value={client.billing_address}
            />

            <Info
              label="Default Service Address"
              value={
                client.service_address ||
                client.billing_address
              }
            />
          </div>

          <div className="mt-6">
            <p className="text-sm text-zinc-500">
              Notes
            </p>

            <p className="mt-2 leading-7 text-zinc-300">
              {client.notes ||
                "No notes added."}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-medium">
        {value || "—"}
      </p>
    </div>
  );
}
