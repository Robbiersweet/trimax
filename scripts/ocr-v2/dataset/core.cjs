/* eslint-disable @typescript-eslint/no-require-imports -- Offline dataset utilities. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const splits = ['train', 'validation', 'development', 'holdout'];
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = value => hash(canonical(value));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); };
function resolved(file) {
    let parent = path.resolve(file), tail = [];
    while (!fs.existsSync(parent)) {
        tail.unshift(path.basename(parent));
        const next = path.dirname(parent);
        assert.notEqual(next, parent);
        parent = next;
    }
    return path.resolve(fs.realpathSync(parent), ...tail);
}
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
function privatePath(config, file) {
    const actual = resolved(file), repo = resolved(config.repository);
    assert(!inside(repo, actual), 'Private artifacts cannot be inside the repository');
    assert(config.privateRoots.some(root => inside(resolved(root), actual)), 'Path is outside configured private roots');
    assert(!actual.split(/[\\/]/).some(x => ['public', 'wwwroot'].includes(x.toLowerCase())), 'Public artifact directory prohibited');
    return file;
}
function rejectSecrets(value) {
    if (!value || typeof value !== 'object')
        return;
    for (const [key, item] of Object.entries(value)) {
        assert(!/password|secret|access.?token|refresh.?token|api.?key|authorization/i.test(key), 'Secret-bearing metadata prohibited');
        if (typeof item === 'string')
            assert(!/(?:[?&](?:token|signature|apikey)=|Bearer\s|eyJ[A-Za-z0-9_-]+\.eyJ)/i.test(item), 'Credential-bearing value prohibited');
        rejectSecrets(item);
    }
}
function validate(manifest, config, verifyBytes = false) {
    assert.equal(manifest.schemaVersion, 1);
    assert(/^trimax-ocr-[a-z0-9-]+$/.test(manifest.version));
    assert.equal(manifest.labelsPurpose, 'scoring-only');
    rejectSecrets(manifest);
    const ids = new Set(), groups = new Map(), images = new Map();
    for (const r of manifest.records) {
        assert(/^[A-Za-z0-9_-]+$/.test(r.fixtureId), 'Unsafe fixture ID');
        assert(!ids.has(r.fixtureId), 'Duplicate fixture ID');
        ids.add(r.fixtureId);
        assert(r.captureId && r.independentDocumentId && r.sourceDocumentId && r.provenance);
        assert(splits.includes(r.split));
        assert(/^[a-f0-9]{64}$/.test(r.imageHash));
        privatePath(config, r.imageReference);
        if (verifyBytes)
            assert.equal(hash(fs.readFileSync(r.imageReference)), r.imageHash, 'Image changed');
        assert(!groups.has(r.independentDocumentId) || groups.get(r.independentDocumentId) === r.split, 'Recapture leakage');
        groups.set(r.independentDocumentId, r.split);
        assert(!images.has(r.imageHash) || images.get(r.imageHash) === r.independentDocumentId, 'Exact duplicate belongs to different document');
        images.set(r.imageHash, r.independentDocumentId);
        assert(['verified', 'requires-annotation'].includes(r.verificationStatus));
        if (r.verificationStatus === 'verified') {
            assert(r.verifiedTruth?.provenance && r.verifiedTruth.rows.length > 0);
            const rowIds = new Set();
            for (const row of r.verifiedTruth.rows) {
                assert(row.rowId && !rowIds.has(row.rowId) && /^(?:INV-?)?\d+$/.test(row.invoiceNumber));
                rowIds.add(row.rowId);
                assert(Number.isSafeInteger(row.amountCents) && row.amountCents >= 0);
            }
        }
        else
            assert.equal(r.verifiedTruth, null, 'Draft cannot carry unverified truth');
        if (r.augmentationOf)
            assert(manifest.records.some(p => p.captureId === r.augmentationOf && p.independentDocumentId === r.independentDocumentId && p.split === r.split), 'Augmentation leakage');
        if (manifest.frozenHoldouts.includes(r.independentDocumentId))
            assert.equal(r.split, 'holdout');
    }
    for (const r of manifest.metadataOnlyRecaptures || []) {
        assert(groups.has(r.independentDocumentId), 'Unknown metadata-only group');
        assert.equal(groups.get(r.independentDocumentId), r.split, 'Metadata recapture leakage');
    }
    return { pass: true, independentDocuments: groups.size, captures: new Set(manifest.records.map(r => r.captureId)).size };
}
function splitFor(group, seed, frozen = {}) { return frozen[group] || splits[parseInt(hash(seed + ':' + group).slice(0, 8), 16) % splits.length]; }
function enforceFrozenSplits(records, ledger) {
    const next = { ...ledger };
    for (const record of records) {
        if (next[record.independentDocumentId])
            assert.equal(record.split, next[record.independentDocumentId], 'Previously frozen document changed split');
        next[record.independentDocumentId] = record.split;
    }
    return next;
}
function groupRecords(records) {
    const seen = new Map(), identity = new Map();
    return records.map(r => {
        // Perceptual similarity is a review hint, never proof of document identity.
        const verified = r.verificationStatus === 'verified' ? r.verifiedTruth : null;
        const key = r.verifiedPhysicalDocumentId || (verified && r.sourcePaymentId ? 'payment:' + r.sourcePaymentId : null) || (r.provenance?.businessId && verified?.checkNumber && verified?.checkDate && verified?.authoritativeTotalCents != null ? digest({ businessId: r.provenance.businessId, check: verified.checkNumber, date: verified.checkDate, total: verified.authoritativeTotalCents, invoices: verified.rows.map(x => x.invoiceNumber).sort() }) : null);
        const group = seen.get(r.imageHash) || (key && identity.get(key)) || r.independentDocumentId || 'doc-' + r.imageHash.slice(0, 20);
        if (key && identity.has(key))
            assert.equal(identity.get(key), group, 'Conflicting verified identities');
        seen.set(r.imageHash, group);
        if (key)
            identity.set(key, group);
        return { ...r, independentDocumentId: group, captureId: r.captureId || 'capture-' + r.imageHash, exactDuplicate: records.findIndex(x => x.imageHash === r.imageHash) < records.indexOf(r) };
    });
}
function inferenceRecord(r) { return { fixtureId: r.fixtureId, captureId: r.captureId, imageReference: r.imageReference, imageHash: r.imageHash }; }
function editMetrics(expected, actual) {
    const a = [...expected], b = [...actual], dp = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++)
        dp[i][0] = { cost: i, insertions: 0, deletions: i, substitutions: 0 };
    for (let j = 0; j <= b.length; j++)
        dp[0][j] = { cost: j, insertions: j, deletions: 0, substitutions: 0 };
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++) {
            const mismatch = +(a[i - 1] !== b[j - 1]), diagonal = dp[i - 1][j - 1], del = dp[i - 1][j], ins = dp[i][j - 1];
            dp[i][j] = [{ ...diagonal, cost: diagonal.cost + mismatch, substitutions: diagonal.substitutions + mismatch }, { ...del, cost: del.cost + 1, deletions: del.deletions + 1 }, { ...ins, cost: ins.cost + 1, insertions: ins.insertions + 1 }].sort((x, y) => x.cost - y.cost)[0];
        }
    const result = dp[a.length][b.length];
    return { ...result, exact: expected === actual, characters: a.length, cer: result.cost / Math.max(1, a.length), characterAccuracy: Math.max(0, 1 - result.cost / Math.max(1, a.length)) };
}
const intersection = (a, b) => !a || !b ? 0 : Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
const coverage = (crop, truth) => truth ? intersection(crop, truth) / (truth.width * truth.height) : null;
function geometryScore(layout, truth) {
    return { expectedRows: truth.rows.length, detectedRows: layout.rows.length, rows: truth.rows.map((r, i) => { const got = layout.rows[i]; return { rowOverlap: coverage(got?.bounds, r.bounds), invoiceCompleteness: coverage(got?.invoiceRegion, r.invoiceBounds), amountCompleteness: coverage(got?.amountRegion, r.amountBounds), contamination: truth.rows.some((other, j) => j !== i && intersection(got?.invoiceRegion, other.invoiceBounds) > 0), missing: !got?.invoiceRegion || !got?.amountRegion }; }), headerCoverage: coverage(layout.headerRegion, truth.headerBounds), footerCoverage: coverage(layout.totalCandidateRegion, truth.footerBounds) };
}
function intake(request) {
    assert(['owner', 'admin'].includes(request.role));
    assert.equal(request.paymentVerified, true);
    assert.equal(request.datasetOptIn, true);
    assert(request.canonicalDocumentId && request.imageReference && request.verifiedTruth?.provenance);
    return { ...request, productionEnabled: false, trainingOptIn: request.trainingOptIn === true };
}
module.exports = { canonical, hash, digest, read, write, privatePath, validate, splitFor, enforceFrozenSplits, groupRecords, inferenceRecord, editMetrics, geometryScore, intake, rejectSecrets };
