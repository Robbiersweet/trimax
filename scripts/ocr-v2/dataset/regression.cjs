/* eslint-disable @typescript-eslint/no-require-imports -- Offline dataset contract tests. */
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const c = require('./core.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trimax-dataset-test-')), repo = path.resolve(__dirname, '../../..'), config = { repository: repo, privateRoots: [root] };
const image = path.join(root, 'image.png');
fs.writeFileSync(image, 'sanitized test bytes');
const record = { fixtureId: 'sample', captureId: 'capture', sourceDocumentId: 'sample', independentDocumentId: 'sample', imageReference: image, imageHash: c.hash(fs.readFileSync(image)), provenance: { source: 'test' }, split: 'holdout', verificationStatus: 'requires-annotation', verifiedTruth: null };
const manifest = { schemaVersion: 1, version: 'trimax-ocr-test-v1', labelsPurpose: 'scoring-only', frozenHoldouts: ['sample'], records: [record] };
let suites = 0;
function test(name, fn) { fn(); suites++; console.log('PASS', name); }
test('Manifest and draft handling', () => { c.validate(manifest, config, true); assert.throws(() => c.validate({ ...manifest, records: [{ ...record, verificationStatus: 'verified' }] }, config)); });
test('Exact dedupe and independent separation', () => { const rows = c.groupRecords([record, { ...record, fixtureId: 'copy' }, { ...record, fixtureId: 'other', imageHash: 'a'.repeat(64), independentDocumentId: 'other' }]); assert.equal(rows[1].exactDuplicate, true); assert.equal(rows[0].independentDocumentId, rows[1].independentDocumentId); assert.notEqual(rows[0].independentDocumentId, rows[2].independentDocumentId); });
test('Verified recapture grouping', () => { const rows = c.groupRecords([record, { ...record, fixtureId: 'recapture', imageHash: 'b'.repeat(64), independentDocumentId: 'other' }].map(r => ({ ...r, verifiedPhysicalDocumentId: 'verified-doc' }))); assert.equal(rows[0].independentDocumentId, rows[1].independentDocumentId); });
test('Stable splits and frozen holdouts', () => { assert.equal(c.splitFor('x', 'seed'), c.splitFor('x', 'seed')); assert.equal(c.splitFor('x', 'changed', { x: 'holdout' }), 'holdout'); });
test('Recapture and augmentation leakage', () => { assert.throws(() => c.validate({ ...manifest, records: [record, { ...record, fixtureId: 'leak', imageHash: 'b'.repeat(64), split: 'train' }] }, config)); assert.throws(() => c.validate({ ...manifest, records: [{ ...record, augmentationOf: 'missing' }] }, config)); });
test('Private paths and credentials', () => { assert.throws(() => c.privatePath(config, path.join(repo, 'public', 'private.png'))); assert.throws(() => c.privatePath(config, path.join(root, '..', 'outside.png'))); assert.throws(() => c.rejectSecrets({ apiKey: 'not-real' })); assert.throws(() => c.rejectSecrets({ url: 'https://example.test/a?token=not-real' })); });
test('Hash canonicalization and byte integrity', () => { assert.equal(c.digest({ a: 1, b: 2 }), c.digest({ b: 2, a: 1 })); assert.notEqual(c.digest({ a: 1 }), c.digest({ a: 2 })); assert.throws(() => c.validate({ ...manifest, records: [{ ...record, imageHash: 'a'.repeat(64) }] }, config, true)); });
test('Labels cannot enter inference export', () => { const input = c.inferenceRecord({ ...record, verifiedTruth: { rows: ['private'] }, annotations: { label: 'private' } }); assert.deepEqual(Object.keys(input).sort(), ['captureId', 'fixtureId', 'imageHash', 'imageReference']); assert(!JSON.stringify(input).includes('private')); });
test('Edit counts and CER', () => { assert.equal(c.editMetrics('ABC', 'ABC').exact, true); assert.equal(c.editMetrics('ABC', 'AXC').substitutions, 1); assert.equal(c.editMetrics('ABC', 'AB').deletions, 1); assert.equal(c.editMetrics('ABC', 'ABCD').insertions, 1); assert.equal(c.editMetrics('ABC', '').cer, 1); });
test('Geometry completeness and missing crops', () => { const box = { left: 0, top: 0, width: 10, height: 10 }, truth = { rows: [{ bounds: box, invoiceBounds: box, amountBounds: box }] }; assert.equal(c.geometryScore({ rows: [{ bounds: box, invoiceRegion: box, amountRegion: box }] }, truth).rows[0].invoiceCompleteness, 1); assert.equal(c.geometryScore({ rows: [] }, truth).rows[0].missing, true); });
test('Disabled intake requires verified owner opt-in', () => { assert.throws(() => c.intake({ role: 'member' })); const intake = c.intake({ role: 'owner', paymentVerified: true, datasetOptIn: true, canonicalDocumentId: 'sample', imageReference: image, verifiedTruth: { provenance: 'test' } }); assert.equal(intake.productionEnabled, false); assert.equal(intake.trainingOptIn, false); });
test('Regression gate catches individual failures', () => { const gate = require('./gate.cjs'), base = { manifestHash: 'same', modelVersions: { model: '1' }, scorecards: [{ id: 'sample', models: { generic: [{ exact: true, cost: 0 }] }, invoiceExact: 1, amountExact: 1, fields: { amounts: [{ actual: 100, exact: true }] } }] }; assert(gate(base, structuredClone(base)).pass); const broken = structuredClone(base); broken.scorecards[0].models.generic[0] = { exact: false, cost: 1 }; assert.throws(() => gate(base, broken)); assert.throws(() => gate(base, { ...base, manifestHash: 'changed' })); });
test('Unsafe IDs cannot escape batch output', () => assert.throws(() => c.validate({ ...manifest, records: [{ ...record, fixtureId: '../escape' }] }, config)));
if (process.argv[2])
    test('Real batch/schema covers every manifest document and crop', () => { const dir = process.argv[2], inputs = c.read(path.join(dir, 'inputs.json')), recognition = c.read(path.join(dir, 'recognition.json')), report = c.read(path.join(dir, 'report.json')); assert.equal(recognition.schemaVersion, 1); assert.equal(inputs.length, report.aggregate.rows); assert.equal(recognition.observations.length, inputs.length * 5); for (const input of inputs) {
        assert.deepEqual(Object.keys(input).sort(), ['documentId', 'file', 'id', 'sha256']);
        assert.equal(c.hash(fs.readFileSync(path.join(dir, input.file))), input.sha256);
    } for (const score of report.scorecards) {
        const pipeline = c.read(path.join(dir, score.id, 'pipeline.json'));
        assert.equal(pipeline.layout.rows.length, score.rows);
        assert(pipeline.crops.some(x => x.name === 'header'));
        assert(pipeline.crops.some(x => x.name === 'footer'));
    } });
console.log(`${suites} dataset contract suites passed; private test directory ${root}`);
