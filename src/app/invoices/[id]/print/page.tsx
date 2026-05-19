import Link from "next/link";
import { invoices } from "../../../data/invoices";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const invoice = invoices.find((invoice) => invoice.id === id);

  if (!invoice) {
    return (
      <main className="p-10 text-black">
        <p>Invoice not found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-start justify-between border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold">
              R&L Creations LLC
            </h1>

            <p className="mt-2 text-sm">
              1011 90th St SW #B
            </p>

            <p className="text-sm">
              Everett, WA 98204
            </p>

            <p className="text-sm">
              robbie@rnlcreations.com
            </p>

            <p className="text-sm">
              (425) 350-4898
            </p>
          </div>

          <div className="text-right">
            <h2 className="text-4xl font-bold">
              INVOICE
            </h2>

            <p className="mt-2 text-lg">
              {invoice.displayId}
            </p>
          </div>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm font-bold uppercase text-gray-500">
              Bill To
            </p>

            <p className="mt-2 text-lg font-semibold">
              {invoice.customer}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm font-bold uppercase text-gray-500">
              Project
            </p>

            <p className="mt-2 text-lg font-semibold">
              {invoice.project}
            </p>

            <p className="text-sm">
              Status: {invoice.status}
            </p>

            <p className="mt-2 text-sm">
              Due: {invoice.dueDate}
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-xl border p-6">
          <p className="text-sm font-bold uppercase text-gray-500">
            Invoice Description
          </p>

          <p className="mt-3 leading-7">
            {invoice.description}
          </p>
        </section>

        <section className="mb-8">
          <div className="flex justify-between border-b py-3 font-bold">
            <span>Description</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between border-b py-4">
            <span>{invoice.project}</span>
            <span>{invoice.amount}</span>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="w-64">
              <div className="flex justify-between py-2">
                <span>Subtotal</span>
                <span>{invoice.amount}</span>
              </div>

              <div className="flex justify-between border-t py-3 text-xl font-bold">
                <span>Total</span>
                <span>{invoice.amount}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 text-sm text-gray-600">
          <p>
            Thank you for your business. Payment terms and
            project scope are subject to agreement and
            approval.
          </p>
        </section>

        <div className="mt-8 print:hidden">
          <Link
            href={`/invoices/${invoice.id}`}
            className="text-orange-600 underline"
          >
            ← Back to Invoice
          </Link>
        </div>
      </div>
    </main>
  );
}