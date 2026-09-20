/* Evaluation only; never loaded by recognition. */
exports.summarize = function (result, evaluations, truth) {
    const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const field = name => evaluations.filter(e => e.field === name);
    const observations = name => result.observations.filter(o => o.field === name);
    const moneyWords = o => o.words.filter(w => /\d/.test(w.text));
    return {
        diagnosticBestRule: 'Highest confidence; longer nonempty text breaks ties; no truth-based selection',
        invoiceExactAccuracy: mean(field('invoice').map(e => Number(e.bestExact))),
        invoiceAnyVariantExactAccuracy: mean(field('invoice').map(e => Number(e.anyExact))),
        invoiceCharacterAccuracy: mean(field('invoice').map(e => e.characterAccuracy)),
        invoiceAmbiguousRows: field('invoice').filter(e => e.ambiguous).length,
        amountExactAccuracy: mean(field('amount').map(e => Number(e.bestExact))),
        amountCharacterAccuracy: mean(field('amount').map(e => e.characterAccuracy)),
        amountNumericCharacterAccuracy: mean(field('amount').map(e => e.numericCharacterAccuracy)),
        amountAmbiguousRows: field('amount').filter(e => e.ambiguous).length,
        footerExact: observations('total').some(o => o.moneyCandidates.some(m => m.cents === truth.total * 100)),
        checkExact: observations('header').some(o => o.checkCandidates.includes(truth.check)),
        dateExact: observations('header').some(o => o.dateCandidates.includes('08/19/2026')),
        units: 'Skipped: no reliable independent unit geometry',
        averageInvoiceCropMs: mean(field('invoice').map(e => e.observations.reduce((s, o) => s + o.durationMs, 0))),
        averageAmountCropMs: mean(field('amount').map(e => e.observations.reduce((s, o) => s + o.durationMs, 0))),
        footerMs: [...observations('footer'), ...observations('total')].reduce((s, o) => s + o.durationMs, 0),
        headerMs: observations('header').reduce((s, o) => s + o.durationMs, 0),
        footerGeometry: observations('footer').map(o => ({ variant: o.variant, raw: o.rawText, moneyCandidates: o.moneyCandidates, labelCandidates: o.words.filter(w => /[A-Za-z]/.test(w.text)), numericWords: moneyWords(o), note: 'All boxes in normalized full-resolution coordinates. Labels are raw alphabetic observations, not confirmed semantic labels.' })),
    };
};
