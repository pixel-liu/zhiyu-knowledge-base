import { NextRequest, NextResponse } from "next/server";
import { readNotes, StoredNote, writeNotes } from "@/lib/notes-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const editableFields = ["title", "content", "tags", "updatedAt", "isPublic", "group"] as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json() as Partial<StoredNote>;
  const notes = await readNotes();
  const index = notes.findIndex((note) => note.id === id);
  if (index < 0) return NextResponse.json({ message: "笔记不存在" }, { status: 404 });

  const patch = Object.fromEntries(
    editableFields.filter((field) => field in body).map((field) => [field, body[field]])
  ) as Partial<StoredNote>;
  notes[index] = { ...notes[index], ...patch };
  await writeNotes(notes);
  return NextResponse.json(notes[index]);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const notes = await readNotes();
  const remaining = notes.filter((note) => note.id !== id);
  if (remaining.length === notes.length) return NextResponse.json({ message: "笔记不存在" }, { status: 404 });
  await writeNotes(remaining);
  return new NextResponse(null, { status: 204 });
}
