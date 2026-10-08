# Trimax live release-attestation repair

Date: 2026-10-08. Scope: release attestation only. No production web deployment, worker replacement/restart, OCR/capture/auth/payment/model/frozen-truth changes.

## Root cause and smallest repair

The first exact divergence is the separator byte sequence in the catalog digest input. The frozen baseline and original direct SQL-editor query used **CRLF (hex 0D0A)** between sorted `name=value` records. The installed RPC used SQL `E'\n'`, which evaluates to **LF (hex 0A)**. The original direct query embedded a literal newline in its string; the Windows SQL editor stored it as CRLF. Replaying that original literal-newline query reproduces all five sealed hashes after installation. An explicit CRLF query does too. The LF-only direct query reproduces all five mismatching RPC hashes. This isolates serialization, not catalog drift or credential privilege, as the fingerprint defect.

The RPC now uses `chr(13)||chr(10)`. All expected DB hashes remain byte-for-byte unchanged; no table, function, policy, trigger or grant coverage was removed. No special case accepts either hash or ignores a mismatch.

## Four-way raw fingerprint comparison

A = sealed manifest; B = recorded pre-install direct query; C = exact original direct query rerun post-install; D = raw installed RPC before repair. All entries use SHA-256.

| Kind | A: sealed | B: pre-install direct | C: post-install original direct | D: RPC before repair | Entries |
|---|---|---|---|---|---:|
| schema | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | `74d1a3d9986f0ce93dd658e09ac630731c5ed1a9642e32098aa747ba81927758` | 699 |
| rpc | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | `c23013601e9eac6fd62df0faaf5ce1ae503edfe84f11600d7c0fa876def307d9` | 37 |
| triggers | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | `31189453a0f7467a87b0795c6e3e41c3c8e41a4001dd9f4449f1850a51ac3ac2` | 8 |
| policies | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | `86f70417332c45a70587b92cc807c0d10768b966f28efb8660b7384572eeb04b` | 74 |
| grants | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | `a4924da2c9a16aa74d1ad131d06aa6f393aec6a1b7a0cbad0edcd3863830ccf8` | 917 |

### Raw repaired RPC values

| Kind | Legacy | V2 | Matches A/B/C |
|---|---|---|---|
| schema | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | `efc506fa018ed86875375bbe51e479e746b9ca661943b2657eaf13e8f3a358f8` | yes |
| rpc | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | `d26d37d72ff5c6d835dfb0767893399ae1e205f5344193ddf3017dae69a0e1ed` | yes |
| triggers | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | `1189025c52ee6e7c3b8e69686784557aba68b0f29e6c2d2db8007cfb7475c549` | yes |
| policies | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | `39550adf015ae539be77e3a765858bd84fb71bbe36fe401a1dd68c3ff0028864` | yes |
| grants | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | `a056ce17f8f9b68fc393a5be34fb0a38539a5c4a7f15b5c9f1db9877ef446ea7` | yes |

Before repair, both engines already returned identical values and counts. The independent LF query also returned D. An empty separator and literal backslash+n were tested and did not reproduce the baseline; only CRLF reproduced every sealed value.

## Algorithm comparison and self-reference

| Clause | Baseline / independent query | Original RPC | Repaired RPC |
|---|---|---|---|
| Tables | public ordinary tables, relkind=r | same | unchanged |
| Schema | columns/order/type/not-null/default/RLS flags; constraints; public indexes | same | unchanged |
| Functions | public prokind=f; function identity arguments, definition and ACL/default | same | unchanged |
| Exclusion | only trimax_release_runtime function definition/ACL | same | unchanged |
| Triggers | non-internal public-table triggers and enabled status | same | unchanged |
| Policies | public + storage, permissive/roles/cmd/qual/with_check | same | unchanged |
| Grants | information_schema.role_table_grants for public tables | same | unchanged |
| Record encoding | name + equals + value | same | unchanged |
| Null handling | concat_ws skips nulls; function ACL coalesce(DEFAULT); aggregate semantics unchanged | same | unchanged |
| Sorting | name COLLATE C inside string_agg | same | unchanged |
| Record separator | CRLF 0D0A from literal editor newline | LF 0A from escape | explicit chr(13) + chr(10) |
| Encoding/digest | convert_to UTF8; SHA256; hex encode | same | unchanged |

