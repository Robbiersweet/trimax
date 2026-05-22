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
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<{ business?: string }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};

  const businessSlug =
    resolvedSearchParams.business ??
    "rnl-creations";

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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
            href={`/clients/new?business=${businessSlug}`}
          >
            <Button>
              + New Client
            </Button>
          </Link>
        </div>

        {clients.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No clients yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
              >
                <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">
                        {client.name}
                      </h2>

                      <p className="mt-2 text-zinc-400">
                        {client.contact_name ||
                          "No contact"}
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
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}