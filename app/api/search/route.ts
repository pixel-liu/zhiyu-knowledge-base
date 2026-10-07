import { NextRequest, NextResponse } from "next/server";
import { listDocuments, searchDocuments } from "@/lib/documents-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tag = request.nextUrl.searchParams.get("tag")?.trim() ?? "";
  if (!query && !tag) return NextResponse.json(listDocuments(false).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12).map((item) => ({ ...item, snippet: item.plainText || "空文档" })));
  return NextResponse.json(searchDocuments(query, tag));
}
