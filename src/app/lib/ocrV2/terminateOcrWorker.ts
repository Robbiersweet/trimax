import type { Worker as ThreadWorker } from 'node:worker_threads';
import type { Worker } from 'tesseract.js';

export async function terminateOcrWorker(worker: Worker): Promise<void> {
  // Tesseract exposes its Node worker at runtime but does not type it. Its
  // terminate promise resolves before the native worker thread has exited.
  const thread = (worker as Worker & { worker?: ThreadWorker }).worker;
  if (thread && thread.threadId !== -1) {
    const exited = new Promise<void>((resolve) => thread.once('exit', () => resolve()));
    await worker.terminate();
    await exited;
    return;
  }
  await worker.terminate();
}
