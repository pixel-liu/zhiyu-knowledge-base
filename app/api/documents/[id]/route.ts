import { NextRequest, NextResponse } from "next/server";
import { getDocument, permanentlyDeleteDocument, softDeleteDocument, updateDocument } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  icon: z.string().max(32).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(30).optional(),
  content: z.string().max(10_000_000).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  isPinned: z.boolean().optional(),
}).strict();

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const document = getDocument(id);
  if (!document || document.isDeleted) return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  return NextResponse.json(document);
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "更新参数无效" }, { status: 400 });
  try {
    const document = updateDocument(id, parsed.data);
    if (!document) return NextResponse.json({ message: "文档不存在" }, { status: 404 });
    return NextResponse.json(document);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "更新文档失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const permanently = new URL(request.url).searchParams.get("permanent") === "true";
  const done = permanently ? permanentlyDeleteDocument(id) : softDeleteDocument(id);
  if (!done) return NextResponse.json({ message: "文档不存在" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
