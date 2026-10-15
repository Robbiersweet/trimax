// Offline fixtures only. This validates configuration policy, NOT JWT signatures.
import assert from 'node:assert/strict';
import {productionConfig} from '../../../src/app/lib/publicScheduling/productionRuntime.ts';

const now = Math.floor(Date.now() / 1000);
const claims = {role:'trimax_scheduling_intake',ref:'fixture',exp:now+3600};
const fixture = value => `fixture.${Buffer.from(JSON.stringify(value)).toString('base64url')}.not-a-signature`;
const env = {
  VERCEL:'1', VERCEL_ENV:'production', PUBLIC_SCHEDULING_PRODUCTION_ENABLED:'enabled',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY:'fixture-site', TURNSTILE_SECRET_KEY:'fixture-secret',
  UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN:'fixture-token',
  SCHEDULING_FINGERPRINT_SECRET:'fixture-only-secret-'.repeat(3),
  PUBLIC_SCHEDULING_ORIGIN:'https://fixture.example.test',
  NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture',
  SCHEDULING_INTAKE_JWT:fixture(claims),
};
assert.ok(productionConfig(env));
for (const patch of [
  {exp:now-1}, {exp:now}, {exp:now+30}, {exp:null}, {exp:'tomorrow'},
  {role:'service_role'}, {role:'authenticated'}, {role:'anon'}, {ref:'other-project'},
]) assert.throws(() => productionConfig({...env,SCHEDULING_INTAKE_JWT:fixture({...claims,...patch})}));
for (const value of [undefined,'','true','1','ENABLED']) {
  assert.throws(() => productionConfig({...env,PUBLIC_SCHEDULING_PRODUCTION_ENABLED:value}));
}
for (const key of ['SCHEDULING_INTAKE_JWT','SCHEDULING_FINGERPRINT_SECRET','TURNSTILE_SECRET_KEY','UPSTASH_REDIS_REST_TOKEN']) {
  assert.throws(() => productionConfig({...env,[key]:''}));
}
console.log('PASS credential expiry/role/project/activation configuration boundaries; signature verification remains Supabase-owned');
