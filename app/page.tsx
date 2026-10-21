import { KnowledgeDesk } from "./knowledge-desk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, SESSION_COOKIE } from "@/lib/auth-store";

export default async function RootPage() {
  if (!getSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
  return <KnowledgeDesk />;
}
