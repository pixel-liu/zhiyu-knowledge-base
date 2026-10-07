import { NextResponse } from "next/server";
import { restoreDocument } from "@/lib/documents-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = restoreDocument(id);
  if (!document) return NextResponse.json({ message: "文档不存在或无需恢复" }, { status: 404 });
  return NextResponse.json(document);
}
