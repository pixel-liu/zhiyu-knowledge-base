import { NextRequest, NextResponse } from "next/server";
import { recentDocuments, searchDocuments } from "@/lib/documents-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tag = request.nextUrl.searchParams.get("tag")?.trim() ?? "";
  if (!query && !tag) return NextResponse.json(recentDocuments());
  return NextResponse.json(searchDocuments(query, tag));
}
