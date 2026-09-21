/** Scoring only, called AFTER inference is frozen. Never imported by pipeline.ts. */
export type VerifiedTruth = {
  independentDocumentId: string; sourceImageHash: string; verifiedBy: string; verifiedAt: string;
  businessTruthVerified: true; freshUnseenConfirmed: true;
  rows: Array<{ invoiceRecordId: string; invoiceNumber: string; unit: string; amountCents: number }>;
  totalCents: number; checkNumber: string | null; checkDate: string | null; customerPayor: string;
  finalPaymentResult: string;
};
export function validateVerifiedTruth(truth: VerifiedTruth, frozen: { sourceImageHash: string; frozenAt: string }, historicalHashes: string[]) {
  if (!truth.businessTruthVerified || !truth.freshUnseenConfirmed || !truth.verifiedBy || !truth.independentDocumentId || !truth.finalPaymentResult) throw Error('Human verification and independent fresh-document identity required');
  if (truth.sourceImageHash !== frozen.sourceImageHash) throw Error('Truth does not belong to frozen capture');
  if (historicalHashes.includes(truth.sourceImageHash)) throw Error('Historical development image cannot count as fresh acceptance');
  if (!Number.isFinite(Date.parse(truth.verifiedAt)) || Date.parse(truth.verifiedAt) <= Date.parse(frozen.frozenAt)) throw Error('Verification must follow frozen inference');
  if (!truth.rows.length || new Set(truth.rows.map(r => r.invoiceRecordId)).size !== truth.rows.length || truth.rows.some(r => !r.invoiceRecordId || !r.invoiceNumber || !Number.isSafeInteger(r.amountCents) || r.amountCents<=0)) throw Error('Invalid verified rows');
  if (!Number.isSafeInteger(truth.totalCents) || truth.rows.reduce((n,r)=>n+r.amountCents,0)!==truth.totalCents) throw Error('Verified amounts must reconcile exactly');
  return structuredClone(truth);
}
