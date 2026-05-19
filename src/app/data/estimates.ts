import { Estimate } from "../types/estimate";

export const estimates: Estimate[] = [
  {
    id: "est-001",
    displayId: "#227",
    customer: "North Creek Apartments",
    project: "Unit 204 Turn",
    address: "Everett WA",
    amount: "$2,450",
    status: "Pending",
    description:
      "Full apartment turn including paint, patch, carpet cleaning, and final touch-up.",
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
      "Remove existing fence and install new cedar privacy fence with gates.",
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