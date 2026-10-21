import { NextRequest, NextResponse } from "next/server";
import { getConnections, getReview, KnowledgeError } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ connections: getConnections(id), review: getReview(id) });
  } catch (error) {
    if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
