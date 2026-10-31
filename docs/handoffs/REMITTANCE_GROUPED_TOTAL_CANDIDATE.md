# Isolated grouped-total spacing repair

Prepared from production app e3812ce; not a production release or payment correction.

Earliest reproduced defect: the explicit total token pattern excluded a complete
observed thousands group when horizontal whitespace followed its separator.
The weaker partial candidate could consequently outrank the absent complete total.
The patch admits that whitespace only; it supplies no digits and changes no scores,
thresholds, invoice resolution, duplicate checks or posting authority.

The new minimized regression is imported by the existing retry suite, so existing
matching/gate coverage executes it. It covers complete observations, missing digits,
fragment rejection, conflicting complete totals, small valid amounts and immutability.
Private retained observations remain outside Git.

Validation passed: grouped-total regression; retry; remittance matching including
golden/duplicate matrix; second physical-source regression; client safety; saved
payment history; actual saved-remittance reopen/API handler; canonical money;
targeted ESLint; TypeScript noEmit; git diff --check.

One previously captured offline OCR observation set was resolved against the same
read-only production ledger with deployed source and this candidate. Complete total
selection was corrected; both attempts remained blocked by unresolved identity/rows
and reconciliation. No new OCR job, payment, production write or deployment occurred.
The patch does not fix incomplete rows, unknown payor/date or physical capture.

The full frozen release gate and retained matrix have NOT been run on this candidate.
They remain mandatory before a separately authorized production release. Installed
iPhone/camera acceptance remains pending; local fixtures are not physical acceptance.

Private audit/report/checkpoint: C:/Users/robbi/trimax-remittance-audit-20261031
and C:/Users/robbi/trimax/docs/handoffs/TRIMAX_REMITTANCE_RECONCILIATION_ACTIVE.md.
