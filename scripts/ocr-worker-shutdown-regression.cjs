/* eslint-disable @typescript-eslint/no-require-imports -- Native thread lifecycle test for the Node OCR worker. */
const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { terminateOcrWorker } = require('../src/app/lib/ocrV2/terminateOcrWorker.ts');

async function main() {
  const worker = new Worker('setInterval(() => {}, 1000)', { eval: true });
  let terminationRequested = false;
  await terminateOcrWorker({
    worker,
    async terminate() {
      terminationRequested = true;
      // Match Tesseract: start termination and return before the thread exits.
      void worker.terminate();
    },
  });
  assert.equal(terminationRequested, true);
  assert.equal(worker.threadId, -1, 'OCR teardown must await native thread exit');

  let fallbackCalled = false;
  await terminateOcrWorker({ async terminate() { fallbackCalled = true; } });
  assert.equal(fallbackCalled, true);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
