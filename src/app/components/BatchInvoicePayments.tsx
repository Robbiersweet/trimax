"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./Card";
import DateInputField from "./DateInputField";
import Toast from "./Toast";
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
};

type ReviewMatchedInvoice = PayableInvoice & {
  remittanceAmount: number | null;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type CheckOcrStatus = "idle" | "reading" | "ready" | "manual" | "error";
type PaymentEntryMode = "choice" | "crop" | "photo" | "manual" | "complete";

type CropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CropSuggestion = {
  cropBox: CropBox;
  isTightlyFramed: boolean;
};

type CheckStubOcrResponse = {
  stubText?: string;
  rawText?: string;
  payor?: string;
  checkNumber?: string;
  checkDate?: string;
  totalAmount?: number;
  lines?: { amount?: unknown; invoiceNumbers?: unknown }[];
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
      0.92
    );
  });
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

    if (isTightlyFramed) {
      return {
        cropBox: fullImageCrop,
        isTightlyFramed: true,
      };
    }

    const padX = Math.round((maxX - minX) * 0.06);
    const padY = Math.round((maxY - minY) * 0.06);

    return {
      cropBox: {
        left: Math.max(0, Math.round(((minX - padX) / width) * 100)),
        top: Math.max(0, Math.round(((minY - padY) / height) * 100)),
        right: Math.min(100, Math.round(((maxX + padX) / width) * 100)),
        bottom: Math.min(100, Math.round(((maxY + padY) / height) * 100)),
      },
      isTightlyFramed: false,
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
    };
  }
}

