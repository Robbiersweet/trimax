const ACTIVE_BROWSER_SESSION_KEY = "trimax.activeBrowserSession";
const SESSION_STARTED_AT_KEY = "trimax.sessionStartedAt";
const LAST_ACTIVITY_AT_KEY = "trimax.lastActivityAt";

export const SESSION_IDLE_TIMEOUT_MS = 45 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export type SessionSecurityReason =
  | "new-browser-session"
  | "idle-timeout"
  | "session-expired";

export type SessionSecurityStatus =
  | {
      valid: true;
    }
  | {
      valid: false;
      reason: SessionSecurityReason;
    };

function nowMs() {
  return Date.now();
}

function readNumber(key: string) {
  const value = window.localStorage.getItem(key);
  const parsed = value ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function startSecureBrowserSession() {
  if (typeof window === "undefined") {
    return;
  }

  const now = String(nowMs());

  window.sessionStorage.setItem(ACTIVE_BROWSER_SESSION_KEY, "true");
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
}

export function getSessionSecurityStatus(): SessionSecurityStatus {
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
    return "For security, Trimax signs you out when the app is reopened after the browser window was closed.";
  }

  return null;
}
