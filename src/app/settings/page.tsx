"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import PushNotificationSetup from "../components/PushNotificationSetup";
import Toast from "../components/Toast";
import {
  defaultMaintenanceSettings,
  loadMaintenanceSettings,
} from "../lib/maintenanceMode";
import {
  defaultInvoiceEmailSettings,
  emailSettingsKey,
  normalizeInvoiceEmailSettings,
} from "../lib/invoiceEmailSettings";
import { supabase } from "../lib/supabase";
import {
  WorkspaceRole,
  normalizeWorkspaceRole,
} from "../lib/rolePermissions";
import { propertyKey } from "../lib/propertyAccess";
import { loadWorkspaceAccess } from "../lib/workspaceAccess";

type Business = {
  id: string;
  name: string;
  slug: string;
  split_warning_amount: number | string | null;
};

type BusinessUser = {
  id: string;
  business_id: string;
  user_id: string | null;
  email: string;
  role: string;
  created_at: string | null;
  updated_at: string | null;
};

type PropertyUser = {
  id: string;
  business_id: string;
  user_id: string | null;
  email: string;
  property_name: string;
  role: string;
  can_create_queue_items: boolean;
  can_update_queue_items: boolean;
  can_view_reports: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type AccessRequest = {
  id: string;
  business_id: string | null;
  business_slug: string;
  business_name: string | null;
  requester_name: string;
  requester_email: string;
  company_or_property: string | null;
  message: string | null;
  status: "new" | "reviewed" | "approved" | "declined";
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type StorageMetric = {
  key: string;
  label: string;
  count: number | null;
  warningAt: number;
  dangerAt: number;
};

type StorageHealth = {
  databaseSizeBytes: number | null;
  databaseSizeLimitBytes: number;
  metrics: StorageMetric[];
  lastCheckedAt: string | null;
  helperReady: boolean;
};

type StorageHealthRpcRow = {
  database_size_bytes: number | string | null;
  invoice_count: number | string | null;
  estimate_count: number | string | null;
  queue_count: number | string | null;
  client_count: number | string | null;
  import_batch_count: number | string | null;
  import_row_count: number | string | null;
  property_unit_count: number | string | null;
  unit_history_count: number | string | null;
  activity_log_count: number | string | null;
};

const freeDatabaseLimitBytes = 500 * 1024 * 1024;

const emptyStorageHealth: StorageHealth = {
  databaseSizeBytes: null,
  databaseSizeLimitBytes: freeDatabaseLimitBytes,
  helperReady: false,
  lastCheckedAt: null,
  metrics: [
    { key: "invoices", label: "Invoices", count: null, warningAt: 7500, dangerAt: 12000 },
    { key: "estimates", label: "Estimates", count: null, warningAt: 7500, dangerAt: 12000 },
    { key: "queue_items", label: "Queue Items", count: null, warningAt: 12000, dangerAt: 20000 },
    { key: "clients", label: "Clients", count: null, warningAt: 1500, dangerAt: 3000 },
    { key: "property_units", label: "Property Units", count: null, warningAt: 2000, dangerAt: 5000 },
    { key: "unit_history", label: "Unit History", count: null, warningAt: 15000, dangerAt: 30000 },
    { key: "import_rows", label: "Import Rows", count: null, warningAt: 25000, dangerAt: 50000 },
    { key: "activity_logs", label: "Activity Logs", count: null, warningAt: 25000, dangerAt: 50000 },
  ],
};

const roleOptions: {
  value: WorkspaceRole;
  label: string;
  description: string;
}[] = [
  {
    value: "owner",
    label: "Owner",
    description:
      "Full access to all tools, settings, users, and business data.",
  },
  {
    value: "admin",
    label: "Admin",
    description:
      "Full operations access, useful for trusted office staff.",
  },
  {
    value: "accountant",
    label: "Accountant",
    description:
      "Finance, invoice, client, activity, and reporting access.",
  },
  {
    value: "property_manager",
    label: "Property Manager",
    description:
      "Queue intake and property reporting access without internal financial tools.",
  },
  {
    value: "member",
    label: "Member",
    description:
      "Minimal access while a role is being decided.",
  },
];

function formatCurrency(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "No default set";
  }

  return `$${amount.toFixed(2)}`;
}

function formatRole(value: string) {
  return roleOptions.find(
    (role) => role.value === normalizeWorkspaceRole(value)
  )?.label ?? "Member";
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "Needs setup";
  }

  return value.toLocaleString("en-US");
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "Needs SQL helper";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("en-US")} KB`;
}

function getHealthTone(metric: StorageMetric) {
  const count = metric.count ?? 0;

  if (count >= metric.dangerAt) {
    return {
      label: "Watch closely",
      className: "border-red-200 bg-red-50 text-red-900",
      barClassName: "bg-red-500",
    };
  }

  if (count >= metric.warningAt) {
    return {
      label: "Growing",
      className: "border-amber-200 bg-amber-50 text-amber-950",
      barClassName: "bg-amber-400",
    };
  }

  return {
    label: "Healthy",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    barClassName: "bg-emerald-500",
  };
}

function BusinessSettingsPageContent() {
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";
  const returnToParam = searchParams.get("returnTo");
  const returnTo =
    returnToParam?.startsWith("/") &&
    !returnToParam.startsWith("//")
      ? returnToParam
      : null;

  const [business, setBusiness] =
    useState<Business | null>(null);
  const [businessUsers, setBusinessUsers] =
    useState<BusinessUser[]>([]);
  const [accessRequests, setAccessRequests] =
    useState<AccessRequest[]>([]);
  const [propertyUsers, setPropertyUsers] =
    useState<PropertyUser[]>([]);
  const [propertyAccessReady, setPropertyAccessReady] =
    useState(true);
  const [currentEmail, setCurrentEmail] =
    useState<string | null>(null);
  const [currentRole, setCurrentRole] =
    useState<WorkspaceRole>("member");
  const [splitWarningAmount, setSplitWarningAmount] =
    useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    defaultMaintenanceSettings().message
  );
  const [replyToEmail, setReplyToEmail] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [invoiceSubjectTemplate, setInvoiceSubjectTemplate] = useState("");
  const [invoiceBodyTemplate, setInvoiceBodyTemplate] = useState("");
  const [
    paymentReminderSubjectTemplate,
    setPaymentReminderSubjectTemplate,
  ] = useState("");
  const [
    paymentReminderBodyTemplate,
    setPaymentReminderBodyTemplate,
  ] = useState("");
  const [inviteEmail, setInviteEmail] =
    useState("");
  const [inviteRole, setInviteRole] =
    useState<WorkspaceRole>("member");
  const [propertyInviteEmail, setPropertyInviteEmail] =
    useState("");
  const [propertyInviteName, setPropertyInviteName] =
    useState("North Creek Apartments");
  const [propertyInviteRole, setPropertyInviteRole] =
    useState("property_manager");
  const [propertyCanCreate, setPropertyCanCreate] =
    useState(true);
  const [propertyCanUpdate, setPropertyCanUpdate] =
    useState(true);
  const [propertyCanReports, setPropertyCanReports] =
    useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);
  const [storageHealth, setStorageHealth] =
    useState<StorageHealth>(emptyStorageHealth);
  const [loadingStorageHealth, setLoadingStorageHealth] = useState(false);
  const [savingInvite, setSavingInvite] =
    useState(false);
  const [savingPropertyInvite, setSavingPropertyInvite] =
    useState(false);
  const [updatingUserId, setUpdatingUserId] =
    useState<string | null>(null);
  const [updatingAccessRequestId, setUpdatingAccessRequestId] =
    useState<string | null>(null);
  const [updatingPropertyUserId, setUpdatingPropertyUserId] =
    useState<string | null>(null);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const canManageUsers =
    currentRole === "owner" ||
    currentRole === "admin";

  async function loadStorageHealth(selectedBusinessSlug: string) {
    setLoadingStorageHealth(true);

    const { data, error } = await supabase.rpc(
      "get_trimax_storage_health",
      {
        requested_business_slug: selectedBusinessSlug,
      }
    );

    setLoadingStorageHealth(false);

    if (error || !data) {
      console.warn(
        "Storage health helper is not ready yet.",
        error
      );
      setStorageHealth({
        ...emptyStorageHealth,
        lastCheckedAt: new Date().toISOString(),
      });
      return;
    }

    const rows = Array.isArray(data) ? data : [data];
    const row = rows[0] as StorageHealthRpcRow | undefined;

    if (!row) {
      setStorageHealth({
        ...emptyStorageHealth,
        lastCheckedAt: new Date().toISOString(),
      });
      return;
    }

    setStorageHealth({
      databaseSizeBytes: toNumber(row.database_size_bytes),
      databaseSizeLimitBytes: freeDatabaseLimitBytes,
      helperReady: true,
      lastCheckedAt: new Date().toISOString(),
      metrics: [
        {
          key: "invoices",
          label: "Invoices",
          count: toNumber(row.invoice_count),
          warningAt: 7500,
          dangerAt: 12000,
        },
        {
          key: "estimates",
          label: "Estimates",
          count: toNumber(row.estimate_count),
          warningAt: 7500,
          dangerAt: 12000,
        },
        {
          key: "queue_items",
          label: "Queue Items",
          count: toNumber(row.queue_count),
          warningAt: 12000,
          dangerAt: 20000,
        },
        {
          key: "clients",
          label: "Clients",
          count: toNumber(row.client_count),
          warningAt: 1500,
          dangerAt: 3000,
        },
        {
          key: "property_units",
          label: "Property Units",
          count: toNumber(row.property_unit_count),
          warningAt: 2000,
          dangerAt: 5000,
        },
        {
          key: "unit_history",
          label: "Unit History",
          count: toNumber(row.unit_history_count),
          warningAt: 15000,
          dangerAt: 30000,
        },
        {
          key: "import_rows",
          label: "Import Rows",
          count: toNumber(row.import_row_count),
          warningAt: 25000,
          dangerAt: 50000,
        },
        {
          key: "activity_logs",
          label: "Activity Logs",
          count: toNumber(row.activity_log_count),
          warningAt: 25000,
          dangerAt: 50000,
        },
        {
          key: "import_batches",
          label: "Import Batches",
          count: toNumber(row.import_batch_count),
          warningAt: 500,
          dangerAt: 1000,
        },
      ],
    });
  }

  async function loadSettings() {
    setLoading(true);
    setToast(null);
    setPropertyAccessReady(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setCurrentEmail(user?.email ?? null);

    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", businessSlug)
      .single();

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to load selected business.",
      });

      setLoading(false);
      return;
    }

    const selectedBusiness = data as Business;
    const access = await loadWorkspaceAccess();
    const matchingAccess = access.find(
      (workspace) =>
        workspace.businessSlug === businessSlug
    );

    setCurrentRole(
      normalizeWorkspaceRole(
        matchingAccess?.role ?? "member"
      )
    );
    const normalizedRole = normalizeWorkspaceRole(
      matchingAccess?.role ?? "member"
    );

    if (normalizedRole === "owner" || normalizedRole === "admin") {
      void loadStorageHealth(businessSlug);
    } else {
      setStorageHealth(emptyStorageHealth);
    }

    const maintenance = await loadMaintenanceSettings();
    setMaintenanceMode(maintenance.enabled);
    setMaintenanceMessage(maintenance.message);

    const fallbackEmailSettings = defaultInvoiceEmailSettings({
      businessSlug,
      businessName: selectedBusiness.name,
      currentEmail: user?.email ?? null,
    });

    const {
      data: emailSettingsRow,
      error: emailSettingsError,
    } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", emailSettingsKey(businessSlug))
      .maybeSingle<{ value: unknown }>();

    if (emailSettingsError) {
      console.warn(
        "Email settings are not ready yet.",
        emailSettingsError
      );
    }

    const emailSettings = normalizeInvoiceEmailSettings(
      emailSettingsRow?.value,
      fallbackEmailSettings
    );

    setReplyToEmail(emailSettings.replyToEmail);
    setEmailSignature(emailSettings.signature);
    setInvoiceSubjectTemplate(emailSettings.invoiceSubjectTemplate);
    setInvoiceBodyTemplate(emailSettings.invoiceBodyTemplate);
    setPaymentReminderSubjectTemplate(
      emailSettings.paymentReminderSubjectTemplate
    );
    setPaymentReminderBodyTemplate(
      emailSettings.paymentReminderBodyTemplate
    );

    setBusiness(selectedBusiness);
    setSplitWarningAmount(
      selectedBusiness.split_warning_amount ===
        null ||
        selectedBusiness.split_warning_amount ===
          undefined
        ? ""
        : String(
            selectedBusiness.split_warning_amount
          )
    );

    const {
      data: userRows,
      error: usersError,
    } = await supabase
      .from("business_users")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: true });

    if (usersError) {
      console.error(usersError);

      setToast({
        type: "error",
        message:
          "Unable to load workspace users.",
      });
    } else {
      setBusinessUsers(
        (userRows ?? []) as BusinessUser[]
      );
    }

    const {
      data: requestRows,
      error: requestRowsError,
    } = await supabase
      .from("access_requests")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("created_at", { ascending: false });

    if (requestRowsError) {
      console.warn(
        "Access request table is not ready yet.",
        requestRowsError
      );
      setAccessRequests([]);
    } else {
      setAccessRequests(
        (requestRows ?? []) as AccessRequest[]
      );
    }

    const {
      data: propertyRows,
      error: propertyUsersError,
    } = await supabase
      .from("property_users")
      .select("*")
      .eq("business_id", selectedBusiness.id)
      .order("property_name", { ascending: true })
      .order("created_at", { ascending: true });

    if (propertyUsersError) {
      console.warn(
        "Property team table is not ready yet.",
        propertyUsersError
      );
      setPropertyAccessReady(false);
      setPropertyUsers([]);
    } else {
      setPropertyAccessReady(true);
      setPropertyUsers(
        (propertyRows ?? []) as PropertyUser[]
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(loadSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessSlug]);

  useEffect(() => {
    if (loading || window.location.hash !== "#outlook-integration") {
      return;
    }

    window.setTimeout(() => {
      document
        .getElementById("outlook-integration")
        ?.scrollIntoView({ block: "start" });
    }, 50);
  }, [loading]);

  async function handleSave() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

    const trimmedAmount =
      splitWarningAmount.trim();

    const nextAmount =
      trimmedAmount === ""
        ? null
        : Number(trimmedAmount);

    if (
      nextAmount !== null &&
      (!Number.isFinite(nextAmount) ||
        nextAmount <= 0)
    ) {
      setToast({
        type: "error",
        message:
          "Enter a positive amount, or leave it blank to turn off the default warning.",
      });

      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("businesses")
      .update({
        split_warning_amount: nextAmount,
      })
      .eq("id", business.id)
      .select("*")
      .single();

    setSaving(false);

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to save business settings.",
      });

      return;
    }

    const updatedBusiness = data as Business;

    setBusiness(updatedBusiness);
    setSplitWarningAmount(
      updatedBusiness.split_warning_amount === null ||
        updatedBusiness.split_warning_amount ===
          undefined
        ? ""
        : String(
            updatedBusiness.split_warning_amount
          )
    );

    setToast({
      type: "success",
      message: "Business settings saved.",
    });
  }

  async function handleSaveMaintenanceMode() {
    setToast(null);

    if (!canManageUsers) {
      setToast({
        type: "error",
        message: "Only owners and admins can change Maintenance Mode.",
      });
      return;
    }

    const message =
      maintenanceMessage.trim() || defaultMaintenanceSettings().message;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setSavingMaintenance(true);

    const { error } = await supabase.from("app_settings").upsert(
      [
        {
          key: "maintenance_mode",
          value: maintenanceMode,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        {
          key: "maintenance_message",
          value: message,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
      ],
      {
        onConflict: "key",
      }
    );

    setSavingMaintenance(false);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to save Maintenance Mode. Run the app_settings SQL if this is the first setup.",
      });
      return;
    }

    setMaintenanceMessage(message);
    setToast({
      type: "success",
      message: maintenanceMode
        ? "Maintenance Mode is on. Normal users are paused."
        : "Maintenance Mode is off. Normal users can use Trimax again.",
    });
  }

  async function handleSaveEmailSettings() {
    setToast(null);

    if (!business || !canManageUsers) {
      setToast({
        type: "error",
        message: "Only owners and admins can change email settings.",
      });
      return;
    }

    const replyTo = replyToEmail.trim().toLowerCase();

    if (replyTo && !replyTo.includes("@")) {
      setToast({
        type: "error",
        message: "Enter a valid reply-to email address, or leave it blank.",
      });
      return;
    }

    const fallbackEmailSettings = defaultInvoiceEmailSettings({
      businessSlug,
      businessName: business.name,
      currentEmail,
    });
    const nextSettings = {
      replyToEmail: replyTo,
      signature: emailSignature.trim() || fallbackEmailSettings.signature,
      invoiceSubjectTemplate:
        invoiceSubjectTemplate.trim() ||
        fallbackEmailSettings.invoiceSubjectTemplate,
      invoiceBodyTemplate:
        invoiceBodyTemplate.trim() || fallbackEmailSettings.invoiceBodyTemplate,
      paymentReminderSubjectTemplate:
        paymentReminderSubjectTemplate.trim() ||
        fallbackEmailSettings.paymentReminderSubjectTemplate,
      paymentReminderBodyTemplate:
        paymentReminderBodyTemplate.trim() ||
        fallbackEmailSettings.paymentReminderBodyTemplate,
    };
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setSavingEmailSettings(true);

    const { error } = await supabase.from("app_settings").upsert(
      {
        key: emailSettingsKey(businessSlug),
        value: nextSettings,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      {
        onConflict: "key",
      }
    );

    setSavingEmailSettings(false);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to save email settings. Check the app_settings setup if this is the first time.",
      });
      return;
    }

    setReplyToEmail(nextSettings.replyToEmail);
    setEmailSignature(nextSettings.signature);
    setInvoiceSubjectTemplate(nextSettings.invoiceSubjectTemplate);
    setInvoiceBodyTemplate(nextSettings.invoiceBodyTemplate);
    setPaymentReminderSubjectTemplate(
      nextSettings.paymentReminderSubjectTemplate
    );
    setPaymentReminderBodyTemplate(nextSettings.paymentReminderBodyTemplate);
    setToast({
      type: "success",
      message: "Email settings saved.",
    });
  }

  async function handleInviteUser() {
    setToast(null);

    if (!business || !canManageUsers) {
      return;
    }

    const email = inviteEmail.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      setToast({
        type: "error",
        message:
          "Enter the email address for this workspace user.",
      });

      return;
    }

    setSavingInvite(true);

    const { error } = await supabase
      .from("business_users")
      .upsert(
        {
          business_id: business.id,
          user_id: null,
          email,
          role: inviteRole,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "business_id,email",
        }
      );

    setSavingInvite(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to save this invite. The workspace invite setup may still need to be completed.",
      });

      return;
    }

    setInviteEmail("");
    setInviteRole("member");

    await loadSettings();

    setToast({
      type: "success",
      message:
        "Workspace invite saved. When you are ready, create or invite that same email in Authentication so they can sign in.",
    });
  }

  async function handleAccessRequestStatus(
    request: AccessRequest,
    nextStatus: AccessRequest["status"]
  ) {
    if (!canManageUsers) {
      return;
    }

    setToast(null);
    setUpdatingAccessRequestId(request.id);

    const { error } = await supabase
      .from("access_requests")
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by_email: currentEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    setUpdatingAccessRequestId(null);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to update this access request.",
      });
      return;
    }

    await loadSettings();

    setToast({
      type: "success",
      message: "Access request updated.",
    });
  }

  async function handlePrepareInviteFromRequest(
    request: AccessRequest
  ) {
    if (!canManageUsers) {
      return;
    }

    setInviteEmail(request.requester_email);
    setInviteRole("member");

    if (request.status === "new") {
      await handleAccessRequestStatus(
        request,
        "reviewed"
      );
    }

    window.setTimeout(() => {
      document
        .getElementById("add-workspace-user")
        ?.scrollIntoView({ block: "start" });
    }, 50);

    setToast({
      type: "success",
      message:
        "Email copied into Add Workspace User. Choose the role, then click Add User.",
    });
  }

  async function handleAddPropertyUser() {
    setToast(null);

    if (!business || !canManageUsers) {
      return;
    }

    if (!propertyAccessReady) {
      setToast({
        type: "error",
        message:
          "Property portal setup is not ready yet. Complete the portal setup before adding property staff.",
      });
      return;
    }

    const email = propertyInviteEmail.trim().toLowerCase();
    const propertyName = propertyInviteName.trim();

    if (!email || !email.includes("@")) {
      setToast({
        type: "error",
        message:
          "Enter the email address for this property team member.",
      });
      return;
    }

    if (!propertyName) {
      setToast({
        type: "error",
        message: "Enter the property name for this portal access.",
      });
      return;
    }

    setSavingPropertyInvite(true);

    const { error: workspaceError } = await supabase
      .from("business_users")
      .upsert(
        {
          business_id: business.id,
          user_id: null,
          email,
          role: "property_manager",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "business_id,email",
        }
      );

    const { error: propertyError } = await supabase
      .from("property_users")
      .upsert(
        {
          business_id: business.id,
          user_id: null,
          email,
          property_name: propertyName,
          role: propertyInviteRole,
          can_create_queue_items: propertyCanCreate,
          can_update_queue_items: propertyCanUpdate,
          can_view_reports: propertyCanReports,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "business_id,email,property_name",
        }
      );

    setSavingPropertyInvite(false);

    if (workspaceError || propertyError) {
      console.error(workspaceError ?? propertyError);

      setToast({
        type: "error",
        message:
          "Unable to save this property team member. The property portal setup may still need to be completed.",
      });
      return;
    }

    setPropertyInviteEmail("");
    setPropertyInviteRole("property_manager");
    setPropertyCanCreate(true);
    setPropertyCanUpdate(true);
    setPropertyCanReports(true);

    await loadSettings();

    setToast({
      type: "success",
      message:
        "Property portal access saved. This user is limited to the selected property tools.",
    });
  }

  async function handleRemovePropertyUser(
    userRow: PropertyUser
  ) {
    if (!canManageUsers) {
      return;
    }

    setToast(null);
    setUpdatingPropertyUserId(userRow.id);

    const { error } = await supabase
      .from("property_users")
      .delete()
      .eq("id", userRow.id);

    setUpdatingPropertyUserId(null);

    if (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Unable to remove this property team member.",
      });
      return;
    }

    await loadSettings();

    setToast({
      type: "success",
      message: "Property portal access removed.",
    });
  }

  async function handleRoleChange(
    userRow: BusinessUser,
    nextRole: WorkspaceRole
  ) {
    setToast(null);
    setUpdatingUserId(userRow.id);

    const { error } = await supabase
      .from("business_users")
      .update({
        role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userRow.id);

    setUpdatingUserId(null);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to update this user's role.",
      });

      return;
    }

    await loadSettings();

    setToast({
      type: "success",
      message: "Workspace role updated.",
    });
  }

  async function handleRemoveUser(
    userRow: BusinessUser
  ) {
    if (!canManageUsers) {
      return;
    }

    const isCurrentUser =
      currentEmail?.toLowerCase() ===
      userRow.email.toLowerCase();

    if (isCurrentUser) {
      setToast({
        type: "error",
        message:
          "Do not remove your own access from inside the app.",
      });

      return;
    }

    setToast(null);
    setUpdatingUserId(userRow.id);

    const { error } = await supabase
      .from("business_users")
      .delete()
      .eq("id", userRow.id);

    setUpdatingUserId(null);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to remove this workspace user.",
      });

      return;
    }

    await loadSettings();

    setToast({
      type: "success",
      message: "Workspace user removed.",
    });
  }

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="space-y-6">
        <div>
          {returnTo ? (
            <Link
              href={returnTo}
              className="mb-4 inline-flex rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
            >
              Back to document
            </Link>
          ) : null}

          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Settings
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage defaults and workspace access for{" "}
            {business?.name ?? "this business"}.
          </p>
        </div>

        {loading ? (
          <Card>
            <p className="text-zinc-400">
              Loading settings...
            </p>
          </Card>
        ) : (
          <>
            {canManageUsers ? (
              <Card
                className={
                  maintenanceMode
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-emerald-500/30 bg-emerald-500/5"
                }
              >
                <div className="grid gap-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                        Deployment Safety
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        Maintenance Mode
                      </h2>
                      <p className="mt-2 max-w-3xl text-zinc-400">
                        Pause normal users while you deploy code, run Supabase
                        SQL, or test a risky update. Owners and admins can
                        still use Trimax.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
                      <p className="text-zinc-500">Current Status</p>
                      <p
                        className={
                          maintenanceMode
                            ? "mt-1 font-bold text-orange-300"
                            : "mt-1 font-bold text-emerald-300"
                        }
                      >
                        {maintenanceMode ? "ON" : "OFF"}
                      </p>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(event) =>
                        setMaintenanceMode(event.target.checked)
                      }
                      className="h-5 w-5 accent-orange-500"
                    />
                    <span className="font-semibold">
                      Turn Maintenance Mode {maintenanceMode ? "ON" : "OFF"}
                    </span>
                  </label>

                  <InputField
                    label="Maintenance Message"
                    value={maintenanceMessage}
                    onChange={setMaintenanceMessage}
                    placeholder={defaultMaintenanceSettings().message}
                  />

                  <Button
                    onClick={handleSaveMaintenanceMode}
                    disabled={savingMaintenance}
                  >
                    {savingMaintenance
                      ? "Saving..."
                      : "Save Maintenance Mode"}
                  </Button>
                </div>
              </Card>
            ) : null}

            {canManageUsers ? (
              <Card className="border-sky-200 bg-white">
                <div className="grid gap-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-sky-600">
                        Storage Health
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                        Import readiness and data size
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        Use this before FreshBooks imports. Trimax checks record
                        counts for this workspace and the overall Supabase
                        database size so you can see when storage is still
                        comfortable or when an upgrade plan is needed.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => loadStorageHealth(businessSlug)}
                      disabled={loadingStorageHealth}
                    >
                      {loadingStorageHealth ? "Checking..." : "Refresh Health"}
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-sky-900">
                            Supabase database size
                          </p>
                          <p className="mt-2 text-3xl font-black text-slate-950">
                            {formatBytes(storageHealth.databaseSizeBytes)}
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-slate-600">
                          Free plan guide:{" "}
                          {formatBytes(storageHealth.databaseSizeLimitBytes)}
                        </p>
                      </div>

                      <div className="mt-5 h-3 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{
                            width: `${
                              storageHealth.databaseSizeBytes === null
                                ? 0
                                : Math.min(
                                    100,
                                    Math.round(
                                      (storageHealth.databaseSizeBytes /
                                        storageHealth.databaseSizeLimitBytes) *
                                        100
                                    )
                                  )
                            }%`,
                          }}
                        />
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {storageHealth.helperReady
                          ? "Exact size is available. Text records usually grow slowly; uploaded photos and PDFs grow much faster."
                          : "Run the Storage Health SQL helper once to unlock exact database size and counts."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                      <p className="text-sm font-semibold text-emerald-900">
                        FreshBooks import advice
                      </p>
                      <p className="mt-2 text-2xl font-black text-emerald-950">
                        Safe to stage first
                      </p>
                      <p className="mt-3 text-sm leading-6 text-emerald-900">
                        Import clients first, then a small invoice sample, then
                        the full invoice CSV after the sample looks correct.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {storageHealth.metrics.map((metric) => {
                      const tone = getHealthTone(metric);
                      const percent =
                        metric.count === null
                          ? 0
                          : Math.min(
                              100,
                              Math.round((metric.count / metric.dangerAt) * 100)
                            );

                      return (
                        <div
                          key={metric.key}
                          className={`rounded-2xl border p-4 ${tone.className}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                {metric.label}
                              </p>
                              <p className="mt-2 text-3xl font-black">
                                {formatNumber(metric.count)}
                              </p>
                            </div>

                            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold">
                              {tone.label}
                            </span>
                          </div>

                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
                            <div
                              className={`h-full rounded-full ${tone.barClassName}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          <p className="mt-3 text-xs font-semibold opacity-75">
                            Warning near {metric.warningAt.toLocaleString("en-US")} records
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    This is a planning panel, not a billing guarantee. Supabase
                    limits can change by plan, and file uploads will matter more
                    once Trimax stores photos, PDFs, or attachments.
                    {storageHealth.lastCheckedAt ? (
                      <>
                        {" "}
                        Last checked{" "}
                        {new Date(storageHealth.lastCheckedAt).toLocaleString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          }
                        )}
                        .
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            <Card>
              <div className="grid gap-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Split Warning
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Default Split Warning Amount
                  </h2>

                  <p className="mt-2 max-w-3xl text-zinc-400">
                    This is the default amount Trimax
                    uses when a job has split warnings
                    turned on. Leave it blank for a
                    business that does not need split
                    warnings by default.
                  </p>
                </div>

                <InputField
                  label="Default Split Warning Amount"
                  type="number"
                  placeholder="Example: 1300"
                  value={splitWarningAmount}
                  onChange={setSplitWarningAmount}
                />

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                  <p className="text-sm text-zinc-400">
                    Current Default
                  </p>

                  <p className="mt-2 text-2xl font-semibold text-orange-400">
                    {formatCurrency(
                      splitWarningAmount
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSave}>
                    {saving
                      ? "Saving..."
                      : "Save Settings"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card
              id="outlook-integration"
              className="scroll-mt-6 border-blue-200 bg-white"
            >
              <div className="grid gap-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
                    Customer Email
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Email Customization
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Set the reply-to address, message templates, and signature
                    Trimax uses when sending invoices. This is the FreshBooks
                    idea, but kept Trimax-branded and under your control.
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  Direct sending still needs a verified email sender before
                  live messages leave Trimax. Until then, the invoice page can
                  preview the exact customer-facing message safely.
                </div>

                <InputField
                  label="Reply-to Email Address"
                  type="email"
                  placeholder="Example: robbie@rnlcreations.com"
                  value={replyToEmail}
                  onChange={setReplyToEmail}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">
                      New Invoice Template
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Used when you send an invoice from Trimax.
                    </p>

                    <div className="mt-4 grid gap-4">
                      <InputField
                        label="Subject"
                        value={invoiceSubjectTemplate}
                        onChange={setInvoiceSubjectTemplate}
                        placeholder="{businessName} sent you invoice {invoiceNumber}"
                      />

                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        Body
                        <textarea
                          value={invoiceBodyTemplate}
                          onChange={(event) =>
                            setInvoiceBodyTemplate(event.target.value)
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          placeholder="{businessName} sent you invoice {invoiceNumber} for {amountDue}."
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">
                      Payment Reminder Template
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Foundation for later reminder automation.
                    </p>

                    <div className="mt-4 grid gap-4">
                      <InputField
                        label="Subject"
                        value={paymentReminderSubjectTemplate}
                        onChange={setPaymentReminderSubjectTemplate}
                        placeholder="Reminder: Invoice {invoiceNumber} is due"
                      />

                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        Body
                        <textarea
                          value={paymentReminderBodyTemplate}
                          onChange={(event) =>
                            setPaymentReminderBodyTemplate(event.target.value)
                          }
                          rows={5}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          placeholder="Your payment of {amountDue} for invoice {invoiceNumber} is due."
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Email Signature
                    <textarea
                      value={emailSignature}
                      onChange={(event) => setEmailSignature(event.target.value)}
                      rows={6}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="Name, title, phone, address"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Dynamic fields you can use:{" "}
                  <span className="font-semibold text-slate-950">
                    {"{businessName}"}, {"{invoiceNumber}"}, {"{amountDue}"},{" "}
                    {"{dueDate}"}, {"{customerName}"}, {"{projectTitle}"}
                  </span>
                </div>

                <Button
                  onClick={handleSaveEmailSettings}
                  disabled={!canManageUsers || savingEmailSettings}
                >
                  {savingEmailSettings ? "Saving..." : "Save Email Settings"}
                </Button>
              </div>
            </Card>

            <Card
              id="phone-app-notifications"
              className="scroll-mt-6 border-green-500/30 bg-green-500/5"
            >
              <div className="grid gap-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-green-300">
                    Phone App
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Install Trimax and prepare notifications
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    Trimax is now prepared to install from the live website like
                    a phone app. After deployment, open Trimax on your phone and
                    add it to the Home Screen. Push notifications can now be
                    enabled per device for new queue request alerts.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-green-500/20 bg-zinc-950 p-4">
                    <p className="text-sm font-semibold text-green-200">
                      1. Deploy Trimax
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Vercel gives Trimax the secure live website address that
                      phones require for app install and notifications.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-sky-500/20 bg-zinc-950 p-4">
                    <p className="text-sm font-semibold text-sky-200">
                      2. Add To Home Screen
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      On iPhone, open the live site in Safari, tap Share, then
                      choose Add to Home Screen. Android can install from
                      Chrome.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-orange-500/20 bg-zinc-950 p-4">
                    <p className="text-sm font-semibold text-orange-200">
                      3. Enable Alerts
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Use the button below on each phone or browser that should
                      receive queue request alerts.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                  <p className="text-sm font-semibold text-white">
                    Current Status
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Install support, notification storage, and server-side
                    sending are connected. Enable each device once, then test by
                    creating a queue request.
                  </p>
                </div>

                <PushNotificationSetup
                  businessId={business?.id}
                  businessSlug={businessSlug}
                />
              </div>
            </Card>

            <Card>
              <div className="grid gap-6">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                    Workspace Access
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Users and Roles
                  </h2>

                  <p className="mt-2 max-w-3xl text-zinc-400">
                    Trimax is invite-only. A person
                    should only appear here if you want
                    them to access this business
                    workspace.
                  </p>
                </div>

                <div className="grid gap-4 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold">
                        Access Requests
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        Requests come from the public
                        login page. Review them here,
                        then manually add the person only
                        if they should receive workspace
                        access.
                      </p>
                    </div>

                    <Link
                      href={`/request-access?business=${businessSlug}`}
                      className="inline-flex rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
                    >
                      Open Request Form
                    </Link>
                  </div>

                  {accessRequests.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                      No access requests are waiting for
                      this workspace.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {accessRequests.map((request) => {
                        const isUpdating =
                          updatingAccessRequestId ===
                          request.id;

                        return (
                          <div
                            key={request.id}
                            className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-semibold text-white">
                                    {request.requester_name}
                                  </p>

                                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">
                                    {request.status}
                                  </span>
                                </div>

                                <p className="mt-1 break-all text-sm text-zinc-300">
                                  {request.requester_email}
                                </p>

                                <p className="mt-1 text-sm text-zinc-500">
                                  Requested{" "}
                                  {formatDate(
                                    request.created_at
                                  )}
                                </p>
                              </div>

                              {canManageUsers ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePrepareInviteFromRequest(
                                        request
                                      )
                                    }
                                    disabled={isUpdating}
                                    className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Prepare Invite
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAccessRequestStatus(
                                        request,
                                        "reviewed"
                                      )
                                    }
                                    disabled={isUpdating}
                                    className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Mark Reviewed
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAccessRequestStatus(
                                        request,
                                        "declined"
                                      )
                                    }
                                    disabled={isUpdating}
                                    className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Decline
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {request.company_or_property ? (
                              <p className="rounded-2xl border border-zinc-800 bg-black/20 p-3 text-sm text-zinc-300">
                                {request.company_or_property}
                              </p>
                            ) : null}

                            {request.message ? (
                              <p className="rounded-2xl border border-zinc-800 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
                                {request.message}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {businessUsers.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">
                    No workspace users are listed yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-800">
                    <div className="hidden grid-cols-[1.5fr_1fr_1fr_auto] gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-400 md:grid">
                      <span>Email</span>
                      <span>Role</span>
                      <span>Added</span>
                      <span className="text-right">
                        Actions
                      </span>
                    </div>

                    <div className="divide-y divide-zinc-800">
                      {businessUsers.map((userRow) => {
                        const isCurrentUser =
                          currentEmail?.toLowerCase() ===
                          userRow.email.toLowerCase();
                        const isPending =
                          !userRow.user_id;

                        return (
                          <div
                            key={userRow.id}
                            className="grid gap-4 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"
                          >
                            <div>
                              <p className="break-all font-semibold text-white">
                                {userRow.email}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {isCurrentUser ? (
                                  <span className="rounded-full bg-orange-500/10 px-3 py-1 text-orange-300">
                                    You
                                  </span>
                                ) : null}

                                {isPending ? (
                                  <span className="rounded-full bg-purple-500/10 px-3 py-1 text-purple-300">
                                    Pending Auth User
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-green-300">
                                    Active
                                  </span>
                                )}
                              </div>
                            </div>

                            {canManageUsers ? (
                              <select
                                value={normalizeWorkspaceRole(
                                  userRow.role
                                )}
                                onChange={(event) =>
                                  handleRoleChange(
                                    userRow,
                                    event.target
                                      .value as WorkspaceRole
                                  )
                                }
                                disabled={
                                  updatingUserId ===
                                  userRow.id
                                }
                                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                              >
                                {roleOptions.map(
                                  (role) => (
                                    <option
                                      key={role.value}
                                      value={role.value}
                                    >
                                      {role.label}
                                    </option>
                                  )
                                )}
                              </select>
                            ) : (
                              <p className="text-zinc-300">
                                {formatRole(userRow.role)}
                              </p>
                            )}

                            <p className="text-sm text-zinc-400">
                              {formatDate(
                                userRow.created_at
                              )}
                            </p>

                            <div className="flex justify-start md:justify-end">
                              {canManageUsers ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveUser(
                                      userRow
                                    )
                                  }
                                  disabled={
                                    updatingUserId ===
                                      userRow.id ||
                                    isCurrentUser
                                  }
                                  className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="text-sm text-zinc-500">
                                  View only
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {canManageUsers ? (
                  <div
                    id="add-workspace-user"
                    className="grid scroll-mt-6 gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                  >
                    <div>
                      <h3 className="text-xl font-semibold">
                        Add Workspace User
                      </h3>

                      <p className="mt-2 text-sm text-zinc-400">
                        Add the email and role first.
                        Then create or invite that same
                        email in Authentication.
                        When they sign in, Trimax will
                        place them in this workspace.
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_260px_auto] md:items-end">
                      <InputField
                        label="Email"
                        type="email"
                        placeholder="person@example.com"
                        value={inviteEmail}
                        onChange={setInviteEmail}
                      />

                      <div>
                        <label className="mb-2 block text-sm text-zinc-400">
                          Role
                        </label>

                        <select
                          value={inviteRole}
                          onChange={(event) =>
                            setInviteRole(
                              event.target
                                .value as WorkspaceRole
                            )
                          }
                          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                        >
                          {roleOptions.map((role) => (
                            <option
                              key={role.value}
                              value={role.value}
                            >
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button onClick={handleInviteUser}>
                        {savingInvite
                          ? "Saving..."
                          : "Add User"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div
                  id="user-role-integration"
                  className="grid scroll-mt-6 gap-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5"
                >
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-blue-300">
                      Property Portal Access
                    </p>

                    <h3 className="mt-2 text-xl font-semibold">
                      Property team members
                    </h3>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                      Use this for property managers, assistant managers,
                      maintenance managers, or other property staff. Trimax
                      will keep them in queue and reports for their property
                      instead of opening the full business workspace.
                    </p>
                  </div>

                  {!propertyAccessReady ? (
                    <div className="app-notice-card rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6 text-amber-950">
                      <p className="font-semibold">
                        Property portal setup needed
                      </p>

                      <p className="mt-2">
                        Property team access is not available yet.
                        Complete the property portal setup before
                        adding property staff.
                      </p>
                    </div>
                  ) : propertyUsers.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                      No property team access has been added yet.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-zinc-800">
                      <div className="hidden grid-cols-[1.2fr_1fr_1fr_auto] gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-400 md:grid">
                        <span>Email</span>
                        <span>Property</span>
                        <span>Access</span>
                        <span className="text-right">Actions</span>
                      </div>

                      <div className="divide-y divide-zinc-800">
                        {propertyUsers.map((userRow) => (
                          <div
                            key={userRow.id}
                            className="grid gap-4 px-4 py-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
                          >
                            <div>
                              <p className="break-all font-semibold text-white">
                                {userRow.email}
                              </p>

                              <p className="mt-1 text-sm text-zinc-500">
                                {userRow.role.replaceAll("_", " ")}
                              </p>
                            </div>

                            <div>
                              <p className="font-semibold">
                                {userRow.property_name}
                              </p>

                              <p className="mt-1 text-xs text-zinc-500">
                                {propertyKey(userRow.property_name)}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs">
                              {userRow.can_create_queue_items ? (
                                <span className="rounded-full bg-green-500/10 px-3 py-1 text-green-300">
                                  Add queue
                                </span>
                              ) : null}

                              {userRow.can_update_queue_items ? (
                                <span className="rounded-full bg-orange-500/10 px-3 py-1 text-orange-300">
                                  Update queue
                                </span>
                              ) : null}

                              {userRow.can_view_reports ? (
                                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-300">
                                  Reports
                                </span>
                              ) : null}
                            </div>

                            <div className="flex justify-start md:justify-end">
                              {canManageUsers ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePropertyUser(userRow)
                                  }
                                  disabled={
                                    updatingPropertyUserId === userRow.id
                                  }
                                  className="rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="text-sm text-zinc-500">
                                  View only
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {canManageUsers ? (
                    <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                      <h3 className="text-lg font-semibold">
                        Add Property Team Member
                      </h3>

                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px] lg:items-end">
                        <InputField
                          label="Email"
                          type="email"
                          placeholder="manager@example.com"
                          value={propertyInviteEmail}
                          onChange={setPropertyInviteEmail}
                        />

                        <InputField
                          label="Property"
                          placeholder="North Creek Apartments"
                          value={propertyInviteName}
                          onChange={setPropertyInviteName}
                        />

                        <div>
                          <label className="mb-2 block text-sm text-zinc-400">
                            Portal Role
                          </label>

                          <select
                            value={propertyInviteRole}
                            onChange={(event) =>
                              setPropertyInviteRole(event.target.value)
                            }
                            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                          >
                            <option value="property_manager">
                              Property Manager
                            </option>
                            <option value="assistant_manager">
                              Assistant Manager
                            </option>
                            <option value="maintenance_manager">
                              Maintenance Manager
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                          <input
                            type="checkbox"
                            checked={propertyCanCreate}
                            onChange={(event) =>
                              setPropertyCanCreate(event.target.checked)
                            }
                            className="mt-1 h-4 w-4 accent-orange-500"
                          />
                          <span>
                            <span className="block font-semibold">
                              Add queue items
                            </span>
                            <span className="text-sm text-zinc-400">
                              Let them submit units.
                            </span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                          <input
                            type="checkbox"
                            checked={propertyCanUpdate}
                            onChange={(event) =>
                              setPropertyCanUpdate(event.target.checked)
                            }
                            className="mt-1 h-4 w-4 accent-orange-500"
                          />
                          <span>
                            <span className="block font-semibold">
                              Update queue
                            </span>
                            <span className="text-sm text-zinc-400">
                              Let them help maintain status info.
                            </span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                          <input
                            type="checkbox"
                            checked={propertyCanReports}
                            onChange={(event) =>
                              setPropertyCanReports(event.target.checked)
                            }
                            className="mt-1 h-4 w-4 accent-orange-500"
                          />
                          <span>
                            <span className="block font-semibold">
                              View reports
                            </span>
                            <span className="text-sm text-zinc-400">
                              Show property-level reports only.
                            </span>
                          </span>
                        </label>
                      </div>

                      <Button
                        onClick={handleAddPropertyUser}
                        disabled={
                          savingPropertyInvite || !propertyAccessReady
                        }
                      >
                        {savingPropertyInvite
                          ? "Saving..."
                          : "Add Property Access"}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {roleOptions.map((role) => (
                    <div
                      key={role.value}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <p className="font-semibold text-white">
                        {role.label}
                      </p>

                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {role.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function BusinessSettingsPage() {
  return (
    <Suspense>
      <BusinessSettingsPageContent />
    </Suspense>
  );
}