The original baseline generator was an interactive direct SQL query, not a separate checked-in generator. Its algorithm and output were recorded in the manifest/audit. The rollout query remains in conversation evidence; this task replayed its literal-newline form and separately used explicit byte constructors. The regression now independently hashes the catalog records in JavaScript with UTF-8, bytewise C ordering and CRLF, rather than duplicating the RPC digest expression.

The function exclusion also excludes its proacl from the RPC digest. Function EXECUTE grants are not table grants, so they never enter role_table_grants. No unrelated function or grant is excluded.

## Catalog effects of installation

Installation added one public pg_proc function: trimax_release_runtime(uuid,text,text), increasing total public functions from 37 to 38. The covered function count remains 37 because the attestation function is excluded. Its prosrc/proconfig/prosecdef/provolatile and proacl belong to that excluded row. Repair changes that function body only.

Observed function metadata: owner postgres; SECURITY DEFINER true; volatility s (STABLE); search_path=public, pg_catalog; ACL `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. PUBLIC execution is revoked. The service_role entry is an observed default grant, not a new service-role credential or worker permission.

Observed associated catalog dependencies:

- pg_depend: normal dependencies on language plpgsql and schema public.
- pg_shdepend: owner dependency on postgres and ACL dependencies on anon, authenticated, service_role.

These metadata rows are outside the defined fingerprint inputs; no schema/table/index/policy/trigger row was introduced. No role or membership was created. The matching original-query hashes prove no covered catalog difference. Historical system-catalog OIDs/dependency tuples were not separately snapshotted before installation; no claim is made that such an old row-level dump exists.

Installed repaired function body, normalized CRLF to LF, SHA-256: `625b5be66bf9aa4bb7fa479087fefc7568f9a207e376e5895756af26c434537e`. This exactly matches the local repaired SQL body.

## Execution context and authorization

Direct SQL editor context: current_user=postgres, session_user=postgres, search_path=`"$user", public, extensions`. RPC: SECURITY DEFINER owned by postgres with explicit public,pg_catalog search_path. Restricted HTTP calls use existing anonymous/publishable API keys and separate business-scoped worker secrets, never service-role keys.

Catalog query visibility is governed by the function owner inside the RPC, including information_schema.role_table_grants. pg_catalog sources do not acquire caller-specific business RLS filters. RLS flags/policies are fingerprint data, not changed by attestation. Owner/admin and both worker callers returned identical fingerprints after repair. The default direct-query context and function search_path therefore did not cause the observed mismatch.

| Caller | Live verification | Result |
|---|---|---|
| Owner/admin | Read-only SQL transaction sets transaction-local request claims to an existing business owner/admin, SET LOCAL ROLE authenticated; invokes diagnostics and asserts all five hashes; ROLLBACK | PASS |
| Restricted legacy | Existing key, real HTTPS RPC | HTTP 200, PASS |
| Restricted v2 | Existing key, real HTTPS RPC | HTTP 200, PASS |
| invalid legacy | Real HTTPS RPC | HTTP 400: Invalid legacy credential |
| invalid shadow | Real HTTPS RPC | HTTP 400: Invalid shadow credential |
| unauthenticated diagnostics | Real HTTPS RPC | HTTP 400: Owner/admin required |
| unknown engine | Real HTTPS RPC | HTTP 400: Unknown engine |
| unrelated business | Real HTTPS RPC | HTTP 400: Invalid legacy credential |

The owner/admin check tests actual database authorization under an authenticated role and existing membership. It is not claimed as a browser sign-in or authenticated web click-through. Claims and role were transaction-local and rolled back; no user, membership, credential or session record changed.

The RPC body contains SELECT/CTEs, validation/raise and return only: no INSERT, UPDATE, DELETE, queue claim or payment endpoint. Its stable read-only execution succeeded inside BEGIN READ ONLY. Permissions and credential scopes are unchanged by repair.

## Legacy transport failure, separately assessed

Exact endpoint: `https://gqknefosisnsjuzmhvts.supabase.co/rest/v1/rpc/trimax_release_runtime`, POST JSON containing p_business, p_engine=legacy, p_key. Headers use the existing apikey and application/json; secret values are intentionally not included. Original runtime-check used AbortSignal.timeout(15000).

