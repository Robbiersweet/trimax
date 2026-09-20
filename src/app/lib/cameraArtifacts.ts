export type CameraLifecycle = {
  streamRequestedAt?: string;
  streamStartedAt?: string;
  fallbackFrameAcquiredAt?: string;
  stillRequestedAt?: string;
  stillAcquiredAt?: string;
  streamStoppedAt?: string;
  afterStillMs?: number;
};

// The caller already owns a saved fallback frame. Release the hardware before
// inspecting metadata, normalizing, uploading, or recognizing either artifact.
export async function acquireStillAndRelease<T>(
  acquire: () => Promise<T>,
  release: () => void,
  lifecycle: CameraLifecycle,
) {
  lifecycle.stillRequestedAt = new Date().toISOString();
  try {
    const artifact = await acquire();
    lifecycle.stillAcquiredAt = new Date().toISOString();
    return artifact;
  } finally {
    release();
  }
}
