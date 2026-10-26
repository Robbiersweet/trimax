import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicSchedulingPath } from "./app/lib/publicScheduling/routes";

/** Refresh before Server Components read cookies; return every updated cookie. */
export async function proxy(request: NextRequest) {
  // The print layout must recognize bearer-authenticated PDF requests before
  // mounting the browser-only login guard. Derive this only from the real URL,
  // overwriting any caller-supplied value; document access still uses its RLS.
  const nextResponse = () => {
    const headers = new Headers(request.headers);
    headers.set("x-trimax-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };
  let response = nextResponse();
  if (isPublicSchedulingPath(request.nextUrl.pathname)) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Verify/refresh through Supabase. Route and tenant authorization stay in their
  // existing server/client boundaries; temporary network failure never signs out.
  try { await client.auth.getClaims(); } catch {
    // Keep existing authorization boundaries responsible for denial/retry.
    // A transport exception is not authorization to revoke the browser session.
  }
  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf)$).*)"],
};
