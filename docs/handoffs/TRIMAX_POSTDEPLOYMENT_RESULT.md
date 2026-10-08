# Trimax controlled rollout — stopped at live database attestation

Date: 2026-10-08. **ROLLOUT STOPPED. NOT DEPLOYED. NOT READY FOR PHYSICAL ACCEPTANCE.**

## Exact failed stage

Stage 2, live database attestation, failed at `2026-10-08T17:17:58.758Z`. Per the deployment instruction, no repair, push, web deployment, worker replacement, synthetic job, or subsequent full postdeployment gate was attempted.

The reviewed read-only RPC installation returned `Success. No rows returned` in the authenticated Supabase SQL editor. The immediately following candidate command was:

```powershell
node scripts/release/runtime-check.cjs "$env:LOCALAPPDATA\Trimax\controlled-rollout-20261008\runtime-after-rpc.json"
```

It exited 1:

| Engine | Database attestation | Exact error |
|---|---|---|
| legacy | FAIL | `fetch failed` |
| v2-shadow | FAIL | `Database schema fingerprint mismatch; Database rpc fingerprint mismatch; Database triggers fingerprint mismatch; Database policies fingerprint mismatch; Database grants fingerprint mismatch` |

Aggregate database and runtime statuses are **FAIL**. This report does not infer a network root cause from `fetch failed`, nor a specific schema mutation from the aggregate fingerprint mismatch. The current checker retained classifications, not the raw RPC response. Before installation, a direct read-only catalog query using the manifest algorithm matched every expected hash. The discrepancy between that direct query and RPC attestation remains **UNRESOLVED**. No manifest hashes, classification rules, or SQL were repaired after failure.

## Sealed candidate

| Item | Value |
|---|---|
| Release | `trimax-release-contract-20261007-rc4` |
| Prior reviewed application revision | `c770a4e1c1033c151e55602ffb84b28c05bf9c63` |
| Common executable machinery revision | `bf02a2a6748347e6c4c4c2fef6f5daa784cd69ea` |
| Manifest seal | `d709223693c29f93f84470201f60a765d732cf08` |
| Candidate HEAD | `4da6e39fbbe3c2ad0c3207da92ecb039bbe8a337` |
| Source bundle | `f35636f5e78bd5ba1f9efb8adc1df910400ba0bf7e8f319c728e0a8b3a1c5ed4` |
| Worktree | `C:/Users/robbi/.codex/worktrees/trimax-release-candidate/trimax` |

`localFailures(manifest)` returned an empty list. `validateLocalRuntime` passed for both engines before the RPC installation, including clean source, models, configuration and runtime checks. These are local checks, not deployed worker attestations. The worktree was clean through the failed attestation; this uncommitted handoff document was created afterward. No executable source changed.

## Production baseline, freshly observed

- Web commit: `b5d0d51ab35a915292e54355d5c582a22876be11`.
- Remote `main`: same SHA, verified with `git ls-remote origin refs/heads/main`.
- Vercel deployment: `A6ZKcvjyxFE8483eBofsK9srxhHq`, **Ready**, created September 30; dashboard production source links to that exact SHA.
- Production URL: https://app.rnlcreations.com/ . HTTP **200** after stopping the rollout.
- Supabase project: `gqknefosisnsjuzmhvts`.
- Business: `f31adfa1-26ad-4e74-ad94-a4668d7ad57d`.
- Legacy queue: 0 queued, 0 running, 5 review, 2 failed.
- V2 queue: 0 queued, 0 running, 37 completed, 1 failed.
- Windows process inventory found no Node process running `ocr-legacy-worker.cjs` or `ocr-v2/shadow-worker.cjs`. Consequently there was no old worker PID/command line to stop. This is a scoped local process observation, not proof concerning another computer.
- Shadow enabled: true. Native still flag: true. Legacy enabled: true. Flags match the manifest.
- Trimax browser navigated to `/login`; authenticated owner/admin verification was not completed. A sign-in request was issued before the attestation failure. Sign-in does not authorize continuing this stopped rollout.

### Live direct-query database fingerprint snapshot

| Kind | Entries | SHA-256 | Match sealed manifest |
|---|---:|---|---|
| schema | 699 | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | yes |
| rpc | 37 | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | yes |
| triggers | 8 | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | yes |
| policies | 74 | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | yes |
| grants | 917 | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | yes |

These are pre-installation direct-query results, not a passing post-installation worker RPC attestation.

## Only production mutation

Installed `supabase/sql/2026-10-01-release-attestation.sql`: `public.trimax_release_runtime(uuid,text,text)` and its reviewed execute grants to `anon,authenticated`, with PUBLIC revoked. It is STABLE, SECURITY DEFINER, and read-only. It requires owner/admin authentication for diagnostics or the existing business-scoped restricted worker key for the engine. It creates no table, queue, payment or business-write grant.

No flags or credentials changed. No application data was intentionally written. No apply-payment endpoint was called. No worker was started, stopped or replaced. No code, model, capture, auth, recognition or payment behavior was edited. The installed RPC was left in place; no speculative rollback/removal was performed. The previous web deployment and worker state already remain in place.

### Authorization verification limits

- Existing restricted credential files remained unchanged in `%LOCALAPPDATA%/Trimax/ocr-legacy-worker/worker.json` and `ocr-shadow-worker/worker.json`.
- Local validation verified anonymous/publishable API credentials rather than a service-role key, the pinned project/business and configuration hashes.
- Matching pre-install RPC/policy/grant fingerprints preserve the previously reviewed scope baseline; candidate installation adds no payment-write function or table permission.
- Owner/admin successful attestation, invalid/unrelated caller rejection, and full legacy credential success are **NOT VERIFIED in this rollout**, because the live stage failed and execution stopped.
- No new payment-write capability was granted. Successful live worker startup attestation is not claimed.