The earlier checker recorded only `fetch failed`. It did not retain error.cause, socket code, DNS/TLS details, HTTP status, server request ID or raw body for that failure. Consequently **the exact original DNS/TLS/socket cause and whether that request reached Supabase are UNKNOWN**. No evidence supports labeling it a schema or credential failure.

Retry without any credential/network changes succeeded before the SQL repair: legacy HTTP 200 in 1259 ms; v2 HTTP 200 in 123 ms. After repair: legacy HTTP 200 in 396 ms, v2 HTTP 200 in 115 ms. The failure is non-reproducing/transient in these observations, not proven permanently eliminated. Private probe scripts now preserve sanitized nested cause fields if another request fails. No timeout or retry policy was changed.

## Release identity and validation

This was not a reseal to accept different database hashes. The attestation SQL and its regression are tracked executable release machinery, so the existing contract requires a machinery commit followed by a metadata-only computed source seal.

- Machinery commit: `155353b42e2abfb5e7ab671f560bbb745100971e`.
- Seal commit: `3c3e59b5dfbadd8e7a9a2085b31dbefcf30b7dd9`.
- Release: `trimax-release-contract-20261008-rc5`.
- Source bundle, calculated by existing sourceHashes/digest: `f412373f1800ffadc6637d92bc7f7cfa5dbc33aa982b58db24a56dc7f83f6aed`.
- Common web/legacy/v2 component revision: `155353b42e2abfb5e7ab671f560bbb745100971e`.
- Database hashes/flags, model bundle/files, worker configuration and frozen acceptance truth: unchanged.
- Prior uncommitted rollout report was preserved in the machinery commit, not discarded.
- No push, web deployment or worker replacement/restart.

Unchanged runtime-check result: live database **PASS**, deployed runtime **DEPLOYMENT_PREREQUISITE** for both engines. A candidate worker has not yet recorded a deployed release; this remains a prerequisite, not PASS.

### Regression and gate results

Final predeployment state: **READY_FOR_CONTROLLED_DEPLOYMENT**. Frozen real corpus: **8/8 PASS**. Lint: PASS. TypeScript: PASS. Production build: PASS. Clean source at start/end: PASS. Wrong authoritative totals / row amounts / invoice tokens / record IDs: **0 / 0 / 0 / 0**.

New tests verify independent CRLF serialization, installation self-exclusion, owner/legacy/v2 contexts, invalid callers, LF-vs-CRLF SQL file invariance, an LF-only negative control, and no queue writes. SQL attestation regression and gate state regression passed.

Refreshed command: `npm run trimax:release-gate -- --mode=predeployment`.

