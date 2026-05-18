import AppShell from "../../components/AppShell";
import Card from "../../components/Card";
import Button from "../../components/Button";

const estimates = [
  {
    id: "est-001",
    displayId: "#227",
    customer: "North Creek Apartments",
    project: "Unit 204 Turn",
    address: "204 Main St, Everett WA",
    amount: "$2,450",
    status: "Pending",
    description:
      "Full apartment turn including paint, carpet cleaning, touch-up repairs, and final cleaning.",
  },
  {
    id: "est-002",
    displayId: "#228",
    customer: "Diana",
    project: "Cedar Fence Replacement",
    address: "Lake Stevens WA",
    amount: "$22,000",
    status: "Approved",
    description:
      "Remove damaged fencing and install new cedar fence with gates and post replacement.",
  },
  {
    id: "est-003",
    displayId: "#229",
    customer: "Everett Plaza",
    project: "Exterior Touch-Up",
    address: "Everett WA",
    amount: "$4,800",
    status: "Draft",
    description:
      "Exterior paint touch-up and pressure washing around entry areas.",
  },
];

export default async function EstimateDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const estimate = estimates.find((e) => e.id === id);

  if (!estimate) {
    return (
      <AppShell>
        <p className="text-red-400">Estimate not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Estimate Details
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {estimate.project}
          </h1>

          <p className="mt-2 text-zinc-400">
            {estimate.displayId}
          </p>
        </div>

        <Card>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm text-zinc-500">Customer</p>

              <p className="mt-1 text-lg font-medium">
                {estimate.customer}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">Status</p>

              <p className="mt-1 text-lg font-medium">
                {estimate.status}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">Project Address</p>

              <p className="mt-1 text-lg font-medium">
                {estimate.address}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-500">Estimate Amount</p>

              <p className="mt-1 text-lg font-medium text-orange-400">
                {estimate.amount}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-zinc-500">Scope of Work</p>

          <p className="mt-3 leading-7 text-zinc-300">
            {estimate.description}
          </p>
        </Card>

        <div className="flex gap-4">
          <Button>Edit Estimate</Button>

          <Button className="bg-zinc-800 text-white hover:bg-zinc-700">
            Convert to Invoice
          </Button>
        </div>
      </div>
    </AppShell>
  );
}