import Link from "next/link";
import { estimates } from "../../../data/estimates";

export default async function EstimatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estimate = estimates.find((estimate) => estimate.id === id);

  if (!estimate) {
    return (
      <main className="p-10 text-black">
        <p>Estimate not found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-start justify-between border-b pb-6">
          <div>
            <h1 className="text-3xl font-bold">R&L Creations LLC</h1>
            <p className="mt-2 text-sm">1011 90th St SW #B</p>
            <p className="text-sm">Everett, WA 98204</p>
            <p className="text-sm">robbie@rnlcreations.com</p>
            <p className="text-sm">(425) 350-4898</p>
          </div>

          <div className="text-right">
            <h2 className="text-4xl font-bold">ESTIMATE</h2>
            <p className="mt-2 text-lg">{estimate.displayId}</p>
          </div>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <p className="text-sm font-bold uppercase text-gray-500">
              Prepared For
            </p>
            <p className="mt-2 text-lg font-semibold">{estimate.customer}</p>
            <p className="text-sm">{estimate.address}</p>
          </div>

          <div className="text-right">
            <p className="text-sm font-bold uppercase text-gray-500">
              Project
            </p>
            <p className="mt-2 text-lg font-semibold">{estimate.project}</p>
            <p className="text-sm">Status: {estimate.status}</p>
          </div>
        </section>

        <section className="mb-8 rounded-xl border p-6">
          <p className="text-sm font-bold uppercase text-gray-500">
            Scope of Work
          </p>
          <p className="mt-3 leading-7">{estimate.description}</p>
        </section>

        <section className="mb-8">
          <div className="flex justify-between border-b py-3 font-bold">
            <span>Description</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between border-b py-4">
            <span>{estimate.project}</span>
            <span>{estimate.amount}</span>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="w-64">
              <div className="flex justify-between py-2">
                <span>Subtotal</span>
                <span>{estimate.amount}</span>
              </div>

              <div className="flex justify-between border-t py-3 text-xl font-bold">
                <span>Total</span>
                <span>{estimate.amount}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 text-sm text-gray-600">
          <p>
            This estimate is provided for review and approval. Final pricing may
            vary if scope, materials, or site conditions change.
          </p>
        </section>

        <div className="mt-8 print:hidden">
          <Link
            href={`/estimates/${estimate.id}`}
            className="text-orange-600 underline"
          >
            ← Back to Estimate
          </Link>
        </div>
      </div>
    </main>
  );
}