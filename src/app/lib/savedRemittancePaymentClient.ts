import {supabase} from './supabase';
import {remittanceDeadline} from './remittanceDeadline';
import type {SavedRemittancePaymentResult} from './savedRemittancePayment';
export type SavedRemittanceLookup = SavedRemittancePaymentResult & {attemptId: string; canonicalReference: string; sourceImageHash: string | null};
export async function savedRemittancePayment(businessId: string, attemptId: string): Promise<SavedRemittanceLookup> {
  const {data} = await remittanceDeadline(Promise.resolve(supabase.auth.getSession()), 12000, 'Payment history connection timed out. Reopen the saved scan to retry.');
  if (!data.session) throw Error('Sign in to view your saved remittance.');
  const response = await fetch('/api/payments/saved-remittance?' + new URLSearchParams({businessId, attemptId}), {
    headers: {Authorization: 'Bearer ' + data.session.access_token}, cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error ?? 'Payment history could not be verified.');
  return body;
}
