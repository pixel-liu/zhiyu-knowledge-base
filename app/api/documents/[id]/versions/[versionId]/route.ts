import { NextResponse } from "next/server";
import { getDocument, updateDocument } from "@/lib/documents-db";
import { readVersion } from "@/lib/learning-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_request: Request, context: Context) {
  const { id, versionId } = await context.params;
  const version = readVersion(id, versionId);
  if (!version) return NextResponse.json({ message: "版本不存在" }, { status: 404 });
  return NextResponse.json(version);
}

export async function POST(_request: Request, context: Context) {
  const { id, versionId } = await context.params;
  const current = getDocument(id);
  const version = readVersion(id, versionId);
  if (!current || current.isDeleted || !version) return NextResponse.json({ message: "版本不存在" }, { status: 404 });
  const restored = updateDocument(id, { title: version.title, content: version.content }, { forceVersion: true });
  return NextResponse.json(restored);
}
