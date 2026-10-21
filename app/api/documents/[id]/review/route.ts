import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gradeReview, KnowledgeError, setStudyStatus } from "@/lib/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.union([
  z.object({ status: z.enum(["off", "learning", "consolidating", "mastered"]) }).strict(),
  z.object({ grade: z.enum(["again", "hard", "good", "easy"]), version: z.number().int().positive() }).strict(),
]);
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "复习参数无效。" }, { status: 400 });
  try {
    const { id } = await params;
    return NextResponse.json("status" in parsed.data ? setStudyStatus(id, parsed.data.status) : gradeReview(id, parsed.data.grade, parsed.data.version));
  } catch (error) {
    if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
