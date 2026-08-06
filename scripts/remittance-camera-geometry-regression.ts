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
    paymentScreen.includes("capture-center") &&
    paymentScreen.includes("capture-top-edge") &&
    paymentScreen.includes("capture-bottom-edge") &&
    paymentScreen.includes("check-only-center") &&
    paymentScreen.includes("use-device-camera-center"),
  "Camera diagnostics must collect viewport, visible control rectangles, and elementFromPoint hit tests."
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
  appShell.includes("<WorkspaceFloatingControls hidden={captureModeActive} />") &&
    appShell.includes("{!captureModeActive ? <Navigation /> : null}") &&
    appShell.includes("{!captureModeActive ? (") &&
    appShell.includes("<TrimaxRefreshControl />") &&
    appShell.includes("canUseJobSessions && !captureModeActive") &&
    floatingControls.includes("style={isHidden ? { display: \"none\" } : undefined}"),
  "Normal Back, Command, Refresh, Navigation, and job dock chrome must hide during active full-screen capture."
);

console.log("Remittance camera geometry regression checks passed.");
