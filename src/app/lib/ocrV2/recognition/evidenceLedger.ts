// Offline only. Immutable observations; projections never erase the source record.
import { createHash } from 'node:crypto';
import type { Bounds } from '../types.ts';

export type EvidenceObservation = {
  field: string; documentId: string; rowId?: string; sourceHash: string; cropHash: string;
  region: Bounds; recognizer: string; variant: string; configuration: string;
  raw: string; normalized: string[]; confidence: number;
  provenance: { valid: boolean; reason: string; reference: string };
  timestamp: string; stage: string;
};
export type LedgerEntry = EvidenceObservation & { sequence: number; runKey: string; observationKey: string };
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Stage, filename, timestamp and confidence are not independent OCR evidence. */
export function observationRunKey(o: EvidenceObservation) {
  return digest([o.documentId, o.rowId ?? null, o.field, o.sourceHash, o.cropHash, o.region, o.recognizer, o.variant, o.configuration]);
}
export class EvidenceLedger {
  private records: LedgerEntry[] = [];
  private invalidations: Array<{ runKey: string; reason: string; timestamp: string; stage: string }> = [];
  readonly attemptId: string;
  readonly documentId: string;
  readonly sourceHash: string;
  constructor(attemptId: string, documentId: string, sourceHash: string) {
    if (!attemptId || !documentId || !sourceHash) throw Error('Ledger requires attempt, document and source identity');
    this.attemptId = attemptId; this.documentId = documentId; this.sourceHash = sourceHash;
  }
  append(observation: EvidenceObservation) {
    const o = structuredClone(observation);
    if (o.documentId !== this.documentId || o.sourceHash !== this.sourceHash)
      o.provenance = { ...o.provenance, valid: false, reason: 'Attempt document/source mismatch' };
    const runKey = observationRunKey(o), observationKey = digest([runKey, o.raw, o.normalized]);
    this.records.push({ ...o, sequence: this.records.length, runKey, observationKey });
    return this.records.length - 1;
  }
  invalidate(runKey: string, reason: string, stage: string, timestamp = new Date().toISOString()) {
    if (!reason || !stage || !this.records.some(o => o.runKey === runKey)) throw Error('Invalidation requires an existing observation and explicit provenance reason/stage');
    this.invalidations.push({ runKey, reason, stage, timestamp });
  }
  snapshot() { return { attemptId: this.attemptId, documentId: this.documentId, sourceHash: this.sourceHash, entries: structuredClone(this.records), invalidations: structuredClone(this.invalidations) }; }
  /** One vote per source/crop/engine/config. Conflicting reruns cannot vote at all.
   * Confidence uses the minimum of equivalent valid reruns, never their sum/max.
   * Invalid provenance remains visible but supplies no vote. */
  project(field?: string, rowId?: string) {
    const selected = this.records.filter(o => (!field || o.field === field) && (rowId === undefined || o.rowId === rowId)).map(o => {
      const invalid = this.invalidations.find(e => e.runKey === o.runKey);
      return invalid ? { ...o, provenance: { ...o.provenance, valid: false, reason: invalid.reason } } : o;
    });
    const groups = new Map<string, LedgerEntry[]>();
    for (const o of selected.filter(o => o.provenance.valid)) groups.set(o.runKey, [...(groups.get(o.runKey) ?? []), o]);
    const accepted: LedgerEntry[] = [], conflicts: Array<{ runKey: string; observations: LedgerEntry[] }> = [];
    for (const [runKey, values] of groups) {
      if (new Set(values.map(o => JSON.stringify(o.normalized))).size > 1) { conflicts.push({ runKey, observations: structuredClone(values) }); continue; }
      accepted.push({ ...structuredClone(values[0]), confidence: Math.min(...values.map(o => o.confidence)) });
    }
    return { accepted, conflicts, rejected: structuredClone(selected.filter(o => !o.provenance.valid)), duplicateCount: selected.filter(o => o.provenance.valid).length - [...groups.values()].reduce((s, v) => s + new Set(v.map(o => o.observationKey)).size, 0) };
  }
}
