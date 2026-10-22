import { NextRequest, NextResponse } from "next/server";
import { exportBackup, exportMarkdown, getDocument, importBackup } from "@/lib/documents-db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backupSchema = z.object({
  format: z.string().optional(),
  version: z.number().optional(),
  exportedAt: z.iso.datetime().optional(),
  documents: z.array(z.object({
    id: z.string(), parentId: z.string().nullable(), title: z.string(), icon: z.string().nullable(),
    tags: z.array(z.string()).optional().default([]), content: z.string(), plainText: z.string().optional().default(""),
    sortOrder: z.number(), isPinned: z.boolean(), isDeleted: z.boolean(), createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable(),
  })).max(10000),
  settings: z.record(z.string(), z.string()).optional(),
  reviews: z.array(z.object({
    document_id: z.string(), stage: z.number().int().min(0).max(7), due_at: z.iso.datetime(),
    last_reviewed_at: z.iso.datetime().nullable(), review_count: z.number().int().nonnegative(), version: z.number().int().positive(),
  })).max(10000).optional(),
  links: z.array(z.object({ source_id: z.string(), reference_key: z.string(), target_id: z.string().nullable(), target_title: z.string() })).max(100000).optional(),
  versions: z.array(z.object({
    id: z.string(), document_id: z.string(), title: z.string(), content: z.string().max(10_000_000),
    plain_text: z.string(), created_at: z.iso.datetime(),
  })).max(600000).optional(),
}).strict();

const downloadName = (title: string, extension: "json" | "md") => {
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 80) || "未命名文档";
  const filename = `zhiyu-${safeTitle}.${extension}`;
  return `attachment; filename="zhiyu-document.${extension}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const all = request.nextUrl.searchParams.get("all") === "true";
  const documentId = all ? undefined : request.nextUrl.searchParams.get("documentId") ?? undefined;
  const title = all ? "完整文档库" : documentId ? getDocument(documentId)?.title || "未命名文档" : "完整文档库";
  if (format === "markdown") {
    return new NextResponse(exportMarkdown(documentId), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": downloadName(title, "md"),
      },
    });
  }
  return new NextResponse(`${JSON.stringify(exportBackup(documentId), null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": downloadName(title, "json"),
    },
  });
}

export async function POST(request: NextRequest) {
  const parsed = backupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "备份文件格式无效" }, { status: 400 });
  try {
    const count = importBackup(parsed.data);
    return NextResponse.json({ imported: count });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "导入备份失败" }, { status: 400 });
  }
}
