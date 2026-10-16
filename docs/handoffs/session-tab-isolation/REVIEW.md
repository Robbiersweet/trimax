# Approved cross-tab authentication correction

Approved executable: 662a53e75d4af219485cf1eb252f992305be5ffb.
Prior production seal: 91afa7bd18968677dd212fa469a2b27af8f50aea, deployment BahpsZbpCZcjVYYoLDMSnXvuER2Z.

Only AuthGuard.tsx, sessionSecurity.ts and the targeted regression differ in executable source. A tab without its per-tab security marker stays locked but cannot clear shared timestamps or sign out the owner's other tab. Idle, absolute expiry and manual lock retain original revocation. No marker adoption, permissions, database, OCR, financial logic or website transport changes.

The candidate uses a distinct rc11-session-isolation releaseId because the existing strict classifier distinguishes approved prior workers from a candidate by releaseId. This is release metadata, not a gate exception. All components name the approved executable. Database, models, worker configuration and recognizer sources remain identical.

Predeployment full gate required; failed first run retained privately. Preparation issues: prior releaseId incorrectly retained, optional PGlite module environment missing, and local public build environment line formatting. All corrected without executable changes or assertion weakening. Final receipt pending.

Rollout: use the existing internal trimax Vercel project and protected build guard, preserve separate rnl-public-website deployment, coordinate unchanged workers against sealed identity only after verified readiness. Verify actual persisted runtime provenance and authenticated owner navigation. Keep scheduling disabled unless all Stage B prerequisites pass.

Rollback: prior sealed application and original worker checkout/configurations remain available. Database contract is unchanged and compatible with prior seal. Do not alter scheduling grants or any records as rollback. Physical installed-iPhone acceptance remains unverified.

Final full predeployment gate READY_FOR_CONTROLLED_DEPLOYMENT: all required code/SQL/security tests, all eight retained documents through both engines, lint, TypeScript and production build PASS. Exact prior worker runtime is DEPLOYMENT_PREREQUISITE pending coordinated cutover. Receipt: release/evidence/rc11-predeployment-result.json.
