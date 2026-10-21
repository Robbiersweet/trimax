/** Bounds a UI wait even when a browser, authentication or network promise never settles. */
export function remittanceDeadline<T>(work: PromiseLike<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(work).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export const REMITTANCE_PROCESSING_LIMIT_MS = 120_000;
