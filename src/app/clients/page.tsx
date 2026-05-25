import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    business?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};

  const businessSlug =
    resolvedSearchParams.business ??
    "rnl-creations";
  const searchTerm =
    resolvedSearchParams.q?.trim() ?? "";
  const businessQuery = `?business=${businessSlug}`;

  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", businessSlug)
    .single();

  const selectedBusiness =
    businessData as Business | null;

  let clients: Client[] = [];

  if (selectedBusiness?.id) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", {
        ascending: false,
      });

    clients = (data ?? []) as Client[];
  }

  const filteredClients = clients.filter((client) => {
    if (!searchTerm) {
      return true;
    }

    const searchableText = [
      client.name,
      client.contact_name,
      client.email,
      client.phone,
      client.billing_address,
      client.service_address,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Clients
            </h1>

            <p className="mt-2 text-zinc-400">
              Customer address book for{" "}
              {selectedBusiness?.name ??
                "selected business"}
              .
            </p>
          </div>

          <Link
            href={`/clients/new${businessQuery}`}
          >
            <Button>
              + New Client
            </Button>
          </Link>
        </div>

        <Card>
          <form
            action="/clients"
            className="grid gap-4 md:grid-cols-[1fr_auto]"
          >
            <input
              type="hidden"
              name="business"
              value={businessSlug}
            />

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Search Clients
              </label>

              <input
                name="q"
                defaultValue={searchTerm}
                placeholder="Search name, contact, email, phone, or address"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <Button>Search</Button>

              {searchTerm ? (
                <Link href={`/clients${businessQuery}`}>
                  <Button variant="secondary">
                    Clear
                  </Button>
                </Link>
              ) : null}
            </div>
          </form>
        </Card>

        {clients.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No clients yet.
            </p>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No clients match that search.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredClients.map((client) => (
              <Card
                key={client.id}
                className="transition hover:border-orange-500/60 hover:bg-zinc-800"
              >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">
                        {client.name}
                      </h2>

                      <p className="mt-2 text-zinc-400">
                        {client.contact_name ||
                          "No contact"}
                      </p>

                      <p className="mt-2 max-w-xl text-sm text-zinc-500">
                        {client.service_address ||
                          client.billing_address ||
                          "No address"}
                      </p>
                    </div>

                    <div className="text-right text-sm text-zinc-400">
                      <p>
                        {client.email ||
                          "No email"}
                      </p>

                      <p className="mt-2">
                        {client.phone ||
                          "No phone"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                    <Link
                      href={`/clients/${client.id}${businessQuery}`}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
                    >
                      Open
                    </Link>

                    <Link
                      href={`/clients/${client.id}/edit${businessQuery}`}
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      Edit
                    </Link>

                    <Link
                      href={`/estimates/new${businessQuery}&clientId=${client.id}`}
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      New Estimate
                    </Link>

                    <Link
                      href={`/invoices/new${businessQuery}&clientId=${client.id}`}
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
                    >
                      New Invoice
                    </Link>
                  </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
