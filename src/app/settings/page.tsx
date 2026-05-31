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
  const [savingInvite, setSavingInvite] =
    useState(false);
  const [savingPropertyInvite, setSavingPropertyInvite] =
    useState(false);
  const [updatingUserId, setUpdatingUserId] =
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
              className="outlook-setup-panel scroll-mt-6 border-sky-500/30 bg-sky-500/10"
            >
              <div className="grid gap-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-sky-200">
                    Outlook Drafts
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    Microsoft Outlook Integration
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-100/90">
                    Trimax will create review-ready Outlook drafts with the PDF
                    attached, using this workspace&apos;s invoice and estimate
                    message templates. You still review and send from Outlook.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="outlook-step-card rounded-2xl border border-sky-500/20 bg-sky-950/50 p-4">
                    <p className="text-sm font-semibold text-sky-100">
                      1. Connect Microsoft
                    </p>
                    <p className="mt-2 text-sm leading-6 text-sky-100/75">
                      Add the Microsoft app ID, secret, and redirect URL in
                      Vercel once the Azure app is registered.
                    </p>
                  </div>

                  <div className="outlook-step-card rounded-2xl border border-sky-500/20 bg-sky-950/50 p-4">
                    <p className="text-sm font-semibold text-sky-100">
                      2. Save Templates
                    </p>
                    <p className="mt-2 text-sm leading-6 text-sky-100/75">
                      Keep separate templates for R&L invoices, R&L estimates,
                      Just Kleen invoices, and follow-up messages.
                    </p>
                  </div>

                  <div className="outlook-step-card rounded-2xl border border-sky-500/20 bg-sky-950/50 p-4">
                    <p className="text-sm font-semibold text-sky-100">
                      3. Create Drafts
                    </p>
                    <p className="mt-2 text-sm leading-6 text-sky-100/75">
                      Invoice and estimate pages now show the exact draft
                      preview that will be handed to Outlook.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                  <p className="text-sm font-semibold text-white">
                    Connection Status
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Not connected yet. The database setup is ready to store
                    workspace templates and Outlook connection records.
                    The actual Microsoft sign-in button will be enabled after
                    the Azure app registration values are added to Vercel.
                  </p>
                </div>
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
                  <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
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
