import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    application: "zhiyu",
    instance: createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16),
    mode: process.env.NODE_ENV,
  }, { headers: { "Cache-Control": "no-store" } });
}
