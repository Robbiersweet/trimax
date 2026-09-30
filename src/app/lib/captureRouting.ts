export type CaptureImplementation = 'native-still' | 'custom-camera' | 'existing-photo';
export type CaptureOpeningState = {
  nativeStillConfigured: boolean; shadowConfigured: boolean; flagsLoaded: boolean;
  roleLoaded: boolean; workspaceLoaded: boolean; shadowEligible: boolean; flagReadError: string | null;
};
export function selectCapture(implementation: CaptureImplementation, openingState: CaptureOpeningState, reason: string, now = Date.now()) {
  return Object.freeze({ implementation, selectedAt: now, selectionReason: reason, openingState: Object.freeze({...openingState}) });
}
export type CaptureUiEvidence = {
  selection: ReturnType<typeof selectCapture>; clientBuild: string;
  fallbackOccurred: boolean; fallbackReason: string | null; acquisitionMechanism: string;
  takePhotoTappedAt: number | null; nativeCameraInvokedAt: number | null;
  imageReturnedAt: number | null; cameraUiEndedAt: number | null; previewPaintOpportunityAt: number | null;
  previewImageLoadedAt: number | null; previewError: string | null;
  canonicalUploadStartedAt: number | null; canonicalUploadAcknowledgedAt: number | null;
  legacyJobQueuedAt: number | null; shadowJobQueuedAt: number | null;
};
