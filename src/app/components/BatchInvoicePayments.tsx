"use client";

import {
  CSSProperties,
  MouseEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Card from "./Card";
import DateInputField from "./DateInputField";
import Toast from "./Toast";
import {
  businessDateKey,
  isOverdueCollectibleInvoice,
} from "../lib/invoiceEligibility";
import { isCollectibleInvoiceStatus } from "../lib/invoiceLifecycle";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { supabase } from "../lib/supabase";
import {
  extractCheckDate,
  extractCheckNumber,
  extractInvoiceNumbers,
  extractLikelyPayor,
  findRemittanceMatches,
  normalizeInvoiceNumber,
  parseCheckDate,
  parseMoney,
} from "../lib/remittanceMatching";

type BatchInvoice = {
  id: string;
  displayId: string;
  customerName: string;
  projectTitle: string;
  invoiceAmount: number;
  amountPaid: number;
  collectionAmountDue?: number;
  isDepositRequest?: boolean;
  status: string;
  dueDate?: string | null;
};

type BatchInvoicePaymentsProps = {
  invoices: BatchInvoice[];
  businessId?: string | null;
  businessSlug?: string | null;
  initialCustomer?: string | null;
  initialInvoiceIds?: string[];
};

type PayableInvoice = BatchInvoice & {
  amountDue: number;
  daysLate: number | null;
  isOverdue: boolean;
};

type ReviewMatchedInvoice = PayableInvoice & {
  remittanceAmount: number | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type CheckOcrStatus = "idle" | "reading" | "ready" | "manual" | "error";
type PaymentEntryMode =
  | "choice"
  | "camera"
  | "crop"
  | "photo"
  | "manual"
  | "complete";

type RemittanceDocumentType =
  | "remittance_stub"
  | "full_check_stub"
  | "check_only";

type CaptureIntent = "primary" | "check_details";
type OcrRetryStrategy = "standard" | "alternate";

type CropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CropSuggestion = {
  cropBox: CropBox;
  isTightlyFramed: boolean;
  documentAreaRatio: number;
  effectiveWidth: number;
  effectiveHeight: number;
  confidence: "high" | "medium" | "low";
  qualityMessages: string[];
  shouldAutoRead: boolean;
};

type ImageQualityReport = {
  ok: boolean;
  message: string;
  brightness: number;
  contrast: number;
  blurScore: number;
};

type CameraVisualViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CameraRectSnapshot = {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
};

type CameraHitTestSnapshot = {
  point: string;
  x: number;
  y: number;
  element: string;
};

type CameraGeometryDiagnostics = {
  layoutViewport: { width: number; height: number };
  visualViewport: CameraVisualViewport;
  devicePixelRatio: number;
  video: {
    hasSrcObject: boolean;
    activeTracks: number;
    readyState: number;
    videoWidth: number;
    videoHeight: number;
    playStatus: string;
    computedStyle: Record<string, string>;
  };
  overlay: CameraRectSnapshot | null;
  videoRect: CameraRectSnapshot | null;
  preview: CameraRectSnapshot | null;
  guide: CameraRectSnapshot | null;
  capture: CameraRectSnapshot | null;
  checkOnly: CameraRectSnapshot | null;
  useDeviceCamera: CameraRectSnapshot | null;
  hitTests: CameraHitTestSnapshot[];
  ancestorStyles: string[];
};

type CheckStubOcrResponse = {
  documentType?: RemittanceDocumentType;
  stubText?: string;
  rawText?: string;
  payor?: string;
  checkNumber?: string;
  checkDate?: string;
  totalAmount?: number;
  lines?: { amount?: unknown; invoiceNumbers?: unknown }[];
  diagnostics?: {
    summary?: string[];
    retryStrategy?: OcrRetryStrategy;
    originalWidth?: number;
    originalHeight?: number;
    originalFormat?: string;
    originalOrientation?: number;
    normalizedWidth?: number;
    normalizedHeight?: number;
    documentWidth?: number;
    documentHeight?: number;
    ocrReceivedThumbnail?: boolean;
    selectedRegion?: string;
    selectedRotation?: number;
    selectedVariant?: string;
    selectedConfidence?: number;
    stageTimings?: Record<string, number>;
    candidateSummaries?: Array<{
      region?: string;
      rotation?: number;
      variant?: string;
      confidence?: number;
      validRows?: number;
      summary?: string;
    }>;
  };
  error?: string;
};

type FiledPaymentImage = {
  id: string;
  storagePath: string;
  fileName: string;
} | null;

type CompletedPaymentSummary = {
  checkNumber: string;
  payor: string;
  totalAmount: number;
  invoiceCount: number;
} | null;

type CropDragTarget =
  | "move"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function daysPastDue(value?: string | null) {
  if (!value) {
    return null;
  }

  const dueDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor(
    (today.getTime() - dueDate.getTime()) / 86_400_000
  );
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const remittanceDocumentModes: Array<{
  value: RemittanceDocumentType;
  label: string;
  help: string;
}> = [
  {
    value: "remittance_stub",
    label: "Remittance Stub",
    help: "Best for invoice numbers and amounts.",
  },
  {
    value: "full_check_stub",
    label: "Full Check + Stub",
    help: "Use when check details are not on the stub.",
  },
  {
    value: "check_only",
    label: "Check Only",
    help: "Use for check details without invoice rows.",
  },
];

function defaultGuideModeForDocumentType(
  documentType: RemittanceDocumentType
): "horizontal" | "vertical" {
  void documentType;
  return "horizontal";
}

function guidanceForDocumentType(documentType: RemittanceDocumentType) {
  if (documentType === "full_check_stub") {
    return "Show the entire check and stub. For small text, capture the stub separately.";
  }

  if (documentType === "check_only") {
    return "Align the check face inside the frame.";
  }

  return "Fill the wide frame with the remittance rows.";
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("The remittance image could not be read."));
      }
    };
    reader.onerror = () => reject(new Error("The remittance image could not be read."));
    reader.readAsDataURL(file);
  });
}

async function imageElementFromFile(file: File) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("That image format could not be previewed."));
      image.src = imageUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The remittance image could not be prepared."));
          return;
        }

        void fileToDataUrl(blob).then(resolve, reject);
      },
      "image/jpeg",
      0.98
    );
  });
}

async function dataUrlToImageFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], fileName, {
    type: blob.type || "image/jpeg",
  });
}

function cropBoxForRotation(cropBox: CropBox, rotation: number): CropBox {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (normalizedRotation === 90) {
    return {
      left: 100 - cropBox.bottom,
      top: cropBox.left,
      right: 100 - cropBox.top,
      bottom: cropBox.right,
    };
  }

  if (normalizedRotation === 180) {
    return {
      left: 100 - cropBox.right,
      top: 100 - cropBox.bottom,
      right: 100 - cropBox.left,
      bottom: 100 - cropBox.top,
    };
  }

  if (normalizedRotation === 270) {
    return {
      left: cropBox.top,
      top: 100 - cropBox.right,
      right: cropBox.bottom,
      bottom: 100 - cropBox.left,
    };
  }

  return cropBox;
}

function cropBoxAreaRatio(cropBox: CropBox) {
  return (
    (Math.max(cropBox.right - cropBox.left, 0) *
      Math.max(cropBox.bottom - cropBox.top, 0)) /
    10_000
  );
}

function qualityMessageFromMetrics(
  effectiveWidth: number,
  effectiveHeight: number,
  documentAreaRatio: number,
  quality: ImageQualityReport
) {
  const messages: string[] = [];
  const shortestEdge = Math.min(effectiveWidth, effectiveHeight);

  if (documentAreaRatio < 0.32 || shortestEdge < 900) {
    messages.push("Move closer - document is too small.");
  }

  if (quality.blurScore < 8) {
    messages.push("Retake photo - image is blurry.");
  }

  if (quality.brightness < 70) {
    messages.push("More light needed.");
  }

  if (quality.contrast < 22) {
    messages.push("Use stronger lighting or a darker background.");
  }

  return messages;
}

async function inspectImageQuality(
  file: File,
  cropBox: CropBox
): Promise<ImageQualityReport> {
  const image = await imageElementFromFile(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const sourceX = Math.round((cropBox.left / 100) * naturalWidth);
  const sourceY = Math.round((cropBox.top / 100) * naturalHeight);
  const sourceWidth = Math.max(
    1,
    Math.round(((cropBox.right - cropBox.left) / 100) * naturalWidth)
  );
  const sourceHeight = Math.max(
    1,
    Math.round(((cropBox.bottom - cropBox.top) / 100) * naturalHeight)
  );
  const scanWidth = 360;
  const scale = Math.min(1, scanWidth / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to inspect the remittance photo.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height
  );

  const pixels = context.getImageData(0, 0, width, height).data;
  let total = 0;
  let totalSquared = 0;
  const grayscale = new Float32Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? red;
    const blue = pixels[offset + 2] ?? red;
    const value = red * 0.299 + green * 0.587 + blue * 0.114;

    grayscale[index] = value;
    total += value;
    totalSquared += value * value;
  }

  const count = Math.max(width * height, 1);
  const brightness = total / count;
  const variance = Math.max(totalSquared / count - brightness * brightness, 0);
  const contrast = Math.sqrt(variance);
  let laplacianTotal = 0;
  let laplacianCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = grayscale[y * width + x] ?? 0;
      const laplacian =
        Math.abs(
          (grayscale[(y - 1) * width + x] ?? center) +
            (grayscale[(y + 1) * width + x] ?? center) +
            (grayscale[y * width + x - 1] ?? center) +
            (grayscale[y * width + x + 1] ?? center) -
            center * 4
        );

      laplacianTotal += laplacian;
      laplacianCount += 1;
    }
  }

  const blurScore = laplacianTotal / Math.max(laplacianCount, 1);
  const ok = brightness >= 70 && contrast >= 22 && blurScore >= 8;

  return {
    ok,
    message: ok ? "Ready" : "Retake or adjust crop before reading.",
    brightness,
    contrast,
    blurScore,
  };
}

async function detectDefaultCropBox(file: File): Promise<CropSuggestion> {
  const fullImageCrop = {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  };

  try {
    const image = await imageElementFromFile(file);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const scanWidth = 420;
    const scale = Math.min(1, scanWidth / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("Unable to inspect the remittance photo.");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let hits = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset] ?? 0;
        const green = pixels[offset + 1] ?? red;
        const blue = pixels[offset + 2] ?? red;
        const brightness = (red + green + blue) / 3;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const looksLikePaper =
          (brightness > 142 && chroma < 70) || brightness > 190;

        if (looksLikePaper) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          hits += 1;
        }
      }
    }

    const paperPixelRatio = hits / (width * height);

    if (hits < 500 || paperPixelRatio < 0.06) {
      throw new Error("Use the center crop fallback.");
    }

    const boundsAreaRatio =
      ((maxX - minX + 1) * (maxY - minY + 1)) / (width * height);
    const touchesEdges =
      minX <= width * 0.04 &&
      minY <= height * 0.04 &&
      maxX >= width * 0.96 &&
      maxY >= height * 0.96;
    const isTightlyFramed =
      paperPixelRatio > 0.72 || boundsAreaRatio > 0.78 || touchesEdges;
    const padX = Math.round((maxX - minX) * 0.06);
    const padY = Math.round((maxY - minY) * 0.06);
    const cropBox = isTightlyFramed
      ? fullImageCrop
      : {
          left: Math.max(0, Math.round(((minX - padX) / width) * 100)),
          top: Math.max(0, Math.round(((minY - padY) / height) * 100)),
          right: Math.min(100, Math.round(((maxX + padX) / width) * 100)),
          bottom: Math.min(100, Math.round(((maxY + padY) / height) * 100)),
        };
    const effectiveWidth = Math.round(
      ((cropBox.right - cropBox.left) / 100) * naturalWidth
    );
    const effectiveHeight = Math.round(
      ((cropBox.bottom - cropBox.top) / 100) * naturalHeight
    );
    const quality = await inspectImageQuality(file, cropBox);
    const documentAreaRatio = isTightlyFramed
      ? 1
      : Math.max(boundsAreaRatio, cropBoxAreaRatio(cropBox));
    const qualityMessages = qualityMessageFromMetrics(
      effectiveWidth,
      effectiveHeight,
      documentAreaRatio,
      quality
    );
    const confidence =
      qualityMessages.length === 0 && documentAreaRatio >= 0.42
        ? "high"
        : qualityMessages.length <= 1 && documentAreaRatio >= 0.28
          ? "medium"
          : "low";
    const shouldAutoRead =
      confidence === "high" &&
      Math.min(effectiveWidth, effectiveHeight) >= 1000 &&
      quality.ok;

    if (isTightlyFramed) {
      return {
        cropBox,
        isTightlyFramed: true,
        documentAreaRatio,
        effectiveWidth,
        effectiveHeight,
        confidence,
        qualityMessages,
        shouldAutoRead,
      };
    }

    return {
      cropBox,
      isTightlyFramed: false,
      documentAreaRatio,
      effectiveWidth,
      effectiveHeight,
      confidence,
      qualityMessages,
      shouldAutoRead,
    };
  } catch {
    return {
      cropBox: {
        left: 8,
        top: 8,
        right: 92,
        bottom: 92,
      },
      isTightlyFramed: false,
      documentAreaRatio: 0.7,
      effectiveWidth: 0,
      effectiveHeight: 0,
      confidence: "low",
      qualityMessages: ["Adjust crop around the remittance before reading."],
      shouldAutoRead: false,
    };
  }
}

