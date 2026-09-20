/* eslint-disable @typescript-eslint/no-require-imports -- Fixed diagnostic OCR for transformations; no layout/fusion/business decisions. */
const fs = require('node:fs'), path = require('node:path'), { createWorker, OEM, PSM } = require('tesseract.js');
exports.variantAblation = async function (normalized, truth, output) {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, { cachePath: path.join(require('node:os').tmpdir(), 'trimax-v2-tesseract'), gzip: true, logger: () => { } }), results = [];
    try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
        for (const [variant, bytes] of Object.entries({ 'native-color': normalized.documentColor, ...normalized.variants })) {
            const start = performance.now();
            let timer;
            try {
                const result = await Promise.race([worker.recognize(bytes), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Diagnostic variant deadline exceeded')), 5000); })]);
                const text = result.data.text;
                fs.writeFileSync(path.join(output, 'diagnostic-' + variant + '.txt'), text);
                const invoices = (text.match(/\bINV[- ]?\d{4}\b/g) || []).map(x => x.replace(/[- ]?/g, '').replace('INV', 'INV-'));
                const money = (text.match(/\b(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\b/g) || []).map(x => Number(x.replaceAll(',', '')));
                results.push({ variant, status: 'completed', durationMs: performance.now() - start, confidence: result.data.confidence, literalInvoiceCoverage: truth.invoices.filter(x => invoices.includes(x)).length + '/' + truth.invoices.length, literalExpectedRowAmountOccurrences: money.filter(x => truth.amounts.includes(x)).length, literalTotalPresent: money.includes(truth.total), literalCheckPresent: truth.check ? new RegExp('\\b' + truth.check + '\\b').test(text) : null, meaning: 'Literal token coverage only, not row assignments, total authority or document success.' });
            }
            catch (error) {
                results.push({ variant, status: 'failed', durationMs: performance.now() - start, error: error.message });
                break;
            }
            finally {
                clearTimeout(timer);
            }
        }
    }
    finally {
        await worker.terminate();
    }
    return results;
};
