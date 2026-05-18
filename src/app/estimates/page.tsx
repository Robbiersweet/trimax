import Link from "next/link";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";

const estimates = [
  {
    id: "est-001",
    displayId: "#227",
    customer: "North Creek Apartments",
    project: "Unit 204 Turn",
    amount: "$2,450",
    status: "Pending",
  },
  {
    id: "est-002",
    displayId: "#228",
    customer: "Diana",
    project: "Cedar Fence Replacement",
    amount: "$22,000",
    status: "Approved",
  },
  {
    id: "est-003",
    displayId: "#229",
    customer: "Everett Plaza",
    project: "Exterior Touch-Up",
    amount: "$4,800",
    status: "Draft",
  },
];

export default function EstimatesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Trimax
            </p>

            <h1 className="mt-2 text-4xl font-bold">Estimates</h1>
          </div>

          <Link href="/estimates/new">
            <Button>+ New Estimate</Button>
          </Link>
        </div>

        <div className="grid gap-4">
          {estimates.map((estimate) => (
            <Link key={estimate.id} href={`/estimates/${estimate.id}`}>
              <Card className="transition hover:border-orange-500/60 hover:bg-zinc-800">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-orange-400">
                      {estimate.displayId}
                    </p>

                    <h2 className="mt-1 text-2xl font-semibold">
                      {estimate.project}
                    </h2>

                    <p className="mt-1 text-zinc-400">
                      {estimate.customer}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-orange-400">
                      {estimate.amount}
                    </p>

                    <p className="mt-1 text-sm text-zinc-400">
                      {estimate.status}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}