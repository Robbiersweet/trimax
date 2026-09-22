# Separate residual arithmetic evidence

The shadow pipeline can derive one missing physical row amount by subtracting authoritative confirmed rows from an independently authoritative document total. This is a separate `derived-arithmetic` class, never an OCR transcription or a new total-authority rule.

The pure contract requires exact nonnegative safe-integer cents, exactly one unresolved row, authoritative/provenanced other rows and total, unique nonoverlapping row bounds, contained amount ownership, and a one-to-one invoice-anchor mapping across at least two distinct page passes. A missing/extra/ambiguous anchor or missing ownership blocks derivation. Identical amounts on distinct split rows are allowed; duplicate physical rows are not. The complete calculation and source/crop/pass references are retained.

`resolver/residual.ts` validates the proof against the current document before projecting arithmetic evidence into the **unchanged** resolver. Original OCR amounts and observations remain untouched. Candidate traces explicitly label derived arithmetic and leave the derived row's `ocrRowAmount` null. The adapter never creates invoice candidates, changes eligibility, or removes a payment blocker.

The existing resolver, invoice fusion, recognition models, money acceptance, total authority, identity/date thresholds and all payment-writing code remain frozen. A complete zero-difference arithmetic proof is displayed independently of payment eligibility. The existing owner/admin “What Trimax saw” view shows “OCR amount: unresolved” and “Derived amount” separately. The comparison count remains explicitly OCR-only.

Local retained-image verification establishes one derived amount and exact arithmetic reconciliation. The otherwise unique eligible invoice assignment still requires customer/payor identity. Under the existing contract, absent check number/date alone do not block this resolver, but remain inputs to duplicate detection when available. The current identity requirement is not relaxed. Shadow remains diagnostic-only and cannot apply payment.

Validation includes adversarial arithmetic, duplicate/overlap/unstable-row rejection, fractional cents, split children, tampered proof, original OCR preservation, UI separation, retained-image inference, and the frozen Phase 1–6 and business-safety suites. Private images and business snapshots stay outside Git.