async function cropPhotoForOcr(file: File, cropBox: CropBox, rotation: number) {
  const image = await imageElementFromFile(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const sourceCropBox = cropBoxForRotation(cropBox, rotation);
  const sourceX = Math.round((sourceCropBox.left / 100) * naturalWidth);
  const sourceY = Math.round((sourceCropBox.top / 100) * naturalHeight);
  const sourceWidth = Math.max(
    1,
    Math.round(((sourceCropBox.right - sourceCropBox.left) / 100) * naturalWidth)
  );
  const sourceHeight = Math.max(
    1,
    Math.round(((sourceCropBox.bottom - sourceCropBox.top) / 100) * naturalHeight)
  );
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotatedSideways = normalizedRotation === 90 || normalizedRotation === 270;
  const maxEdge = 4600;
  const minReadableEdge = 3200;
  const scale = Math.min(
    maxEdge / Math.max(sourceWidth, sourceHeight),
    Math.max(1, minReadableEdge / Math.max(sourceWidth, sourceHeight))
  );
  const outputWidth = Math.max(
    1,
    Math.round((rotatedSideways ? sourceHeight : sourceWidth) * scale)
  );
  const outputHeight = Math.max(
    1,
    Math.round((rotatedSideways ? sourceWidth : sourceHeight) * scale)
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The remittance crop could not be prepared.");
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.translate(outputWidth / 2, outputHeight / 2);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -(sourceWidth * scale) / 2,
    -(sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale
  );

  return canvasToJpegDataUrl(canvas);
}

function safeStorageFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "payment-image.jpg";
}

function initialCustomerFocus(
  invoices: BatchInvoice[],
  customerName?: string | null
) {
  const focusedCustomer = customerName?.trim();

  if (!focusedCustomer) {
    return null;
  }

  const matchingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      amountDue:
        typeof invoice.collectionAmountDue === "number"
          ? Math.max(invoice.collectionAmountDue, 0)
          : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
    }))
    .filter(
      (invoice) =>
        invoice.customerName.toLowerCase() ===
          focusedCustomer.toLowerCase() &&
        isCollectibleInvoiceStatus(invoice.status) &&
        invoice.amountDue > 0
    );

  if (matchingInvoices.length === 0) {
    return null;
  }

  return {
    customerName: matchingInvoices[0].customerName,
    invoiceIds: matchingInvoices.map((invoice) => invoice.id),
    total: matchingInvoices.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    ),
  };
}

function initialInvoiceFocus(
  invoices: BatchInvoice[],
  invoiceIds?: string[]
) {
  if (!invoiceIds || invoiceIds.length === 0) {
    return null;
  }

  const requestedIds = new Set(invoiceIds);
  const matchingInvoices = invoices
    .map((invoice) => ({
      ...invoice,
      amountDue:
        typeof invoice.collectionAmountDue === "number"
          ? Math.max(invoice.collectionAmountDue, 0)
          : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
    }))
    .filter(
      (invoice) =>
        requestedIds.has(invoice.id) &&
        isCollectibleInvoiceStatus(invoice.status) &&
        invoice.amountDue > 0
    );

  if (matchingInvoices.length === 0) {
    return null;
  }

  const customerNames = Array.from(
    new Set(matchingInvoices.map((invoice) => invoice.customerName))
  );

  return {
    customerName:
      customerNames.length === 1
        ? customerNames[0]
        : `${customerNames.length} customers`,
    invoiceIds: matchingInvoices.map((invoice) => invoice.id),
    total: matchingInvoices.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    ),
  };
}

