# Turnstile HTTP 400 diagnostic release

## Verified production evidence — 2026-10-16

Owner session on app.rnlcreations.com authenticated and loaded R&L Service Requests. Fresh runtime check at 18:38:26Z passed both engines/database. Corrected Upstash secret was included in public Production deployment 4UK1mpHpVggceCgjixc5nGuLw1yR, exact source 048e1378688f0b8abbc58c48c80e9f08ee65d6e5, Ready 18:43:21Z.

Authorized database window opened 18:44:20.554Z. Exactly one synthetic submit click at 18:44:40.674Z. Vercel request j8ql4-1792176280271-70d229b86ad2 (request timestamp 18:44:40.271Z) returned HTTP 503 with fixed diagnostic challenge_http/status400. Rate limiting succeeded because the sequential fail-closed handler reached Turnstile. This proves the corrected Upstash runtime credential works; it does not prove Turnstile or submission RPC acceptance.

Database gate returned enabled=false immediately after the failed response, within two minutes of opening. Total public_service_requests=0; owner refresh remains Inbox0. Protected jobs, queue, activity, invoices and payment attachments hashes exactly match the prior baseline. No retries, notifications or conversions. Disabled same-source Production rebuild AcffcZtEtqzv9TKHejHpmtv3LHie Ready18:46:23Z; public /schedule freshly shows coming-soon/no form. Stage B FAIL; Stage C blocked.

Authenticated Cloudflare widget analytics shows rnlcreations.com/public-scheduling challenges and noninteractive solves, but zero attributed Siteverify requests. Aggregate/delayed analytics cannot distinguish invalid secret, malformed request or another provider rejection. Do not assert a bad secret from HTTP400 alone. Request format matches the official supported URL-encoded POST contract.

## Minimal correction

Current diagnostics discard Cloudflare's rejection enum on non-2xx responses. Four-file candidate retains at most one exact allowlisted documented code from error-codes, alongside existing status. Unknown strings, response bodies, secrets, tokens, customer fields, URLs and raw errors are never logged. Invalid/missing JSON retains existing challenge_http behavior. No retry, new endpoint, credential change, success-rule change, permission change or activation. Hostname/action checks and provider order remain unchanged.

Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/#error-codes-reference

## Validation

PASS all public scheduling regressions, including malicious secret-bearing bodies, unknown enums, malformed error shape, HTTP400 and logger failure. PASS targeted ESLint, website lint, TypeScript, website78 boundary/routing/security checks, credential/disabled-route regressions, production website build. Initial website regression ran against stale generated shared files and failed; normal prepare:shared (part of build) regenerated them, then affected suite and TypeScript passed. No assertions weakened. This fixes diagnostic loss, not the unproven underlying provider rejection.

## Exact approval required

Deploy the metadata-sealed candidate pinned by manifest.json to rnl-public-website only, sites/rnl root, both intake gates disabled. Preserve current production secrets, restricted DB scope and internal Trimax deployment/workers. Verify source identity, current production baseline and rollback before deployment. No root/internal deployment.

A distinct explicitly approved bounded Stage B window (maximum15minutes/exactly one synthetic request/no notifications/immediate disable) is required to exercise the actual provider again. Previous approval was consumed. Do not reuse the old challenge token or replay the failed request. No permanent Stage C activation.

Rollback target: AcffcZtEtqzv9TKHejHpmtv3LHie, source048e1378688f0b8abbc58c48c80e9f08ee65d6e5, corrected Upstash secret and disabled flag. No database rollback required. Candidate is local only until separately authorized deployment; no push or deployment performed.
