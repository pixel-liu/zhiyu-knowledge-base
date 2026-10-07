import { NextRequest, NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(10_000_000).optional(),
}).strict();

export async function GET(request: NextRequest) {
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true";
  return NextResponse.json(listDocuments(includeDeleted));
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "创建参数无效" }, { status: 400 });
  try {
    return NextResponse.json(createDocument(parsed.data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法创建文档" }, { status: 400 });
  }
}
