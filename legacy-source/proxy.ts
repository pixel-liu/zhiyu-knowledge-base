import { NextResponse } from "next/server";

// 本机优先的 MVP 不读取第三方身份服务；云端版本保留在 legacy-source 中。
export default function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
