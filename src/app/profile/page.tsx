"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import {
  isRecentLoginOrSessionError,
  validateNewPassword,
} from "../lib/accountSecurity";
import { logActivity } from "../lib/activityLog";
import { supabase } from "../lib/supabase";
import {
  loadWorkspaceAccess,
  type WorkspaceAccess,
} from "../lib/workspaceAccess";

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type ProfileUser = {
  email: string;
  displayName: string;
};

function formatRole(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDisplayName(metadata: Record<string, unknown> | null | undefined) {
  const displayName =
    typeof metadata?.display_name === "string" ? metadata.display_name : "";
  const fullName =
    typeof metadata?.full_name === "string" ? metadata.full_name : "";
  const name = typeof metadata?.name === "string" ? metadata.name : "";

  return displayName.trim() || fullName.trim() || name.trim();
}

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceAccess[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!isActive) {
        return;
      }

      if (error || !user?.email) {
        setToast({
          type: "error",
          message: "Sign in again to open your account profile.",
        });
        setIsLoading(false);
        return;
      }

      const safeDisplayName = getDisplayName(user.user_metadata);
      const access = await loadWorkspaceAccess();

      if (!isActive) {
        return;
      }

      setProfile({
        email: user.email,
        displayName: safeDisplayName,
      });
      setDisplayName(safeDisplayName);
      setWorkspaces(access);
      setIsLoading(false);
    }

    loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  const currentWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.businessSlug === businessSlug) ??
      workspaces[0] ??
      null,
    [businessSlug, workspaces]
  );
  const passwordValidation = validateNewPassword(newPassword);
  const passwordsMatch =
    newPassword.length === 0 ||
    confirmPassword.length === 0 ||
    newPassword === confirmPassword;
  const canSubmitPassword =
    !isChangingPassword &&
    passwordValidation.valid &&
    newPassword === confirmPassword;
  const canSaveProfile =
    !isSavingProfile &&
    Boolean(profile) &&
    displayName.trim() !== profile?.displayName;

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);

    if (!profile) {
      setToast({
        type: "error",
        message: "Sign in again to update your profile.",
      });
      return;
    }

    const nextDisplayName = displayName.trim();
    setIsSavingProfile(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setIsSavingProfile(false);
      setToast({
        type: "error",
        message: "Your session expired. Sign in again before updating your profile.",
      });
      return;
    }

    const { data, error } = await supabase.auth.updateUser({
      data: {
        display_name: nextDisplayName,
        full_name: nextDisplayName,
      },
    });

    setIsSavingProfile(false);

    if (error) {
      setToast({
        type: "error",
        message: isRecentLoginOrSessionError(error.message)
          ? "For security, sign in again before updating your profile."
          : error.message,
      });
      return;
    }

    const savedDisplayName = getDisplayName(data.user.user_metadata);
    setProfile({
      ...profile,
      displayName: savedDisplayName,
    });
    setDisplayName(savedDisplayName);
    await logActivity({
      businessId: currentWorkspace?.businessId ?? null,
      action: "user.profile_updated",
      entityType: "user_account",
      entityLabel: profile.email,
      details: { fields: ["display_name"] },
    });
    setToast({
      type: "success",
      message: "Profile updated.",
    });
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);

    if (isChangingPassword) {
      return;
    }

    if (!passwordValidation.valid) {
      setToast({
        type: "error",
        message: passwordValidation.issues[0] ?? "Choose a stronger password.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setToast({
        type: "error",
        message: "The two password fields do not match yet.",
      });
      return;
    }

    setIsChangingPassword(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setIsChangingPassword(false);
      setToast({
        type: "error",
        message: "Your session expired. Sign in again before changing your password.",
      });
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setIsChangingPassword(false);

    if (error) {
      setToast({
        type: "error",
        message: isRecentLoginOrSessionError(error.message)
          ? "For security, sign in again before changing your password."
          : error.message,
      });
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    await logActivity({
      businessId: currentWorkspace?.businessId ?? null,
      action: "user.password_changed",
      entityType: "user_account",
      entityLabel: profile?.email ?? "Signed-in user",
    });
    setToast({
      type: "success",
      message: "Password updated successfully.",
    });
  }

  return (
    <AppShell>
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Account
          </p>
          <h1 className="mt-3 text-4xl font-bold">Profile</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Manage your own Trimax account details and password.
          </p>
        </div>

        {isLoading ? (
          <Card>
            <p className="text-sm text-zinc-400">Loading your account...</p>
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-5">
              <Card>
                <div className="grid gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
                      Your Details
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      Account summary
                    </h2>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Display Name
                      </p>
                      <p className="mt-2 break-words text-lg font-black text-white">
                        {profile?.displayName || "Not set"}
                      </p>
                    </div>

                    <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Email
                      </p>
                      <p className="mt-2 break-all text-lg font-black text-white">
                        {profile?.email ?? "Unavailable"}
                      </p>
                    </div>

                    <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Current Role
                      </p>
                      <p className="mt-2 text-lg font-black text-white">
                        {currentWorkspace
                          ? formatRole(currentWorkspace.role)
                          : "Workspace User"}
                      </p>
                    </div>

                    <div className="app-soft-panel rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Business
                      </p>
                      <p className="mt-2 break-words text-lg font-black text-white">
                        {currentWorkspace?.businessName ?? "No workspace listed"}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <form className="grid gap-5" onSubmit={handleProfileSubmit}>
                  <div>
                    <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
                      Profile
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      Display name
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      This updates your own account name only.
                    </p>
                  </div>

                  <InputField
                    label="Display Name"
                    placeholder="Your name"
                    value={displayName}
                    onChange={setDisplayName}
                  />

                  <Button type="submit" disabled={!canSaveProfile}>
                    {isSavingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                </form>
              </Card>
            </div>

            <Card>
              <form className="grid gap-5" onSubmit={handlePasswordSubmit}>
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
                    Security
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    Change password
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Choose a new password for your signed-in account.
                  </p>
                </div>

                <InputField
                  type="password"
                  label="New Password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={setNewPassword}
                  helperText="Use at least 8 characters with a letter and a number or symbol."
                />

                <InputField
                  type="password"
                  label="Confirm New Password"
                  placeholder="Retype new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />

                <div className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-400">
                  <p className="font-semibold text-white">Password requirements</p>
                  <p>At least 8 characters</p>
                  <p>At least one letter</p>
                  <p>At least one number or symbol</p>
                  {!passwordsMatch ? (
                    <p className="font-semibold text-amber-200">
                      The two password fields do not match yet.
                    </p>
                  ) : null}
                </div>

                <Button type="submit" disabled={!canSubmitPassword}>
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </Button>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-400">
                  If Trimax asks for a fresh sign-in, use the existing recovery
                  flow or sign in again before changing your password.
                  <Link
                    href={`/forgot-password?business=${businessSlug}`}
                    className="mt-3 block font-semibold text-orange-400 transition hover:text-orange-300"
                  >
                    Forgot password?
                  </Link>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageContent />
    </Suspense>
  );
}
