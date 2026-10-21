import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, login, logout, SESSION_COOKIE, SESSION_SECONDS, setupAccount } from "@/lib/auth-store";
import { isSameOrigin } from "@/lib/auth-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentials = z.object({
  action: z.enum(["login", "setup"]),
  username: z.string().trim().min(2, "账号至少需要 2 个字符。").max(40, "账号不能超过 40 个字符。"),
  password: z.string().min(8, "密码至少需要 8 个字符。").max(128, "密码不能超过 128 个字符。"),
}).strict();

export async function POST(request: NextRequest) {
  const json = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
  if (!isSameOrigin(request)) return json("请求来源无效，请刷新页面后重试。", 403);
  if (Number(request.headers.get("content-length")) > 4096) return json("请求内容过长。", 413);
  try {
    const body = await request.json().catch(() => null);
    if (body?.action === "logout") {
      logout(request.cookies.get(SESSION_COOKIE)?.value);
      const response = json("已退出登录。", 200);
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 0 });
      return response;
    }
    const parsed = credentials.safeParse(body);
    if (!parsed.success) return json(parsed.error.issues[0]?.message || "请输入有效的账号和密码。", 400);
    const { action, username, password } = parsed.data;
    const session = await (action === "setup" ? setupAccount(username, password) : login(username, password));
    // Revoke a previous session when this browser signs in again.
    logout(request.cookies.get(SESSION_COOKIE)?.value);
    const response = json("登录成功。", 200);
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthError) return json(error.message, error.status);
    console.error("本地登录失败", error);
    return json("暂时无法登录，请稍后重试。", 500);
  }
}
