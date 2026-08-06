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
    paymentScreen.includes("use-device-camera-center"),
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
    paymentScreen.includes("left: \"0px\"") &&
    paymentScreen.includes("top: \"0px\"") &&
    paymentScreen.includes("width: `${cameraVisualViewport.width}px`") &&
    paymentScreen.includes("height: `${cameraVisualViewport.height}px`") &&
    !paymentScreen.includes("left: `${cameraVisualViewport.left}px`") &&
    !paymentScreen.includes("top: `${cameraVisualViewport.top}px`"),
  "The camera portal must be one root fixed layer sized to the visual viewport without offsetting its hitbox."
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
    paymentScreen.includes('data-camera-control="device-camera"') &&
    paymentScreen.includes("handleCaptureButtonPointerUp") &&
    paymentScreen.includes("event.preventDefault();") &&
    paymentScreen.includes("event.stopPropagation();"),
  "The visible Capture and mode controls must be isolated, measured hit targets."
);

assert(
  paymentScreen.includes("setCameraPipelineStages([\"Capturing...\"])") &&
    paymentScreen.includes("Frame captured") &&
    paymentScreen.includes("Image normalized") &&
    paymentScreen.includes("Upload started") &&
    paymentScreen.includes("OCR started") &&
    paymentScreen.includes("OCR completed") &&
    paymentScreen.includes("Parsing completed") &&
    paymentScreen.includes("Matching completed") &&
    paymentScreen.includes("Failed at:"),
  "Capture must show explicit progress stages and exact failure stage."
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
