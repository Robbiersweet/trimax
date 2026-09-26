/* eslint-disable @typescript-eslint/no-require-imports -- Shared isolated worker persistence contract. */
const crypto = require('node:crypto');
const CHUNK_BYTES = 48000;
function encodeEvidence(value) {
  const text = JSON.stringify(value);
  const bytes = Buffer.from(text);
  if (bytes.length > 12000000) throw Error('Legacy evidence exceeds retention limit');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const chunks = [];
  // Base64 is for bounded JSON evidence chunks, never canonical image transport.
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) chunks.push(bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'));
  return { hash, bytes: bytes.length, chunks };
}
function terminalSummary(result, reference) {
  const rows = Array.isArray(result.structuredRowEvidence) ? result.structuredRowEvidence : [];
  const summary = {
    evidenceReference: reference,
    rowsDetected: rows.length,
    documentTotal: result.totalEvidence?.payable === true ? result.totalEvidence.amount : null,
    checkNumber: String(result.checkNumber || '').slice(0, 128),
    checkDate: String(result.checkDate || '').slice(0, 128),
    identity: String(result.payor || '').slice(0, 256),
    paymentCanApply: false,
    reasons: [result.error ? String(result.error).slice(0, 1000) : 'OCR complete — open payment review'],
  };
  if (Buffer.byteLength(JSON.stringify(summary)) > 4096) throw Error('Terminal summary exceeds bound');
  return summary;
}
async function saveEvidence(update, stage, value) {
  const started=performance.now();
  const encoded = encodeEvidence(value);
  const serializationMs=performance.now()-started;
  for (let index = 0; index < encoded.chunks.length; index++) {
    await update('evidence_chunk', { stage, hash: encoded.hash, index, count: encoded.chunks.length, bytes: encoded.bytes, data: encoded.chunks[index] });
  }
  await update('evidence_ready', { stage, hash: encoded.hash, count: encoded.chunks.length, bytes: encoded.bytes, persistence:{serializationMs,chunkRequestsMs:performance.now()-started-serializationMs} });
  return encoded.hash;
}
module.exports = { encodeEvidence, terminalSummary, saveEvidence };
