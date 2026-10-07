/** Runtime artifacts are never written into a source checkout. No recognition settings change. */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function ocrRuntimeCache(): string {
  const directory = join(tmpdir(), 'trimax-ocr', 'tesseract-js-7', 'eng');
  mkdirSync(directory, { recursive: true });
  return directory;
}