export default function BatchInvoicePayments({
  invoices,
  businessId,
  businessSlug,
  initialCustomer,
  initialInvoiceIds,
}: BatchInvoicePaymentsProps) {
  const router = useRouter();
  const startingFocus =
    initialInvoiceFocus(invoices, initialInvoiceIds) ??
    initialCustomerFocus(invoices, initialCustomer);
  const startedFromInvoiceSelection =
    Boolean(initialInvoiceIds?.length) && Boolean(startingFocus);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    startingFocus?.invoiceIds ?? []
  );
  const [paymentDate, setPaymentDate] = useState(todayInputValue());
  const [paymentType, setPaymentType] = useState("Check");
  const [paymentReference, setPaymentReference] = useState("");
  const [checkAmount, setCheckAmount] = useState(
    startingFocus ? formatMoney(startingFocus.total) : ""
  );
  const [checkImagePreview, setCheckImagePreview] = useState("");
  const [checkImageName, setCheckImageName] = useState("");
  const [checkImageFile, setCheckImageFile] = useState<File | null>(null);
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null);
  const [cropBox, setCropBox] = useState<CropBox>({
    left: 8,
    top: 8,
    right: 92,
    bottom: 92,
  });
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraViewportRef = useRef<HTMLDivElement | null>(null);
  const cameraGuideRef = useRef<HTMLDivElement | null>(null);
  const cameraOverlayRef = useRef<HTMLDivElement | null>(null);
  const captureButtonRef = useRef<HTMLButtonElement | null>(null);
  const checkOnlyModeButtonRef = useRef<HTMLButtonElement | null>(null);
  const deviceCameraLabelRef = useRef<HTMLLabelElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lastCapturePointerAtRef = useRef(0);
  const cropDragRef = useRef<{
    target: CropDragTarget;
    startX: number;
    startY: number;
    startBox: CropBox;
  } | null>(null);
  const [cropRotation, setCropRotation] = useState(0);
  const [cropPreviewAspectRatio, setCropPreviewAspectRatio] = useState(4 / 3);
  const [isTightlyFramedRemittance, setIsTightlyFramedRemittance] =
    useState(false);
  const [captureQualityMessage, setCaptureQualityMessage] = useState("");
  const [captureQualityDetails, setCaptureQualityDetails] = useState("");
  const [cameraStatusMessage, setCameraStatusMessage] = useState(
    "Align the remittance inside the frame."
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraQualityReady, setCameraQualityReady] = useState(false);
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const [cameraVisualViewport, setCameraVisualViewport] =
    useState<CameraVisualViewport | null>(null);
  const [cameraDiagnosticsEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      new URLSearchParams(window.location.search).get("trimaxCameraDebug") ===
        "1" ||
      window.localStorage.getItem("trimax.cameraDiagnostics") === "1"
    );
  });
  const [cameraGeometryDiagnostics, setCameraGeometryDiagnostics] =
    useState<CameraGeometryDiagnostics | null>(null);
  const [cameraPipelineStages, setCameraPipelineStages] = useState<string[]>([]);
  const [cameraFailureStage, setCameraFailureStage] = useState("");
  const [cameraVideoPlayStatus, setCameraVideoPlayStatus] =
    useState("not-started");
  const [cameraGuideMode, setCameraGuideMode] = useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [captureDocumentType, setCaptureDocumentType] =
    useState<RemittanceDocumentType>("remittance_stub");
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>("primary");
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);
  const [filedPaymentImage, setFiledPaymentImage] =
    useState<FiledPaymentImage>(null);
  const [checkPayor, setCheckPayor] = useState("");
  const [capturedCheckAmount, setCapturedCheckAmount] = useState(
    startingFocus ? formatMoney(startingFocus.total) : ""
  );
  const [capturedCheckReference, setCapturedCheckReference] = useState("");
  const [extractedPaymentAmount, setExtractedPaymentAmount] = useState<
    number | null
  >(null);
  const [reviewMatchedInvoices, setReviewMatchedInvoices] = useState<
    ReviewMatchedInvoice[]
  >([]);
  const [paymentReviewNotice, setPaymentReviewNotice] = useState("");
  const [completedPaymentSummary, setCompletedPaymentSummary] =
    useState<CompletedPaymentSummary>(null);
  const [remittanceStubText, setRemittanceStubText] = useState("");
  const [checkOcrStatus, setCheckOcrStatus] = useState<CheckOcrStatus>("idle");
  const [paymentEntryMode, setPaymentEntryMode] =
    useState<PaymentEntryMode>("choice");
  const [checkOcrMessage, setCheckOcrMessage] = useState(
    "Upload a remittance stub or enter the payment manually."
  );
  const [internalNote, setInternalNote] = useState(
    startedFromInvoiceSelection
      ? "Selected invoice batch payment"
      : startingFocus
        ? `${startingFocus.customerName} batch payment`
        : ""
  );
  const [customerFilter, setCustomerFilter] = useState(
    startedFromInvoiceSelection ? "all" : startingFocus?.customerName ?? "all"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const invoiceRecords = useMemo<PayableInvoice[]>(
    () =>
      invoices
        .map((invoice) => {
          const amountDue =
            typeof invoice.collectionAmountDue === "number"
              ? Math.max(invoice.collectionAmountDue, 0)
              : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0);

          return {
            ...invoice,
            amountDue,
            daysLate: daysPastDue(invoice.dueDate),
            isOverdue: isOverdueCollectibleInvoice({
              invoice: {
                ...invoice,
                invoice_amount: invoice.invoiceAmount,
                amount_paid: invoice.amountPaid,
                due_date: invoice.dueDate,
              },
              todayKey: businessDateKey(),
            }),
          };
        }),
    [invoices]
  );
  const payableInvoices = useMemo(
    () =>
      invoiceRecords.filter(
        (invoice) =>
          isCollectibleInvoiceStatus(invoice.status) &&
          invoice.amountDue > 0
      ),
    [invoiceRecords]
  );

  const visibleInvoices =
    customerFilter === "all"
      ? payableInvoices
      : payableInvoices.filter(
          (invoice) => invoice.customerName === customerFilter
        );

  const selectedInvoices = payableInvoices.filter((invoice) =>
    selectedIds.includes(invoice.id)
  );

  const selectedTotal = selectedInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const selectedCustomerGroups = new Map<
    string,
    { customerName: string; count: number; total: number }
  >();

  selectedInvoices.forEach((invoice) => {
    const customerName = invoice.customerName || "Unknown Customer";
    const current = selectedCustomerGroups.get(customerName) ?? {
      customerName,
      count: 0,
      total: 0,
    };

    selectedCustomerGroups.set(customerName, {
      customerName,
      count: current.count + 1,
      total: current.total + invoice.amountDue,
    });
  });

  const selectedCustomerBreakdown = Array.from(
    selectedCustomerGroups.values()
  ).sort((first, second) =>
    first.customerName.localeCompare(second.customerName)
  );

  const visibleTotal = visibleInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const openBalance = payableInvoices.reduce(
    (total, invoice) => total + invoice.amountDue,
    0
  );

  const isRemittanceReview =
    paymentEntryMode === "photo" && checkOcrStatus === "ready";
  const visibleCheckAmount =
    isRemittanceReview && extractedPaymentAmount && extractedPaymentAmount > 0
      ? formatMoney(extractedPaymentAmount)
      : parseMoney(checkAmount) > 0 || !capturedCheckAmount.trim()
      ? checkAmount
      : capturedCheckAmount;
  const enteredCheckAmount = visibleCheckAmount.trim()
    ? parseMoney(visibleCheckAmount)
    : null;
  const checkDifference =
    enteredCheckAmount === null
      ? 0
      : Number((enteredCheckAmount - selectedTotal).toFixed(2));
  const checkAmountMatches =
    enteredCheckAmount === null || Math.abs(checkDifference) < 0.01;
  const checkDifferenceLabel =
    checkDifference > 0 ? "unassigned" : "over-selected";
  const selectedRemainingBalance = Math.max(openBalance - selectedTotal, 0);
  const allVisibleSelected =
    visibleInvoices.length > 0 &&
    visibleInvoices.every((invoice) => selectedIds.includes(invoice.id));

  const capturedAmountValue = capturedCheckAmount.trim()
    ? parseMoney(capturedCheckAmount)
    : 0;
  const remittanceMatch = useMemo(
    () => findRemittanceMatches(invoiceRecords, remittanceStubText, checkPayor),
    [checkPayor, invoiceRecords, remittanceStubText]
  );
  const hasRemittanceStub = remittanceStubText.trim().length > 0;
  const showPaymentReview =
    paymentEntryMode === "manual" ||
    (paymentEntryMode === "photo" &&
      checkOcrStatus !== "reading" &&
      checkOcrStatus !== "idle");
  const showManualInvoiceBrowser = paymentEntryMode === "manual";
  const paymentCanApply =
    !isSaving &&
    selectedInvoices.length > 0 &&
    enteredCheckAmount !== null &&
    checkAmountMatches &&
    (!isRemittanceReview ||
      (extractedPaymentAmount !== null &&
        extractedPaymentAmount > 0 &&
        Math.abs(selectedTotal - extractedPaymentAmount) < 0.01 &&
        reviewMatchedInvoices.length === selectedInvoices.length));

  useEffect(() => {
    return () => {
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
      }
    };
  }, [checkImagePreview]);

  function appendCameraStage(stage: string) {
    setCameraPipelineStages((current) => [...current.slice(-7), stage]);
  }

  function rectSnapshot(element: Element | null): CameraRectSnapshot | null {
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();

    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      bottom: Math.round(rect.bottom),
      right: Math.round(rect.right),
    };
  }

  function describeElement(element: Element | null) {
    if (!element) {
      return "none";
    }

    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const testId = element.getAttribute("data-camera-control")
      ? `[data-camera-control="${element.getAttribute("data-camera-control")}"]`
      : "";
    const capture = element.getAttribute("data-camera-capture-button")
      ? "[data-camera-capture-button]"
      : "";
    const classes =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";

    return `${tag}${id}${testId}${capture}${classes}`;
  }

  const collectCameraGeometryDiagnostics = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;
    const video = cameraVideoRef.current;
    const videoStyle = video ? window.getComputedStyle(video) : null;
    const stream =
      video?.srcObject instanceof MediaStream ? video.srcObject : null;
    const visualViewport = {
      left: Math.round(viewport?.offsetLeft ?? 0),
      top: Math.round(viewport?.offsetTop ?? 0),
      width: Math.round(viewport?.width ?? window.innerWidth),
      height: Math.round(viewport?.height ?? window.innerHeight),
    };
    const captureRect = rectSnapshot(captureButtonRef.current);
    const checkOnlyRect = rectSnapshot(checkOnlyModeButtonRef.current);
    const deviceRect = rectSnapshot(deviceCameraLabelRef.current);
    const hitPoints = [
      captureRect
        ? {
            point: "capture-center",
            x: captureRect.left + captureRect.width / 2,
            y: captureRect.top + captureRect.height / 2,
          }
        : null,
      captureRect
        ? {
            point: "capture-top-edge",
            x: captureRect.left + captureRect.width / 2,
            y: captureRect.top + 2,
          }
        : null,
      captureRect
        ? {
            point: "capture-bottom-edge",
            x: captureRect.left + captureRect.width / 2,
            y: captureRect.bottom - 2,
          }
        : null,
      checkOnlyRect
        ? {
            point: "check-only-center",
            x: checkOnlyRect.left + checkOnlyRect.width / 2,
            y: checkOnlyRect.top + checkOnlyRect.height / 2,
          }
        : null,
      deviceRect
        ? {
            point: "use-device-camera-center",
            x: deviceRect.left + deviceRect.width / 2,
            y: deviceRect.top + deviceRect.height / 2,
          }
        : null,
    ].filter((point): point is { point: string; x: number; y: number } =>
      Boolean(point)
    );
    const hitTests = hitPoints.map((point) => ({
      point: point.point,
      x: Math.round(point.x),
      y: Math.round(point.y),
      element: describeElement(document.elementFromPoint(point.x, point.y)),
    }));
    const ancestorStyles: string[] = [];
    let ancestor: HTMLElement | null = cameraOverlayRef.current;

    while (ancestor && ancestorStyles.length < 8) {
      const style = window.getComputedStyle(ancestor);

      ancestorStyles.push(
        `${describeElement(ancestor)} position=${style.position} transform=${style.transform} scale=${style.scale} translate=${style.translate} zoom=${style.zoom}`
      );
      ancestor = ancestor.parentElement;
    }

    setCameraGeometryDiagnostics({
      layoutViewport: {
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight),
      },
      visualViewport,
      devicePixelRatio: window.devicePixelRatio,
      video: {
        hasSrcObject: Boolean(stream),
        activeTracks:
          stream?.getVideoTracks().filter((track) => track.readyState === "live")
            .length ?? 0,
        readyState: video?.readyState ?? 0,
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        playStatus: cameraVideoPlayStatus,
        computedStyle: {
          display: videoStyle?.display ?? "",
          visibility: videoStyle?.visibility ?? "",
          opacity: videoStyle?.opacity ?? "",
          filter: videoStyle?.filter ?? "",
          mixBlendMode: videoStyle?.mixBlendMode ?? "",
          objectFit: videoStyle?.objectFit ?? "",
          background: videoStyle?.backgroundColor ?? "",
          zIndex: videoStyle?.zIndex ?? "",
          transform: videoStyle?.transform ?? "",
        },
      },
      overlay: rectSnapshot(cameraOverlayRef.current),
      videoRect: rectSnapshot(video),
      preview: rectSnapshot(cameraViewportRef.current),
      guide: rectSnapshot(cameraGuideRef.current),
      capture: captureRect,
      checkOnly: checkOnlyRect,
      useDeviceCamera: deviceRect,
      hitTests,
      ancestorStyles,
    });
  }, [cameraVideoPlayStatus]);

  useEffect(() => {
    if (paymentEntryMode !== "camera") {
      stopCameraCapture();
      return;
    }

    let canceled = false;

    async function startCameraCapture() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraReady(false);
        setCameraStatusMessage(
          "Camera guide ready. Use the capture button below if live preview is unavailable."
        );
        return;
      }

      setCameraStatusMessage("Starting camera...");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (canceled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = stream;

        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.setAttribute("playsinline", "true");
          cameraVideoRef.current.setAttribute("webkit-playsinline", "true");

          try {
            await cameraVideoRef.current.play();
            setCameraVideoPlayStatus("playing");
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Video play rejected.";

            setCameraVideoPlayStatus(`play-rejected: ${message}`);
            setCameraStatusMessage(`Preview blocked: ${message}`);
          }
        }

        setCameraReady(true);
        setCameraQualityReady(false);
        setCameraStatusMessage("Move closer");
      } catch {
        setCameraReady(false);
        setCameraQualityReady(false);
        setCameraStatusMessage(
          "Live camera unavailable. Use the capture button inside the guide."
        );
      }
    }

    void startCameraCapture();

    return () => {
      canceled = true;
      stopCameraCapture();
    };
  }, [paymentEntryMode]);

  useEffect(() => {
    const captureActive = paymentEntryMode === "camera";

    document.body.classList.toggle(
      "trimax-remittance-capture-active",
      captureActive
    );
    window.dispatchEvent(new Event("trimax-remittance-capture-mode"));

    if (!captureActive) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlTouchAction = document.documentElement.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";
    let viewportFrame = 0;

    function updateCameraVisualViewport() {
      if (viewportFrame) {
        window.cancelAnimationFrame(viewportFrame);
      }

      viewportFrame = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;

        setCameraVisualViewport({
          left: 0,
          top: 0,
          width: Math.round(viewport?.width ?? window.innerWidth),
          height: Math.round(viewport?.height ?? window.innerHeight),
        });

        if (cameraDiagnosticsEnabled) {
          window.requestAnimationFrame(collectCameraGeometryDiagnostics);
        }
      });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        stopCameraCapture();
        setPaymentEntryMode("choice");
        setCameraStatusMessage("Align the remittance inside the frame.");
      }
    }

    updateCameraVisualViewport();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateCameraVisualViewport);
    window.addEventListener("orientationchange", updateCameraVisualViewport);
    window.visualViewport?.addEventListener("resize", updateCameraVisualViewport);
    window.visualViewport?.addEventListener("scroll", updateCameraVisualViewport);

    return () => {
      if (viewportFrame) {
        window.cancelAnimationFrame(viewportFrame);
      }

      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.touchAction = previousHtmlTouchAction;
      document.body.classList.remove("trimax-remittance-capture-active");
      window.dispatchEvent(new Event("trimax-remittance-capture-mode"));
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateCameraVisualViewport);
      window.removeEventListener("orientationchange", updateCameraVisualViewport);
      window.visualViewport?.removeEventListener(
        "resize",
        updateCameraVisualViewport
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateCameraVisualViewport
      );
    };
  }, [
    cameraDiagnosticsEnabled,
    collectCameraGeometryDiagnostics,
    paymentEntryMode,
  ]);

  useEffect(() => {
    if (paymentEntryMode !== "camera" || !cameraDiagnosticsEnabled) {
      return;
    }

    collectCameraGeometryDiagnostics();
    const interval = window.setInterval(collectCameraGeometryDiagnostics, 750);

    return () => window.clearInterval(interval);
  }, [
    cameraDiagnosticsEnabled,
    collectCameraGeometryDiagnostics,
    paymentEntryMode,
  ]);

  function toggleInvoice(invoiceId: string) {
    setSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  function toggleAllVisible() {
    const visibleIds = visibleInvoices.map((invoice) => invoice.id);

    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function selectInvoicesAndAmount(
    invoiceList: PayableInvoice[],
    note: string
  ) {
    const invoiceIds = invoiceList.map((invoice) => invoice.id);
    const invoiceTotal = invoiceList.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    );

    setSelectedIds(invoiceIds);
    setCheckAmount(invoiceIds.length > 0 ? formatMoney(invoiceTotal) : "");
    setInternalNote(invoiceIds.length > 0 ? note : "");
  }

  function selectVisibleInvoices() {
    selectInvoicesAndAmount(
      visibleInvoices,
      customerFilter === "all"
        ? "Visible invoice batch payment"
        : `${customerFilter} batch payment`
    );
  }

  function selectOverdueInvoices() {
    const overdueInvoices = payableInvoices.filter(
      (invoice) => invoice.isOverdue
    );

    setCustomerFilter("all");
    selectInvoicesAndAmount(overdueInvoices, "Overdue invoice batch payment");
  }

  function fillSelectedTotal() {
    setCheckAmount(formatMoney(selectedTotal));
  }

  function clearSelection() {
    setSelectedIds([]);
    setCheckAmount("");
  }

  function invoiceLookupKeys(invoice: PayableInvoice) {
    const keys = new Set<string>();
    const candidates = [
      invoice.displayId,
      invoice.projectTitle,
      invoice.customerName,
    ];

    candidates.forEach((candidate) => {
      const normalized = normalizeInvoiceNumber(candidate);

      if (normalized) {
        keys.add(normalized);
      }

      extractInvoiceNumbers(candidate).forEach((invoiceNumber) =>
        keys.add(invoiceNumber)
      );

      for (const match of candidate.matchAll(/\b0*(\d{3,6})\b/g)) {
        const normalizedDigits = normalizeInvoiceNumber(match[1] ?? "");

        if (normalizedDigits) {
          keys.add(normalizedDigits);
        }
      }
    });

    return Array.from(keys);
  }

  function extractedInvoiceNumbersFromResponse(
    data: CheckStubOcrResponse,
    stubText: string
  ) {
    const invoiceNumbers = new Set<string>(extractInvoiceNumbers(stubText));

    data.lines?.forEach((line) => {
      if (!Array.isArray(line.invoiceNumbers)) {
        return;
      }

      line.invoiceNumbers.forEach((invoiceNumber) => {
        if (typeof invoiceNumber !== "string") {
          return;
        }

        const normalized = normalizeInvoiceNumber(invoiceNumber);

        if (normalized) {
          invoiceNumbers.add(normalized);
        }
      });
    });

    return Array.from(invoiceNumbers);
  }

  function extractedLineAmountsByInvoice(data: CheckStubOcrResponse) {
    const amountsByInvoice = new Map<string, number>();

    data.lines?.forEach((line) => {
      if (!Array.isArray(line.invoiceNumbers)) {
        return;
      }

      const amount =
        typeof line.amount === "number"
          ? line.amount
          : typeof line.amount === "string"
            ? parseMoney(line.amount)
            : 0;

      line.invoiceNumbers.forEach((invoiceNumber) => {
        if (typeof invoiceNumber !== "string") {
          return;
        }

        const normalized = normalizeInvoiceNumber(invoiceNumber);

        if (normalized && amount > 0) {
          amountsByInvoice.set(normalized, amount);
        }
      });
    });

    return amountsByInvoice;
  }

  function matchInvoicesFromExtraction(
    data: CheckStubOcrResponse,
    stubText: string
  ): ReviewMatchedInvoice[] {
    const amountsByInvoice = extractedLineAmountsByInvoice(data);
    const invoicesByNumber = new Map(
      payableInvoices
        .flatMap((invoice) =>
          invoiceLookupKeys(invoice).map(
            (invoiceNumber) => [invoiceNumber, invoice] as const
          )
        )
    );

    return extractedInvoiceNumbersFromResponse(data, stubText)
      .map((invoiceNumber) => {
        const invoice = invoicesByNumber.get(invoiceNumber);

        return invoice
          ? {
              ...invoice,
              remittanceAmount: amountsByInvoice.get(invoiceNumber) ?? null,
            }
          : null;
      })
      .filter((invoice): invoice is ReviewMatchedInvoice => Boolean(invoice));
  }

  function reconcileReviewMatches(
    matches: ReviewMatchedInvoice[],
    extractedTotal: number
  ) {
    const invoiceTotal = Number(
      matches.reduce((total, invoice) => total + invoice.amountDue, 0).toFixed(2)
    );
    const ocrLineTotal = Number(
      matches
        .reduce(
          (total, invoice) => total + (invoice.remittanceAmount ?? invoice.amountDue),
          0
        )
        .toFixed(2)
    );
    const invoiceTotalMatchesCheck =
      extractedTotal > 0 &&
      matches.length > 0 &&
      Math.abs(invoiceTotal - extractedTotal) < 0.01;
    const ocrTotalMismatchesCheck =
      extractedTotal > 0 && Math.abs(ocrLineTotal - extractedTotal) >= 0.01;
    const corrected = matches.map((invoice) => {
      const remittanceAmount = invoice.remittanceAmount;
      const shouldUseInvoiceBalance =
        remittanceAmount !== null &&
        Math.abs(remittanceAmount - invoice.amountDue) >= 0.01 &&
        invoiceTotalMatchesCheck;

      return {
        ...invoice,
        remittanceAmount: shouldUseInvoiceBalance
          ? invoice.amountDue
          : remittanceAmount,
      };
    });
    const correctedAny = corrected.some(
      (invoice, index) =>
        matches[index]?.remittanceAmount !== null &&
        matches[index]?.remittanceAmount !== invoice.remittanceAmount
    );
    const isComplete = invoiceTotalMatchesCheck;
    const difference = Number((extractedTotal - invoiceTotal).toFixed(2));
    const notice =
      correctedAny && ocrTotalMismatchesCheck
        ? "Line amount reviewed against Trimax invoice balances and the remittance total."
        : extractedTotal <= 0 && matches.length > 0
          ? "Document total not found. Enter the check amount and verify the selected invoices."
        : extractedTotal > 0 &&
            matches.length > 0 &&
            Math.abs(invoiceTotal - extractedTotal) >= 0.01
          ? `Remittance total does not match selected invoices. Document total: ${formatMoney(extractedTotal)}. Matched invoices: ${formatMoney(invoiceTotal)}. Difference: ${formatMoney(Math.abs(difference))}.`
          : "";

    return {
      matches: isComplete || extractedTotal <= 0 ? corrected : [],
      notice,
      invoiceTotal,
      isComplete,
    };
  }

  function loadExtractedRemittance(data: CheckStubOcrResponse) {
    const stubText = data.stubText?.trim() ?? "";
    const extractedPayor =
      data.payor?.trim() || extractLikelyPayor(stubText);
    const extractedCheckNumber =
      data.checkNumber?.trim() || extractCheckNumber(stubText);
    const parsedTotalFromResponse =
      typeof data.totalAmount === "number" && data.totalAmount > 0
        ? data.totalAmount
        : 0;
    const parsedTotalFromStub = findRemittanceMatches(
      invoiceRecords,
      stubText,
      extractedPayor
    ).totalAmount;
    const parsedTotalFromLines =
      data.lines?.reduce((total, line) => {
        const amount =
          typeof line.amount === "number"
            ? line.amount
            : typeof line.amount === "string"
              ? parseMoney(line.amount)
              : 0;

        return total + amount;
      }, 0) ?? 0;
    const extractedTotal =
      parsedTotalFromResponse || parsedTotalFromStub || parsedTotalFromLines;
    const extractedDate = data.checkDate?.trim()
      ? parseCheckDate(data.checkDate)
      : extractCheckDate(stubText);
    const match = findRemittanceMatches(
      invoiceRecords,
      stubText,
      extractedPayor
    );
    const rawReviewMatchesFromParser = match.matches
      .map((matchedInvoice): ReviewMatchedInvoice | null => {
        const invoice = payableInvoices.find(
          (payableInvoice) => payableInvoice.id === matchedInvoice.id
        );

        return invoice
          ? {
              ...invoice,
              remittanceAmount: matchedInvoice.amountDue,
            }
          : null;
      })
      .filter((invoice): invoice is ReviewMatchedInvoice => Boolean(invoice));
    const rawReviewMatches =
      rawReviewMatchesFromParser.length > 0
        ? rawReviewMatchesFromParser
        : matchInvoicesFromExtraction(data, stubText);
    const reconciledReview = reconcileReviewMatches(
      rawReviewMatches,
      extractedTotal
    );
    const reviewMatches = reconciledReview.matches;
    const matchedCustomers = Array.from(
      new Set(reviewMatches.map((invoice) => invoice.customerName))
    );
    const selectedTotalFromMatch = match.matches.reduce(
      (total, invoice) => total + invoice.amountDue,
      0
    );
    const selectedTotalFromReviewMatches = reviewMatches.reduce(
      (total, invoice) => total + (invoice.remittanceAmount ?? invoice.amountDue),
      0
    );
    const paymentAmount =
      extractedTotal > 0
        ? extractedTotal
        : selectedTotalFromReviewMatches || selectedTotalFromMatch;
    const paymentAmountText =
      paymentAmount > 0 ? formatMoney(paymentAmount) : "";

    setRemittanceStubText(stubText);
    setPaymentType("Check");
    setReviewMatchedInvoices(reviewMatches);
    setSelectedIds(reviewMatches.map((invoice) => invoice.id));
    if (paymentAmount > 0) {
      setExtractedPaymentAmount(paymentAmount);
      setCheckAmount(paymentAmountText);
      setCapturedCheckAmount(paymentAmountText);
    }
    if (extractedCheckNumber) {
      setPaymentReference(extractedCheckNumber);
      setCapturedCheckReference(extractedCheckNumber);
    }
    setCheckPayor((current) => extractedPayor || current);
    setPaymentReviewNotice(reconciledReview.notice);

    if (extractedDate) {
      setPaymentDate(extractedDate);
    }

    setCustomerFilter(matchedCustomers.length === 1 ? matchedCustomers[0] : "all");
    setInternalNote(
      reviewMatches.length > 0
        ? `Remittance stub match${
            checkImageName ? ` from ${checkImageName}` : ""
          }`
        : "Remittance stub review"
    );

    return { match, reviewMatches, reconciledReview };
  }

  function loadCheckDetailsFromExtraction(data: CheckStubOcrResponse) {
    const stubText = data.stubText?.trim() ?? "";
    const extractedPayor =
      data.payor?.trim() || extractLikelyPayor(stubText);
    const extractedCheckNumber =
      data.checkNumber?.trim() || extractCheckNumber(stubText);
    const extractedDate = data.checkDate?.trim()
      ? parseCheckDate(data.checkDate)
      : extractCheckDate(stubText);
    const extractedTotal =
      typeof data.totalAmount === "number" && data.totalAmount > 0
        ? data.totalAmount
        : 0;

    if (stubText) {
      setRemittanceStubText((current) =>
        current.trim()
          ? `${current}\n\n--- CHECK PHOTO ---\n${stubText}`
          : stubText
      );
    }

    if (extractedCheckNumber && !paymentReference.trim()) {
      setPaymentReference(extractedCheckNumber);
      setCapturedCheckReference(extractedCheckNumber);
    }

    if (extractedDate) {
      setPaymentDate((current) => current || extractedDate);
    }

    if (extractedPayor && !checkPayor.trim()) {
      setCheckPayor(extractedPayor);
    }

    if (extractedTotal > 0 && parseMoney(visibleCheckAmount) <= 0) {
      const amountText = formatMoney(extractedTotal);

      setExtractedPaymentAmount(extractedTotal);
      setCheckAmount(amountText);
      setCapturedCheckAmount(amountText);
    }

    setPaymentReviewNotice((current) =>
      current || "Check photo used only for missing check details."
    );
  }

  function ocrFailureMessage(data: CheckStubOcrResponse) {
    const summary = data.diagnostics?.summary ?? [];
    const found = (label: string) =>
      summary.some((item) => item.toLowerCase().includes(label.toLowerCase()));
    const hasCheckNumber = Boolean(data.checkNumber?.trim()) || found("Check number found");
    const hasDate = Boolean(data.checkDate?.trim()) || found("Payment date found");
    const hasTotal = typeof data.totalAmount === "number" && data.totalAmount > 0;
    const confirmedInvoiceCount =
      data.lines?.filter(
        (line) =>
          Array.isArray(line.invoiceNumbers) &&
          line.invoiceNumbers.length > 0 &&
          ((typeof line.amount === "number" && line.amount > 0) ||
            (typeof line.amount === "string" && parseMoney(line.amount) > 0))
      ).length ?? 0;
    const hasInvoiceFragments = Boolean(
      data.lines?.some(
        (line) =>
          Array.isArray(line.invoiceNumbers) && line.invoiceNumbers.length > 0
      ) ||
        summary.some((item) =>
          item
            .toLowerCase()
            .includes("invoice text was detected")
        )
    );

    if ((hasCheckNumber || hasDate) && !hasTotal && confirmedInvoiceCount === 0) {
      return "Check details were found, but the amount and remittance rows were not. Adjust crop around the invoice rows or enter the missing amount/invoices manually.";
    }

    if (!hasTotal && confirmedInvoiceCount > 0) {
      return "Invoice rows were found, but the document total was not confirmed. Enter the check amount and verify the selected invoices.";
    }

    if (hasTotal && confirmedInvoiceCount === 0) {
      if (hasInvoiceFragments) {
        return "Some text was detected, but invoice rows could not be confirmed. Invoice numbers or amounts are missing.";
      }

      return "Check amount was found, but remittance invoice rows were not. Adjust crop around the invoice rows or select the missing invoices manually.";
    }

    if (hasInvoiceFragments && confirmedInvoiceCount === 0) {
      return "Some text was detected, but invoice rows could not be confirmed. Invoice numbers or amounts are missing.";
    }

    return data.error ?? "Could not read this remittance. Adjust crop or enter manually.";
  }

  async function filePaymentImage() {
    const paymentImageFile = ocrImageFile ?? checkImageFile;

    if (!paymentImageFile || !businessId) {
      return null;
    }

    const extension =
      paymentImageFile.type === "image/png"
        ? "png"
        : paymentImageFile.type === "image/webp"
          ? "webp"
          : "jpg";
    const storageFileName = `${crypto.randomUUID()}-${safeStorageFileName(
      paymentImageFile.name
    )}`;
    const storagePath = `${businessId}/payments/${new Date()
      .toISOString()
      .slice(0, 10)}/${storageFileName}.${extension}`;
    const bucket = "trimax-payment-images";
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, paymentImageFile, {
        cacheControl: "31536000",
        contentType: paymentImageFile.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        "Trimax could not file the check image yet. Confirm the payment image storage setup has been run, then try again."
      );
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from("payment_attachments")
      .insert({
        business_id: businessId,
        storage_bucket: bucket,
        storage_path: storagePath,
        file_name: paymentImageFile.name || checkImageName || storageFileName,
        content_type: paymentImageFile.type || null,
        file_size: paymentImageFile.size,
        check_number: paymentReference || capturedCheckReference || null,
        check_amount: enteredCheckAmount ?? (capturedAmountValue || null),
        payor: checkPayor || null,
        remittance_stub_text: remittanceStubText || null,
        matched_invoice_ids: selectedInvoices.map((invoice) => invoice.id),
      })
      .select("id, storage_path, file_name")
      .single();

    if (attachmentError || !attachment) {
      throw new Error(
        "Trimax uploaded the image, but could not save the filing record. Please try again before applying this payment."
      );
    }

    const filedImage = {
      id: String(attachment.id),
      storagePath: String(attachment.storage_path),
      fileName: String(attachment.file_name ?? paymentImageFile.name),
    };

    setFiledPaymentImage(filedImage);

    return filedImage;
  }

  async function extractCheckStubFromPhoto(
    imageDataUrl: string,
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = captureIntent,
    retryStrategy: OcrRetryStrategy = "standard"
  ) {
    if (imageDataUrl.length > 19_500_000) {
      setCheckOcrStatus("manual");
      setCheckOcrMessage(
        "That crop is large. Adjust crop tighter or enter the payment manually."
      );
      return;
    }

    setCheckOcrStatus("reading");
    setCheckOcrMessage("Reading the remittance stub from the image...");
    appendCameraStage("Upload started");
    appendCameraStage("OCR started");

    try {
      const response = await fetch("/api/payments/extract-check-stub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl, documentType, retryStrategy }),
      });
      const data = (await response.json().catch(() => ({}))) as CheckStubOcrResponse;

      if (!response.ok) {
        setCameraFailureStage("ocr-request");
        setCheckOcrStatus(response.status === 503 ? "manual" : "error");
        setCheckOcrMessage(
          data.error ??
            "Trimax could not read that remittance. Enter the payment manually."
        );
        return;
      }

      if (!data.stubText?.trim()) {
        setCameraFailureStage("ocr-parse");
        setCheckOcrStatus("manual");
        setCheckOcrMessage(ocrFailureMessage(data));
        return;
      }

      appendCameraStage("OCR completed");
      if (intent === "check_details" || documentType === "check_only") {
        loadCheckDetailsFromExtraction(data);
        appendCameraStage("Parsing completed");
        setCheckOcrStatus("manual");
        setPaymentEntryMode("photo");
        setCheckOcrMessage(
          "Check details added. Review the payment before applying."
        );
        return;
      }

      const { reviewMatches, reconciledReview } = loadExtractedRemittance(data);
      appendCameraStage("Parsing completed");
      const responseTotal =
        typeof data.totalAmount === "number" && data.totalAmount > 0
          ? data.totalAmount
          : 0;
      const matchedInvoiceTotal = reviewMatches.reduce(
        (total, invoice) => total + invoice.amountDue,
        0
      );
      const hasConfidentReview =
        reviewMatches.length > 0 &&
        reconciledReview.isComplete &&
        (responseTotal <= 0 || Math.abs(matchedInvoiceTotal - responseTotal) < 0.01);

      setCheckOcrStatus(hasConfidentReview ? "ready" : "manual");
      appendCameraStage("Matching completed");
      if (!hasConfidentReview) {
        setCameraFailureStage("matching-reconciliation");
      }
      setCheckOcrMessage(
        hasConfidentReview
          ? "Remittance read. Review the payment before applying."
          : ocrFailureMessage(data)
      );
    } catch (error) {
      setCameraFailureStage("ocr-request");
      setCheckOcrStatus("error");
      setCheckOcrMessage(
        error instanceof Error
          ? error.message
          : "Could not read this remittance. Adjust crop or enter manually."
      );
    }
  }

  async function readPreparedRemittanceFromFile(
    file: File,
    nextCropBox: CropBox,
    nextRotation: number,
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = captureIntent,
    retryStrategy: OcrRetryStrategy = "standard"
  ) {
    setIsPreparingCrop(true);

    try {
      const image = await imageElementFromFile(file);
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const effectiveWidth = Math.round(
        ((nextCropBox.right - nextCropBox.left) / 100) * naturalWidth
      );
      const effectiveHeight = Math.round(
        ((nextCropBox.bottom - nextCropBox.top) / 100) * naturalHeight
      );
      const quality = await inspectImageQuality(file, nextCropBox);
      const qualityMessages = qualityMessageFromMetrics(
        effectiveWidth,
        effectiveHeight,
        cropBoxAreaRatio(nextCropBox),
        quality
      );

      setCaptureQualityDetails(
        `OCR image target: at least 3200px readable edge. Selected crop: ${effectiveWidth} x ${effectiveHeight}.`
      );

      if (qualityMessages.length > 0) {
        setPaymentEntryMode("crop");
        setCheckOcrStatus("manual");
        setCheckOcrMessage(qualityMessages[0]);
        setCaptureQualityMessage(qualityMessages[0]);
        return;
      }

      const imageDataUrl = await cropPhotoForOcr(
        file,
        nextCropBox,
        nextRotation
      );
      const preparedFile = await dataUrlToImageFile(
        imageDataUrl,
        `trimax-remittance-ocr-${Date.now()}.jpg`
      );
      appendCameraStage(
        `OCR upload prepared: ${preparedFile.size} bytes, preview and OCR input use same normalized crop`
      );
      const normalizedRotation = ((nextRotation % 360) + 360) % 360;
      const rotatedSideways =
        normalizedRotation === 90 || normalizedRotation === 270;

      setOcrImageFile(preparedFile);
      setCheckImageFile(preparedFile);
      setCheckImagePreview(imageDataUrl);
      setCheckImageName(preparedFile.name);
      setCropBox({ left: 0, top: 0, right: 100, bottom: 100 });
      setCropRotation(0);
      setCropPreviewAspectRatio(
        rotatedSideways
          ? effectiveHeight / Math.max(effectiveWidth, 1)
          : effectiveWidth / Math.max(effectiveHeight, 1)
      );
      setCaptureQualityMessage("Document quality looks ready.");
      setCaptureQualityDetails(
        `Saved preview and OCR input match: ${preparedFile.name}, ${preparedFile.size} bytes, crop ${effectiveWidth} x ${effectiveHeight}.`
      );
      setPaymentEntryMode("photo");
      void extractCheckStubFromPhoto(
        imageDataUrl,
        documentType,
        intent,
        retryStrategy
      );
    } catch (error) {
      setCheckOcrStatus("error");
      setCheckOcrMessage(
        error instanceof Error
          ? error.message
          : "Could not read this remittance. Adjust crop or enter manually."
      );
    } finally {
      setIsPreparingCrop(false);
    }
  }

  async function readCroppedRemittance() {
    if (!checkImageFile) {
      return;
    }

    await readPreparedRemittanceFromFile(checkImageFile, cropBox, cropRotation);
  }

  function resetCheckCaptureState() {
    setCheckImageFile(null);
    setCheckImageName("");
    setCropBox({ left: 8, top: 8, right: 92, bottom: 92 });
    setCropRotation(0);
    setCropPreviewAspectRatio(4 / 3);
    setIsTightlyFramedRemittance(false);
    setIsPreparingCrop(false);
    setFiledPaymentImage(null);
    setRemittanceStubText("");
    setSelectedIds([]);
    setExtractedPaymentAmount(null);
    setReviewMatchedInvoices([]);
    setCapturedCheckAmount("");
    setCapturedCheckReference("");
    setCheckPayor("");
    setPaymentReviewNotice("");
    setCompletedPaymentSummary(null);
    setCheckOcrStatus("idle");
    setCaptureDocumentType("remittance_stub");
    setCaptureIntent("primary");
    setCameraGuideMode("horizontal");
    setCheckOcrMessage(
      "Upload a remittance stub or enter the payment manually."
    );
    setPaymentEntryMode("choice");
  }

  function constrainCropBox(next: CropBox): CropBox {
    const minimumSize = 8;
    const left = Math.max(0, Math.min(next.left, 100 - minimumSize));
    const top = Math.max(0, Math.min(next.top, 100 - minimumSize));
    const right = Math.min(100, Math.max(next.right, left + minimumSize));
    const bottom = Math.min(100, Math.max(next.bottom, top + minimumSize));

    return {
      left: Math.min(left, right - minimumSize),
      top: Math.min(top, bottom - minimumSize),
      right,
      bottom,
    };
  }

  function beginCropDrag(
    event: PointerEvent<HTMLButtonElement | HTMLDivElement>,
    target: CropDragTarget
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      target,
      startX: event.clientX,
      startY: event.clientY,
      startBox: cropBox,
    };
  }

  function updateCropDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    const frame = cropFrameRef.current;

    if (!drag || !frame) {
      return;
    }

    const rect = frame.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * 100;
    const start = drag.startBox;
    const width = start.right - start.left;
    const height = start.bottom - start.top;

    if (drag.target === "move") {
      const left = Math.max(0, Math.min(start.left + deltaX, 100 - width));
      const top = Math.max(0, Math.min(start.top + deltaY, 100 - height));

      setCropBox({
        left,
        top,
        right: left + width,
        bottom: top + height,
      });
      return;
    }

    setCropBox(
      constrainCropBox({
        left:
          drag.target === "top-left" || drag.target === "bottom-left"
            ? start.left + deltaX
            : start.left,
        top:
          drag.target === "top-left" || drag.target === "top-right"
            ? start.top + deltaY
            : start.top,
        right:
          drag.target === "top-right" || drag.target === "bottom-right"
            ? start.right + deltaX
            : start.right,
        bottom:
          drag.target === "bottom-left" || drag.target === "bottom-right"
            ? start.bottom + deltaY
            : start.bottom,
      })
    );
  }

  function endCropDrag() {
    cropDragRef.current = null;
  }

  function resetCropToSuggestion() {
    setCropBox({ left: 8, top: 8, right: 92, bottom: 92 });
    setCropRotation(0);
    setIsTightlyFramedRemittance(false);
    setCaptureQualityMessage("");
    setCaptureQualityDetails("");
    setCheckOcrMessage("Adjust the crop, then read it.");
  }

  const getVisibleCameraGuideSourceRect = useCallback((video: HTMLVideoElement) => {
    const viewport = cameraViewportRef.current;
    const guide = cameraGuideRef.current;

    if (!viewport || !guide || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return {
        sourceX: 0,
        sourceY: 0,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
      };
    }

    const viewportRect = viewport.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const scale = Math.max(
      viewportRect.width / video.videoWidth,
      viewportRect.height / video.videoHeight
    );
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const renderedLeft = (viewportRect.width - renderedWidth) / 2;
    const renderedTop = (viewportRect.height - renderedHeight) / 2;
    const guideLeft = guideRect.left - viewportRect.left;
    const guideTop = guideRect.top - viewportRect.top;
    const padRatio = captureDocumentType === "remittance_stub" ? 0.035 : 0.05;
    const padX = guideRect.width * padRatio;
    const padY = guideRect.height * padRatio;
    const rawX = (guideLeft - padX - renderedLeft) / scale;
    const rawY = (guideTop - padY - renderedTop) / scale;
    const rawWidth = (guideRect.width + padX * 2) / scale;
    const rawHeight = (guideRect.height + padY * 2) / scale;
    const sourceX = Math.max(0, Math.floor(rawX));
    const sourceY = Math.max(0, Math.floor(rawY));
    const sourceWidth = Math.max(
      1,
      Math.min(video.videoWidth - sourceX, Math.ceil(rawWidth))
    );
    const sourceHeight = Math.max(
      1,
      Math.min(video.videoHeight - sourceY, Math.ceil(rawHeight))
    );

    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    };
  }, [captureDocumentType]);

  const analyzeLiveCameraFrame = useCallback(() => {
    const video = cameraVideoRef.current;

    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    const { sourceX, sourceY, sourceWidth, sourceHeight } =
      getVisibleCameraGuideSourceRect(video);
    const scanWidth = 260;
    const scale = Math.min(1, scanWidth / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height
    );

    const pixels = context.getImageData(0, 0, width, height).data;
    const grayscale = new Float32Array(width * height);
    let paperHits = 0;
    let total = 0;
    let totalSquared = 0;

    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? red;
      const blue = pixels[offset + 2] ?? red;
      const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

      grayscale[index] = brightness;
      total += brightness;
      totalSquared += brightness * brightness;

      if ((brightness > 145 && chroma < 72) || brightness > 198) {
        paperHits += 1;
      }
    }

    const count = Math.max(width * height, 1);
    const paperCoverage = paperHits / count;
    const brightness = total / count;
    const contrast = Math.sqrt(
      Math.max(totalSquared / count - brightness * brightness, 0)
    );
    let edgeTotal = 0;
    let edgeCount = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const center = grayscale[y * width + x] ?? 0;
        edgeTotal += Math.abs(
          (grayscale[(y - 1) * width + x] ?? center) +
            (grayscale[(y + 1) * width + x] ?? center) +
            (grayscale[y * width + x - 1] ?? center) +
            (grayscale[y * width + x + 1] ?? center) -
            center * 4
        );
        edgeCount += 1;
      }
    }

    const blurScore = edgeTotal / Math.max(edgeCount, 1);
    const minimumCoverage =
      captureDocumentType === "remittance_stub"
        ? cameraGuideMode === "horizontal"
          ? 0.58
          : 0.64
        : captureDocumentType === "full_check_stub"
          ? 0.46
          : 0.5;
    const effectiveGuideShortEdge = Math.min(sourceWidth, sourceHeight);

    if (
      captureDocumentType === "full_check_stub" &&
      effectiveGuideShortEdge < 980
    ) {
      return {
        ready: false,
        message: "Capture stub separately",
      };
    }

    if (
      captureDocumentType === "remittance_stub" &&
      effectiveGuideShortEdge < 1050
    ) {
      return {
        ready: false,
        message: "Move closer",
      };
    }

    if (paperCoverage < minimumCoverage) {
      return {
        ready: false,
        message: "Move closer",
      };
    }

    if (paperCoverage > 0.94) {
      return {
        ready: false,
        message: "Fit entire document",
      };
    }

    if (brightness < 72) {
      return {
        ready: false,
        message: "More light",
      };
    }

    if (contrast < 20 || blurScore < 7.5) {
      return {
        ready: false,
        message: "Hold steady",
      };
    }

    return {
      ready: true,
      message: "Ready",
    };
  }, [cameraGuideMode, captureDocumentType, getVisibleCameraGuideSourceRect]);

  useEffect(() => {
    if (paymentEntryMode !== "camera" || !cameraReady) {
      return;
    }

    let stableReadyCount = 0;
    const interval = window.setInterval(() => {
      const result = analyzeLiveCameraFrame();

      if (!result) {
        setCameraQualityReady(false);
        setCameraStatusMessage("Move closer");
        stableReadyCount = 0;
        return;
      }

      if (result.ready) {
        stableReadyCount += 1;
        setCameraQualityReady(stableReadyCount >= 2);
        setCameraStatusMessage(stableReadyCount >= 2 ? "Ready" : "Hold steady");
        return;
      }

      stableReadyCount = 0;
      setCameraQualityReady(false);
      setCameraStatusMessage(result.message);
    }, 450);

    return () => window.clearInterval(interval);
  }, [analyzeLiveCameraFrame, cameraReady, paymentEntryMode]);

  function stopCameraCapture() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setCameraReady(false);
    setCameraQualityReady(false);
    setIsCapturingFrame(false);
    setCameraVideoPlayStatus("not-started");
  }

  function handleCameraModeSelection(
    event: { preventDefault: () => void; stopPropagation: () => void },
    documentType: RemittanceDocumentType
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (isCapturingFrame) {
      return;
    }

    setCaptureDocumentType(documentType);
    setCameraGuideMode(defaultGuideModeForDocumentType(documentType));
    setCameraQualityReady(false);
    setCameraStatusMessage(
      documentType === "full_check_stub" ? "Capture stub separately" : "Move closer"
    );
  }

  async function captureFromTrimaxCamera(
    event?: { preventDefault: () => void; stopPropagation: () => void }
  ) {
    event?.preventDefault();
    event?.stopPropagation();

    if (isCapturingFrame) {
      return;
    }

    const video = cameraVideoRef.current;

    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setCameraFailureStage("camera-ready");
      setCameraStatusMessage(
        "Camera is not ready. Use the capture button below or choose an existing photo."
      );
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      setCameraFailureStage("capture-prepare");
      setCameraStatusMessage("Camera capture could not be prepared.");
      setCheckOcrStatus("error");
      setCheckOcrMessage("Camera capture could not be prepared.");
      return;
    }

    setIsCapturingFrame(true);
    setCameraFailureStage("");
    setCameraPipelineStages(["Capturing..."]);
    setCameraStatusMessage("Capturing...");
    setCheckOcrStatus("reading");
    setCheckOcrMessage("Capturing remittance...");
    const { sourceX, sourceY, sourceWidth, sourceHeight } =
      getVisibleCameraGuideSourceRect(video);
    appendCameraStage(
      `Frame captured: video ${video.videoWidth}x${video.videoHeight}, crop ${Math.round(
        sourceWidth
      )}x${Math.round(sourceHeight)}`
    );
    const maxOutputEdge = 3600;
    const minReadableEdge = captureDocumentType === "remittance_stub" ? 2400 : 1800;
    const outputScale = Math.min(
      maxOutputEdge / Math.max(sourceWidth, sourceHeight),
      Math.max(1, minReadableEdge / Math.max(sourceWidth, sourceHeight))
    );
    canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    appendCameraStage(`Crop created: ${canvas.width}x${canvas.height}`);
    appendCameraStage("Image normalized");
    let captureFinished = false;
    const captureTimeout = window.setTimeout(() => {
      if (captureFinished) {
        return;
      }

      captureFinished = true;
      setCameraFailureStage("capture-timeout");
      setCameraStatusMessage("Camera capture timed out. Try Use Device Camera.");
      setCheckOcrStatus("error");
      setCheckOcrMessage("Camera capture timed out. Try Use Device Camera.");
      setIsCapturingFrame(false);
    }, 3500);
    canvas.toBlob(
      (blob) => {
        if (captureFinished) {
          return;
        }

        captureFinished = true;
        window.clearTimeout(captureTimeout);

        if (!blob) {
          setCameraFailureStage("save-normalized-crop");
          setCameraStatusMessage("Camera capture could not be saved.");
          setCheckOcrStatus("error");
          setCheckOcrMessage("Camera capture could not be saved.");
          setIsCapturingFrame(false);
          return;
        }

        const file = new File(
          [blob],
          `trimax-remittance-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );

        setCameraStatusMessage("Checking image...");
        appendCameraStage(`Normalized JPG saved: ${canvas.width}x${canvas.height}, ${blob.size} bytes`);
        stopCameraCapture();
        captureCheckImage(file, "camera", captureDocumentType, captureIntent);
      },
      "image/jpeg",
      0.98
    );
  }

  function handleCaptureButtonPointerUp(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    lastCapturePointerAtRef.current = Date.now();
    void captureFromTrimaxCamera(event);
  }

  function handleCaptureButtonClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (Date.now() - lastCapturePointerAtRef.current < 500) {
      return;
    }

    void captureFromTrimaxCamera(event);
  }

  function captureCheckImage(
    file: File | undefined,
    source: "camera" | "existing" = "existing",
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = captureIntent
  ) {
    if (!file) {
      return;
    }

    if (checkImagePreview) {
      URL.revokeObjectURL(checkImagePreview);
    }

    setCheckImagePreview(URL.createObjectURL(file));
    setCheckImageName(file.name);
    setCheckImageFile(file);
    setOcrImageFile(null);
    setPaymentEntryMode("photo");
    setCheckOcrStatus("idle");
    setCheckOcrMessage("Preparing remittance...");
    setFiledPaymentImage(null);
    if (intent === "primary") {
      setRemittanceStubText("");
      setSelectedIds([]);
      setReviewMatchedInvoices([]);
      setExtractedPaymentAmount(null);
      setPaymentReviewNotice("");
      setCheckAmount("");
      setPaymentReference("");
      setCheckPayor("");
      setCapturedCheckAmount("");
      setCapturedCheckReference("");
    }
    setCompletedPaymentSummary(null);
    setCaptureDocumentType(documentType);
    setCaptureIntent(intent);
    setCropRotation(0);
    setIsTightlyFramedRemittance(false);
    setCaptureQualityMessage("");
    setCaptureQualityDetails("");
    void imageElementFromFile(file).then((image) => {
      const width = image.naturalWidth || image.width || 4;
      const height = image.naturalHeight || image.height || 3;

      setCropPreviewAspectRatio(width / height);
    });
    void detectDefaultCropBox(file).then((suggestion) => {
      setCropBox(suggestion.cropBox);
      setIsTightlyFramedRemittance(suggestion.isTightlyFramed);
      setCaptureQualityMessage(
        suggestion.qualityMessages[0] ??
          (suggestion.shouldAutoRead
            ? "Document detected. Reading remittance..."
            : suggestion.isTightlyFramed
              ? "Document fills the image. Use as-is or adjust crop."
              : "Document detected. Check the crop before reading.")
      );
      setCaptureQualityDetails(
        `OCR image target: at least 3200px readable edge. Detected crop: ${Math.max(
          suggestion.effectiveWidth,
          0
        )} x ${Math.max(suggestion.effectiveHeight, 0)}.`
      );

      if (suggestion.shouldAutoRead) {
        void readPreparedRemittanceFromFile(
          file,
          suggestion.cropBox,
          0,
          documentType,
          intent
        );
      } else {
        setCheckOcrStatus("idle");
        const nextMessage =
          suggestion.qualityMessages[0] ??
          (source === "camera"
            ? "Review the capture, then read it."
            : "Use image as-is or adjust crop before reading.");

        setCheckOcrMessage(nextMessage);

        setPaymentEntryMode("crop");
        setCameraStatusMessage(nextMessage);
      }
    });
    setToast({
      type: "success",
      message: "Remittance image added.",
    });
  }

  function openCameraCapture(
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = "primary"
  ) {
    setCaptureDocumentType(documentType);
    setCaptureIntent(intent);
    setCameraGuideMode(defaultGuideModeForDocumentType(documentType));
    setCameraQualityReady(false);
    setPaymentEntryMode("camera");
    setCheckOcrStatus("idle");
    setCameraStatusMessage(
      documentType === "full_check_stub" ? "Capture stub separately" : "Move closer"
    );
  }

  async function applyBatchPayment() {
    if (!businessId) {
      setToast({
        type: "error",
        message: "Unable to find the selected business.",
      });
      return;
    }

    if (selectedInvoices.length === 0) {
      setToast({
        type: "error",
        message: "Select at least one open invoice first.",
      });
      return;
    }

    if (!checkAmountMatches) {
      setToast({
        type: "error",
        message:
          "The check amount does not match the selected invoices yet.",
      });
      return;
    }

    setIsSaving(true);
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
      const filedImage = await filePaymentImage();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/payments/apply-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          businessId,
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          paymentDate,
          paymentType,
          paymentReference,
          internalNote,
          checkAmount: enteredCheckAmount,
          paymentAttachmentId: filedImage?.id ?? null,
          paymentImagePath: filedImage?.storagePath ?? null,
          paymentImageFileName: filedImage?.fileName ?? null,
          remittanceStubMatched:
            hasRemittanceStub && reviewMatchedInvoices.length > 0,
          remittanceStubTotal: hasRemittanceStub
            ? remittanceMatch.totalAmount
            : null,
          remittanceStubLineCount: hasRemittanceStub
            ? remittanceMatch.lineItems.length
            : null,
          remittanceMatchConfidence: hasRemittanceStub
            ? remittanceMatch.confidence
            : null,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        appliedCount?: number;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Unable to apply the batch payment. Refresh, sign in again if needed, then try once more."
        );
      }

      setToast({
        type: "success",
        message: `Applied payment to ${result.appliedCount ?? selectedInvoices.length} invoice${
          (result.appliedCount ?? selectedInvoices.length) === 1 ? "" : "s"
        }.`,
      });
      setCompletedPaymentSummary({
        checkNumber: paymentReference || capturedCheckReference,
        payor: checkPayor,
        totalAmount: enteredCheckAmount ?? selectedTotal,
        invoiceCount: selectedInvoices.length,
      });
      setPaymentEntryMode("complete");
      setCheckOcrStatus("idle");
      setCheckOcrMessage("Payment applied.");
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
        setCheckImagePreview("");
      }
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to apply the batch payment. Refresh, sign in again if needed, then try once more.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (payableInvoices.length === 0) {
    return null;
  }

  const cameraOverlayStyle: CSSProperties | undefined =
    paymentEntryMode === "camera" && cameraVisualViewport
    ? {
        left: "0px",
        top: "0px",
        width: `${cameraVisualViewport.width}px`,
        height: `${cameraVisualViewport.height}px`,
        maxWidth: "100vw",
        maxHeight: "100dvh",
      }
    : undefined;

  return (
    <Card className="batch-payments-card border-green-500/30 bg-green-500/5">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      {typeof document !== "undefined" && paymentEntryMode === "camera" ? createPortal(
        <div
          ref={cameraOverlayRef}
          aria-label="Remittance camera"
          aria-modal="true"
          className="fixed left-0 top-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-white landscape:grid landscape:grid-cols-[minmax(0,1fr)_13rem] landscape:grid-rows-[auto_minmax(0,1fr)_auto] landscape:gap-2 landscape:p-2"
          data-remittance-fullscreen-capture="true"
          data-camera-overlay-root="true"
          role="dialog"
          style={cameraOverlayStyle}
        >
          <div
            className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] landscape:col-start-2 landscape:row-start-1 landscape:grid-cols-1 landscape:px-0 landscape:pb-1 landscape:pt-[max(env(safe-area-inset-top),0.25rem)]"
            data-camera-safe-area-top="true"
          >
            <button
              type="button"
              autoFocus
              onClick={() => {
                stopCameraCapture();
                setPaymentEntryMode("choice");
                setCameraStatusMessage("Align the remittance inside the frame.");
              }}
              className="min-h-11 rounded-full border border-white/30 bg-black/70 px-4 py-2 text-sm font-black text-white shadow-xl backdrop-blur transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-200 landscape:min-h-9 landscape:px-3 landscape:py-1.5 landscape:text-xs"
            >
              Cancel
            </button>
            <div
              className={`min-w-0 justify-self-center rounded-full px-3 py-2 text-center text-sm font-black shadow-xl backdrop-blur landscape:w-full landscape:py-1.5 landscape:text-xs ${
                cameraQualityReady
                  ? "bg-emerald-400 text-black"
                  : "bg-black/70 text-sky-100"
              }`}
              aria-live="polite"
            >
              {cameraQualityReady ? "Ready" : cameraStatusMessage}
            </div>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCameraGuideMode((current) =>
                  current === "horizontal" ? "vertical" : "horizontal"
                );
                setCameraQualityReady(false);
                setCameraStatusMessage("Move closer");
              }}
              className="min-h-11 rounded-full border border-white/30 bg-black/70 px-3 py-2 text-xs font-black text-white shadow-xl backdrop-blur transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-200 landscape:min-h-9 landscape:py-1.5"
            >
              Rotate Guide
            </button>
          </div>
          <div className="shrink-0 px-4 pb-2 landscape:col-start-2 landscape:row-start-2 landscape:px-0 landscape:pb-1">
            <div className="mx-auto grid max-w-xl grid-cols-3 gap-1.5 rounded-2xl bg-black/55 p-1.5 backdrop-blur landscape:grid-cols-1">
              {remittanceDocumentModes.map((mode) => (
                <button
                  key={mode.value}
                  ref={mode.value === "check_only" ? checkOnlyModeButtonRef : undefined}
                  type="button"
                  disabled={isCapturingFrame}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchEnd={(event) => event.stopPropagation()}
                  onClick={(event) => handleCameraModeSelection(event, mode.value)}
                  className={`relative z-10 min-h-10 rounded-xl px-2 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60 landscape:min-h-9 landscape:py-1.5 ${
                    captureDocumentType === mode.value
                      ? "bg-emerald-300 text-black"
                      : "bg-white/10 text-zinc-100"
                  }`}
                  title={mode.help}
                  data-camera-control={mode.value}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={cameraViewportRef}
            className="relative min-h-0 flex-1 overflow-hidden landscape:col-start-1 landscape:row-span-3 landscape:row-start-1 landscape:rounded-2xl"
          >
            <video
              ref={cameraVideoRef}
              muted
              playsInline
              autoPlay
              disablePictureInPicture
              data-camera-visible-video="true"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;

                video.setAttribute("playsinline", "true");
                video.setAttribute("webkit-playsinline", "true");
                void video
                  .play()
                  .then(() => setCameraVideoPlayStatus("playing"))
                  .catch((error: unknown) => {
                    const message =
                      error instanceof Error
                        ? error.message
                        : "Video play rejected.";

                    setCameraVideoPlayStatus(`play-rejected: ${message}`);
                    setCameraStatusMessage(`Preview blocked: ${message}`);
                  });
              }}
              onCanPlay={() => {
                setCameraVideoPlayStatus((current) =>
                  current.startsWith("play-rejected") ? current : "can-play"
                );
              }}
              className="absolute inset-0 z-0 h-full w-full bg-black object-cover opacity-100 [filter:none] [mix-blend-mode:normal]"
              style={{
                WebkitTransform: "translateZ(0)",
                transform: "translateZ(0)",
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 z-10 bg-black/20"
              data-camera-transparent-dim-layer="true"
            />
            <div
              ref={cameraGuideRef}
              className={`pointer-events-none absolute left-1/2 top-1/2 z-20 max-h-[88%] max-w-[96%] -translate-x-1/2 -translate-y-1/2 rounded-[1.35rem] border-[3px] border-emerald-300 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45),0_0_36px_rgba(110,231,183,0.35)] ${
                cameraGuideMode === "horizontal"
                  ? captureDocumentType === "full_check_stub"
                    ? "h-[min(50dvh,54vw)] min-h-[30dvh] w-[min(94vw,128dvh)] landscape:h-[min(64dvh,52vw)]"
                    : captureDocumentType === "check_only"
                      ? "h-[min(36dvh,38vw)] min-h-[24dvh] w-[min(92vw,118dvh)] landscape:h-[min(50dvh,40vw)]"
                      : "h-[min(18dvh,22vw)] min-h-[12dvh] w-[min(96vw,160dvh)] landscape:h-[min(62%,54dvh)] landscape:w-[min(96%,150dvh)]"
                  : captureDocumentType === "remittance_stub"
                    ? "h-[min(72dvh,88%)] min-h-[48dvh] w-[min(94vw,78dvh)] landscape:h-[min(88%,88dvh)] landscape:min-h-0 landscape:w-[min(42vw,58dvh)]"
                    : "h-[min(72dvh,128vw)] min-h-[48dvh] w-[min(70vw,64dvh)] landscape:h-[min(72dvh,88vw)] landscape:w-[min(45vw,64dvh)]"
              }`}
              data-remittance-document-frame="true"
              data-guide-mode={cameraGuideMode}
            >
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-100/30" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-100/30" />
              <span className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-[1.35rem] border-l-4 border-t-4 border-white" />
              <span className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-[1.35rem] border-r-4 border-t-4 border-white" />
              <span className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-[1.35rem] border-b-4 border-l-4 border-white" />
              <span className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-[1.35rem] border-b-4 border-r-4 border-white" />
            </div>
          </div>

          <div
            className="relative z-30 shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 landscape:col-start-2 landscape:row-start-3 landscape:px-0 landscape:pb-[max(env(safe-area-inset-bottom),0.25rem)] landscape:pt-1"
            data-camera-safe-area-bottom="true"
          >
            <p className="mb-3 text-center text-sm font-semibold text-sky-100 landscape:mb-2 landscape:text-xs">
              {guidanceForDocumentType(captureDocumentType)}
            </p>
            {cameraDiagnosticsEnabled ? (
              <p className="mb-2 rounded-full border border-cyan-300/40 bg-cyan-950/60 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">
                Diagnostics Active
              </p>
            ) : null}
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 landscape:grid-cols-1">
              <button
                ref={captureButtonRef}
                type="button"
                disabled={isCapturingFrame}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerUp={handleCaptureButtonPointerUp}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
                onClick={handleCaptureButtonClick}
                data-camera-capture-button="true"
                data-camera-control="capture"
                className={`relative z-40 col-span-2 min-h-14 rounded-full px-6 py-3 text-base font-black shadow-2xl shadow-emerald-950/40 transition disabled:cursor-wait disabled:opacity-80 landscape:col-span-1 landscape:min-h-10 landscape:px-4 landscape:py-2 landscape:text-sm ${
                  cameraReady && cameraQualityReady
                    ? "bg-emerald-400 text-black hover:bg-emerald-300"
                    : "bg-amber-300 text-black hover:bg-amber-200"
                }`}
              >
                {isCapturingFrame
                  ? "Capturing..."
                  : cameraReady && cameraQualityReady
                    ? captureDocumentType === "remittance_stub"
                      ? "Capture Remittance"
                      : "Capture"
                    : captureDocumentType === "remittance_stub"
                      ? "Capture Remittance"
                      : "Check Capture"}
              </button>
              <label
                ref={deviceCameraLabelRef}
                data-camera-control="device-camera"
                className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-sky-200/50 bg-black/70 px-4 py-2 text-center text-sm font-black text-sky-50 backdrop-blur transition hover:bg-white/10 landscape:min-h-9 landscape:px-3 landscape:py-1.5 landscape:text-xs"
              >
                Use Device Camera
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    stopCameraCapture();
                    captureCheckImage(
                      event.target.files?.[0],
                      "camera",
                      captureDocumentType,
                      captureIntent
                    );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/70 px-4 py-2 text-center text-sm font-bold text-zinc-50 backdrop-blur transition hover:bg-white/10 landscape:min-h-9 landscape:px-3 landscape:py-1.5 landscape:text-xs">
                Choose Existing
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  onChange={(event) => {
                    stopCameraCapture();
                    captureCheckImage(
                      event.target.files?.[0],
                      "existing",
                      captureDocumentType,
                      captureIntent
                    );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {cameraPipelineStages.length > 0 ? (
              <div className="mt-2 rounded-xl border border-white/15 bg-black/70 px-2 py-1.5 text-[10px] font-semibold text-sky-50">
                <p>{cameraPipelineStages.at(-1)}</p>
                {cameraFailureStage ? (
                  <p className="text-amber-200">Failed at: {cameraFailureStage}</p>
                ) : null}
              </div>
            ) : null}
            {cameraDiagnosticsEnabled && cameraGeometryDiagnostics ? (
              <details
                open
                className="mt-2 max-h-40 overflow-auto rounded-xl border border-cyan-300/35 bg-cyan-950/80 px-2 py-1.5 text-[10px] text-cyan-50"
              >
                <summary className="cursor-pointer font-black">
                  Camera geometry
                </summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">
                  {JSON.stringify(cameraGeometryDiagnostics, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}

      {paymentEntryMode === "complete" ? (
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Payment Applied
          </p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">
                Check #
              </p>
              <p className="mt-1 break-words font-black text-white">
                {completedPaymentSummary?.checkNumber || "Not entered"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">
                Payor
              </p>
              <p className="mt-1 break-words font-black text-white">
                {completedPaymentSummary?.payor || "Not entered"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">
                Total
              </p>
              <p className="mt-1 font-black text-white">
                {formatMoney(completedPaymentSummary?.totalAmount ?? 0)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">
                Invoices
              </p>
              <p className="mt-1 font-black text-white">
                {completedPaymentSummary?.invoiceCount ?? 0}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPaymentReference("");
              setCheckAmount("");
              setInternalNote("");
              resetCheckCaptureState();
              router.refresh();
            }}
            className="mt-4 rounded-2xl bg-emerald-500 px-5 py-3 font-black text-black transition hover:bg-emerald-400"
          >
            Record Another Payment
          </button>
        </div>
      ) : null}

      {paymentEntryMode !== "complete" ? (
      <div
        id="check-capture"
        className="check-capture-panel scroll-mt-6 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-zinc-950 to-emerald-500/10"
      >
        <div className="grid gap-5 p-4 lg:grid-cols-[0.82fr_1.18fr] lg:p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
              Check Capture
            </p>
            <h3 className="mt-2 text-2xl font-black">
              Record one payment
            </h3>

            <div className="check-photo-dropzone mt-4 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-400/50 bg-black/30 p-4 text-center">
              {checkImagePreview ? (
                <span className="grid gap-3">
                  <span
                    role="img"
                    aria-label="Check preview"
                    className="h-44 w-full rounded-xl bg-contain bg-center bg-no-repeat shadow-lg"
                    style={{
                      backgroundImage: `url(${checkImagePreview})`,
                    }}
                  />
                  <span className="text-xs font-semibold text-sky-200">
                    {checkImageName || "Check image loaded"}
                  </span>
                </span>
              ) : (
                <span>
                  <span className="block text-3xl font-light text-sky-200">
                    +
                  </span>
                  <span className="mt-2 block font-semibold text-white">
                    Add Remittance
                  </span>
                </span>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openCameraCapture("remittance_stub", "primary");
                  }}
                  className="check-camera-action inline-flex rounded-full bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600"
                >
                  Take Photo
                </button>

                <label className="inline-flex cursor-pointer rounded-full border border-sky-300/50 px-4 py-2 text-sm font-black text-sky-100 transition hover:border-sky-200 hover:bg-sky-500/10">
                  Choose Existing Photo
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="sr-only"
                    onChange={(event) => {
                      captureCheckImage(event.target.files?.[0], "existing");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                {checkImagePreview ? (
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(checkImagePreview);
                      setCheckImagePreview("");
                      resetCheckCaptureState();
                    }}
                    className="inline-flex rounded-full border border-slate-400/40 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-slate-300 hover:bg-white/10"
                  >
                    Clear Photo
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (checkImagePreview) {
                    URL.revokeObjectURL(checkImagePreview);
                    setCheckImagePreview("");
                  }
    setCheckImageFile(null);
    setOcrImageFile(null);
                  setCheckImageName("");
                  setFiledPaymentImage(null);
                  setRemittanceStubText("");
                  setReviewMatchedInvoices([]);
                  setExtractedPaymentAmount(null);
                  setPaymentReviewNotice("");
                  setCompletedPaymentSummary(null);
                  setCapturedCheckAmount("");
                  setCapturedCheckReference("");
                  setCheckPayor("");
                  setCheckAmount("");
                  setPaymentReference("");
                  setPaymentEntryMode("manual");
                  setCheckOcrStatus("manual");
                  setCheckOcrMessage("Enter the amount, choose invoices, and apply the payment.");
                }}
                className="mt-3 rounded-full border border-emerald-300/50 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-500/10"
              >
                Enter Check Manually
              </button>

              {checkImageFile ? (
                <p className="mt-3 text-xs font-semibold text-sky-200">
                  {filedPaymentImage
                    ? "Photo filed with payment."
                    : "Image will be saved when the payment is applied."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            {paymentEntryMode === "choice" ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-lg font-black text-white">
                  Upload Remittance or Enter Check Manually
                </p>
              </div>
            ) : null}

            {paymentEntryMode === "crop" ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-black text-white">
                    {isTightlyFramedRemittance
                      ? "Use Remittance Image"
                      : "Crop Remittance"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCropRotation((current) => current - 90)
                      }
                      className="rounded-full border border-slate-400/40 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
                    >
                      Rotate Left
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCropRotation((current) => current + 90)
                      }
                      className="rounded-full border border-slate-400/40 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
                    >
                      Rotate Right
                    </button>
                  </div>
                </div>

                {checkImagePreview ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-sky-400/30 bg-black">
                    <div
                      ref={cropFrameRef}
                      className="relative mx-auto max-h-[52vh] w-full touch-none overflow-hidden"
                      style={{ aspectRatio: cropPreviewAspectRatio }}
                      onPointerMove={updateCropDrag}
                      onPointerUp={endCropDrag}
                      onPointerCancel={endCropDrag}
                    >
                      <div
                        role="img"
                        aria-label="Selected remittance crop"
                        className="h-full w-full bg-contain bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `url(${checkImagePreview})`,
                          transform: `rotate(${cropRotation}deg)`,
                        }}
                      />
                      <div
                        className="absolute border-2 border-emerald-300 bg-emerald-300/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
                        style={{
                          left: `${cropBox.left}%`,
                          top: `${cropBox.top}%`,
                          width: `${cropBox.right - cropBox.left}%`,
                          height: `${cropBox.bottom - cropBox.top}%`,
                        }}
                        onPointerDown={(event) => beginCropDrag(event, "move")}
                      >
                        {(
                          [
                            ["top-left", "-left-3 -top-3 cursor-nwse-resize"],
                            ["top-right", "-right-3 -top-3 cursor-nesw-resize"],
                            ["bottom-left", "-bottom-3 -left-3 cursor-nesw-resize"],
                            ["bottom-right", "-bottom-3 -right-3 cursor-nwse-resize"],
                          ] as const
                        ).map(([target, positionClass]) => (
                          <button
                            key={target}
                            type="button"
                            aria-label={`Drag ${target.replace("-", " ")} crop handle`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              beginCropDrag(event, target);
                            }}
                            className={`absolute h-8 w-8 rounded-full border-2 border-black bg-emerald-300 shadow-lg ${positionClass}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <p className="mt-3 text-sm font-semibold text-sky-100">
                  {checkOcrMessage}
                </p>
                {captureQualityMessage ? (
                  <p className="mt-2 rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-sm font-semibold text-sky-50">
                    {captureQualityMessage}
                  </p>
                ) : null}
                {captureQualityDetails ? (
                  <p className="mt-2 text-xs font-semibold text-zinc-300">
                    {captureQualityDetails}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={readCroppedRemittance}
                    disabled={isPreparingCrop}
                    className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isPreparingCrop
                      ? "Preparing..."
                      : isTightlyFramedRemittance
                        ? "Use Image As-Is"
                        : "Use Cropped Image"}
                  </button>
                  {isTightlyFramedRemittance ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTightlyFramedRemittance(false);
                        setCheckOcrMessage("Adjust the crop, then read it.");
                      }}
                      className="rounded-full border border-slate-400/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
                    >
                      Adjust Crop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={resetCropToSuggestion}
                    className="rounded-full border border-slate-400/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
                  >
                    Reset
                  </button>
                  <label className="inline-flex cursor-pointer rounded-full border border-slate-400/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10">
                    Retake
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      capture="environment"
                      className="sr-only"
                      onChange={(event) => {
                        captureCheckImage(
                          event.target.files?.[0],
                          "camera",
                          captureDocumentType,
                          captureIntent
                        );
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer rounded-full border border-slate-400/40 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/10">
                    Choose Another
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      className="sr-only"
                      onChange={(event) => {
                        captureCheckImage(
                          event.target.files?.[0],
                          "existing",
                          captureDocumentType,
                          captureIntent
                        );
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {paymentEntryMode === "photo" ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-black text-white">
                    {checkOcrStatus === "reading"
                      ? "Reading remittance"
                      : checkOcrStatus === "ready"
                        ? "Review Payment"
                        : "Review payment"}
                  </p>

                  {checkOcrStatus === "reading" ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-200">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-200 border-t-transparent" />
                      Reading
                    </span>
                  ) : null}
                </div>

                {checkOcrStatus === "error" || checkOcrStatus === "manual" ? (
                  <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                    <p>{checkOcrMessage}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (checkImageFile) {
                            void readPreparedRemittanceFromFile(
                              checkImageFile,
                              cropBox,
                              cropRotation,
                              captureDocumentType,
                              captureIntent,
                              "alternate"
                            );
                          }
                        }}
                        disabled={!checkImageFile}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        Retry Reading
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentEntryMode("crop");
                          setCheckOcrStatus("idle");
                          setCheckOcrMessage("Adjust the crop, then read it again.");
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Adjust Crop
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentEntryMode("crop");
                          setCropRotation((current) => current + 90);
                          setCheckOcrStatus("idle");
                          setCheckOcrMessage("Rotate the crop, then read it again.");
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openCameraCapture("check_only", "check_details");
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Add Check Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentEntryMode("manual");
                          setCheckOcrStatus("manual");
                          setCheckOcrMessage("Select the missing invoice, verify the total, and apply the payment.");
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Select Missing Invoice Manually
                      </button>
                    </div>
                  </div>
                ) : null}

                {checkOcrStatus === "ready" ? (
                  <div className="mt-3 min-w-0 rounded-xl border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-50">
                    {checkOcrMessage}
                  </div>
                ) : null}

                {isRemittanceReview && paymentReviewNotice ? (
                  <div className="mt-2 min-w-0 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-50">
                    {paymentReviewNotice}
                  </div>
                ) : null}

                {isRemittanceReview && reviewMatchedInvoices.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    <p className="text-sm font-black text-white">
                      Matched Invoices
                    </p>
                    {reviewMatchedInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="grid min-w-0 gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                      >
                        <span className="min-w-0 break-words">
                          <span className="block font-black text-white">
                            {invoice.displayId}
                            <span className="font-semibold text-zinc-300">
                              {" "}
                              {invoice.projectTitle}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-zinc-400">
                            {invoice.customerName}
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold text-sky-200">
                            Source: Remittance photo
                          </span>
                        </span>
                        <span className="shrink-0 font-black text-emerald-300 sm:text-right">
                          {formatMoney(invoice.remittanceAmount ?? invoice.amountDue)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {isRemittanceReview && reviewMatchedInvoices.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-sm text-amber-50">
                    No invoice matches were found from the extracted invoice numbers.
                  </div>
                ) : null}

                {isRemittanceReview &&
                (!paymentReference.trim() ||
                  !checkPayor.trim() ||
                  !visibleCheckAmount.trim()) ? (
                  <button
                    type="button"
                    onClick={() => openCameraCapture("check_only", "check_details")}
                    className="mt-3 rounded-full border border-sky-300/50 px-4 py-2 text-sm font-black text-sky-100 transition hover:border-sky-200 hover:bg-sky-500/10"
                  >
                    Add Check Photo
                  </button>
                ) : null}

                {checkOcrStatus === "error" || checkOcrStatus === "manual" ? (
                  <textarea
                    value={remittanceStubText}
                    onChange={(event) => setRemittanceStubText(event.target.value)}
                    placeholder="Paste readable remittance text here if the image did not read cleanly."
                    className="mt-4 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition focus:border-sky-500"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      {showPaymentReview ? (
        <>
      <div className="app-soft-panel mt-4 min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        {isRemittanceReview ? (
          <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
              Invoice rows: Remittance photo
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              Total: {checkAmountMatches ? "Reconciled" : "Review"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              Check details: {captureIntent === "check_details" ? "Check photo" : "Remittance photo"}
            </span>
          </div>
        ) : null}
        <div
          className={`grid min-w-0 gap-3 md:grid-cols-2 ${
            isRemittanceReview
              ? "xl:grid-cols-[minmax(130px,150px)_minmax(140px,170px)_minmax(140px,180px)_minmax(0,1fr)_minmax(190px,auto)]"
              : "xl:grid-cols-[minmax(130px,150px)_minmax(110px,130px)_minmax(140px,170px)_minmax(140px,180px)_minmax(0,1fr)_minmax(190px,auto)]"
          }`}
        >
          <DateInputField
            label="Payment Date"
            value={paymentDate}
            onChange={setPaymentDate}
            inputClassName="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-28 text-slate-950 outline-none transition focus:border-sky-500"
          />

          {!isRemittanceReview ? (
          <div className="min-w-0">
            <label className="mb-2 block text-sm text-zinc-400">
              Payment Type
            </label>
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            >
              <option>Check</option>
              <option>Cash</option>
              <option>ACH</option>
              <option>Card</option>
              <option>Other</option>
            </select>
          </div>
          ) : null}

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-sm text-zinc-400">
                Check Amount
              </label>

              {selectedInvoices.length > 0 ? (
                <button
                  type="button"
                  onClick={fillSelectedTotal}
                  className={`text-xs font-semibold text-green-700 transition hover:text-green-900 ${
                    isRemittanceReview ? "hidden" : ""
                  }`}
                >
                  Use selected total
                </button>
              ) : null}
            </div>
            <input
              inputMode="decimal"
              value={visibleCheckAmount}
              onChange={(event) => {
                const nextAmount = parseMoney(event.target.value);

                if (isRemittanceReview) {
                  setExtractedPaymentAmount(nextAmount > 0 ? nextAmount : null);
                }

                setCheckAmount(event.target.value);
                setCapturedCheckAmount(event.target.value);
              }}
              placeholder={formatMoney(selectedTotal)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-2 block text-sm text-zinc-400">
              Check #
            </label>
            <input
              value={paymentReference}
              onChange={(event) => {
                setPaymentReference(event.target.value);
                setCapturedCheckReference(event.target.value);
              }}
              placeholder="2721"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Payor
            </label>
            <input
              value={checkPayor}
              onChange={(event) => setCheckPayor(event.target.value)}
              placeholder="North Creek Apartments"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>

          {!isRemittanceReview ? (
          <div className="md:col-span-2 xl:col-span-1">
            <label className="mb-2 block text-sm text-zinc-400">
              Internal Note
            </label>
            <input
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Example: North Creek May unit batch"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-sky-500"
            />
          </div>
          ) : null}

          <div className="flex items-end">
            <button
              type="button"
              onClick={applyBatchPayment}
              disabled={
                !paymentCanApply
              }
              className="w-full rounded-2xl bg-green-500 px-5 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isSaving ? "Applying..." : "Confirm and Apply Payment"}
            </button>
          </div>
        </div>

        {selectedInvoices.length > 0 && !isRemittanceReview ? (
          <div
            className={`payment-balance-check mt-4 rounded-2xl border p-4 text-sm ${
              checkAmountMatches
                ? "border-green-500/30 bg-green-500/10 text-green-100"
                : "border-yellow-500/40 bg-yellow-500/10 text-yellow-100"
            }`}
          >
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="font-bold">
                  {enteredCheckAmount === null
                    ? "Ready to verify this batch"
                    : checkAmountMatches
                      ? "Check amount matches this batch"
                      : "Check amount needs attention"}
                </p>

                <p className="mt-1 leading-6">
                  {enteredCheckAmount === null ? (
                    <>
                      Selected invoices total {formatMoney(selectedTotal)}.
                      Enter the check amount if you want Trimax to verify the
                      batch before applying it.
                    </>
                  ) : checkAmountMatches ? (
                    <>
                      The entered check amount matches the selected invoice
                      total.
                    </>
                  ) : (
                    <>
                      {formatMoney(Math.abs(checkDifference))} is{" "}
                      {checkDifferenceLabel}. Adjust the selection or update
                      the check amount after owner review.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] opacity-70">
                  Selected
                </p>
                <p className="mt-1 font-black">
                  {formatMoney(selectedTotal)}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] opacity-70">
                  Check
                </p>
                <p className="mt-1 font-black">
                  {enteredCheckAmount === null
                    ? "Not entered"
                    : formatMoney(enteredCheckAmount)}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] opacity-70">
                  Still Open
                </p>
                <p className="mt-1 font-black">
                  {formatMoney(selectedRemainingBalance)}
                </p>
              </div>
            </div>

          </div>
        ) : null}

        {selectedCustomerBreakdown.length > 0 && showManualInvoiceBrowser ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-950">
                Selected payment batch
              </p>
                <p className="text-sm font-bold text-green-700">
                {formatMoney(selectedTotal)}
              </p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {selectedCustomerBreakdown.map((group) => (
                <div
                  key={group.customerName}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">
                    {group.customerName} ({group.count})
                  </span>
                  <span className="font-semibold text-slate-950">
                    {formatMoney(group.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {showManualInvoiceBrowser ? (
      <>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">
          Showing {visibleInvoices.length} invoice
          {visibleInvoices.length === 1 ? "" : "s"} totaling{" "}
          <span className="font-semibold text-white">
            {formatMoney(visibleTotal)}
          </span>
          .
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectVisibleInvoices}
            disabled={visibleInvoices.length === 0}
            className="rounded-full border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 transition hover:border-green-400 hover:bg-green-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Select Visible + Total
          </button>

          <button
            type="button"
            onClick={selectOverdueInvoices}
            disabled={!payableInvoices.some((invoice) => invoice.isOverdue)}
            className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Select Overdue
          </button>

          <button
            type="button"
            onClick={toggleAllVisible}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-green-300 hover:bg-green-50"
          >
            {allVisibleSelected ? "Unselect Visible" : "Select Visible"}
          </button>

          {selectedIds.length > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Clear Selection
            </button>
          ) : null}
        </div>
      </div>

      <div className="app-data-table mt-4 overflow-hidden rounded-2xl border border-zinc-700">
        <div className="app-data-table-head grid grid-cols-[56px_1fr_150px_140px] items-center gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-100 max-md:grid-cols-[42px_1fr_auto]">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
            aria-label="Select all visible open invoices"
            className="h-5 w-5 accent-green-500"
          />
          <span>Open Invoice</span>
          <span className="max-md:hidden">Due</span>
          <span className="text-right">Collection Due</span>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {visibleInvoices.map((invoice) => {
            const isLate = invoice.isOverdue;

            return (
              <label
                key={invoice.id}
                className={`grid cursor-pointer grid-cols-[56px_1fr_150px_140px] items-center gap-3 border-b border-zinc-800 px-4 py-4 transition last:border-b-0 max-md:grid-cols-[42px_1fr_auto] ${
                  selectedIds.includes(invoice.id)
                    ? "bg-emerald-500/15"
                    : "app-data-table-row bg-zinc-950 hover:bg-zinc-900"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(invoice.id)}
                  onChange={() => toggleInvoice(invoice.id)}
                  className="h-5 w-5 accent-green-500"
                />

                <span>
                  <span className="block font-semibold text-white">
                    {invoice.displayId} - {invoice.projectTitle}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-zinc-200">
                    {invoice.customerName} / {invoice.status}
                  </span>
                  {invoice.isDepositRequest ? (
                    <span className="mt-2 inline-flex rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                      Deposit request
                    </span>
                  ) : null}
                  <span className="mt-2 hidden text-xs font-semibold text-zinc-300 max-md:block">
                    Due {formatDate(invoice.dueDate)}
                  </span>
                </span>

                <span className="max-md:hidden">
                  <span className="block text-sm font-semibold text-zinc-100">
                    {formatDate(invoice.dueDate)}
                  </span>
                  {isLate ? (
                    <span className="mt-1 block text-xs font-semibold text-rose-200">
                      {invoice.daysLate} day
                      {invoice.daysLate === 1 ? "" : "s"} late
                    </span>
                  ) : null}
                </span>

                <span className="text-right font-bold text-emerald-200">
                  {formatMoney(invoice.amountDue)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      </>
      ) : null}
        </>
      ) : null}
    </Card>
  );
}
