import { NextRequest, NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth-store";
import { isSameOrigin, requestOrigin } from "@/lib/auth-request";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/api/health" || pathname === "/api/auth" || pathname === "/login") return NextResponse.next();
  const session = getSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ message: "登录已过期，请重新登录。" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const url = new URL("/login", requestOrigin(request));
    if (pathname !== "/" || search) url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !isSameOrigin(request)) {
    return NextResponse.json({ message: "请求来源无效。" }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static/|_next/webpack-hmr|icon.svg$|favicon.ico$|robots.txt$|sitemap.xml$).*)"],
};
