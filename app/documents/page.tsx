import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, SESSION_COOKIE } from "@/lib/auth-store";
import { KnowledgeDesk } from "../knowledge-desk";

export default async function DocumentsPage() {
  if (!getSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login?next=%2Fdocuments");
  return <KnowledgeDesk initialView="documents" />;
}
