export type EstimateStatus = "Draft" | "Pending" | "Sent" | "Approved" | "Declined";

export type Estimate = {
  id: string;
  displayId: string;
  customer: string;
  project: string;
  address: string;
  amount: string;
  status: EstimateStatus;
  description: string;
};

export type InvoiceStatus = "Draft" | "Sent" | "Partial" | "Paid" | "Overdue";

export type Invoice = {
  id: string;
  displayId: string;
  customer: string;
  project: string;
  amount: string;
  status: InvoiceStatus;
  balanceDue: string;
};

export type QueueStatus =
  | "Submitted"
  | "Awaiting Maintenance"
  | "Ready For Paint"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Invoiced";

export type QueueItem = {
  id: string;
  customer: string;
  property: string;
  unit: string;
  status: QueueStatus;
  moveOutDate?: string;
  readyDate?: string;
  paintScope?: "Classic" | "Reno" | "Touch Up" | "Primer";
  smokerUnit?: boolean;
  carpet?: "Keep" | "Replace" | "Unknown";
  vinyl?: "Keep" | "Replace" | "Unknown";
  notes?: string;
};