```json
{
  "mode": "PREDEPLOYMENT",
  "releaseId": "trimax-release-contract-20261008-rc5",
  "status": "READY_FOR_CONTROLLED_DEPLOYMENT",
  "retained": [
    {
      "id": "check2715",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2715:money:physical-row-1:native",
              "check2715:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "check2721",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "total",
            "rowId": "document-total",
            "cents": 219800,
            "expectedCents": 219800,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:total:document-total",
              "money:parseq:total:document-total",
              "money:ppocr:total:document-total"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2721:money:physical-row-0:native",
              "check2721:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2721:money:physical-row-1:native",
              "check2721:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "semantic-page-total",
            "field": "total",
            "rowId": "document-total",
            "cents": 219800,
            "expectedCents": 219800,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2721:semantic-page:native",
              "check2721:semantic-page:grayscale",
              "check2721:semantic-page:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "check2734",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "total",
            "rowId": "document-total",
            "cents": 219800,
            "expectedCents": 219800,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:total:document-total",
              "money:parseq:total:document-total",
              "money:ppocr:total:document-total"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2734:money:physical-row-0:native",
              "check2734:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2734:money:physical-row-1:native",
              "check2734:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "check2743",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "total",
            "rowId": "document-total",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:total:document-total",
              "money:parseq:total:document-total",
              "money:ppocr:total:document-total"
            ],
            "rejectionReason": null
          },
          {
            "stage": "semantic-page-total",
            "field": "total",
            "rowId": "document-total",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "check2743:semantic-page:grayscale"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "A",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-2",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-2",
              "money:parseq:row_amount:physical-row-2",
              "money:ppocr:row_amount:physical-row-2"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-3",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-3",
              "money:parseq:row_amount:physical-row-3",
              "money:ppocr:row_amount:physical-row-3"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-4",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-4",
              "money:parseq:row_amount:physical-row-4",
              "money:ppocr:row_amount:physical-row-4"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "A:money:physical-row-0:native",
              "A:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "A:money:physical-row-1:native",
              "A:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-2",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "A:money:physical-row-2:native",
              "A:money:physical-row-2:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-3",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "A:money:physical-row-3:native",
              "A:money:physical-row-3:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-4",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "A:money:physical-row-4:native",
              "A:money:physical-row-4:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "D",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-2",
            "cents": 45840,
            "expectedCents": 45840,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-2",
              "money:parseq:row_amount:physical-row-2",
              "money:ppocr:row_amount:physical-row-2"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-3",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-3",
              "money:parseq:row_amount:physical-row-3",
              "money:ppocr:row_amount:physical-row-3"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-4",
            "cents": 34850,
            "expectedCents": 34850,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-4",
              "money:parseq:row_amount:physical-row-4",
              "money:ppocr:row_amount:physical-row-4"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "total",
            "rowId": "document-total",
            "cents": 450590,
            "expectedCents": 450590,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:total:document-total",
              "money:parseq:total:document-total",
              "money:ppocr:total:document-total"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "D:money:physical-row-0:native",
              "D:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "D:money:physical-row-1:native",
              "D:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-2",
            "cents": 45840,
            "expectedCents": 45840,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "D:money:physical-row-2:native",
              "D:money:physical-row-2:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-3",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "D:money:physical-row-3:native",
              "D:money:physical-row-3:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-4",
            "cents": 34850,
            "expectedCents": 34850,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "D:money:physical-row-4:native",
              "D:money:physical-row-4:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "B",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-2",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-2",
              "money:ppocr:row_amount:physical-row-2"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-4",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-4",
              "money:ppocr:row_amount:physical-row-4"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 109900,
            "expectedCents": 109900,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "B:money:physical-row-0:native",
              "B:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    },
    {
      "id": "C",
      "status": "PASS",
      "failures": [],
      "metrics": {
        "wrongAuthoritativeTotals": 0,
        "wrongAcceptedRowAmounts": 0,
        "wrongInvoiceTokens": 0,
        "wrongRecordIds": 0,
        "intermediateNumericEvidence": [
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-0",
              "money:parseq:row_amount:physical-row-0",
              "money:ppocr:row_amount:physical-row-0"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 95295,
            "expectedCents": 95295,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:row_amount:physical-row-1",
              "money:parseq:row_amount:physical-row-1",
              "money:ppocr:row_amount:physical-row-1"
            ],
            "rejectionReason": null
          },
          {
            "stage": "mature-money-consensus",
            "field": "total",
            "rowId": "document-total",
            "cents": 225295,
            "expectedCents": 225295,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "money:svtr:total:document-total",
              "money:parseq:total:document-total",
              "money:ppocr:total:document-total"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-0",
            "cents": 130000,
            "expectedCents": 130000,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "C:money:physical-row-0:native",
              "C:money:physical-row-0:local-contrast"
            ],
            "rejectionReason": null
          },
          {
            "stage": "tesseract-money-consensus",
            "field": "row_amount",
            "rowId": "physical-row-1",
            "cents": 95295,
            "expectedCents": 95295,
            "correct": true,
            "acceptedDownstream": true,
            "provenance": [
              "C:money:physical-row-1:native",
              "C:money:physical-row-1:local-contrast"
            ],
            "rejectionReason": null
          }
        ],
        "intermediateWrongNumericConsensuses": [],
        "failures": []
      }
    }
  ],
  "checks": [
    {
      "name": "production-runtime-attestation",
      "status": "DEPLOYMENT_PREREQUISITE",
      "failures": [],
      "engines": [
        {
          "engine": "legacy",
          "status": "DEPLOYMENT_PREREQUISITE",
          "failures": [],
          "reason": "No deployed candidate worker attestation has been recorded"
        },
        {
          "engine": "v2-shadow",
          "status": "DEPLOYMENT_PREREQUISITE",
          "failures": [],
          "reason": "No deployed candidate worker attestation has been recorded"
        }
      ]
    },
    {
      "name": "live-database-attestation",
      "status": "PASS",
      "failures": [],
      "engines": [
        {
          "engine": "legacy",
          "status": "PASS",
          "failures": [],
          "observedAt": "2026-10-08T17:29:56.739814+00:00"
        },
        {
          "engine": "v2-shadow",
          "status": "PASS",
          "failures": [],
          "observedAt": "2026-10-08T17:29:58.143165+00:00"
        }
      ]
    },
    {
      "name": "lint",
      "status": "PASS",
      "failures": [],
      "durationMs": 15848
    },
    {
      "name": "typescript",
      "status": "PASS",
      "failures": [],
      "durationMs": 1181
    },
    {
      "name": "clean-manifest-source-end",
      "status": "PASS",
      "failures": []
    }
  ]
}
```

