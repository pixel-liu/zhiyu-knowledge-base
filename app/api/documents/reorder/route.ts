import { NextRequest, NextResponse } from "next/server";
import { reorderDocuments } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional(),
  documentIds: z.array(z.string().trim().min(1)).max(500),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "排序参数无效" }, { status: 400 });
  }
  try {
    reorderDocuments(parsed.data.parentId ?? null, parsed.data.documentIds);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法排序" }, { status: 400 });
  }
}
