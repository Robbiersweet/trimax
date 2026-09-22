// Inactive Phase 1 contract. Optical confidence never authorizes a payment.
export type Point = {
    x: number;
    y: number;
};
export type Quad = [
    Point,
    Point,
    Point,
    Point
];
export type Bounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};
export type DocumentGeometry = {
    coordinateSpace: "exif-normalized-full-image";
    bounds: Bounds;
    corners: Quad;
    angle: number;
    confidence: number;
    reliable: boolean;
    method: string;
    evidence: {
        threshold: number;
        componentFill: number;
        boundaryFit: number;
        edgeContrast: number;
        candidates: number;
    } | null;
    perspectiveTransform: number[] | null;
    reason: string;
};
import type { OrientationObservation } from "../ocrStillDirection.ts";
export type { OrientationObservation } from "../ocrStillDirection.ts";
export type OcrV2Foundation = {
    engine: "v2";
    version: "phase1-optical-1";
    stage: "optical-foundation";
    sourceImage: {
        sha256: string;
        width: number;
        height: number;
        format: string;
        bytes: number;
        exifOrientation: number | null;
    };
    normalization: {
        exifAppliedOnce: true;
        rotation: number;
        orientationCertain: boolean;
        orientationObservations: OrientationObservation[];
        originalNormalizedDimensions: {
            width: number;
            height: number;
        };
        documentDimensions: {
            width: number;
            height: number;
        };
        perspectiveApplied: boolean;
        deskewDegrees: number;
        resampling: string;
        warnings: string[];
    };
    documentGeometry: DocumentGeometry;
    variants: Array<{
        name: string;
        authoritative: boolean;
        purpose: string;
        clippedBlackFraction: number;
        clippedWhiteFraction: number;
        strokeContrast: number;
        weakStrokeRetention: number | null;
    }>;
    metrics: {
        decodeMs: number;
        geometryMs: number;
        rectificationMs: number;
        variantsMs: number;
        orientationMs: number;
        completeMs: number;
        ocrPassCount: number;
    };
    // Phase 2 onwards will supply separate layout, observations and candidates.
    result: "foundation-only-no-business-resolution";
};
export type CorrectionLabel = {
    schemaVersion: 1;
    attemptId: string;
    engine: "legacy" | "v2";
    regionId: string;
    rowId?: string;
    cropReference?: string;
    fieldType: "invoice" | "unit" | "amount" | "total" | "check" | "date";
    observationIds: string[];
    incorrectCandidate: string | null;
    correctedValue: string;
    correctedByRole: "owner" | "admin";
    correctedAt: string;
};