## Business/payment safety comparison

The same read-only aggregate query ran before installation and after the failed attestation. It hashes all rows in each listed table using sorted `to_jsonb(row)::text`, newline separation, UTF-8 SHA-256. **All 18 row counts and hashes matched.** This proves equality at the two observed snapshots, not absence of any possible intervening external activity.

| Table | Rows | Before = after SHA-256 |
|---|---:|---|
| business_settings | 1 | `35d8310ab9da7e482bdcc072dc148df32083b031f526f69943d6bed9ef2cb673` |
| client_service_overrides | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| clients | 47 | `ef34ceaf6f588e2033711da4bf6d94ace7dfe23cf54c6ddd1728af9bd647c229` |
| estimate_line_items | 40 | `385f271966d8d96b45bcb278fc4b74697c8e26979ffa9ef5549172827fdaa6d3` |
| estimates | 42 | `add649ac1c311665afacd5734a7e144bf7a4dc709ce4fb935a06afccbbae7b59` |
| import_batches | 5 | `8acd675ad9b9211b7d9301847d5076ff40c04d4fc96a73ff67f0de7567d5ddc7` |
| import_rows | 343 | `55fa9c7cc3821312a412598d0ea95a51a12746cb7a0d5f38e70eeeb9c10fea1a` |
| invoice_line_items | 367 | `024261a75b449c33aedaadc9a39e160ebd858f861b018238ff9a8aeef2d1514f` |
| invoices | 285 | `a30db29d4739c3fff914e4691cd2740868ac4ce8c53873551a7b1ae79d567ddf` |
| job_session_breakdowns | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| job_sessions | 5 | `b60e8bff949b78bb3eff246e455644b12032ce9398cf9506ad9783fb60336d18` |
| payment_attachments | 11 | `2d1d85aa2cf28d220335b412df94e5f200ca41abeaa011deed61d6d0f1e7848b` |
| properties | 1 | `512bb6679ae698cb5541b82e63078d9098f8ae64f75aa1acf3118d2e1d8a5790` |
| property_units | 264 | `9f8c3a07f72195fe3ad78f53b57127920eee1dcb66e2ac6c5613d086d271e920` |
| queue_items | 34 | `671511fd228951cee3ad30c271ef058378e730cd499c496aba34ae270a765ffd` |
| recurring_invoice_templates | 4 | `c8023fda7b2ee51b48b002c26abe3a358679fa575aa3df3e89acfa420786ca51` |
| service_items | 31 | `fd1fff7b7314d1ba1662dd831a9fe5a5cd743e0dbf8ffa8ff04ff3fee3ef0a34` |
| unit_history | 34 | `95a7bdb6f35421ed749d263b2c81722a8c9506d69d58f920aafdf6ccbc54f040` |

## Deployment stage disposition

| Stage | Outcome |
|---|---|
| Clean sealed candidate/source check | PASS |
| Local legacy/v2 runtime validation | PASS / PASS |
| Zero active queues | PASS |
| Read-only RPC installation | SQL editor reported success |
| Live DB attestation | **FAIL** |
| Owner/admin + negative access matrix | Incomplete; stopped |
| Push / Vercel candidate deployment | NOT ATTEMPTED |
| Legacy deployed worker attestation | NOT PASSED; probe failed |
| V2 deployed worker attestation | NOT PASSED; probe failed |
| Unified release | NO |
| Synthetic worker jobs / idle health | NOT ATTEMPTED |
| Full postdeployment gate | NOT RUN; blocked by failed live attestation |
| Payment/business checksums | Unchanged across all 18 tables |
| Physical acceptance | PENDING |

The existing production web and sealed candidate have different revisions; there is no verified unified deployed runtime. The failing attestation must not be relabeled as a deployment prerequisite or PASS.

## Frozen acceptance and validation evidence

Previously completed **PREDEPLOYMENT**, not newly run postdeployment: 8/8 PASS, wrong authoritative totals 0, wrong accepted row amounts 0, wrong invoice tokens 0, wrong record IDs 0. Lint, TypeScript and build passed in that predeployment run. They were not rerun after this stopped rollout.

- Committed receipt: `release/evidence/gate-state-machine-result.json`.
- Receipt started: `2026-10-08T06:03:11.940Z`.
- State: `READY_FOR_CONTROLLED_DEPLOYMENT`.
- Frozen corpus hash: `29f8a84ab995c246d2cedc9943ce391d56af55b09564dbe23329e357a7df6f7f`.
- Private gate output: `C:/Users/robbi/AppData/Local/Trimax/release-gates/2026-10-08T06-03-11-939Z`.
- Current rollout snapshot: `C:/Users/robbi/AppData/Local/Trimax/controlled-rollout-20261008/before.json`.
- Current failed attestation: `C:/Users/robbi/AppData/Local/Trimax/controlled-rollout-20261008/runtime-after-rpc.json`.
- Safety comparison: `C:/Users/robbi/AppData/Local/Trimax/controlled-rollout-20261008/safety-comparison.json`.

## Final disposition

Commits: none. Push: none. Web deployment: none. Worker replacements: none. Production SQL: reviewed read-only attestation RPC installed, validation failed. Business/payment state changed: **NO**, supported by matching snapshot checksums. Physical acceptance: **PENDING**.

**READY FOR ONE INSTALLED-IPHONE PHYSICAL ACCEPTANCE TEST: NO.**

Single blocking stage: live database/credential attestation failed. No repair was attempted. **WAIT FOR CHATGPT REVIEW.**
