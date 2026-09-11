import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(
  resolve(root, "src/app/api/payments/extract-check-stub/route.ts"),
  "utf8"
);
const payments = readFileSync(
  resolve(root, "src/app/components/BatchInvoicePayments.tsx"),
  "utf8"
);

assert(
  route.includes("parseExtractCheckStubRequest") &&
    route.includes("multipart/form-data") &&
    route.includes("request.formData()") &&
    route.includes("formData.get(`candidate-${index}`)") &&
    route.includes("Buffer.from(arrayBuffer)") &&
    route.includes("imageMimeType: file.type") &&
    route.includes("imageByteSize: file.size"),
  "Capture-source preflight must accept Blob/File candidate bytes through multipart form data."
);

assert(
  payments.includes("const formData = new FormData()") &&
    payments.includes("formData.append(\"mode\", \"capture-source-selection\")") &&
    payments.includes("formData.append(\"captureCandidates\", JSON.stringify(payloadCandidates))") &&
    payments.includes("formData.append(`candidate-${index}`, candidate.file, candidate.file.name)") &&
    !payments.includes("imageDataUrl: await fileToDataUrl(candidate.file)"),
  "Production capture-source selection must send candidate files directly instead of forcing large stills through data URLs."
);

assert(
  route.includes("function imageBufferFromCandidate") &&
    route.includes("candidate.imageBuffer") &&
    route.includes("inputType: \"multipart-file\"") &&
    route.includes("inputType: \"data-url\"") &&
    route.includes("selectedImageDataUrl: \"\"") &&
    route.includes("isSafeDataUrl(imageDataUrl)"),
  "The route must use one image-input resolver that supports multipart bytes and legacy data URLs."
);

assert(
  route.includes("resolve-image-input") &&
    route.includes("expectedInput") &&
    route.includes("actualInput") &&
    route.includes("describeCandidateInput(candidate)") &&
    route.includes("Candidate image input was missing, unsafe, or over the data URL limit."),
  "Candidate failures must report the exact stage, expected input, and actual input."
);

assert(
  route.includes("const evaluation = await evaluateCaptureSourceCandidate(") &&
    route.includes(").catch((error) => {") &&
    route.includes("failures.push({") &&
    route.includes("return null;") &&
    route.includes("if (evaluation) {") &&
    route.includes("evaluations.push(evaluation)") &&
    route.includes("selected =") &&
    route.includes("No capture candidate had usable selection evidence."),
  "One failed candidate must not collapse the whole capture-source comparison."
);

assert(
  route.includes("suspiciousIncomplete") &&
    route.includes("invoiceTokens === 0") &&
    route.includes("textWidthCoverage < 0.45") &&
    route.includes("explicitTotal > 0 ? 70 : 0") &&
    route.includes("detectorConfidenceScore(detectorConfidence)") &&
    route.includes("right.completenessScore - left.completenessScore"),
  "Capture-source selection must score remittance completeness, not just raw image quality."
);

assert(
  payments.includes("\"Canvas evaluation\"") &&
    payments.includes("\"Still crop evaluation\"") &&
    payments.includes("\"Still full evaluation\"") &&
    payments.includes("candidate input=") &&
    payments.includes("mime=") &&
    payments.includes("bytes=") &&
    payments.includes("invoiceTokens=") &&
    payments.includes("explicitTotal=") &&
    payments.includes("Selected source:") &&
    payments.includes("Production OCR source selected:"),
  "Production diagnostics must show per-candidate success metrics and selected source."
);

assert(
  payments.includes("failed at") &&
    payments.includes("inputType=") &&
    payments.includes("actual=") &&
    payments.includes("expected=") &&
    route.includes("inputType?: string") &&
    route.includes("actualInput?: string") &&
    route.includes("expectedInput?: string"),
  "Production diagnostics must show per-candidate failure input details."
);

assert(
  route.includes("Date.now() - startedAt > 18_000") &&
    route.includes("Capture source selection OCR timed out.") &&
    route.includes("Capture source preflight budget reached before this candidate could run.") &&
    route.includes("maxDuration = 60"),
  "Capture-source preflight must remain bounded within the OCR route budget."
);

assert(
  payments.includes("productionFile =") &&
    payments.includes("selection.selectedCandidate?.id === \"canvas\"") &&
    payments.includes("imagecapture-still-crop") &&
    payments.includes("imagecapture-still-full") &&
    payments.includes("canvas-video-frame") &&
    payments.includes("imagecapture-still-crop preparation failed at cropPhotoForOcr") &&
    payments.includes("imagecapture-still-full preparation failed at cropPhotoForOcr") &&
    payments.includes("sourceCandidates.push({"),
  "Sparse canvas versus stronger still candidates must all be eligible for production selection, and one still derivative failure must not discard the other candidates."
);

assert(
  payments.includes("Camera capture selected for production OCR: canvas-video-frame.") &&
    payments.includes("Fallback occurred:") &&
    payments.includes("Selection reason:"),
  "Canvas fallback remains available when canvas is objectively stronger or still capture is unsupported."
);

console.log("Capture source selection regression checks passed.");
