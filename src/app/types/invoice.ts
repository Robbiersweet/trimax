export type Invoice = {
  id: string;
  displayId: string;
  customer: string;
  project: string;
  amount: string;
  status: string;
  linkedEstimateId: string | null;
  dueDate: string;
  description: string;
};