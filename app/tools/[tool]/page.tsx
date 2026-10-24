import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession, SESSION_COOKIE } from "@/lib/auth-store";
import { isKnowledgeTool } from "@/lib/workspace-navigation";
import { KnowledgeDesk } from "../../knowledge-desk";

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!isKnowledgeTool(tool)) notFound();
  if (!getSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(`/login?next=${encodeURIComponent(`/tools/${tool}`)}`);
  return <KnowledgeDesk initialView={tool} />;
}
