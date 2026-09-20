// Offline Phase 4 only. No business records, monetary authority or payment decisions.
export type Recognizer = 'svtrv2' | 'parseq' | 'ppocrv5' | 'tesseract';
export type AmbiguityClass = 'EXACT_AGREEMENT' | 'STRONG_AGREEMENT' | 'ISOLATED_GLYPH_AMBIGUITY' | 'MULTI_GLYPH_AMBIGUITY' | 'STRUCTURALLY_INCOMPLETE' | 'UNUSABLE';
export type CropReference = {
    documentId: string; rowId: string; sourceImageSha256: string; baseCropSha256: string;
    sha256: string; path: string; variant: 'native' | 'upscale-3x' | 'local-contrast';
};
export type RecognizerObservation = {
    id: string; fieldType: 'invoice'; scope: 'row'; rowId: string; recognizer: Recognizer; rawText: string;
    sequenceConfidence: number | null; characterConfidences: number[] | null;
    confidenceCalibrated: boolean; cropReference: CropReference; durationMs: number;
    visualWarnings: Array<'faint-strokes' | 'blurred-glyphs' | 'crop-clipping'>;
};
export type NormalizedObservation = RecognizerObservation & {
    formatNormalizedText: string; normalizationSteps: string[];
    format: 'modern' | 'legacy' | 'incomplete' | 'unusable';
};
export type PositionEvidence = {
    anchorIndex: number | null; insertionBefore: number | null;
    alternatives: Array<{ character: string | null; observationIds: string[]; recognizers: Recognizer[]; supportScore: number }>;
    disputed: boolean;
};
export type FusedFieldCandidate = {
    fieldType: 'invoice'; scope: 'row'; rowId: string; documentId: string; value: string;
    format: 'modern' | 'legacy'; sourceObservations: string[]; normalizationSteps: string[];
    supportScore: number; ambiguityClass: AmbiguityClass; competingCandidates: string[];
    sharedVisualAmbiguity: boolean;
};
export type InvoiceFusion = {
    contractVersion: 'phase4-offline-1'; fieldType: 'invoice'; scope: 'row'; rowId: string;
    observations: NormalizedObservation[]; candidates: FusedFieldCandidate[];
    topCandidate: string | null; ambiguityClass: AmbiguityClass;
    positions: PositionEvidence[]; sharedVisualAmbiguity: boolean;
    confidence: { level: 'supported-agreement' | 'ambiguous' | 'insufficient'; confidentlySelected: boolean; probability: null; reasons: string[] };
    weights: typeof WEIGHTS;
};
// Frozen aggregate character accuracy from Phase 3E. Not fitted to any row.
// Related preprocessing passes share a family and can never multiply its vote.
export const WEIGHTS = Object.freeze({ svtrv2: 0.9875, parseq: 0.98125, ppocrv5: 0.93125, tesseract: 0 });
const trusted: Recognizer[] = ['svtrv2', 'parseq', 'ppocrv5'];