Full receipt: `release/evidence/live-attestation-repair-result.json`. Private full gate: `C:\Users\robbi\AppData\Local\Trimax\release-gates\2026-10-08T17-29-31-478Z`. Physical acceptance remains PENDING; no installed-iPhone test occurred.

## Business/payment safety

The exact same 18-table count/hash query was rerun after the RPC repair. All counts and SHA-256 values equal the pre-rollout snapshot. Both queues remained at zero queued/running. No business/payment mutation, job claim, model execution in production, or apply-payment call was made. The full release gate uses offline/disposable regression data; production interaction is read-only attestation.

| Table | Rows | Unchanged SHA-256 |
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

## Evidence and handoff

Private sanitized evidence folder: `C:\Users\robbi\AppData\Local\Trimax\live-attestation-repair-20261008`.

- raw-rpc-before.json: both successful pre-repair responses, exact hashes and timings.
- raw-rpc-after.json: both repaired responses.
- authorization-denials.json: live negative authorization matrix.
- runtime-check-after.json: unchanged checker live DB PASS / deployed runtime prerequisite.
- safety-after.json: unchanged 18-table checksums.
- probe.cjs/probe-after.cjs/denials.cjs: read-only probes; secrets loaded from existing restricted files and never printed.

Files changed: attestation SQL, sql-attestation-regression.cjs, release policy, calculated release manifest, preserved prior rollout report, this handoff and gate receipt. Application/worker/OCR/model/frozen acceptance files remain unchanged.

**Live attestation repair complete. Ready to resume controlled rollout only under the normal deployment procedure and fresh idle-queue/safety preflight. This task did not resume it. WAIT FOR CHATGPT REVIEW.**
