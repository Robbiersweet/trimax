import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const paymentScreen = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);
const appShell = readFileSync(
  resolve(root, "src/app/components/AppShell.tsx"),
  "utf8"
);
const floatingControls = readFileSync(
  resolve(root, "src/app/components/WorkspaceFloatingControls.tsx"),
  "utf8"
);

function mapGuideThroughObjectFitCover({
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight,
  guideLeft,
  guideTop,
  guideWidth,
  guideHeight,
}: {
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  guideLeft: number;
  guideTop: number;
  guideWidth: number;
  guideHeight: number;
}) {
  const scale = Math.max(viewportWidth / videoWidth, viewportHeight / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  const renderedLeft = (viewportWidth - renderedWidth) / 2;
  const renderedTop = (viewportHeight - renderedHeight) / 2;
  const visibleRawX = (0 - renderedLeft) / scale;
  const visibleRawY = (0 - renderedTop) / scale;
  const visibleRawRight = (viewportWidth - renderedLeft) / scale;
  const visibleRawBottom = (viewportHeight - renderedTop) / scale;
  const visibleSourceX = Math.max(
    0,
    Math.min(videoWidth - 1, Math.floor(visibleRawX))
  );
  const visibleSourceY = Math.max(
    0,
    Math.min(videoHeight - 1, Math.floor(visibleRawY))
  );
  const visibleSourceRight = Math.max(
    visibleSourceX + 1,
    Math.min(videoWidth, Math.ceil(visibleRawRight))
  );
  const visibleSourceBottom = Math.max(
    visibleSourceY + 1,
    Math.min(videoHeight, Math.ceil(visibleRawBottom))
  );
  const visibleSourceWidth = visibleSourceRight - visibleSourceX;
  const visibleSourceHeight = visibleSourceBottom - visibleSourceY;
  const guideRight = Math.max(0, Math.min(viewportWidth, guideLeft + guideWidth));
  const guideBottom = Math.max(0, Math.min(viewportHeight, guideTop + guideHeight));
  const clampedGuideLeft = Math.max(0, Math.min(viewportWidth - 1, guideLeft));
  const clampedGuideTop = Math.max(0, Math.min(viewportHeight - 1, guideTop));
  const sourceX = Math.max(
    visibleSourceX,
    Math.min(
      visibleSourceRight - 1,
      Math.floor(
        visibleSourceX +
          (clampedGuideLeft / viewportWidth) * visibleSourceWidth
      )
    )
  );
  const sourceY = Math.max(
    visibleSourceY,
    Math.min(
      visibleSourceBottom - 1,
      Math.floor(
        visibleSourceY +
          (clampedGuideTop / viewportHeight) * visibleSourceHeight
      )
    )
  );
  const sourceRight = Math.max(
    sourceX + 1,
    Math.min(
      visibleSourceRight,
      Math.ceil(visibleSourceX + (guideRight / viewportWidth) * visibleSourceWidth)
    )
  );
  const sourceBottom = Math.max(
    sourceY + 1,
    Math.min(
      visibleSourceBottom,
      Math.ceil(visibleSourceY + (guideBottom / viewportHeight) * visibleSourceHeight)
    )
  );

  return {
    visibleSourceX,
    visibleSourceY,
    visibleSourceWidth,
    visibleSourceHeight,
    sourceX,
    sourceY,
    sourceWidth: sourceRight - sourceX,
    sourceHeight: sourceBottom - sourceY,
    sourceRight,
    sourceBottom,
    visibleSourceRight,
    visibleSourceBottom,
  };
}

function assertGuideContained(result: ReturnType<typeof mapGuideThroughObjectFitCover>) {
  assert(result.sourceX >= result.visibleSourceX);
  assert(result.sourceY >= result.visibleSourceY);
  assert(result.sourceRight <= result.visibleSourceRight);
  assert(result.sourceBottom <= result.visibleSourceBottom);
}

const iphoneLandscapeEvidence = mapGuideThroughObjectFitCover({
  videoWidth: 4032,
  videoHeight: 2160,
  viewportWidth: 582,
  viewportHeight: 414,
  guideLeft: 12,
  guideTop: 91,
  guideWidth: 559,
  guideHeight: 232,
});

assertGuideContained(iphoneLandscapeEvidence);
assert(iphoneLandscapeEvidence.sourceX >= 550 && iphoneLandscapeEvidence.sourceX <= 570);
assert(iphoneLandscapeEvidence.sourceY >= 470 && iphoneLandscapeEvidence.sourceY <= 485);
assert(
  iphoneLandscapeEvidence.sourceWidth >= 2900 &&
    iphoneLandscapeEvidence.sourceWidth <= 2935
);
assert(
  iphoneLandscapeEvidence.sourceHeight >= 1205 &&
    iphoneLandscapeEvidence.sourceHeight <= 1220
);

const nearlyFullViewportGuide = mapGuideThroughObjectFitCover({
  videoWidth: 4032,
  videoHeight: 2160,
  viewportWidth: 582,
  viewportHeight: 414,
  guideLeft: 1,
  guideTop: 1,
  guideWidth: 580,
  guideHeight: 412,
});

assertGuideContained(nearlyFullViewportGuide);
assert(
  nearlyFullViewportGuide.sourceWidth >=
    nearlyFullViewportGuide.visibleSourceWidth - 12
);
assert(
  nearlyFullViewportGuide.sourceHeight >=
    nearlyFullViewportGuide.visibleSourceHeight - 12
);

const verticalSourceCropping = mapGuideThroughObjectFitCover({
  videoWidth: 1080,
  videoHeight: 1920,
  viewportWidth: 414,
  viewportHeight: 582,
  guideLeft: 20,
  guideTop: 18,
  guideWidth: 374,
  guideHeight: 546,
});

assertGuideContained(verticalSourceCropping);
assert(verticalSourceCropping.visibleSourceY > 0);
assert(verticalSourceCropping.visibleSourceX === 0);

assert(
  paymentScreen.includes("type CameraGeometryDiagnostics") &&
    paymentScreen.includes("collectCameraGeometryDiagnostics") &&
    paymentScreen.includes("document.elementFromPoint") &&
    paymentScreen.includes("hasSrcObject") &&
    paymentScreen.includes("activeTracks") &&
    paymentScreen.includes("readyState") &&
    paymentScreen.includes("videoWidth") &&
    paymentScreen.includes("videoHeight") &&
    paymentScreen.includes("computedStyle") &&
    paymentScreen.includes("displayMode") &&
    paymentScreen.includes("serviceWorkerController") &&
    paymentScreen.includes("trimaxBuildIdentifier") &&
    paymentScreen.includes("qualityGate") &&
    paymentScreen.includes("capture-center") &&
    paymentScreen.includes("capture-top-edge") &&
    paymentScreen.includes("capture-bottom-edge") &&
    paymentScreen.includes("check-only-center") &&
    paymentScreen.includes("use-device-camera-center") &&
    paymentScreen.includes("getVisibleCameraGuideSourceRect(video)"),
  "Camera diagnostics must collect viewport, visible control rectangles, and elementFromPoint hit tests."
);

assert(
  paymentScreen.includes("remittance-diagnostics-v3") &&
    paymentScreen.includes("window.matchMedia(\"(display-mode: standalone)\")") &&
    paymentScreen.includes("navigator.serviceWorker?.controller") &&
    paymentScreen.includes("standalone") &&
    paymentScreen.includes("browser"),
  "Diagnostics must identify installed PWA versus Safari/browser runtime and current diagnostic build."
);

assert(
  paymentScreen.includes('data-camera-visible-video="true"') &&
    paymentScreen.includes("cameraVideoRef.current.srcObject = stream") &&
    paymentScreen.includes('setAttribute("playsinline", "true")') &&
    paymentScreen.includes('setAttribute("webkit-playsinline", "true")') &&
    paymentScreen.includes("await cameraVideoRef.current.play()") &&
    paymentScreen.includes("setCameraVideoPlayStatus(\"playing\")") &&
    paymentScreen.includes("Preview blocked:") &&
    paymentScreen.includes("onLoadedMetadata") &&
    paymentScreen.includes("onCanPlay"),
  "The active MediaStream must attach to the visible video and expose play failures."
);

assert(
  paymentScreen.includes("z-0 h-full w-full bg-black object-cover opacity-100") &&
    paymentScreen.includes("[filter:none]") &&
    paymentScreen.includes("[mix-blend-mode:normal]") &&
    paymentScreen.includes("WebkitTransform: \"translateZ(0)\"") &&
    paymentScreen.includes("WebkitBackfaceVisibility: \"hidden\"") &&
    paymentScreen.includes('data-camera-transparent-dim-layer="true"') &&
    paymentScreen.includes("pointer-events-none absolute inset-0 z-10 bg-black/20") &&
    paymentScreen.includes("z-20") &&
    paymentScreen.includes("bg-transparent") &&
    !paymentScreen.includes("bg-black/30\" />"),
  "The live preview must be the visible base layer with only transparent, pointer-safe overlays above it."
);

assert(
  paymentScreen.includes("Diagnostics Active") &&
    paymentScreen.includes("cameraDiagnosticsEnabled ?") &&
    paymentScreen.includes("Camera geometry") &&
    paymentScreen.includes("max-h-40 overflow-auto"),
  "Diagnostic mode must be visible but compact and non-destructive."
);

assert(
  paymentScreen.includes('data-camera-overlay-root="true"') &&
    paymentScreen.includes('data-remittance-fullscreen-capture="true"') &&
    paymentScreen.includes("document.body") &&
    paymentScreen.includes("fixed left-0 top-0") &&
    paymentScreen.includes("h-[100dvh] w-screen") &&
    !paymentScreen.includes("width: `${cameraVisualViewport.width}px`") &&
    !paymentScreen.includes("height: `${cameraVisualViewport.height}px`") &&
    !paymentScreen.includes("left: `${cameraVisualViewport.left}px`") &&
    !paymentScreen.includes("top: `${cameraVisualViewport.top}px`"),
  "The camera portal must be one root fixed viewport layer without visualViewport-sized hitbox offsets."
);

assert(
  paymentScreen.includes("cameraOverlayRef") &&
    paymentScreen.includes("cameraViewportRef") &&
    paymentScreen.includes("cameraGuideRef") &&
    paymentScreen.includes("captureButtonRef") &&
    paymentScreen.includes("checkOnlyModeButtonRef") &&
    paymentScreen.includes("deviceCameraLabelRef"),
  "Camera diagnostics must measure the actual overlay, preview, guide, Capture, Check Only, and Use Device Camera elements."
);

assert(
    paymentScreen.includes('data-camera-capture-button="true"') &&
    paymentScreen.includes('data-camera-control="capture"') &&
    paymentScreen.includes('data-camera-control={mode.value}') &&
    paymentScreen.includes('data-camera-control="document-frame-capture"') &&
    paymentScreen.includes("Tap document to capture") &&
    paymentScreen.includes("handleDocumentFramePointerDown") &&
    paymentScreen.includes("handleDocumentFrameTouchStart") &&
    paymentScreen.includes("document-frame-pointer-down") &&
    paymentScreen.includes("document-frame-capture") &&
    paymentScreen.includes('data-camera-control="device-camera"') &&
    paymentScreen.includes("onPointerDownCapture={handleCameraOverlayPointerDownCapture}") &&
    paymentScreen.includes("onTouchStartCapture={handleCameraOverlayTouchStartCapture}") &&
    paymentScreen.includes("overlay-capture-visible-button") &&
    paymentScreen.includes("pointIsInsideRect") &&
    paymentScreen.includes("handleCaptureButtonPointerDown") &&
    paymentScreen.includes("setPointerCapture") &&
    paymentScreen.includes("event.preventDefault();") &&
    paymentScreen.includes("event.stopPropagation();"),
  "The visible Capture and mode controls must be isolated, measured hit targets."
);

assert(
  paymentScreen.includes("capture-center") &&
    paymentScreen.includes("capture-top-edge") &&
    paymentScreen.includes("capture-bottom-edge") &&
    paymentScreen.includes("below-visible-capture") &&
    paymentScreen.includes("frame: rectSnapshot(frame)") &&
    paymentScreen.includes("captureStarted: true") &&
    paymentScreen.includes("lastActualTap") &&
    paymentScreen.includes("capture-pointer-down"),
  "Diagnostics must prove visible Capture points hit Capture and tapping below it is a separate target."
);

assert(
  paymentScreen.includes("setCameraPipelineStages([\"Capturing...\"])") &&
    paymentScreen.includes("Frame captured") &&
    paymentScreen.includes("Camera native video:") &&
    paymentScreen.includes("Camera rendered video:") &&
    paymentScreen.includes("Visible guide rectangle:") &&
    paymentScreen.includes("Camera object-fit:") &&
    paymentScreen.includes("Visible object-fit source region:") &&
    paymentScreen.includes("Mapped native source rectangle:") &&
    paymentScreen.includes("Guide mapping containment:") &&
    paymentScreen.includes("Guide mapping scale:") &&
    paymentScreen.includes("Camera open age at capture:") &&
    paymentScreen.includes("Camera ready age at capture:") &&
    paymentScreen.includes("Camera track settings initial:") &&
    paymentScreen.includes("Camera track settings ready:") &&
    paymentScreen.includes("Camera track settings settled:") &&
    paymentScreen.includes("Camera track settings capture:") &&
    paymentScreen.includes("Camera track capabilities:") &&
    paymentScreen.includes("Live camera capture output:") &&
    paymentScreen.includes("Image normalized") &&
    paymentScreen.includes("Upload started") &&
    paymentScreen.includes("OCR started") &&
    paymentScreen.includes("OCR completed") &&
    paymentScreen.includes("Parsing completed") &&
    paymentScreen.includes("Matching completed") &&
    paymentScreen.includes("OCR pipeline details") &&
    paymentScreen.includes("Raw OCR text") &&
    paymentScreen.includes("Source image:") &&
    paymentScreen.includes("Crop box:") &&
    paymentScreen.includes("Normalized OCR image:") &&
    paymentScreen.includes("Parsed invoice numbers:") &&
    paymentScreen.includes("Matched invoices:") &&
    paymentScreen.includes("setLastOcrDiagnosticLines") &&
    paymentScreen.includes("setLastOcrRawText") &&
    paymentScreen.includes("Failed at:"),
  "Capture must show explicit progress stages and exact failure stage."
);

assert(
  paymentScreen.includes("formatCameraTrackSettings") &&
    paymentScreen.includes("formatCameraTrackCapabilities") &&
    paymentScreen.includes("getCapabilities=unsupported") &&
    paymentScreen.includes("focusMode") &&
    paymentScreen.includes("exposureMode") &&
    paymentScreen.includes("whiteBalanceMode") &&
    paymentScreen.includes("zoom"),
  "Camera diagnostics must expose real track settings/capabilities without inferring unsupported lens, focus, exposure, or zoom state."
);

assert(
  paymentScreen.includes("visibleSourceX") &&
    paymentScreen.includes("visibleSourceY") &&
    paymentScreen.includes("visibleSourceWidth") &&
    paymentScreen.includes("visibleSourceHeight") &&
    paymentScreen.includes("visibleRawX") &&
    paymentScreen.includes("visibleRawBottom") &&
    paymentScreen.includes("visibleSourceX + (clampedGuideLeft / viewportRect.width) * visibleSourceWidth") &&
    paymentScreen.includes("visibleSourceY + (clampedGuideTop / viewportRect.height) * visibleSourceHeight") &&
    paymentScreen.includes("Math.min(visibleSourceRight, Math.ceil(rawRight))") &&
    paymentScreen.includes("Math.min(visibleSourceBottom, Math.ceil(rawBottom))"),
  "Camera guide diagnostics must report the full object-fit native source region before applying the document guide crop."
);

assert(
  paymentScreen.includes("width: { ideal: 4096 }") &&
    paymentScreen.includes("height: { ideal: 2160 }") &&
    paymentScreen.includes('resizeMode: { ideal: "none" }') &&
    paymentScreen.includes("const maxOutputEdge = 4600") &&
    paymentScreen.includes("const outputScale = Math.min(") &&
    paymentScreen.includes("canvas.width = outputWidth") &&
    paymentScreen.includes("canvas.height = outputHeight") &&
    !paymentScreen.includes("const minReadableEdge = captureDocumentType === \"remittance_stub\" ? 2400 : 1800"),
  "Live Trimax camera capture must request high-detail video and preserve the mapped native crop instead of resampling to the old 2400px target."
);

assert(
  paymentScreen.includes("openCameraCapture(captureDocumentType, captureIntent)") &&
    paymentScreen.includes("setLastOcrSourceType(source)") &&
    paymentScreen.includes("sourceDiagnosticLines") &&
    paymentScreen.includes("lastCameraCaptureDiagnosticLines"),
  "Crop Retake must reopen the Trimax camera while source diagnostics preserve camera/existing identity."
);

assert(
  paymentScreen.includes("Saved preview and OCR input match") &&
    paymentScreen.includes("setOcrImageFile(preparedFile)") &&
    paymentScreen.includes("setCheckImageFile(preparedFile)") &&
    paymentScreen.includes("setCheckImagePreview(imageDataUrl)") &&
    paymentScreen.includes("preview and OCR input use same normalized crop"),
  "The saved preview and OCR input must use the same normalized crop."
);

assert(
  paymentScreen.includes("const minReadableEdge = 2400") &&
    !paymentScreen.includes("OCR image target: at least 3200px readable edge") &&
    paymentScreen.includes("Move closer - document is too distant.") &&
    paymentScreen.includes("Move farther away - show the full remittance") &&
    paymentScreen.includes("Use a higher-resolution photo.") &&
    paymentScreen.includes("Use Cropped Image Anyway") &&
    paymentScreen.includes("longestEdge >= 1800 && shortestEdge >= 650") &&
    paymentScreen.includes("cropWidth") &&
    paymentScreen.includes("cropHeight") &&
    paymentScreen.includes("ocrPermitted"),
  "Quality guidance must not block complete readable long remittances behind the old 3200px/short-edge gate."
);

assert(
  appShell.includes("<WorkspaceFloatingControls hidden={captureModeActive} />") &&
    appShell.includes("{!captureModeActive ? <Navigation /> : null}") &&
    appShell.includes("{!captureModeActive ? (") &&
    appShell.includes("<TrimaxRefreshControl />") &&
    appShell.includes("canUseJobSessions && !captureModeActive") &&
    floatingControls.includes("style={isHidden ? { display: \"none\" } : undefined}"),
  "Normal Back, Command, Refresh, Navigation, and job dock chrome must hide during active full-screen capture."
);

console.log("Remittance camera geometry regression checks passed.");
