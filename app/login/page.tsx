import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, hasAccount, SESSION_COOKIE } from "@/lib/auth-store";
import { safeReturnPath } from "@/lib/auth-request";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登录", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const destination = safeReturnPath((await searchParams).next);
  if (getSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(destination);
  return <LoginForm setup={!hasAccount()} destination={destination} />;
}
