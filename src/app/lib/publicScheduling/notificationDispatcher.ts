import type { OutboxIntent } from './outbox.ts';

// Local contract only. No SQL adapter, sender, route, timer or environment activation exists.
export const notificationDispatcherEnabled = false;
// Historic notification vocabulary is explicit: confirmation/reschedule/reminder have no
// proven scheduling source in current intake and remain blocked.
export const historicEventMapping = { request_received: 'request_received', request_confirmed: null, request_rescheduled: null, request_cancelled: 'cancelled', appointment_reminder: null, new_public_request: 'new_request', approval_pending: 'pending_too_long', upcoming_work: null, unhandled_request: 'pending_too_long' } as const;
export type Claim = { id: string; fence: string; expiresAt: number; attempts: number; intent: OutboxIntent };
export type Recipient = { id: string; businessId: string; role: string; active: boolean };
export type Outcome = { state: 'delivered' | 'retry' | 'dead_letter'; code: string; nextAttemptAt?: number };
export interface DispatchStore {
  /** Atomic bounded SKIP LOCKED equivalent; expired leases must retain per-recipient send journal. */
  claim(limit: number, now: number): Promise<Claim[]>;
  /** Must atomically recheck lease/fence, current membership or customer consent and event provenance.
   * delivered => persisted receipt; uncertain => previously started send; never blindly resend it. */
  prepare(claim: Claim, recipient: string, key: string, now: number): Promise<'send' | 'delivered' | 'uncertain' | 'denied'>;
  /** Fenced durable proof that provider definitively did not accept; clears send journal for safe retry. */
  notSent(claim: Claim, key: string, now: number): Promise<boolean>;
  receipt(claim: Claim, key: string, providerId: string, now: number): Promise<boolean>;
  /** CAS on fence + unexpired lease; stale completion cannot change newer work. */
  finish(claim: Claim, outcome: Outcome, now: number): Promise<boolean>;
  currentMembers(businessId: string): Promise<Recipient[]>;
  customer(claim: Claim): Promise<{ recipient: string; consentReference: string } | null>;
  /** Trusted committed activity, current request state and reminder interval validation. */
  validEvent(claim: Claim): Promise<boolean>;
}
export interface LocalNotificationSink {
  send(message: { key: string; recipient: string; channel: OutboxIntent['channel']; text: string }): Promise<
    { kind: 'accepted'; providerId: string } | { kind: 'not_sent'; transient: boolean } | { kind: 'uncertain' }>;
}
const customerText = {
  request_received: 'Your request was received. Your appointment is not confirmed. The business will follow up.',
  approved: 'Your request was reviewed. Your appointment is not confirmed. Contact the business for scheduling.',
  needs_information: 'More information is needed for your request. Please contact the business.',
  rejected: 'We cannot take on your request. No appointment has been confirmed. Please contact the business with questions.',
  cancelled: 'Your request was cancelled. Contact the business with any questions.',
};
const internalText = {
  new_request: 'A new public request needs review.',
  pending_too_long: 'A public request is still pending review.',
  upcoming_request: 'A public request needs follow-up.',
};
/** Explicitly synthetic runner: production callers cannot enable the exported disabled dispatcher. */
export async function runSyntheticDispatch(input: { mode: 'synthetic'; store: DispatchStore; sink: LocalNotificationSink; now: () => number; limit?: number }) {
  if (input.mode !== 'synthetic') throw Error('DISPATCH_DISABLED');
  const { store, sink, now } = input;
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('INVALID_BATCH');
  const claims = await store.claim(limit, now());
  if (claims.length > limit || new Set(claims.map(c => c.id)).size !== claims.length) throw Error('INVALID_CLAIMS');
  const results: boolean[] = [];
  for (const claim of claims) {
    if (!claim.fence || !Number.isFinite(claim.expiresAt) || claim.expiresAt <= now() || !Number.isInteger(claim.attempts) || claim.attempts < 0) throw Error('INVALID_LEASE');
    const intent = claim.intent;
    const templates = intent.audience === 'customer' ? customerText : intent.audience === 'internal' ? internalText : {};
    const text = Object.prototype.hasOwnProperty.call(templates, intent.event) ? (templates as Record<string, string>)[intent.event] : undefined;
    let outcome: Outcome = { state: 'dead_letter', code: 'POLICY_DENIED' };
    if (text && intent.businessId && intent.requestId && intent.idempotencyKey.length >= 16 && Number.isFinite(Date.parse(intent.scheduledFor)) && Date.parse(intent.scheduledFor) <= now() && await store.validEvent(claim)) {
      // Only email customer delivery is in scope; phone-only/SMS remains manual follow-up.
      const customer = intent.audience === 'customer' && intent.channel === 'email' ? await store.customer(claim) : null;
      const recipients = intent.audience === 'internal' && intent.recipient === 'workspace-owners' && intent.channel === 'in-app'
        ? (await store.currentMembers(intent.businessId)).filter(m => m.businessId === intent.businessId && m.active && ['owner', 'admin'].includes(m.role)).map(m => m.id)
        : customer?.consentReference && customer.recipient ? [customer.recipient] : [];
      if (recipients.length) {
        outcome = { state: 'delivered', code: 'DELIVERED' };
        for (const recipient of new Set(recipients)) {
          const key = JSON.stringify([intent.businessId, intent.idempotencyKey, recipient]);
          const prepared = await store.prepare(claim, recipient, key, now());
          if (prepared === 'delivered') continue;
          if (prepared !== 'send') { outcome = { state: 'dead_letter', code: prepared === 'uncertain' ? 'RECONCILIATION_REQUIRED' : 'POLICY_DENIED' }; break; }
          let result: Awaited<ReturnType<LocalNotificationSink['send']>>;
          try { result = await sink.send({ key, recipient, channel: intent.channel, text }); }
          catch { result = { kind: 'uncertain' }; }
          if (result.kind === 'accepted') {
            if (!result.providerId || !await store.receipt(claim, key, result.providerId, now())) throw Error('RECEIPT_NOT_PERSISTED');
          } else {
            // Retry only after durable proof of no send; thrown/unknown results require reconciliation.
            if (result.kind === 'not_sent' && await store.notSent(claim, key, now())) {
              outcome = result.transient ? safeRetry(claim.attempts, now()) : { state: 'dead_letter', code: 'PERMANENT_FAILURE' };
            } else outcome = { state: 'dead_letter', code: 'RECONCILIATION_REQUIRED' };
            break;
          }
        }
      }
    }
    results.push(await store.finish(claim, outcome, now()));
  }
  return results;
}
export function safeRetry(attempts: number, now: number): Outcome {
  if (!Number.isInteger(attempts) || attempts < 0) throw Error('INVALID_ATTEMPTS');
  return attempts >= 4 ? { state: 'dead_letter', code: 'RETRY_EXHAUSTED' } : { state: 'retry', code: 'NOT_SENT', nextAttemptAt: now + Math.min(3600, 30 * 2 ** attempts) * 1000 };
}



