import { NextRequest, NextResponse } from "next/server";
import { setDocumentTreeLocked } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.object({ isLocked: z.boolean() }).strict();

export async function POST(request: NextRequest, context: Context) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "锁定参数无效" }, { status: 400 });
  const { id } = await context.params;
  try {
    const ids = setDocumentTreeLocked(id, parsed.data.isLocked);
    if (!ids) return NextResponse.json({ message: "文档不存在" }, { status: 404 });
    return NextResponse.json({ ids, isLocked: parsed.data.isLocked });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法更新锁定状态" }, { status: 400 });
  }
}
