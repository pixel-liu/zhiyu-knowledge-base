// Next can use localhost internally even when the browser visits 127.0.0.1.
// Compare against the actual Host, never a client-supplied forwarded host.
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url.origin;
}

// Mutating requests must come from this site, including first-run account setup.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === requestOrigin(request);
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  try {
    const parsed = new URL(value, "http://zhiyu.local");
    if (parsed.origin !== "http://zhiyu.local" || parsed.pathname === "/login" || parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/_next/")) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return "/"; }
}
