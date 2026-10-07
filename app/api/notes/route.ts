import { NextResponse } from "next/server";
import { newNote, readNotes, writeNotes } from "@/lib/notes-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readNotes());
}

export async function POST() {
  const note = newNote();
  const notes = await readNotes();
  await writeNotes([note, ...notes]);
  return NextResponse.json(note, { status: 201 });
}
