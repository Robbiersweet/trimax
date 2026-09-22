import type { Bounds } from '../types.ts';
import type { SemanticType } from './labels.ts';
export type SemanticWord = { text: string; confidence: number; bounds: Bounds };
export type SemanticObservation = { id: string; runKey: string; sourceHash: string; cropHash: string; recognizer: string; variant: string; raw: string; confidence: number; region: Bounds; words: SemanticWord[]; verified: boolean; field?: string; rowId?: string };
export type SemanticLabel = { id: string; observationId: string; runKey: string; type: SemanticType; raw: string; normalized: string; correction: 'formatting-only' | 'single-label-edit'; bounds: Bounds; confidence: number; words: number[] };
export type SemanticField = { type: SemanticType; value: string; normalized: string; cents?: number; bounds: Bounds; observationId: string; runKey: string; confidence: number; labelIds: string[]; rowId?: string };
export type SemanticRow = { id: string; bounds: Bounds; physical?: import('./physicalRows.ts').PhysicalRow; invoiceRegion?: Bounds; amountRegion?: Bounds; amountCents?: number | null };
export type SemanticColumn = { type: SemanticType; bounds: Bounds; labelEvidence?: string[]; geometryEvidence?: Array<{ observationId: string; bounds: Bounds; kind: string }>; semanticConfidence?: 'label-supported' | 'provisional-geometry' };
export type DocumentSemanticModel = {
  version: 'phase6-semantics-2'; sourceHash: string; documentType: string;
  table: { supported: boolean; headerPosition: Bounds | null; columns: SemanticColumn[]; rows: SemanticRow[]; physicalGeometry?: ReturnType<typeof import('./physicalRows.ts').localizePhysicalRows>; headerGeometry?: ReturnType<typeof import('./headerGeometry.ts').fitTableHeader>['geometry'] };
  headers: SemanticField[]; labels: SemanticLabel[]; metadataFields: SemanticField[]; rowFields: SemanticField[]; totals: SemanticField[]; identityFields: SemanticField[];
  spatialRelationships: Array<{ from: string; to: string; relation: 'adjacent-value' | 'column-value' | 'header-label-final-value' }>;
  template: { id: string; invoiceColumnOrder: SemanticType[]; amountColumnPosition: number; totalLabelPosition: string; totalValuePosition: string; identityFieldPosition: string };
  identity: { value: string | null; candidates: string[]; reason: string; provenance: string[] };
  total: { cents: number | null; candidates: number[]; reason: string; provenance: string[]; observedSubtotal: number | null };
  reviewRequired: boolean; reviewReasons: string[];
  timings: { labelsMs: number; structureMs: number; identityMs: number; totalMs: number; evidenceReuseMs: number; completeMs: number };
};
