"use client";
import { roundMoney as canonicalRoundMoney } from "../lib/money.ts";

import { sumMoney, subtractMoney, moneyCents } from "../lib/money.ts";

import { useRemittanceEvent } from "../lib/useRemittanceEvent";
import RemittanceCamera from "./RemittanceCamera";
import { remittanceDeadline, REMITTANCE_PROCESSING_LIMIT_MS } from "../lib/remittanceDeadline";
import { storeCanonicalCapture, resumeCaptureHandoff } from "../lib/ocrCanonicalClient";
import LegacyOcrJobs from "./LegacyOcrJobs";
import { waitForLegacyJob } from "../lib/ocrLegacyJobClient";
import { transportFailure, type CanonicalCapture, type TransportFailure } from "../lib/ocrCanonical";

import { normalizePhysicalStill } from "../lib/ocrOpticalBrowser";

import type { OpticalEvidence } from "../lib/ocrOptical";

import { createRemittanceEvidence, emptyRemittanceEvidence, immutableSnapshot, resolveRemittanceAttempt, attemptAllowsApply, type RemittanceAttempt, type RemittanceEvidence, type ScanCapture } from "../lib/remittanceAttempt";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Card from "./Card";
import RecentScans from "./RecentScans";
import { legacyMoneyEvidence, type SharedMoneyEvidence } from "../lib/documentFields/moneyContract";
import { scanSummary, finishScan, failureSummary, debugFile, slimAttempt, type ScanSummary, type ScanResult } from "../lib/ocrHistory";
import { saveScan, scanDiagnostics, scanOptical, pairedScanSummary } from "../lib/ocrHistoryClient";
import { selectCapture, type CaptureImplementation, type CaptureUiEvidence } from "../lib/captureRouting";
import { loadShadowFlags } from "../lib/ocrV2/shadow/client";
import { DISABLED_SHADOW, shadowAllowed, type CaptureTimings } from "../lib/ocrV2/shadow/contract";
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
  type StructuredRemittanceRowEvidence,
  type RemittanceTotalEvidence,
} from "../lib/remittanceMatching";
import {
  findDuplicateRemittance,
  type DuplicateRemittanceActivity,
  type DuplicateRemittanceResult,
} from "../lib/duplicateRemittance";

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
  splitParentInvoiceId?: string | null;
  splitChildrenCount?: number | null;
};

type BatchInvoicePaymentsProps = {
  retainedAttemptId?: string;
  invoices: BatchInvoice[];
  businessId?: string | null;
  businessSlug?: string | null;
  initialCustomer?: string | null;
  initialInvoiceIds?: string[];
  workspaceRole?: string | null;
  paymentActivities?: DuplicateRemittanceActivity[];
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
  | "photo"
  | "manual"
  | "complete";

type RemittanceDocumentType =
  | "remittance_stub"
  | "full_check_stub"
  | "check_only";

type CaptureIntent = "primary" | "check_details";
type OcrRetryStrategy = "standard" | "alternate";
type OcrSourceType = "camera" | "existing" | "unknown";

type CheckStubOcrResponse = {
  ocrStarted?: boolean;
  stage?: string;
  optical?: OpticalEvidence;
  evidence?: RemittanceEvidence;
  documentType?: RemittanceDocumentType;
  stubText?: string;
  rawText?: string;
  payor?: string;
  checkNumber?: string;
  checkDate?: string;
  totalAmount?: number;
  totalEvidence?: RemittanceTotalEvidence;
  lines?: { amount?: unknown; invoiceNumbers?: unknown }[];
  structuredRowEvidence?: StructuredRemittanceRowEvidence[];
  diagnostics?: {
    summary?: string[];
    headerEvidence?: unknown;
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
    explicitDocumentTotal?: number;
    explicitDocumentTotalEvidence?: {
      amount?: number;
      source?: string;
      payable?: boolean;
      raw?: string;
      normalized?: string;
      normalizationReason?: string;
    };
    selectedSummary?: string;
    regionSummaries?: string[];
    stageTimings?: Record<string, number>;
    candidateSummaries?: Array<{
      region?: string;
      rotation?: number;
      variant?: string;
      pageMode?: string;
      durationMs?: number;
      imageWidth?: number;
      imageHeight?: number;
      confidence?: number;
      score?: number;
      validRows?: number;
      tokens?: {
        invoiceLike?: string[];
        dates?: string[];
        units?: string[];
        amounts?: string[];
      };
      summary?: string;
    }>;
    geometryRowSetSummaries?: Array<{
      region?: string;
      variant?: string;
      pageMode?: string;
      rows?: number;
      acceptedRows?: number;
      score?: number;
    }>;
    expectedRowCount?: number;
    textRegionMetrics?: {
      wordCount?: number;
      highConfidenceWordCount?: number;
      medianWordHeight?: number;
      averageWordConfidence?: number;
      textRegionBounds?: {
        x0?: number;
        y0?: number;
        x1?: number;
        y1?: number;
      } | null;
      textRegionAreaRatio?: number;
      sourcePixelsPerDocumentHeight?: number;
    };
    geometryTokenSummaries?: {
      invoiceLike?: string[];
      unitLike?: string[];
      dates?: string[];
      amounts?: string[];
    };
    geometricRows?: Array<{
      y?: number;
      height?: number;
      score?: number;
      text?: string;
    }>;
    rowAssignments?: Array<{ row: number; token: string; pass: string; centerY: number; rowY: number; distance: number; accepted: boolean; reason: string }>;
    structuredRowDiagnostics?: Array<{
      rowId?: string;
      y?: number;
      height?: number;
      invoiceEvidenceByPass?: Array<{
        raw?: string;
        normalized?: string[];
        region?: string;
        variant?: string;
        pageMode?: string;
        confidence?: number;
        bbox?: {
          x0?: number;
          y0?: number;
          x1?: number;
          y1?: number;
        };
      }>;
      chosenInvoiceEvidence?: string[];
      unitEvidence?: string[];
      amountEvidence?: string[];
      resolutionHint?: string;
    }>;
    geometricRowDetails?: Array<{
      y?: number;
      height?: number;
      score?: number;
      reconstructedText?: string;
      accepted?: boolean;
      rejectionReason?: string;
      amount?: number;
      amountCandidates?: Array<{
        raw?: string;
        normalized?: string;
        value?: number;
        score?: number;
        selected?: boolean;
        reason?: string;
        confidence?: number;
        bbox?: {
          x0?: number;
          y0?: number;
          x1?: number;
          y1?: number;
        };
      }>;
      nearbyAmountTokens?: Array<{
        text?: string;
        confidence?: number;
        bbox?: {
          x0?: number;
          y0?: number;
          x1?: number;
          y1?: number;
        };
        region?: string;
        variant?: string;
        pageMode?: string;
      }>;
      invoiceNumbers?: string[];
      unitCodes?: string[];
      tokens?: Array<{
        text?: string;
        field?: string;
        confidence?: number;
        bbox?: {
          x0?: number;
          y0?: number;
          x1?: number;
          y1?: number;
        };
      }>;
    }>;
    invoiceColumnDiagnostics?: {
      bounds?: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
      };
      width?: number;
      height?: number;
      estimatedCharacterHeight?: number;
      sharpness?: number;
      contrast?: number;
      skippedReason?: string;
      rowBands?: Array<{
        row?: number;
        y?: number;
        height?: number;
        sourceText?: string;
        tokens?: Array<{
          text?: string;
          confidence?: number;
          bbox?: {
            x0?: number;
            y0?: number;
            x1?: number;
            y1?: number;
          };
          region?: string;
          variant?: string;
          pageMode?: string;
        }>;
      }>;
      attempts?: Array<{
        variant?: string;
        pageMode?: string;
        scaling?: string;
        durationMs?: number;
        confidence?: number;
        rawText?: string;
        invoiceLikeTokens?: string[];
        parseableInvoiceNumbers?: string[];
        normalizedInvoiceTokens?: Array<{
          raw?: string;
          normalized?: string;
          parsed?: boolean;
        }>;
        words?: Array<{
          text?: string;
          confidence?: number;
          bbox?: {
            x0?: number;
            y0?: number;
            x1?: number;
            y1?: number;
          };
        }>;
      }>;
    } | null;
  };
  error?: string;
};

type DuplicateRemittancePreflightResponse = {
  ok?: boolean;
  documentFingerprint?: {
    version?: string;
    hash?: string;
  };
  priorImagesCompared?: number;
  imageHints?: Array<{ paymentId: string; distance: number; invoiceNumbers: string[] }>;
  duplicateRemittance?: DuplicateRemittanceResult;
  error?: string;
};

type DuplicatePreflightEvidence = {
  checkNumber: string;
  amount: number | null;
  checkDate: string;
  receivedDate: string;
  payor: string;
  invoiceIds: string[];
  invoiceNumbers: string[];
};

type DuplicatePreflightOutcome = {
  stoppedOcr: boolean;
  fingerprint: string;
};

type ApplyBatchPaymentResponse = {
  validated?: boolean;
  paymentApplied?: boolean;
  error?: string;
  code?: string;
  stage?: string;
  serverMessage?: string;
  partialMutationOccurred?: boolean;
  rollbackAttempted?: boolean;
  rollbackSucceeded?: boolean | null;
  appliedCount?: number;
  checkAmount?: number;
  paymentReference?: string;
  payor?: string;
  duplicateRemittance?: DuplicateRemittanceResult;
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

type DuplicateRemittanceModalState = {
  result: DuplicateRemittanceResult;
  intent: "active" | "reversed" | "possible";
} | null;

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(canonicalRoundMoney(value));
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
          : Math.max(subtractMoney(invoice.invoiceAmount, invoice.amountPaid), 0),
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
    total: sumMoney(matchingInvoices.map(invoice => invoice.amountDue)),
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
          : Math.max(subtractMoney(invoice.invoiceAmount, invoice.amountPaid), 0),
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
    total: sumMoney(matchingInvoices.map(invoice => invoice.amountDue)),
  };
}

