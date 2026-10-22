import { NextRequest, NextResponse } from "next/server";
import { answerFromNotes, buildInterview, evaluateInterview, inspectKnowledgeHealth } from "@/lib/learning-store";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const questionSchema = z.object({
  id: z.string().max(100), documentId: z.string().max(100), documentTitle: z.string().max(200), icon: z.string().max(32).nullable(),
  prompt: z.string().max(1000), source: z.string().max(5000), heading: z.string().max(500).nullable(), blockIndex: z.number().int().nonnegative(),
  keywords: z.array(z.string().max(100)).max(12), depth: z.number().int().min(1).max(3),
}).strict();

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), query: z.string().trim().min(2).max(500) }).strict(),
  z.object({ action: z.literal("interview-start"), documentIds: z.array(z.string().min(1).max(100)).min(1).max(20) }).strict(),
  z.object({ action: z.literal("interview-answer"), question: questionSchema, answer: z.string().trim().min(1).max(10000) }).strict(),
]);

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("mode") !== "health") return NextResponse.json({ message: "请求参数无效" }, { status: 400 });
  return NextResponse.json(inspectKnowledgeHealth());
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "请求内容无效" }, { status: 400 });
  if (parsed.data.action === "ask") return NextResponse.json(answerFromNotes(parsed.data.query));
  if (parsed.data.action === "interview-start") return NextResponse.json({ questions: buildInterview(parsed.data.documentIds) });
  return NextResponse.json(evaluateInterview(parsed.data.question, parsed.data.answer));
}