async function cropPhotoForOcr(file: File, cropBox: CropBox, rotation: number) {
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
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotatedSideways = normalizedRotation === 90 || normalizedRotation === 270;
  const maxEdge = 2600;
  const scale = Math.min(
    1,
    maxEdge / Math.max(sourceWidth, sourceHeight)
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
  const [cropBox, setCropBox] = useState<CropBox>({
    left: 8,
    top: 8,
    right: 92,
    bottom: 92,
  });
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
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
        .map((invoice) => ({
          ...invoice,
          amountDue:
            typeof invoice.collectionAmountDue === "number"
              ? Math.max(invoice.collectionAmountDue, 0)
              : Math.max(invoice.invoiceAmount - invoice.amountPaid, 0),
          daysLate: daysPastDue(invoice.dueDate),
        })),
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
      (invoice) => (invoice.daysLate ?? -1) >= 0
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
    const notice =
      correctedAny && ocrTotalMismatchesCheck
        ? "Line amount reviewed against Trimax invoice balances and the remittance total."
        : extractedTotal > 0 &&
            matches.length > 0 &&
            Math.abs(invoiceTotal - extractedTotal) >= 0.01
          ? "Remittance total does not match selected invoices."
          : "";

    return {
      matches: isComplete ? corrected : [],
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
    setExtractedPaymentAmount(paymentAmount > 0 ? paymentAmount : null);
    setCheckAmount(paymentAmountText);
    setCapturedCheckAmount(paymentAmountText);
    setPaymentReference(extractedCheckNumber);
    setCapturedCheckReference(extractedCheckNumber);
    setCheckPayor(extractedPayor);
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

  async function filePaymentImage() {
    if (!checkImageFile || !businessId) {
      return null;
    }

    const extension =
      checkImageFile.type === "image/png"
        ? "png"
        : checkImageFile.type === "image/webp"
          ? "webp"
          : "jpg";
    const storageFileName = `${crypto.randomUUID()}-${safeStorageFileName(
      checkImageFile.name
    )}`;
    const storagePath = `${businessId}/payments/${new Date()
      .toISOString()
      .slice(0, 10)}/${storageFileName}.${extension}`;
    const bucket = "trimax-payment-images";
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, checkImageFile, {
        cacheControl: "31536000",
        contentType: checkImageFile.type || "image/jpeg",
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
        file_name: checkImageFile.name || checkImageName || storageFileName,
        content_type: checkImageFile.type || null,
        file_size: checkImageFile.size,
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
      fileName: String(attachment.file_name ?? checkImageFile.name),
    };

    setFiledPaymentImage(filedImage);

    return filedImage;
  }

  async function extractCheckStubFromPhoto(imageDataUrl: string) {
    if (imageDataUrl.length > 11_500_000) {
      setCheckOcrStatus("manual");
      setCheckOcrMessage(
        "That crop is large. Adjust crop tighter or enter the payment manually."
      );
      return;
    }

    setCheckOcrStatus("reading");
    setCheckOcrMessage("Reading the remittance stub from the image...");

    try {
      const response = await fetch("/api/payments/extract-check-stub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as CheckStubOcrResponse;

      if (!response.ok) {
        setCheckOcrStatus(response.status === 503 ? "manual" : "error");
        setCheckOcrMessage(
          data.error ??
            "Trimax could not read that remittance. Enter the payment manually."
        );
        return;
      }

      if (!data.stubText?.trim()) {
        setCheckOcrStatus("manual");
        setCheckOcrMessage(
          data.error ??
            "Could not read this remittance. Adjust crop or enter manually."
        );
        return;
      }

      const { reviewMatches, reconciledReview } = loadExtractedRemittance(data);
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
      setCheckOcrMessage(
        hasConfidentReview
          ? "Remittance read. Review the payment before applying."
          : "Remittance total does not match selected invoices."
      );
    } catch (error) {
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
    nextRotation: number
  ) {
    setIsPreparingCrop(true);

    try {
      const imageDataUrl = await cropPhotoForOcr(
        file,
        nextCropBox,
        nextRotation
      );

      setPaymentEntryMode("photo");
      void extractCheckStubFromPhoto(imageDataUrl);
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
    setCheckOcrMessage("Adjust the crop, then read it.");
  }

  function captureCheckImage(file: File | undefined) {
    if (!file) {
      return;
    }

    if (checkImagePreview) {
      URL.revokeObjectURL(checkImagePreview);
    }

    setCheckImagePreview(URL.createObjectURL(file));
    setCheckImageName(file.name);
    setCheckImageFile(file);
    setPaymentEntryMode("photo");
    setCheckOcrStatus("idle");
    setCheckOcrMessage("Preparing remittance...");
    setFiledPaymentImage(null);
    setRemittanceStubText("");
    setSelectedIds([]);
    setReviewMatchedInvoices([]);
    setExtractedPaymentAmount(null);
    setPaymentReviewNotice("");
    setCompletedPaymentSummary(null);
    setCheckAmount("");
    setPaymentReference("");
    setCheckPayor("");
    setCapturedCheckAmount("");
    setCapturedCheckReference("");
    setCropRotation(0);
    setIsTightlyFramedRemittance(false);
    void imageElementFromFile(file).then((image) => {
      const width = image.naturalWidth || image.width || 4;
      const height = image.naturalHeight || image.height || 3;

      setCropPreviewAspectRatio(width / height);
    });
    void detectDefaultCropBox(file).then((suggestion) => {
      setCropBox(suggestion.cropBox);
      setIsTightlyFramedRemittance(suggestion.isTightlyFramed);
      void readPreparedRemittanceFromFile(file, suggestion.cropBox, 0);
    });
    setToast({
      type: "success",
      message: "Remittance image added.",
    });
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

  return (
    <Card className="batch-payments-card border-green-500/30 bg-green-500/5">
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

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
                <label className="check-camera-action inline-flex cursor-pointer rounded-full bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600">
                  Take Photo
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => {
                      captureCheckImage(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                <label className="inline-flex cursor-pointer rounded-full border border-sky-300/50 px-4 py-2 text-sm font-black text-sky-100 transition hover:border-sky-200 hover:bg-sky-500/10">
                  Choose Existing Photo
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="sr-only"
                    onChange={(event) => {
                      captureCheckImage(event.target.files?.[0]);
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
                        captureCheckImage(event.target.files?.[0]);
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
                        captureCheckImage(event.target.files?.[0]);
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
                              cropRotation
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
            disabled={!payableInvoices.some((invoice) => (invoice.daysLate ?? -1) >= 0)}
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
            const isLate = (invoice.daysLate ?? -1) >= 0;

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