export function normalizeInvoice(raw: string) {
    const steps: string[] = [];
    let text = raw;
    const change = (next: string, reason: string) => { if (next !== text) { steps.push(reason); text = next; } };
    change(text.toUpperCase(), 'uppercase');
    change(text.replace(/\s/g, ''), 'remove-whitespace');
    // Do not strip numeric separators/signs: those could change the meaning.
    change(text.replace(/^["'“”‘’()[\]{}:;]+|["'“”‘’()[\]{}:;]+$/g, ''), 'remove-wrapper-punctuation');
    change(text.replace(/[‐‑–—−]/g, '-'), 'standardize-hyphen');
    // Letters remain letters. A normalized-looking string is not necessarily valid.
    if (/^INV[A-Z0-9]+$/.test(text)) change('INV-' + text.slice(3), 'insert-prefix-separator');
    const format = /^INV-\d{4,}$/.test(text) ? 'modern'
        : /^\d+$/.test(text) ? 'legacy'
            : /^(?:INV-?[A-Z0-9]*|[A-Z]{0,2}-?\d+)$/.test(text) ? 'incomplete' : 'unusable';
    return { formatNormalizedText: text, normalizationSteps: steps, format } as const;
}

// Global edit alignment: no fixed-index assumptions for insertion/deletion cases.
export function align(anchor: string, text: string): Array<{ anchorIndex: number | null; textIndex: number | null; insertionBefore: number | null }> {
    const d = Array.from({ length: anchor.length + 1 }, () => Array(text.length + 1).fill(0) as number[]);
    for (let i = 0; i <= anchor.length; i++) d[i][0] = i;
    for (let j = 0; j <= text.length; j++) d[0][j] = j;
    for (let i = 1; i <= anchor.length; i++) for (let j = 1; j <= text.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + Number(anchor[i - 1] !== text[j - 1]));
    const out: ReturnType<typeof align> = [];
    let i = anchor.length, j = text.length;
    while (i || j) {
        if (i && j && d[i][j] === d[i - 1][j - 1] + Number(anchor[i - 1] !== text[j - 1])) {
            out.push({ anchorIndex: --i, textIndex: --j, insertionBefore: null });
        } else if (i && d[i][j] === d[i - 1][j] + 1) out.push({ anchorIndex: --i, textIndex: null, insertionBefore: null });
        else out.push({ anchorIndex: null, textIndex: --j, insertionBefore: i });
    }
    return out.reverse();
}

function positionEvidence(anchor: string, observations: NormalizedObservation[]): PositionEvidence[] {
    const maps = observations.map(o => {
        const map = new Map<string, string | null>();
        const insertions = new Map<number, number>();
        for (const pair of align(anchor, o.formatNormalizedText)) {
            const offset = insertions.get(pair.insertionBefore ?? -1) ?? 0;
            const key = pair.anchorIndex === null ? `i:${pair.insertionBefore}:${offset}` : `a:${pair.anchorIndex}`;
            if (pair.anchorIndex === null) insertions.set(pair.insertionBefore!, offset + 1);
            map.set(key, pair.textIndex === null ? null : o.formatNormalizedText[pair.textIndex]);
        }
        return { o, map };
    });
    const keys = [...new Set(maps.flatMap(m => [...m.map.keys()]))].sort((a, b) => {
        const x = a.split(':'), y = b.split(':');
        return Number(x[1]) - Number(y[1]) || (x[0] === y[0] ? Number(x[2] ?? 0) - Number(y[2] ?? 0) : x[0] === 'i' ? -1 : 1);
    });
    return keys.map(key => {
        const groups = new Map<string | null, NormalizedObservation[]>();
        for (const { o, map } of maps) {
            const character = map.get(key) ?? null;
            groups.set(character, [...(groups.get(character) ?? []), o]);
        }
        return {
            anchorIndex: key.startsWith('a:') ? Number(key.split(':')[1]) : null,
            insertionBefore: key.startsWith('i:') ? Number(key.split(':')[1]) : null,
            alternatives: [...groups].map(([character, obs]) => {
                const recognizers = [...new Set(obs.map(o => o.recognizer))];
                return { character, observationIds: obs.map(o => o.id), recognizers, supportScore: recognizers.reduce((s, r) => s + WEIGHTS[r], 0) };
            }), disputed: groups.size > 1,
        };
    });
}

export function fuseInvoiceObservations(input: readonly RecognizerObservation[]): InvoiceFusion {
    if (!input.length) throw Error('Invoice fusion requires row-scoped observations');
    const first = input[0];
    const ids = new Set<string>();
    for (const o of input) {
        const c = o.cropReference, base = first.cropReference;
        if (!o.id || ids.has(o.id)) throw Error('Observation IDs must be unique');
        ids.add(o.id);
        if (o.fieldType !== 'invoice' || o.scope !== 'row') throw Error('Only row invoice evidence is accepted');
        if (!Object.hasOwn(WEIGHTS, o.recognizer)) throw Error('Unknown recognizer');
        if (!o.rowId || o.rowId !== first.rowId || c.rowId !== o.rowId || c.documentId !== base.documentId || c.sourceImageSha256 !== base.sourceImageSha256 || c.baseCropSha256 !== base.baseCropSha256)
            throw Error('Cross-row/document/crop evidence is forbidden');
        if (!c.path || ![c.sha256, c.baseCropSha256, c.sourceImageSha256].every(h => /^[a-f0-9]{64}$/.test(h))) throw Error('Missing optical provenance');
        if (!Number.isFinite(o.durationMs) || o.durationMs < 0 || o.rawText.length > 128) throw Error('Invalid observation');
        for (const score of [o.sequenceConfidence, ...(o.characterConfidences ?? [])])
            if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) throw Error('Invalid confidence');
    }
    const observations = input.map(o => ({ ...structuredClone(o), ...normalizeInvoice(o.rawText) }));
    const active = observations.filter(o => trusted.includes(o.recognizer));
    const byValue = new Map<string, NormalizedObservation[]>();
    for (const o of active) if (o.format === 'modern' || o.format === 'legacy')
        byValue.set(o.formatNormalizedText, [...(byValue.get(o.formatNormalizedText) ?? []), o]);
    const ranked = [...byValue].map(([value, obs]) => ({ value, obs, score: [...new Set(obs.map(o => o.recognizer))].reduce((s, name) => s + WEIGHTS[name], 0) }))
        .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
    const top = ranked[0]?.value ?? null;
    const anchor = top ?? active.find(o => o.recognizer === 'svtrv2')?.formatNormalizedText ?? active[0]?.formatNormalizedText ?? '';
    const positions = positionEvidence(anchor, active);
    const distinct = new Set(active.map(o => o.formatNormalizedText));
    const families = new Set(active.map(o => o.recognizer));
    const core = active.filter(o => o.recognizer === 'svtrv2' || o.recognizer === 'parseq');
    const coreAgrees = ['svtrv2', 'parseq'].every(name => core.some(o => o.recognizer === name)) && core.every(o => o.formatNormalizedText === top);
    const disputed = positions.filter(p => p.disputed).length;
    let ambiguityClass: AmbiguityClass;
    if (!top) ambiguityClass = active.some(o => o.format === 'incomplete') ? 'STRUCTURALLY_INCOMPLETE' : 'UNUSABLE';
    else if (coreAgrees && distinct.size === 1 && families.size === 3) ambiguityClass = 'EXACT_AGREEMENT';
    else if (coreAgrees) ambiguityClass = 'STRONG_AGREEMENT';
    else if (disputed) ambiguityClass = disputed === 1 ? 'ISOLATED_GLYPH_AMBIGUITY' : 'MULTI_GLYPH_AMBIGUITY';
    else ambiguityClass = 'STRUCTURALLY_INCOMPLETE';
    // A confidence score is not a probability of correctness. Uncalibrated model
    // probabilities never boost support; low scores only veto confidence.
    const weakFamilies = new Set(active.filter(o => (o.sequenceConfidence !== null && o.sequenceConfidence < 0.5) || o.characterConfidences?.some(c => c < 0.5)).map(o => o.recognizer));
    const visualWarnings = active.some(o => o.visualWarnings.length > 0);
    const sharedVisualAmbiguity = visualWarnings || weakFamilies.size >= 2 || (core.length >= 2 && !coreAgrees && disputed > 0);
    const confidentlySelected = !!top && coreAgrees && !sharedVisualAmbiguity && weakFamilies.size === 0;
    const reasons = [
        'Support scores are weighted visual agreement, not calibrated probabilities or business authorization.',
        ...(active.some(o => o.sequenceConfidence === null) ? ['Some model confidence values are unavailable; agreement cannot prove correctness.'] : []),
        ...(!coreAgrees ? ['Primary and secondary do not independently agree on a complete token.'] : []),
        ...(sharedVisualAmbiguity ? ['Shared visual uncertainty requires review; agreement is not certainty.'] : []),
        ...(weakFamilies.size ? ['Low observed confidence prevents confident selection.'] : []),
    ];
    const candidates: FusedFieldCandidate[] = ranked.map(r => ({
        fieldType: 'invoice', scope: 'row', rowId: first.rowId, documentId: first.cropReference.documentId,
        value: r.value, format: r.obs[0].format as 'modern' | 'legacy', sourceObservations: r.obs.map(o => o.id),
        normalizationSteps: [...new Set(r.obs.flatMap(o => o.normalizationSteps))], supportScore: r.score,
        ambiguityClass, competingCandidates: ranked.filter(other => other.value !== r.value).map(other => other.value), sharedVisualAmbiguity,
    }));
    return { contractVersion: 'phase4-offline-1', fieldType: 'invoice', scope: 'row', rowId: first.rowId,
        observations, candidates, topCandidate: top, ambiguityClass, positions, sharedVisualAmbiguity,
        confidence: { level: confidentlySelected ? 'supported-agreement' : top ? 'ambiguous' : 'insufficient', confidentlySelected, probability: null, reasons }, weights: WEIGHTS };
}
