/** Preserve internal destinations across login without permitting external redirects. */
export function safeLoginReturn(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    if (/[\\\s\u0000-\u001f\u007f]/.test(decodeURI(value))) return null;
    const url = new URL(value, "https://trimax.invalid");
    if (url.origin !== "https://trimax.invalid" ||
        /^\/(login|request-access|forgot-password|reset-password)(\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function loginUrl(pathname: string, search: string, reason?: string): string {
  const current = new URLSearchParams(search);
  const destination = pathname === "/login"
    ? safeLoginReturn(current.get("next"))
    : safeLoginReturn(pathname + (search ? `?${search}` : ""));
  const params = new URLSearchParams();
  if (current.get("business")) params.set("business", current.get("business")!);
  if (reason) params.set("security", reason);
  if (destination) params.set("next", destination);
  return `/login${params.size ? `?${params}` : ""}`;
}
