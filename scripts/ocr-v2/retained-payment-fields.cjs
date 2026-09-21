/* eslint-disable @typescript-eslint/no-require-imports -- Private retained optical observations, never labels. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { hash, read, privatePath } = require('./dataset/core.cjs');
exports.loadRetainedPaymentFields = function (config, sourcesFile, documentId, image) {
    if (!sourcesFile)
        return [];
    const sources = read(privatePath(config, sourcesFile)), retained = [];
    for (const source of sources.filter(s => s.documentId === documentId)) {
        const sourceHash = hash(fs.readFileSync(privatePath(config, source.normalizedImage)));
        assert.equal(sourceHash, hash(image), 'Retained source is a different normalized image');
        const fields = read(privatePath(config, source.observations));
        for (const field of fields.observations.filter(o => o.field === 'amount' && o.status === 'completed')) {
            const rowIndex = Number(field.rowId.match(/\d+$/)[0]) - 1, crop = fs.readFileSync(privatePath(config, path.join(source.crops, field.regionId + '.png')));
            retained.push({ id: `${documentId}:retained-phase3:${field.regionId}:${field.variant}`, scope: 'row', field: 'amount', rowId: `${documentId}-${rowIndex}`, variant: `retained-${field.variant}`, raw: field.rawText, bounds: field.bounds, sourceHash, cropHash: hash(crop), durationMs: field.durationMs, confidence: field.confidence, words: field.words, money: [] });
        }
    }
    return retained;
};
