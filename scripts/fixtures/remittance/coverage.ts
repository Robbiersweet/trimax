export type GoldenCoverage = { id: string; physicalTruthComplete?: boolean };
export function goldenCoverageBlockers(fixtures: GoldenCoverage[]) {
  return ["A", "B", "C", "D"].filter(id => !fixtures.some(fixture => fixture.id === id && fixture.physicalTruthComplete))
    .map(id => `Required physical fixture ${id} has no complete verified expected-value record.`);
}
