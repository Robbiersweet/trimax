/** Visual-only monetary consensus. Never accepts invoice or document balances. */
export const MONEY_MODELS = ['svtrv2', 'parseq', 'ppocrv5'] as const;
export type MatureMoneyObservation = {
  id: string; rowId: string; field: 'row_amount' | 'total'; documentId: string;
  sourceHash: string; cropHash: string; recognizer: typeof MONEY_MODELS[number];
  raw: string; confidence: number | null; confidenceCalibrated: false; durationMs: number;
};
import {normalizeVisualMoney} from '../../documentFields/visualMoney.ts';
export {normalizeVisualMoney} from '../../documentFields/visualMoney.ts';
export function fuseMoneyObservations(observations: MatureMoneyObservation[], expected: { rowId: string; field: 'row_amount' | 'total'; documentId: string; sourceHash: string; cropHash: string }) {
  for (const o of observations) if (!MONEY_MODELS.includes(o.recognizer) || Object.entries(expected).some(([key,value]) => o[key as keyof MatureMoneyObservation] !== value)) throw Error('Money model output does not belong to physical field pixels');
  const candidates = new Map<number, MatureMoneyObservation[]>();
  const complete = MONEY_MODELS.every(name => observations.some(o => o.recognizer === name));
  const conflicts: string[] = [];
  for (const name of MONEY_MODELS) {
    const own = observations.filter(o => o.recognizer === name);
    const values = [...new Set(own.map(o => normalizeVisualMoney(o.raw)))];
    if (values.length > 1) { conflicts.push(name); continue; }
    if (values.length === 1 && values[0] !== null) candidates.set(values[0], [...(candidates.get(values[0]) ?? []), own[0]]);
  }
  const supported = [...candidates].filter(([,own]) => own.length >= 2);
  const cents = complete && !conflicts.length && supported.length === 1 ? supported[0][0] : null;
  return { version: 'mature-money-consensus-1', cents, confidence: 'uncalibrated-model-agreement',
    candidates: [...candidates].map(([cents, own]) => ({ cents, recognizers: own.map(o => o.recognizer), provenance: own.map(o => o.id) })),
    provenance: cents === null ? [] : supported[0][1].map(o => o.id),
    reason: !complete ? 'Incomplete mature money model set' : conflicts.length ? 'Conflicting repeats from the same recognizer' : cents === null ? 'No cross-model agreement on complete monetary digits' : 'Two distinct mature recognizers agree on the same physical field', observations };
}
