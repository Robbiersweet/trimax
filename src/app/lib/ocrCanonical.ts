export type CanonicalCapture = {
 reference: string; sha256: string; storedBytes: number; shadowQueued: boolean; uploadDurationMs: number;
};
export type TransportFailure = {stage: string; errorClass: string; httpStatus: number | null; ocrStarted: boolean; message: string; errorCode?: string};
/** Retain transport metadata without including request bodies, credentials or image bytes. */
export function captureFailure(error: unknown, stage: string): TransportFailure {
 const value=error && typeof error==='object' ? error as Record<string,unknown> : {};
 const rawStatus=Number(value.status ?? value.statusCode);
 const status=Number.isInteger(rawStatus)&&rawStatus>=400&&rawStatus<=599?rawStatus:null;
 const code=typeof value.code==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value.code)?value.code:undefined;
 return {...transportFailure(status,error instanceof Error?error.message:'Capture request failed',typeof value.stage==='string'?value.stage:stage),errorCode:code};
}
export function captureFailureMessage(failure: TransportFailure) {
 const detail=failure.httpStatus===401||['PGRST301','PGRST303','bad_jwt','session_not_found'].includes(failure.errorCode??'')
  ? 'Your session could not be verified.'
  : failure.httpStatus===403||failure.errorCode==='42501' ? 'Workspace access was not authorized.'
  : failure.stage==='workspace' ? 'The workspace is not ready.'
  : failure.stage==='capture-registration' ? 'The scan could not be registered; photo upload has not started.'
  : failure.stage==='canonical-registration' ? 'The photo was uploaded, but its saved-scan registration was not confirmed.'
  : failure.stage==='capture-lookup' ? 'The saved scan could not be verified before upload.'
  : failure.stage==='image-preparation' ? 'The captured photo could not be prepared for upload.'
  : 'Photo upload could not be confirmed.';
 return `${detail} Retry will reuse this photo and scan ID. Keep this page open. If Retry fails again, use Copy Capture Diagnostics.`;
}
export function transportFailure(status: number | null, message: string, stage = 'ocr-request', ocrStarted = false): TransportFailure {
 return {stage,errorClass: status === 413 ? 'FUNCTION_PAYLOAD_TOO_LARGE' : status ? 'HTTPError' : 'TransportError',httpStatus:status,ocrStarted,message};
}
export function canonicalRequest(capture: CanonicalCapture) {
 return {canonicalReference:capture.reference,sourceImageHash:capture.sha256};
}
export async function imageSha256(bytes: ArrayBuffer) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
