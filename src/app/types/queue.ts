export type QueueItem = {
  id: string;
  property: string;
  unit: string;
  status: string;
  linkedEstimateId: string | null;
  paintType: string;
  moveOutDate: string;
  readyDate: string;
  flooring: string;
  smokedIn: boolean;
  priority: string;
  notes: string;
};