import {enforceProductionAbuse,type AbuseProviders} from './abuseProtection.ts';
import type {createSchedulingPersistence} from './productionAdapter.ts';
type Persistence=ReturnType<typeof createSchedulingPersistence>;
/** The production entry boundary: no persistence happens before both shared rate
 * limiting and challenge verification succeed. No default providers or credentials. */
export async function submitProductionRequest(input:{slug:string;input:unknown;idempotencyKey:string;capabilityHash:string;challengeToken:string;trustedClientIdentity:string},dependencies:{persistence:Persistence;abuseProviders?:AbuseProviders}){
 const checked=await enforceProductionAbuse({businessSlug:input.slug,challengeToken:input.challengeToken,trustedClientIdentity:input.trustedClientIdentity},dependencies.abuseProviders);
 if(!checked.allowed)throw new Error('Production submission blocked: '+checked.reason);
 return dependencies.persistence.submit({slug:input.slug,input:input.input,idempotencyKey:input.idempotencyKey,capabilityHash:input.capabilityHash});
}
