# Scheduling provider diagnostic correction

## Verified evidence
Failed request qcx4l-1792145220164-6bfd288b020c returned503 at2026-10-16T10:07:00.164Z. Original deployment44jQyAHCqMYmFeYorg6gWzedzSoE had no application logs for the request. Supabase pooler authenticated the restricted role; catalog checks passed; cumulative query statistics contain config calls but no submit call. All request rows count0 after containment. These facts do not identify the exact provider exception.

Authenticated Upstash inspection: RLSchedulingRateLimit, database05d9db52-69a0-454f-a330-44c7e4d6b6e1, endpointfond-spider-223656.upstash.io, Free Tier/Oregon. Vercel Production URL matches exactly; token is Secret/Production, not revealed or changed. ACL default ON, ~*, +@all. Usage before diagnostics showed zero commands/connections and no quota exhaustion. Dashboard PING returned PONG. ACL LOG10 and INFO errorstats produced no visible entries, not proof that the Vercel credential authenticates. Dashboard credentials are not the Vercel secret. No secret comparison, rotation, or live limiter write was performed.

Exact original cause remains UNVERIFIED. Rate-provider rejection or an abuse prerequisite remains plausible; no evidence supports resetting PostgreSQL credentials or changing ACLs. Cloudflare's aggregate zero Siteverify requests supports investigating the earlier boundary but is not a per-request trace.

## Corrected verified defect
The application previously discarded every abuse-provider exception. The candidate retains fail-closed response behavior, rate limits, provider order, RPC scope, connection budget and customer UI. It adds fixed server error codes and optional numeric HTTP status only. No error messages, bodies, URLs, headers, credentials, customer data or fingerprints are logged. Platform log envelopes provide correlation. No diagnostic public endpoint is introduced. Successful requests produce no diagnostic event.

Changed files: src/app/lib/publicScheduling/{diagnostics,providers,abuseProtection}.ts; scripts/public-scheduling-provider-diagnostics-regression.ts; sites/rnl/scripts/prepare-shared.mjs; package.json.

## Validation
PASS: new synthetic HTTP401/403/network/malformed-response/challenge/guard diagnostics and leakage assertions; logging failure remains fail-closed. PASS all public scheduling suite components, targeted changed-source lint, website lint/TypeScript/build, website78checks, credential boundaries and actual disabled route/transport tests. Initial fresh worktree lacked dependencies; reused installed matching dependencies and reran affected failed test. Initial build omitted new shared module; packaging list corrected and build passed. No hosted acceptance claimed.

## Exact approval scope prepared
Approve disabled deployment of the manifest-pinned candidate only to rnl-public-website, root sites/rnl. Keep existing secrets/configuration unchanged, production flag disabled and database intake false. Before deployment verify candidate cleanliness/source tree, current disabled rollback deployment, production isolation and required protected health gates. Abort on drift. Verify disabled website afterward. Do not deploy root/internal Trimax or change workers/contracts.

A distinct new maximum15-minute Stage B approval is required for exactly one synthetic submission with real challenge/rate-limit/restricted persistence, no notifications/conversions, and immediate containment afterward. Do not retry on ambiguity. Read new sanitized logs to identify failure before any credential/config repair. Disabled deployment alone cannot exercise providers because the activation guard correctly blocks them. Stage C remains blocked. This is a diagnostic correction, not a proven submission repair.

Rollback: preserve current disabled deployment6FDMG6VUsqDnj736WqZcJ6kvrNmJ/source1dd6f982dc5e4fe934395b4dd8e87488b3ba0758; restore it only under approved deployment scope, keeping both intake gates disabled. No DB rollback is needed because no database change is proposed.
