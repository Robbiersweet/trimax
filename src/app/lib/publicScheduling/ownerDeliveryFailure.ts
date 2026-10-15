/** Projection only: callers must already authenticate owner/admin and select rows under tenant RLS.
 * Never fetch raw provider error/message bodies for this DTO. This module performs no queries. */
export type OwnerDeliveryFailure = { requestId: string; state: 'retry' | 'dead_letter'; message: string; attempts: number };
export function ownerDeliveryFailure(row: { request_id?: unknown; status?: unknown; attempts?: unknown; last_error_code?: unknown }): OwnerDeliveryFailure | null {
  if (typeof row.request_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.request_id) || !['retry','dead_letter'].includes(String(row.status)) || !Number.isSafeInteger(row.attempts) || Number(row.attempts)<0) return null;
  const message = row.last_error_code === 'RECONCILIATION_REQUIRED'
    ? 'Delivery outcome needs operator review. Do not resend until checked.'
    : row.status === 'retry' ? 'Notification delivery will be retried.' : 'Notification delivery needs operator attention.';
  return { requestId: row.request_id, state: row.status as 'retry'|'dead_letter', message, attempts: Number(row.attempts) };
}

export interface OwnerDeliveryReader {
 /** Resolve from authenticated server actor and current workspace membership, never form-supplied role. */
 currentRole(actorId:string,businessId:string):Promise<string|null>;
 failures(businessId:string):Promise<Array<{business_id:unknown;request_id?:unknown;status?:unknown;attempts?:unknown;last_error_code?:unknown}>>;
}
/** Disabled integration building block; no route, SQL or sender is instantiated. */
export async function readOwnerDeliveryFailures(reader:OwnerDeliveryReader,actorId:string,businessId:string):Promise<OwnerDeliveryFailure[]> {
 if(!actorId||!businessId||!['owner','admin'].includes((await reader.currentRole(actorId,businessId))??''))throw Error('OWNER_REQUIRED');
 const rows=await reader.failures(businessId);
 if(rows.length>500||rows.some(r=>r.business_id!==businessId))throw Error('DELIVERY_SCOPE_MISMATCH');
 // Recheck membership after the asynchronous query so revoked authorization fails closed.
 if(!['owner','admin'].includes((await reader.currentRole(actorId,businessId))??''))throw Error('OWNER_REQUIRED');
 return rows.map(ownerDeliveryFailure).filter((r):r is OwnerDeliveryFailure=>r!==null);
}
