import { NextRequest, NextResponse } from "next/server";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { createDocument } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(10_000_000),
}).strict();

function normalizeMarkdown(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const hasEscapedFence = /(^|\n)\s*(?:\\`){3}/.test(normalized);
  const restored = normalized.replace(/(^|\n)(\s*)(?:\\`){3}/g, "$1$2```");
  return hasEscapedFence ? restored.replace(/\\[ \t]*(?=\n|$)/g, "") : restored;
}

export async function POST(request: NextRequest) {
  const parsed = importSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "Markdown 导入参数无效" }, { status: 400 });

  try {
    const editor = ServerBlockNoteEditor.create();
    const blocks = await editor.tryParseMarkdownToBlocks(normalizeMarkdown(parsed.data.content));
    const document = createDocument({
      parentId: parsed.data.parentId ?? null,
      title: parsed.data.title,
      content: JSON.stringify(blocks),
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Markdown 解析失败" }, { status: 400 });
  }
}
