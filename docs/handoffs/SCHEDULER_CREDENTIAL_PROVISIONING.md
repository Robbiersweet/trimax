# Retain the existing production scheduler credential

## Approved preparation; production execution awaits explicit approval

No credential value was read, generated, rotated or written during preparation. The May 30 Vercel `trimax` CRON_SECRET remains authoritative. The October 9 override affects only the `codex/public-scheduling-foundation` Preview branch. Production must be the execution environment; Preview and local execution are rejected even when the operator flag is set.

Use the existing Vercel production build environment and Supabase service-role credential. No new endpoint, login, service, subscription, permanent database permission or replacement secret is needed. The transfer is a custom short-lived operation built from supported environment access, PostgREST RPC and Vault APIs; it is not a built-in cross-provider transfer feature.

## Execution sequence, only within coordinated rollout approval

1. Refresh production identity, rollback checkpoints, exact release receipt and database baseline. Pause the existing contract-checked workers for the coordinated migration window. Preserve all customer data.
2. Apply the three reviewed workflow migrations in order and verify the projected catalog. Install `supabase/sql/2026-10-19-scheduler-provisioning-install.sql` separately. It temporarily adds a service-role-only RPC, so fingerprints differ until cleanup. Never resume workers with that helper installed.
3. In the **trimax project, Production only**, temporarily set the non-secret configuration `TRIMAX_PROVISION_REQUEST_SCHEDULER=approved-once`. Keep the existing CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY entries unchanged. Point TRIMAX_RELEASE_GATE_RESULT at the newly sealed passing receipt.
4. The sealed vercel.json buildCommand retains all existing tests and build guards, then invokes `node scripts/provision-request-scheduler.cjs`. The repository configuration overrides dashboard build-command settings; do not attempt a dashboard-only override. This runs transfer only after a successful authorized build. Do not use `node --inspect`, fetch tracing, verbose HTTP logging, environment dumps or request-body capture. Do not run this command against a Preview deployment.
5. The first RPC contains no secret and checks actual REST-session logging settings. The second sends the existing CRON_SECRET directly over HTTPS in a parameterized JSON body to the fixed Supabase project. Redirects are rejected. The helper stores only `trimax_service_request_cron_secret`, verifies equality inside the database, and returns a fixed status. Same-value retry succeeds; a different existing value fails without replacement. Logs contain only disabled/verified/generic failure status. Do not inspect raw error bodies.
6. Require the build output `Scheduler credential provisioning: verified`. On ambiguous network failure, retry only the same sealed operation; do not generate a replacement or assume success. The idempotent helper verifies the existing value on retry.
7. Run `supabase/sql/2026-10-19-scheduler-provisioning-remove.sql` on success **or abort**. It removes the helper and its temporary EXECUTE grant, preserving the Vault value. Verify the helper is absent and all five candidate catalog fingerprints match. Remove the temporary non-secret flag; the sealed build hook then returns disabled without network activity. Do not delete either existing CRON_SECRET entry.
8. Complete web/worker cutover and postdeployment attestation. Only then activate the prepared named Supabase scheduler and delivery flag. Verify real dispatch and the owner-controlled acceptance flow. Preserve the credential during rollback; disable delivery and the named cron job if recovery is necessary.

The existing sealed marketing revision is unchanged. No application UI, API route, service worker, pricing, customer workflow or OCR behavior was modified for this provisioning operation. The executable release identity changes because operational scripts are included in its source seal.

## Verification and limits

- Isolated regression exercises disabled and wrong-environment behavior, fixed HTTPS destination, redirect rejection, preflight failures, sanitized exceptions, anonymous/authenticated denial, service-role isolation from direct Vault access, create-only behavior, idempotency, collision preservation and helper removal.
- Exact catalog replay proves temporary helper removal restores all five projected database fingerprints.
- Read-only production logging inspection found log_statement=ddl; duration/sample logging disabled; error parameter logging=0; pgaudit.log_parameter=off. The listed role overrides do not expand statement logging. Actual REST-session preflight repeats the checks before transfer; no production logging setting was changed.
- Tests use a disposable Vault stand-in. Real Vault encryption, HTTPS transfer, scheduler dispatch, handset receipt and email receipt remain production acceptance checks. No successful production transfer is claimed.
- Email activates only after the existing provider sender/domain is verified. SMS stays disabled and separate. Failure of email readiness must not disable internal notices or push.

Supported interfaces: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Supabase Vault](https://supabase.com/docs/guides/database/vault), [PostgreSQL logging](https://www.postgresql.org/docs/17/runtime-config-logging.html).
