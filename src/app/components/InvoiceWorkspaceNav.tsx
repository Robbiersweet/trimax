import Link from "next/link";

type InvoiceWorkspaceNavProps = {
  businessSlug: string;
  active: "invoices" | "batch-payment" | "batch-send";
};

export default function InvoiceWorkspaceNav({
  businessSlug,
  active,
}: InvoiceWorkspaceNavProps) {
  const links = [
    {
      key: "invoices",
      label: "Invoices",
      href: `/invoices?business=${businessSlug}`,
    },
    {
      key: "batch-payment",
      label: "Batch Payment",
      href: `/invoices/batch-payment?business=${businessSlug}`,
    },
    {
      key: "batch-send",
      label: "Batch Send",
      href: `/invoices/batch-send?business=${businessSlug}`,
    },
  ] as const;

  return (
    <nav
      aria-label="Invoice workspaces"
      className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-2 sm:grid-cols-3"
    >
      {links.map((link) => {
        const isActive = active === link.key;

        return (
          <Link
            key={link.key}
            href={link.href}
            className={`rounded-xl px-4 py-3 text-center text-sm font-black transition ${
              isActive
                ? "bg-orange-500 text-black"
                : "bg-black/25 text-zinc-200 hover:bg-white/10"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

