/* eslint-disable @typescript-eslint/no-require-imports -- Offline baseline comparison. */
const assert = require('node:assert/strict'), { digest } = require('./core.cjs');
module.exports = function compare(base, next) {
    assert.equal(base.manifestHash, next.manifestHash, 'Dataset mismatch');
    assert.equal(digest(base.modelVersions), digest(next.modelVersions), 'Model mismatch; review and explicitly freeze a new baseline');
    const failures = [];
    for (const old of base.scorecards) {
        const now = next.scorecards.find(x => x.id === old.id);
        if (!now) {
            failures.push(old.id + ': missing document');
            continue;
        }
        for (const key of ['invoiceExact', 'amountExact'])
            if (now[key] < old[key])
                failures.push(old.id + ': ' + key);
        for (const [model, rows] of Object.entries(old.models || {}))
            rows.forEach((row, i) => { const candidate = now.models?.[model]?.[i]; if (!candidate || candidate.cost > row.cost || (row.exact && !candidate.exact))
                failures.push(`${old.id}: ${model} row ${i}`); });
        for (const key of ['authoritativeTotalCents', 'checkNumber', 'checkDate', 'payor'])
            if (old.fields?.[key]?.exact === true && now.fields?.[key]?.exact !== true)
                failures.push(old.id + ': ' + key);
        (old.fields?.amounts || []).forEach((row, i) => { const candidate = now.fields?.amounts[i]; if (row.exact && !candidate?.exact)
            failures.push(`${old.id}: amount row ${i}`); if (candidate?.actual != null && !candidate.exact)
            failures.push(`${old.id}: incorrect accepted amount ${i}`); });
        if (now.wrongAutomatic > 0)
            failures.push(old.id + ': incorrect automatic resolution');
        if (old.fullSuccess && !now.fullSuccess)
            failures.push(old.id + ': full success');
        if (old.layout) {
            if (!now.layout || now.layout.detectedRows !== old.layout.detectedRows)
                failures.push(old.id + ': row count');
            else
                old.layout.rows.forEach((row, i) => { const candidate = now.layout.rows[i]; for (const key of ['rowOverlap', 'invoiceCompleteness', 'amountCompleteness'])
                    if (!candidate || candidate[key] + 1e-9 < row[key])
                        failures.push(`${old.id}: geometry ${i} ${key}`); if (candidate?.contamination && !row.contamination)
                    failures.push(old.id + ': new contamination'); });
        }
    }
    assert.equal(failures.length, 0, 'Regression: ' + failures.join(', '));
    return { pass: true };
};
