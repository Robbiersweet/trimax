export type CanonicalCapture = {
 reference: string; sha256: string; storedBytes: number; shadowQueued: boolean; uploadDurationMs: number;
};
export type TransportFailure = {stage: string; errorClass: string; httpStatus: number | null; ocrStarted: boolean; message: string};
export function transportFailure(status: number | null, message: string, stage = 'ocr-request'): TransportFailure {
 return {stage,errorClass: status === 413 ? 'FUNCTION_PAYLOAD_TOO_LARGE' : status ? 'HTTPError' : 'TransportError',httpStatus:status,ocrStarted:false,message};
}
export function canonicalRequest(capture: CanonicalCapture) {
 return {canonicalReference:capture.reference,sourceImageHash:capture.sha256};
}
export async function imageSha256(bytes: ArrayBuffer) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
