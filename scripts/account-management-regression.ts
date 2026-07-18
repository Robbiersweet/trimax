import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  isRecentLoginOrSessionError,
  validateNewPassword,
} from "../src/app/lib/accountSecurity.ts";
import { canAccessPath } from "../src/app/lib/rolePermissions.ts";

const root = process.cwd();

assert.equal(canAccessPath("owner", "/profile"), true);
assert.equal(canAccessPath("admin", "/profile"), true);
assert.equal(canAccessPath("accountant", "/profile"), true);
assert.equal(canAccessPath("property_manager", "/profile"), true);
assert.equal(canAccessPath("technician", "/profile"), true);
assert.equal(canAccessPath("vendor", "/profile"), true);
assert.equal(canAccessPath("subcontractor", "/profile"), true);
assert.equal(canAccessPath("cleaner", "/profile"), true);
assert.equal(canAccessPath("flooring_contractor", "/profile"), true);

assert.equal(validateNewPassword("short1").valid, false);
assert.equal(validateNewPassword("lettersOnly").valid, false);
assert.equal(validateNewPassword("ValidPass1").valid, true);
assert.equal(isRecentLoginOrSessionError("JWT expired"), true);
assert.equal(isRecentLoginOrSessionError("Network request failed"), false);

const profilePage = readFileSync(
  resolve(root, "src/app/profile/page.tsx"),
  "utf8"
);
const userMenu = readFileSync(
  resolve(root, "src/app/components/UserMenu.tsx"),
  "utf8"
);
const forgotPasswordPage = readFileSync(
  resolve(root, "src/app/forgot-password/page.tsx"),
  "utf8"
);

assert(
  userMenu.includes('href={`/profile?business=${businessSlug}`}'),
  "Authenticated user menu must link to Profile."
);
assert(
  profilePage.includes("supabase.auth.updateUser({") &&
    profilePage.includes("password: newPassword"),
  "Profile password changes must use Supabase Auth for the signed-in user."
);
assert(
  !profilePage.includes("currentPassword") &&
    !profilePage.includes("oldPassword"),
  "Profile must not request, retrieve, or expose the current password."
);
assert(
  profilePage.indexOf("newPassword !== confirmPassword") <
    profilePage.lastIndexOf("supabase.auth.updateUser({"),
  "Mismatched passwords must be rejected before Supabase submission."
);
assert(
  profilePage.includes("validateNewPassword(newPassword)"),
  "Invalid passwords must be rejected before submission."
);
assert(
  profilePage.includes("isChangingPassword") &&
    profilePage.includes("disabled={!canSubmitPassword}"),
  "Password form must protect against repeated submissions."
);
assert(
  profilePage.includes('action: "user.password_changed"') &&
    !profilePage.includes("details: { password") &&
    !profilePage.includes("details: { newPassword"),
  "Password changes may log only a safe account event, never password values."
);
assert(
  profilePage.includes("For security, sign in again before changing your password.") &&
    profilePage.includes("Your session expired. Sign in again before changing your password."),
  "Expired or stale sessions must be handled safely."
);
assert(
  forgotPasswordPage.includes("/reset-password?business=${businessSlug}") &&
    !forgotPasswordPage.includes("vercel.app"),
  "Recovery redirects must use the current app origin and not a preview URL."
);

console.log("Account management regression checks passed.");
