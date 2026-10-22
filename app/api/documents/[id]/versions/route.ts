import { NextResponse } from "next/server";
import { versionSummaries } from "@/lib/learning-store";
import { getDocument } from "@/lib/documents-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const document = getDocument(id);
  if (!document || document.isDeleted) return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  return NextResponse.json(versionSummaries(id));
}
