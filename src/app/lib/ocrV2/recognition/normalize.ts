import type { FieldType } from './types.ts';
/** Formatting only. Never insert digits, a prefix, a hyphen, or resolve glyph ambiguity. */
export function normalizeField(raw: string, field: FieldType) {
    let text = raw;
    const transformations: string[] = [];
    const step = (name: string, next: string) => { if (next !== text)
        transformations.push(name); text = next; };
    step('trim/collapse whitespace', text.trim().replace(/\s+/g, ' '));
    step('standardize Unicode hyphens', text.replace(/[‐‑‒–—−]/g, '-'));
    if (field === 'invoice' || field === 'unit')
        step('uppercase', text.toUpperCase());
    const ambiguities = [...new Set(text.match(/[O0IL1S5]/g) ?? [])].map(g => `${g}: possible glyph-family ambiguity; not substituted`);
    const moneyCandidates: {
        text: string;
        cents: number;
    }[] = [];
    // Require complete decimal money tokens. No partial substring rescue inside corrupt tokens.
    for (const token of text.split(/\s+/)) {
        if (!/^\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(token))
            continue;
        const [whole, fraction] = token.replace(/[$,]/g, '').split('.');
        const cents = Number(whole) * 100 + Number(fraction);
        if (Number.isSafeInteger(cents))
            moneyCandidates.push({ text: token, cents });
    }
    const candidates = field === 'invoice' || field === 'unit' ? text.split(/\s+/).filter(t => /^[A-Z0-9-]+$/.test(t) && /\d/.test(t)) : [];
    const dateCandidates = [...text.matchAll(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{4}\b/g)].map(m => m[0]);
    const checkCandidates = field === 'header' ? [...text.matchAll(/\b(?:CHECK|CK|CHK)(?:\s*(?:NO|NUMBER))?\s*[#:.]?\s*(\d+)\b/gi)].map(m => m[1]) : [];
    return { normalizedText: text, transformations, ambiguities, candidates, moneyCandidates, checkCandidates, dateCandidates };
}
