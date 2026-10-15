// Local policy only. No scheduler, transport, database adapter or production wiring.
export const pendingRemindersEnabled = false;
export type ReminderState = { businessId:string; requestId:string; revision:number; status:string; createdAt:number; acknowledgedRevision:number|null; snoozedUntil:number|null };
/** Trusted owner settings/state only; enqueue key must be unique in a durable outbox transaction. */
export function pendingReminder(s:ReminderState, intervalMinutes:number, now:number) {
 if(!Number.isSafeInteger(intervalMinutes)||intervalMinutes<15||intervalMinutes>10080||!Number.isSafeInteger(s.revision)||s.revision<0||![now,s.createdAt].every(Number.isFinite)||s.createdAt>now||!s.businessId||!s.requestId|| (s.snoozedUntil!==null&&!Number.isFinite(s.snoozedUntil))) throw Error('INVALID_REMINDER_STATE');
 if(s.status!=='pending_confirmation'||s.acknowledgedRevision===s.revision||(s.snoozedUntil!==null&&s.snoozedUntil>now))return null;
 const period=intervalMinutes*60000, bucket=Math.floor((now-s.createdAt)/period);
 if(bucket<1)return null;
 return {key:JSON.stringify([s.businessId,s.requestId,s.revision,bucket]),event:'pending_too_long' as const,businessId:s.businessId,requestId:s.requestId};
}
