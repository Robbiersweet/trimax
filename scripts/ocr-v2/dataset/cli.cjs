/* eslint-disable @typescript-eslint/no-require-imports -- Private offline dataset CLI. */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict'), sharp = require('sharp');
const c = require('./core.cjs');
const [command, configFile, ...args] = process.argv.slice(2);
const config = c.read(configFile);
c.rejectSecrets(config);
const safe = file => c.privatePath(config, file), read = file => c.read(safe(file)), write = (file, v) => c.write(safe(file), v);
const commit = () => cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.repository, encoding: 'utf8' }).trim();
const token = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function freeze(manifest, file) { c.validate(manifest, config, true); assert(!fs.existsSync(file), 'Version already exists; create a new version'); manifest.counts = { documents: manifest.records.length, independentDocuments: new Set(manifest.records.map(r => r.independentDocumentId)).size, verifiedRows: manifest.records.reduce((n, r) => n + (r.verifiedTruth?.rows.length || 0), 0), splitDocuments: Object.fromEntries(['train', 'validation', 'development', 'holdout'].map(split => [split, new Set(manifest.records.filter(r => r.split === split).map(r => r.independentDocumentId)).size])) }; const ledgerFile=safe(config.splitLedgerFile||path.join(path.dirname(file),'split-ledger.json'));const ledger=c.enforceFrozenSplits(manifest.records,fs.existsSync(ledgerFile)?read(ledgerFile):{});manifest.manifestHash = c.digest(manifest); write(file, manifest);write(ledgerFile,ledger); return manifest; }
function load(file) { const m = read(file), { manifestHash, ...body } = m; assert.equal(c.digest(body), manifestHash, 'Frozen manifest modified'); c.validate(m, config, true); return m; }
async function discover() {
    const directory = safe(args[0]), sources = [];
    async function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = safe(path.join(dir, entry.name));
        if (entry.isSymbolicLink())
            continue;
        if (entry.isDirectory())
            await visit(file);
        else if (/\.(jpe?g|png|tiff?|webp)$/i.test(file)) {
            const bytes = fs.readFileSync(file), small = await sharp(bytes).resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer(), mean = small.reduce((a, b) => a + b, 0) / small.length;
            sources.push({ imageReference: file, sourceDocumentId: c.hash(bytes), imageHash: c.hash(bytes), provenance: { source: 'local-retained-directory', discoveredIn: directory }, perceptualReviewHint: [...small].map(v => v >= mean ? '1' : '0').join(''), verificationStatus: 'requires-annotation' });
        }
    } }
    await visit(directory);
    write(args[1], sources);
    console.log('Discovered', sources.length, 'images; no labels inferred.');
}
async function importTruth() {
    const manifest = load(args[0]), bundle = read(args[1]);
    assert.equal(bundle.purpose, 'verified-dataset-labels');
    assert(bundle.verifiedBy && bundle.verifiedAt && bundle.sourceExportHash, 'Verification provenance required');
    const records = manifest.records.map(r => { const item = bundle.documents.find(d => d.independentDocumentId === r.independentDocumentId); if (!item)
        return r; assert.equal(item.imageHash, r.imageHash, 'Truth must bind to exact capture'); assert.equal(item.businessTruthVerified, true); return { ...r, verificationStatus: 'verified', verifiedTruth: { ...item.truth, provenance: { verifiedBy: bundle.verifiedBy, verifiedAt: bundle.verifiedAt, sourceExportHash: bundle.sourceExportHash } }, trainingOptIn: item.trainingOptIn === true }; });
    const { manifestHash: priorHash, ...next } = manifest;
    next.records = records;
    next.version = args[3];
    next.parentManifestHash = priorHash;
    next.codeCommit = commit();
    freeze(next, args[2]);
}
async function ingest() {
    const sources = read(args[0]);
    assert(Array.isArray(sources));
    const records = [];
    for (const source of sources) {
        const file = safe(source.imageReference), bytes = fs.readFileSync(file), metadata = await sharp(bytes).metadata();
        records.push({ ...source, fixtureId: source.fixtureId || 'image-' + c.hash(bytes).slice(0, 20), sourceDocumentId: source.sourceDocumentId || c.hash(bytes), imageHash: c.hash(bytes), dimensions: [metadata.width, metadata.height], verificationStatus: source.verifiedTruth ? 'verified' : 'requires-annotation', verifiedTruth: source.verifiedTruth || null, trainingOptIn: source.trainingOptIn === true, provenance: source.provenance || { source: 'local-discovery' } });
    }
    const grouped = c.groupRecords(records).filter(r => !r.exactDuplicate).map(r => ({ ...r, split: c.splitFor(r.independentDocumentId, config.seed, config.frozenSplits || {}) }));
    freeze({ schemaVersion: 1, version: args[2], labelsPurpose: 'scoring-only', seed: config.seed, codeCommit: commit(), frozenHoldouts: Object.entries(config.frozenSplits || {}).filter(([, v]) => v === 'holdout').map(([k]) => k), records: grouped }, safe(args[1]));
}
async function bootstrap() {
    const root = config.researchRoot, r = f => read(path.join(root, f));
    const sources = [...r('generalization-v1/development-originals.json'), ...r('generalization-v1/holdout-originals.json')];
    const truth = r('generalization-v1/ground-truth.json').documents, headers = r('phase5b/header-scoring.json').documents;
    const snapshots = r('phase5/resolver-evidence.json'), audit = r('inventory/live-history-audit.json'), harvest = r('pilot-v1/harvest/harvest-audit.json');
    const records = sources.map(s => {
        const t = truth.find(t => t.id === s.id), h = headers.find(h => h.id === s.id), imageHash = c.hash(fs.readFileSync(safe(s.original))), attachment = harvest.attachments.find(a => String(a.sha256).toLowerCase() === imageHash), snapshot = snapshots.find(x => x.document.id === s.id).snapshot;
        return { fixtureId: s.id, sourceDocumentId: s.id, sourcePaymentId: null, sourceAttachmentId: attachment?.attachmentId || null, sourceAttemptId: null, independentDocumentId: s.id, captureId: 'capture-' + imageHash, imageReference: s.original, imageHash, documentTemplate: t.templateClass, verificationStatus: 'verified', split: ['B', 'C'].includes(s.id) ? 'holdout' : 'development', trainingOptIn: false, tags: ['historically-exposed', 'canonical-research-image'], provenance: { annotation: 'generalization-v1/ground-truth.json', headers: 'phase5b/header-scoring.json', snapshot: 'phase5/resolver-evidence.json', historicalExposure: 'B/C are frozen research holdouts; previously examined, not unseen test data' }, verifiedTruth: { provenance: 'Prior manually verified optical annotations and read-only transaction snapshot; labels only', rows: t.rows.map((row, i) => { const invoice = snapshot.invoices.find(x => token(x.displayId) === token(row.invoice)); return { rowId: s.id + '-' + i, invoiceNumber: row.invoice, invoiceRecordId: invoice?.id || null, unit: invoice?.unit || null, amountCents: row.amountCents }; }), authoritativeTotalCents: t.totalCents, checkNumber: h.check, checkDate: h.date, payor: null }, annotations: t };
    });
    const manifest = { schemaVersion: 1, version: args[1] || 'trimax-ocr-real-v1', labelsPurpose: 'scoring-only', seed: config.seed, codeCommit: commit(), frozenHoldouts: ['B', 'C'], records, metadataOnlyRecaptures: audit.entries.filter(e => e.physicalDocumentGroup === 'fixture-b-document').map(e => ({ independentDocumentId: 'B', captureId: e.attemptId, sourceAttemptId: e.attemptId, split: 'holdout', images: e.images, localImageReference: null, provenance: audit.verification })), inventoryProvenance: { physicalAttemptsWithPixels: audit.physicalAttemptsWithPixels, remoteImagesAtAudit: audit.physicalImages, source: 'inventory/live-history-audit.json', scope: 'Historical retained audit; remote availability not rechecked' } };
    freeze(manifest, safe(args[0]));
}
function toWSL(file) { return config.pathMappings.reduce((result, m) => result || (path.resolve(file).toLowerCase().startsWith(path.resolve(m.windows).toLowerCase() + path.sep) ? m.wsl + '/' + path.relative(m.windows, file).replaceAll('\\', '/') : null), null) || (() => { throw Error('No WSL mapping for ' + file); })(); }
async function benchmark() {
    const manifest = load(args[0]), out = safe(args[1]);
    assert(!fs.existsSync(out), 'Fresh benchmark output required');
    fs.mkdirSync(out, { recursive: true });
    // Export only the allowlisted inputs before any recognition. The worker never reads labels.
    const canonicalByDocument=new Map();for(const record of [...manifest.records].sort((a,b)=>Number(b.tags?.includes('canonical-research-image')||false)-Number(a.tags?.includes('canonical-research-image')||false)||a.fixtureId.localeCompare(b.fixtureId)))if(!canonicalByDocument.has(record.independentDocumentId))canonicalByDocument.set(record.independentDocumentId,record);const canonicalRecords=[...canonicalByDocument.values()]; const inference = canonicalRecords.map(c.inferenceRecord);
    write(path.join(out, 'inference.json'), inference);
    const { normalizeDocument } = require('../../../src/app/lib/ocrV2/documentNormalization.ts');
    const { structuralLayout } = require('../../../src/app/lib/ocrV2/layout/generalized.ts');
    const { recognizePaymentEvidence } = require('../../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
    const { recognizeDocumentTotal } = require('../../../src/app/lib/ocrV2/recognition/documentTotalAuthority.ts');
    const { loadRetainedPaymentFields } = require('../retained-payment-fields.cjs');
    const phase5eEnabled = args.includes('--phase5e'), phase5dEnabled = args.includes('--phase5d') || phase5eEnabled, phase5cEnabled = args.includes('--phase5c') || phase5dEnabled;
    const { replayDocumentSemantics } = require('../../../src/app/lib/ocrV2/semantics/replay.ts');
    const { EvidenceLedger } = require('../../../src/app/lib/ocrV2/recognition/evidenceLedger.ts');
    const { recognizeDocumentIdentity } = require('../../../src/app/lib/ocrV2/recognition/documentIdentity.ts');
    const { preservePaymentEvidence } = require('../../../src/app/lib/ocrV2/recognition/preservePaymentEvidence.ts');
    const { loadIdentityRetained, appendFrozenInvoiceEvidence } = require('../identity-retained.cjs');
    const ledgers = new Map();
    const { fuseInvoiceObservations } = require('../../../src/app/lib/ocrV2/fusion/index.ts');
    const { resolveOfflineDocument } = require('../../../src/app/lib/ocrV2/resolver/index.ts');
    const snapshots = read(config.snapshotFile), pipelines = [], inputs = [];
    const started = performance.now();
    for (const item of inference) {
        const begin = performance.now(), dir = path.join(out, item.fixtureId);
        fs.mkdirSync(dir);
        const normalized = await normalizeDocument(fs.readFileSync(item.imageReference)), layout = await structuralLayout(normalized.documentColor);
        fs.writeFileSync(path.join(dir, 'document.png'), normalized.documentColor);
        const crops = [];
        async function crop(name, bounds) { if (!bounds)
            return; const bytes = await sharp(normalized.documentColor).extract(bounds).png().toBuffer(), file = item.fixtureId + '/' + name + '.png'; fs.writeFileSync(path.join(out, file), bytes); crops.push({ name, file, bounds, sha256: c.hash(bytes) }); return crops.at(-1); }
        for (let i = 0; i < layout.rows.length; i++) {
            const row = layout.rows[i];
            await crop('row-' + i, row.bounds);
            await crop('amount-' + i, row.amountRegion);
            const inv = await crop('invoice-' + i, row.invoiceRegion);
            if (inv)
                inputs.push({ id: item.fixtureId + '-' + i, documentId: item.fixtureId, file: inv.file, sha256: inv.sha256 });
        }
        await crop('header', layout.headerRegion);
        await crop('footer', layout.totalCandidateRegion);
        const phase5b = await recognizePaymentEvidence(normalized.documentColor, layout, item.fixtureId);
        const phase5c = phase5cEnabled ? await recognizeDocumentTotal(normalized.documentColor, layout, phase5b, loadRetainedPaymentFields(config, config.phase5cRetainedFile, item.fixtureId, normalized.documentColor)) : null;
        let phase5d = null;
        if (phase5dEnabled) {
            const phaseStart = performance.now(), ledger = new EvidenceLedger(path.basename(out) + ':' + item.fixtureId, item.fixtureId, c.hash(normalized.documentColor));
            ledgers.set(item.fixtureId, ledger);
            const replay = await preservePaymentEvidence(normalized.documentColor, layout, phase5c.evidence, loadIdentityRetained(config, config.researchRoot, item.fixtureId, normalized.documentColor, phase5c), ledger);
            const identity = await recognizeDocumentIdentity(normalized.documentColor, layout, item.fixtureId, ledger);
            replay.evidence.payor = identity.payor;
            phase5d = { replay, identity, ledger: ledger.snapshot(), incrementalMs: performance.now() - phaseStart };
        }
        const phase5e = phase5eEnabled ? replayDocumentSemantics(layout, phase5d.replay, phase5d.identity, phase5d.ledger) : null;
        const payment = structuredClone(phase5d?.replay.evidence ?? phase5c?.evidence ?? phase5b);
        if (phase5e) { payment.payor = phase5e.identity.value; payment.authoritativeTotal = phase5e.total.cents; }
        const pipeline = { id: item.fixtureId, sourceHash: c.hash(normalized.documentColor), normalization: normalized.evidence, layout, crops, payment, phase5c, phase5d, phase5e, preRecognitionMs: performance.now() - begin };
        pipelines.push(pipeline);
        write(path.join(dir, 'pipeline.json'), pipeline);
        console.log('Processed', item.fixtureId, layout.rows.length, 'rows');
    }
    write(path.join(out, 'inputs.json'), inputs);
    const recStart = performance.now(), child = cp.spawnSync('wsl', ['-d', config.wslDistribution, '--', 'env', 'HF_HUB_OFFLINE=1', config.python, toWSL(path.join(__dirname, 'recognize.py')), toWSL(out)], { encoding: 'utf8', timeout: 600000, maxBuffer: 5000000 });
    write(path.join(out, 'worker-log.json'), { stdout: child.stdout, stderr: child.stderr, status: child.status });
    assert.equal(child.status, 0, 'Recognizer failed; inspect private worker log');
    const recognition = read(path.join(out, 'recognition.json'));
    assert.equal(recognition.schemaVersion, 1);
    const decisions = [];
    for (const p of pipelines) {
        const rows = p.layout.rows.map((row, i) => { const rowId = p.id + '-' + i, obs = recognition.observations.filter(x => x.id === rowId && ['svtr', 'parseq', 'ppocr'].includes(x.recognizer)).map(o => ({ id: o.recognizer + ':' + rowId, fieldType: 'invoice', scope: 'row', rowId, recognizer: { svtr: 'svtrv2', parseq: 'parseq', ppocr: 'ppocrv5' }[o.recognizer], rawText: o.raw, sequenceConfidence: null, characterConfidences: null, confidenceCalibrated: false, cropReference: { documentId: p.id, rowId, sourceImageSha256: p.sourceHash, baseCropSha256: o.sha256, sha256: o.sha256, path: o.file, variant: 'native' }, durationMs: o.ms, visualWarnings: [] })); const ev = p.payment.rows.find(r => r.rowId === rowId); const fusionStart=performance.now(),fusion=fuseInvoiceObservations(obs),fusionMs=performance.now()-fusionStart; return { rowId, fusion, fusionMs, geometry: { ...row.bounds, coordinateSpace: p.layout.coordinateSpace, sourceHash: p.sourceHash }, amounts: ev?.cents == null ? [] : ev.observations.filter(o => ev.provenance.includes(o.id)).map(o => ({ cents: ev.cents, raw: o.raw, observationId: o.id, rowId })), units: [], accountCandidates: [] }; });
        const payment = p.payment, snapshot = snapshots.find(x => x.document.id === p.id)?.snapshot;
        if (phase5dEnabled) { const ledger = ledgers.get(p.id); appendFrozenInvoiceEvidence(ledger, { id: p.id, rows }); p.phase5d.ledger = ledger.snapshot(); write(path.join(out, p.id, 'pipeline.json'), p); }
        const resolved = snapshot ? resolveOfflineDocument({ id: p.id, rows, rawPasses: [], header: { payor: payment.payor, checkNumber: payment.checkNumber, checkDate: payment.checkDate, total: payment.authoritativeTotal == null ? null : { amount: payment.authoritativeTotal / 100, source: 'explicit-document-total', payable: true }, provenance: 'Offline optical evidence only' } }, snapshot) : null;
        decisions.push({ id: p.id, rows, resolved });
    }
    write(path.join(out, 'unscored-decisions.json'), decisions);
    // Labels enter only here, after all recognition/fusion/resolution has completed.
    const scorecards = canonicalRecords.map(r => {
        const p = pipelines.find(p => p.id === r.fixtureId), d = decisions.find(d => d.id === r.fixtureId), truth = r.verifiedTruth;
        if (!truth)
            return { id: r.fixtureId, unlabeled: true, fullSuccess: false };
        const models = {};
        for (const name of ['generic', 'pilot', 'ppocr', 'svtr', 'parseq', 'fusion'])
            models[name] = truth.rows.map((row, i) => { const obs = recognition.observations.find(o => o.id === r.fixtureId + '-' + i && o.recognizer === name); const raw = name === 'fusion' ? d.rows[i]?.fusion.topCandidate : obs?.raw; return { ...c.editMetrics(token(row.invoiceNumber), token(raw)), raw: raw || '', ms: name === 'fusion' ? d.rows[i]?.fusionMs ?? null : obs?.ms ?? null }; });
        const fields = { amounts: truth.rows.map((row, i) => ({ expected: row.amountCents, actual: p.payment.rows[i]?.cents ?? null, exact: row.amountCents === p.payment.rows[i]?.cents, ambiguity: p.payment.rows[i]?.ambiguity || 'missing' })) };
        for (const [key, actual] of Object.entries({ authoritativeTotalCents: p.payment.authoritativeTotal, checkNumber: p.payment.checkNumber, checkDate: p.payment.checkDate, payor: p.payment.payor }))
            fields[key] = { expected: truth[key] ?? null, actual: actual ?? null, exact: truth[key] == null ? null : truth[key] === actual, missing: actual == null, unlabeled: truth[key] == null };
        const invoiceExact = models.fusion.filter(x => x.exact).length, amountExact = fields.amounts.filter(x => x.exact).length;
        const wrongAutomatic = (d.resolved?.automaticInvoiceIds || []).filter((id, i) => id !== truth.rows[i]?.invoiceRecordId).length;
        return { id: r.fixtureId, rows: truth.rows.length, models, invoiceExact, amountExact, wrongAutomatic, fields, layout: r.annotations ? c.geometryScore(p.layout, r.annotations) : null, resolverStatus: d.resolved?.status || 'snapshot-unavailable', automaticRows: d.resolved?.automaticInvoiceIds.length || 0, fullSuccess: invoiceExact === truth.rows.length && amountExact === truth.rows.length && fields.authoritativeTotalCents.exact === true && (d.resolved?.automaticInvoiceIds.length === truth.rows.length), processingMs: p.preRecognitionMs + recognition.observations.filter(o => o.documentId === r.fixtureId).reduce((s, o) => s + o.ms, 0) };
    });
    const report = { schemaVersion: 1, datasetVersion: manifest.version, manifestHash: manifest.manifestHash, codeCommit: commit(), toolHashes:Object.fromEntries(['cli.cjs','core.cjs','gate.cjs','recognize.py'].map(file=>[file,c.hash(fs.readFileSync(path.join(__dirname,file)))])), modelVersions: recognition.versions, adapterHash: c.hash(fs.readFileSync(path.join(__dirname, '../training/phase3e_benchmark.py'))), scorecards, totalPipelineMs: performance.now() - started, recognizerBatchMs: performance.now() - recStart, aggregate: { documents: scorecards.length, rows: scorecards.reduce((s, r) => s + (r.rows || 0), 0), invoiceExact: scorecards.reduce((s, r) => s + (r.invoiceExact || 0), 0), amountExact: scorecards.reduce((s, r) => s + (r.amountExact || 0), 0), totalExact: scorecards.filter(r => r.fields?.authoritativeTotalCents.exact).length, fullSuccess: scorecards.filter(r => r.fullSuccess).length, manualReview: scorecards.filter(r => !r.fullSuccess).length } };
    report.aggregate.invoiceExactPercent = 100 * report.aggregate.invoiceExact / report.aggregate.rows;
    report.aggregate.amountExactPercent = 100 * report.aggregate.amountExact / report.aggregate.rows;
    report.aggregate.totalExactPercent = 100 * report.aggregate.totalExact / report.aggregate.documents;
    report.aggregate.fullSuccessPercent = 100 * report.aggregate.fullSuccess / report.aggregate.documents;
    report.aggregate.manualReviewPercent = 100 * report.aggregate.manualReview / report.aggregate.documents;
    report.aggregate.averageDocumentMs = scorecards.reduce((s, r) => s + (r.processingMs || 0), 0) / scorecards.length;
    report.modelMetrics = Object.fromEntries(['generic', 'pilot', 'ppocr', 'svtr', 'parseq', 'fusion'].map(name => { const rows = scorecards.flatMap(r => r.models?.[name] || []), sum = key => rows.reduce((s, r) => s + r[key], 0), characters = sum('characters'), edits = sum('cost'); return [name, { exact: rows.filter(r => r.exact).length, count: rows.length, cer: edits / characters, characterAccuracy: Math.max(0, 1 - edits / characters), insertions: sum('insertions'), deletions: sum('deletions'), substitutions: sum('substitutions'), recognitionMs: sum('ms') }]; }));
    write(path.join(out, 'report.json'), report);
    console.log(JSON.stringify(report.aggregate));
    if (args[2] && !args[2].startsWith('--'))
        gate(read(args[2]), report);
}
function gate(base, next) { require('./gate.cjs')(base, next); console.log('Offline regression gate PASS'); }
(async () => { if (command === 'bootstrap')
    await bootstrap();
else if (command === 'ingest')
    await ingest();
else if (command === 'discover')
    await discover();
else if (command === 'import-truth')
    await importTruth();
else if (command === 'benchmark')
    await benchmark();
else if (command === 'validate')
    console.log(c.validate(load(args[0]), config, true));
else if (command === 'compare')
    gate(read(args[0]), read(args[1]));
else
    throw Error('Commands: bootstrap, ingest, validate, benchmark, compare'); })().catch(e => { console.error(e); process.exitCode = 1; });
