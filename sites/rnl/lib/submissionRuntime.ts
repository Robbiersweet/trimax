import {smsConsentCollectionEnabled,withSmsConsentBoundary} from './smsConsentBoundary.ts';
import 'server-only';
import {legacySubmissionRuntime,type SubmissionRuntime} from '../.shared/lib/publicScheduling/productionHandler.ts';
import {createDisabledDirectRuntime} from './credentialLifecycle/directRuntimeCandidate.ts';

// One process-local pool, initialized only after the direct runtime's source and
// environment gates pass. Never retry a failed direct selection through JWT.
let direct: ReturnType<typeof createDisabledDirectRuntime> | undefined;
export function websiteSubmissionRuntime(): SubmissionRuntime {
  const transport=process.env.SCHEDULING_TRANSPORT;
  if(transport===undefined||transport==='static-jwt')return withSmsConsentBoundary(legacySubmissionRuntime(),smsConsentCollectionEnabled());
  if(transport!=='direct-postgres')throw Error('UNKNOWN_SCHEDULING_TRANSPORT');
  direct ??= createDisabledDirectRuntime();
  return withSmsConsentBoundary(direct,smsConsentCollectionEnabled());
}
