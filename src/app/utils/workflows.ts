import { queueItems } from "../data/queue";
import { estimates } from "../data/estimates";

export function getQueueItemById(id: string) {
  return queueItems.find((item) => item.id === id);
}

export function getEstimateById(id: string) {
  return estimates.find((estimate) => estimate.id === id);
}

export function getEstimateForQueueItem(queueId: string) {
  const queueItem = getQueueItemById(queueId);

  if (!queueItem?.linkedEstimateId) {
    return null;
  }

  return getEstimateById(queueItem.linkedEstimateId);
}

export function buildEstimateFromQueueItem(queueId: string) {
  const queueItem = getQueueItemById(queueId);

  if (!queueItem) {
    return null;
  }

  return {
    customer: queueItem.property,
    project: `${queueItem.property} - Unit ${queueItem.unit} ${queueItem.paintType}`,
    address: `Unit ${queueItem.unit}`,
    description: `${queueItem.notes}

Flooring: ${queueItem.flooring}
Move Out: ${queueItem.moveOutDate}
Paint Due Date: ${queueItem.readyDate}
Smoker Unit: ${queueItem.smokedIn ? "Yes" : "No"}`,
  };
}
