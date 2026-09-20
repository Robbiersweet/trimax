import type { Bounds } from "../types.ts";
export type Certainty = "supported" | "tentative";
export type TextComponent = Bounds & {
    pixels: number;
    centerY: number;
};
export type TextBand = Bounds & {
    centerY: number;
    componentCount: number;
    characterHeight: number;
};
export type LayoutColumn = Bounds & {
    id: string;
    certainty: Certainty;
    evidence: string[];
    roleIsGeometricHypothesis: true;
};
export type PhysicalRow = {
    id: string;
    top: number;
    bottom: number;
    centerY: number;
    bounds: Bounds;
    invoiceRegion?: Bounds;
    unitRegion?: Bounds;
    dateRegion?: Bounds;
    descriptionRegion?: Bounds;
    amountRegion?: Bounds;
};
export type DocumentLayout = {
    version: "phase2-layout-1";
    coordinateSpace: "normalized-document-color";
    documentBounds: Bounds;
    headerRegion?: Bounds;
    tableRegion?: Bounds;
    columns: {
        invoice?: LayoutColumn;
        unit?: LayoutColumn;
        date?: LayoutColumn;
        description?: LayoutColumn;
        amount?: LayoutColumn;
        propertyAccount?: LayoutColumn;
    };
    rows: PhysicalRow[];
    footerRegion?: Bounds;
    totalCandidateRegion?: Bounds;
    diagnostics: {
        sourceWidth: number;
        sourceHeight: number;
        analysisWidth: number;
        analysisHeight: number;
        scaleX: number;
        scaleY: number;
        threshold: number;
        characterHeight: number;
        componentCount: number;
        bands: TextBand[];
        headerAnchors: Bounds[];
        verticalWhitespace: Array<{
            start: number;
            end: number;
        }>;
        warnings: string[];
        durationMs: number;
    };
};