export default function BatchInvoicePayments({
  retainedAttemptId,
  invoices,
  businessId,
  businessSlug,
  initialCustomer,
  initialInvoiceIds,
  workspaceRole,
  paymentActivities = [],
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
  const [checkDate, setCheckDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayInputValue());
  const [paymentType, setPaymentType] = useState("Check");
  const [paymentReference, setPaymentReference] = useState("");
  const [checkAmount, setCheckAmount] = useState(
    startingFocus ? formatMoney(startingFocus.total) : ""
  );

  const observationScopeRef = useRef<string>(crypto.randomUUID());
  const opticalRef = useRef<OpticalEvidence>({images:[],notes:[]});
  const [checkImagePreview, setCheckImagePreview] = useState("");
  const [checkImageName, setCheckImageName] = useState("");
  const [checkImageFile, setCheckImageFile] = useState<File | null>(null);
  const [ocrImageFile, setOcrImageFile] = useState<File | null>(null);

  const resumedDiagnosticReplay = useRef(false);

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
  const [ocrReconciliationVerified, setOcrReconciliationVerified] = useState(false);
  const ocrAttemptVersion = useRef(0);
  useEffect(()=>()=>{ocrAttemptVersion.current++;},[]);
  const [shadowFlags, setShadowFlags] = useState({...DISABLED_SHADOW,businessId:''});
  const captureUi = useRef<CaptureUiEvidence | null>(null);
  const captureTimings = useRef<CaptureTimings>({captureOpenedAt:null,stillReturnedAt:null,previewPaintOpportunityAt:null,cameraIndicatorMs:null});
  useEffect(() => {
    let current = true;
    if (!businessId || !['owner','admin'].includes(workspaceRole ?? '')) return;
    const refresh = () => { void loadShadowFlags(businessId).then(flags => { if(current)setShadowFlags({...flags,businessId}); }).catch(error=>{if(current)setShadowFlags({...DISABLED_SHADOW,businessId,readError:String(error)});}); };
    refresh(); window.addEventListener('focus',refresh);
    return () => { current=false; window.removeEventListener('focus',refresh); };
  },[businessId,workspaceRole]);
  const scanLineage = useRef<{original:string;last:string}|null>(null);
  const latestScan = useRef<ScanSummary|null>(null);
  const [scanSavedStatus, setScanSavedStatus] = useState("");
  const [activeRemittanceAttempt, setActiveRemittanceAttempt] = useState<RemittanceAttempt | null>(null);
  const [sharedMoneyStatus, setSharedMoneyStatus]=useState('');
  const [sharedMoneyLoading, setSharedMoneyLoading]=useState(false);
  async function reviewSharedMoney(){
    const history=latestScan.current,version=ocrAttemptVersion.current;
    if(!history||!businessId||!activeRemittanceAttempt||!['owner','admin'].includes(workspaceRole??'')||!shadowAllowed(shadowFlags,workspaceRole))return;
    setSharedMoneyLoading(true);setSharedMoneyStatus('Loading saved amount evidence…');
    try{
      const summary=await pairedScanSummary(history.attemptId);
      if(!summary?.shadowAttemptId)throw Error('Amount evidence is not available yet. Legacy review remains available.');
      const [legacy, shadow]=await Promise.all([scanDiagnostics(businessId,history.attemptId),scanDiagnostics(businessId,summary.shadowAttemptId)]);
      const payload=legacy as {response?:CheckStubOcrResponse;[key:string]:unknown};
      const shared=(shadow as {result?:{sharedMoney?:SharedMoneyEvidence}})?.result?.sharedMoney;
      if(!shared||!history.sourceImageHash)throw Error('Shared amount evidence is unavailable or still processing.');
      const diagnostics=payload.response?.diagnostics as unknown as {documentWidth:number;documentHeight:number;orientation:{rotation:number}};
      const evidence=legacyMoneyEvidence(activeRemittanceAttempt.evidence,shared,{captureSessionId:history.attemptId,canonicalHash:history.sourceImageHash,rotation:diagnostics.orientation.rotation,width:diagnostics.documentWidth,height:diagnostics.documentHeight});
      const context={...activeRemittanceAttempt.corroboration.context,role:workspaceRole??'',receivedDate};
      const updated=resolveRemittanceAttempt(evidence,invoiceRecords,paymentActivities,context);
      if(version!==ocrAttemptVersion.current||latestScan.current?.attemptId!==history.attemptId)return;
      setActiveRemittanceAttempt(updated);
      setOcrReconciliationVerified(false);
      const count=evidence.physicalRows.filter(r=>r.amountCandidates.some(a=>a.selected)).length;
      setSharedMoneyStatus(`${count}/${evidence.physicalRows.length} row amounts supported. ${evidence.headerEvidence.documentTotal?.payable?'Document total supported.':'Document total still needs review.'} Original scan history is preserved. Review invoice selections before applying any payment.`);
      // Terminal scans remain immutable; the paired diagnostics retain the shared packet.
    }catch(error){if(version===ocrAttemptVersion.current)setSharedMoneyStatus(error instanceof Error?error.message:String(error));}
    finally{if(version===ocrAttemptVersion.current)setSharedMoneyLoading(false);}
  }
  const sourceSelectionRef = useRef<ScanCapture["sources"]>([]);
  const preparedCaptureRef = useRef<ScanCapture | null>(null);
  const [completedPaymentSummary, setCompletedPaymentSummary] =
    useState<CompletedPaymentSummary>(null);
  const [duplicateRemittanceModal, setDuplicateRemittanceModal] =
    useState<DuplicateRemittanceModalState>(null);
  const [remittanceDocumentFingerprint, setRemittanceDocumentFingerprint] =
    useState("");
  const [duplicateOverrideClearedKey, setDuplicateOverrideClearedKey] =
    useState("");
  const [reversedDuplicateReviewedKey, setReversedDuplicateReviewedKey] =
    useState("");
  const [remittanceStubText, setRemittanceStubText] = useState("");
  const [lastOcrDiagnosticLines, setLastOcrDiagnosticLines] = useState<string[]>(
    []
  );
  const [lastOcrPrepDiagnosticLines, setLastOcrPrepDiagnosticLines] = useState<
    string[]
  >([]);
  const [lastOcrRawText, setLastOcrRawText] = useState("");
  const [lastOcrSourceType, setLastOcrSourceType] =
    useState<OcrSourceType>("unknown");
  const [lastCameraCaptureDiagnosticLines, setLastCameraCaptureDiagnosticLines] =
    useState<string[]>([]);
  const [checkOcrStatus, setCheckOcrStatus] = useState<CheckOcrStatus>("idle");
  const [paymentEntryMode, setPaymentEntryMode] =
    useState<PaymentEntryMode>("choice");
  // Session-only recovery retains the same photo and attempt; never writes image bytes to device storage.
  const [captureRetry, setCaptureRetry] = useState<{ run: () => Promise<void> } | null>(null);
  const captureRetryBusy = useRef(false);
  const [checkOcrMessage, setCheckOcrMessage] = useState(
    "Upload a remittance stub or enter the payment manually."
  );
  const processingDeadlineAt = useRef(0);
  const [processingEpoch, setProcessingEpoch] = useState(0);
  function beginProcessingWindow() {
    processingDeadlineAt.current = Date.now() + REMITTANCE_PROCESSING_LIMIT_MS;
    setProcessingEpoch(value => value + 1);
  }
  useEffect(() => {
    if (checkOcrStatus !== "reading" && !isPreparingCrop) { processingDeadlineAt.current = 0; return; }
    const timer = window.setTimeout(() => {
      processingDeadlineAt.current = 0;
      ocrAttemptVersion.current++;
      setIsPreparingCrop(false);
      setCheckOcrStatus("error");
      setCheckOcrMessage("Trimax couldn't finish reading this remittance. Your photo is preserved. Retry, retake, choose an existing photo, or enter manually.");
    }, Math.max(0, processingDeadlineAt.current - Date.now()));
    return () => window.clearTimeout(timer);
  }, [checkOcrStatus, isPreparingCrop, processingEpoch]);
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
  const paymentSubmitBusy = useRef(false);
  const [paymentConfirmation, setPaymentConfirmation] = useState<{key:string;checkNumber:string;payor:string;amount:number;invoiceNumbers:string[];savedDiagnostic:boolean}|null>(null);
  const [isValidatingPayment, setIsValidatingPayment] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const invoiceRecords = useMemo<PayableInvoice[]>(
    () =>
      invoices
        .map((invoice) => {
          const amountDue =
            typeof invoice.collectionAmountDue === "number"
              ? Math.max(invoice.collectionAmountDue, 0)
              : Math.max(subtractMoney(invoice.invoiceAmount, invoice.amountPaid), 0);

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

  const selectedTotal = sumMoney(selectedInvoices.map(invoice => invoice.amountDue));

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
      total: sumMoney([current.total, invoice.amountDue]),
    });
  });

  const selectedCustomerBreakdown = Array.from(
    selectedCustomerGroups.values()
  ).sort((first, second) =>
    first.customerName.localeCompare(second.customerName)
  );

  const visibleTotal = sumMoney(visibleInvoices.map(invoice => invoice.amountDue));

  const openBalance = sumMoney(payableInvoices.map(invoice => invoice.amountDue));

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
      : subtractMoney(enteredCheckAmount, selectedTotal);
  const checkAmountMatches =
    enteredCheckAmount === null || moneyCents(checkDifference) === 0;
  const checkDifferenceLabel =
    checkDifference > 0 ? "unassigned" : "over-selected";
  const selectedRemainingBalance = Math.max(subtractMoney(openBalance, selectedTotal), 0);
  const allVisibleSelected =
    visibleInvoices.length > 0 &&
    visibleInvoices.every((invoice) => selectedIds.includes(invoice.id));

  const capturedAmountValue = capturedCheckAmount.trim()
    ? parseMoney(capturedCheckAmount)
    : 0;
  const remittanceMatch = useMemo(
    () => activeRemittanceAttempt?.resolverResult ?? findRemittanceMatches([], "", ""),
    [activeRemittanceAttempt]
  );
  const selectedInvoiceIdSet = new Set(selectedInvoices.map((invoice) => invoice.id));
  const reviewInvoiceIdSet = new Set(
    reviewMatchedInvoices.map((invoice) => invoice.id)
  );
  const hasDuplicateReviewInvoiceIds =
    reviewInvoiceIdSet.size !== reviewMatchedInvoices.length;
  const hasDuplicateSelectedInvoiceIds =
    selectedInvoiceIdSet.size !== selectedInvoices.length;
  const selectedReviewSetsMatch =
    selectedInvoiceIdSet.size > 0 &&
    selectedInvoiceIdSet.size === reviewInvoiceIdSet.size &&
    Array.from(selectedInvoiceIdSet).every((invoiceId) =>
      reviewInvoiceIdSet.has(invoiceId)
    );
  const reviewMatchedTotal = sumMoney(reviewMatchedInvoices.map(invoice => invoice.amountDue));
  const hasRemittanceStub = remittanceStubText.trim().length > 0;
  const duplicateEvidenceKey = [
    paymentReference.trim() || capturedCheckReference.trim(),
    enteredCheckAmount ?? "",
    checkDate,
    receivedDate,
    checkPayor.trim().toLowerCase(),
    remittanceDocumentFingerprint,
    selectedInvoices.map((invoice) => invoice.id).sort().join(","),
  ].join("|");
  const duplicateRemittanceCheck = useMemo(
    () =>
      findDuplicateRemittance(
        {
          checkNumber: paymentReference.trim() || capturedCheckReference.trim(),
          amount: enteredCheckAmount,
          checkDate,
          receivedDate,
          payor: checkPayor,
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          invoiceNumbers: selectedInvoices.map((invoice) => invoice.displayId),
          fingerprint: remittanceDocumentFingerprint,
        },
        paymentActivities,
        workspaceRole ?? ""
      ),
    [
      capturedCheckReference,
      checkDate,
      checkPayor,
      enteredCheckAmount,
      paymentActivities,
      paymentReference,
      receivedDate,
      remittanceDocumentFingerprint,
      selectedInvoices,
      workspaceRole,
    ]
  );
  const showPaymentReview =
    paymentEntryMode === "manual" ||
    (paymentEntryMode === "photo" &&
      checkOcrStatus !== "reading" &&
      checkOcrStatus !== "idle");
  const showManualInvoiceBrowser = paymentEntryMode === "manual";
  const paymentCanApply =
    !isSaving &&
    (paymentEntryMode !== "photo" || attemptAllowsApply(activeRemittanceAttempt, selectedIds, reviewMatchedInvoices.map(invoice => invoice.id), enteredCheckAmount, duplicateRemittanceCheck.status !== "none")) &&
    (paymentEntryMode !== "photo" || (checkOcrStatus === "ready" && ocrReconciliationVerified)) &&
    selectedInvoices.length > 0 &&
    enteredCheckAmount !== null &&
    checkAmountMatches &&
    (!isRemittanceReview ||
      (ocrReconciliationVerified &&
        !isPreparingCrop &&
        extractedPaymentAmount !== null &&
        extractedPaymentAmount > 0 &&
        moneyCents(selectedTotal) === moneyCents(extractedPaymentAmount) &&
        moneyCents(reviewMatchedTotal) === moneyCents(extractedPaymentAmount) &&
        !hasDuplicateSelectedInvoiceIds &&
        !hasDuplicateReviewInvoiceIds &&
        selectedReviewSetsMatch));

  useEffect(() => {
    return () => {
      if (checkImagePreview) {
        URL.revokeObjectURL(checkImagePreview);
      }
    };
  }, [checkImagePreview]);

  function appendCameraStage(stage: string) {
    setCheckOcrMessage(stage.includes("Upload") ? "Preparing image" : stage === "OCR started" ? "Reading remittance" : stage === "Matching completed" ? "Preparing review" : "Finding invoices");
  }

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
    const invoiceTotal = sumMoney(invoiceList.map(invoice => invoice.amountDue));

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

  function uniqueReviewMatchesById(matches: ReviewMatchedInvoice[]) {
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    const uniqueMatches = matches.filter((invoice) => {
      if (seenIds.has(invoice.id)) {
        duplicateIds.push(invoice.id);
        return false;
      }

      seenIds.add(invoice.id);
      return true;
    });

    return {
      matches: uniqueMatches,
      duplicateIds: Array.from(new Set(duplicateIds)),
    };
  }

  function loadExtractedRemittance(
    data: CheckStubOcrResponse,
    currentDocumentFingerprint: string = remittanceDocumentFingerprint,
    attemptId = crypto.randomUUID(),
    capture = preparedCaptureRef.current,
    databaseSnapshot = { invoices: structuredClone(invoiceRecords), activities: structuredClone(paymentActivities), role: workspaceRole ?? "", receivedDate }
  ) {
    const stubText = data.stubText?.trim() ?? "";
    const evidence = createRemittanceEvidence(data.evidence ? { ...data.evidence, attemptId,
      capture: capture ?? data.evidence.capture } : {
      attemptId, capture: capture ?? { source: "unknown", image: { width: 0, height: 0, bytes: 0, mime: "unknown" }, quality: {}, sources: [], selectionReason: "Missing structured response" },
      rawPasses: [], headerEvidence: { checkNumber: null, checkDate: null, payor: null, documentTotal: null,
        candidates: { evidence: null, totalCandidates: [], checkNumber: "", checkCandidates: [] } },
      physicalRows: [], assignments: [], diagnostics: ["Missing structured OCR contract; manual review required."],
    });
    const attempt = resolveRemittanceAttempt(evidence, databaseSnapshot.invoices, databaseSnapshot.activities,
      { role: databaseSnapshot.role, receivedDate: databaseSnapshot.receivedDate, fingerprint: currentDocumentFingerprint });
    setActiveRemittanceAttempt(attempt);
    const match = structuredClone(attempt.resolverResult) as ReturnType<typeof findRemittanceMatches>;
    const authoritativeResolvedMatches = match.resolvedMatches;
    const extractedPayor = evidence.headerEvidence.payor ?? "";
    const extractedCheckNumber = evidence.headerEvidence.checkNumber ?? "";
    const extractedDate = evidence.headerEvidence.checkDate ?? "";
    const extractedTotal = attempt.reconciliationResult.documentTotal ?? 0;
    const historicalDuplicateCheck = structuredClone(attempt.duplicateResult) as DuplicateRemittanceResult;
    const rawReviewMatchesFromParser = authoritativeResolvedMatches
      .map((matchedInvoice): ReviewMatchedInvoice | null => {
        const invoice = payableInvoices.find(
          (payableInvoice) => payableInvoice.id === matchedInvoice.id
        );

        return invoice
          ? {
              ...invoice,
              remittanceAmount: match.matchTrace.find((trace) => trace.invoiceId === matchedInvoice.id && trace.accepted)?.ocrRowAmount ?? null,
            }
          : null;
      })
      .filter((invoice): invoice is ReviewMatchedInvoice => Boolean(invoice));
    const rawReviewMatchesBeforeDedupe = rawReviewMatchesFromParser;
    const dedupedReview = uniqueReviewMatchesById(rawReviewMatchesBeforeDedupe);
    const rawReviewMatches = dedupedReview.matches;
    const reconciledReview = { matches: rawReviewMatches, invoiceTotal: match.matchedTotal,
      notice: [extractedTotal <= 0 ? "Document total not found. Enter the check amount in manual review." : "", ...attempt.reconciliationResult.blockers].filter(Boolean).join(" "), isComplete: attempt.reconciliationResult.eligible };
    const reviewMatches = reconciledReview.matches;
    setOcrReconciliationVerified(attempt.reconciliationResult.eligible);
    const matchedCustomers = Array.from(
      new Set(reviewMatches.map((invoice) => invoice.customerName))
    );
    const paymentAmount = extractedTotal;
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
    setPaymentReference(extractedCheckNumber);
    setCapturedCheckReference(extractedCheckNumber);
    setCheckPayor(extractedPayor);
    setPaymentReviewNotice(
      [
        dedupedReview.duplicateIds.length > 0
          ? `Duplicate OCR invoice matches removed: ${dedupedReview.duplicateIds.join(", ")}.`
          : "",
        rawReviewMatchesFromParser.length === 0 &&
        matchInvoicesFromExtraction(data, stubText).length > 0
          ? "Legacy text-only matches were left as diagnostics and were not auto-selected."
          : "",
        ...match.issues,
        reconciledReview.notice,
      ]
        .filter(Boolean)
        .join(" ")
    );

    setCheckDate(extractedDate);

    if (historicalDuplicateCheck.status !== "none") {
      setDuplicateRemittanceModal({
        result: historicalDuplicateCheck,
        intent:
          historicalDuplicateCheck.status === "active"
            ? "active"
            : historicalDuplicateCheck.status === "reversed"
              ? "reversed"
              : "possible",
      });
      setCheckOcrStatus("manual");
      setCheckOcrMessage(
        historicalDuplicateCheck.status === "active"
          ? "This check stub has already been applied."
          : historicalDuplicateCheck.status === "reversed"
            ? "Review the reversed payment before applying again."
            : "Review the possible duplicate remittance before continuing."
      );
    }

    setCustomerFilter(matchedCustomers.length === 1 ? matchedCustomers[0] : "all");
    setInternalNote(
      reviewMatches.length > 0
        ? `Remittance stub match${
            checkImageName ? ` from ${checkImageName}` : ""
          }`
        : "Remittance stub review"
    );

    return {
      match,
      reviewMatches,
      reconciledReview,
      duplicateIds: dedupedReview.duplicateIds,
      historicalDuplicateCheck,
      attempt,
    };
  }

  function loadCheckDetailsFromExtraction(data: CheckStubOcrResponse) {
    const stubText = data.stubText?.trim() ?? "";
    const extractedPayor =
      data.payor?.trim() || extractLikelyPayor(stubText);
    const extractedCheckNumber =
      data.checkNumber?.trim() ?? extractCheckNumber(stubText);
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
      setCheckDate((current) => current || extractedDate);
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

  function ocrDiagnosticLines(data: CheckStubOcrResponse) {
    const diagnostics = data.diagnostics;
    const lines = [...(diagnostics?.summary ?? [])];
    const parsedInvoiceNumbers =
      data.lines
        ?.flatMap((line) =>
          Array.isArray(line.invoiceNumbers)
            ? line.invoiceNumbers.map((invoiceNumber) => String(invoiceNumber))
            : []
        )
        .filter(Boolean) ?? [];
    const parsedAmounts =
      data.lines
        ?.map((line) =>
          typeof line.amount === "number"
            ? line.amount
            : typeof line.amount === "string"
              ? parseMoney(line.amount)
              : 0
        )
        .filter((amount) => amount > 0) ?? [];

    lines.push(
      `Parsed fields: check=${data.checkNumber?.trim() || "not found"}, date=${data.checkDate?.trim() || "not found"}, payor=${data.payor?.trim() || "not found"}, total=${typeof data.totalAmount === "number" && data.totalAmount > 0 ? formatMoney(data.totalAmount) : "not found"}.`
    );
    lines.push(
      `Parsed invoice numbers: ${parsedInvoiceNumbers.length > 0 ? parsedInvoiceNumbers.join(", ") : "none"}.`
    );
    lines.push(
      `Parsed line amounts: ${parsedAmounts.length > 0 ? parsedAmounts.map((amount) => formatMoney(amount)).join(", ") : "none"}.`
    );

    if (!diagnostics) {
      return lines;
    }

    if (diagnostics.originalWidth && diagnostics.originalHeight) {
      lines.push(
        `Original image: ${diagnostics.originalWidth} x ${diagnostics.originalHeight}.`
      );
    }

    if (diagnostics.documentWidth && diagnostics.documentHeight) {
      lines.push(
        `OCR image: ${diagnostics.documentWidth} x ${diagnostics.documentHeight}.`
      );
    }

    if (diagnostics.selectedRegion || diagnostics.selectedVariant) {
      lines.push(
        `Selected OCR: ${diagnostics.selectedRegion ?? "unknown region"}, ${diagnostics.selectedVariant ?? "unknown variant"}, rotation ${diagnostics.selectedRotation ?? 0}, confidence ${Math.round(diagnostics.selectedConfidence ?? 0)}.`
      );
    }

    if (diagnostics.stageTimings) {
      const stageEntries = Object.entries(diagnostics.stageTimings);
      const lastStage = stageEntries.at(-1);
      const maxDuration = Math.max(
        ...stageEntries.map(([, duration]) => duration),
        0
      );

      lines.push(`OCR started: yes.`);
      lines.push(
        `OCR completed: ${data.rawText?.trim() || data.stubText?.trim() ? "yes" : "no"}.`
      );
      lines.push(`OCR route duration: ${maxDuration}ms.`);
      if (lastStage) {
        lines.push(`Last OCR stage: ${lastStage[0]} at ${lastStage[1]}ms.`);
      }
    } else {
      lines.push("OCR started: unknown.");
      lines.push("OCR completed: unknown.");
    }

    if (diagnostics.selectedSummary) {
      lines.push(`Selected text summary: ${diagnostics.selectedSummary}.`);
    }

    if (diagnostics.headerEvidence) {
      lines.push(`Header candidate selection: ${JSON.stringify(diagnostics.headerEvidence)}`);
    }
    if (diagnostics.explicitDocumentTotalEvidence) {
      const total = diagnostics.explicitDocumentTotalEvidence;

      lines.push(
        `Raw explicit total token: ${total.raw ?? "none"}.`
      );
      lines.push(
        `Normalized explicit total: ${total.normalized ?? (typeof total.amount === "number" ? formatMoney(total.amount) : "none")}.`
      );
      lines.push(
        `Normalization reason: ${total.normalizationReason ?? "none"}.`
      );
      lines.push(`Total source: ${total.source ?? "none"}.`);
    }

    if (diagnostics.candidateSummaries?.length) {
      lines.push(
        `Best candidates: ${diagnostics.candidateSummaries
          .slice(0, 3)
          .map(
            (candidate) =>
              `${candidate.region ?? "unknown"} ${candidate.variant ?? ""}/${candidate.pageMode ?? "psm?"} r${candidate.rotation ?? 0} rows=${candidate.validRows ?? 0} conf=${Math.round(candidate.confidence ?? 0)} score=${Math.round(candidate.score ?? 0)}`
          )
          .join("; ")}.`
      );

      diagnostics.candidateSummaries.slice(0, 5).forEach((candidate, index) => {
        const tokens = candidate.tokens;

        lines.push(
          `OCR pass ${index + 1}: ${candidate.region ?? "unknown"} ${candidate.variant ?? "unknown"}/${candidate.pageMode ?? "psm?"} r${candidate.rotation ?? 0}, ${candidate.imageWidth ?? "?"}x${candidate.imageHeight ?? "?"}, ${Math.round(candidate.durationMs ?? 0)}ms, conf=${Math.round(candidate.confidence ?? 0)}, rows=${candidate.validRows ?? 0}, score=${Math.round(candidate.score ?? 0)}, invoices=${tokens?.invoiceLike?.join(", ") || "none"}, dates=${tokens?.dates?.join(", ") || "none"}, units=${tokens?.units?.join(", ") || "none"}, amounts=${tokens?.amounts?.join(", ") || "none"}.`
        );
      });
    }

    if (diagnostics.textRegionMetrics) {
      const metrics = diagnostics.textRegionMetrics;
      const textWidth = metrics.textRegionBounds
        ? Math.max(
            0,
            (metrics.textRegionBounds.x1 ?? 0) - (metrics.textRegionBounds.x0 ?? 0)
          )
        : 0;
      const textHeight = metrics.textRegionBounds
        ? Math.max(
            0,
            (metrics.textRegionBounds.y1 ?? 0) - (metrics.textRegionBounds.y0 ?? 0)
          )
        : 0;
      const textWidthPercent =
        diagnostics.documentWidth && diagnostics.documentWidth > 0
          ? (textWidth / diagnostics.documentWidth) * 100
          : 0;
      const textHeightPercent =
        diagnostics.documentHeight && diagnostics.documentHeight > 0
          ? (textHeight / diagnostics.documentHeight) * 100
          : 0;
      const bounds = metrics.textRegionBounds
        ? `${Math.round(metrics.textRegionBounds.x0 ?? 0)},${Math.round(metrics.textRegionBounds.y0 ?? 0)}-${Math.round(metrics.textRegionBounds.x1 ?? 0)},${Math.round(metrics.textRegionBounds.y1 ?? 0)}`
        : "none";

      lines.push(
        `Text-region quality: words=${metrics.wordCount ?? 0}, high-conf=${metrics.highConfidenceWordCount ?? 0}, median word height=${metrics.medianWordHeight ?? 0}px, avg conf=${metrics.averageWordConfidence ?? 0}, bounds=${bounds}, area=${(((metrics.textRegionAreaRatio ?? 0) * 100)).toFixed(1)}%, document height=${metrics.sourcePixelsPerDocumentHeight ?? "unknown"}px.`
      );
      lines.push(
        `Text-region scale: width=${Math.round(textWidth)}px (${textWidthPercent.toFixed(1)}%), height=${Math.round(textHeight)}px (${textHeightPercent.toFixed(1)}%).`
      );
    }

    if (diagnostics.geometryTokenSummaries) {
      const tokenSummary = diagnostics.geometryTokenSummaries;

      lines.push(
        `Geometry tokens: invoices=${tokenSummary.invoiceLike?.join(", ") || "none"}; units=${tokenSummary.unitLike?.join(", ") || "none"}; dates=${tokenSummary.dates?.join(", ") || "none"}; amounts=${tokenSummary.amounts?.join(", ") || "none"}.`
      );
    }

    if (diagnostics.geometricRows?.length) {
      lines.push(
        `Geometric row bands: ${diagnostics.geometricRows
          .slice(0, 8)
          .map(
            (row) =>
              `y=${Math.round(row.y ?? 0)} score=${Math.round(row.score ?? 0)} ${row.text ?? ""}`
          )
          .join(" | ")}.`
      );
    }

    if (diagnostics.rowAssignments?.length) {
      lines.push("Physical row assignments: " + JSON.stringify(diagnostics.rowAssignments));
    }
    if (diagnostics.structuredRowDiagnostics?.length) {
      diagnostics.structuredRowDiagnostics.slice(0, 8).forEach((row, index) => {
        const invoiceEvidence =
          row.invoiceEvidenceByPass
            ?.map((token) => {
              const bbox = token.bbox
                ? `@${Math.round(token.bbox.x0 ?? 0)},${Math.round(token.bbox.y0 ?? 0)}-${Math.round(token.bbox.x1 ?? 0)},${Math.round(token.bbox.y1 ?? 0)}`
                : "";

              return `${token.raw ?? ""}->${token.normalized?.join("/") || "none"}:${token.variant ?? "?"}/${token.pageMode ?? "?"}:conf=${Math.round(token.confidence ?? 0)}${bbox}`;
            })
            .join(" | ") || "none";

        lines.push(
          `Row ${index + 1} evidence: Row Y=${Math.round(row.y ?? 0)}, Invoice evidence by pass=${invoiceEvidence}, Chosen invoice evidence=${row.chosenInvoiceEvidence?.join(", ") || "none"}, Unit evidence=${row.unitEvidence?.join(", ") || "none"}, amount=${row.amountEvidence?.join(", ") || "none"}, Resolution reason=${row.resolutionHint ?? "none"}.`
        );
      });
    }

    if (diagnostics.geometricRowDetails?.length) {
      diagnostics.geometricRowDetails.slice(0, 8).forEach((row, index) => {
        const tokens =
          row.tokens
            ?.map((token) => {
              const bbox = token.bbox
                ? `@${Math.round(token.bbox.x0 ?? 0)},${Math.round(token.bbox.y0 ?? 0)}-${Math.round(token.bbox.x1 ?? 0)},${Math.round(token.bbox.y1 ?? 0)}`
                : "";

              return `${token.text ?? ""}:${token.field ?? "unclassified"}:${Math.round(token.confidence ?? 0)}${bbox}`;
            })
            .join(" ") || "none";

        lines.push(
          `Row ${index + 1}: y=${Math.round(row.y ?? 0)} ${row.accepted ? "accepted" : `rejected (${row.rejectionReason || "unknown"})`} amount=${typeof row.amount === "number" && row.amount > 0 ? formatMoney(row.amount) : "none"} invoices=${row.invoiceNumbers?.join(", ") || "none"} units=${row.unitCodes?.join(", ") || "none"} text="${row.reconstructedText || ""}" tokens=${tokens}.`
        );

        if (row.amountCandidates?.length) {
          const amountCandidates = row.amountCandidates
            .map((candidate) => {
              const bbox = candidate.bbox
                ? `@${Math.round(candidate.bbox.x0 ?? 0)},${Math.round(candidate.bbox.y0 ?? 0)}-${Math.round(candidate.bbox.x1 ?? 0)},${Math.round(candidate.bbox.y1 ?? 0)}`
                : "";
              const normalized =
                candidate.normalized ??
                (typeof candidate.value === "number" ? formatMoney(candidate.value) : "");

              return `${candidate.raw ?? ""}->${normalized}${candidate.selected ? ":selected" : ":rejected"}:score=${Math.round(candidate.score ?? 0)}:conf=${Math.round(candidate.confidence ?? 0)}${bbox}:${candidate.reason ?? ""}`;
            })
            .join(" | ");

          lines.push(`Row ${index + 1} amount candidates: ${amountCandidates}.`);
        }

        if (row.nearbyAmountTokens?.length) {
          const nearbyAmounts = row.nearbyAmountTokens
            .map((token) => {
              const bbox = token.bbox
                ? `@${Math.round(token.bbox.x0 ?? 0)},${Math.round(token.bbox.y0 ?? 0)}-${Math.round(token.bbox.x1 ?? 0)},${Math.round(token.bbox.y1 ?? 0)}`
                : "";

              return `${token.text ?? ""}:${Math.round(token.confidence ?? 0)}:${token.variant ?? "?"}/${token.pageMode ?? "?"}${bbox}`;
            })
            .join(" ");

          lines.push(`Row ${index + 1} nearby amount tokens: ${nearbyAmounts}.`);
        }
      });
    }

    if (diagnostics.invoiceColumnDiagnostics) {
      const column = diagnostics.invoiceColumnDiagnostics;
      const bounds = column.bounds
        ? `${Math.round(column.bounds.left ?? 0)},${Math.round(column.bounds.top ?? 0)} ${Math.round(column.bounds.width ?? 0)}x${Math.round(column.bounds.height ?? 0)}`
        : "unknown";

      lines.push(
        `Invoice column diagnostics: bounds=${bounds}, crop=${Math.round(column.width ?? 0)}x${Math.round(column.height ?? 0)}, charHeight=${column.estimatedCharacterHeight ?? 0}px, sharpness=${column.sharpness ?? 0}, contrast=${column.contrast ?? 0}.`
      );
      column.rowBands?.slice(0, 5).forEach((row) => {
        const tokens =
          row.tokens
            ?.map((token) => {
              const bbox = token.bbox
                ? `@${Math.round(token.bbox.x0 ?? 0)},${Math.round(token.bbox.y0 ?? 0)}-${Math.round(token.bbox.x1 ?? 0)},${Math.round(token.bbox.y1 ?? 0)}`
                : "";

              return `${token.text ?? ""}:${Math.round(token.confidence ?? 0)}:${token.variant ?? "?"}/${token.pageMode ?? "?"}${bbox}`;
            })
            .join(" ") || "none";

        lines.push(
          `Invoice column row ${row.row ?? "?"}: y=${Math.round(row.y ?? 0)} text="${row.sourceText ?? ""}" tokens=${tokens}.`
        );
      });
      column.attempts?.slice(0, 3).forEach((attempt, index) => {
        const words =
          attempt.words
            ?.slice(0, 12)
            .map((word) => {
              const bbox = word.bbox
                ? `@${Math.round(word.bbox.x0 ?? 0)},${Math.round(word.bbox.y0 ?? 0)}-${Math.round(word.bbox.x1 ?? 0)},${Math.round(word.bbox.y1 ?? 0)}`
                : "";

              return `${word.text ?? ""}:${Math.round(word.confidence ?? 0)}${bbox}`;
            })
            .join(" ") || "none";
        const normalizedTokens =
          attempt.normalizedInvoiceTokens
            ?.map(
              (token) =>
                `${token.raw ?? ""}->${token.normalized ?? "none"}:${token.parsed ? "parsed" : "not-parsed"}`
            )
            .join(", ") || "none";

        lines.push(
          `Invoice column OCR ${index + 1}: ${attempt.variant ?? "unknown"}/${attempt.pageMode ?? "psm?"}, scale=${attempt.scaling ?? "unknown"}, ${Math.round(attempt.durationMs ?? 0)}ms, conf=${Math.round(attempt.confidence ?? 0)}, invoiceTokens=${attempt.invoiceLikeTokens?.join(", ") || "none"}, parsedInvoices=${attempt.parseableInvoiceNumbers?.join(", ") || "none"}, normalizedTokens=${normalizedTokens}, raw="${attempt.rawText ?? ""}", words=${words}.`
        );
      });

      if (column.skippedReason) {
        lines.push(`Invoice column diagnostic note: ${column.skippedReason}`);
      }
    }

    return lines;
  }

  function remittanceReviewDiagnosticLines(
    reviewMatches: ReviewMatchedInvoice[],
    reconciledReview: { matches: ReviewMatchedInvoice[]; notice: string; invoiceTotal: number; isComplete: boolean },
    match: ReturnType<typeof findRemittanceMatches>
  ) {
    const matchedTotal = sumMoney(reviewMatches.map(invoice => invoice.remittanceAmount ?? invoice.amountDue));

    const lines = [
      `Explicit document total: ${match.totalAmount > 0 ? formatMoney(match.totalAmount) : "not found"}.`,
      `Confirmed OCR row subtotal: ${formatMoney(match.lineTotal)}.`,
      `Resolved invoice total: ${formatMoney(match.matchedTotal)}.`,
      `Matched invoices: ${
        reviewMatches.length > 0
          ? reviewMatches
              .map(
                (invoice) =>
                  `${invoice.displayId} (${formatMoney(invoice.remittanceAmount ?? invoice.amountDue)})`
              )
              .join(", ")
          : "none"
      }.`,
      `Matched total: ${formatMoney(matchedTotal)}.`,
      `Reconciliation: ${
        reconciledReview.isComplete
          ? "complete"
          : reconciledReview.notice || "not complete"
      }.`,
    ];

    if (match.matchTrace?.length) {
      match.matchTrace.forEach((trace) => {
        lines.push(
          `Invoice trace ${trace.normalizedInvoiceIdentifier}: raw=${trace.ocrInvoiceIdentifier} candidates=${trace.candidateInvoiceNumbers?.join(", ") || "none"} unitTokens=${trace.unitCandidates?.join(", ") || "none"} unit=${trace.unitEvidence || "none"} amountEvidence=${trace.amountEvidence || "none"} totalProof=${trace.documentTotalReconciliationRequired ? "required" : "unavailable"} normalization=${trace.normalizationOperations?.join("; ") || "standard"} rowAmount=${formatMoney(trace.ocrRowAmount)} lookup=${trace.lookupKey} found=${trace.found ? "yes" : "no"} status=${trace.status ?? "unknown"} due=${formatMoney(trace.amountDue)} role=${trace.invoiceRole} eligible=${trace.eligible ? "yes" : "no"} accepted=${trace.accepted ? "yes" : "no"} matched=${formatMoney(trace.matchedAmount)} resolution=${trace.resolutionReason || "none"} reason=${trace.rejectionReason || "accepted"} row="${trace.ocrRow}".`
        );
      });
    }

    return lines;
  }

  function ocrFailureMessage(data: CheckStubOcrResponse, attempt?: RemittanceAttempt) {
    const resolvedRows = attempt?.resolverResult.resolvedMatches.length ?? 0;
    if (resolvedRows > 0 && attempt?.reconciliationResult.blockers.length) {
      return `${resolvedRows} invoice${resolvedRows === 1 ? "" : "s"} identified. ${attempt.reconciliationResult.blockers.join(" ")}`;
    }
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
      return "Check details were found, but the amount and remittance rows were not. Retake with all invoice rows visible or enter the missing amount/invoices manually.";
    }

    if (!hasTotal && confirmedInvoiceCount > 0) {
      return "Invoice rows were found, but the document total was not confirmed. Enter the check amount and verify the selected invoices.";
    }

    if (hasTotal && confirmedInvoiceCount === 0) {
      if (hasInvoiceFragments) {
        return "Some text was detected, but invoice rows could not be confirmed. Invoice numbers or amounts are missing.";
      }

      return "Check amount was found, but remittance invoice rows were not. Retake with all invoice rows visible or select the missing invoices manually.";
    }

    if (hasInvoiceFragments && confirmedInvoiceCount === 0) {
      return "Some text was detected, but invoice rows could not be confirmed. Invoice numbers or amounts are missing.";
    }

    return data.error ?? "Could not read this remittance. Retake or enter manually.";
  }

  function buildOcrDiagnosticReport() {
    const uniqueReviewMatchedInvoices = uniqueReviewMatchesById(
      reviewMatchedInvoices
    );
    const matchedTotal = sumMoney(uniqueReviewMatchedInvoices.matches.map(invoice => invoice.remittanceAmount ?? invoice.amountDue));
    const uniqueResolvedInvoiceIds = uniqueReviewMatchedInvoices.matches.map(
      (invoice) => invoice.id
    );
    const duplicateSelectedInvoiceIds = selectedIds.filter(
      (invoiceId, index) => selectedIds.indexOf(invoiceId) !== index
    );
    const selectedInvoiceSummary =
      selectedInvoices.length > 0
        ? selectedInvoices
            .map((invoice) => `${invoice.displayId} ${formatMoney(invoice.amountDue)}`)
            .join("\n")
        : "none";
    const reviewInvoiceSummary =
      reviewMatchedInvoices.length > 0
        ? reviewMatchedInvoices
            .map(
              (invoice) =>
                `${invoice.displayId} ${invoice.projectTitle} ${formatMoney(invoice.remittanceAmount ?? invoice.amountDue)}`
            )
            .join("\n")
        : "none";

    return [
      "TRIMAX OCR DIAGNOSTICS",
      "",
      "Build / Runtime",
      `generatedAt: ${new Date().toISOString()}`,
      `sourceType: ${lastOcrSourceType}`,
      `documentType: ${captureDocumentType}`,
      `captureIntent: ${captureIntent}`,
      `ocrStatus: ${checkOcrStatus}`,
      "",
      "Input Source",
      ...lastOcrPrepDiagnosticLines.filter((line) =>
        /^(Source type|Source image|Crop box|Crop dimensions|Quality gate|Retry strategy|Normalized OCR image|Saved preview|OCR upload)/i.test(
          line
        )
      ),
      "",
      "Crop / Normalization",
      ...lastOcrPrepDiagnosticLines.filter((line) =>
        /^(Crop box|Crop dimensions|Normalized OCR image|Saved preview|OCR upload)/i.test(
          line
        )
      ),
      "",
      "Quality Metrics",
      ...lastOcrDiagnosticLines.filter((line) =>
        /^(Quality gate|Text-region quality|Text-region scale|Invoice column diagnostics)/i.test(
          line
        )
      ),
      "",
      "OCR Summary",
      ...lastOcrDiagnosticLines.filter((line) =>
        /^(OCR request|OCR started|OCR completed|OCR route duration|Last OCR stage|Selected text summary|Best candidates|Parsed fields|Parsed invoice numbers|Parsed line amounts)/i.test(
          line
        )
      ),
      "",
      "OCR Passes",
      ...lastOcrDiagnosticLines.filter((line) => /^OCR pass /i.test(line)),
      "",
      "Text Region Metrics",
      ...lastOcrDiagnosticLines.filter((line) =>
        /^Text-region quality|^Text-region scale/i.test(line)
      ),
      "",
      "Geometric Row Bands",
      ...lastOcrDiagnosticLines.filter((line) => /^Geometric row bands/i.test(line)),
      "",
      "Per-Row Diagnostics",
      ...lastOcrDiagnosticLines.filter((line) =>
        /^Row \d+|^Geometry tokens/i.test(line)
      ),
      "",
      "Invoice Column Diagnostics",
      ...lastOcrDiagnosticLines.filter((line) =>
        /^Invoice column/i.test(line)
      ),
      "",
      "Parsed Fields",
      `checkDate: ${checkDate || "blank"}`,
      `receivedDate: ${receivedDate || "blank"}`,
      `visibleCheckAmount: ${visibleCheckAmount || "blank"}`,
      `extractedPaymentAmount: ${
        extractedPaymentAmount !== null ? formatMoney(extractedPaymentAmount) : "none"
      }`,
      `checkNumber: ${paymentReference || capturedCheckReference || "blank"}`,
      `payor: ${checkPayor || "blank"}`,
      "",
      "Invoice Matching",
      `selectedInvoices:\n${selectedInvoiceSummary}`,
      `reviewMatchedInvoices:\n${reviewInvoiceSummary}`,
      `Unique resolved invoice IDs: ${
        uniqueResolvedInvoiceIds.length > 0 ? uniqueResolvedInvoiceIds.join(", ") : "none"
      }`,
      `Duplicate resolved invoice IDs removed: ${
        uniqueReviewMatchedInvoices.duplicateIds.length > 0 ||
        duplicateSelectedInvoiceIds.length > 0
          ? Array.from(
              new Set([
                ...uniqueReviewMatchedInvoices.duplicateIds,
                ...duplicateSelectedInvoiceIds,
              ])
            ).join(", ")
          : "none"
      }`,
      `Unique resolved invoice count: ${uniqueResolvedInvoiceIds.length}`,
      `Selected invoice count: ${selectedInvoices.length}`,
      `Review matched invoice count: ${uniqueReviewMatchedInvoices.matches.length}`,
      "",
      "Reconciliation",
      `matchedTotal: ${formatMoney(matchedTotal)}`,
      `Explicit document total: ${
        extractedPaymentAmount !== null ? formatMoney(extractedPaymentAmount) : "none"
      }`,
      `Unique matched invoice total: ${formatMoney(matchedTotal)}`,
      `selectedTotal: ${formatMoney(selectedTotal)}`,
      `enteredCheckAmount: ${
        enteredCheckAmount === null ? "none" : formatMoney(enteredCheckAmount)
      }`,
      `checkDifference: ${formatMoney(checkDifference)}`,
      `paymentCanApply: ${paymentCanApply ? "yes" : "no"}`,
      `paymentReviewNotice: ${paymentReviewNotice || "none"}`,
      "",
      "Payment Review Handoff",
      `paymentEntryMode: ${paymentEntryMode}`,
      `checkOcrMessage: ${checkOcrMessage}`,
      "",
      "All Diagnostic Lines",
      ...(lastOcrDiagnosticLines.length > 0 ? lastOcrDiagnosticLines : ["none"]),
      "",
      "Raw OCR Text",
      lastOcrRawText || "none",
    ].join("\n");
  }

  async function copyTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const copied = document.execCommand("copy");

      if (!copied) {
        throw new Error("Clipboard copy was blocked.");
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function retainedOcrReport() {
    const summary=latestScan.current;
    if(!summary || !businessId)return buildOcrDiagnosticReport();
    if(summary.result==='success')return failureSummary(summary);
    try{return debugFile(summary,await scanDiagnostics(businessId,summary.attemptId)).text;}catch{return buildOcrDiagnosticReport();}
  }

  async function copyOcrDiagnostics() {
    try {
      await copyTextToClipboard(await retainedOcrReport());
      setToast({ type: "success", message: "Diagnostics copied" });
    } catch {
      setToast({
        type: "error",
        message: "Could not copy diagnostics. Leave this panel open and try again.",
      });
    }
  }

  function canShareOcrDiagnostics() {
    return (
      typeof navigator !== "undefined" &&
      typeof (navigator as Navigator & { share?: unknown }).share === "function"
    );
  }

  async function shareOcrDiagnostics() {
    if (!canShareOcrDiagnostics()) {
      return;
    }

    try {
      await (navigator as Navigator & {
        share: (data: ShareData) => Promise<void>;
      }).share({
        title: "Trimax OCR Diagnostics",
        text: await retainedOcrReport(),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setToast({
        type: "error",
        message: "Could not share diagnostics. Use Copy Diagnostics instead.",
      });
    }
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

  async function runDuplicateRemittancePreflight(
    preparedFile: File,
    prepDiagnosticLines: string[],
    evidence: DuplicatePreflightEvidence,
    isCurrent: () => boolean = () => true
  ): Promise<DuplicatePreflightOutcome> {
    if (!businessId) {
      return { stoppedOcr: false, fingerprint: "" };
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!isCurrent()) return { stoppedOcr: true, fingerprint: "" };
      const formData = new FormData();

      formData.append("businessId", businessId);
      formData.append("remittanceImage", preparedFile, preparedFile.name);
      formData.append("checkNumber", evidence.checkNumber);
      formData.append("amount", String(evidence.amount ?? ""));
      formData.append("checkDate", evidence.checkDate);
      formData.append("receivedDate", evidence.receivedDate);
      formData.append("payor", evidence.payor);
      formData.append("invoiceIds", evidence.invoiceIds.join(","));
      formData.append("invoiceNumbers", evidence.invoiceNumbers.join(","));

      const response = await fetch("/api/payments/duplicate-remittance-preflight", {
        method: "POST",
        headers: {
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: formData,
      });
      const result =
        (await response.json().catch(() => ({}))) as DuplicateRemittancePreflightResponse;
      if (!isCurrent()) return { stoppedOcr: true, fingerprint: "" };
      const currentFingerprint = result.documentFingerprint?.hash ?? "";

      if (currentFingerprint) {
        setRemittanceDocumentFingerprint(currentFingerprint);
      }

      const duplicate = result.duplicateRemittance;
      const diagnosticLines = [
        ...prepDiagnosticLines,
        `Duplicate preflight invoice IDs: ${evidence.invoiceIds.length > 0 ? evidence.invoiceIds.join(",") : "none"}.`,
        `Duplicate preflight invoice numbers: ${evidence.invoiceNumbers.length > 0 ? evidence.invoiceNumbers.join(",") : "none"}.`,
        `Duplicate preflight total: ${evidence.amount ?? "none"}.`,
        `Duplicate preflight check number: ${evidence.checkNumber || "none"}.`,
        `Duplicate remittance preflight: ${response.ok ? "completed" : "skipped"} (${response.status}).`,
        `Duplicate preflight prior images compared: ${result.priorImagesCompared ?? 0}.`,
        `Duplicate preflight status: ${duplicate?.status ?? "none"}.`,
        "Duplicate preflight decision: continue OCR; image similarity is not document identity.",
        `Duplicate image hints: ${JSON.stringify(result.imageHints ?? [])}.`,
        `Duplicate preflight returned payment ID: ${duplicate?.payment?.id ?? "none"}.`,
        `Duplicate preflight returned invoice IDs: ${duplicate?.payment?.invoiceIds?.join(",") || "none"}.`,
        ...(duplicate?.reasons?.length
          ? [`Duplicate preflight evidence: ${duplicate.reasons.join(", ")}.`]
          : []),
      ];

      setLastOcrPrepDiagnosticLines(diagnosticLines);
      setLastOcrDiagnosticLines(diagnosticLines);

      // Pre-OCR image candidates are hints only. Identity is checked after extraction
      // and again by apply-batch before any financial mutation.
      return { stoppedOcr: false, fingerprint: currentFingerprint };
    } catch (error) {
      if (!isCurrent()) return { stoppedOcr: true, fingerprint: "" };
      setLastOcrPrepDiagnosticLines([
        ...prepDiagnosticLines,
        `Duplicate remittance preflight: skipped (${error instanceof Error ? error.message : "unknown error"}).`,
      ]);

      return { stoppedOcr: false, fingerprint: "" };
    }
  }

  function beginCapture(implementation: CaptureImplementation, reason: string) {
    const now=Date.now();
    captureUi.current={selection:selectCapture(implementation,{
      nativeStillConfigured:shadowFlags.nativeStill,shadowConfigured:shadowFlags.enabled,
      flagsLoaded:shadowFlags.businessId===businessId,roleLoaded:Boolean(workspaceRole),workspaceLoaded:Boolean(businessId),
      shadowEligible:shadowFlags.businessId===businessId && shadowAllowed(shadowFlags,workspaceRole),flagReadError:shadowFlags.readError??null,
    },reason,now),clientBuild:process.env.NEXT_PUBLIC_TRIMAX_BUILD??'local',fallbackOccurred:false,fallbackReason:null,
      acquisitionMechanism:implementation==='native-still'?'file-input-capture-environment':implementation==='existing-photo'?'file-input-existing':'custom-camera',
      takePhotoTappedAt:implementation==='native-still'?now:null,nativeCameraInvokedAt:null,imageReturnedAt:null,cameraUiEndedAt:null,
      previewPaintOpportunityAt:null,previewImageLoadedAt:null,previewError:null,canonicalUploadStartedAt:null,canonicalUploadAcknowledgedAt:null,legacyJobQueuedAt:null,shadowJobQueuedAt:null};
  }

  const extractCheckStubFromPhoto = useRemittanceEvent(async function extractCheckStubFromPhotoEvent(
    imageDataUrl: string,
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = captureIntent,
    retryStrategy: OcrRetryStrategy = "standard",
    prepDiagnosticLines: string[] = lastOcrPrepDiagnosticLines,
    currentDocumentFingerprint: string = remittanceDocumentFingerprint,
    retainedReference?: string,
    resume?: {history:ScanSummary;canonical:CanonicalCapture|null}
  ): Promise<void> {
    if (checkOcrStatus !== "reading" || !processingDeadlineAt.current) beginProcessingWindow();
    const attemptVersion = ++ocrAttemptVersion.current;
    setSharedMoneyStatus("");setSharedMoneyLoading(false);
    const attemptId = resume?.history.attemptId ?? crypto.randomUUID();
    setCaptureRetry(null);
    const startedAt = performance.now();
    const parent = scanLineage.current;
    if (parent) observationScopeRef.current=crypto.randomUUID();
    // Reserve a fresh namespace immediately for the next attempt, including uploads.
    observationScopeRef.current=crypto.randomUUID();
    const history = resume?.history ?? scanSummary(attemptId,parent?.original??attemptId,parent?.last??null,preparedCaptureRef.current?.source??"unknown",process.env.NEXT_PUBLIC_TRIMAX_BUILD??"local");
    history.inputSource=lastOcrSourceType;
    if (!history.captureUi && captureUi.current) history.captureUi=structuredClone(captureUi.current);
    scanLineage.current = {original:history.originalId,last:attemptId};
    latestScan.current = history;
    const captureSnapshot = preparedCaptureRef.current ? immutableSnapshot(preparedCaptureRef.current) : null;
    const shadowEnabledForAttempt = shadowFlags.businessId === businessId && shadowAllowed(shadowFlags, workspaceRole);
    const shadowCaptureTimings = {...captureTimings.current};
    const shadowSnapshot = shadowEnabledForAttempt && intent !== "check_details" && documentType !== "check_only" ? {label:'Read-only workspace snapshot before legacy resolution',provenance:['Same-capture pre-review invoice/activity state'],invoices:structuredClone(invoiceRecords),activities:structuredClone(paymentActivities),receivedDate} : null;
    let canonical: CanonicalCapture | null = resume?.canonical ?? null;
    let failure: TransportFailure | null = null;
    let retainedResponse: unknown = null;
    let completed = false;
    const persist = (summary:ScanSummary,payload:unknown,phase:0|2) => {
      if (!businessId) { setScanSavedStatus("Attempt not saved: workspace unavailable."); return; }
      return saveScan({businessId,summary,payload:payload && typeof payload==='object' ? {...payload,captureUi:summary.captureUi} : payload,phase}).then(status=>{
        if (latestScan.current?.attemptId !== attemptId || (phase===0 && latestScan.current.result!=="processing")) return true;
        setScanSavedStatus(status==='saved' ? (phase===2 ? "Attempt saved ✓"+(summary.result==='success'?"":" · Diagnostics retained for 30 days") : "Scan started · saving evidence") : "Saved on this device · waiting to sync");
        return status === "saved";
      }).catch(()=>{if(latestScan.current?.attemptId===attemptId)setScanSavedStatus("Attempt could not be saved. Keep this page open and use Copy Full Diagnostics.");return false;});
    };
    const complete = (result:ScanResult,attempt:RemittanceAttempt|null,reasons:string[]=[]) => {
      if(completed)return;completed=true;
      let summary: ScanSummary;
      try { summary=finishScan(history,attempt,result,performance.now()-startedAt,reasons); }
      catch(error) { summary={...history,result:'failed',paymentCanApply:false,durationMs:performance.now()-startedAt,reasons:[...reasons,'Terminal summary failed: '+String(error)]}; }
      summary.captureState=result==='failed'?'failed':'review';
      if(failure)Object.assign(summary,{failureStage:failure.stage,errorClass:failure.errorClass,httpStatus:failure.httpStatus});
      if(canonical)Object.assign(summary,{sourceImageHash:canonical.sha256,canonicalReference:canonical.reference});
      if(attemptVersion===ocrAttemptVersion.current)latestScan.current=summary;
      if(retainedResponse && typeof retainedResponse==='object')delete (retainedResponse as CheckStubOcrResponse).optical;
      // Terminal evidence is small and independent of optional multi-megabyte optical artifacts.
      const saved = persist(summary,{response:retainedResponse,attempt,capture:captureSnapshot,preparation:prepDiagnosticLines,canonicalCapture:canonical,transport:failure,shadowHandoff:canonical?.shadowQueued??false,finishedAt:new Date().toISOString(),finalResult:result,reasons},2);
      void saved?.then(durable=>{ if(durable && attemptVersion===ocrAttemptVersion.current){latestScan.current=summary;setLastOcrDiagnosticLines([failureSummary(summary)]);setLastOcrRawText("");if(attempt)setActiveRemittanceAttempt(slimAttempt(attempt));} });
    };
    history.captureState=canonical?'image_stored':'capture_local';
    const initialSave = canonical ? Promise.resolve(true) : persist(history,{preparation:prepDiagnosticLines,capture:preparedCaptureRef.current},0);
    if (imageDataUrl.length > 19_500_000) {
      setCheckOcrStatus("manual");
      setCheckOcrMessage(
        "That photo is too large. Choose a smaller photo or enter the payment manually."
      );
      complete("failed",null,["Image exceeds OCR request size limit."]);
      return;
    }

    const databaseSnapshot = { invoices: structuredClone(invoiceRecords), activities: structuredClone(paymentActivities), role: workspaceRole ?? "", receivedDate };
    const recordAttemptFailure = (reason: string) => {
      try {
        const failedAttempt=resolveRemittanceAttempt(emptyRemittanceEvidence(attemptId,captureSnapshot?structuredClone(captureSnapshot) as ScanCapture:null,reason),databaseSnapshot.invoices,databaseSnapshot.activities,{role:databaseSnapshot.role,receivedDate:databaseSnapshot.receivedDate,fingerprint:currentDocumentFingerprint});
        setActiveRemittanceAttempt(failedAttempt);
        if(!reason.startsWith('OCR request pending'))complete('failed',failedAttempt,[reason]);
      } catch(error) {
        if(!reason.startsWith('OCR request pending'))complete('failed',null,[reason,'Failure diagnostics could not be resolved: '+String(error)]);
      }
    };
    recordAttemptFailure("OCR request pending; no values are authoritative.");
    setDuplicateRemittanceModal(null);
    setDuplicateOverrideClearedKey("");
    setReversedDuplicateReviewedKey("");

    if (intent !== "check_details" && documentType !== "check_only") {
      setOcrReconciliationVerified(false);
      setSelectedIds([]);
      setReviewMatchedInvoices([]);
      setRemittanceStubText("");
      setExtractedPaymentAmount(null);
      setCheckAmount("");
      setCapturedCheckAmount("");
      setPaymentReference("");
      setCapturedCheckReference("");
      setCheckPayor("");
      setCheckDate("");
      setPaymentReviewNotice("");
    }
    setCheckOcrStatus("reading");
    setCheckOcrMessage("Preparing image");
    setLastOcrDiagnosticLines([]);
    setLastOcrRawText("");
    appendCameraStage("Upload started");

    const requestStartedAt = performance.now();

    try {
      if(!await remittanceDeadline(Promise.resolve(initialSave), 15_000, "Could not save the scan. Retry.")){failure=transportFailure(null,'Attempt identity could not be saved','capture-registration');throw Error(failure.message);}
      if (attemptVersion !== ocrAttemptVersion.current) return;
      try {
        if(!canonical && history.captureUi)history.captureUi.canonicalUploadStartedAt=Date.now();
        canonical=canonical ?? await remittanceDeadline(storeCanonicalCapture({attemptId,imageDataUrl,metadata:{...captureSnapshot?.image,originalPreparation:prepDiagnosticLines,rotation:0,retainedReference},snapshot:shadowSnapshot,captureTimings:shadowCaptureTimings}), 30_000, "Photo upload timed out. Retry.");
      } catch(error) {
        failure=transportFailure(null,error instanceof Error?error.message:String(error),'canonical-upload');
        throw error;
      }
      if (attemptVersion !== ocrAttemptVersion.current) return;
      if(history.captureUi)history.captureUi.canonicalUploadAcknowledgedAt ??= Date.now();
      history.captureState='processing';
      setCheckOcrMessage('Reading remittance');
      // Detached, independent commit. Shadow downtime must never delay or fail legacy OCR.
      if(shadowSnapshot) void resumeCaptureHandoff(attemptId,shadowSnapshot,shadowCaptureTimings).then(result=>{
        if(canonical)canonical.shadowQueued=result.queued;
        if(result.queued && history.captureUi){history.captureUi.shadowJobQueuedAt=Date.now(); if(latestScan.current?.attemptId===attemptId && latestScan.current.result==='processing')void persist(history,{stage:'shadow-queued'},0); }
      }).catch(()=>{ if(attemptVersion===ocrAttemptVersion.current)setScanSavedStatus('Capture saved — shadow processing pending. Retry from Recent Scans.'); });
      appendCameraStage("OCR started");
      const response = await waitForLegacyJob({attemptId,documentType,retryStrategy,diagnosticReplay:resumedDiagnosticReplay.current},()=>attemptVersion===ocrAttemptVersion.current,message=>{if(attemptVersion===ocrAttemptVersion.current)setCheckOcrMessage(message);},()=>{if(history.captureUi)history.captureUi.legacyJobQueuedAt=Date.now();void persist(history,{stage:'legacy-queued'},0);});
      const data = (await response.json().catch(() => ({}))) as CheckStubOcrResponse;
      retainedResponse=data;
      if (attemptVersion !== ocrAttemptVersion.current) return;
      const requestDuration = Math.max(
        0,
        Math.round(performance.now() - requestStartedAt)
      );

      const diagnosticLines = [
        ...prepDiagnosticLines,
        `Attempt ID: ${attemptId}.`,
        `OCR request prepared: yes.`,
        `OCR request completed: ${response.ok ? "yes" : "no"} (${response.status}).`,
        `Initial enqueue request: ${response.headers?.get('x-ocr-enqueue-ms')??'unavailable'}ms.`,
        `Background OCR wait in this view: ${requestDuration}ms.`,
        `Background job timestamps: ${response.headers?.get('x-ocr-job-timings')??'unavailable'}.`,
        ...ocrDiagnosticLines(data),
      ];

      setLastOcrDiagnosticLines(diagnosticLines);
      setLastOcrRawText(data.rawText?.trim() || data.stubText?.trim() || "");

      if (!response.ok) {
        failure=transportFailure(response.status,data.error??`OCR HTTP ${response.status}`,data.stage??'ocr-request',data.ocrStarted===true);
        recordAttemptFailure(data.error ?? `OCR HTTP ${response.status}`);
        setCheckOcrStatus(response.status === 503 ? "manual" : "error");
        setCheckOcrMessage(
          data.error ??
            "Trimax could not read that remittance. Enter the payment manually."
        );
        return;
      }

      if (!data.stubText?.trim()) {
        failure={stage:"ocr-recognition",errorClass:"OCRNoStructure",httpStatus:response.status,ocrStarted:true,message:"No readable structured OCR response."};
        recordAttemptFailure("No readable structured OCR response.");
        if (data.rawText?.trim()) {
          setRemittanceStubText(data.rawText.trim());
        }
        setCheckOcrStatus("manual");
        setCheckOcrMessage(ocrFailureMessage(data));
        return;
      }

      appendCameraStage("OCR completed");
      if (intent === "check_details" || documentType === "check_only") {
        loadCheckDetailsFromExtraction(data);
        setLastOcrDiagnosticLines([
          ...diagnosticLines,
          "Payment Review handoff: check details only.",
        ]);
        appendCameraStage("Parsing completed");
        setCheckOcrStatus("manual");
        setPaymentEntryMode("photo");
        setCheckOcrMessage(
          "Check details added. Review the payment before applying."
        );
        complete("review",null,["Check details added. Review the payment before applying."]);
        return;
      }

      setCheckOcrMessage("Finding invoices");
      const { match, reviewMatches, reconciledReview, historicalDuplicateCheck, attempt } =
        loadExtractedRemittance(data, currentDocumentFingerprint, attemptId, captureSnapshot ? structuredClone(captureSnapshot) as ScanCapture : null, databaseSnapshot);
      setLastOcrDiagnosticLines([
        ...diagnosticLines,
        ...remittanceReviewDiagnosticLines(
          reviewMatches,
          reconciledReview,
          match
        ),
        "Attempt contract: " + JSON.stringify(attempt.diagnostics),
        "Payment Review handoff: remittance review state updated.",
      ]);
      complete(historicalDuplicateCheck.status === "active" ? "duplicate" : attempt.reconciliationResult.eligible ? "success" : "review",attempt);
      appendCameraStage("Parsing completed");
      if (historicalDuplicateCheck.status === "active") {
        appendCameraStage("Duplicate detected");
        return;
      }

      const hasConfidentReview = attempt.reconciliationResult.eligible;

      setCheckOcrStatus(hasConfidentReview ? "ready" : "manual");
      appendCameraStage("Matching completed");
      if (!hasConfidentReview) {
      }
      setCheckOcrMessage(
        hasConfidentReview
          ? "Remittance read. Review the payment before applying."
          : ocrFailureMessage(data, attempt)
      );
    } catch (error) {
      if (attemptVersion !== ocrAttemptVersion.current) return;
      failure??=transportFailure(null,error instanceof Error?error.message:'OCR request failed.');
      if(!canonical || failure.stage==='canonical-upload') {
        history.captureState='transport_failed';
        history.reasons=['Photo captured, upload interrupted — Retry'];
        void persist(history,{stage:'transport_failed',transport:failure,preparation:prepDiagnosticLines},0);
        setCheckOcrStatus('error');
        setCheckOcrMessage('Photo captured, upload interrupted — Retry. Keep this page open; your photo is still available.');
        setCaptureRetry({run:async()=>{
          if(captureRetryBusy.current || attemptVersion!==ocrAttemptVersion.current)return;
          captureRetryBusy.current=true;
          try { await extractCheckStubFromPhotoEvent(imageDataUrl,documentType,intent,retryStrategy,prepDiagnosticLines,currentDocumentFingerprint,retainedReference,{history,canonical}); }
          finally {captureRetryBusy.current=false;}
        }});
        return;
      }
      // Network failures do not terminate an independently running durable job.
      setCheckOcrStatus('error');
      setCheckOcrMessage(error instanceof Error && (('workerUnavailable' in error && error.workerUnavailable) || ('jobStatus' in error && error.jobStatus==='recoverable_stalled')) ? error.message : error instanceof Error && 'code' in error && error.code==='OCR_JOB_PENDING'
        ? 'Capture saved — processing is still pending. Open the saved scan to resume.'
        : 'Capture saved — processing status unavailable. Open the saved scan to resume.');
      setCaptureRetry({run:async()=>{await extractCheckStubFromPhotoEvent(imageDataUrl,documentType,intent,retryStrategy,prepDiagnosticLines,currentDocumentFingerprint,retainedReference,{history,canonical});}});
    }
  });

  function retainPreparationFailure(reason:string,preparation:string[],source:string,version:number) {
    if(!businessId)return;
    const id=crypto.randomUUID(),parent=scanLineage.current;
    const summary=finishScan(scanSummary(id,parent?.original??id,parent?.last??null,source,process.env.NEXT_PUBLIC_TRIMAX_BUILD??"local"),null,"failed",0,[reason]);
    if(version===ocrAttemptVersion.current && captureUi.current)summary.captureUi=structuredClone(captureUi.current);
    scanLineage.current={original:summary.originalId,last:id};latestScan.current=summary;
    void saveScan({businessId,phase:2,summary,payload:{optical:structuredClone(opticalRef.current),stage:"image-preparation",reason,preparation,sources:sourceSelectionRef.current}}).then(status=>{
      if(version===ocrAttemptVersion.current)setScanSavedStatus(status==='saved'?"Attempt saved ✓ · Diagnostics retained for 30 days":"Saved on this device · waiting to sync");
    }).catch(()=>{if(version===ocrAttemptVersion.current)setScanSavedStatus("Attempt could not be saved. Keep this page open.");});
  }

  const readPreparedRemittanceFromFile = useRemittanceEvent(async function prepareRemittance(
    file: File,
    documentType: RemittanceDocumentType = captureDocumentType, intent: CaptureIntent = captureIntent,
    retryStrategy: OcrRetryStrategy = "standard",
    sourceType: OcrSourceType = lastOcrSourceType, sourceDiagnosticLines: string[] = lastCameraCaptureDiagnosticLines
  ): Promise<void> {
    if (checkOcrStatus !== "reading" || !processingDeadlineAt.current) beginProcessingWindow();
    const version = ++ocrAttemptVersion.current;
    setCaptureRetry(null); setIsPreparingCrop(true); setCheckOcrStatus("reading");
    setCheckOcrMessage("Preparing image");
    setOcrReconciliationVerified(false);
    try {
      const normalized = await remittanceDeadline(normalizePhysicalStill(file), 20_000, "This photo could not be prepared. Choose a JPEG photo, retake, or enter manually.");
      const imageDataUrl = await remittanceDeadline(fileToDataUrl(normalized.file), 8_000, "Could not read this photo. Retry or enter manually.");
      if (version !== ocrAttemptVersion.current) return;
      const metadata = normalized.metadata;
      const lines = [...sourceDiagnosticLines,
        'Source type: '+sourceType+'.',
        'Source image: '+metadata.rawWidth+' x '+metadata.rawHeight+', '+file.size+' bytes.',
        metadata.transformation, 'Full image preserved; no document crop or competing camera source.',
        'Saved preview and OCR input match: '+metadata.width+' x '+metadata.height+'.'];
      preparedCaptureRef.current = {source:sourceType,image:{width:metadata.width,height:metadata.height,bytes:normalized.file.size,mime:normalized.file.type},quality:{},sources:[],selectionReason:'Full-frame guided capture or existing photo; EXIF normalized once'};
      setOcrImageFile(normalized.file); setCheckImageFile(normalized.file);
      setCheckImagePreview(imageDataUrl); setCheckImageName(file.name);
      setLastOcrPrepDiagnosticLines(lines);
      setPaymentEntryMode("photo");
      const duplicatePreflight = await remittanceDeadline(runDuplicateRemittancePreflight(normalized.file,lines,
        { checkNumber: "", amount: null, checkDate: "", receivedDate, payor: "", invoiceIds: [], invoiceNumbers: [] },
        () => version === ocrAttemptVersion.current),15_000,"Could not check this remittance. Retry or enter manually.");
      if (version !== ocrAttemptVersion.current || duplicatePreflight.stoppedOcr) return;
      setIsPreparingCrop(false);
      await extractCheckStubFromPhoto(imageDataUrl,documentType,intent,retryStrategy,lines,duplicatePreflight.fingerprint);
    } catch (error) {
      if (version !== ocrAttemptVersion.current) return;
      const message = error instanceof Error ? error.message : "Could not prepare this remittance. Retake or enter manually.";
      retainPreparationFailure(message,sourceDiagnosticLines,sourceType,version);
      setCheckOcrStatus("error"); setCheckOcrMessage(message);
    } finally { if (version === ocrAttemptVersion.current) setIsPreparingCrop(false); }
  });

  function clearCurrentRemittanceReviewState() {
    setRemittanceDocumentFingerprint("");
    setDuplicateRemittanceModal(null);
    setDuplicateOverrideClearedKey("");
    setReversedDuplicateReviewedKey("");
  }

  // A new source owns a fresh review. Clear synchronously before camera,
  // normalization, duplicate preflight or any old asynchronous completion.
  function clearNewRemittanceReviewState() {
    resumedDiagnosticReplay.current=false;
    setPaymentConfirmation(null);
    ocrAttemptVersion.current++;
    setActiveRemittanceAttempt(null);
    setOcrReconciliationVerified(false);
    clearCurrentRemittanceReviewState();
    scanLineage.current = null;
    latestScan.current = null;
    preparedCaptureRef.current = null;
    sourceSelectionRef.current = [];
    observationScopeRef.current = crypto.randomUUID();
    setCaptureRetry(null);
    setScanSavedStatus("");
    setRemittanceStubText("");
    setSelectedIds([]);
    setExtractedPaymentAmount(null);
    setReviewMatchedInvoices([]);
    setCapturedCheckAmount("");
    setCapturedCheckReference("");
    setCheckPayor("");
    setCheckAmount("");
    setPaymentReference("");
    setCheckDate("");
    setInternalNote("");
    setSharedMoneyStatus("");
    setSharedMoneyLoading(false);
    setPaymentReviewNotice("");
    setCompletedPaymentSummary(null);
    setCheckOcrStatus("idle");
    setLastOcrDiagnosticLines([]);
    setLastOcrPrepDiagnosticLines([]);
    setLastOcrRawText("");
    setLastOcrSourceType("unknown");
    setLastCameraCaptureDiagnosticLines([]);
  }

  function resetCheckCaptureState() {
    clearNewRemittanceReviewState();
    if (checkImagePreview) URL.revokeObjectURL(checkImagePreview);
    setCheckImagePreview("");
    setCheckImageFile(null);
    setCheckImageName("");
    setOcrImageFile(null);
    setIsPreparingCrop(false);
    setFiledPaymentImage(null);
    opticalRef.current = {images:[],notes:[]};
    setCaptureDocumentType("remittance_stub");
    setCaptureIntent("primary");
    setCheckOcrMessage(
      "Upload a remittance stub or enter the payment manually."
    );
    setPaymentEntryMode("choice");
  }

  const captureCheckImage = useRemittanceEvent(function captureCheckImageEvent(
    file: File | undefined,
    source: "camera" | "existing" = "existing",
    documentType: RemittanceDocumentType = captureDocumentType,
    intent: CaptureIntent = captureIntent,
    sourceDiagnosticLines: string[] = []
  ): void {
    if (!file) return;
    if (intent === "primary") clearNewRemittanceReviewState();
    beginProcessingWindow();
    const capturedFile = file;
    const implementation = source === 'existing' ? 'existing-photo' : captureUi.current?.selection.implementation ?? 'custom-camera';
    if (!captureUi.current || captureUi.current.selection.implementation !== implementation) beginCapture(implementation,'Image intake without an opening event');
    captureUi.current!.imageReturnedAt ??= Date.now();
    setPaymentEntryMode('photo');
    captureUi.current!.cameraUiEndedAt ??= Date.now();
    captureTimings.current = {...captureTimings.current,captureOpenedAt:source==='camera'?captureTimings.current.captureOpenedAt:null,stillReturnedAt:Date.now(),previewPaintOpportunityAt:null};
    if(source !== "camera")opticalRef.current={images:[],notes:[]};
    scanLineage.current = null;
    latestScan.current = null;
    setScanSavedStatus("");
    setCaptureRetry(null);
    const captureVersion = ++ocrAttemptVersion.current;
    setActiveRemittanceAttempt(null);
    setOcrReconciliationVerified(false);
    if (!file) {
      return;
    }

    if (checkImagePreview) {
      URL.revokeObjectURL(checkImagePreview);
    }

    const previewUrl=URL.createObjectURL(file);
    setCheckImagePreview(previewUrl);
    setCheckImageName(file.name);
    setCheckImageFile(file);
    setOcrImageFile(null);
    setLastOcrSourceType(source);
    setLastCameraCaptureDiagnosticLines(
      source === "camera" ? sourceDiagnosticLines : []
    );
    setPaymentEntryMode("photo");
    setCheckOcrStatus("idle");
    setCheckOcrMessage("Preparing remittance...");
    setFiledPaymentImage(null);
    if (intent === "primary") {
      clearCurrentRemittanceReviewState();
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
      setLastOcrDiagnosticLines([]);
      setLastOcrPrepDiagnosticLines([]);
      setLastOcrRawText("");
      setLastOcrSourceType(source);
      setLastCameraCaptureDiagnosticLines(
        source === "camera" ? sourceDiagnosticLines : []
      );
    }
    setCompletedPaymentSummary(null);
    setCaptureDocumentType(documentType);
    setCaptureIntent(intent);

    const acquiredEvidence = captureUi.current!;
    setCheckOcrStatus('reading');
    setCheckOcrMessage('Processing remittance…');
    setIsPreparingCrop(true);
    async function prepareCapturedImage() {
      try {
        await remittanceDeadline(new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), 2_000, "Preview paused. Retry when Trimax is visible.");
        if (captureVersion !== ocrAttemptVersion.current) return;
        acquiredEvidence.previewPaintOpportunityAt = Date.now();
        captureTimings.current.previewPaintOpportunityAt = acquiredEvidence.previewPaintOpportunityAt;
        await readPreparedRemittanceFromFile(capturedFile,documentType,intent,'standard',source,
          [...sourceDiagnosticLines,'Capture implementation: guided camera or existing photo; full image preserved.']);
      } catch (error) {
        if (captureVersion !== ocrAttemptVersion.current) return;
        setIsPreparingCrop(false); setCheckOcrStatus("error");
        setCheckOcrMessage(error instanceof Error ? error.message : "Could not prepare image. Retry or enter manually.");
      }
    }
    void prepareCapturedImage();
  });

  const closeRemittanceCamera = useCallback(() => setPaymentEntryMode("choice"), []);
  const enterRemittanceManually = useCallback(() => {
    ocrAttemptVersion.current++;
    setIsPreparingCrop(false);
    setCheckOcrStatus("manual");
    setPaymentEntryMode("manual");
    setCheckOcrMessage("Select invoices and review the payment before applying.");
    setCaptureRetry(null);
  }, []);

  const openCameraCapture = useRemittanceEvent(function openCameraCaptureEvent(documentType: RemittanceDocumentType = captureDocumentType, intent: CaptureIntent = 'primary'): void {
    if (intent === 'primary') resetCheckCaptureState();
    ocrAttemptVersion.current++;
    setIsPreparingCrop(false);
    beginCapture('custom-camera','Guided live remittance camera');
    setCaptureDocumentType(documentType); setCaptureIntent(intent);
    captureTimings.current={captureOpenedAt:Date.now(),stillReturnedAt:null,previewPaintOpportunityAt:null,cameraIndicatorMs:null};
    setPaymentEntryMode("camera");
  });

  async function applyBatchPayment(confirmedReviewKey?: string) {
    if(paymentSubmitBusy.current)return;
    const reviewKey=JSON.stringify({businessId,sourceAttemptId:latestScan.current?.attemptId??null,invoiceIds:[...selectedIds].sort(),checkAmount:enteredCheckAmount,paymentReference,checkDate,receivedDate,checkPayor,paymentType,internalNote,remittanceDocumentFingerprint,duplicateEvidenceKey,duplicateOverrideClearedKey,reversedDuplicateReviewedKey});
    if(confirmedReviewKey!==undefined&&confirmedReviewKey!==reviewKey){setPaymentConfirmation(null);setToast({type:'error',message:'The payment review changed. Check the details and confirm again.'});return;}
    const validationOnly=confirmedReviewKey===undefined;
    if (!paymentCanApply) {
      setToast({ type: "error", message: "Review the payment and resolve reconciliation issues before applying." });
      return;
    }
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

    if (duplicateRemittanceCheck.status === "active") {
      setDuplicateRemittanceModal({
        result: duplicateRemittanceCheck,
        intent: "active",
      });
      return;
    }

    if (
      duplicateRemittanceCheck.status === "reversed" &&
      reversedDuplicateReviewedKey !== duplicateEvidenceKey
    ) {
      setDuplicateRemittanceModal({
        result: duplicateRemittanceCheck,
        intent: "reversed",
      });
      return;
    }

    if (
      duplicateRemittanceCheck.status === "possible" &&
      duplicateOverrideClearedKey !== duplicateEvidenceKey
    ) {
      setDuplicateRemittanceModal({
        result: duplicateRemittanceCheck,
        intent: "possible",
      });
      return;
    }

    paymentSubmitBusy.current=true;
    setIsSaving(true);
    setIsValidatingPayment(validationOnly);
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
      const filedImage = validationOnly ? null : await filePaymentImage();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const submittedPaymentReference =
        paymentReference.trim() || capturedCheckReference.trim();
      const submittedPayor = checkPayor.trim();
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
          validateOnly: validationOnly,
          sourceAttemptId: latestScan.current?.attemptId ?? null,
          confirmSavedRemittance: !validationOnly,
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          paymentDate: receivedDate,
          receivedDate,
          checkDate,
          paymentType,
          paymentReference: submittedPaymentReference,
          payor: submittedPayor,
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
          remittanceDocumentFingerprint:
            remittanceDocumentFingerprint || null,
          duplicateOverrideConfirmed:
            duplicateRemittanceCheck.status === "possible" &&
            duplicateOverrideClearedKey === duplicateEvidenceKey,
          duplicateOverrideReason:
            duplicateRemittanceCheck.status === "possible" &&
            duplicateOverrideClearedKey === duplicateEvidenceKey
              ? "Owner/admin confirmed possible duplicate review in payment workspace."
              : "",
        }),
      });
      const result = (await response
        .json()
        .catch(() => ({}))) as ApplyBatchPaymentResponse;

      if (!response.ok) {
        const diagnosticParts = [
          `status=${response.status}`,
          result.code ? `code=${result.code}` : null,
          result.stage ? `stage=${result.stage}` : null,
          result.serverMessage ? `server=${result.serverMessage}` : null,
          typeof result.partialMutationOccurred === "boolean"
            ? `partialMutationOccurred=${result.partialMutationOccurred ? "yes" : "no"}`
            : null,
          result.rollbackAttempted
            ? `rollback=${result.rollbackSucceeded ? "succeeded" : "failed"}`
            : null,
        ].filter(Boolean);

        setLastOcrDiagnosticLines((current) => [
          ...current,
          `Apply-batch failure: ${diagnosticParts.join(" | ")}`,
        ]);

        if (result.duplicateRemittance) {
          setDuplicateRemittanceModal({
            result: result.duplicateRemittance,
            intent:
              result.duplicateRemittance.status === "active"
                ? "active"
                : result.duplicateRemittance.status === "reversed"
                  ? "reversed"
                  : "possible",
          });
        }

        throw new Error(
          result.error ??
            "Unable to apply the batch payment. Refresh, sign in again if needed, then try once more."
        );
      }

      if(validationOnly){
        if(result.validated!==true||result.paymentApplied!==false)throw Error('Payment validation did not return a safe confirmation. No payment was applied.');
        setPaymentConfirmation({key:reviewKey,checkNumber:submittedPaymentReference,payor:submittedPayor,amount:enteredCheckAmount!,invoiceNumbers:selectedInvoices.map(invoice=>invoice.displayId||invoice.id),savedDiagnostic:resumedDiagnosticReplay.current});
        return;
      }
      setPaymentConfirmation(null);
      setToast({
        type: "success",
        message: `Applied payment to ${result.appliedCount ?? selectedInvoices.length} invoice${
          (result.appliedCount ?? selectedInvoices.length) === 1 ? "" : "s"
        }.`,
      });
      setCompletedPaymentSummary({
        checkNumber: result.paymentReference || submittedPaymentReference,
        payor: result.payor || submittedPayor,
        totalAmount: result.checkAmount ?? enteredCheckAmount ?? selectedTotal,
        invoiceCount: selectedInvoices.length,
      });
      setPaymentEntryMode("complete");
      setCheckOcrStatus("idle");
      setCheckOcrMessage("Payment applied.");
      clearCurrentRemittanceReviewState();
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
      setFiledPaymentImage(null);
      router.refresh();
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
      paymentSubmitBusy.current=false;
      setIsValidatingPayment(false);
      setIsSaving(false);
    }
  }

  function duplicatePaymentHref() {
    return `/payments?business=${businessSlug ?? "rnl-creations"}#payment-history`;
  }

  function closeDuplicateModal() {
    setDuplicateRemittanceModal(null);
  }

  function continueAfterPossibleDuplicateReview() {
    if (!duplicateRemittanceModal?.result.canOverride) {
      return;
    }

    setDuplicateOverrideClearedKey(duplicateEvidenceKey);
    setDuplicateRemittanceModal(null);
    setToast({
      type: "success",
      message: "Possible duplicate reviewed. Apply is available for this owner/admin session.",
    });
  }

  function reviewReversedPayment() {
    setReversedDuplicateReviewedKey(duplicateEvidenceKey);
    setDuplicateRemittanceModal(null);
  }

  function duplicateRemittanceModalView() {
    if (!duplicateRemittanceModal) {
      return null;
    }

    const { result, intent } = duplicateRemittanceModal;
    const payment = result.payment;
    const title =
      intent === "active"
        ? "Remittance Already Applied"
        : intent === "reversed"
          ? "Previously Applied — Payment Reversed"
          : "Possible Duplicate Remittance";
    const message =
      intent === "active"
        ? "This check stub has already been applied."
        : intent === "reversed"
          ? "This remittance was applied before, but that payment has been reversed. You may review and apply it again."
          : "This check stub closely matches a payment already in Trimax. Review the existing payment before continuing.";
    const tone =
      intent === "active"
        ? "from-rose-500 to-orange-400"
        : intent === "reversed"
          ? "from-sky-500 to-emerald-400"
          : "from-amber-400 to-orange-400";
    const summaryBits = [
      payment?.checkNumber ? `Check #${payment.checkNumber}` : "",
      payment?.amount ? formatMoney(payment.amount) : "",
      payment?.invoiceCount ? `${payment.invoiceCount} invoice${payment.invoiceCount === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const invoiceNumbers = payment?.invoiceNumbers.slice(0, 6).join(", ") ?? "";
    const appliedDate = payment?.appliedDate ? formatDate(payment.appliedDate) : "";

    return createPortal(
      <div className="fixed inset-0 z-[2147482500] grid place-items-center bg-black/65 px-4 py-6 backdrop-blur-sm">
        <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] bg-white text-slate-950 shadow-2xl ring-1 ring-black/10 dark:bg-zinc-950 dark:text-white dark:ring-white/10">
          <div className={`h-2 bg-gradient-to-r ${tone}`} />
          <div className="p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-xl font-black text-black shadow-lg`}>
                {intent === "active" ? "!" : intent === "reversed" ? "R" : "?"}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-black tracking-tight">{title}</h2>
                <p className="mt-2 text-base leading-7 text-slate-600 dark:text-zinc-300">
                  {message}
                </p>
              </div>
            </div>

            {summaryBits.length > 0 ? (
              <div className="mt-6 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800 dark:bg-white/10 dark:text-zinc-100">
                {summaryBits.join(" | ")}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-600 dark:text-zinc-300">
              {appliedDate ? <p>Applied {appliedDate}</p> : null}
              {payment?.payor ? <p>{payment.payor}</p> : null}
              {invoiceNumbers ? <p>{invoiceNumbers}</p> : null}
              {intent === "active" ? (
                <p className="font-semibold text-rose-700 dark:text-rose-200">
                  No duplicate payment will be created.
                </p>
              ) : null}
              {intent === "reversed" && payment?.reversalDate ? (
                <p>Reversed {formatDate(payment.reversalDate)}</p>
              ) : null}
              {intent === "reversed" && payment?.reversalReason ? (
                <p>{payment.reversalReason}</p>
              ) : null}
              {intent === "possible" && !result.canOverride ? (
                <p className="font-semibold text-amber-700 dark:text-amber-200">
                  Owner or admin review is required to continue.
                </p>
              ) : null}
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDuplicateModal}
                className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                Close
              </button>
              <a
                href={duplicatePaymentHref()}
                onClick={closeDuplicateModal}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-center font-bold text-white shadow-lg transition hover:opacity-90 dark:bg-white dark:text-zinc-950"
              >
                {intent === "possible" ? "View Possible Match" : intent === "reversed" ? "View Reversal History" : "View Payment"}
              </a>
              {intent === "reversed" ? (
                <button
                  type="button"
                  onClick={reviewReversedPayment}
                  className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black shadow-lg transition hover:opacity-90"
                >
                  Review Remittance
                </button>
              ) : null}
              {intent === "possible" && result.canOverride ? (
                <button
                  type="button"
                  onClick={continueAfterPossibleDuplicateReview}
                  className="rounded-2xl bg-amber-400 px-5 py-3 font-black text-black shadow-lg transition hover:opacity-90"
                >
                  Continue After Review
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (payableInvoices.length === 0) {
    return businessId ? <RecentScans businessId={businessId} businessSlug={businessSlug??undefined} role={workspaceRole} savedStatus={scanSavedStatus}/> : null;
  }

  return (
    <Card className="batch-payments-card border-green-500/30 bg-green-500/5">
      {retainedAttemptId && ['owner','admin'].includes(workspaceRole??'') && <button type="button" disabled={checkOcrStatus==='reading'} className="rounded border px-3 py-2 text-sm" onClick={async()=>{
        try {
          const {data:original,error}=await supabase.from('ocr_attempts').select('id,business_id,original_id,summary').eq('id',retainedAttemptId).eq('business_id',businessId!).single();
          if(error||!original)throw Error('Retained attempt unavailable');
          const optical=await scanOptical(original.summary.canonicalReference??retainedAttemptId);
          const image=optical?.images?.find((item:{label:string;base64?:string;sha256?:string})=>item.label==='Canonical OCR input'&&item.sha256===original.summary.sourceImageHash&&item.base64)??(!original.summary.canonicalReference?optical?.images?.find((item:{label:string;base64?:string})=>item.label==='Final OCR input'&&item.base64):null);
          if(!image)throw Error('Retained canonical image unavailable');
          const imageDataUrl='data:'+image.mime+';base64,'+image.base64;
          resumedDiagnosticReplay.current=true;
          setPaymentConfirmation(null);
          preparedCaptureRef.current={source:'retained-still-replay',image:{width:image.width,height:image.height,bytes:Math.floor(image.base64.length*3/4),mime:image.mime},quality:{},sources:[],selectionReason:'Exact retained physical pixels; diagnostic replay only'};
          scanLineage.current={original:original.original_id,last:original.id};
          setCheckImagePreview(imageDataUrl);setPaymentEntryMode('photo');
          await extractCheckStubFromPhoto(imageDataUrl,'remittance_stub','primary','standard',['Diagnostic replay of retained attempt '+original.id+'; no new physical capture.'],'',original.summary.canonicalReference??retainedAttemptId,['image_stored','processing'].includes(original.summary.captureState)?{history:original.summary,canonical:{reference:original.summary.canonicalReference,sha256:original.summary.sourceImageHash,storedBytes:Math.floor(image.base64.length*3/4),shadowQueued:false,uploadDurationMs:0}}:undefined);
        } catch(error) { setCheckOcrMessage(String(error)); }
      }}>Replay retained image — no payment</button>}
      {businessId && ['owner','admin'].includes(workspaceRole??'') && <LegacyOcrJobs businessId={businessId} onResume={async job=>{
        try {
          resumedDiagnosticReplay.current=Boolean(job.input.diagnosticReplay);
          setPaymentConfirmation(null);
          const history=job.summary;
          const optical=await scanOptical(history.canonicalReference!);
          const image=optical?.images?.find((item:{sha256?:string;base64?:string})=>item.sha256===history.sourceImageHash&&item.base64);
          if(!image)throw Error('Saved image is unavailable or expired.');
          const imageDataUrl='data:'+image.mime+';base64,'+image.base64;
          setCheckImagePreview(imageDataUrl);setPaymentEntryMode('photo');
          await extractCheckStubFromPhoto(imageDataUrl,job.input.documentType,job.input.documentType==='check_only'?'check_details':'primary',job.input.retryStrategy,[],'',history.canonicalReference,{history,canonical:{reference:history.canonicalReference!,sha256:history.sourceImageHash!,storedBytes:Math.floor(image.base64.length*3/4),shadowQueued:true,uploadDurationMs:0}});
        }catch(error){setCheckOcrMessage(String(error));}
      }}/> }
      {businessId && <RecentScans businessId={businessId} businessSlug={businessSlug??undefined} role={workspaceRole} savedStatus={scanSavedStatus}/> }
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}
      {paymentConfirmation && typeof document!=='undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="payment-confirmation-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-950 shadow-xl">
            <h2 id="payment-confirmation-title" className="text-xl font-bold">Confirm this payment</h2>
            <p role="status" className="mt-2">Server validation passed. No payment has been applied.</p>
            <p className="mt-3">Check #{paymentConfirmation.checkNumber} · {paymentConfirmation.payor} · {formatMoney(paymentConfirmation.amount)}</p>
            <p>{paymentConfirmation.invoiceNumbers.join(', ')}</p>
            {paymentConfirmation.savedDiagnostic && <p className="mt-3">This is a retained saved scan. Confirming below records a real payment and keeps its scan history.</p>}
            <button type="button" disabled={isSaving} onClick={()=>setPaymentConfirmation(null)} className="mt-4 rounded-xl border px-4 py-3">Cancel — keep unapplied</button>
            <button type="button" disabled={isSaving} onClick={()=>void applyBatchPayment(paymentConfirmation.key)} className="mt-3 w-full rounded-xl bg-green-500 px-4 py-3 font-bold disabled:opacity-50">{isSaving?'Applying...':'Apply this real payment'}</button>
          </div>
        </div>,document.body)}

      {typeof document !== "undefined" ? duplicateRemittanceModalView() : null}

      {paymentEntryMode === "camera" && <RemittanceCamera onCancel={closeRemittanceCamera} onManual={enterRemittanceManually} onCapture={(file, source) => captureCheckImage(file, source)} />}

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

            <div className="check-photo-dropzone mt-4 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-sky-400/30 bg-black/30 p-4 text-center">
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
              <p className="mt-3 text-sm text-sky-100">Hold your phone in landscape. Include all four paper edges.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openCameraCapture("remittance_stub", "primary");
                  }}
                  className="check-camera-action inline-flex rounded-full bg-sky-500 px-4 py-2 text-sm font-black text-white transition hover:bg-sky-600"
                >
                  {checkImagePreview ? "Retake Photo" : "Take Photo"}
                </button>

                <label className="inline-flex cursor-pointer rounded-full border border-sky-300/50 px-4 py-2 text-sm font-black text-sky-100 transition hover:border-sky-200 hover:bg-sky-500/10">
                  Choose Existing Photo
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    onClick={() => { resetCheckCaptureState(); beginCapture('existing-photo','Choose Existing Photo selected'); }}
                    className="sr-only"
                    onChange={(event) => {
                      captureCheckImage(event.target.files?.[0], "existing", "remittance_stub", "primary");
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

              <button type="button" onClick={enterRemittanceManually} className="mt-3 min-h-11 rounded-full border border-emerald-300/50 px-4 py-2 text-sm font-semibold text-emerald-100">Enter Manually</button>

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
                      {checkOcrMessage}
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
                          if(captureRetry) { void captureRetry.run(); return; }
                          if (checkImageFile) {
                            void readPreparedRemittanceFromFile(
                              checkImageFile,
                              captureDocumentType,
                              captureIntent,
                              "alternate"
                            );
                          }
                        }}
                        disabled={(!checkImageFile && !captureRetry) || isPreparingCrop}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openCameraCapture();
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Retake Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          enterRemittanceManually();
                        }}
                        className="rounded-full border border-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-white/10"
                      >
                        Enter Manually / Select Missing Invoice
                      </button>
                    </div>
                  </div>
                ) : null}

                {retainedAttemptId && checkOcrStatus !== "reading" && activeRemittanceAttempt && shadowFlags.businessId===businessId && shadowAllowed(shadowFlags,workspaceRole) && (
            <div className="mt-3 rounded-xl border border-slate-300/30 p-3 text-sm">
              <button type="button" disabled={sharedMoneyLoading} onClick={()=>void reviewSharedMoney()} className="rounded-full border px-3 py-2 font-semibold disabled:opacity-50">{sharedMoneyLoading?'Loading amount evidence…':'Review specialized amount evidence'}</button>
              <p className="mt-2">{sharedMoneyStatus||'Use saved visual amount evidence from this photo. Invoice selection and payment checks remain separate.'}</p>
            </div>
          )}          {retainedAttemptId && checkOcrStatus !== "reading" &&
                lastOcrDiagnosticLines.length > 0 ? (
                  <details className="mt-3 rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs text-sky-50">
                    <summary className="cursor-pointer font-black">
                      OCR pipeline details
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void copyOcrDiagnostics();
                        }}
                        className="rounded-full border border-sky-200/50 px-3 py-1.5 text-xs font-black text-sky-50 transition hover:bg-sky-200/10"
                      >
                        Copy Diagnostics
                      </button>
                      {canShareOcrDiagnostics() ? (
                        <button
                          type="button"
                          onClick={() => {
                            void shareOcrDiagnostics();
                          }}
                          className="rounded-full border border-sky-200/50 px-3 py-1.5 text-xs font-black text-sky-50 transition hover:bg-sky-200/10"
                        >
                          Share Diagnostics
                        </button>
                      ) : null}
                    </div>
                    <ul className="mt-2 grid gap-1">
                      {lastOcrDiagnosticLines.map((line, index) => (
                        <li key={`${line}-${index}`}>{line}</li>
                      ))}
                    </ul>
                    {lastOcrRawText ? (
                      <div className="mt-3">
                        <p className="font-black">Raw OCR text</p>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/55 p-2 font-mono text-[10px] leading-4 text-sky-50">
                          {lastOcrRawText}
                        </pre>
                      </div>
                    ) : null}
                  </details>
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
              ? "xl:grid-cols-[minmax(130px,150px)_minmax(130px,150px)_minmax(140px,170px)_minmax(140px,180px)_minmax(0,1fr)_minmax(190px,auto)]"
              : "xl:grid-cols-[minmax(130px,150px)_minmax(130px,150px)_minmax(110px,130px)_minmax(140px,170px)_minmax(140px,180px)_minmax(0,1fr)_minmax(190px,auto)]"
          }`}
        >
          <DateInputField
            label="Check Date"
            value={checkDate}
            onChange={setCheckDate}
            helperText={isRemittanceReview ? "From OCR when available." : undefined}
            inputClassName="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-28 text-slate-950 outline-none transition focus:border-sky-500"
          />

          <DateInputField
            label="Received Date"
            value={receivedDate}
            onChange={setReceivedDate}
            helperText={isRemittanceReview ? "Used for late-payment tracking." : undefined}
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
              placeholder="Check number"
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
              placeholder="Payor / property name"
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
              onClick={() => void applyBatchPayment()}
              disabled={
                !paymentCanApply
              }
              className="w-full rounded-2xl bg-green-500 px-5 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isSaving ? (isValidatingPayment ? "Checking payment..." : "Applying...") : "Confirm and Apply Payment"}
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
