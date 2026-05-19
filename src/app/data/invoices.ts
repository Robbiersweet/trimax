import { Invoice } from "../types/invoice";

export const invoices: Invoice[] = [
  {
    id: "inv-001",
    displayId: "#301",
    customer: "Diana",
    project: "Cedar Fence Replacement",
    amount: "$11,000",
    status: "Deposit Requested",
    linkedEstimateId: "est-002",
    dueDate: "Due Upon Receipt",
    description:
      "50% deposit request for approved cedar fence replacement project.",
  },
  {
    id: "inv-002",
    displayId: "#302",
    customer: "North Creek Apartments",
    project: "Unit 204 Turn",
    amount: "$2,450",
    status: "Draft",
    linkedEstimateId: "est-001",
    dueDate: "Net 30",
    description:
      "Draft invoice for apartment turn work connected to approved estimate.",
  },
];