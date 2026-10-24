import {createClient} from '@supabase/supabase-js';
import {loadSavedRemittancePayment} from '../../../lib/savedRemittancePaymentServer';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  const params = new URL(request.url).searchParams;
  const businessId = params.get('businessId') ?? '', attemptId = params.get('attemptId') ?? '';
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
  if (!authorization) return json({error: 'Sign in required.'}, 401);
  if (!uuid.test(businessId) || !uuid.test(attemptId)) return json({error: 'Invalid saved remittance.'}, 400);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {headers: {Authorization: authorization}, fetch: (input, init) => fetch(input, {...init, signal: AbortSignal.timeout(10000)})},
    auth: {persistSession: false, autoRefreshToken: false},
  });
  try {
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) return json({error: 'Sign in required.'}, 401);
    const access = await client.rpc('trimax_is_business_admin', {target_business_id: businessId});
    if (access.error || access.data !== true) return json({error: 'Owner/admin workspace access required.'}, 403);
    // Durable job ancestry is deliberately RPC/worker-only under authenticated
    // RLS. Read it on the server only AFTER verifying this user's workspace
    // admin access; the loader scopes every ancestry/audit read to businessId.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw Error('Saved history server configuration unavailable.');
    const historyClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      global: {fetch: (input, init) => fetch(input, {...init, signal: AbortSignal.timeout(10000)})},
      auth: {persistSession: false, autoRefreshToken: false},
    });
    return json(await loadSavedRemittancePayment(historyClient, businessId, attemptId));
  } catch {
    return json({error: 'Payment history could not be verified. Your saved scan is retained; reopen it to retry.'}, 503);
  }
}
