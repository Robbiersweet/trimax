import { moneyCents, sumMoney } from "../../../lib/money.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  invoiceCollectionAmountDue,
  isPaymentEligibleInvoice,
  type InvoiceEligibilityLineItem,
} from "../../../lib/invoiceEligibility";
import { moneyNumber } from "../../../lib/invoiceLifecycle";
import {
  paymentDateKey,
} from "../../../lib/paymentTimeliness";
import {
  findDuplicateRemittance,
  type DuplicateRemittanceActivity,
} from "../../../lib/duplicateRemittance";
import { createRemittanceDocumentFingerprint } from "../../../lib/remittanceDocumentFingerprint";
import {postingRequestKey, prepareAtomicPlan, verifiedActivitySnapshot, type VerifiedInvoiceReference, type PostingLine} from '../../../lib/atomicRemittance';
import {loadSavedRemittancePayment} from '../../../lib/savedRemittancePaymentServer';

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type Database = {
  public: {
    Tables: {
      remittance_posting_receipts: GenericTable;
      activity_logs: GenericTable;
      business_users: GenericTable;
      invoice_line_items: GenericTable;
      invoices: GenericTable;
      ocr_legacy_jobs: GenericTable;
      ocr_attempts: GenericTable;
      ocr_attempt_diagnostics: GenericTable;
    };
    Views: Record<string, never>;
    Functions: {trimax_commit_remittance:{Args:{p_business:string;p_actor:string;p_key:string;p_plan:unknown;p_verified_activities:unknown;p_validate_only:boolean};Returns:Record<string,unknown>}};
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

type InvoiceRow = {
  id: string;
  business_id: string;
  client_id: string | null;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  invoice_amount: string | number | null;
  amount_paid: string | number | null;
  deposit_requested_amount: string | number | null;
  deposit_status: string | null;
  status: string | null;
  due_date: string | null;
  split_parent_invoice_id?: string | null;
};

type InvoiceLineItemRow = InvoiceEligibilityLineItem & {
  id: string;
  invoice_id: string;
};

type BusinessUserRow = {
  id: string;
  role?: string | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

async function requireWorkspaceAccess({
  supabase,
  token,
  businessId,
}: {
  supabase: AdminClient;
  token: string | null;
  businessId: string;
}) {
  if (!token) {
    return { ok: false, email: null, userId: null };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false, email: null, userId: null };
  }

  const userEmail = userData.user.email?.toLowerCase() ?? "";
  const { data, error } = await supabase
    .from("business_users")
    .select("id, role")
    .eq("business_id", businessId)
    .or(`user_id.eq.${userData.user.id},email.ilike.${userEmail}`)
    .limit(1)
    .maybeSingle<BusinessUserRow>();

  if (error || !data || !["owner","admin","accountant"].includes(data.role ?? "")) {
    return {
      ok: false,
      email: userData.user.email ?? null,
      userId: userData.user.id,
    };
  }

  return {
    ok: true,
    email: userData.user.email ?? null,
    userId: userData.user.id,
    role: data.role ?? "",
  };
}

function cleanString(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalDateKey(value: unknown) {
  const key = cleanString(value, 40).slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function applyErrorResponse({
  message,
  code,
  stage,
  status,
  cause,
  partialMutationOccurred = false,
  rollbackAttempted = false,
  rollbackSucceeded = null,
  duplicateRemittance,
}: {
  message: string;
  code: string;
  stage: string;
  status: number;
  cause?: unknown;
  partialMutationOccurred?: boolean;
  rollbackAttempted?: boolean;
  rollbackSucceeded?: boolean | null;
  duplicateRemittance?: unknown;
}) {
  const serverMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : undefined;

  return NextResponse.json(
    {
      error: message,
      code,
      stage,
      serverMessage,
      partialMutationOccurred,
      rollbackAttempted,
      rollbackSucceeded,
      duplicateRemittance,
    },
    { status }
  );
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return applyErrorResponse({
      message: "Payment application is not configured.",
      code: "payment_application_not_configured",
      stage: "configuration",
      status: 503,
    });
  }


  const body = (await request.json().catch(() => ({}))) as {
    businessId?: string;
    invoiceIds?: string[];
    paymentDate?: string;
    receivedDate?: string;
    checkDate?: string;
    paymentType?: string;
    paymentReference?: string;
    payor?: string;
    internalNote?: string;
    checkAmount?: number;
    paymentAttachmentId?: string | null;
    paymentImagePath?: string | null;
    paymentImageFileName?: string | null;
    remittanceStubMatched?: boolean;
    remittanceStubTotal?: number | null;
    remittanceStubLineCount?: number | null;
    remittanceMatchConfidence?: number | null;
    remittanceDocumentFingerprint?: string | null;
    duplicateOverrideConfirmed?: boolean;
    duplicateOverrideReason?: string;
    validateOnly?: boolean;
    sourceAttemptId?: string;
    confirmSavedRemittance?: boolean;
    confirmedInvoiceRefs?: VerifiedInvoiceReference[];
    allocations?: {invoiceId:string;amount:number}[];
    reversedDuplicateConfirmed?: boolean;
  };
  if(!Array.isArray(body.invoiceIds)||body.invoiceIds.some(v=>typeof v!=='string')||(body.allocations!==undefined&&!Array.isArray(body.allocations))||(body.confirmedInvoiceRefs!==undefined&&!Array.isArray(body.confirmedInvoiceRefs))) return NextResponse.json({error:'Invalid complete allocation request.'},{status:400});
  const businessId = cleanString(body.businessId, 80);
  const invoiceIds = (body.invoiceIds ?? []).map((id) => cleanString(id, 80));

  if (!businessId || invoiceIds.length === 0 || invoiceIds.length>1000 || new Set(invoiceIds).size!==invoiceIds.length || invoiceIds.some(id=>!id)) {
    return applyErrorResponse({
      message: "Select at least one invoice before applying payment.",
      code: "invalid_apply_request",
      stage: "request-validation",
      status: 400,
    });
  }

  const checkAmount = moneyNumber(body.checkAmount ?? null);

  if (checkAmount <= 0) {
    return applyErrorResponse({
      message: "Enter a payment amount greater than $0 before applying payment.",
      code: "invalid_payment_amount",
      stage: "request-validation",
      status: 400,
    });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const access = await requireWorkspaceAccess({
    supabase,
    token,
    businessId,
  });

  if (!access.ok) {
    return applyErrorResponse({
      message: "Unauthorized.",
      code: "unauthorized",
      stage: "authorization",
      status: 401,
    });
  }

  if (body.validateOnly !== true && body.confirmSavedRemittance !== true) return applyErrorResponse({message:'Explicit approval of the whole check is required.',code:'confirmation_required',stage:'confirmation',status:400});
  // Complete history is rechecked under the database lock. Never truncate duplicate evidence.
  type Activity={id:string;action:string;entity_id?:string|null;entity_label?:string|null;details?:Record<string,unknown>|null;created_at?:string|null};
  const duplicateActivityData:Activity[]=[];
  for(let offset=0; ;offset+=500){
    const {data,error}=await supabase.from('activity_logs').select('id, action, entity_id, entity_label, details, created_at').eq('business_id',businessId).eq('action','invoice.batch_payment_applied').order('created_at',{ascending:false}).order('id').range(offset,offset+499);
    if(error || offset>=10000) return applyErrorResponse({message:'Complete payment history could not be verified. No payment was applied.',code:'payment_history_unavailable',stage:'history',status:503});
    duplicateActivityData.push(...(data??[]) as Activity[]);
    if((data??[]).length<500)break;
  }
  const reversedAuditIds=body.reversedDuplicateConfirmed?duplicateActivityData.filter(v=>invoiceIds.includes(v.entity_id??'')&&(v.details?.paymentOutcome==='reversed'||v.details?.paymentReversed===true||v.details?.reversedAt||v.details?.reversalDate)).map(v=>v.id):[];
  const requestKey=postingRequestKey({...body,businessId,invoiceIds},reversedAuditIds);
  // A committed result is retrieved before current Paid eligibility or saved-scan guards.
  const {data:receipt,error:receiptError}=await supabase.from('remittance_posting_receipts').select('result').eq('business_id',businessId).eq('request_key',requestKey).maybeSingle<{result:Record<string,unknown>}>();
  if(receiptError) return applyErrorResponse({message:'Atomic payment posting is unavailable. No new payment was applied.',code:'atomic_posting_unavailable',stage:'receipt',status:503});
  if(receipt) return NextResponse.json(body.validateOnly===true?{validated:true,paymentApplied:true,alreadyApplied:true,...receipt.result}:receipt.result);
  const sourceAttemptId = cleanString(body.sourceAttemptId, 80);
  let savedDiagnosticReview = false;
  if (sourceAttemptId) {
    try {
      const history = await loadSavedRemittancePayment(supabase, businessId, sourceAttemptId);
      if (history.status === 'applied' || history.status === 'ambiguous') return applyErrorResponse({
        message: history.status === 'applied' ? 'Payment already applied. No action is required.' : 'Saved remittance payment history needs review before another application.',
        code: history.status === 'applied' ? 'saved_remittance_already_applied' : 'saved_remittance_history_ambiguous',
        stage: 'saved-remittance-history', status: 409,
      });
    } catch {
      return applyErrorResponse({message: 'Payment history could not be verified. No payment was applied.', code: 'saved_remittance_history_unavailable', stage: 'saved-remittance-history', status: 503});
    }
    const {data: sourceJob, error: sourceError} = await supabase.from('ocr_legacy_jobs')
      .select('attempt_id, input, state').eq('business_id', businessId).eq('attempt_id', sourceAttemptId)
      .maybeSingle<{attempt_id:string;input:{diagnosticReplay?:boolean};state:string}>();
    if (sourceError || !sourceJob || sourceJob.state!=='review') return applyErrorResponse({message:'Saved remittance is unavailable in this workspace.',code:'invalid_saved_remittance',stage:'saved-remittance-validation',status:400});
    savedDiagnosticReview = sourceJob.input.diagnosticReplay === true;
    if (savedDiagnosticReview && (!['owner','admin'].includes(access.role??'') || (body.validateOnly !== true && body.confirmSavedRemittance !== true))) {
      return applyErrorResponse({message:'An owner or admin must explicitly confirm this saved diagnostic remittance before applying payment.',code:'saved_remittance_confirmation_required',stage:'saved-remittance-confirmation',status:403});
    }
  }

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, business_id, client_id, display_id, customer_name, project_title, invoice_amount, amount_paid, deposit_requested_amount, deposit_status, status, due_date, split_parent_invoice_id"
    )
    .eq("business_id", businessId)
    .in("id", invoiceIds)
    .returns<InvoiceRow[]>();

  if (invoiceError) {
    return NextResponse.json(
      { error: "Trimax could not verify selected invoices." },
      { status: 500 }
    );
  }

  if ((invoiceData ?? []).length !== invoiceIds.length) {
    return NextResponse.json(
      { error: "One selected invoice could not be found in this workspace." },
      { status: 400 }
    );
  }

  const { data: childData, error: childError } = await supabase
    .from("invoices")
    .select("split_parent_invoice_id")
    .eq("business_id", businessId)
    .in("split_parent_invoice_id", invoiceIds)
    .returns<{ split_parent_invoice_id: string | null }[]>();
  if(childError) return NextResponse.json({error:'Split invoice relationships could not be verified.'},{status:503});
  const splitChildrenByParentId = new Map<string, number>();
  (childData ?? []).forEach((child) => {
    const parentId = String(child.split_parent_invoice_id ?? "");
    if (!parentId) return;
    splitChildrenByParentId.set(
      parentId,
      (splitChildrenByParentId.get(parentId) ?? 0) + 1
    );
  });

  const { data: lineItemData, error: lineItemError } = await supabase
    .from("invoice_line_items")
    .select("id, invoice_id, description, quantity, unit_price, line_total")
    .eq("business_id", businessId)
    .in("invoice_id", invoiceIds)
    .returns<InvoiceLineItemRow[]>();

  if (lineItemError) {
    return NextResponse.json(
      { error: "Trimax could not verify invoice line items." },
      { status: 500 }
    );
  }

  const lineItemsByInvoiceId = new Map<string, PostingLine[]>();
  (lineItemData ?? []).forEach((lineItem) => {
    const current = lineItemsByInvoiceId.get(lineItem.invoice_id) ?? [];
    current.push(lineItem);
    lineItemsByInvoiceId.set(lineItem.invoice_id, current);
  });
  const invoices = (invoiceData ?? []).map((invoice) => ({
    ...invoice,
    split_children_count: splitChildrenByParentId.get(invoice.id) ?? 0,
  }));
  const invalidInvoice = invoices.find(
    (invoice) =>
      !isPaymentEligibleInvoice({
        invoice,
        lineItems: lineItemsByInvoiceId.get(invoice.id) ?? [],
      })
  );

  if (invalidInvoice) {
    return NextResponse.json(
      {
        error: `${invalidInvoice.display_id ?? "This invoice"} is not collectible and cannot receive a payment.`,
        invoiceId: invalidInvoice.id,
      },
      { status: 400 }
    );
  }

  const selectedTotal = body.allocations ? sumMoney(body.allocations.map(v=>moneyNumber(v.amount))) : sumMoney(invoices.map(invoiceCollectionAmountDue));
  const remittanceTotal = moneyNumber(body.remittanceStubTotal ?? null);

  if (moneyCents(selectedTotal) !== moneyCents(checkAmount)) {
    return NextResponse.json(
      {
        error:
          "The payment amount does not match the selected collectible invoice balances.",
      },
      { status: 400 }
    );
  }

  if (
    body.remittanceStubMatched &&
    remittanceTotal > 0 &&
    moneyCents(selectedTotal) !== moneyCents(remittanceTotal)
  ) {
    return NextResponse.json(
      {
        error:
          "The remittance total does not match the selected collectible invoices.",
      },
      { status: 400 }
    );
  }

  const paymentReference = cleanString(body.paymentReference, 120);
  const payor = cleanString(body.payor, 160);
  const receivedDate = paymentDateKey(
    cleanString(body.receivedDate ?? body.paymentDate, 40)
  );
  const checkDate = optionalDateKey(body.checkDate);
  let remittanceDocumentFingerprint = cleanString(
    body.remittanceDocumentFingerprint,
    300
  );

  if (!remittanceDocumentFingerprint && body.paymentImagePath) {
    const { data: imageBlob } = await supabase.storage
      .from("trimax-payment-images")
      .download(cleanString(body.paymentImagePath, 1000));

    if (imageBlob) {
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
      const fingerprint =
        await createRemittanceDocumentFingerprint(imageBuffer).catch(() => null);

      remittanceDocumentFingerprint = fingerprint?.hash ?? "";
    }
  }

  const duplicateCheck = findDuplicateRemittance(
    {
      checkNumber: paymentReference,
      amount: checkAmount,
      checkDate,
      receivedDate,
      payor,
      invoiceIds,
      invoiceNumbers: invoices.map((invoice) => invoice.display_id ?? ""),
      fingerprint: remittanceDocumentFingerprint,
    },
    ((duplicateActivityData ?? []) as Array<{
      id: string;
      action: string;
      entity_id?: string | null;
      entity_label?: string | null;
      details?: Record<string, unknown> | null;
      created_at?: string | null;
    }>).map(
      (activity): DuplicateRemittanceActivity => ({
        id: activity.id,
        action: activity.action,
        entityId: activity.entity_id ?? null,
        entityLabel: activity.entity_label ?? null,
        details: activity.details ?? null,
        createdAt: activity.created_at ?? null,
      })
    ),
    access.role
  );

  if (duplicateCheck.status === "active") {
    return NextResponse.json(
      {
        error: "This check stub has already been applied.",
        duplicateRemittance: duplicateCheck,
      },
      { status: 409 }
    );
  }

  if (
    duplicateCheck.status === "possible" &&
    !body.duplicateOverrideConfirmed
  ) {
    return NextResponse.json(
      {
        error: "This check stub closely matches a payment already in Trimax.",
        duplicateRemittance: duplicateCheck,
      },
      { status: 409 }
    );
  }

  if (
    duplicateCheck.status === "possible" &&
    body.duplicateOverrideConfirmed &&
    !duplicateCheck.canOverride
  ) {
    return NextResponse.json(
      {
        error: "Only an owner or admin can continue after a possible duplicate warning.",
        duplicateRemittance: duplicateCheck,
      },
      { status: 403 }
    );
  }

  const audit={paymentDate: receivedDate,receivedDate,checkDate,paymentType:cleanString(body.paymentType,80),paymentReference,payor,
    sourceOcrAttemptId:sourceAttemptId||null,savedDiagnosticReviewConfirmed:savedDiagnosticReview&&body.confirmSavedRemittance===true,
    internalNote:cleanString(body.internalNote,1000),remittanceStubMatched:Boolean(body.remittanceStubMatched),remittanceStubTotal:body.remittanceStubTotal??null,
    remittanceStubLineCount:body.remittanceStubLineCount??null,remittanceMatchConfidence:body.remittanceMatchConfidence??null,
    remittanceDocumentFingerprint:remittanceDocumentFingerprint||null,remittanceDocumentFingerprintVersion:remittanceDocumentFingerprint?'trimax-ahash-32-v1':null,
    paymentAttachmentId:body.paymentAttachmentId??null,paymentImagePath:body.paymentImagePath??null,paymentImageFileName:body.paymentImageFileName??null};
  const overrideAudit=duplicateCheck.status==='possible'&&body.duplicateOverrideConfirmed&&duplicateCheck.canOverride?{
    priorPaymentId:duplicateCheck.payment?.id??null,priorActivityLogIds:duplicateCheck.payment?.activityLogIds??[],
    reason:cleanString(body.duplicateOverrideReason,500)||'Owner/admin confirmed possible duplicate review.',
    duplicateEvidenceSummary:duplicateCheck.reasons.join(', '),paymentReference,checkAmount,checkDate,receivedDate,payor,invoiceIds}:null;
  let plan;
  try{plan=prepareAtomicPlan({...body,invoiceIds},invoices,lineItemsByInvoiceId,audit,overrideAudit);}
  catch(error){return applyErrorResponse({message:error instanceof Error?error.message:'Complete allocation review required.',code:'allocation_review_required',stage:'allocation-validation',status:400});}
  // This is the only financial mutation. PostgreSQL commits invoices, audits and retry receipt together.
  // No HTTP compensation or nontransactional fallback is permitted.
  try{
    const {data,error}=await supabase.rpc('trimax_commit_remittance',{p_business:businessId,p_actor:access.userId!,p_key:requestKey,p_plan:plan,p_verified_activities:verifiedActivitySnapshot(duplicateActivityData),p_validate_only:body.validateOnly===true});
    if(error){
      const status=error.code==='42501'?403:['40001','23505'].includes(error.code)?409:error.code==='22023'?400:503;
      return applyErrorResponse({message:status===503?'Payment confirmation is unavailable. Retry this same check to retrieve its saved result safely.':'The complete check needs review. '+error.message,code:'atomic_posting_rejected',stage:'atomic-commit',status,cause:error.message});
    }
    if(!data||(body.validateOnly===true?data.validated!==true:data.paymentApplied!==true)) return NextResponse.json({error:'Payment confirmation is unavailable. Retry this same check safely.',code:'payment_confirmation_unknown'},{status:503});
    return NextResponse.json(body.validateOnly===true?{...data,sourceAttemptId:sourceAttemptId||null,requiresSavedRemittanceConfirmation:savedDiagnosticReview}:data);
  }catch{
    return NextResponse.json({error:'Payment confirmation was interrupted. Retry this same check to retrieve its saved result safely.',code:'payment_confirmation_unknown',stage:'atomic-commit'},{status:503});
  }
}
