/* eslint-disable @typescript-eslint/no-require-imports -- Document authority and retained optical provenance safety. */
const assert = require('node:assert/strict'), sharp = require('sharp'), fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto');
const { headerMoney, decideDocumentTotal, validateRetainedAmounts, recognizeDocumentTotal } = require('../../src/app/lib/ocrV2/recognition/documentTotalAuthority.ts');
const { paymentMoney } = require('../../src/app/lib/ocrV2/recognition/paymentEvidence.ts');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const layout = { sourceWidth: 500, sourceHeight: 300, headerRegion: { left: 0, top: 70, width: 480, height: 20 }, totalCandidateRegion: { left: 300, top: 220, width: 100, height: 30 }, rows: [{ bounds: { left: 0, top: 100, width: 400, height: 30 }, amountRegion: { left: 300, top: 100, width: 100, height: 30 } }, { bounds: { left: 0, top: 150, width: 400, height: 30 }, amountRegion: { left: 300, top: 150, width: 100, height: 30 } }], diagnostics: { font: 12 } };
const sourceHash = 'a'.repeat(64), evidence = { documentId: 'synthetic', sourceHash, rows: [{ rowId: 'synthetic-0', cents: 10000, observations: [] }, { rowId: 'synthetic-1', cents: 20000, observations: [] }], checkNumber: '001234', checkDate: '2026-01-01', payor: 'Example' };
const word = (text, left, top, width = 60, confidence = 90) => ({ text, bounds: { left, top, width, height: 20 }, confidence });
function header(id = 'native', text = 'TOTAL:', amount = '$300.00') { return { id: 'header-' + id, scope: 'document', field: 'header', sourceHash, variant: id, bounds: { left: 0, top: 0, width: 500, height: 65 }, raw: text + ' ' + amount, confidence: 90, words: [word(text, 20, 20), ...(amount ? [word(amount, 90, 20, 90)] : [])], money: [] }; }
function footer(id = 'native', raw = '300.00') { return { id: 'footer-' + id, scope: 'document', field: 'total', sourceHash, variant: id, bounds: layout.totalCandidateRegion, raw, confidence: 90, money: paymentMoney(raw), words: [] }; }
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
(async () => {
    test('Explicit header/footer association', () => assert.equal(decideDocumentTotal(layout, evidence, [header(), footer()]).cents, 30000));
    test('Repeated label without adjacent money supports isolated footer', () => assert.equal(decideDocumentTotal(layout, evidence, [header('native', 'TOTAL:', ''), header('gray', 'TOTAL:', ''), footer()]).cents, 30000));
    test('Existing same-region footer TOTAL authority preserved', () => { const label = id => ({ ...header(id, 'TOTAL:', ''), field: 'footer-label', words: [word('TOTAL:', 200, 220)] }); assert.equal(decideDocumentTotal(layout, evidence, [label('native'), label('contrast'), footer()]).cents, 30000); assert.equal(decideDocumentTotal(layout, evidence, [label('native'), label('contrast'), footer(), header('native', 'TOTAL:', '$900.00')]).cents, null); });
    test('Subtotal cannot create total', () => assert.equal(decideDocumentTotal(layout, evidence, [footer()]).cents, null));
    test('Body money cannot become document total', () => assert.equal(decideDocumentTotal({ ...layout, totalCandidateRegion: layout.rows[0].amountRegion }, evidence, [header(), { ...footer(), bounds: layout.rows[0].amountRegion }]).cents, null));
    test('Body TOTAL label disqualified', () => assert.equal(decideDocumentTotal(layout, evidence, [{ ...header(), words: [word('TOTAL:', 20, 105)] }, footer()]).cents, null));
    test('Unaligned final money rejected', () => assert.equal(decideDocumentTotal({ ...layout, totalCandidateRegion: { ...layout.totalCandidateRegion, left: 50 } }, evidence, [header(), footer()]).cents, null));
    for (const label of ['SUBTOTAL:', 'SUB TOTAL:', 'TOIAL:', 'TOTALS:'])
        test('Reject ' + label, () => assert.equal(decideDocumentTotal(layout, evidence, [header('native', label), footer()]).cents, null));
    test('Different source hash rejected', () => assert.equal(decideDocumentTotal(layout, evidence, [{ ...header(), sourceHash: 'b'.repeat(64) }, footer()]).cents, null));
    test('Labeled amount conflict rejected', () => assert.equal(decideDocumentTotal(layout, evidence, [header('native', 'TOTAL:', '$900.00'), footer()]).cents, null));
    test('Conflicting header amounts rejected', () => assert.equal(decideDocumentTotal(layout, evidence, [header(), header('gray', 'TOTAL:', '$900.00'), footer()]).cents, null));
    test('Header corroborates one observed footer alternative', () => assert.equal(decideDocumentTotal(layout, evidence, [header(), footer(), footer('contrast', '900.00')]).cents, 30000));
    test('Observed subtotal contradiction blocks', () => assert.equal(decideDocumentTotal(layout, { ...evidence, rows: [{ cents: 10000 }, { cents: 10000 }] }, [header(), footer()]).cents, null));
    test('Missing row subtotal is not invented', () => { const r = decideDocumentTotal(layout, { ...evidence, rows: [{ cents: null }] }, [header(), footer()]); assert.equal(r.cents, 30000); assert.equal(r.subtotal, null); });
    test('Header formatting never repairs digits', () => { assert.equal(headerMoney('$2,345. 67***'), 234567); for (const s of ['$2,O45.67', '$.495.00', '1,099 00', '-100.00', '100.000', '100.00 200.00'])
        assert.equal(headerMoney(s), null, s); });
    const image = await sharp({ create: { width: 500, height: 300, channels: 3, background: 'white' } }).png().toBuffer(), sha = hash(image), bounds = layout.rows[0].amountRegion, crop = await sharp(image).extract(bounds).flatten({ background: 'white' }).png().toBuffer();
    const retained = { id: 'retained', scope: 'row', rowId: 'synthetic-0', field: 'amount', variant: 'retained-native', sourceHash: sha, cropHash: hash(crop), raw: '100.00', bounds, confidence: 90, words: [word('100.00', 310, 105, 70)], money: [] };
    const validated = await validateRetainedAmounts(image, layout, { ...evidence, sourceHash: sha }, [retained, { ...retained, id: 'bad-hash', cropHash: 'b'.repeat(64) }, { ...retained, id: 'cross-row', rowId: 'synthetic-1' }, { ...retained, id: 'bad-source', sourceHash: 'b'.repeat(64) }]);
    assert.equal(validated.accepted.length, 1);
    assert.equal(validated.rejected.length, 3);
    console.log('PASS retained source/crop hashes and row ownership');
    count++;
    const headers = [{ ...header(), sourceHash: sha }], totals = [{ ...footer(), sourceHash: sha }];
    const original = { ...evidence, sourceHash: sha, rows: evidence.rows.map((row, i) => ({ ...row, observations: [{ ...retained, id: 'row-' + i, rowId: row.rowId, raw: i ? '200.00' : '100.00', money: [i ? 20000 : 10000] }] })), headerEvidence: { observations: headers }, totalEvidence: { observations: totals } };
    const revised = await recognizeDocumentTotal(image, layout, original);
    assert.equal(revised.extraPasses, 0);
    for (const field of ['checkNumber', 'checkDate', 'payor'])
        assert.equal(revised.evidence[field], original[field]);
    count++;
    console.log('PASS no unnecessary OCR and unchanged check/date/payor');
    for (const file of ['src/app/lib/ocrV2/fusion/index.ts', 'src/app/lib/ocrV2/resolver/index.ts', 'src/app/lib/ocrV2/recognition/index.ts', 'src/app/lib/ocrV2/recognition/paymentEvidence.ts', 'src/app/lib/remittanceAttempt.ts', 'src/app/lib/remittanceMatching.ts'])
        assert.equal(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), cp.execFileSync('git', ['show', '39e4c0f:' + file], { encoding: 'utf8' }).replaceAll('\r\n', '\n'), file + ' changed');
    count++;
    console.log('PASS frozen invoice/fusion/resolver/Phase5B contracts');
    console.log(count + ' document-total suites passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
