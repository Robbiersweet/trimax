# rc11 scheduling grant contract reseal

Authorized scope: metadata only; no SQL mutations, new grants, credential changes or executable modifications.

Original deployment: ErVFWpcRupsr8irfJhFoanUavxzW / 996bff1d7710ddbf4e8535c521b429e3a6209ae1. Original checkout is untouched and clean. Candidate branch codex/rc11-scheduling-contract-reseal.

The executable releaseId and component identities remain rc11 because every executable byte is identical. contractRevision identifies the metadata revision; full manifest digest distinguishes it. PREDEPLOYMENT independently verifies the original serving manifest; POSTDEPLOYMENT requires the new complete manifest in the serving web deployment. No weakening of comparisons or stale evidence substitution.

Only database.fingerprints.rpc changes, from 5424c9497b7b2d9ecd305091edd9cf8cccc97f4d9bf3a055879d2d92ccd1fc24 to 42e270d84cf1d1b8edf4ddafb5b9f595ac2bcbee6f8f6fdb76d638df8b185c32. Existing historical rc11-production-rpc-inputs.json is retained for migration replay; current inputs are separately recorded in rc11-scheduling-grants-rpc-inputs.json.

Local schema-only replay rebuilt the exact baseline, applied historical reviewed migrations, then applied only the two scheduling_web EXECUTE grants. It reproduced the live aggregate hash and all 41 current inputs exactly. No hosted mutation occurred. Local scheduling SQL/RLS and idempotency/outbox/capability tests passed with the existing pinned PGlite runtime. Initial gate failures are retained: historical evidence was incorrectly replaced (corrected by keeping separate evidence) and missing optional test-module path (corrected in local environment).

Rollback: stop only candidate worker processes if unsafe; keep intake disabled. Prior web deployment can restore application serving behavior, but its old database contract cannot pass against the legitimate current grants. Do not revoke grants or fabricate a healthy rollback. Keep prior checkout/logs; database has no changes to roll back. Any unanticipated database delta stops rollout.

Pending: complete exact predeployment gate, produce valid build receipt, coordinated internal metadata deployment and worker cutover, then real postdeployment/worker evidence. No success inferred from startup or old persisted provenance. Stage B remains disabled until gates pass. Physical iPhone acceptance remains pending.
