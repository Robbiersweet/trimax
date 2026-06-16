"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Button from "./Button";

type ClientSearchItem = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
};

function scoreClient(client: ClientSearchItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const name = client.name.toLowerCase();
  const contact = (client.contact_name ?? "").toLowerCase();
  const email = (client.email ?? "").toLowerCase();
  const phone = (client.phone ?? "").toLowerCase();
  const address = `${client.billing_address ?? ""} ${
    client.service_address ?? ""
  }`.toLowerCase();

  if (name.startsWith(normalizedQuery)) {
    return 100;
  }

  if (contact.startsWith(normalizedQuery)) {
    return 90;
  }

  if (email.startsWith(normalizedQuery)) {
    return 80;
  }

  if (name.includes(normalizedQuery)) {
    return 70;
  }

  if (contact.includes(normalizedQuery)) {
    return 60;
  }

  if (email.includes(normalizedQuery)) {
    return 50;
  }

  if (phone.includes(normalizedQuery) || address.includes(normalizedQuery)) {
    return 40;
  }

  return 0;
}

export default function ClientSmartSearch({
  clients,
  businessSlug,
  initialSearchTerm,
}: {
  clients: ClientSearchItem[];
  businessSlug: string;
  initialSearchTerm: string;
}) {
  const [query, setQuery] = useState(initialSearchTerm);
  const businessQuery = `?business=${businessSlug}`;

  const suggestions = useMemo(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return [];
    }

    return clients
      .map((client) => ({
        client,
        score: scoreClient(client, trimmedQuery),
      }))
      .filter((item) => item.score > 0)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return first.client.name.localeCompare(second.client.name);
      })
      .slice(0, 6);
  }, [clients, query]);

  return (
    <form action="/clients" className="grid gap-4 md:grid-cols-[1fr_auto]">
      <input type="hidden" name="business" value={businessSlug} />

      <div className="relative">
        <label className="app-form-label mb-2 block text-sm text-zinc-400">
          Search Clients
        </label>

        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          placeholder="Type a few letters to find a client"
          className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
        />

        {suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/40">
            {suggestions.map(({ client }) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}${businessQuery}`}
                className="block border-b border-zinc-800 px-4 py-3 transition last:border-b-0 hover:bg-zinc-900"
              >
                <span className="block font-semibold text-white">
                  {client.name}
                </span>
                <span className="mt-1 block truncate text-sm text-zinc-400">
                  {[client.contact_name, client.email, client.phone]
                    .filter(Boolean)
                    .join(" · ") || "Open client profile"}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-end gap-3">
        <Button type="submit">Search</Button>

        {query.trim() ? (
          <Link href={`/clients${businessQuery}`}>
            <Button variant="secondary">Clear</Button>
          </Link>
        ) : null}
      </div>
    </form>
  );
}
