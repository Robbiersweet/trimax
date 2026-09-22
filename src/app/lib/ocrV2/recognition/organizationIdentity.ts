import type { Bounds } from '../types.ts';

export type OrganizationObservation = {
  id: string; documentId: string; sourceImageHash: string; cropHash: string;
  sourceRegion: string; geometry: Bounds; regionType: 'property_name' | 'customer_name' | 'payor_name';
  recognizer: string; rawText: string; confidence: number | null; durationMs: number;
};
const mature = new Set(['svtrv2', 'parseq', 'ppocrv5']);
// Descriptors classify visible trailing text; they never complete the observed name.
const descriptors = ['apartments', 'holdings', 'properties', 'management', 'services', 'llc', 'inc', 'corporation', 'company'];
export const normalizeOrganizationText = (raw: string) => raw.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export function organizationDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + Number(a[i - 1] !== b[j - 1]));
    prev = next;
  }
  return prev[b.length];
}
function parse(raw: string) {
  const normalizedText = normalizeOrganizationText(raw), tokenSequence = normalizedText.split(' ').filter(Boolean);
  const compact = tokenSequence.join('');
  // Spaced observations establish boundaries. Joined observations may corroborate
  // exactly the same letters, but never invent a token boundary on their own.
  const last = tokenSequence.at(-1) ?? '';
  const descriptor = descriptors.find(d => last === d || (last.length >= 5 && last.length >= d.length - 3 && d.startsWith(last)));
  const stemTokens = descriptor ? tokenSequence.slice(0, -1) : tokenSequence;
  return { normalizedText, tokenSequence, compact, stem: stemTokens.join(' '), stemKey: stemTokens.join(''),
    descriptorEvidence: descriptor ? { observed: last, descriptorClass: descriptor, partial: last !== descriptor } : null };
}
function overlap(a: Bounds, b: Bounds) {
  const area = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return area / Math.min(a.width * a.height, b.width * b.height);
}
/** Visual-only consensus. No business snapshot, aliases, fixture labels or probabilities. */
export function fuseOrganizationIdentity(observations: OrganizationObservation[], expected: { documentId: string; sourceImageHash: string }) {
  const enriched = observations.map(o => ({ ...o, ...parse(o.rawText) }));
  const valid = enriched.filter(o => o.documentId === expected.documentId && o.sourceImageHash === expected.sourceImageHash &&
    ['property_name', 'customer_name', 'payor_name'].includes(o.regionType) && o.cropHash && o.sourceRegion &&
    Object.values(o.geometry).every(Number.isFinite) && o.geometry.width > 0 && o.geometry.height > 0 && o.geometry.left >= 0 && o.geometry.top >= 0);
  const groups = new Map<string, typeof valid>();
  for (const o of valid) { const key = `${o.cropHash}:${JSON.stringify(o.geometry)}:${o.recognizer}`; groups.set(key, [...(groups.get(key) ?? []), o]); }
  const contradictoryRerun = [...groups.values()].some(g => new Set(g.map(o => o.compact)).size > 1);
  const unique = [...groups.values()].filter(g => new Set(g.map(o => o.compact)).size === 1).map(g => g[0]);
  const regions: typeof unique = [];
  for (const o of unique) if (!regions.some(r => r.cropHash === o.cropHash || overlap(r.geometry, o.geometry) > 0.1)) regions.push(o);
  const regionKey = (o: typeof unique[number]) => regions.findIndex(r => r.cropHash === o.cropHash || overlap(r.geometry, o.geometry) > 0.1);
  const candidates = [...new Map(unique.filter(o => o.descriptorEvidence && o.stemKey.length >= 3 && /^[\p{L} ]+$/u.test(o.stem)).map(o => [`${o.stemKey}:${o.descriptorEvidence?.descriptorClass}`, o])).values()].map(seed => {
    const votes = unique.filter(o => mature.has(o.recognizer) &&
      (o.stemKey === seed.stemKey && o.descriptorEvidence?.descriptorClass === seed.descriptorEvidence?.descriptorClass || o.compact === seed.compact));
    const engines = [...new Set(votes.map(o => o.recognizer))];
    const supportedEngines = engines.filter(engine => new Set(votes.filter(o => o.recognizer === engine).map(regionKey)).size >= 2);
    return { stem: seed.stem, stemKey: seed.stemKey, observedText: seed.normalizedText, descriptorEvidence: seed.descriptorEvidence,
      engines, supportedEngines, regions: [...new Set(votes.map(regionKey))], provenance: votes.map(o => o.id) };
  });
  const supported = candidates.filter(c => c.stemKey.length >= 6 && c.supportedEngines.length >= 2 && c.regions.length >= 2);
  const winner = supported.length === 1 ? supported[0] : null;
  // A second independently supported stem always blocks. A one-engine isolated
  // glyph disagreement stays visible, but cannot override two agreeing engines.
  const competing = winner ? candidates.filter(c => c.stemKey !== winner.stemKey && (c.engines.length >= 2 || organizationDistance(c.stemKey, winner.stemKey) > 1)) : candidates;
  const unexplained = winner ? unique.filter(o => mature.has(o.recognizer) && !o.compact.startsWith(winner.stemKey) &&
    !(o.descriptorEvidence && organizationDistance(o.stemKey, winner.stemKey) <= 1)) : [];
  const unexplainedConflict = [...new Set(unexplained.map(o => o.compact))].some(key => {
    const own = unexplained.filter(o => o.compact === key);
    return new Set(own.map(o => o.recognizer)).size >= 2 && new Set(own.map(regionKey)).size >= 2;
  });
  const authoritative = !!winner && !contradictoryRerun && !competing.length && !unexplainedConflict;
  return { version: 'organization-consensus-1', authority: authoritative ? 'authoritative' as const : candidates.length ? 'ambiguous' as const : 'unknown' as const,
    value: authoritative ? winner.stem : null, consensusStem: winner?.stem ?? null, descriptorEvidence: winner?.descriptorEvidence ?? null,
    unexplainedCandidates: unexplained.map(o => ({ id: o.id, rawText: o.rawText })),
    reason: authoritative ? 'Two mature recognizers independently repeat the exact distinctive stem across nonoverlapping labeled regions; descriptor remains observed text' : contradictoryRerun ? 'Contradictory observations for the same recognizer and crop' : unexplainedConflict || competing.length > 1 ? 'Competing organization stems' : 'Insufficient independent repeated organization evidence',
    candidates, competingCandidates: competing, independentRegions: regions.length, deduplicatedObservations: unique.length, observations: enriched,
    alignments: winner ? unique.map(o => {
      const letters = o.compact === winner.observedText.replaceAll(' ', '') ? winner.stemKey : o.stemKey;
      let sharedPrefixLength = 0;
      while (sharedPrefixLength < Math.min(letters.length, winner.stemKey.length) && letters[sharedPrefixLength] === winner.stemKey[sharedPrefixLength]) sharedPrefixLength++;
      const editDistance = organizationDistance(letters, winner.stemKey);
      return { id: o.id, editDistance, sharedPrefixLength, exactStem: letters === winner.stemKey,
        characterAgreement: 1-editDistance/Math.max(letters.length,winner.stemKey.length,1),
        matchingStemTokens: winner.stem.split(' ').filter(t=>o.tokenSequence.includes(t)), scoreIsProbability: false };
    }) : [] };
}
