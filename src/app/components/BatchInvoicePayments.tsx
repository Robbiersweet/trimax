"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./Card";
import DateInputField from "./DateInputField";
import Toast from "./Toast";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
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
type PaymentEntryMode = "choice" | "photo" | "manual" | "complete";

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

async function normalizePhotoForOcr(file: File) {
  try {
    const image = await imageElementFromFile(file);
    const maxEdge = 2400;
    const scale = Math.min(
      1,
      maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
    );
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("The remittance image could not be prepared.");
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvasToJpegDataUrl(canvas);
  } catch {
    return fileToDataUrl(file);
  }
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
        invoice.status.toLowerCase() !== "paid" &&
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
        invoice.status.toLowerCase() !== "paid" &&
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
          invoice.status.toLowerCase() !== "paid" &&
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
    checkAmountMatches;

  useEffect(() => {
    return () => {
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
      }
    };
  }, [checkImagePreview]);

  useEffect(() => {
    if (checkOcrStatus !== "ready") {
      return;
    }

    console.info("Trimax remittance review state", {
      totalAmount: enteredCheckAmount,
      extractedPaymentAmount,
      checkAmount,
      capturedCheckAmount,
      checkNumber: paymentReference,
      capturedCheckReference,
      payor: checkPayor,
      paymentDate,
      matchedInvoices: reviewMatchedInvoices.map((invoice) => ({
        id: invoice.id,
        displayId: invoice.displayId,
        amountDue: invoice.amountDue,
        remittanceAmount: invoice.remittanceAmount,
      })),
      selectedIds,
      selectedTotal,
      strictReferencedInvoices: remittanceMatch.referencedInvoiceNumbers,
      strictMatchCount: remittanceMatch.matches.length,
      strictMatchIssues: remittanceMatch.issues,
    });
  }, [
    capturedCheckAmount,
    capturedCheckReference,
    checkAmount,
    checkOcrStatus,
    checkPayor,
    enteredCheckAmount,
    extractedPaymentAmount,
    paymentDate,
    paymentReference,
    remittanceMatch,
    reviewMatchedInvoices,
    selectedIds,
    selectedTotal,
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
    const reviewMatches = matchInvoicesFromExtraction(data, stubText);
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

    console.info("Trimax remittance extraction handoff", {
      totalAmount: data.totalAmount,
      extractedPaymentAmount: paymentAmount,
      parsedTotalFromResponse,
      parsedTotalFromStub,
      parsedTotalFromLines,
      paymentAmountText,
      checkAmount: paymentAmountText,
      checkNumber: extractedCheckNumber,
      payor: extractedPayor,
      paymentDate: extractedDate,
      matchedInvoices: reviewMatches.map((invoice) => ({
        id: invoice.id,
        displayId: invoice.displayId,
        amountDue: invoice.amountDue,
        remittanceAmount: invoice.remittanceAmount,
      })),
      strictMatchConfidence: match.confidence,
      strictMatchIssues: match.issues,
    });

    return { match, reviewMatches };
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

  async function extractCheckStubFromPhoto(file: File) {
    if (file.size > 8_000_000) {
      setCheckOcrStatus("manual");
      setCheckOcrMessage(
        "That image is large. Enter the payment manually or upload a closer remittance photo."
      );
      return;
    }

    setCheckOcrStatus("reading");
    setCheckOcrMessage("Reading the remittance stub from the image...");

    try {
      const imageDataUrl = await normalizePhotoForOcr(file);
      const response = await fetch("/api/payments/extract-check-stub", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as CheckStubOcrResponse;

      console.info("Trimax remittance extraction response", data);

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
            "Trimax did not find readable remittance text. Enter the payment manually."
        );
        return;
      }

      const { reviewMatches } = loadExtractedRemittance(data);

      setCheckOcrStatus("ready");
      setCheckOcrMessage(
        reviewMatches.length > 0
          ? "Remittance read. Review the payment before applying."
          : "Remittance read. Select the invoices before applying."
      );
    } catch (error) {
      setCheckOcrStatus("error");
      setCheckOcrMessage(
        error instanceof Error
          ? error.message
          : "Trimax could not read that remittance. Enter the payment manually."
      );
    }
  }

  function resetCheckCaptureState() {
    setCheckImageFile(null);
    setCheckImageName("");
    setFiledPaymentImage(null);
    setRemittanceStubText("");
    setSelectedIds([]);
    setExtractedPaymentAmount(null);
    setReviewMatchedInvoices([]);
    setCapturedCheckAmount("");
    setCapturedCheckReference("");
    setCheckPayor("");
    setCheckOcrStatus("idle");
    setCheckOcrMessage(
      "Upload a remittance stub or enter the payment manually."
    );
    setPaymentEntryMode("choice");
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
    setFiledPaymentImage(null);
    setRemittanceStubText("");
    setSelectedIds([]);
    setReviewMatchedInvoices([]);
    setExtractedPaymentAmount(null);
    setCheckAmount("");
    setPaymentReference("");
    setCheckPayor("");
    setCapturedCheckAmount("");
    setCapturedCheckReference("");
    void extractCheckStubFromPhoto(file);
    setToast({
      type: "success",
      message: "Remittance image added. Trimax is reading it now.",
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

      for (const invoice of selectedInvoices) {
        const nextAmountPaid = Math.min(
          invoice.invoiceAmount,
          invoice.amountPaid + invoice.amountDue
        );
        const isFullyPaid =
          invoice.invoiceAmount > 0 &&
          nextAmountPaid >= invoice.invoiceAmount - 0.01;
        const updatePayload: {
          amount_paid: number;
          status: string;
          deposit_status?: string;
        } = {
          amount_paid: nextAmountPaid,
          status: isFullyPaid ? "Paid" : invoice.status,
        };

        if (invoice.isDepositRequest && !isFullyPaid) {
          updatePayload.deposit_status = "paid";
        }

        const { error } = await supabase
          .from("invoices")
          .update(updatePayload)
          .eq("id", invoice.id)
          .eq("business_id", businessId);

        if (error) {
          throw error;
        }

        await logActivity({
          businessId,
          action: "invoice.batch_payment_applied",
          entityType: "invoice",
          entityId: invoice.id,
          entityLabel: invoice.displayId,
          details: {
            paymentDate,
            paymentType,
            paymentReference,
            internalNote,
            checkAmount: enteredCheckAmount,
            amountApplied: invoice.amountDue,
            resultingAmountPaid: nextAmountPaid,
            paymentOutcome: isFullyPaid ? "paid" : "partial",
            depositPayment: Boolean(invoice.isDepositRequest),
            batchInvoiceCount: selectedInvoices.length,
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
            paymentAttachmentId: filedImage?.id ?? null,
            paymentImagePath: filedImage?.storagePath ?? null,
            paymentImageFileName: filedImage?.fileName ?? null,
          },
        });
      }

      setToast({
        type: "success",
        message: `Applied payment to ${selectedInvoices.length} invoice${
          selectedInvoices.length === 1 ? "" : "s"
        }.`,
      });
      setPaymentEntryMode("complete");
      setCheckOcrStatus("idle");
      setCheckOcrMessage("Payment applied.");
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
        setCheckImagePreview("");
      }
      router.refresh();
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
        <div className="rounded-3xl border border-emerald-300/40 bg-emerald-500/10 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">
            Complete
          </p>
          <h3 className="mt-2 text-2xl font-black text-white">
            Payment Applied
          </h3>
          <button
            type="button"
            onClick={() => {
              setPaymentReference("");
              setCheckAmount("");
              setInternalNote("");
              resetCheckCaptureState();
            }}
            className="mt-5 rounded-2xl bg-emerald-500 px-5 py-3 font-black text-black transition hover:bg-emerald-400"
          >
            Process Another Payment
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
                    Upload Remittance
                  </span>
                </span>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <label className="check-camera-action inline-flex cursor-pointer rounded-full bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600">
                  Upload Remittance
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) =>
                      captureCheckImage(event.target.files?.[0])
                    }
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
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Pick one path to start. Trimax keeps the current invoice list ready below.
                </p>
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
                    {checkOcrMessage}
                  </div>
                ) : null}

                {checkOcrStatus === "ready" ? (
                  <div className="mt-3 rounded-xl border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-50">
                    {checkOcrMessage}
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
                        className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">
                            {invoice.displayId} - {invoice.projectTitle}
                          </span>
                          <span className="mt-0.5 block truncate text-zinc-400">
                            {invoice.customerName}
                          </span>
                        </span>
                        <span className="font-black text-emerald-300">
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
      <div className="app-soft-panel mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[150px_130px_170px_180px_1fr_auto]">
          <DateInputField
            label="Payment Date"
            value={paymentDate}
            onChange={setPaymentDate}
            inputClassName="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-28 text-slate-950 outline-none transition focus:border-sky-500"
          />

          <div>
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

          <div>
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

          <div>
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

        {selectedInvoices.length > 0 ? (
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
