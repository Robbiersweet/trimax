import type { Bounds } from '../types.ts';
export type FieldType = 'invoice' | 'amount' | 'date' | 'unit' | 'header' | 'footer' | 'total';
export type FieldCrop = {
    regionId: string;
    rowId?: string;
    field: FieldType;
    bounds: Bounds;
    ownership: Bounds;
};
export type WordObservation = {
    text: string;
    confidence: number;
    bounds: Bounds;
};
export type FieldObservation = FieldCrop & {
    imageId: string;
    variant: string;
    rawText: string;
    normalizedText: string;
    transformations: string[];
    ambiguities: string[];
    candidates: string[];
    moneyCandidates: {
        text: string;
        cents: number;
    }[];
    checkCandidates: string[];
    dateCandidates: string[];
    confidence: number;
    durationMs: number;
    status: 'completed' | 'errored';
    error?: string;
    words: WordObservation[];
    configuration: {
        psm: string;
        whitelist: string;
    };
    scale: number;
    border: number;
};
