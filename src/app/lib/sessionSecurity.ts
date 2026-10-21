const ACTIVE_BROWSER_SESSION_KEY = "trimax.activeBrowserSession";
const SESSION_STARTED_AT_KEY = "trimax.sessionStartedAt";
const LAST_ACTIVITY_AT_KEY = "trimax.lastActivityAt";
const SESSION_USER_KEY = "trimax.sessionUserId";

export const SESSION_IDLE_TIMEOUT_MS = 45 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export type SessionSecurityReason =
  | "new-browser-session"
  | "idle-timeout"
  | "session-expired"
  | "manual-lock";

export type SessionSecurityStatus =
  | {
      valid: true;
    }
  | {
      valid: false;
      reason: SessionSecurityReason;
    };

export type SessionSecuritySnapshot = {
  hasSecureSession: boolean;
  idleRemainingMs: number;
  sessionRemainingMs: number;
};

function nowMs() {
  return Date.now();
}

function readNumber(key: string) {
  const value = window.localStorage.getItem(key);
  const parsed = value ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function startSecureBrowserSession(userId?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const now = String(nowMs());

  window.sessionStorage.setItem(ACTIVE_BROWSER_SESSION_KEY, "true");
  if (userId) window.localStorage.setItem(SESSION_USER_KEY, userId);
  else window.localStorage.removeItem(SESSION_USER_KEY);
  window.localStorage.setItem(SESSION_STARTED_AT_KEY, now);
  window.localStorage.setItem(LAST_ACTIVITY_AT_KEY, now);
}

export function recordSecureActivity() {
  if (typeof window === "undefined") {
    return;
  }

  if (
    window.sessionStorage.getItem(ACTIVE_BROWSER_SESSION_KEY) !==
    "true"
  ) {
    return;
  }

  // Input arriving after expiry must not revive an expired security lease.
  if (!getSessionSecurityStatus().valid) return;

  window.localStorage.setItem(
    LAST_ACTIVITY_AT_KEY,
    String(nowMs())
  );
}

export function clearSecureBrowserSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ACTIVE_BROWSER_SESSION_KEY);
  window.localStorage.removeItem(SESSION_STARTED_AT_KEY);
  window.localStorage.removeItem(LAST_ACTIVITY_AT_KEY);
  window.localStorage.removeItem(SESSION_USER_KEY);
}

/** An unverified tab must not revoke another tab's session.
 * It requires verified restoration of an existing lease or the normal login flow. Genuine
 * expiry/manual lock still clears shared state and revokes Auth as before. */
export async function expireSecureBrowserSession(
  reason: string,
  signOut: () => Promise<unknown>
) {
  if (reason === "new-browser-session") return;
  clearSecureBrowserSession();
  await signOut();
}

export function getSessionSecurityStatus(authenticatedUserId?: string): SessionSecurityStatus {
  if (typeof window === "undefined") {
    return { valid: true };
  }

  if (
    window.sessionStorage.getItem(ACTIVE_BROWSER_SESSION_KEY) !==
    "true"
  ) {
    return {
      valid: false,
      reason: "new-browser-session",
    };
  }

  const owner = window.localStorage.getItem(SESSION_USER_KEY);
  if (authenticatedUserId && owner && owner !== authenticatedUserId) return {valid:false,reason:"new-browser-session"};
  return persistedSessionStatus();
}

function persistedSessionStatus(): SessionSecurityStatus {
  const now = nowMs();
  const sessionStartedAt = readNumber(SESSION_STARTED_AT_KEY);
  const lastActivityAt = readNumber(LAST_ACTIVITY_AT_KEY);

  if (
    !lastActivityAt ||
    now - lastActivityAt > SESSION_IDLE_TIMEOUT_MS
  ) {
    return {
      valid: false,
      reason: "idle-timeout",
    };
  }

  if (
    !sessionStartedAt ||
    now - sessionStartedAt > SESSION_ABSOLUTE_TIMEOUT_MS
  ) {
    return {
      valid: false,
      reason: "session-expired",
    };
  }

  return { valid: true };
}

/** Adopt an existing unexpired lease only after Supabase verifies the user.
 * Restoring a tab never renews the idle or absolute security deadline. */
export function restoreSecureBrowserSession(verifiedUserId: string): SessionSecurityStatus {
  if (typeof window === "undefined" || !verifiedUserId) return {valid:false,reason:"new-browser-session"};
  if (readNumber(SESSION_STARTED_AT_KEY) === null || readNumber(LAST_ACTIVITY_AT_KEY) === null) return {valid:false,reason:"new-browser-session"};
  const owner = window.localStorage.getItem(SESSION_USER_KEY);
  if (owner && owner !== verifiedUserId) return {valid:false,reason:"new-browser-session"};
  const status = persistedSessionStatus();
  if (!status.valid) return status;
  window.sessionStorage.setItem(ACTIVE_BROWSER_SESSION_KEY, "true");
  // Existing pre-upgrade leases can be bound once to the authenticated user.
  if (!owner) window.localStorage.setItem(SESSION_USER_KEY, verifiedUserId);
  return {valid:true};
}

export function getSessionSecuritySnapshot(): SessionSecuritySnapshot {
  if (typeof window === "undefined") {
    return {
      hasSecureSession: false,
      idleRemainingMs: 0,
      sessionRemainingMs: 0,
    };
  }

  const now = nowMs();
  const sessionStartedAt = readNumber(SESSION_STARTED_AT_KEY);
  const lastActivityAt = readNumber(LAST_ACTIVITY_AT_KEY);
  const hasSecureSession =
    window.sessionStorage.getItem(ACTIVE_BROWSER_SESSION_KEY) ===
    "true" && getSessionSecurityStatus().valid;

  return {
    hasSecureSession,
    idleRemainingMs: lastActivityAt
      ? Math.max(SESSION_IDLE_TIMEOUT_MS - (now - lastActivityAt), 0)
      : 0,
    sessionRemainingMs: sessionStartedAt
      ? Math.max(
          SESSION_ABSOLUTE_TIMEOUT_MS - (now - sessionStartedAt),
          0
        )
      : 0,
  };
}

export function sessionSecurityMessage(
  reason: string | null
) {
  if (reason === "idle-timeout") {
    return "You were signed out after 45 minutes without activity.";
  }

  if (reason === "session-expired") {
    return "You were signed out because the secure session expired.";
  }

  if (reason === "new-browser-session") {
    return "Your saved secure session could not be restored. Sign in to continue.";
  }

  if (reason === "manual-lock") {
    return "Trimax was locked. Sign in again to continue.";
  }

  return null;
}
